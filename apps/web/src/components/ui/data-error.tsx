import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DataErrorProps {
  title?: string;
  error: unknown;
  onRetry?: () => void;
}

function messageFor(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'The control plane could not be reached. Try again shortly.';
}

export function DataError({
  title = 'Unable to load live platform data',
  error,
  onRetry,
}: DataErrorProps) {
  return (
    <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive flex items-start gap-3">
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="flex-1 space-y-1">
        <p className="text-xs font-semibold">{title}</p>
        <p className="text-[11px] opacity-85">{messageFor(error)}</p>
      </div>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="h-7 shrink-0 border-destructive/30 text-destructive hover:text-destructive"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Retry
        </Button>
      )}
    </div>
  );
}
