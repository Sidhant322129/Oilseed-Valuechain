// src/components/feedback/FullPageLoader.jsx
// Centered full-viewport loader used during auth/profile bootstrapping.
import React from 'react';
import { Loader2, Sprout } from 'lucide-react';

export default function FullPageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface-muted">
      <div className="sidebar-brand-mark h-12 w-12 rounded-2xl">
        <Sprout size={24} />
      </div>
      <div className="flex items-center gap-2 text-sm font-medium text-ink-soft">
        <Loader2 size={18} className="anim-spin text-brand-600" />
        <span>{label}</span>
      </div>
    </div>
  );
}
