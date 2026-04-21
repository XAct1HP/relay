-- Add missing columns that the code already writes to
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- Update the status check constraint to include 'payout_failed'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN (
  'pending_payment', 'paid', 'auth_submitted', 'label_created', 'shipped',
  'delivered', 'review_window', 'completed', 'disputed', 'cancelled',
  'refund_pending', 'refunded', 'payout_failed'
));
