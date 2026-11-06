// src/components/LoadingSpinner.jsx
// Reusable inline loading spinner used within dashboard section panels.
// Replaces ad-hoc "Loading..." text across all dashboards.
import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * LoadingSpinner
 * @param {'sm'|'md'|'lg'} size   - Spinner size. Default: 'md'
 * @param {string}          label - Optional text shown beside the spinner
 */
export default function LoadingSpinner({ size = 'md', label }) {
  const px = size === 'sm' ? 14 : size === 'lg' ? 28 : 20;
  const padding = size === 'sm' ? '0.75rem 0' : size === 'lg' ? '3rem 0' : '1.5rem 0';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        padding,
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-body)',
        fontSize: size === 'sm' ? '0.78rem' : '0.85rem',
      }}
    >
      <Loader2
        size={px}
        style={{ animation: 'spin 1s linear infinite', color: 'var(--color-gold)', flexShrink: 0 }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {label && <span>{label}</span>}
    </div>
  );
}
