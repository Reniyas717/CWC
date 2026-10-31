import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const variantStyles = {
      default:
        'bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs font-medium',
      destructive:
        'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-2xs font-medium',
      outline:
        'border border-border bg-card hover:bg-accent hover:text-accent-foreground text-foreground shadow-2xs',
      secondary:
        'bg-secondary text-secondary-foreground hover:bg-secondary/80 font-medium',
      ghost:
        'hover:bg-accent hover:text-accent-foreground text-muted-foreground hover:text-foreground',
      link:
        'text-primary underline-offset-4 hover:underline p-0 h-auto',
    }[variant];

    const sizeStyles = {
      default: 'h-9 px-4 py-2 text-xs',
      sm: 'h-7 rounded-md px-2.5 text-xs',
      lg: 'h-10 rounded-md px-6 text-sm',
      icon: 'h-8 w-8 p-0',
    }[size];

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
          variantStyles,
          sizeStyles,
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
