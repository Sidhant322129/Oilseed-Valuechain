// src/pages/dashboards/DashboardRouter.jsx
// Redirect-only component — converts a role string into its canonical dashboard URL.
// Called from legacy codepaths that still reference this module.
// All actual rendering is done by ProtectedRoute + individual dashboard components in App.jsx.
//
// INVARIANTS (unchanged from Week 2):
//   1. userProfile is loaded from public.users before this component renders.
//   2. role must be one of the 6 canonical values; anything else is a hard error.
//   3. NO silent defaults to FarmerDashboard — bugs must be visible, not hidden.

import React from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';
import { signOut } from '@/lib/auth';
import { getErrorMessage } from '@/utils/getErrorMessage';

const VALID_ROLES = ['farmer', 'fpo', 'processor', 'retailer', 'government', 'admin'];

export default function DashboardRouter({ session, userProfile }) {
  // Guard 1: profile not yet loaded
  if (!userProfile) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: '0.75rem',
        background: 'var(--bg-primary)', color: 'var(--text-secondary)',
      }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--color-gold)' }} />
        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem' }}>Loading your profile…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const role = userProfile.role;

  // Guard 2: unrecognised or missing role → explicit error, not farmer
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
            Account Role Not Configured
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1rem' }}>
            Your account role {role ? `("${role}")` : '(missing)'} is not recognised by the platform.
            This is a data configuration issue — contact platform support to have your role corrected.
          </p>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
            uid: {userProfile.id} · email: {userProfile.email}
          </p>
          <button
            onClick={() => signOut()}
            style={{
              marginTop: '1.25rem', padding: '0.6rem 1.5rem',
              background: 'var(--color-gold)', color: '#FFFFFF',
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

  // Valid role → redirect to URL-based dashboard
  return <Navigate to={`/dashboard/${role}`} replace />;
}



