import * as React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
  className?: string;
  showPageSizeSelector?: boolean;
}

export function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 20, 50],
  itemLabel = 'items',
  className,
  showPageSizeSelector = true,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startItem = totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, totalItems);

  // Generate page numbers with smart ellipsis
  const getPageNumbers = (): (number | 'ellipsis')[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | 'ellipsis')[] = [1];

    if (safeCurrentPage > 3) {
      pages.push('ellipsis');
    }

    const start = Math.max(2, safeCurrentPage - 1);
    const end = Math.min(totalPages - 1, safeCurrentPage + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (safeCurrentPage < totalPages - 2) {
      pages.push('ellipsis');
    }

    pages.push(totalPages);
    return pages;
  };

  const pages = getPageNumbers();

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row items-center justify-between gap-3 py-3 px-1 text-xs text-muted-foreground select-none',
        className
      )}
    >
      {/* Item Range Counter */}
      <div className="flex items-center gap-1.5 font-mono text-[11px]">
        {totalItems > 0 ? (
          <>
            <span>Showing</span>
            <span className="font-semibold text-foreground">{startItem}</span>
            <span>to</span>
            <span className="font-semibold text-foreground">{endItem}</span>
            <span>of</span>
            <span className="font-semibold text-foreground">{totalItems}</span>
            <span>{itemLabel}</span>
          </>
        ) : (
          <span>No {itemLabel} found</span>
        )}
      </div>

      {/* Pagination Controls & Page Size Selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Page Size Selector */}
        {showPageSizeSelector && onPageSizeChange && totalItems > 0 && (
          <div className="flex items-center gap-1.5 mr-2">
            <span className="text-[11px] text-muted-foreground hidden sm:inline">Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="h-7 text-xs px-2 py-0.5 rounded-md bg-secondary/80 border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Navigation Buttons */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            {/* First Page */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => onPageChange(1)}
              disabled={safeCurrentPage === 1}
              className="h-7 w-7"
              title="First Page"
              aria-label="First Page"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </Button>

            {/* Previous Page */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => onPageChange(safeCurrentPage - 1)}
              disabled={safeCurrentPage === 1}
              className="h-7 w-7"
              title="Previous Page"
              aria-label="Previous Page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>

            {/* Page Number Buttons */}
            <div className="flex items-center gap-1">
              {pages.map((p, idx) => {
                if (p === 'ellipsis') {
                  return (
                    <span
                      key={`ellipsis-${idx}`}
                      className="px-1.5 text-muted-foreground font-mono select-none"
                    >
                      …
                    </span>
                  );
                }

                const isActive = p === safeCurrentPage;
                return (
                  <Button
                    key={p}
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => onPageChange(p)}
                    className={cn(
                      'h-7 min-w-[28px] px-2 text-[11px] font-mono',
                      isActive ? 'font-bold shadow-xs' : 'text-muted-foreground hover:text-foreground'
                    )}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {p}
                  </Button>
                );
              })}
            </div>

            {/* Next Page */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => onPageChange(safeCurrentPage + 1)}
              disabled={safeCurrentPage === totalPages}
              className="h-7 w-7"
              title="Next Page"
              aria-label="Next Page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>

            {/* Last Page */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => onPageChange(totalPages)}
              disabled={safeCurrentPage === totalPages}
              className="h-7 w-7"
              title="Last Page"
              aria-label="Last Page"
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
