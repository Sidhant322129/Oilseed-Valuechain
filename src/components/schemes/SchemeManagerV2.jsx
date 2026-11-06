// src/components/schemes/SchemeManagerV2.jsx
// New file — replaces the hard-coded renderSchemes() when VITE_SCHEME_ENGINE_ENABLED=true
// Reuses ALL existing design tokens, card styles, badge styles, and icon set.
// Zero new CSS frameworks or UI libraries.

import React, { useState, useEffect, useCallback } from 'react';
import {
  Award, Filter, CheckCircle, AlertTriangle, Users, MapPin,
  RefreshCw, ChevronRight, X, Download, Clock, TrendingUp,
  ShieldCheck, Banknote, FileText, Eye, BarChart2, Building2,
} from 'lucide-react';
import { apiGet, apiPost } from '@/services/api';
import { supabase } from '@/lib/supabaseClient';
import LoadingSpinner from '@/components/feedback/LoadingSpinner';
import EmptyState from '@/components/feedback/EmptyState';
import SchemeCatalogBrowser from './SchemeCatalogBrowser';

// ── Flag check ────────────────────────────────────────────────────────────────
// Exported so GovernmentDashboard can read it without importing anything else.
export const SCHEME_ENGINE_ENABLED =
  import.meta.env.VITE_SCHEME_ENGINE_ENABLED !== 'false'; // default true

export const SCHEME_CATALOG_ENABLED =
  import.meta.env.VITE_SCHEME_CATALOG_ENABLED !== 'false'; // default true

// ── Role labels & simulated identities for Maker-Checker ─────────────────────
const ROLE_LABELS = {
  DISTRICT_OFFICER: 'District Officer',
  STATE_APPROVER:   'State Approver',
  FINANCE_OFFICER:  'Finance Officer',
  ADMIN:            'Admin',
};

const SIMULATED_ACTORS = {
  DISTRICT_OFFICER: {
    id: '11111111-1111-4111-a111-111111111111',
    role: 'DISTRICT_OFFICER',
    label: 'District Officer',
  },
  STATE_APPROVER: {
    id: '22222222-2222-4222-a222-222222222222',
    role: 'STATE_APPROVER',
    label: 'State Approver',
  },
  FINANCE_OFFICER: {
    id: '33333333-3333-4333-a333-333333333333',
    role: 'FINANCE_OFFICER',
    label: 'Finance Officer',
  },
};

const STATUS_NEXT_STEP = {
  SUBMITTED:     { nextStatus: 'AUTO_SCREENED', required_role: 'DISTRICT_OFFICER', required_role_label: 'District Officer' },
  AUTO_SCREENED: { nextStatus: 'VERIFIED',      required_role: 'DISTRICT_OFFICER', required_role_label: 'District Officer' },
  VERIFIED:      { nextStatus: 'APPROVED',       required_role: 'STATE_APPROVER',   required_role_label: 'State Approver' },
  APPROVED:      { nextStatus: 'SANCTIONED',     required_role: 'FINANCE_OFFICER',  required_role_label: 'Finance Officer' },
  SANCTIONED:    { nextStatus: 'DISBURSED',      required_role: 'FINANCE_OFFICER',  required_role_label: 'Finance Officer' },
};

// ── Design tokens (reuse existing vars) ──────────────────────────────────────
const STATUS_COLORS = {
  SUBMITTED:    { bg: 'rgba(88,166,255,0.12)', color: '#58A6FF', border: '#58A6FF' },
  AUTO_SCREENED:{ bg: 'rgba(229,169,60,0.12)', color: '#E5A93C', border: '#E5A93C' },
  VERIFIED:     { bg: 'rgba(46,160,67,0.18)',  color: '#3FB950', border: '#2EA043' },
  APPROVED:     { bg: 'rgba(188,140,255,0.15)', color: '#BC8CFF', border: '#BC8CFF' },
  SANCTIONED:   { bg: 'rgba(229,169,60,0.18)', color: '#E5A93C', border: '#E5A93C' },
  DISBURSED:    { bg: 'rgba(46,160,67,0.25)',  color: '#3FB950', border: '#2EA043' },
  REJECTED:     { bg: 'rgba(218,54,51,0.15)',  color: '#DA3633', border: '#DA3633' },
  FAILED:       { bg: 'rgba(218,54,51,0.12)',  color: '#F85149', border: '#F85149' },
};

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.SUBMITTED;
  return (
    <span style={{
      fontSize: '0.62rem', padding: '0.2rem 0.55rem', borderRadius: '999px', fontWeight: 700,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      display: 'inline-flex', alignItems: 'center', gap: '0.25rem', whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  );
}

function MsgBanner({ msg, onClose }) {
  if (!msg?.text) return null;
  return (
    <div style={{
      padding: '0.6rem 0.85rem', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '0.75rem',
      background: msg.type === 'success' ? 'rgba(46,160,67,0.15)' : 'rgba(218,54,51,0.15)',
      color:      msg.type === 'success' ? '#2EA043' : '#DA3633',
      border:     `1px solid ${msg.type === 'success' ? 'rgba(46,160,67,0.35)' : 'rgba(218,54,51,0.35)'}`,
      display:    'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap:        '0.5rem',
    }}>
      <div style={{ flex: 1 }}>{msg.text}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close notification"
          style={{
            background: 'none',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            padding: '0.2rem',
            display: 'inline-flex',
            alignItems: 'center',
            opacity: 0.8,
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

// ── Budget progress bar ────────────────────────────────────────────────────────
function BudgetBar({ used, total }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const barColor = pct > 85 ? '#DA3633' : pct > 60 ? '#E5A93C' : '#2EA043';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
        <span>Budget Used: <strong style={{ color: barColor }}>₹{Number(used || 0).toLocaleString('en-IN')}</strong></span>
        <span>{pct}% of ₹{Number(total || 0).toLocaleString('en-IN')}</span>
      </div>
      <div style={{ height: '4px', background: 'var(--bg-sunken)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: '3px', transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

// ── Scheme Card ────────────────────────────────────────────────────────────────
function SchemeCard({ scheme, onSelect, selected }) {
  const isActive = selected?.id === scheme.id;
  return (
    <div
      onClick={() => onSelect(scheme)}
      className="card"
      style={{
        padding: '1rem', cursor: 'pointer', transition: 'all 0.2s ease',
        background: isActive ? 'rgba(229,169,60,0.08)' : 'var(--bg-card)',
        border: `1px solid ${isActive ? 'var(--color-gold,#E5A93C)' : 'var(--border-color)'}`,
        boxShadow: isActive ? '0 0 18px rgba(229,169,60,0.15)' : 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
        <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', background: 'var(--bg-sunken)', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
          {scheme.code}
        </span>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', background: 'var(--bg-sunken)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>
          {scheme.badge_label}
        </span>
      </div>

      <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
        {scheme.name}
      </div>
      <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '0.65rem', lineHeight: 1.5 }}>
        {scheme.description}
      </p>

      <BudgetBar used={scheme.budget_used} total={scheme.budget_total} />

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
        <span>Qualified on Platform: <strong style={{ color: 'var(--text-primary)' }}>{scheme.counts?.eligible ?? '—'}</strong></span>
        <span style={{ color: 'var(--color-gold,#E5A93C)', fontWeight: 600 }}>{scheme.benefit_label}</span>
      </div>

      {isActive && (
        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span>Applied: <strong style={{ color: 'var(--text-primary)' }}>{scheme.counts?.applied ?? 0}</strong></span>
          <span>Verified: <strong style={{ color: '#3FB950' }}>{scheme.counts?.verified ?? 0}</strong></span>
          <span>Disbursed: <strong style={{ color: 'var(--color-gold,#E5A93C)' }}>{scheme.counts?.disbursed ?? 0}</strong></span>
        </div>
      )}
    </div>
  );
}

// ── Scheme Detail Drawer ───────────────────────────────────────────────────────
function SchemeDetailDrawer({ scheme, version, onClose }) {
  if (!scheme) return null;
  const criteria = version?.eligibility_rules?.all || version?.eligibility_rules?.any || [];

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px',
      padding: '1.25rem', marginBottom: '1.25rem',
      boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>{scheme.code}</div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>{scheme.name}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}>
          <X size={16} />
        </button>
      </div>

      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.6 }}>{scheme.description}</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ background: 'var(--bg-sunken)', padding: '0.65rem', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Benefit</div>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-gold,#E5A93C)' }}>{scheme.benefit_label}</div>
        </div>
        <div style={{ background: 'var(--bg-sunken)', padding: '0.65rem', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Type</div>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{scheme.type}</div>
        </div>
        {scheme.start_date && (
          <div style={{ background: 'var(--bg-sunken)', padding: '0.65rem', borderRadius: '8px' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Valid</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)' }}>
              {scheme.start_date} → {scheme.end_date || 'Ongoing'}
            </div>
          </div>
        )}
      </div>

      <BudgetBar used={scheme.budget_used} total={scheme.budget_total} />

      {criteria.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>Eligibility Criteria</div>
          <ul style={{ margin: 0, padding: '0 0 0 1rem', listStyle: 'none' }}>
            {criteria.map((r, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.3rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                <CheckCircle size={12} style={{ color: '#2EA043', marginTop: '2px', flexShrink: 0 }} />
                {r.label || r.field}
              </li>
            ))}
          </ul>
        </div>
      )}

      {version?.documents_required?.length > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: 600 }}>Documents Required</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {version.documents_required.map((d, i) => (
              <span key={i} style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem', background: 'var(--bg-sunken)', borderRadius: '4px', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}>
                <FileText size={9} style={{ marginRight: '0.2rem', verticalAlign: 'middle' }} />{d}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Confirm Modal ────────────────────────────────────────────────────────────
function ConfirmModal({ show, title, message, onConfirm, onCancel, loading }) {
  if (!show) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px',
        padding: '1.5rem', width: '100%', maxWidth: '420px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>{title}</div>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} disabled={loading} style={{
            padding: '0.4rem 0.9rem', borderRadius: '6px', border: '1px solid var(--border-color)',
            background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={onConfirm} disabled={loading} style={{
            padding: '0.4rem 0.9rem', borderRadius: '6px', border: '1px solid var(--color-gold,#E5A93C)',
            background: 'var(--color-gold,#E5A93C)', color: '#0D1117', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
          }}>
            {loading ? 'Processing…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CSV Export helper ──────────────────────────────────────────────────────────
function exportCsv(rows, filename) {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ════════════════════════════════════════════════════════════════════════════
// Main SchemeManagerV2 component
// ════════════════════════════════════════════════════════════════════════════
export default function SchemeManagerV2({ farmers: propFarmers, farmersLoading }) {
  // ── Scheme state ───────────────────────────────────────────────────────────
  const [schemes, setSchemes]               = useState([]);
  const [schemesLoading, setSchemesLoading] = useState(true);
  const [selectedScheme, setSelectedScheme] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [catalogMode, setCatalogMode]       = useState('operational'); // 'operational' | 'catalog'

  // ── Eligibility state ──────────────────────────────────────────────────────
  const [eligData, setEligData]             = useState(null);
  const [eligLoading, setEligLoading]       = useState(false);
  const [kycFilter, setKycFilter]           = useState('all');
  const [viewTab, setViewTab]               = useState('eligible'); // 'eligible' | 'ineligible' | 'applications' | 'disbursed'

  // ── Workflow/action state ──────────────────────────────────────────────────
  const [msg, setMsg]                       = useState({ type: '', text: '' });
  const [actionFarmerId, setActionFarmerId] = useState(null);
  const [confirmModal, setConfirmModal]     = useState(null); // { title, message, onConfirm }
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [simulatedRole, setSimulatedRole]   = useState(''); // Dev-only simulated role
  const [currentUserId, setCurrentUserId]   = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) setCurrentUserId(session.user.id);
    });
  }, []);

  // Clear notification banner whenever simulated/acting role changes
  useEffect(() => {
    setMsg({ type: '', text: '' });
  }, [simulatedRole]);

  const currentActorId = simulatedRole ? SIMULATED_ACTORS[simulatedRole]?.id : currentUserId;
  const currentActingRoleLabel = simulatedRole
    ? (ROLE_LABELS[simulatedRole] || simulatedRole)
    : 'Admin';

  const getSameActorCheck = useCallback((app, targetActionRole) => {
    if (!app) return { isSame: false, tooltip: '' };

    const isSame = Boolean(
      (currentActorId && app.last_actor_id && currentActorId === app.last_actor_id) ||
      (simulatedRole && app.last_actor_role && simulatedRole === app.last_actor_role)
    );

    if (isSame) {
      const requiredRoleName = app.required_role_label ||
        ROLE_LABELS[app.required_role] ||
        ROLE_LABELS[targetActionRole] ||
        targetActionRole;
      return {
        isSame: true,
        tooltip: `You performed the previous step. Switch to ${requiredRoleName} to continue.`,
      };
    }
    return { isSame: false, tooltip: '' };
  }, [currentActorId, simulatedRole]);

  const getActionState = useCallback((app, targetActionRole, actionLabel) => {
    if (!app) return { allowed: false, tooltip: '' };

    const sameCheck = getSameActorCheck(app, targetActionRole);
    if (sameCheck.isSame) {
      return { allowed: false, tooltip: sameCheck.tooltip };
    }

    if (simulatedRole && simulatedRole !== targetActionRole) {
      const neededLabel = ROLE_LABELS[targetActionRole] || targetActionRole;
      return {
        allowed: false,
        tooltip: `Switch to ${neededLabel} to ${actionLabel.toLowerCase()}.`,
      };
    }

    return { allowed: true, tooltip: `${actionLabel} application` };
  }, [getSameActorCheck, simulatedRole]);

  const getApiConfig = useCallback(() => {
    return simulatedRole
      ? { headers: { 'x-simulate-scheme-role': simulatedRole } }
      : {};
  }, [simulatedRole]);

  // ── Bulk state ─────────────────────────────────────────────────────────────
  const [selectedRows, setSelectedRows]     = useState(new Set());
  const [bulkLoading, setBulkLoading]       = useState(false);

  // ── Audit log state ────────────────────────────────────────────────────────
  const [showAudit, setShowAudit]           = useState(false);
  const [auditLogs, setAuditLogs]           = useState([]);
  const [auditLoading, setAuditLoading]     = useState(false);

  // ── Load schemes ───────────────────────────────────────────────────────────
  const loadSchemes = useCallback(async () => {
    setSchemesLoading(true);
    try {
      const res = await apiGet('/schemes');
      setSchemes(res.schemes || []);
      if (!selectedScheme && res.schemes?.length > 0) {
        handleSelectScheme(res.schemes[0]);
      }
    } catch {
      setSchemes([]);
    } finally {
      setSchemesLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadSchemes(); }, [loadSchemes]);

  // ── Select scheme → fetch eligibility ─────────────────────────────────────
  const handleSelectScheme = useCallback(async (scheme) => {
    setSelectedScheme(scheme);
    setSelectedRows(new Set());
    setEligData(null);
    setEligLoading(true);
    try {
      const [eligRes, detailRes] = await Promise.all([
        apiGet(`/schemes/${scheme.id}/eligibility?limit=200`),
        apiGet(`/schemes/${scheme.id}`),
      ]);
      setEligData(eligRes);
      setSelectedVersion(detailRes.version);
    } catch {
      setEligData(null);
    } finally {
      setEligLoading(false);
    }
  }, []);

  // ── Refresh ────────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    await loadSchemes();
    if (selectedScheme) await handleSelectScheme(selectedScheme);
  }, [loadSchemes, selectedScheme, handleSelectScheme]);

  // ── Filtered farmer list ───────────────────────────────────────────────────
  const allFarmers = eligData?.farmers || [];

  const kycFiltered = allFarmers.filter(f => {
    if (kycFilter === 'all') return true;
    if (kycFilter === 'verified') return f.kyc_status === 'verified';
    if (kycFilter === 'pending')  return f.kyc_status !== 'verified';
    return true;
  });

  const tabFarmers = kycFiltered.filter(f => {
    if (viewTab === 'eligible')      return f.eligible && !f.application;
    if (viewTab === 'ineligible')    return !f.eligible;
    if (viewTab === 'applications')  return !!f.application;
    if (viewTab === 'disbursed')     return f.application?.status === 'DISBURSED';
    return true;
  });

  // ── Disburse action ────────────────────────────────────────────────────────
  const handleDisburse = useCallback((farmerRow) => {
    const disbText = farmerRow.benefit_amount > 0
      ? `₹${Number(farmerRow.benefit_amount).toLocaleString('en-IN')}`
      : 'non-monetary benefit';

    setConfirmModal({
      title: 'Confirm DBT Disbursement',
      message: `Disburse ${disbText} to ${farmerRow.full_name} (${farmerRow.district}) under ${selectedScheme?.name}? This action is irreversible.`,
      onConfirm: async () => {
        setConfirmLoading(true);
        try {
          await apiPost('/schemes/disbursements', { applicationId: farmerRow.application?.id }, getApiConfig());
          setMsg({ type: 'success', text: `DBT of ${disbText} disbursed to ${farmerRow.full_name}.` });
          await refresh();
        } catch (e) {
          const code = e?.body?.error?.code;
          let text = e?.body?.error?.message || e?.message || 'Disbursement failed.';
          if (code === 'MAKER_CHECKER_VIOLATION' || code === 'ROLE_NOT_ALLOWED' || code === 'ROLE_FORBIDDEN') {
            text = `${text.replace(/\.?$/, '.')} Next step needs: Finance Officer.`;
          }
          setMsg({ type: 'error', text });
        } finally {
          setConfirmLoading(false);
          setConfirmModal(null);
        }
      },
    });
  }, [selectedScheme, refresh, getApiConfig]);

  // ── Transition action ──────────────────────────────────────────────────────
  const handleTransition = useCallback(async (applicationId, toStatus, remarks = '') => {
    setActionFarmerId(applicationId);
    setMsg({ type: '', text: '' });
    try {
      await apiPost(`/schemes/applications/${applicationId}/transition`, { toStatus, remarks }, getApiConfig());
      setMsg({ type: 'success', text: `Status updated to ${toStatus}.` });
      await refresh();
    } catch (e) {
      const code = e?.body?.error?.code;
      let text = e?.body?.error?.message || e?.message || 'Transition failed.';
      if (code === 'MAKER_CHECKER_VIOLATION' || code === 'ROLE_NOT_ALLOWED' || code === 'ROLE_FORBIDDEN') {
        const nextRole = STATUS_NEXT_STEP[toStatus]?.required_role_label || 'authorized officer';
        text = `${text.replace(/\.?$/, '.')} Next step needs: ${nextRole}.`;
      }
      setMsg({ type: 'error', text });
    } finally {
      setActionFarmerId(null);
    }
  }, [refresh, getApiConfig]);

  // ── Create application ─────────────────────────────────────────────────────
  const handleApply = useCallback(async (farmerRow) => {
    setActionFarmerId(farmerRow.farmer_id);
    setMsg({ type: '', text: '' });
    try {
      const season = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
      await apiPost('/schemes/applications', {
        schemeId:  selectedScheme.id,
        farmerId:  farmerRow.farmer_id,
        season,
      }, getApiConfig());
      setMsg({ type: 'success', text: `Application submitted for ${farmerRow.full_name}.` });
      await refresh();
    } catch (e) {
      setMsg({ type: 'error', text: e?.body?.error?.message || e?.message || 'Application failed.' });
    } finally {
      setActionFarmerId(null);
    }
  }, [selectedScheme, refresh, getApiConfig]);

  // ── Bulk disburse ──────────────────────────────────────────────────────────
  const handleBulkDisburse = useCallback(() => {
    const selected = tabFarmers.filter(f => selectedRows.has(f.farmer_id) && f.application?.status === 'SANCTIONED');
    const totalAmt = selected.reduce((s, f) => s + (Number(f.benefit_amount) || 0), 0);

    setConfirmModal({
      title: `Bulk Disburse ${selected.length} Applications`,
      message: `Total amount: ₹${totalAmt.toLocaleString('en-IN')}. This will process ${selected.length} disbursements. Continue?`,
      onConfirm: async () => {
        setConfirmLoading(true);
        setBulkLoading(true);
        try {
          const ids = selected.map(f => f.application.id);
          await apiPost('/schemes/disbursements/bulk', { applicationIds: ids }, getApiConfig());
          setMsg({ type: 'success', text: `Bulk disbursement processed for ${selected.length} farmers.` });
          setSelectedRows(new Set());
          await refresh();
        } catch (e) {
          setMsg({ type: 'error', text: e?.body?.error?.message || e?.message || 'Bulk disbursement failed.' });
        } finally {
          setConfirmLoading(false);
          setBulkLoading(false);
          setConfirmModal(null);
        }
      },
    });
  }, [tabFarmers, selectedRows, refresh, getApiConfig]);

  // ── Audit logs ─────────────────────────────────────────────────────────────
  const loadAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await apiGet('/schemes/audit-logs?limit=100');
      setAuditLogs(res.logs || []);
    } catch {
      setAuditLogs([]);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showAudit) loadAuditLogs();
  }, [showAudit, loadAuditLogs]);

  // ── Disburse button state helper ────────────────────────────────────────────
  function getDisburseState(f) {
    if (f.kyc_status !== 'verified') return { enabled: false, reason: 'KYC not verified' };
    if (!f.application)              return { enabled: false, reason: 'No application yet' };
    if (f.application.status === 'DISBURSED') return { enabled: false, reason: 'Already disbursed' };
    if (f.application.status === 'REJECTED')  return { enabled: false, reason: 'Application rejected' };
    if (f.application.status !== 'SANCTIONED') return { enabled: false, reason: `Awaiting ${f.application.status}` };
    const sameCheck = getSameActorCheck(f.application, 'FINANCE_OFFICER');
    if (sameCheck.isSame && simulatedRole !== 'FINANCE_OFFICER') {
      return { enabled: false, reason: sameCheck.tooltip };
    }
    return { enabled: true, reason: '' };
  }

  // ── Bulk screen ────────────────────────────────────────────────────────────
  const handleBulkScreen = useCallback(async () => {
    setMsg({ type: '', text: '' });
    try {
      const season = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
      const res = await apiPost('/schemes/applications/bulk-screen', { schemeId: selectedScheme.id, season }, getApiConfig());
      setMsg({ type: 'success', text: `Screened ${res.results?.created || 0} eligible farmers.` });
      await refresh();
    } catch (e) {
      setMsg({ type: 'error', text: e?.body?.error?.message || e?.message || 'Bulk screen failed.' });
    }
  }, [selectedScheme, refresh, getApiConfig]);

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <>
      <ConfirmModal
        show={!!confirmModal}
        title={confirmModal?.title}
        message={confirmModal?.message}
        onConfirm={confirmModal?.onConfirm}
        onCancel={() => setConfirmModal(null)}
        loading={confirmLoading}
      />

      {/* ── Dev-only Maker-Checker Role Switcher (Hidden in production) ── */}
      {import.meta.env.DEV && (
        <div style={{
          position: 'sticky',
          top: 'var(--header-height, 64px)',
          zIndex: 25,
          background: 'rgba(22, 27, 34, 0.95)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem',
          padding: '0.45rem 0.85rem',
          marginBottom: '1rem',
          borderRadius: '8px',
          border: '1px solid rgba(229, 169, 60, 0.35)',
          fontSize: '0.74rem',
          color: 'var(--text-primary)',
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--color-gold,#E5A93C)', fontWeight: 600 }}>
            <ShieldCheck size={14} />
            <span>Dev Role Switcher:</span>
          </div>
          <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {[
              { role: '', label: 'Real Account (Admin)' },
              { role: 'DISTRICT_OFFICER', label: 'District Officer' },
              { role: 'STATE_APPROVER', label: 'State Approver' },
              { role: 'FINANCE_OFFICER', label: 'Finance Officer' },
            ].map(opt => (
              <button
                key={opt.role}
                onClick={() => {
                  setMsg({ type: '', text: '' });
                  setSimulatedRole(opt.role);
                }}
                style={{
                  padding: '0.2rem 0.55rem',
                  borderRadius: '4px',
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                  border: simulatedRole === opt.role ? '1px solid var(--color-gold,#E5A93C)' : '1px solid var(--border-color)',
                  background: simulatedRole === opt.role ? 'var(--color-gold,#E5A93C)' : 'var(--bg-sunken)',
                  color: simulatedRole === opt.role ? '#0D1117' : 'var(--text-muted)',
                  fontWeight: simulatedRole === opt.role ? 700 : 500,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {simulatedRole ? `Acting as: ${ROLE_LABELS[simulatedRole] || simulatedRole}` : 'Acting as authenticated officer'}
          </span>
        </div>
      )}

      {/* ── Mode Switcher: Operational Schemes vs Scheme Catalog ── */}
      {SCHEME_CATALOG_ENABLED && (
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1.25rem',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '0.75rem',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}>
          <button
            onClick={() => setCatalogMode('operational')}
            style={{
              padding: '0.4rem 0.95rem',
              borderRadius: '6px',
              fontSize: '0.76rem',
              fontWeight: catalogMode === 'operational' ? 700 : 500,
              cursor: 'pointer',
              border: catalogMode === 'operational' ? '1px solid var(--color-gold,#E5A93C)' : '1px solid var(--border-color)',
              background: catalogMode === 'operational' ? 'rgba(229,169,60,0.14)' : 'var(--bg-card)',
              color: catalogMode === 'operational' ? 'var(--color-gold,#E5A93C)' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.15s ease',
            }}
          >
            <Award size={14} /> Operational Schemes ({schemes.length})
          </button>
          <button
            onClick={() => setCatalogMode('catalog')}
            style={{
              padding: '0.4rem 0.95rem',
              borderRadius: '6px',
              fontSize: '0.76rem',
              fontWeight: catalogMode === 'catalog' ? 700 : 500,
              cursor: 'pointer',
              border: catalogMode === 'catalog' ? '1px solid var(--color-gold,#E5A93C)' : '1px solid var(--border-color)',
              background: catalogMode === 'catalog' ? 'rgba(229,169,60,0.14)' : 'var(--bg-card)',
              color: catalogMode === 'catalog' ? 'var(--color-gold,#E5A93C)' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.15s ease',
            }}
          >
            <Building2 size={14} /> Browse All Schemes Catalog
          </button>
        </div>
      )}

      {catalogMode === 'catalog' && SCHEME_CATALOG_ENABLED ? (
        <SchemeCatalogBrowser onSwitchToOperational={() => setCatalogMode('operational')} />
      ) : (
        <>
          {/* ── Section header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', color: 'var(--text-primary)', margin: 0 }}>
          National Oilseed Development Schemes &amp; MSP Subsidies
        </h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={refresh} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.3rem 0.65rem', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <RefreshCw size={12} /> Refresh
          </button>
          <button onClick={() => setShowAudit(v => !v)} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', color: showAudit ? 'var(--color-gold,#E5A93C)' : 'var(--text-muted)', cursor: 'pointer', padding: '0.3rem 0.65rem', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Eye size={12} /> Audit Log
          </button>
        </div>
      </div>

      {/* ── 3 Scheme cards ─────────────────────────────────────────── */}
      {schemesLoading ? <LoadingSpinner label="Loading schemes…" /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {schemes.map(sch => (
            <SchemeCard key={sch.id} scheme={sch} onSelect={handleSelectScheme} selected={selectedScheme} />
          ))}
        </div>
      )}

      {/* ── Selected scheme detail ──────────────────────────────────── */}
      {selectedScheme && (
        <SchemeDetailDrawer
          scheme={selectedScheme}
          version={selectedVersion}
          onClose={() => setSelectedScheme(null)}
        />
      )}

      {/* ── Audit log panel ──────────────────────────────────────────── */}
      {showAudit && (
        <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', color: 'var(--text-primary)', margin: 0 }}>Audit &amp; Governance Log</h3>
            <button onClick={() => exportCsv(auditLogs, 'scheme_audit_log.csv')} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem 0.6rem', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Download size={11} /> Export CSV
            </button>
          </div>
          {auditLoading ? <LoadingSpinner label="Loading audit logs…" /> : auditLogs.length === 0 ? (
            <EmptyState icon={FileText} title="No audit events yet" message="Actions performed on schemes will be logged here." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', fontFamily: 'var(--font-body)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    {['Time', 'Actor Role', 'Action', 'Entity'].map(h => (
                      <th key={h} style={{ padding: '0.4rem 0.65rem', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map(log => (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.4rem 0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                        {new Date(log.at).toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '0.4rem 0.65rem', color: 'var(--text-primary)' }}>{log.actor_role}</td>
                      <td style={{ padding: '0.4rem 0.65rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>{log.action}</td>
                      <td style={{ padding: '0.4rem 0.65rem', color: 'var(--text-muted)' }}>{log.entity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── DigiLocker Farmer Subsidy Eligibility Validator ─────────── */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        {/* Header — keep original title + filter pills exactly */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', color: 'var(--text-primary)', margin: 0 }}>
            DigiLocker Farmer Subsidy Eligibility Validator
          </h3>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <Filter size={14} style={{ color: 'var(--text-muted)' }} />
            {[
              { val: 'all',      label: 'All Farmers' },
              { val: 'verified', label: 'KYC Verified' },
              { val: 'pending',  label: 'KYC Pending' },
            ].map(f => (
              <button key={f.val} onClick={() => setKycFilter(f.val)} style={{
                padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem',
                fontFamily: 'var(--font-body)', cursor: 'pointer', transition: 'all 0.15s ease',
                border:      kycFilter === f.val ? '1px solid var(--color-gold,#E5A93C)' : '1px solid var(--border-color)',
                background:  kycFilter === f.val ? 'rgba(229,169,60,0.18)' : 'var(--bg-card)',
                color:       kycFilter === f.val ? 'var(--color-gold,#E5A93C)' : 'var(--text-muted)',
              }}>{f.label}</button>
            ))}
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '0.4rem', whiteSpace: 'nowrap' }}>
              Acting as: <strong style={{ color: 'var(--color-gold,#E5A93C)' }}>{currentActingRoleLabel}</strong>
            </span>
          </div>
        </div>

        {/* View tabs */}
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', flexWrap: 'wrap' }}>
          {[
            { id: 'eligible',     label: 'Eligible', count: kycFiltered.filter(f => f.eligible && !f.application).length },
            { id: 'ineligible',   label: 'Ineligible', count: kycFiltered.filter(f => !f.eligible).length },
            { id: 'applications', label: 'Applications', count: kycFiltered.filter(f => !!f.application).length },
            { id: 'disbursed',    label: 'Disbursed', count: kycFiltered.filter(f => f.application?.status === 'DISBURSED').length },
          ].map(t => (
            <button key={t.id} onClick={() => setViewTab(t.id)} style={{
              padding: '0.3rem 0.75rem', borderRadius: '6px', fontSize: '0.73rem', cursor: 'pointer',
              border:      viewTab === t.id ? '1px solid var(--color-gold,#E5A93C)' : '1px solid var(--border-color)',
              background:  viewTab === t.id ? 'rgba(229,169,60,0.15)' : 'var(--bg-card)',
              color:       viewTab === t.id ? 'var(--color-gold,#E5A93C)' : 'var(--text-muted)',
              fontWeight:  viewTab === t.id ? 700 : 400,
            }}>
              {t.label} <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>({t.count})</span>
            </button>
          ))}

          {/* Bulk actions */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem' }}>
            {selectedScheme && (
              <button onClick={handleBulkScreen} style={{ padding: '0.3rem 0.7rem', borderRadius: '6px', fontSize: '0.7rem', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <ShieldCheck size={11} /> Bulk Screen
              </button>
            )}
            {selectedRows.size > 0 && (
              <button onClick={handleBulkDisburse} disabled={bulkLoading} style={{ padding: '0.3rem 0.7rem', borderRadius: '6px', fontSize: '0.7rem', border: '1px solid var(--color-gold,#E5A93C)', background: 'rgba(229,169,60,0.18)', color: 'var(--color-gold,#E5A93C)', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Banknote size={11} /> Disburse {selectedRows.size} Selected
              </button>
            )}
            <button onClick={() => exportCsv(tabFarmers, 'scheme_eligibility.csv')} style={{ padding: '0.3rem 0.65rem', borderRadius: '6px', fontSize: '0.7rem', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Download size={11} /> CSV
            </button>
          </div>
        </div>

        <MsgBanner msg={msg} onClose={() => setMsg({ type: '', text: '' })} />

        {/* Loading / empty / list */}
        {!selectedScheme ? (
          <EmptyState icon={Award} title="Select a scheme" message="Click a scheme card above to evaluate farmer eligibility." />
        ) : eligLoading ? (
          <LoadingSpinner label="Evaluating eligibility…" />
        ) : tabFarmers.length === 0 ? (
          <EmptyState icon={Users} title={`No farmers in "${viewTab}" view`} message="Try a different filter or scheme." />
        ) : (
          <>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>
              {tabFarmers.length} farmer{tabFarmers.length !== 1 ? 's' : ''} · {selectedScheme?.name}
            </div>

            {tabFarmers.map(f => {
              const disbState = getDisburseState(f);
              const isSelected = selectedRows.has(f.farmer_id);
              const isActing = actionFarmerId === f.farmer_id || actionFarmerId === f.application?.id;

              return (
                <div key={f.farmer_id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  padding: '0.75rem 0.85rem', marginBottom: '0.45rem',
                  background: isSelected ? 'rgba(229,169,60,0.06)' : 'var(--bg-card)',
                  borderRadius: '8px',
                  border: isSelected ? '1px solid rgba(229,169,60,0.4)' : '1px solid var(--border-color)',
                  gap: '1rem', flexWrap: 'wrap', transition: 'all 0.15s ease',
                }}>
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={e => {
                      setSelectedRows(prev => {
                        const next = new Set(prev);
                        e.target.checked ? next.add(f.farmer_id) : next.delete(f.farmer_id);
                        return next;
                      });
                    }}
                    style={{ marginTop: '4px', flexShrink: 0 }}
                    aria-label={`Select ${f.full_name}`}
                  />

                  {/* Info column */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>{f.full_name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.15rem', flexWrap: 'wrap' }}>
                      <MapPin size={10} /> {f.district}, {f.state}
                      {f.land_acres > 0 && <span>· {f.land_acres} ac</span>}
                      {f.primary_crop && <span>· {f.primary_crop}</span>}
                      {f.aadhaar_display && <span style={{ fontFamily: 'var(--font-mono)' }}>· {f.aadhaar_display}</span>}
                    </div>

                    {/* Ineligibility reasons */}
                    {viewTab === 'ineligible' && f.eligibility_results && (
                      <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        {f.eligibility_results.filter(r => !r.passed).map((r, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', fontSize: '0.68rem', color: '#DA3633' }}>
                            <AlertTriangle size={10} style={{ flexShrink: 0, marginTop: '1px' }} />
                            {r.message}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Benefit amount */}
                    {f.benefit_amount > 0 && (
                      <div style={{ marginTop: '0.3rem', fontSize: '0.68rem', color: 'var(--color-gold,#E5A93C)' }}>
                        Computed benefit: ₹{Number(f.benefit_amount).toLocaleString('en-IN')}
                      </div>
                    )}
                  </div>

                  {/* Actions column */}
                  <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
                    {/* KYC badge */}
                    <span style={{
                      fontSize: '0.65rem', padding: '0.2rem 0.55rem', borderRadius: '999px', fontWeight: 700,
                      background: f.kyc_status === 'verified' ? 'rgba(46,160,67,0.18)' : 'rgba(229,169,60,0.18)',
                      color:      f.kyc_status === 'verified' ? '#3FB950' : 'var(--color-gold,#E5A93C)',
                      border:     `1px solid ${f.kyc_status === 'verified' ? '#2EA043' : 'var(--color-gold,#E5A93C)'}`,
                    }}>
                      {f.kyc_status === 'verified' ? '✓ KYC Verified' : 'KYC Pending'}
                    </span>

                    {/* Application status badge */}
                    {f.application && <StatusBadge status={f.application.status} />}

                    {/* Workflow action buttons (government/admin) */}
                    {f.application && f.application.status === 'SUBMITTED' && (
                      <button
                        onClick={() => handleTransition(f.application.id, 'AUTO_SCREENED')}
                        disabled={isActing}
                        style={{ fontSize: '0.68rem', padding: '0.25rem 0.6rem', borderRadius: '6px', border: '1px solid #58A6FF', background: 'rgba(88,166,255,0.12)', color: '#58A6FF', cursor: 'pointer' }}
                      >
                        {isActing ? '…' : 'Screen'}
                      </button>
                    )}
                    {f.application && f.application.status === 'AUTO_SCREENED' && (() => {
                      const actionState = getActionState(f.application, 'DISTRICT_OFFICER', 'Verify');
                      return (
                        <button
                          type="button"
                          onClick={() => actionState.allowed && handleTransition(f.application.id, 'VERIFIED')}
                          disabled={isActing || !actionState.allowed}
                          title={actionState.tooltip}
                          style={{
                            fontSize: '0.68rem', padding: '0.25rem 0.6rem', borderRadius: '6px',
                            border: !actionState.allowed ? '1px solid var(--border-color)' : '1px solid #2EA043',
                            background: !actionState.allowed ? 'var(--bg-sunken)' : 'rgba(46,160,67,0.12)',
                            color: !actionState.allowed ? 'var(--text-muted)' : '#3FB950',
                            cursor: !actionState.allowed ? 'not-allowed' : 'pointer',
                            opacity: !actionState.allowed || isActing ? 0.6 : 1,
                          }}
                        >
                          {isActing ? '…' : 'Verify'}
                        </button>
                      );
                    })()}
                    {f.application && f.application.status === 'VERIFIED' && (() => {
                      const actionState = getActionState(f.application, 'STATE_APPROVER', 'Approve');
                      return (
                        <button
                          type="button"
                          onClick={() => actionState.allowed && handleTransition(f.application.id, 'APPROVED')}
                          disabled={isActing || !actionState.allowed}
                          title={actionState.tooltip}
                          style={{
                            fontSize: '0.68rem', padding: '0.25rem 0.6rem', borderRadius: '6px',
                            border: !actionState.allowed ? '1px solid var(--border-color)' : '1px solid #BC8CFF',
                            background: !actionState.allowed ? 'var(--bg-sunken)' : 'rgba(188,140,255,0.12)',
                            color: !actionState.allowed ? 'var(--text-muted)' : '#BC8CFF',
                            cursor: !actionState.allowed ? 'not-allowed' : 'pointer',
                            opacity: !actionState.allowed || isActing ? 0.6 : 1,
                          }}
                        >
                          {isActing ? '…' : 'Approve'}
                        </button>
                      );
                    })()}
                    {f.application && f.application.status === 'APPROVED' && (() => {
                      const actionState = getActionState(f.application, 'FINANCE_OFFICER', 'Sanction');
                      return (
                        <button
                          type="button"
                          onClick={() => actionState.allowed && handleTransition(f.application.id, 'SANCTIONED')}
                          disabled={isActing || !actionState.allowed}
                          title={actionState.tooltip}
                          style={{
                            fontSize: '0.68rem', padding: '0.25rem 0.6rem', borderRadius: '6px',
                            border: !actionState.allowed ? '1px solid var(--border-color)' : '1px solid var(--color-gold,#E5A93C)',
                            background: !actionState.allowed ? 'var(--bg-sunken)' : 'rgba(229,169,60,0.12)',
                            color: !actionState.allowed ? 'var(--text-muted)' : 'var(--color-gold,#E5A93C)',
                            cursor: !actionState.allowed ? 'not-allowed' : 'pointer',
                            opacity: !actionState.allowed || isActing ? 0.6 : 1,
                          }}
                        >
                          {isActing ? '…' : 'Sanction'}
                        </button>
                      );
                    })()}

                    {/* Apply button for eligible farmers without application */}
                    {f.eligible && !f.application && (
                      <button
                        onClick={() => handleApply(f)}
                        disabled={isActing}
                        style={{ fontSize: '0.68rem', padding: '0.25rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-sunken)', color: 'var(--text-muted)', cursor: 'pointer' }}
                      >
                        {isActing ? '…' : 'Apply'}
                      </button>
                    )}

                    {/* Disburse DBT button — same look as original, server-driven state */}
                    {f.application?.status === 'DISBURSED' ? (
                      <span style={{
                        fontSize: '0.68rem', color: 'var(--text-muted)', background: 'var(--bg-sunken)',
                        border: '1px solid var(--border-color)', padding: '0.25rem 0.55rem', borderRadius: '6px',
                        fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                      }}>
                        <CheckCircle size={12} /> Subsidy Disbursed
                      </span>
                    ) : (
                      <button
                        type="button"
                        id={`disburse-${f.farmer_id}`}
                        onClick={() => disbState.enabled && handleDisburse(f)}
                        disabled={!disbState.enabled || isActing}
                        title={disbState.enabled ? 'Disburse scheme subsidy' : disbState.reason}
                        style={{
                          background: disbState.enabled ? 'var(--color-gold,#E5A93C)' : 'var(--bg-sunken)',
                          border: `1px solid ${disbState.enabled ? 'var(--color-gold,#E5A93C)' : 'var(--border-color)'}`,
                          color:  disbState.enabled ? '#0D1117' : 'var(--text-muted)',
                          padding: '0.3rem 0.65rem', borderRadius: '6px', fontSize: '0.7rem',
                          fontWeight: 700, cursor: disbState.enabled && !isActing ? 'pointer' : 'not-allowed',
                          fontFamily: 'var(--font-body)',
                          display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                          boxShadow: disbState.enabled ? '0 0 10px rgba(229,169,60,0.25)' : 'none',
                          opacity: isActing ? 0.6 : 1,
                        }}
                      >
                        <Award size={12} />
                        {isActing
                          ? 'Sanctioning…'
                          : disbState.enabled
                            ? `Disburse DBT (₹${Number(f.benefit_amount || 0).toLocaleString('en-IN')})`
                            : disbState.reason}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
        </>
      )}
    </>
  );
}
