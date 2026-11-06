// src/routes/ProtectedRoute.jsx
// Route guard for role-specific dashboard paths.
//
// Rules (in priority order):
//   1. No session        ? redirect to '/' (login)
//   2. Profile loading   ? show spinner (never guess the role)
//   3. Invalid/missing role ? hard error state ("contact support")
//   4. Role mismatch     ? redirect to /dashboard/<user's actual role>
//   5. OK                ? render children
//
// The requiredRole prop must exactly match one of the 6 canonical values
// in USER_ROLES (constants.js) and the path segment in App.jsx.

import React from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';
import { signOut } from '@/lib/auth';
import ErrorBoundary from '@/components/feedback/ErrorBoundary';

const VALID_ROLES = ['farmer', 'fpo', 'processor', 'retailer', 'government', 'admin'];

export default function ProtectedRoute({ session, userProfile, profileLoading, requiredRole, children }) {
  // -- Guard 1: No session --------------------------------------------------
  if (!session) {
    return <Navigate to="/" replace />;
  }

  // -- Guard 2: Profile still loading --------------------------------------
  if (profileLoading || !userProfile) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: '0.75rem',
        background: 'var(--bg-primary)', color: 'var(--text-secondary)',
      }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--color-gold)' }} />
        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem' }}>Loading your profile...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const role = userProfile.role;

  // -- Guard 3: Role missing or unrecognised --------------------------------
  if (!role || !VALID_ROLES.includes(role)) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '2rem', background: 'var(--bg-primary)',
      }}>
        <div style={{
          maxWidth: '480px', width: '100%',
          background: 'var(--bg-card)', border: '1px solid var(--color-crimson)',
          borderRadius: '12px', padding: '2rem', textAlign: 'center',
        }}>
          <AlertTriangle size={36} color="var(--color-crimson)" style={{ marginBottom: '1rem' }} />
          <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', marginBottom: '0.75rem', fontSize: '1.25rem' }}>
            Account Role Not Set
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1rem' }}>
            Account role not set, contact support. Your role {role ? `("${role}")` : 'is missing or invalid'}.
          </p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
            uid: {userProfile.id} * email: {userProfile.email}
          </p>
          <button
            onClick={() => signOut()}
            style={{
              marginTop: '1.25rem', padding: '0.6rem 1.5rem',
              background: 'var(--color-gold)', color: '#000',
              border: 'none', borderRadius: '8px', cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.875rem',
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // -- Guard 4: Role mismatch -- redirect to the user's actual dashboard -----
  if (role !== requiredRole) {
    return <Navigate to={`/dashboard/${role}`} replace />;
  }

  // -- Guard 5: OK -- render the dashboard ----------------------------------
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

