// src/components/schemes/SchemeCatalogBrowser.jsx
// Provider-based Government Scheme Catalog browser.
// Displays schemes from the public.scheme_catalog table with search, facets, filtering,
// detail drawer, provider sync status strip, and administrative promotion.
// Adheres strictly to the "Sovereign Harvest" design system.

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, Filter, ExternalLink, RefreshCw, X, ChevronLeft, ChevronRight,
  ShieldCheck, CheckCircle, AlertCircle, FileText, Building2, MapPin,
  Tag, Info, Sparkles, Check, ChevronDown, Award, Plus, ArrowRight,
  Database, Clock, CheckCircle2
} from 'lucide-react';
import { apiGet, apiPost } from '@/services/api';
import LoadingSpinner from '@/components/feedback/LoadingSpinner';
import EmptyState from '@/components/feedback/EmptyState';

const STATUS_BADGES = {
  VERIFIED:   { bg: 'rgba(46,160,67,0.18)',  color: '#3FB950', border: '#2EA043', label: 'Verified' },
  UNVERIFIED: { bg: 'rgba(229,169,60,0.15)', color: '#E5A93C', border: '#E5A93C', label: 'Unverified' },
  ARCHIVED:   { bg: 'rgba(139,148,158,0.15)',color: '#8B949E', border: '#30363D', label: 'Archived' },
};

function CatalogStatusBadge({ status }) {
  const badge = STATUS_BADGES[status] || STATUS_BADGES.UNVERIFIED;
  return (
    <span style={{
      fontSize: '0.62rem',
      padding: '0.18rem 0.5rem',
      borderRadius: '999px',
      fontWeight: 700,
      background: badge.bg,
      color: badge.color,
      border: `1px solid ${badge.border}`,
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.25rem',
      whiteSpace: 'nowrap',
    }}>
      {badge.label}
    </span>
  );
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────
function CatalogDetailDrawer({
  item,
  onClose,
  onPromote,
  onVerify,
  isPromoting,
  isVerifying,
  onSwitchToOperational,
}) {
  if (!item) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      zIndex: 9990,
      display: 'flex',
      justifyContent: 'flex-end',
      backdropFilter: 'blur(3px)',
    }}>
      <div style={{
        background: 'var(--bg-card, #161B22)',
        borderLeft: '1px solid var(--border-color, #30363D)',
        width: '100%',
        maxWidth: '580px',
        height: '100%',
        overflowY: 'auto',
        padding: '1.75rem',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{
                fontSize: '0.65rem',
                fontFamily: 'var(--font-mono, JetBrains Mono)',
                color: 'var(--color-gold, #E5A93C)',
                background: 'var(--bg-sunken, #0D1117)',
                padding: '0.15rem 0.45rem',
                borderRadius: '4px',
                border: '1px solid rgba(229,169,60,0.3)',
              }}>
                {item.level || 'CENTRAL'}
              </span>
              {item.state && (
                <span style={{
                  fontSize: '0.65rem',
                  color: 'var(--text-muted, #8B949E)',
                  background: 'var(--bg-sunken, #0D1117)',
                  padding: '0.15rem 0.45rem',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color, #30363D)',
                }}>
                  {item.state}
                </span>
              )}
              <CatalogStatusBadge status={item.status} />
              {item.promoted_scheme_id && (
                <span style={{
                  fontSize: '0.62rem',
                  padding: '0.18rem 0.5rem',
                  borderRadius: '999px',
                  fontWeight: 700,
                  background: 'rgba(88,166,255,0.15)',
                  color: '#58A6FF',
                  border: '1px solid #58A6FF',
                }}>
                  ⚡ Operational
                </span>
              )}
            </div>
            <h3 style={{
              fontFamily: 'var(--font-heading, Space Grotesk)',
              fontSize: '1.2rem',
              fontWeight: 700,
              color: 'var(--text-primary, #F0F6FC)',
              margin: '0 0 0.35rem 0',
              lineHeight: 1.3,
            }}>
              {item.name}
            </h3>
            {item.ministry && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8B949E)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Building2 size={13} />
                <span>{item.ministry}</span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted, #8B949E)',
              cursor: 'pointer',
              padding: '0.25rem',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Action Toolbar */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
          padding: '0.65rem',
          borderRadius: '8px',
          background: 'var(--bg-sunken, #0D1117)',
          border: '1px solid var(--border-color, #30363D)',
        }}>
          {item.status !== 'VERIFIED' && (
            <button
              onClick={() => onVerify(item)}
              disabled={isVerifying}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid rgba(46,160,67,0.35)',
                background: 'rgba(46,160,67,0.15)',
                color: '#3FB950',
                fontSize: '0.74rem',
                cursor: isVerifying ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontWeight: 600,
              }}
            >
              <CheckCircle size={13} /> {isVerifying ? 'Verifying…' : 'Mark as Verified'}
            </button>
          )}

          {!item.promoted_scheme_id ? (
            <button
              onClick={() => onPromote(item)}
              disabled={isPromoting}
              style={{
                padding: '0.35rem 0.85rem',
                borderRadius: '6px',
                border: '1px solid var(--color-gold, #E5A93C)',
                background: 'var(--color-gold, #E5A93C)',
                color: '#0D1117',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: isPromoting ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <Award size={13} /> {isPromoting ? 'Promoting…' : 'Promote to Operational (DRAFT)'}
            </button>
          ) : (
            <button
              onClick={() => {
                onClose();
                if (onSwitchToOperational) onSwitchToOperational();
              }}
              style={{
                padding: '0.35rem 0.85rem',
                borderRadius: '6px',
                border: '1px solid #58A6FF',
                background: 'rgba(88,166,255,0.15)',
                color: '#58A6FF',
                fontSize: '0.74rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <ArrowRight size={13} /> View in Operational Schemes
            </button>
          )}
        </div>

        {/* Description */}
        <div>
          <h4 style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8B949E)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
            Scheme Overview
          </h4>
          <p style={{
            fontSize: '0.82rem',
            color: 'var(--text-primary, #C9D1D9)',
            lineHeight: 1.6,
            background: 'var(--bg-sunken, #0D1117)',
            padding: '0.85rem',
            borderRadius: '8px',
            border: '1px solid var(--border-color, #30363D)',
            margin: 0,
          }}>
            {item.description || 'No detailed description provided.'}
          </p>
        </div>

        {/* Eligibility Criteria */}
        <div>
          <h4 style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8B949E)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
            Eligibility Criteria
          </h4>
          <div style={{
            background: 'var(--bg-sunken, #0D1117)',
            padding: '0.85rem',
            borderRadius: '8px',
            border: '1px solid var(--border-color, #30363D)',
            fontSize: '0.8rem',
            color: 'var(--text-primary, #C9D1D9)',
            lineHeight: 1.5,
          }}>
            {item.eligibility_criteria ? (
              typeof item.eligibility_criteria === 'object' ? (
                <pre style={{ margin: 0, fontFamily: 'var(--font-mono, JetBrains Mono)', fontSize: '0.72rem', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(item.eligibility_criteria, null, 2)}
                </pre>
              ) : (
                item.eligibility_criteria
              )
            ) : (
              <span style={{ color: 'var(--text-muted, #8B949E)', fontStyle: 'italic' }}>
                Open to eligible agricultural producers and oilseed farmers as per state norms.
              </span>
            )}
          </div>
        </div>

        {/* Benefits & Subsidies */}
        {item.benefits && (
          <div>
            <h4 style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8B949E)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
              Benefits &amp; Assistance
            </h4>
            <div style={{
              background: 'var(--bg-sunken, #0D1117)',
              padding: '0.85rem',
              borderRadius: '8px',
              border: '1px solid var(--border-color, #30363D)',
              fontSize: '0.8rem',
              color: 'var(--color-gold, #E5A93C)',
              lineHeight: 1.5,
            }}>
              {item.benefits}
            </div>
          </div>
        )}

        {/* Documents Required */}
        {item.documents_required && item.documents_required.length > 0 && (
          <div>
            <h4 style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8B949E)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
              Documents Required
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {item.documents_required.map((doc, idx) => (
                <span key={idx} style={{
                  fontSize: '0.7rem',
                  padding: '0.25rem 0.55rem',
                  borderRadius: '4px',
                  background: 'var(--bg-sunken, #0D1117)',
                  border: '1px solid var(--border-color, #30363D)',
                  color: 'var(--text-muted, #8B949E)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}>
                  <FileText size={11} /> {doc}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Official Link */}
        {item.application_url && (
          <div>
            <a
              href={item.application_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.78rem',
                color: 'var(--color-gold, #E5A93C)',
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              <ExternalLink size={13} />
              Visit Official Scheme Portal / Application Link
            </a>
          </div>
        )}

        {/* Source & Provenance Telemetry */}
        <div style={{
          marginTop: 'auto',
          paddingTop: '1rem',
          borderTop: '1px solid var(--border-color, #30363D)',
          fontSize: '0.68rem',
          color: 'var(--text-muted, #8B949E)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.3rem',
        }}>
          <div>Catalog Source: <strong style={{ color: 'var(--text-primary, #F0F6FC)' }}>{item.provider || 'manual'}</strong></div>
          {item.last_synced_at && (
            <div>Last Catalog Sync: {new Date(item.last_synced_at).toLocaleString('en-IN')}</div>
          )}
          {item.last_verified_at && (
            <div>Last Verification: {new Date(item.last_verified_at).toLocaleString('en-IN')}</div>
          )}
          <div style={{ fontFamily: 'var(--font-mono, JetBrains Mono)' }}>Key: {item.external_key || item.id}</div>
        </div>
      </div>
    </div>
  );
}

// ── Create Manual Scheme Modal ────────────────────────────────────────────────
function CreateSchemeModal({ show, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    ministry: '',
    level: 'CENTRAL',
    state: '',
    category: 'Agriculture,Rural & Environment',
    description: '',
    benefits: '',
    application_url: '',
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  if (!show) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setErr('Scheme name is required.');
      return;
    }
    setLoading(true);
    setErr('');
    try {
      const res = await apiPost('/scheme-catalog', form);
      onCreated(res.data);
      onClose();
    } catch (error) {
      setErr(error?.body?.error?.message || error?.message || 'Failed to create scheme.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      zIndex: 9995,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      backdropFilter: 'blur(3px)',
    }}>
      <div style={{
        background: 'var(--bg-card, #161B22)',
        border: '1px solid var(--border-color, #30363D)',
        borderRadius: '12px',
        padding: '1.5rem',
        width: '100%',
        maxWidth: '520px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontFamily: 'var(--font-heading, Space Grotesk)', fontSize: '1.05rem', color: 'var(--text-primary, #F0F6FC)', margin: 0 }}>
            Add Government Scheme to Catalog
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted, #8B949E)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        {err && (
          <div style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(218,54,51,0.15)', color: '#DA3633', fontSize: '0.75rem', marginBottom: '0.85rem' }}>
            {err}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.78rem' }}>
          <div>
            <label style={{ display: 'block', color: 'var(--text-muted, #8B949E)', marginBottom: '0.2rem' }}>Scheme Name *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. National Mission on Edible Oils - Oil Palm"
              style={{
                width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px',
                border: '1px solid var(--border-color, #30363D)', background: 'var(--bg-sunken, #0D1117)',
                color: 'var(--text-primary, #F0F6FC)', fontSize: '0.78rem',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div>
              <label style={{ display: 'block', color: 'var(--text-muted, #8B949E)', marginBottom: '0.2rem' }}>Level</label>
              <select
                value={form.level}
                onChange={(e) => setForm({ ...form, level: e.target.value })}
                style={{
                  width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px',
                  border: '1px solid var(--border-color, #30363D)', background: 'var(--bg-sunken, #0D1117)',
                  color: 'var(--text-primary, #F0F6FC)', fontSize: '0.78rem',
                }}
              >
                <option value="CENTRAL">CENTRAL</option>
                <option value="STATE">STATE</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--text-muted, #8B949E)', marginBottom: '0.2rem' }}>State (if applicable)</label>
              <input
                type="text"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                placeholder="e.g. Madhya Pradesh"
                style={{
                  width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px',
                  border: '1px solid var(--border-color, #30363D)', background: 'var(--bg-sunken, #0D1117)',
                  color: 'var(--text-primary, #F0F6FC)', fontSize: '0.78rem',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', color: 'var(--text-muted, #8B949E)', marginBottom: '0.2rem' }}>Ministry / Department</label>
            <input
              type="text"
              value={form.ministry}
              onChange={(e) => setForm({ ...form, ministry: e.target.value })}
              placeholder="e.g. Ministry of Agriculture and Farmers Welfare"
              style={{
                width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px',
                border: '1px solid var(--border-color, #30363D)', background: 'var(--bg-sunken, #0D1117)',
                color: 'var(--text-primary, #F0F6FC)', fontSize: '0.78rem',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', color: 'var(--text-muted, #8B949E)', marginBottom: '0.2rem' }}>Brief Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Outline scheme objectives, target oilseed crops, and subsidy coverage..."
              style={{
                width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px',
                border: '1px solid var(--border-color, #30363D)', background: 'var(--bg-sunken, #0D1117)',
                color: 'var(--text-primary, #F0F6FC)', fontSize: '0.78rem',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', color: 'var(--text-muted, #8B949E)', marginBottom: '0.2rem' }}>Benefits &amp; Subsidies</label>
            <input
              type="text"
              value={form.benefits}
              onChange={(e) => setForm({ ...form, benefits: e.target.value })}
              placeholder="e.g. ₹4,000/ha planting subsidy, DBT support"
              style={{
                width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px',
                border: '1px solid var(--border-color, #30363D)', background: 'var(--bg-sunken, #0D1117)',
                color: 'var(--text-primary, #F0F6FC)', fontSize: '0.78rem',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', color: 'var(--text-muted, #8B949E)', marginBottom: '0.2rem' }}>Official Portal URL</label>
            <input
              type="url"
              value={form.application_url}
              onChange={(e) => setForm({ ...form, application_url: e.target.value })}
              placeholder="https://..."
              style={{
                width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px',
                border: '1px solid var(--border-color, #30363D)', background: 'var(--bg-sunken, #0D1117)',
                color: 'var(--text-primary, #F0F6FC)', fontSize: '0.78rem',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '0.4rem 0.85rem', borderRadius: '6px', border: '1px solid var(--border-color, #30363D)',
                background: 'transparent', color: 'var(--text-muted, #8B949E)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '0.4rem 1rem', borderRadius: '6px', border: '1px solid var(--color-gold, #E5A93C)',
                background: 'var(--color-gold, #E5A93C)', color: '#0D1117', fontWeight: 700, cursor: 'pointer',
              }}
            >
              {loading ? 'Adding…' : 'Add to Catalog'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Catalog Browser Component ───────────────────────────────────────────
export default function SchemeCatalogBrowser({ onSwitchToOperational }) {
  const [items, setItems]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(1);
  const [totalPages, setTotalPages]     = useState(1);
  const [facets, setFacets]             = useState({ categories: [], levels: [], states: [], statuses: [] });
  
  // Sync Status
  const [syncStatus, setSyncStatus]     = useState(null);
  const [syncing, setSyncing]           = useState(false);
  const [feedbackMsg, setFeedbackMsg]   = useState({ type: '', text: '' });

  // Filters
  const [searchQuery, setSearchQuery]   = useState('');
  const [category, setCategory]         = useState('');
  const [level, setLevel]               = useState('');
  const [stateFilter, setStateFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [farmerOnly, setFarmerOnly]     = useState(true);

  // Inspector & Actions
  const [selectedItem, setSelectedItem] = useState(null);
  const [isPromoting, setIsPromoting]   = useState(false);
  const [isVerifying, setIsVerifying]   = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Fetch sync telemetry
  const fetchSyncStatus = useCallback(async () => {
    try {
      const res = await apiGet('/scheme-catalog/sync/status');
      setSyncStatus(res);
    } catch (_) {
      // non-fatal
    }
  }, []);

  // Fetch catalog items
  const fetchCatalog = useCallback(async (p = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: p,
        pageSize: 12,
        farmerOnly: farmerOnly ? 'true' : 'false',
      };
      if (searchQuery.trim()) params.q = searchQuery.trim();
      if (category)           params.category = category;
      if (level)              params.level = level;
      if (stateFilter)        params.state = stateFilter;
      if (statusFilter)       params.status = statusFilter;

      const res = await apiGet('/scheme-catalog', params);
      setItems(res.data || []);
      setTotal(res.total || 0);
      setPage(res.page || 1);
      setTotalPages(res.totalPages || 1);
      if (res.facets) setFacets(res.facets);
    } catch (err) {
      console.error('[SchemeCatalogBrowser] Error:', err);
      setError(err?.body?.error?.message || err?.message || 'Failed to load government scheme catalog.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, category, level, stateFilter, statusFilter, farmerOnly]);

  useEffect(() => {
    fetchCatalog(1);
    fetchSyncStatus();
  }, [fetchCatalog, fetchSyncStatus]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchCatalog(newPage);
    }
  };

  // Trigger manual sync
  const handleSyncNow = async () => {
    setSyncing(true);
    setFeedbackMsg({ type: '', text: '' });
    try {
      const res = await apiPost('/scheme-catalog/sync');
      setFeedbackMsg({
        type: 'success',
        text: `Catalog synchronized successfully. ${res.summary?.totalUpserted || 0} schemes updated.`,
      });
      await Promise.all([fetchCatalog(page), fetchSyncStatus()]);
    } catch (e) {
      setFeedbackMsg({
        type: 'error',
        text: e?.body?.error?.message || e?.message || 'Catalog sync failed.',
      });
    } finally {
      setSyncing(false);
    }
  };

  // Verify scheme
  const handleVerifyScheme = async (scheme) => {
    setIsVerifying(true);
    try {
      const res = await apiPost(`/scheme-catalog/${scheme.id}/verify`);
      setSelectedItem(res.data);
      setFeedbackMsg({ type: 'success', text: `Scheme "${scheme.name}" verified successfully.` });
      fetchCatalog(page);
    } catch (e) {
      setFeedbackMsg({ type: 'error', text: e?.body?.error?.message || e?.message || 'Verification failed.' });
    } finally {
      setIsVerifying(false);
    }
  };

  // Promote scheme to operational DRAFT
  const handlePromoteScheme = async (scheme) => {
    setIsPromoting(true);
    try {
      const res = await apiPost(`/scheme-catalog/${scheme.id}/promote`);
      setSelectedItem((prev) => prev ? { ...prev, promoted_scheme_id: res.data?.id } : null);
      setFeedbackMsg({
        type: 'success',
        text: `Scheme "${scheme.name}" promoted to operational DRAFT (Code: ${res.data?.code}).`,
      });
      fetchCatalog(page);
    } catch (e) {
      setFeedbackMsg({ type: 'error', text: e?.body?.error?.message || e?.message || 'Promotion failed.' });
    } finally {
      setIsPromoting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* ── Feedback Message Banner ── */}
      {feedbackMsg.text && (
        <div style={{
          padding: '0.65rem 0.95rem',
          borderRadius: '6px',
          fontSize: '0.8rem',
          background: feedbackMsg.type === 'success' ? 'rgba(46,160,67,0.15)' : 'rgba(218,54,51,0.15)',
          color: feedbackMsg.type === 'success' ? '#3FB950' : '#DA3633',
          border: `1px solid ${feedbackMsg.type === 'success' ? 'rgba(46,160,67,0.35)' : 'rgba(218,54,51,0.35)'}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>{feedbackMsg.text}</span>
          <button onClick={() => setFeedbackMsg({ type: '', text: '' })} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Official Disclaimer & Sync Strip ── */}
      <div style={{
        padding: '0.85rem 1rem',
        borderRadius: '8px',
        background: 'rgba(229,169,60,0.06)',
        border: '1px solid rgba(229,169,60,0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <ShieldCheck size={18} style={{ color: 'var(--color-gold, #E5A93C)', flexShrink: 0 }} />
          <div style={{ fontSize: '0.78rem', color: 'var(--text-primary, #C9D1D9)', lineHeight: 1.4 }}>
            <strong style={{ color: 'var(--color-gold, #E5A93C)' }}>Official Government Scheme Catalog</strong>
            <span style={{ display: 'block', color: 'var(--text-muted, #8B949E)', fontSize: '0.72rem' }}>
              Central &amp; State oilseed schemes repository. Ready for live API Setu adapter integration.
            </span>
          </div>
        </div>

        {/* Sync Telemetry */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.68rem',
            color: 'var(--text-muted, #8B949E)',
            background: 'var(--bg-sunken, #0D1117)',
            padding: '0.25rem 0.55rem',
            borderRadius: '4px',
            border: '1px solid var(--border-color, #30363D)',
          }}>
            <Database size={11} style={{ color: 'var(--color-gold, #E5A93C)' }} />
            <span>Provider: <strong style={{ color: 'var(--text-primary, #F0F6FC)' }}>{syncStatus?.provider || 'manual'}</strong></span>
          </div>

          <button
            onClick={handleSyncNow}
            disabled={syncing}
            style={{
              background: 'none',
              border: '1px solid var(--border-color, #30363D)',
              borderRadius: '6px',
              color: 'var(--text-muted, #8B949E)',
              cursor: syncing ? 'wait' : 'pointer',
              padding: '0.35rem 0.65rem',
              fontSize: '0.72rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing…' : 'Sync Catalog'}
          </button>
        </div>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search bar */}
          <div style={{
            position: 'relative',
            flex: '1 1 240px',
            minWidth: '200px',
          }}>
            <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted, #8B949E)' }} />
            <input
              type="text"
              placeholder="Search scheme name, ministry, or keywords…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 0.75rem 0.45rem 2.2rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #30363D)',
                background: 'var(--bg-sunken, #0D1117)',
                color: 'var(--text-primary, #F0F6FC)',
                fontSize: '0.78rem',
                outline: 'none',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '0.65rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted, #8B949E)',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Category Dropdown */}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              padding: '0.45rem 0.65rem',
              borderRadius: '6px',
              border: '1px solid var(--border-color, #30363D)',
              background: 'var(--bg-sunken, #0D1117)',
              color: 'var(--text-primary, #F0F6FC)',
              fontSize: '0.75rem',
              outline: 'none',
            }}
          >
            <option value="">All Categories</option>
            {facets.categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Level Dropdown */}
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            style={{
              padding: '0.45rem 0.65rem',
              borderRadius: '6px',
              border: '1px solid var(--border-color, #30363D)',
              background: 'var(--bg-sunken, #0D1117)',
              color: 'var(--text-primary, #F0F6FC)',
              fontSize: '0.75rem',
              outline: 'none',
            }}
          >
            <option value="">All Levels</option>
            <option value="CENTRAL">Central Schemes</option>
            <option value="STATE">State Schemes</option>
          </select>

          {/* State Dropdown */}
          {facets.states.length > 0 && (
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              style={{
                padding: '0.45rem 0.65rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #30363D)',
                background: 'var(--bg-sunken, #0D1117)',
                color: 'var(--text-primary, #F0F6FC)',
                fontSize: '0.75rem',
                outline: 'none',
              }}
            >
              <option value="">All States</option>
              {facets.states.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          )}

          {/* Status Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '0.45rem 0.65rem',
              borderRadius: '6px',
              border: '1px solid var(--border-color, #30363D)',
              background: 'var(--bg-sunken, #0D1117)',
              color: 'var(--text-primary, #F0F6FC)',
              fontSize: '0.75rem',
              outline: 'none',
            }}
          >
            <option value="">All Statuses</option>
            <option value="VERIFIED">Verified</option>
            <option value="UNVERIFIED">Unverified</option>
            <option value="ARCHIVED">Archived</option>
          </select>

          {/* Farmer-relevant toggle */}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.74rem',
            color: 'var(--text-primary, #C9D1D9)',
            cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={farmerOnly}
              onChange={(e) => setFarmerOnly(e.target.checked)}
              style={{ accentColor: 'var(--color-gold, #E5A93C)', cursor: 'pointer' }}
            />
            <span>Farmer-Relevant Only</span>
          </label>

          {/* Add Scheme button */}
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              marginLeft: 'auto',
              padding: '0.45rem 0.85rem',
              borderRadius: '6px',
              border: '1px solid var(--border-color, #30363D)',
              background: 'var(--bg-sunken, #0D1117)',
              color: 'var(--text-primary, #F0F6FC)',
              fontSize: '0.74rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <Plus size={13} /> Add Scheme
          </button>
        </div>

        {/* Results summary counter */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: 'var(--text-muted, #8B949E)' }}>
          <span>Found <strong>{total}</strong> government schemes</span>
          {(searchQuery || category || level || stateFilter || statusFilter || !farmerOnly) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setCategory('');
                setLevel('');
                setStateFilter('');
                setStatusFilter('');
                setFarmerOnly(true);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-gold, #E5A93C)',
                cursor: 'pointer',
                fontSize: '0.72rem',
                textDecoration: 'underline',
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* ── Scheme Grid ── */}
      {loading ? (
        <LoadingSpinner label="Loading government schemes catalog…" />
      ) : error ? (
        <div style={{
          padding: '1rem',
          borderRadius: '8px',
          background: 'rgba(218,54,51,0.15)',
          color: '#DA3633',
          border: '1px solid rgba(218,54,51,0.35)',
          fontSize: '0.82rem',
        }}>
          {error}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No schemes matched your search"
          message="Try broadening your search query or unchecking 'Farmer-Relevant Only'."
        />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '1rem',
        }}>
          {items.map((scheme) => (
            <div
              key={scheme.id}
              className="card"
              style={{
                padding: '1.15rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.2s ease',
                position: 'relative',
              }}
            >
              <div>
                {/* Card Top Badges */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', gap: '0.35rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '0.62rem',
                      fontFamily: 'var(--font-mono, JetBrains Mono)',
                      background: 'var(--bg-sunken, #0D1117)',
                      color: 'var(--color-gold, #E5A93C)',
                      padding: '0.15rem 0.45rem',
                      borderRadius: '4px',
                      border: '1px solid rgba(229,169,60,0.25)',
                    }}>
                      {scheme.level || 'CENTRAL'}
                    </span>
                    {scheme.category && (
                      <span style={{
                        fontSize: '0.62rem',
                        background: 'var(--bg-sunken, #0D1117)',
                        color: 'var(--text-muted, #8B949E)',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color, #30363D)',
                      }}>
                        {scheme.category}
                      </span>
                    )}
                  </div>
                  <CatalogStatusBadge status={scheme.status} />
                </div>

                {/* Name */}
                <h4 style={{
                  fontFamily: 'var(--font-heading, Space Grotesk)',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  color: 'var(--text-primary, #F0F6FC)',
                  margin: '0 0 0.35rem 0',
                  lineHeight: 1.35,
                }}>
                  {scheme.name}
                </h4>

                {/* Ministry */}
                {scheme.ministry && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted, #8B949E)', marginBottom: '0.65rem' }}>
                    {scheme.ministry}
                  </div>
                )}

                {/* Description snippet */}
                <p style={{
                  fontSize: '0.74rem',
                  color: 'var(--text-muted, #8B949E)',
                  lineHeight: 1.5,
                  marginBottom: '0.85rem',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>
                  {scheme.description || 'Government assistance and subsidy scheme for agricultural development.'}
                </p>
              </div>

              {/* Card Footer */}
              <div>
                {/* Meta tags */}
                <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                  {scheme.is_farmer_relevant && (
                    <span style={{
                      fontSize: '0.6rem',
                      padding: '0.12rem 0.4rem',
                      borderRadius: '3px',
                      background: 'rgba(46,160,67,0.1)',
                      color: '#3FB950',
                      border: '1px solid rgba(46,160,67,0.25)',
                    }}>
                      🌾 Farmer Relevant
                    </span>
                  )}
                  {scheme.promoted_scheme_id && (
                    <span style={{
                      fontSize: '0.6rem',
                      padding: '0.12rem 0.4rem',
                      borderRadius: '3px',
                      background: 'rgba(88,166,255,0.1)',
                      color: '#58A6FF',
                      border: '1px solid rgba(88,166,255,0.25)',
                    }}>
                      ⚡ Operational
                    </span>
                  )}
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid var(--border-color, #30363D)', paddingTop: '0.65rem' }}>
                  <button
                    onClick={() => setSelectedItem(scheme)}
                    style={{
                      flex: 1,
                      padding: '0.35rem 0.65rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color, #30363D)',
                      background: 'var(--bg-sunken, #0D1117)',
                      color: 'var(--text-primary, #F0F6FC)',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                  >
                    View Details
                  </button>
                  {scheme.application_url && (
                    <a
                      href={scheme.application_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Visit official portal"
                      style={{
                        padding: '0.35rem 0.55rem',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color, #30363D)',
                        background: 'var(--bg-sunken, #0D1117)',
                        color: 'var(--text-muted, #8B949E)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textDecoration: 'none',
                      }}
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.75rem 0',
          borderTop: '1px solid var(--border-color, #30363D)',
          fontSize: '0.75rem',
          color: 'var(--text-muted, #8B949E)',
        }}>
          <div>
            Page <strong>{page}</strong> of <strong>{totalPages}</strong> ({total} total schemes)
          </div>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.3rem 0.6rem',
                borderRadius: '4px',
                border: '1px solid var(--border-color, #30363D)',
                background: 'var(--bg-card, #161B22)',
                color: page <= 1 ? 'var(--text-muted, #484F58)' : 'var(--text-primary, #F0F6FC)',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                fontSize: '0.72rem',
              }}
            >
              <ChevronLeft size={13} /> Prev
            </button>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.3rem 0.6rem',
                borderRadius: '4px',
                border: '1px solid var(--border-color, #30363D)',
                background: 'var(--bg-card, #161B22)',
                color: page >= totalPages ? 'var(--text-muted, #484F58)' : 'var(--text-primary, #F0F6FC)',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                fontSize: '0.72rem',
              }}
            >
              Next <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* ── Detail Drawer ── */}
      {selectedItem && (
        <CatalogDetailDrawer
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onPromote={handlePromoteScheme}
          onVerify={handleVerifyScheme}
          isPromoting={isPromoting}
          isVerifying={isVerifying}
          onSwitchToOperational={onSwitchToOperational}
        />
      )}

      {/* ── Add Manual Scheme Modal ── */}
      <CreateSchemeModal
        show={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={(newScheme) => {
          setFeedbackMsg({ type: 'success', text: `Scheme "${newScheme.name}" added to catalog.` });
          fetchCatalog(1);
        }}
      />
    </div>
  );
}
