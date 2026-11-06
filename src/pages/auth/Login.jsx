// src/pages/auth/Login.jsx
// Premium split-panel authentication page — Sovereign Harvest Platform
import React, { useState } from 'react';
import { sendEmailOtp, verifyEmailOtp, signInWithGoogle, upsertUserProfile } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { USER_ROLES } from '@/lib/constants';
import { getErrorMessage } from '@/utils/getErrorMessage';
import {
  Sprout, Mail, KeyRound, LogIn, UserPlus, Loader2,
  AlertCircle, CheckCircle2,
}  from 'lucide-react';

// ROLE_OPTIONS must exactly match the keys of DASHBOARD_MAP in DashboardRouter.jsx
// and the user_role enum in the database (migration 00006).
const ROLE_OPTIONS = [
  { value: USER_ROLES.FARMER,     label: '🌾 Farmer' },
  { value: USER_ROLES.FPO,        label: '🤝 FPO / Farmer Producer Organisation' },
  { value: USER_ROLES.PROCESSOR,  label: '🏭 Processor' },
  { value: USER_ROLES.RETAILER,   label: '🛒 Retailer / Buyer' },
  { value: USER_ROLES.GOVERNMENT, label: '🏛️ Government Officer' },
  { value: USER_ROLES.ADMIN,      label: '⚙️ Platform Admin' },
];


export default function Login({ onLogin, initialError = '' }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [step, setStep] = useState('form');   // 'form' | 'otp'
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState(USER_ROLES.FARMER);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [info, setInfo] = useState('');

  React.useEffect(() => {
    // Check URL query parameters or hash for Supabase OAuth errors
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(
      window.location.hash.startsWith('#') ? window.location.hash.substring(1) : window.location.hash
    );
    
    const urlErrorDesc = params.get('error_description') || hashParams.get('error_description');
    const urlError = params.get('error') || hashParams.get('error');

    if (urlErrorDesc) {
      const decoded = decodeURIComponent(urlErrorDesc.replace(/\+/g, ' '));
      if (decoded.toLowerCase().includes('database error saving new user')) {
        setError('Database error saving new user in Supabase. Please run the script in supabase/fix_auth_trigger.sql in your Supabase SQL Editor.');
      } else {
        setError(decoded);
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (urlError) {
      setError(`Authentication error: ${urlError}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (initialError) {
      setError(initialError);
    }
  }, [initialError]);

  function switchMode(m) {
    setMode(m);
    setStep('form');
    setEmail('');
    setFullName('');
    setOtp('');
    setError('');
    setInfo('');
  }

  async function handleSendOtp(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!isSupabaseConfigured) {
      setError('Supabase is not configured. Check VITE_SUPABASE_ANON_KEY in .env.local and restart the dev server.');
      return;
    }
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    if (mode === 'signup' && !fullName.trim()) { setError('Please enter your full name.'); return; }
    setLoading(true);
    try {
      await sendEmailOtp({ email: email.trim(), role, fullName: fullName.trim(), isSignUp: mode === 'signup' });
      setInfo(`OTP sent to ${email}. Check your inbox.`);
      setStep('otp');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    setError('');
    if (!otp.trim()) { setError('Please enter the OTP code.'); return; }
    setLoading(true);
    try {
      const { session } = await verifyEmailOtp({ email: email.trim(), token: otp.trim() });
      if (session) {
        // On sign-up: create the profile with the selected role.
        // On sign-in: fetch the existing profile — role is NEVER overwritten here.
        // isSignUp controls which path upsertUserProfile takes.
        await upsertUserProfile({
          id: session.user.id,
          email: session.user.email,
          role,                                                       // used only on sign-up
          fullName: fullName.trim() || session.user.user_metadata?.full_name,
          isSignUp: mode === 'signup',                                // KEY FIX
        });
        onLogin(session);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle({ role, fullName: fullName.trim(), mode });
    } catch (err) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">

      {/* ── Left: Brand hero panel ── */}
      <div className="auth-hero">
        {/* Logo wordmark */}
        <div>
          <div className="flex items-center gap-3 mb-8">
            <div style={{
              display: 'grid', placeItems: 'center', width: 48, height: 48,
              borderRadius: 13, background: 'linear-gradient(135deg,#E5A93C 0%,#C88B22 100%)',
              boxShadow: '0 8px 24px rgba(229,169,60,0.4)', flexShrink: 0,
            }}>
              <Sprout size={26} color="#FFFFFF" />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.1rem', color: '#FFFFFF', lineHeight: 1.2 }}>
                Sovereign Harvest
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(229,169,60,0.85)', textTransform: 'uppercase' }}>
                NMEO-OP Platform
              </div>
            </div>
          </div>

          <h1 style={{ fontSize: '2.2rem', lineHeight: 1.2, marginBottom: '1rem', fontWeight: 800, color: '#FFFFFF' }}>
            AI-Enabled Oilseed<br />
            <span style={{ color: '#E5A93C' }}>Value Chain</span> Platform
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1rem', lineHeight: 1.65, marginBottom: '2.5rem', maxWidth: 400 }}>
            Connecting farmers, FPOs, processors, retailers and government through a unified digital ecosystem powered by AI, blockchain, and real-time data.
          </p>
        </div>

        {/* Stack footer */}
        <div style={{ marginTop: '2rem', color: 'rgba(255,255,255,0.38)', fontSize: '0.7rem', fontFamily: 'var(--font-mono)' }}>
          Supabase · Ethereum Sepolia · Flask AI · AWS EC2
        </div>
      </div>

      {/* ── Right: Auth form panel ── */}
      <div className="auth-panel">
        <div style={{ width: '100%', maxWidth: 420 }}>

          {/* Mobile-only logo */}
          <div className="flex items-center gap-2 mb-6 lg:hidden">
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg,#174A36,#2F684B)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Sprout size={18} color="#F6D58E" />
            </div>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>Sovereign Harvest</span>
          </div>

          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.55rem', fontWeight: 800, marginBottom: '0.25rem', color: 'var(--text-primary)' }}>
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.75rem' }}>
            {mode === 'signin' ? 'Sign in to access your role dashboard.' : 'Join the Sovereign Harvest platform.'}
          </p>

          {/* Mode tabs */}
          <div className="auth-tabs" style={{ marginBottom: '1.5rem' }}>
            {[
              { id: 'signin', icon: LogIn,    label: 'Sign In' },
              { id: 'signup', icon: UserPlus, label: 'Sign Up' },
            ].map(({ id, icon: Icon, label }) => (
              <button
                key={id} type="button"
                onClick={() => switchMode(id)}
                className={`auth-tab${mode === id ? ' is-active' : ''}`}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>

          {/* Error banner */}
          {error && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: '0.4rem',
              background: 'rgba(218,54,51,0.08)', border: '1px solid rgba(218,54,51,0.35)',
              color: '#B42724', borderRadius: 10, padding: '0.8rem 1rem',
              marginBottom: '1.25rem', fontSize: '0.84rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{error}</span>
              </div>
              {mode === 'signin' && (error.includes('No account') || error.includes('not registered') || error.includes('Sign Up')) && (
                <button type="button" onClick={() => switchMode('signup')}
                  className="btn btn-sm btn-primary" style={{ alignSelf: 'flex-start', marginLeft: 20 }}>
                  ✨ Switch to Sign Up
                </button>
              )}
              {mode === 'signup' && (error.includes('already exists') || error.includes('already registered') || error.includes('Sign In')) && (
                <button type="button" onClick={() => switchMode('signin')}
                  className="btn btn-sm btn-primary" style={{ alignSelf: 'flex-start', marginLeft: 20 }}>
                  ✨ Switch to Sign In
                </button>
              )}
            </div>
          )}

          {/* Info banner */}
          {info && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
              background: 'rgba(46,160,67,0.08)', border: '1px solid rgba(47,125,79,0.35)',
              color: '#2F7D4F', borderRadius: 10, padding: '0.75rem 1rem',
              marginBottom: '1.25rem', fontSize: '0.84rem',
            }}>
              <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 1 }} /> {info}
            </div>
          )}

          {/* ── Form: email + OTP ── */}
          {step === 'form' ? (
            <form onSubmit={handleSendOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {mode === 'signup' && (
                <div>
                  <label className="form-label">Full Name</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: '0.9rem', pointerEvents: 'none' }}>👤</span>
                    <input
                      type="text" placeholder="e.g. Rajesh Kumar Sharma"
                      value={fullName} onChange={e => setFullName(e.target.value)}
                      required className="form-input" style={{ paddingLeft: '2.4rem' }}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="form-label">{mode === 'signup' ? 'I am registering as' : 'Sign in as'}</label>
                <select value={role} onChange={e => setRole(e.target.value)} className="form-input">
                  {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              <div>
                <label className="form-label">Email Address</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input
                    type="email" placeholder="you@example.com"
                    value={email} onChange={e => setEmail(e.target.value)}
                    required className="form-input" style={{ paddingLeft: '2.4rem' }}
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary btn-block" disabled={loading} style={{ marginTop: '0.25rem' }}>
                {loading
                  ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                  : mode === 'signup' ? <UserPlus size={15} /> : <Mail size={15} />}
                {loading ? 'Sending OTP…' : mode === 'signup' ? 'Create Account & Send OTP' : 'Send OTP to Email'}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.1rem 0' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>or</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border-color)' }} />
              </div>

              <button type="button" className="btn btn-outline btn-block" onClick={handleGoogleLogin} disabled={loading}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>

              <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {mode === 'signin'
                  ? <> New to the platform?{' '}
                      <button type="button" onClick={() => switchMode('signup')}
                        style={{ background: 'none', border: 'none', color: 'var(--color-gold)', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', padding: 0 }}>
                        Create an account
                      </button>
                    </>
                  : <> Already registered?{' '}
                      <button type="button" onClick={() => switchMode('signin')}
                        style={{ background: 'none', border: 'none', color: 'var(--color-gold)', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', padding: 0 }}>
                        Sign in
                      </button>
                    </>
                }
              </p>
            </form>
          ) : (
            /* ── OTP step ── */
            <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{
                background: 'var(--bg-sunken)', borderRadius: 10, padding: '0.85rem 1rem',
                border: '1px solid var(--border-color)',
              }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>OTP sent to</div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.92rem' }}>{email}</div>
                {fullName && <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>Name: {fullName} · Role: {role}</div>}
              </div>

              <div>
                <label className="form-label">Enter OTP (from your email)</label>
                <div style={{ position: 'relative' }}>
                  <KeyRound size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input
                    type="text" inputMode="numeric" maxLength={8} placeholder="Enter OTP"
                    value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                    required autoFocus className="form-input"
                    style={{ paddingLeft: '2.4rem', fontFamily: 'var(--font-mono)', fontSize: '1.3rem', letterSpacing: '0.3em', textAlign: 'center' }}
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                {loading ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <LogIn size={15} />}
                {loading ? 'Verifying…' : mode === 'signup' ? 'Verify & Create Account' : 'Verify & Sign In'}
              </button>

              <button type="button"
                onClick={() => { setStep('form'); setOtp(''); setError(''); setInfo(''); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.83rem', cursor: 'pointer' }}>
                ← Use a different email
              </button>
            </form>
          )}

          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '2rem' }}>
            Secured by Supabase Auth · AI-Enabled Oilseed Value Chain · NMEO-OP
          </p>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

