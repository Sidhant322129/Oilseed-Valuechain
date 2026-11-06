// src/components/ui/Button.jsx
import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * @param {'primary'|'secondary'|'outline'|'ghost'|'danger'} variant
 * @param {'sm'|'md'|'lg'} size
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  icon: Icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'btn',
        `btn-${variant}`,
        size === 'sm' && 'btn-sm',
        size === 'lg' && 'btn-lg',
        block && 'btn-block',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={15} className="anim-spin" /> : Icon ? <Icon size={15} /> : null}
      {children}
    </button>
  );
}
