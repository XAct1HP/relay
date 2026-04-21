-- Add missing columns that the code already writes to
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- Add return flow columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_label_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_tracking_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_packing_slip_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_status TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_created_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_delivered_at TIMESTAMPTZ;

-- Add return_status constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_return_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_return_status_check
  CHECK (return_status IS NULL OR return_status IN ('pending', 'shipped', 'delivered'));

-- Update the status check constraint to include all statuses
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN (
  'pending_payment', 'paid', 'auth_submitted', 'label_created', 'shipped',
  'delivered', 'review_window', 'completed', 'disputed', 'cancelled',
  'refund_pending', 'refunded', 'payout_failed',
  'return_pending', 'return_shipped', 'return_delivered'
));

-- Add dispute flags to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ban_reason TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dispute_flags_count INT DEFAULT 0;
