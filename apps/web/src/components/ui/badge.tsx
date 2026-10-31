import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variantStyles = {
    default: 'bg-blue-600 text-white',
    secondary: 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100',
    destructive: 'bg-red-500 text-white',
    outline: 'border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200',
    success:
      'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30',
  }[variant];

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none',
        variantStyles,
        className
      )}
      {...props}
    />
  );
}
