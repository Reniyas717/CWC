import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  description,
  children,
  className,
}: BottomSheetProps) {
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      haptics.light();
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Blurred dimmed backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={() => {
          haptics.light();
          onClose();
        }}
      />

      {/* Slide-up Container */}
      <div
        className={cn(
          'relative z-10 w-full max-h-[85vh] rounded-t-2xl border-t border-border bg-card p-5 pb-safe shadow-2xl transition-all duration-300 overflow-y-auto no-scrollbar',
          className
        )}
      >
        {/* Grab Handle */}
        <div className="flex justify-center -mt-2 mb-3">
          <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        {(title || description) && (
          <div className="flex items-start justify-between pb-4 border-b border-border/50 mb-4">
            <div>
              {title && <h2 className="text-base font-bold font-heading">{title}</h2>}
              {description && (
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              )}
            </div>
            <button
              onClick={() => {
                haptics.light();
                onClose();
              }}
              className="p-1 rounded-full text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Sheet Content */}
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  );
}
