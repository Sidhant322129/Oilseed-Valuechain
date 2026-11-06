// src/components/ui/Card.jsx
import React from 'react';
import { cn } from '@/utils/cn';

export function Card({ className, children, ...rest }) {
  return (
    <div className={cn('card', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, icon: Icon, action, className }) {
  return (
    <div className={cn('card-header', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-100 text-brand-700">
            <Icon size={18} />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="card-title truncate">{title}</h3>
          {subtitle && <p className="card-subtitle">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export default Card;
