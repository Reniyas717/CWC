import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning' | 'purple';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variantStyles = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    outline: 'border border-border text-foreground',
    destructive: 'bg-destructive/20 text-destructive border border-destructive/30',
    success: 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30',
    warning: 'bg-amber-500/15 text-amber-500 border border-amber-500/30',
    purple: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors focus:outline-none tracking-tight',
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}
