import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabaseClient';
import { upsertUserProfile } from './lib/auth';
import Login from './pages/auth/Login';
import { Loader2 } from 'lucide-react';
import ProtectedRoute from './routes/ProtectedRoute';
import FarmerDashboard from './pages/dashboards/FarmerDashboard';
import FPODashboard from './pages/dashboards/FPODashboard';
import ProcessorDashboard from './pages/dashboards/ProcessorDashboard';
import RetailerDashboard from './pages/dashboards/RetailerDashboard';
import GovernmentDashboard from './pages/dashboards/GovernmentDashboard';
import AdminDashboard from './pages/dashboards/AdminDashboard';
import { ThemeProvider } from './context/ThemeContext';

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = initial load
  const [userProfile, setUserProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    async function processSession(currSession) {
      if (!currSession) {
        setSession(null);
        setUserProfile(null);
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);

      // Check for OAuth intent stored before Google redirect
      let oauthIntent = null;
      try {
        const stored = localStorage.getItem('nm_oauth_intent');
        if (stored) {
          oauthIntent = JSON.parse(stored);
          localStorage.removeItem('nm_oauth_intent');
        }
      } catch { /* ignore */ }

      try {
        // Query DB with a 3.5-second timeout to prevent infinite buffer
        const fetchPromise = supabase
          .from('users')
          .select('*')
          .or(`id.eq.${currSession.user.id},email.eq.${currSession.user.email}`)
          .maybeSingle();

        const timeoutPromise = new Promise((resolve) =>
          setTimeout(() => resolve({ data: null, timedOut: true }), 3500)
        );

        const { data: profile } = await Promise.race([fetchPromise, timeoutPromise]);

        // Case 1: Google OAuth Sign-Up intent
        if (oauthIntent && oauthIntent.mode === 'signup') {
          if (profile) {
            await supabase.auth.signOut();
            setSession(null);
            setUserProfile(null);
            setAuthError('An account with this email already exists. Please switch to Sign In.');
            return;
          }
          const created = await upsertUserProfile({
            id: currSession.user.id,
            email: currSession.user.email,
            role: oauthIntent.role || 'farmer',
            fullName: oauthIntent.fullName
              || currSession.user.user_metadata?.full_name
              || currSession.user.email.split('@')[0],
            isSignUp: true,
          });
          setUserProfile(created || {
            id: currSession.user.id,
            email: currSession.user.email,
            role: oauthIntent.role || 'farmer',
            is_verified: true,
          });
          setSession(currSession);
          setAuthError('');
          return;
        }

        // Case 2: User profile found in DB
        if (profile) {
          setUserProfile(profile);
          setSession(currSession);
          setAuthError('');
          return;
        }

        // Case 3: Fallback from session metadata (prevents infinite buffering)
        const roleFromMeta = currSession.user.user_metadata?.role || 'government';
        const nameFromMeta =
          currSession.user.user_metadata?.full_name ||
          currSession.user.email?.split('@')[0] ||
          'User';

        const fallbackProfile = {
          id: currSession.user.id,
          email: currSession.user.email,
          role: roleFromMeta,
          full_name: nameFromMeta,
          is_verified: true,
        };

        setUserProfile(fallbackProfile);
        setSession(currSession);
        setAuthError('');

        // Attempt non-blocking profile sync in background
        upsertUserProfile({
          id: currSession.user.id,
          email: currSession.user.email,
          role: roleFromMeta,
          fullName: nameFromMeta,
          isSignUp: false,
        }).catch(() => {});
      } catch (err) {
        console.warn('[App] Profile fetch error, using session metadata fallback:', err);
        const fallbackProfile = {
          id: currSession.user.id,
          email: currSession.user.email,
          role: currSession.user.user_metadata?.role || 'government',
          full_name:
            currSession.user.user_metadata?.full_name ||
            currSession.user.email?.split('@')[0] ||
            'User',
          is_verified: true,
        };
        setUserProfile(fallbackProfile);
        setSession(currSession);
        setAuthError('');
      } finally {
        setProfileLoading(false);
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      processSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      processSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // State 1: Initial session check in progress
  if (session === undefined) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-secondary)', gap: '0.75rem' }}>
        <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: 'var(--color-gold)' }} />
        <span style={{ fontFamily: 'var(--font-body)' }}>Initialising platform…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const routeProps = { session, userProfile, profileLoading };

  return (
    <ThemeProvider>
      <Routes>
        {/* Root: AuthGate */}
        <Route
          path="/"
          element={
            !session ? (
              <Login onLogin={setSession} initialError={authError} />
            ) : profileLoading || !userProfile ? (
              <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', color: 'var(--text-secondary)', gap: '0.75rem' }}>
                <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', color: 'var(--color-gold)' }} />
                <span style={{ fontFamily: 'var(--font-body)' }}>Loading your dashboard…</span>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            ) : (
              <Navigate to={`/dashboard/${userProfile.role}`} replace />
            )
          }
        />

        {/* Role-specific dashboard routes */}
        <Route path="/dashboard/farmer" element={
          <ProtectedRoute {...routeProps} requiredRole="farmer">
            <FarmerDashboard session={session} userProfile={userProfile} />
          </ProtectedRoute>
        } />
        <Route path="/dashboard/fpo" element={
          <ProtectedRoute {...routeProps} requiredRole="fpo">
            <FPODashboard session={session} userProfile={userProfile} />
          </ProtectedRoute>
        } />
        <Route path="/dashboard/processor" element={
          <ProtectedRoute {...routeProps} requiredRole="processor">
            <ProcessorDashboard session={session} userProfile={userProfile} />
          </ProtectedRoute>
        } />
        <Route path="/dashboard/retailer" element={
          <ProtectedRoute {...routeProps} requiredRole="retailer">
            <RetailerDashboard session={session} userProfile={userProfile} />
          </ProtectedRoute>
        } />
        <Route path="/dashboard/government" element={
          <ProtectedRoute {...routeProps} requiredRole="government">
            <GovernmentDashboard session={session} userProfile={userProfile} />
          </ProtectedRoute>
        } />
        <Route path="/dashboard/admin" element={
          <ProtectedRoute {...routeProps} requiredRole="admin">
            <AdminDashboard session={session} userProfile={userProfile} />
          </ProtectedRoute>
        } />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ThemeProvider>
  );
}
