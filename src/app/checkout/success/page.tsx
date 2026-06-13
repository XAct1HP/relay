'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const router = useRouter();
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(Boolean(sessionId));

  useEffect(() => {
    if (!sessionId) {
      setSyncing(false);
      return;
    }

    let isCancelled = false;

    async function finalizeCheckout() {
      try {
        setSyncing(true);
        setSyncError(null);

        const response = await fetch('/api/stripe/checkout/complete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sessionId }),
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to finalize your order');
        }

        if (isCancelled) {
          return;
        }

        if (payload.checkoutType === 'shoe_order' && payload.orderId) {
          router.replace(`/orders/${payload.orderId}`);
          return;
        }

        if (payload.checkoutType === 'tag_bundle_purchase') {
          router.replace('/tags');
          return;
        }

        router.replace('/orders');
      } catch (error) {
        if (!isCancelled) {
          setSyncError(error instanceof Error ? error.message : 'Failed to finalize your order');
          setSyncing(false);
        }
      }
    }

    finalizeCheckout();

    return () => {
      isCancelled = true;
    };
  }, [router, sessionId]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="max-w-md w-full text-center">
        <div className="relay-card p-8">
          <div className="flex justify-center mb-6">
            <CheckCircle size={64} className="text-emerald-400" />
          </div>

          <h1 className="text-2xl font-semibold text-relay-text mb-3">
            Payment Successful!
          </h1>

          <p className="text-relay-muted mb-8">
            {syncing
              ? 'Finalizing your order now. This should only take a moment.'
              : syncError
                ? 'Your payment went through, but order finalization needs one more try.'
                : 'Your order has been placed. The seller will be notified to authenticate and ship your item.'}
          </p>

          {syncError ? (
            <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              {syncError}
            </div>
          ) : null}

          {syncError ? (
            <button
              onClick={() => window.location.reload()}
              className="relay-button-primary w-full py-3 text-base inline-flex items-center justify-center"
            >
              Retry Order Sync
            </button>
          ) : (
            <Link
              href="/orders"
              className="relay-button-primary w-full py-3 text-base inline-flex items-center justify-center"
            >
              {syncing ? 'Go to Orders' : 'View My Orders'}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
