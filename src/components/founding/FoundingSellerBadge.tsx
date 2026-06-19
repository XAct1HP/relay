"use client";

interface FoundingSellerBadgeProps {
  compact?: boolean;
}

export default function FoundingSellerBadge({
  compact = false,
}: FoundingSellerBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 font-semibold text-amber-300 ${
        compact ? "px-2.5 py-1 text-[10px] uppercase tracking-[0.16em]" : "px-3 py-1 text-xs"
      }`}
    >
      Founding Seller
    </span>
  );
}
