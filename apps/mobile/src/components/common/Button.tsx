import * as React from 'react';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'emerald';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', onClick, ...props }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (variant === 'destructive') {
        haptics.heavy();
      } else {
        haptics.light();
      }
      onClick?.(e);
    };

    const variants = {
      default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
      destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
      outline: 'border border-border bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
      secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
      ghost: 'hover:bg-accent hover:text-accent-foreground',
      emerald: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-500 active:bg-emerald-700',
    };

    const sizes = {
      default: 'h-9 px-4 py-2 text-xs',
      sm: 'h-8 rounded-lg px-3 text-[11px]',
      lg: 'h-11 rounded-xl px-6 text-sm font-medium',
      icon: 'h-9 w-9',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-xl font-medium transition-all active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none',
          variants[variant],
          sizes[size],
          className
        )}
        onClick={handleClick}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
