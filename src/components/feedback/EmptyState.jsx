// src/components/EmptyState.jsx
// Shared honest empty-state component used across all 6 role dashboards.
// Used whenever real data is either absent or comes from a future week's integration.
import React from 'react';

/**
 * EmptyState
 *
 * @param {React.ElementType} icon       — Lucide icon component
 * @param {string}            title      — Short heading (e.g. "No batches yet")
 * @param {string}            message    — Honest explanation (when will this be available)
 * @param {'sm'|'md'|'lg'}    size       — Padding variant; defaults to 'md'
 * @param {{ label: string, onClick: function }} action — Optional action button
 */
export default function EmptyState({ icon: Icon, title, message, size = 'md', action }) {
  const padding = size === 'sm' ? '1.25rem 0' : size === 'lg' ? '3rem 0' : '2rem 0';
  const iconSize = size === 'sm' ? 22 : size === 'lg' ? 38 : 30;
  const titleSize = size === 'sm' ? '0.82rem' : size === 'lg' ? '0.95rem' : '0.88rem';

  return (
    <div
      style={{
        textAlign: 'center',
        padding,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.5rem',
      }}
    >
      {Icon && (
        <Icon
          size={iconSize}
          style={{ color: '#D8E3D9', marginBottom: '0.25rem' }}
        />
      )}
      {title && (
        <div
          style={{
            fontSize: titleSize,
            color: '#4F7A5B',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
          }}
        >
          {title}
        </div>
      )}
      {message && (
        <div
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-body)',
            maxWidth: size === 'lg' ? '320px' : '260px',
            lineHeight: 1.55,
          }}
        >
          {message}
        </div>
      )}
      {action && (
        <button
          onClick={action.onClick}
          style={{
            marginTop: '0.5rem',
            padding: '0.4rem 1.1rem',
            background: 'rgba(229,169,60,0.12)',
            border: '1px solid rgba(229,169,60,0.35)',
            color: '#174A36',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.78rem',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
