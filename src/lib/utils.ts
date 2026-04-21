import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { SizeOption } from '@/types';

/**
 * Merge classNames using clsx and tailwind-merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number as USD currency
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a date string to a readable format
 */
export function formatDate(date: string): string {
  const dateObj = new Date(date);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(dateObj);
}

/**
 * Format a date as relative time (e.g., "2h ago", "3d ago")
 */
export function formatRelativeTime(date: string): string {
  const dateObj = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${diffYears}y ago`;
}

/**
 * Calculate fees for an order
 */
export function calculateFees(price: number) {
  const platformFee = price * 0.01; // 1% platform fee
  const stripeFee = price * 0.03 + 0.3; // 3% + $0.30 Stripe fee
  const totalFees = platformFee + stripeFee;
  const sellerEarnings = price - totalFees;

  return {
    platformFee: Math.round(platformFee * 100) / 100,
    stripeFee: Math.round(stripeFee * 100) / 100,
    totalFees: Math.round(totalFees * 100) / 100,
    sellerEarnings: Math.round(sellerEarnings * 100) / 100,
  };
}

/**
 * Get human-readable label for order status
 */
export function getOrderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending_payment: 'Pending Payment',
    paid: 'Payment Confirmed',
    auth_submitted: 'Authentication Submitted',
    label_created: 'Shipping Label Created',
    shipped: 'Shipped',
    delivered: 'Delivered',
    review_window: 'Review Window',
    completed: 'Completed',
    disputed: 'Disputed',
    cancelled: 'Cancelled',
    refund_pending: 'Refund Pending',
    refunded: 'Refunded',
    payout_failed: 'Payout Failed',
    return_pending: 'Return Required',
    return_shipped: 'Return Shipped',
    return_delivered: 'Return Received',
  };

  return labels[status] || status;
}

/**
 * Get tailwind color classes for order status badge
 */
export function getOrderStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending_payment: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    paid: 'bg-blue-100 text-blue-800 border-blue-300',
    auth_submitted: 'bg-purple-100 text-purple-800 border-purple-300',
    label_created: 'bg-cyan-100 text-cyan-800 border-cyan-300',
    shipped: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    delivered: 'bg-teal-100 text-teal-800 border-teal-300',
    review_window: 'bg-orange-100 text-orange-800 border-orange-300',
    completed: 'bg-green-100 text-green-800 border-green-300',
    disputed: 'bg-red-100 text-red-800 border-red-300',
    cancelled: 'bg-gray-100 text-gray-800 border-gray-300',
    refund_pending: 'bg-amber-100 text-amber-800 border-amber-300',
    refunded: 'bg-gray-100 text-gray-800 border-gray-300',
    payout_failed: 'bg-red-100 text-red-800 border-red-300',
    return_pending: 'bg-amber-100 text-amber-800 border-amber-300',
    return_shipped: 'bg-cyan-100 text-cyan-800 border-cyan-300',
    return_delivered: 'bg-green-100 text-green-800 border-green-300',
  };

  return colors[status] || 'bg-gray-100 text-gray-800 border-gray-300';
}

/**
 * Generate a random 6-character alphanumeric challenge code
 */
export function generateChallengeCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Format a size range from array of size options
 * e.g., "Size 9" or "Size 9-12" or "Size 9, 11-13"
 */
export function formatSizeRange(sizes: SizeOption[]): string {
  if (!sizes || sizes.length === 0) return 'No sizes available';

  const uniqueSizes = Array.from(new Set(sizes.map(s => s.size)));
  const numericSizes = uniqueSizes
    .map(s => parseFloat(s))
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b);

  if (numericSizes.length === 0) {
    return `Size ${uniqueSizes[0]}`;
  }

  if (numericSizes.length === 1) {
    return `Size ${numericSizes[0]}`;
  }

  const ranges: string[] = [];
  let rangeStart = numericSizes[0];
  let rangeEnd = numericSizes[0];

  for (let i = 1; i < numericSizes.length; i++) {
    const current = numericSizes[i];
    const prev = numericSizes[i - 1];

    // Check if consecutive (accounting for half sizes)
    if (current - prev === 0.5 || current - prev === 1) {
      rangeEnd = current;
    } else {
      // End of range
      if (rangeStart === rangeEnd) {
        ranges.push(`${rangeStart}`);
      } else {
        ranges.push(`${rangeStart}-${rangeEnd}`);
      }
      rangeStart = current;
      rangeEnd = current;
    }
  }

  // Add final range
  if (rangeStart === rangeEnd) {
    ranges.push(`${rangeStart}`);
  } else {
    ranges.push(`${rangeStart}-${rangeEnd}`);
  }

  return `Size ${ranges.join(', ')}`;
}

/**
 * Get the lowest price from a sizes array
 */
export function getFromPrice(sizes: SizeOption[]): number {
  if (!sizes || sizes.length === 0) return 0;
  return Math.min(...sizes.map(s => s.price));
}

/**
 * Truncate a string to a maximum length
 */
export function truncate(str: string, length: number): string {
  if (!str) return '';
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}
