"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps) {
  const getPageNumbers = () => {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];

    for (
      let i = Math.max(2, currentPage - delta);
      i <= Math.min(totalPages - 1, currentPage + delta);
      i++
    ) {
      range.push(i);
    }

    if (currentPage - delta > 2) {
      rangeWithDots.push(1, "...");
    } else {
      rangeWithDots.push(1);
    }

    rangeWithDots.push(...range);

    if (currentPage + delta < totalPages - 1) {
      rangeWithDots.push("...", totalPages);
    } else if (totalPages > 1) {
      rangeWithDots.push(totalPages);
    }

    return rangeWithDots;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="flex items-center justify-center gap-2 py-8">
      {/* Previous Button */}
      <button
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-relay-text disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft size={18} />
        <span className="text-sm font-medium hidden sm:inline">Previous</span>
      </button>

      {/* Page Numbers */}
      <div className="flex items-center gap-1">
        {pageNumbers.map((page, index) => {
          if (page === "...") {
            return (
              <div
                key={`ellipsis-${index}`}
                className="px-2 py-2 text-white/40"
              >
                ...
              </div>
            );
          }

          const pageNum = page as number;
          const isActive = pageNum === currentPage;

          return (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              className={`min-w-[40px] h-[40px] flex items-center justify-center rounded-lg font-medium text-sm transition-colors ${
                isActive
                  ? "bg-relay-accent text-relay-bg border border-relay-accent"
                  : "bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-relay-text hover:text-relay-accent"
              }`}
            >
              {pageNum}
            </button>
          );
        })}
      </div>

      {/* Next Button */}
      <button
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-relay-text disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <span className="text-sm font-medium hidden sm:inline">Next</span>
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
