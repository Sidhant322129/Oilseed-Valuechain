// src/components/ui/PageHeader.jsx
import React from 'react';

export default function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="max-w-3xl">
        {eyebrow && <div className="text-eyebrow mb-1">{eyebrow}</div>}
        <h1 className="m-0 font-heading text-[1.65rem] font-bold text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
