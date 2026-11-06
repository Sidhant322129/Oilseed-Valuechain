// src/components/ErrorBoundary.jsx
// Class-based React error boundary that wraps dashboard section content.
// On render error it shows a contained error card instead of a full crash.
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { getErrorMessage } from '@/utils/getErrorMessage';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      const { error } = this.state;
      return (
        <div
          style={{
            border: '1px solid rgba(218,54,51,0.35)',
            borderRadius: '10px',
            padding: '1.25rem',
            background: 'rgba(218,54,51,0.06)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.5rem',
            textAlign: 'center',
          }}
        >
          <AlertTriangle size={22} style={{ color: '#DA3633' }} />
          <div style={{ fontSize: '0.85rem', color: '#174A36', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
            Something went wrong in this section
          </div>
          <div
            style={{
              fontSize: '0.72rem',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              maxWidth: '320px',
              wordBreak: 'break-word',
            }}
          >
            {getErrorMessage(error)}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: '0.5rem',
              padding: '0.35rem 1rem',
              background: '#DA363322',
              border: '1px solid #DA363344',
              color: '#DA3633',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.78rem',
              fontFamily: 'var(--font-body)',
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

