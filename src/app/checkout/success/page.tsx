'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle } from 'lucide-react';

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

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
            Your order has been placed. The seller will be notified to authenticate and ship your item.
          </p>

          <Link
            href="/orders"
            className="relay-button-primary w-full py-3 text-base inline-flex items-center justify-center"
          >
            View My Orders
          </Link>
        </div>
      </div>
    </div>
  );
}
