-- ============================================================================
-- LAUNCH REFUND / DISPUTE SELLER RECOVERY
-- ============================================================================
-- Launch payout behavior keeps seller funds in the Relay ledger until
-- withdrawal. Refund and dispute resolution therefore needs an internal,
-- append-only recovery path that can:
-- 1. reverse pending seller credit before funds become available
-- 2. recover from available seller balance when coverage exists
-- 3. stop cleanly and require admin review when recovery would overdraw
--    the seller or appears to be post-withdrawal

CREATE OR REPLACE FUNCTION public.resolve_launch_refund_seller_recovery(
  p_order_id UUID
)
RETURNS TABLE (
  order_id UUID,
  seller_id UUID,
  buyer_id UUID,
  payment_funding_source TEXT,
  seller_proceeds_cents BIGINT,
  pending_credit_total_cents BIGINT,
  available_credit_total_cents BIGINT,
  dispute_debit_total_cents BIGINT,
  pending_outstanding_cents BIGINT,
  available_outstanding_cents BIGINT,
  seller_available_balance_cents BIGINT,
  recovered_amount_cents BIGINT,
  recovery_status TEXT,
  admin_review_required BOOLEAN,
  admin_review_reason TEXT,
  has_completed_withdrawals BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
  order_row public.orders%ROWTYPE;
  funding_source TEXT;
  pending_credit_total BIGINT := 0;
  available_credit_total BIGINT := 0;
  dispute_debit_total BIGINT := 0;
  pending_outstanding BIGINT := 0;
  available_outstanding BIGINT := 0;
  seller_available BIGINT := 0;
  completed_withdrawals BOOLEAN := FALSE;
BEGIN
  SELECT *
  INTO order_row
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  funding_source := COALESCE(
    NULLIF(order_row.payment_funding_source, ''),
    CASE
      WHEN order_row.stripe_payment_intent_id IS NOT NULL THEN 'card'
      ELSE 'relay_balance'
    END
  );

  seller_proceeds_cents := COALESCE(
    order_row.seller_proceeds_cents,
    GREATEST(0, ROUND(COALESCE(order_row.seller_earnings, 0) * 100)::BIGINT),
    0
  );

  PERFORM public.recalculate_relay_balance(order_row.seller_id);

  PERFORM 1
  FROM public.relay_balances
  WHERE seller_id = order_row.seller_id
  FOR UPDATE;

  SELECT COALESCE(available_balance_cents, 0)
  INTO seller_available
  FROM public.relay_balances
  WHERE seller_id = order_row.seller_id;

  SELECT EXISTS (
    SELECT 1
    FROM public.withdrawal_requests
    WHERE seller_id = order_row.seller_id
      AND status = 'completed'
  )
  INTO completed_withdrawals;

  SELECT
    COALESCE(SUM(
      CASE
        WHEN type = 'order_pending_credit'
          AND status IN ('pending', 'posted', 'completed')
          THEN amount_cents
        ELSE 0
      END
    ), 0),
    COALESCE(SUM(
      CASE
        WHEN type = 'order_available_credit'
          AND status IN ('pending', 'posted', 'completed')
          THEN amount_cents
        ELSE 0
      END
    ), 0),
    COALESCE(SUM(
      CASE
        WHEN type = 'dispute_debit'
          AND status IN ('posted', 'completed')
          THEN ABS(amount_cents)
        ELSE 0
      END
    ), 0)
  INTO pending_credit_total, available_credit_total, dispute_debit_total
  FROM public.relay_balance_ledger
  WHERE order_id = order_row.id;

  pending_outstanding := GREATEST(0, pending_credit_total - available_credit_total);
  available_outstanding := GREATEST(0, available_credit_total - dispute_debit_total);

  order_id := order_row.id;
  seller_id := order_row.seller_id;
  buyer_id := order_row.buyer_id;
  payment_funding_source := funding_source;
  pending_credit_total_cents := pending_credit_total;
  available_credit_total_cents := available_credit_total;
  dispute_debit_total_cents := dispute_debit_total;
  pending_outstanding_cents := pending_outstanding;
  available_outstanding_cents := available_outstanding;
  seller_available_balance_cents := seller_available;
  recovered_amount_cents := 0;
  admin_review_required := FALSE;
  admin_review_reason := NULL;
  has_completed_withdrawals := completed_withdrawals;

  IF pending_outstanding = 0 AND available_outstanding = 0 THEN
    recovery_status := 'already_recovered';
    RETURN NEXT;
    RETURN;
  END IF;

  IF pending_outstanding > 0 AND available_outstanding = 0 THEN
    INSERT INTO public.relay_balance_ledger (
      seller_id,
      order_id,
      type,
      amount_cents,
      currency,
      status,
      metadata
    )
    VALUES (
      order_row.seller_id,
      order_row.id,
      'order_available_credit',
      pending_outstanding,
      'usd',
      'posted',
      jsonb_build_object(
        'source', 'launch_refund_recovery',
        'idempotency_key', 'money:order:' || order_row.id::TEXT || ':refund_reversal_available',
        'release_key', 'refund_reversal',
        'release_trigger', 'refund_reversal',
        'forced_release', TRUE,
        'refund_reversal', TRUE,
        'payment_funding_source', funding_source
      )
    )
    ON CONFLICT DO NOTHING;

    INSERT INTO public.relay_balance_ledger (
      seller_id,
      order_id,
      type,
      amount_cents,
      currency,
      status,
      metadata
    )
    VALUES (
      order_row.seller_id,
      order_row.id,
      'dispute_debit',
      -pending_outstanding,
      'usd',
      'posted',
      jsonb_build_object(
        'source', 'launch_refund_recovery',
        'idempotency_key', 'money:order:' || order_row.id::TEXT || ':refund_reversal_debit',
        'refund_recovery_stage', 'pending_reversal',
        'payment_funding_source', funding_source
      )
    )
    ON CONFLICT DO NOTHING;

    UPDATE public.orders
    SET
      balance_credit_status = 'reversed',
      updated_at = NOW()
    WHERE id = order_row.id;

    UPDATE public.order_payouts
    SET
      status = 'cancelled',
      failure_reason = COALESCE(
        failure_reason,
        'Order refunded before seller funds became available.'
      ),
      updated_at = NOW()
    WHERE order_id = order_row.id
      AND status IN ('pending', 'paid', 'frozen');

    recovered_amount_cents := pending_outstanding;
    recovery_status := 'pending_reversed';
    RETURN NEXT;
    RETURN;
  END IF;

  IF pending_outstanding = 0 AND available_outstanding > 0 THEN
    IF seller_available >= available_outstanding THEN
      INSERT INTO public.relay_balance_ledger (
        seller_id,
        order_id,
        type,
        amount_cents,
        currency,
        status,
        metadata
      )
      VALUES (
        order_row.seller_id,
        order_row.id,
        'dispute_debit',
        -available_outstanding,
        'usd',
        'posted',
        jsonb_build_object(
          'source', 'launch_refund_recovery',
          'idempotency_key', 'money:order:' || order_row.id::TEXT || ':refund_available_debit',
          'refund_recovery_stage', 'available_balance_debit',
          'payment_funding_source', funding_source
        )
      )
      ON CONFLICT DO NOTHING;

      UPDATE public.orders
      SET
        balance_credit_status = 'reversed',
        updated_at = NOW()
      WHERE id = order_row.id;

      UPDATE public.order_payouts
      SET
        status = 'cancelled',
        failure_reason = COALESCE(
          failure_reason,
          'Order refunded and seller available balance was recovered.'
        ),
        updated_at = NOW()
      WHERE order_id = order_row.id
        AND status IN ('pending', 'paid', 'frozen');

      recovered_amount_cents := available_outstanding;
      recovery_status := 'available_balance_debited';
      RETURN NEXT;
      RETURN;
    END IF;

    recovery_status := CASE
      WHEN completed_withdrawals THEN 'admin_review_post_withdrawal'
      ELSE 'admin_review_insufficient_available'
    END;
    admin_review_required := TRUE;
    admin_review_reason := CASE
      WHEN completed_withdrawals THEN 'Seller has completed withdrawals and available balance is insufficient for automatic recovery.'
      ELSE 'Seller available balance is insufficient for automatic recovery.'
    END;

    UPDATE public.order_payouts
    SET
      failure_reason = COALESCE(
        failure_reason,
        'Refund requires manual recovery review because seller funds are not fully recoverable.'
      ),
      updated_at = NOW()
    WHERE order_id = order_row.id
      AND status IN ('pending', 'frozen');

    RETURN NEXT;
    RETURN;
  END IF;

  recovery_status := 'admin_review_mixed_credit_state';
  admin_review_required := TRUE;
  admin_review_reason := 'Order has mixed pending and available seller credit state. Manual review is required.';

  UPDATE public.order_payouts
  SET
    failure_reason = COALESCE(
      failure_reason,
      'Refund requires manual review because the order has mixed pending and available seller credit.'
    ),
    updated_at = NOW()
  WHERE order_id = order_row.id
    AND status IN ('pending', 'frozen');

  RETURN NEXT;
END;
$$;
