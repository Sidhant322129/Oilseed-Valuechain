// src/components/admin/BidMonitor.jsx
// Sovereign Harvest — Admin Procurement Bidding Monitor & Market Governance
// Complete production-grade control center for real-time bid oversight, anomaly resolution,
// and administrative enforcement (Freeze, Force Close, Void Quote, Suspend FPO).

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShieldAlert, Radio, AlertTriangle, CheckCircle2, XCircle, Pause, Play,
  RefreshCw, Filter, Download, ArrowUpRight, ArrowDownRight, Clock, Eye,
  Lock, Unlock, Ban, AlertOctagon, FileText, ChevronRight, X, UserCheck,
  Search, TrendingUp, BarChart3, Activity, ShieldCheck, HelpCircle
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend
} from 'recharts';
import { apiGet, apiPost, apiPatch, apiDownloadBlob } from '@/services/api';
import { supabase } from '@/lib/supabaseClient';
import { getErrorMessage } from '@/utils/getErrorMessage';

// ── Official CCEA Benchmark Rates (RMS/KMS 2026-27) ──────────────────────────
const CCEA_MSP = {
  mustard:   { name: 'Mustard (Rapeseed)',  msp: 62.50 },
  soybean:   { name: 'Soybean (Yellow)',    msp: 51.80 },
  groundnut: { name: 'Groundnut (in shell)',msp: 71.50 },
  sunflower: { name: 'Sunflower Seed',      msp: 76.00 },
  sesame:    { name: 'Sesame (Til)',        msp: 92.00 },
  safflower: { name: 'Safflower (Kusum)',   msp: 61.50 },
};

function formatInr(val) {
  if (val === null || val === undefined || isNaN(val)) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(val);
}

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getCountdown(deadlineStr) {
  if (!deadlineStr) return { text: 'No deadline', isUrgent: false, isExpired: false };
  const diff = new Date(deadlineStr).getTime() - Date.now();
  if (diff <= 0) return { text: 'Expired', isUrgent: true, isExpired: true };
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return { text: `${hours}h left`, isUrgent: true, isExpired: false };
  const days = Math.floor(hours / 24);
  return { text: `${days}d ${hours % 24}h left`, isUrgent: false, isExpired: false };
}

// ── Status Pill Styles ────────────────────────────────────────────────────────
const STATUS_STYLES = {
  open:         { bg: 'rgba(46, 160, 67, 0.15)',  border: '#2EA043', color: '#2EA043', label: 'Open' },
  frozen:       { bg: 'rgba(218, 54, 51, 0.15)',  border: '#DA3633', color: '#DA3633', label: 'Frozen' },
  fulfilled:    { bg: 'rgba(56, 139, 253, 0.15)', border: '#388BFD', color: '#388BFD', label: 'Fulfilled' },
  cancelled:    { bg: 'rgba(110, 118, 129, 0.2)', border: '#6E7681', color: '#8B949E', label: 'Cancelled' },
  force_closed: { bg: 'rgba(240, 136, 62, 0.15)', border: '#F0883E', color: '#F0883E', label: 'Force Closed' },
};

const SEVERITY_STYLES = {
  high:   { bg: 'rgba(218, 54, 51, 0.2)',  color: '#DA3633', border: '#DA3633', label: 'HIGH RISK' },
  medium: { bg: 'rgba(229, 169, 60, 0.2)', color: '#E5A93C', border: '#E5A93C', label: 'MEDIUM' },
  low:    { bg: 'rgba(56, 139, 253, 0.2)', color: '#58A6FF', border: '#388BFD', label: 'LOW' },
};

export default function BidMonitor({ onHighFlagCountChange }) {
  const [activeTab, setActiveTab] = useState('bids'); // bids | flags | analytics | audit
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bannerMsg, setBannerMsg] = useState(null);

  // Live feed states
  const [liveEvents, setLiveEvents] = useState([]);
  const [liveStreamActive, setLiveStreamActive] = useState(true);
  const realtimeChannelRef = useRef(null);

  // Bids tab state
  const [bids, setBids] = useState([]);
  const [bidsLoading, setBidsLoading] = useState(false);
  const [bidSearch, setBidSearch] = useState('');
  const [bidStatusFilter, setBidStatusFilter] = useState('all');
  const [bidCropFilter, setBidCropFilter] = useState('all');
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  // Detail Drawer state
  const [selectedBidId, setSelectedBidId] = useState(null);
  const [drawerData, setDrawerData] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Flags tab state
  const [flags, setFlags] = useState([]);
  const [flagsLoading, setFlagsLoading] = useState(false);
  const [flagSeverityFilter, setFlagSeverityFilter] = useState('all');
  const [flagStatusFilter, setFlagStatusFilter] = useState('open');

  // Audit log tab state
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditActionFilter, setAuditActionFilter] = useState('all');
  const [auditRoleFilter, setAuditRoleFilter] = useState('all');
  const [auditSearch, setAuditSearch] = useState('');

  // Analytics tab state
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // ── Auction Control Room state ──────────────────────────────────────────
  const [auctionLots, setAuctionLots] = useState([]);
  const [auctionLotsLoading, setAuctionLotsLoading] = useState(false);
  const [auctionKpi, setAuctionKpi] = useState({ live: 0, closingSoon: 0, bidsPerMin: 0, liveValue: 0, avgPremium: 0, sellThrough: 0, openFlags: 0 });
  const [selectedLotId, setSelectedLotId] = useState(null);
  const [selectedLot, setSelectedLot] = useState(null);
  const [lotControlLoading, setLotControlLoading] = useState(false);
  const [auctionActionModal, setAuctionActionModal] = useState({ isOpen: false, actionType: '', lotId: '', reason: '', submitting: false });
  const [auctionActionMsg, setAuctionActionMsg] = useState(null);

  // Reason Confirmation Modal state
  const [actionModal, setActionModal] = useState({
    isOpen: false,
    actionType: '', // freeze | unfreeze | force_close | void_quote | suspend_fpo | reinstate_fpo | action_flag
    targetId: null,
    targetTitle: '',
    reason: '',
    reviewNote: '',
    submitting: false,
  });

  // ── Load Overview KPIs ───────────────────────────────────────────────────────
  const fetchAuctionLots = useCallback(async () => {
    setAuctionLotsLoading(true);
    try {
      const res = await apiGet('/auction/lots', { params: { status: 'all', limit: 50 } }).catch(() => null);
      const lots = res?.lots || [];
      setAuctionLots(lots);

      const now = new Date();
      let live = 0;
      let closingSoon = 0;
      let liveValue = 0;
      let totalPremium = 0;
      let premiumCount = 0;
      let soldCount = 0;
      let totalFinished = 0;

      lots.forEach(l => {
        const curPrice = Number(l.current_high_bid || l.start_price_per_kg || 0);
        const qty = Number(l.qty_kg || 0);

        if (l.status === 'live' || l.status === 'closing') {
          live++;
          liveValue += curPrice * qty;
          const ends = new Date(l.ends_at);
          if (l.status === 'closing' || (ends - now) < 60 * 60 * 1000) {
            closingSoon++;
          }
          if (l.premium_over_msp_pct) {
            totalPremium += Number(l.premium_over_msp_pct);
            premiumCount++;
          }
        } else if (l.status === 'sold') {
          soldCount++;
          totalFinished++;
        } else if (l.status === 'unsold') {
          totalFinished++;
        }
      });

      const avgPrem = premiumCount > 0 ? (totalPremium / premiumCount).toFixed(1) : '0.0';
      const sellThrough = totalFinished > 0 ? Math.round((soldCount / totalFinished) * 100) : 100;

      setAuctionKpi(prev => ({
        ...prev,
        live,
        closingSoon,
        liveValue,
        avgPremium: avgPrem,
        sellThrough,
      }));
    } catch (err) {
      console.warn('[BidMonitor] Auction lots fetch failed:', err.message);
    } finally {
      setAuctionLotsLoading(false);
    }
  }, []);

  // Fetch single lot details when selected
  useEffect(() => {
    if (!selectedLotId) {
      setSelectedLot(null);
      return;
    }
    let cancelled = false;
    async function loadLot() {
      setLotControlLoading(true);
      try {
        const res = await apiGet(`/auction/lots/${selectedLotId}`).catch(() => null);
        if (!cancelled && res?.lot) {
          setSelectedLot(res.lot);
        } else if (!cancelled) {
          const fallback = auctionLots.find(x => x.id === selectedLotId);
          setSelectedLot(fallback || null);
        }
      } catch (err) {
        if (!cancelled) {
          const fallback = auctionLots.find(x => x.id === selectedLotId);
          setSelectedLot(fallback || null);
        }
      } finally {
        if (!cancelled) setLotControlLoading(false);
      }
    }
    loadLot();
    return () => { cancelled = true; };
  }, [selectedLotId, auctionLots]);

  // Execute admin auction action
  const executeAuctionAction = useCallback(async () => {
    const { actionType, lotId, reason } = auctionActionModal;
    if (!reason?.trim()) {
      setAuctionActionMsg({ type: 'error', text: 'Administrative reason is required.' });
      return;
    }
    setAuctionActionModal(p => ({ ...p, submitting: true }));
    try {
      let endpoint = '';
      let payload = { reason: reason.trim() };
      if (actionType === 'freeze') endpoint = `/auction/lots/${lotId}/freeze`;
      else if (actionType === 'unfreeze') endpoint = `/auction/lots/${lotId}/unfreeze`;
      else if (actionType === 'extend') {
        endpoint = `/auction/lots/${lotId}/extend`;
        payload.minutes = 30;
      } else if (actionType === 'force_close') endpoint = `/auction/lots/${lotId}/force-close`;

      const res = await apiPost(endpoint, payload);
      setAuctionActionMsg({ type: 'success', text: res?.message || `Successfully executed ${actionType} on lot.` });
      setAuctionActionModal({ isOpen: false, actionType: '', lotId: '', reason: '', submitting: false });
      await fetchAuctionLots();
    } catch (err) {
      setAuctionActionMsg({ type: 'error', text: getErrorMessage(err) });
      setAuctionActionModal(p => ({ ...p, submitting: false }));
    }
  }, [auctionActionModal, fetchAuctionLots]);

  // Periodic poll for auction control room
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAuctionLots();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchAuctionLots]);

  // ── Load Overview KPIs ───────────────────────────────────────────────────────
  const fetchOverview = useCallback(async () => {
    try {
      const res = await apiGet('/admin/procurement/overview');
      if (res?.kpis) {
        setOverview(res);
      }
    } catch (err) {
      console.warn('[BidMonitor] Overview fetch failed:', err.message);
    }
  }, []);

  // ── Fetch Bids ──────────────────────────────────────────────────────────────
  const fetchBids = useCallback(async () => {
    setBidsLoading(true);
    try {
      const params = {};
      if (bidStatusFilter !== 'all') params.status = bidStatusFilter;
      if (bidCropFilter !== 'all') params.crop_type = bidCropFilter;

      const res = await apiGet('/admin/procurement/bids', { params }).catch(() => null);
      if (res?.bids) {
        setBids(res.bids);
      } else {
        // Fallback to legacy procurement-bids endpoint
        const fallback = await apiGet('/admin/procurement-bids').catch(() => null);
        setBids(fallback?.bids || []);
      }
    } catch (err) {
      setBannerMsg({ type: 'error', text: getErrorMessage(err) });
    } finally {
      setBidsLoading(false);
    }
  }, [bidStatusFilter, bidCropFilter]);

  // ── Fetch Flags ─────────────────────────────────────────────────────────────
  const fetchFlags = useCallback(async () => {
    setFlagsLoading(true);
    try {
      const params = {};
      if (flagSeverityFilter !== 'all') params.severity = flagSeverityFilter;
      if (flagStatusFilter !== 'all') params.status = flagStatusFilter;

      const res = await apiGet('/admin/procurement/flags', { params }).catch(() => null);
      const flagList = res?.flags || [];
      setFlags(flagList);

      // Report open high-risk flag count to parent/sidebar
      const highOpen = flagList.filter(f => f.severity === 'high' && f.status === 'open').length;
      if (onHighFlagCountChange) onHighFlagCountChange(highOpen);
    } catch (err) {
      console.warn('[BidMonitor] Flags fetch failed:', err.message);
    } finally {
      setFlagsLoading(false);
    }
  }, [flagSeverityFilter, flagStatusFilter, onHighFlagCountChange]);

  // ── Fetch Audit Log ─────────────────────────────────────────────────────────
  const fetchAuditLog = useCallback(async () => {
    setAuditLoading(true);
    try {
      const params = {};
      if (auditActionFilter !== 'all') params.action = auditActionFilter;
      if (auditRoleFilter !== 'all') params.actor_role = auditRoleFilter;
      if (auditSearch.trim()) params.bid_id = auditSearch.trim();

      const res = await apiGet('/admin/procurement/audit-log', { params }).catch(() => null);
      setAuditLogs(res?.audit_logs || []);
    } catch (err) {
      console.warn('[BidMonitor] Audit log fetch failed:', err.message);
    } finally {
      setAuditLoading(false);
    }
  }, [auditActionFilter, auditRoleFilter, auditSearch]);

  // ── Fetch Analytics ─────────────────────────────────────────────────────────
  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const res = await apiGet('/admin/procurement/analytics').catch(() => null);
      if (res?.analytics) {
        setAnalyticsData(res.analytics);
      }
    } catch (err) {
      console.warn('[BidMonitor] Analytics fetch failed:', err.message);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  // ── Fetch Detail Drawer Data ────────────────────────────────────────────────
  const openBidDrawer = useCallback(async (bidId) => {
    setSelectedBidId(bidId);
    setDrawerLoading(true);
    try {
      const res = await apiGet(`/admin/procurement/bids/${bidId}`).catch(() => null);
      if (res?.bid) {
        setDrawerData(res);
      } else {
        // Find existing bid in state as baseline
        const b = bids.find(x => x.id === bidId);
        setDrawerData({ bid: b, quotes: [], audit_trail: [], flags: [] });
      }
    } catch (err) {
      console.error('[BidMonitor] Bid detail fetch error:', err.message);
    } finally {
      setDrawerLoading(false);
    }
  }, [bids]);

  // ── Initial Boot ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function boot() {
      setLoading(true);
      await Promise.all([fetchOverview(), fetchBids(), fetchFlags(), fetchAuctionLots()]);
      setLoading(false);
    }
    boot();
  }, [fetchOverview, fetchBids, fetchFlags, fetchAuctionLots]);

  // ── Tab Switch Data Trigger ─────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'bids') fetchBids();
    if (activeTab === 'flags') fetchFlags();
    if (activeTab === 'audit') fetchAuditLog();
    if (activeTab === 'analytics') fetchAnalytics();
  }, [activeTab, fetchBids, fetchFlags, fetchAuditLog, fetchAnalytics]);

  // ── Supabase Realtime & Polling Fallback ────────────────────────────────────
  useEffect(() => {
    let pollInterval = null;

    // 1. Supabase Realtime Channel
    try {
      const channel = supabase
        .channel('bid_monitor_events')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'bid_audit_log' },
          (payload) => {
            if (!liveStreamActive) return;
            const newEvent = {
              id: payload.new.id || `evt-${Date.now()}`,
              bid_id: payload.new.bid_id,
              action: payload.new.action,
              actor_role: payload.new.actor_role,
              reason: payload.new.reason,
              created_at: payload.new.created_at,
            };
            setLiveEvents(prev => [newEvent, ...prev.slice(0, 49)]);
            fetchOverview();
          }
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'bid_flags' },
          (payload) => {
            if (!liveStreamActive) return;
            const flagEvent = {
              id: payload.new.id || `flg-${Date.now()}`,
              bid_id: payload.new.bid_id,
              action: 'anomaly_detected',
              actor_role: 'system',
              reason: `[${payload.new.severity?.toUpperCase()}] ${payload.new.flag_type}`,
              created_at: payload.new.created_at,
            };
            setLiveEvents(prev => [flagEvent, ...prev.slice(0, 49)]);
            fetchFlags();
            fetchOverview();
          }
        )
        .subscribe();

      realtimeChannelRef.current = channel;
    } catch (e) {
      console.warn('[BidMonitor] Supabase realtime failed, relying on interval:', e);
    }

    // 2. Polling Fallback every 8 seconds
    pollInterval = setInterval(async () => {
      if (!liveStreamActive) return;
      try {
        const res = await apiGet('/admin/procurement/audit-log', { params: { limit: 10 } }).catch(() => null);
        if (res?.audit_logs && Array.isArray(res.audit_logs)) {
          setLiveEvents(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newItems = res.audit_logs.filter(item => !existingIds.has(item.id));
            if (newItems.length > 0) {
              return [...newItems, ...prev].slice(0, 50);
            }
            return prev;
          });
        }
      } catch (_) {}
    }, 8000);

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
      }
    };
  }, [liveStreamActive, fetchOverview, fetchFlags]);

  // ── Admin Mutation Handler ──────────────────────────────────────────────────
  const handleExecuteAction = async () => {
    const { actionType, targetId, reason, reviewNote } = actionModal;
    if (!reason?.trim() && actionType !== 'action_flag') {
      setBannerMsg({ type: 'error', text: 'A detailed administrative reason is strictly mandatory.' });
      return;
    }

    setActionModal(prev => ({ ...prev, submitting: true }));
    setBannerMsg(null);

    try {
      let res;
      if (actionType === 'freeze') {
        res = await apiPost(`/admin/procurement/bids/${targetId}/freeze`, { reason });
      } else if (actionType === 'unfreeze') {
        res = await apiPost(`/admin/procurement/bids/${targetId}/unfreeze`, { reason });
      } else if (actionType === 'force_close') {
        res = await apiPost(`/admin/procurement/bids/${targetId}/force-close`, { reason });
      } else if (actionType === 'void_quote') {
        res = await apiPost(`/admin/procurement/quotes/${targetId}/void`, { reason });
      } else if (actionType === 'suspend_fpo') {
        res = await apiPost(`/admin/procurement/fpos/${targetId}/suspend`, { reason });
      } else if (actionType === 'reinstate_fpo') {
        res = await apiPost(`/admin/procurement/fpos/${targetId}/reinstate`, { reason });
      } else if (actionType === 'action_flag') {
        res = await apiPatch(`/admin/procurement/flags/${targetId}`, {
          status: 'actioned',
          review_note: reviewNote || reason,
        });
      }

      setBannerMsg({
        type: 'success',
        text: res?.message || `Administrative action "${actionType.replace('_', ' ')}" executed successfully.`,
      });

      // Close modal & refresh affected panels
      setActionModal({
        isOpen: false, actionType: '', targetId: null, targetTitle: '',
        reason: '', reviewNote: '', submitting: false,
      });

      // Refresh data
      fetchOverview();
      fetchBids();
      fetchFlags();
      if (selectedBidId) openBidDrawer(selectedBidId);
    } catch (err) {
      setBannerMsg({ type: 'error', text: getErrorMessage(err) });
      setActionModal(prev => ({ ...prev, submitting: false }));
    }
  };

  // ── CSV Export Helper ───────────────────────────────────────────────────────
  const handleExportCsv = async () => {
    try {
      setBannerMsg({ type: 'success', text: 'Generating immutable audit log CSV export…' });
      await apiDownloadBlob('/admin/procurement/audit-log/export', `bid_audit_log_${Date.now()}.csv`);
    } catch (err) {
      setBannerMsg({ type: 'error', text: `Export failed: ${getErrorMessage(err)}` });
    }
  };

  // ── Filtered Bids ───────────────────────────────────────────────────────────
  const filteredBids = bids.filter(b => {
    if (bidSearch.trim()) {
      const q = bidSearch.toLowerCase();
      const matchId = b.id?.toLowerCase().includes(q);
      const matchWh = b.target_warehouse_name?.toLowerCase().includes(q);
      const matchCrop = b.crop_type?.toLowerCase().includes(q);
      if (!matchId && !matchWh && !matchCrop) return false;
    }
    if (flaggedOnly) {
      // Check if bid has active flags
      const hasFlags = (b.flag_count && b.flag_count > 0) || flags.some(f => f.bid_id === b.id && f.status === 'open');
      if (!hasFlags) return false;
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', color: 'var(--text-primary)' }}>

      {/* ════════════════════════════════════════════════════ */}
      {/* LIVE AUCTION CONTROL ROOM                                    */}
      {/* ════════════════════════════════════════════════════ */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(229,169,60,0.35)', borderRadius: '12px', padding: '1.25rem 1.5rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'rgba(229,169,60,0.12)', padding: '8px', borderRadius: '8px', border: '1px solid rgba(229,169,60,0.3)' }}>
              <Radio size={18} color="#E5A93C" />
            </div>
            <div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Live Auction Control Room</h3>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>Real-time mandi exchange monitoring — full identity view &amp; admin controls</p>
            </div>
          </div>
          <button onClick={fetchAuctionLots} style={{ background: 'var(--bg-sunken)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', padding: '0.4rem 0.75rem', borderRadius: '6px', fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        {/* KPI Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {[
            { label: 'Live Lots',     value: auctionKpi.live,          color: '#2EA043', suffix: '' },
            { label: 'Closing < 1h', value: auctionKpi.closingSoon,    color: '#DA3633', suffix: '' },
            { label: 'Live Value',   value: auctionKpi.liveValue >= 1e5 ? `₹${(auctionKpi.liveValue/1e5).toFixed(1)}L` : `₹${Math.round(auctionKpi.liveValue/1000)}K`, color: '#bc8cff', suffix: '' },
            { label: 'Avg Premium',  value: `${auctionKpi.avgPremium}%`, color: '#E5A93C', suffix: ' vs MSP' },
            { label: 'Sell-Through', value: `${auctionKpi.sellThrough}%`, color: '#58A6FF', suffix: '' },
            { label: 'Open Flags',   value: auctionKpi.openFlags,      color: '#DA3633', suffix: '' },
          ].map(({ label, value, color, suffix }) => (
            <div key={label} style={{ background: 'var(--bg-sunken)', borderRadius: '8px', padding: '0.75rem 1rem', borderLeft: `3px solid ${color}` }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.15rem', fontWeight: 700, color }}>{value}{suffix}</div>
            </div>
          ))}
        </div>

        {/* Auction action banner */}
        {auctionActionMsg && (
          <div style={{ background: auctionActionMsg.type === 'success' ? 'rgba(46,160,67,0.12)' : 'rgba(218,54,51,0.12)', border: `1px solid ${auctionActionMsg.type === 'success' ? '#2EA043' : '#DA3633'}`, borderRadius: '6px', padding: '0.55rem 0.85rem', color: auctionActionMsg.type === 'success' ? '#2EA043' : '#DA3633', fontSize: '0.8rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {auctionActionMsg.text}
            <button onClick={() => setAuctionActionMsg(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}><X size={13} /></button>
          </div>
        )}

        {/* Lot grid + control panel */}
        <div style={{ display: 'grid', gridTemplateColumns: selectedLotId ? 'minmax(0,1fr) 320px' : '1fr', gap: '1rem', alignItems: 'start' }}>
          {/* Lot list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '0.25rem' }}>
            {auctionLotsLoading && auctionLots.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite', display: 'inline', marginRight: '6px' }} />Loading live lots…</div>
            ) : auctionLots.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>No live or scheduled auction lots found.</div>
            ) : auctionLots.map(lot => {
              const isSelected = selectedLotId === lot.id;
              const isLive = lot.status === 'live' || lot.status === 'closing';
              const msp = CCEA_MSP[lot.crop_type?.toLowerCase()]?.msp || 0;
              const cur = Number(lot.current_high_bid || lot.start_price_per_kg);
              const pct = msp > 0 ? (((cur - msp) / msp) * 100).toFixed(1) : null;
              let statusColor = '#8B949E';
              if (lot.status === 'live') statusColor = '#2EA043';
              else if (lot.status === 'closing') statusColor = '#E5A93C';
              else if (lot.status === 'scheduled') statusColor = '#bc8cff';
              return (
                <div key={lot.id} onClick={() => setSelectedLotId(isSelected ? null : lot.id)}
                  style={{ background: isSelected ? 'rgba(229,169,60,0.07)' : 'var(--bg-sunken)', borderRadius: '8px', padding: '0.75rem 1rem', border: isSelected ? '1px solid rgba(229,169,60,0.4)' : '1px solid var(--border-color)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', transition: 'border-color 0.15s' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize', fontSize: '0.9rem' }}>{lot.crop_type}</span>
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '999px', background: `${statusColor}18`, color: statusColor, fontFamily: 'var(--font-mono)' }}>{lot.status?.toUpperCase()}</span>
                      {lot.bid_count > 0 && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{lot.bid_count} bids</span>}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {Number(lot.qty_kg || 0).toLocaleString('en-IN')} kg &nbsp;·&nbsp; {lot.location || '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', fontWeight: 700, color: isLive ? '#2EA043' : 'var(--text-primary)' }}>₹{cur.toFixed(2)}<span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 400 }}>/kg</span></div>
                    {pct && <div style={{ fontSize: '0.65rem', color: Number(pct) >= 0 ? '#2EA043' : '#DA3633' }}>{Number(pct) >= 0 ? '+' : ''}{pct}% MSP</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Lot Control Panel */}
          {selectedLotId && (
            <div style={{ position: 'sticky', top: '1rem', background: 'var(--bg-sunken)', borderRadius: '10px', border: '1px solid var(--border-color)', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.88rem', color: '#E5A93C', margin: 0 }}>Lot Control Panel</h4>
                <button onClick={() => { setSelectedLotId(null); setSelectedLot(null); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={14} /></button>
              </div>
              {lotControlLoading ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Loading…</div>
              ) : selectedLot ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {/* Identity reveal (admin only) */}
                  <div style={{ background: 'var(--bg-card)', borderRadius: '7px', padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Farmer Identity</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-primary)', wordBreak: 'break-all' }}>{selectedLot.farmer_name || selectedLot.farmer_id || 'Unknown'}</div>
                    {selectedLot.farmer_phone && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{selectedLot.farmer_phone}</div>}
                  </div>
                  {/* Lot stats */}
                  {[
                    { label: 'Current High', value: `₹${Number(selectedLot.current_high_bid || selectedLot.start_price_per_kg).toFixed(2)}/kg` },
                    { label: 'Bids', value: selectedLot.bid_count || 0 },
                    { label: 'Watchers', value: selectedLot.watcher_count || 0 },
                    { label: 'Status', value: selectedLot.status },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', padding: '0.3rem 0', borderBottom: '1px solid var(--border-color)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>{value}</span>
                    </div>
                  ))}
                  {/* Admin Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                    {[
                      { type: 'freeze',      label: '❄ Freeze Lot',      color: '#DA3633', bg: 'rgba(218,54,51,0.12)' },
                      { type: 'unfreeze',    label: '▶ Unfreeze Lot',    color: '#2EA043', bg: 'rgba(46,160,67,0.1)' },
                      { type: 'extend',      label: '⏱ Extend +30 min',  color: '#bc8cff', bg: 'rgba(188,140,255,0.1)' },
                      { type: 'force_close', label: '✕ Force Close',     color: '#E5A93C', bg: 'rgba(229,169,60,0.1)' },
                    ].map(({ type, label, color, bg }) => (
                      <button key={type}
                        onClick={() => setAuctionActionModal({ isOpen: true, actionType: type, lotId: selectedLotId, reason: '', submitting: false })}
                        style={{ background: bg, border: `1px solid ${color}30`, color, borderRadius: '6px', padding: '0.45rem 0.75rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-body)' }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Auction Action Confirmation Modal */}
      {auctionActionModal.isOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 11000, padding: '1rem' }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '1.75rem', maxWidth: '420px', width: '100%' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', color: '#E5A93C', marginBottom: '0.5rem' }}>Admin Action: {auctionActionModal.actionType}</h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>This will be logged in the immutable bid audit trail. Provide a mandatory administrative reason.</p>
            {auctionActionMsg && auctionActionMsg.type === 'error' && <div style={{ background: 'rgba(218,54,51,0.12)', border: '1px solid #DA3633', borderRadius: '6px', padding: '0.5rem 0.75rem', color: '#DA3633', fontSize: '0.78rem', marginBottom: '0.75rem' }}>{auctionActionMsg.text}</div>}
            <textarea
              placeholder="Administrative reason (mandatory, logged permanently)…"
              value={auctionActionModal.reason}
              onChange={e => setAuctionActionModal(p => ({ ...p, reason: e.target.value }))}
              rows={3}
              style={{ width: '100%', background: 'var(--bg-sunken)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', padding: '0.6rem 0.8rem', fontSize: '0.82rem', fontFamily: 'var(--font-body)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button onClick={() => setAuctionActionModal({ isOpen: false, actionType: '', lotId: '', reason: '', submitting: false })} style={{ flex: 1, background: 'var(--bg-sunken)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '7px', padding: '0.55rem', fontSize: '0.82rem', cursor: 'pointer' }}>Cancel</button>
              <button onClick={executeAuctionAction} disabled={auctionActionModal.submitting} style={{ flex: 1, background: '#DA3633', color: '#fff', border: 'none', borderRadius: '7px', padding: '0.55rem', fontSize: '0.82rem', fontWeight: 700, cursor: auctionActionModal.submitting ? 'not-allowed' : 'pointer', opacity: auctionActionModal.submitting ? 0.6 : 1 }}>
                {auctionActionModal.submitting ? 'Applying…' : 'Apply Action'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Control Header ──────────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--bg-card, #161B22)',
        border: '1px solid var(--border-color, #30363D)',
        borderRadius: '12px',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{
            background: 'rgba(229, 169, 60, 0.12)',
            padding: '10px',
            borderRadius: '10px',
            border: '1px solid rgba(229, 169, 60, 0.3)',
          }}>
            <ShieldAlert size={24} color="#E5A93C" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 style={{
                fontFamily: 'var(--font-heading, Space Grotesk)',
                fontSize: '1.25rem',
                fontWeight: 700,
                margin: 0,
                letterSpacing: '-0.02em',
              }}>
                Procurement Bid Monitor & Market Governance
              </h2>
              <span style={{
                fontSize: '0.65rem',
                fontFamily: 'var(--font-mono, JetBrains Mono)',
                background: 'rgba(46, 160, 67, 0.15)',
                color: '#2EA043',
                padding: '2px 8px',
                borderRadius: '999px',
                border: '1px solid rgba(46, 160, 67, 0.3)',
                fontWeight: 600,
              }}>
                LIVE TELEMETRY
              </span>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted, #8B949E)', margin: '0.2rem 0 0 0' }}>
              Zero-trust administrative surveillance, statutory MSP compliance check, and anomaly resolution.
            </p>
          </div>
        </div>

        {/* Global Action Tools */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Pause / Resume Live Stream */}
          <button
            onClick={() => setLiveStreamActive(!liveStreamActive)}
            style={{
              background: liveStreamActive ? 'rgba(46, 160, 67, 0.15)' : 'rgba(218, 54, 51, 0.15)',
              border: `1px solid ${liveStreamActive ? 'rgba(46, 160, 67, 0.4)' : 'rgba(218, 54, 51, 0.4)'}`,
              color: liveStreamActive ? '#2EA043' : '#DA3633',
              borderRadius: '8px',
              padding: '0.45rem 0.85rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            {liveStreamActive ? <Pause size={13} /> : <Play size={13} />}
            {liveStreamActive ? 'Live Stream Active' : 'Feed Paused'}
          </button>

          {/* Refresh button */}
          <button
            onClick={() => {
              fetchOverview();
              fetchBids();
              fetchFlags();
              if (activeTab === 'audit') fetchAuditLog();
              if (activeTab === 'analytics') fetchAnalytics();
            }}
            style={{
              background: 'var(--bg-sunken, #0D1117)',
              border: '1px solid var(--border-color, #30363D)',
              color: 'var(--text-muted, #8B949E)',
              borderRadius: '8px',
              padding: '0.45rem 0.85rem',
              fontSize: '0.75rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* ── System Banner Feedback ─────────────────────────────────────────── */}
      {bannerMsg && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          fontSize: '0.82rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: bannerMsg.type === 'success' ? 'rgba(46, 160, 67, 0.15)' : 'rgba(218, 54, 51, 0.15)',
          color: bannerMsg.type === 'success' ? '#2EA043' : '#DA3633',
          border: `1px solid ${bannerMsg.type === 'success' ? 'rgba(46, 160, 67, 0.4)' : 'rgba(218, 54, 51, 0.4)'}`,
        }}>
          <span>{bannerMsg.text}</span>
          <button
            onClick={() => setBannerMsg(null)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── KPI Stat Cards Row ─────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: '1rem',
      }}>
        {/* Card 1: Value in play */}
        <div className="card" style={{ padding: '1rem', background: '#161B22', border: '1px solid #30363D' }}>
          <div style={{ fontSize: '0.72rem', color: '#8B949E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Open Value In Play
          </div>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '1.4rem',
            fontWeight: 700,
            color: '#E5A93C',
            marginTop: '0.3rem',
          }}>
            {formatInr(overview?.kpis?.total_open_value_inr || 0)}
          </div>
          <div style={{ fontSize: '0.68rem', color: '#8B949E', marginTop: '0.2rem' }}>
            Active open/frozen lots
          </div>
        </div>

        {/* Card 2: Open Bids */}
        <div className="card" style={{ padding: '1rem', background: '#161B22', border: '1px solid #30363D' }}>
          <div style={{ fontSize: '0.72rem', color: '#8B949E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Open / Active Bids
          </div>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '1.4rem',
            fontWeight: 700,
            color: '#2EA043',
            marginTop: '0.3rem',
          }}>
            {overview?.kpis?.open_bids ?? '—'}
          </div>
          <div style={{ fontSize: '0.68rem', color: '#8B949E', marginTop: '0.2rem' }}>
            Out of {overview?.kpis?.total_bids ?? 0} total bids
          </div>
        </div>

        {/* Card 3: Frozen Bids */}
        <div className="card" style={{ padding: '1rem', background: '#161B22', border: '1px solid #30363D' }}>
          <div style={{ fontSize: '0.72rem', color: '#8B949E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Frozen by Admin
          </div>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '1.4rem',
            fontWeight: 700,
            color: (overview?.kpis?.frozen_bids || 0) > 0 ? '#DA3633' : '#8B949E',
            marginTop: '0.3rem',
          }}>
            {overview?.kpis?.frozen_bids ?? 0}
          </div>
          <div style={{ fontSize: '0.68rem', color: '#8B949E', marginTop: '0.2rem' }}>
            Trading blocked
          </div>
        </div>

        {/* Card 4: Active Farmer Quotes */}
        <div className="card" style={{ padding: '1rem', background: '#161B22', border: '1px solid #30363D' }}>
          <div style={{ fontSize: '0.72rem', color: '#8B949E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Farmer Quotes
          </div>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '1.4rem',
            fontWeight: 700,
            color: '#388BFD',
            marginTop: '0.3rem',
          }}>
            {overview?.kpis?.total_active_quotes ?? '—'}
          </div>
          <div style={{ fontSize: '0.68rem', color: '#8B949E', marginTop: '0.2rem' }}>
            Committed stock offers
          </div>
        </div>

        {/* Card 5: Anomaly Flags */}
        <div className="card" style={{
          padding: '1rem',
          background: '#161B22',
          border: `1px solid ${(overview?.kpis?.open_flags || 0) > 0 ? 'rgba(218, 54, 51, 0.4)' : '#30363D'}`,
        }}>
          <div style={{ fontSize: '0.72rem', color: '#8B949E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Open Anomaly Flags
          </div>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '1.4rem',
            fontWeight: 700,
            color: (overview?.kpis?.open_flags || 0) > 0 ? '#DA3633' : '#2EA043',
            marginTop: '0.3rem',
          }}>
            {overview?.kpis?.open_flags ?? 0}
          </div>
          <div style={{ fontSize: '0.68rem', color: '#8B949E', marginTop: '0.2rem' }}>
            Requires admin action
          </div>
        </div>

        {/* Card 6: Suspended FPOs */}
        <div className="card" style={{ padding: '1rem', background: '#161B22', border: '1px solid #30363D' }}>
          <div style={{ fontSize: '0.72rem', color: '#8B949E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Suspended FPOs
          </div>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '1.4rem',
            fontWeight: 700,
            color: (overview?.kpis?.suspended_fpos || 0) > 0 ? '#F0883E' : '#8B949E',
            marginTop: '0.3rem',
          }}>
            {overview?.kpis?.suspended_fpos ?? 0}
          </div>
          <div style={{ fontSize: '0.68rem', color: '#8B949E', marginTop: '0.2rem' }}>
            Privileges revoked
          </div>
        </div>
      </div>

      {/* ── Live Stream Ticker / Event Strip ─────────────────────────────────── */}
      <div style={{
        background: '#0D1117',
        border: '1px solid #30363D',
        borderRadius: '8px',
        padding: '0.65rem 1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        fontSize: '0.75rem',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          color: liveStreamActive ? '#2EA043' : '#8B949E',
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: liveStreamActive ? '#2EA043' : '#8B949E',
            display: 'inline-block',
            boxShadow: liveStreamActive ? '0 0 6px #2EA043' : 'none',
          }} />
          STREAM:
        </div>

        {liveEvents.length === 0 ? (
          <span style={{ color: '#8B949E', fontStyle: 'italic' }}>
            Awaiting real-time bid events (quotes, price revisions, flags)…
          </span>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1.25rem',
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            paddingRight: '1rem',
          }}>
            {liveEvents.slice(0, 5).map(evt => (
              <span key={evt.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{
                  fontSize: '0.68rem',
                  fontFamily: 'JetBrains Mono',
                  color: '#E5A93C',
                  background: 'rgba(229, 169, 60, 0.1)',
                  padding: '1px 5px',
                  borderRadius: '4px',
                }}>
                  {evt.action}
                </span>
                <span style={{ color: '#C9D1D9' }}>{evt.bid_id || 'System'}</span>
                <span style={{ color: '#8B949E', fontSize: '0.68rem' }}>{timeAgo(evt.created_at)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Tab Navigation Strip ────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #30363D',
        gap: '0.5rem',
        paddingBottom: '0.2rem',
      }}>
        {[
          { id: 'bids', label: 'Bids Supervision', icon: FileText, badge: filteredBids.length },
          { id: 'flags', label: 'Anomaly Flags Queue', icon: AlertOctagon, badge: overview?.kpis?.open_flags || 0, isDangerBadge: (overview?.kpis?.open_flags || 0) > 0 },
          { id: 'analytics', label: 'Market Analytics', icon: BarChart3 },
          { id: 'audit', label: 'Immutable Audit Log', icon: Activity },
        ].map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                background: isActive ? '#161B22' : 'transparent',
                border: '1px solid',
                borderColor: isActive ? '#30363D' : 'transparent',
                borderBottom: isActive ? '2px solid #E5A93C' : '2px solid transparent',
                borderRadius: '8px 8px 0 0',
                padding: '0.65rem 1.1rem',
                fontSize: '0.82rem',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#E5A93C' : '#8B949E',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={15} />
              {t.label}
              {t.badge !== undefined && (
                <span style={{
                  fontSize: '0.68rem',
                  fontFamily: 'JetBrains Mono',
                  padding: '1px 6px',
                  borderRadius: '999px',
                  background: t.isDangerBadge ? '#DA3633' : '#30363D',
                  color: '#fff',
                  fontWeight: 700,
                }}>
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: BIDS SUPERVISION TABLE                                          */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'bids' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Filter Bar */}
          <div style={{
            background: '#161B22',
            border: '1px solid #30363D',
            borderRadius: '8px',
            padding: '0.85rem 1rem',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            {/* Search */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: '#0D1117',
              border: '1px solid #30363D',
              borderRadius: '6px',
              padding: '0.35rem 0.75rem',
              width: '260px',
            }}>
              <Search size={14} color="#8B949E" />
              <input
                type="text"
                placeholder="Search FPO, crop, or Bid ID…"
                value={bidSearch}
                onChange={e => setBidSearch(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#C9D1D9',
                  fontSize: '0.78rem',
                  outline: 'none',
                  width: '100%',
                }}
              />
            </div>

            {/* Quick Status and Crop Filters */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <select
                value={bidStatusFilter}
                onChange={e => setBidStatusFilter(e.target.value)}
                style={{
                  background: '#0D1117',
                  border: '1px solid #30363D',
                  color: '#C9D1D9',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="frozen">Frozen</option>
                <option value="fulfilled">Fulfilled</option>
                <option value="cancelled">Cancelled</option>
                <option value="force_closed">Force Closed</option>
              </select>

              <select
                value={bidCropFilter}
                onChange={e => setBidCropFilter(e.target.value)}
                style={{
                  background: '#0D1117',
                  border: '1px solid #30363D',
                  color: '#C9D1D9',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                <option value="all">All Crops</option>
                <option value="mustard">Mustard</option>
                <option value="soybean">Soybean</option>
                <option value="groundnut">Groundnut</option>
                <option value="sunflower">Sunflower</option>
                <option value="sesame">Sesame</option>
              </select>

              {/* Flagged only toggle */}
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.75rem',
                color: '#DA3633',
                cursor: 'pointer',
                userSelect: 'none',
                marginLeft: '0.5rem',
              }}>
                <input
                  type="checkbox"
                  checked={flaggedOnly}
                  onChange={e => setFlaggedOnly(e.target.checked)}
                />
                Flagged Anomaly Lots Only
              </label>
            </div>
          </div>

          {/* Table */}
          <div style={{
            background: '#161B22',
            border: '1px solid #30363D',
            borderRadius: '8px',
            overflowX: 'auto',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #30363D', color: '#8B949E', background: '#0D1117' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Bid ID</th>
                  <th style={{ padding: '0.75rem 1rem' }}>FPO / Warehouse</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Crop</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Offer Price (₹/kg)</th>
                  <th style={{ padding: '0.75rem 1rem' }}>MSP Benchmark</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Volume</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Deadline</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Flags</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bidsLoading ? (
                  <tr>
                    <td colSpan={10} style={{ padding: '2rem', textAlign: 'center', color: '#8B949E' }}>
                      Auditing platform procurement lots…
                    </td>
                  </tr>
                ) : filteredBids.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: '2.5rem', textAlign: 'center', color: '#8B949E' }}>
                      No procurement bids matching the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredBids.map(b => {
                    const price = parseFloat(b.max_price_per_kg || b.offer_price) || 0;
                    const cropKey = (b.crop_type || '').toLowerCase();
                    const mspObj = CCEA_MSP[cropKey] || { msp: 50 };
                    const mspDiffPct = mspObj.msp > 0 ? (((price - mspObj.msp) / mspObj.msp) * 100).toFixed(1) : 0;
                    const isOverMsp = price >= mspObj.msp;
                    const statusStyle = STATUS_STYLES[b.status] || STATUS_STYLES.open;
                    const countdown = getCountdown(b.delivery_deadline);

                    // Flag count
                    const bidFlagList = flags.filter(f => f.bid_id === b.id && f.status === 'open');
                    const hasHighRisk = bidFlagList.some(f => f.severity === 'high');

                    return (
                      <tr
                        key={b.id}
                        style={{
                          borderBottom: '1px solid #30363D',
                          transition: 'background 0.15s ease',
                          cursor: 'pointer',
                        }}
                        onClick={() => openBidDrawer(b.id)}
                        className="hover:bg-slate-800/40"
                      >
                        <td style={{ padding: '0.75rem 1rem', fontFamily: 'JetBrains Mono', color: '#E5A93C', fontWeight: 600 }}>
                          {b.id}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: '#C9D1D9', fontWeight: 500 }}>
                          {b.target_warehouse_name || 'Collective FPO'}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textTransform: 'capitalize' }}>
                          <span style={{
                            background: 'rgba(229, 169, 60, 0.1)',
                            color: '#E5A93C',
                            padding: '2px 7px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                          }}>
                            {b.crop_type}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontFamily: 'JetBrains Mono', fontWeight: 700 }}>
                          ₹{price.toFixed(2)}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ fontSize: '0.72rem', color: '#8B949E' }}>
                              ₹{mspObj.msp.toFixed(2)}
                            </span>
                            <span style={{
                              fontSize: '0.68rem',
                              fontFamily: 'JetBrains Mono',
                              color: isOverMsp ? '#2EA043' : '#DA3633',
                              fontWeight: 600,
                            }}>
                              {isOverMsp ? `+${mspDiffPct}%` : `${mspDiffPct}%`}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontFamily: 'JetBrains Mono' }}>
                          {b.quantity_tonnes} tonnes
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span style={{
                            fontSize: '0.72rem',
                            color: countdown.isExpired ? '#8B949E' : countdown.isUrgent ? '#DA3633' : '#C9D1D9',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                          }}>
                            <Clock size={12} />
                            {countdown.text}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span style={{
                            background: statusStyle.bg,
                            border: `1px solid ${statusStyle.border}`,
                            color: statusStyle.color,
                            fontSize: '0.68rem',
                            padding: '2px 8px',
                            borderRadius: '999px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                          }}>
                            {statusStyle.label}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          {bidFlagList.length > 0 ? (
                            <span style={{
                              background: hasHighRisk ? 'rgba(218, 54, 51, 0.2)' : 'rgba(229, 169, 60, 0.2)',
                              color: hasHighRisk ? '#DA3633' : '#E5A93C',
                              padding: '2px 7px',
                              borderRadius: '4px',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}>
                              <AlertTriangle size={11} />
                              {bidFlagList.length} {bidFlagList.length === 1 ? 'flag' : 'flags'}
                            </span>
                          ) : (
                            <span style={{ color: '#2EA043', fontSize: '0.7rem' }}>— Clean</span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openBidDrawer(b.id);
                            }}
                            style={{
                              background: '#0D1117',
                              border: '1px solid #30363D',
                              color: '#58A6FF',
                              borderRadius: '6px',
                              padding: '0.3rem 0.65rem',
                              fontSize: '0.72rem',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                            }}
                          >
                            <Eye size={12} /> Inspect
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 2: ANOMALY FLAGS QUEUE                                             */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'flags' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Severity & Status Filter Bar */}
          <div style={{
            background: '#161B22',
            border: '1px solid #30363D',
            borderRadius: '8px',
            padding: '0.85rem 1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: '#8B949E' }}>Severity:</span>
              {['all', 'high', 'medium', 'low'].map(sev => (
                <button
                  key={sev}
                  onClick={() => setFlagSeverityFilter(sev)}
                  style={{
                    background: flagSeverityFilter === sev ? '#30363D' : 'transparent',
                    border: '1px solid #30363D',
                    color: sev === 'high' ? '#DA3633' : sev === 'medium' ? '#E5A93C' : '#C9D1D9',
                    borderRadius: '6px',
                    padding: '0.3rem 0.65rem',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  {sev}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: '#8B949E' }}>Status:</span>
              {['open', 'reviewed', 'dismissed', 'actioned', 'all'].map(st => (
                <button
                  key={st}
                  onClick={() => setFlagStatusFilter(st)}
                  style={{
                    background: flagStatusFilter === st ? '#30363D' : 'transparent',
                    border: '1px solid #30363D',
                    color: flagStatusFilter === st ? '#E5A93C' : '#8B949E',
                    borderRadius: '6px',
                    padding: '0.3rem 0.65rem',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                    cursor: 'pointer',
                  }}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Flags List */}
          {flagsLoading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#8B949E' }}>
              Loading anomaly intelligence reports…
            </div>
          ) : flags.length === 0 ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center', background: '#161B22', border: '1px solid #30363D' }}>
              <ShieldCheck size={36} color="#2EA043" style={{ margin: '0 auto 0.75rem' }} />
              <div style={{ fontSize: '1rem', fontWeight: 600, color: '#C9D1D9' }}>Zero Open Anomalies Detected</div>
              <div style={{ fontSize: '0.78rem', color: '#8B949E', marginTop: '0.3rem' }}>
                All procurement bidding lots adhere to statutory MSP corridors and anti-collusion policies.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {flags.map(flag => {
                const sevStyle = SEVERITY_STYLES[flag.severity] || SEVERITY_STYLES.medium;
                return (
                  <div
                    key={flag.id}
                    style={{
                      background: '#161B22',
                      border: '1px solid #30363D',
                      borderLeft: `4px solid ${sevStyle.color}`,
                      borderRadius: '8px',
                      padding: '1rem 1.25rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                      gap: '1rem',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxWidth: '75%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={{
                          background: sevStyle.bg,
                          color: sevStyle.color,
                          border: `1px solid ${sevStyle.border}`,
                          padding: '1px 7px',
                          borderRadius: '4px',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                        }}>
                          {sevStyle.label}
                        </span>
                        <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.82rem', fontWeight: 700, color: '#C9D1D9' }}>
                          {flag.flag_type?.replace(/_/g, ' ').toUpperCase()}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: '#8B949E' }}>
                          • {timeAgo(flag.created_at)}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.78rem', color: '#8B949E', marginTop: '0.2rem' }}>
                        {flag.bid_id && (
                          <span style={{ marginRight: '1rem' }}>
                            Bid: <strong style={{ color: '#E5A93C', fontFamily: 'JetBrains Mono' }}>{flag.bid_id}</strong>
                          </span>
                        )}
                        {flag.fpo_id && (
                          <span style={{ marginRight: '1rem' }}>
                            FPO: <strong style={{ color: '#C9D1D9', fontFamily: 'JetBrains Mono' }}>{flag.fpo_id}</strong>
                          </span>
                        )}
                        {flag.farmer_id && (
                          <span>
                            Farmer: <strong style={{ color: '#C9D1D9', fontFamily: 'JetBrains Mono' }}>{flag.farmer_id}</strong>
                          </span>
                        )}
                      </div>

                      {/* Details Box */}
                      {flag.details && Object.keys(flag.details).length > 0 && (
                        <div style={{
                          background: '#0D1117',
                          border: '1px solid #21262D',
                          borderRadius: '6px',
                          padding: '0.5rem 0.75rem',
                          fontSize: '0.72rem',
                          fontFamily: 'JetBrains Mono',
                          color: '#8B949E',
                          marginTop: '0.3rem',
                        }}>
                          {JSON.stringify(flag.details)}
                        </div>
                      )}
                    </div>

                    {/* Flag Action Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {flag.status === 'open' && (
                        <>
                          <button
                            onClick={() => {
                              setActionModal({
                                isOpen: true,
                                actionType: 'action_flag',
                                targetId: flag.id,
                                targetTitle: `Action Anomaly: ${flag.flag_type}`,
                                reason: '',
                                reviewNote: 'Admin intervention applied.',
                                submitting: false,
                              });
                            }}
                            style={{
                              background: '#DA3633',
                              border: 'none',
                              color: '#fff',
                              borderRadius: '6px',
                              padding: '0.4rem 0.75rem',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Take Action
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                await apiPatch(`/admin/procurement/flags/${flag.id}`, { status: 'dismissed' });
                                fetchFlags();
                              } catch (err) {
                                setBannerMsg({ type: 'error', text: getErrorMessage(err) });
                              }
                            }}
                            style={{
                              background: '#0D1117',
                              border: '1px solid #30363D',
                              color: '#8B949E',
                              borderRadius: '6px',
                              padding: '0.4rem 0.75rem',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
                          >
                            Dismiss
                          </button>
                        </>
                      )}
                      {flag.status !== 'open' && (
                        <span style={{
                          fontSize: '0.72rem',
                          color: '#2EA043',
                          fontWeight: 600,
                          textTransform: 'capitalize',
                        }}>
                          ✓ {flag.status}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 3: MARKET ANALYTICS (RECHARTS)                                    */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Charts Row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
            gap: '1.25rem',
          }}>
            {/* Chart 1: Offer vs MSP Benchmark */}
            <div className="card" style={{ padding: '1.25rem', background: '#161B22', border: '1px solid #30363D' }}>
              <div style={{ marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '0.92rem', fontWeight: 600, margin: 0, color: '#C9D1D9' }}>
                  Statutory MSP Benchmark vs Active FPO Offers
                </h3>
                <p style={{ fontSize: '0.72rem', color: '#8B949E', margin: '0.2rem 0 0' }}>
                  Comparing official CCEA 2026-27 floor rate with platform procurement rates per commodity.
                </p>
              </div>

              <div style={{ height: '260px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { crop: 'Mustard', msp: 62.5, offer: 64.0 },
                    { crop: 'Soybean', msp: 51.8, offer: 53.5 },
                    { crop: 'Groundnut', msp: 71.5, offer: 73.0 },
                    { crop: 'Sunflower', msp: 76.0, offer: 77.5 },
                    { crop: 'Sesame', msp: 92.0, offer: 95.0 },
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#21262D" />
                    <XAxis dataKey="crop" stroke="#8B949E" fontSize={11} />
                    <YAxis stroke="#8B949E" fontSize={11} unit="₹" />
                    <Tooltip
                      contentStyle={{ background: '#0D1117', border: '1px solid #30363D', borderRadius: '6px' }}
                      labelStyle={{ color: '#E5A93C' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="msp" name="CCEA Mandated MSP (₹/kg)" fill="#58A6FF" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="offer" name="Avg FPO Offer Rate (₹/kg)" fill="#E5A93C" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Bid Procurement Volume by Crop */}
            <div className="card" style={{ padding: '1.25rem', background: '#161B22', border: '1px solid #30363D' }}>
              <div style={{ marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '0.92rem', fontWeight: 600, margin: 0, color: '#C9D1D9' }}>
                  Procurement Lot Volume Distribution (Tonnes)
                </h3>
                <p style={{ fontSize: '0.72rem', color: '#8B949E', margin: '0.2rem 0 0' }}>
                  Aggregated volume under active collective procurement tenders.
                </p>
              </div>

              <div style={{ height: '260px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { crop: 'Mustard', tonnes: 600 },
                    { crop: 'Soybean', tonnes: 450 },
                    { crop: 'Groundnut', tonnes: 350 },
                    { crop: 'Sunflower', tonnes: 200 },
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#21262D" />
                    <XAxis dataKey="crop" stroke="#8B949E" fontSize={11} />
                    <YAxis stroke="#8B949E" fontSize={11} />
                    <Tooltip
                      contentStyle={{ background: '#0D1117', border: '1px solid #30363D', borderRadius: '6px' }}
                      labelStyle={{ color: '#2EA043' }}
                    />
                    <Bar dataKey="tonnes" name="Volume (Tonnes)" fill="#2EA043" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Stat Metric Tiles */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
          }}>
            <div className="card" style={{ padding: '1rem', background: '#161B22', border: '1px solid #30363D' }}>
              <div style={{ fontSize: '0.72rem', color: '#8B949E' }}>Average Premium Over MSP</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#2EA043', marginTop: '0.3rem', fontFamily: 'JetBrains Mono' }}>
                +3.8%
              </div>
              <div style={{ fontSize: '0.68rem', color: '#8B949E', marginTop: '0.2rem' }}>Profitable for farmers</div>
            </div>

            <div className="card" style={{ padding: '1rem', background: '#161B22', border: '1px solid #30363D' }}>
              <div style={{ fontSize: '0.72rem', color: '#8B949E' }}>FPO Fill Rate</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#58A6FF', marginTop: '0.3rem', fontFamily: 'JetBrains Mono' }}>
                78.4%
              </div>
              <div style={{ fontSize: '0.68rem', color: '#8B949E', marginTop: '0.2rem' }}>Avg lot fulfilment</div>
            </div>

            <div className="card" style={{ padding: '1rem', background: '#161B22', border: '1px solid #30363D' }}>
              <div style={{ fontSize: '0.72rem', color: '#8B949E' }}>Avg Quotes Per Tender</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#E5A93C', marginTop: '0.3rem', fontFamily: 'JetBrains Mono' }}>
                4.2 quotes
              </div>
              <div style={{ fontSize: '0.68rem', color: '#8B949E', marginTop: '0.2rem' }}>High seller competition</div>
            </div>

            <div className="card" style={{ padding: '1rem', background: '#161B22', border: '1px solid #30363D' }}>
              <div style={{ fontSize: '0.72rem', color: '#8B949E' }}>Average Time to Fulfil</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#C9D1D9', marginTop: '0.3rem', fontFamily: 'JetBrains Mono' }}>
                3.4 days
              </div>
              <div style={{ fontSize: '0.68rem', color: '#8B949E', marginTop: '0.2rem' }}>From listing to settlement</div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 4: IMMUTABLE AUDIT LOG & CSV EXPORT                               */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'audit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Controls Bar */}
          <div style={{
            background: '#161B22',
            border: '1px solid #30363D',
            borderRadius: '8px',
            padding: '0.85rem 1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Search Bid ID…"
                value={auditSearch}
                onChange={e => setAuditSearch(e.target.value)}
                style={{
                  background: '#0D1117',
                  border: '1px solid #30363D',
                  color: '#C9D1D9',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  outline: 'none',
                }}
              />

              <select
                value={auditActionFilter}
                onChange={e => setAuditActionFilter(e.target.value)}
                style={{
                  background: '#0D1117',
                  border: '1px solid #30363D',
                  color: '#C9D1D9',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                <option value="all">All Actions</option>
                <option value="bid_created">bid_created</option>
                <option value="price_raised">price_raised</option>
                <option value="quote_submitted">quote_submitted</option>
                <option value="quote_accepted">quote_accepted</option>
                <option value="admin_freeze">admin_freeze</option>
                <option value="admin_unfreeze">admin_unfreeze</option>
                <option value="admin_force_close">admin_force_close</option>
                <option value="admin_void_quote">admin_void_quote</option>
                <option value="fpo_suspended">fpo_suspended</option>
              </select>

              <select
                value={auditRoleFilter}
                onChange={e => setAuditRoleFilter(e.target.value)}
                style={{
                  background: '#0D1117',
                  border: '1px solid #30363D',
                  color: '#C9D1D9',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                <option value="all">All Roles</option>
                <option value="admin">Admin</option>
                <option value="fpo">FPO</option>
                <option value="farmer">Farmer</option>
                <option value="system">System</option>
              </select>

              <button
                onClick={fetchAuditLog}
                style={{
                  background: '#30363D',
                  border: 'none',
                  color: '#C9D1D9',
                  borderRadius: '6px',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                Filter
              </button>
            </div>

            {/* CSV Export Button */}
            <button
              onClick={handleExportCsv}
              style={{
                background: 'rgba(46, 160, 67, 0.15)',
                border: '1px solid rgba(46, 160, 67, 0.4)',
                color: '#2EA043',
                borderRadius: '6px',
                padding: '0.45rem 0.95rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <Download size={14} /> Export Immutable CSV
            </button>
          </div>

          {/* Table */}
          <div style={{
            background: '#161B22',
            border: '1px solid #30363D',
            borderRadius: '8px',
            overflowX: 'auto',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #30363D', color: '#8B949E', background: '#0D1117' }}>
                  <th style={{ padding: '0.7rem 1rem' }}>Timestamp</th>
                  <th style={{ padding: '0.7rem 1rem' }}>Action</th>
                  <th style={{ padding: '0.7rem 1rem' }}>Actor</th>
                  <th style={{ padding: '0.7rem 1rem' }}>Bid ID</th>
                  <th style={{ padding: '0.7rem 1rem' }}>Reason / Notes</th>
                  <th style={{ padding: '0.7rem 1rem' }}>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {auditLoading ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#8B949E' }}>
                      Retrieving cryptographic append-only audit trail…
                    </td>
                  </tr>
                ) : auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#8B949E' }}>
                      No audit events matching current criteria.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #21262D' }}>
                      <td style={{ padding: '0.65rem 1rem', fontFamily: 'JetBrains Mono', color: '#8B949E' }}>
                        {item.created_at ? new Date(item.created_at).toLocaleString('en-IN') : '—'}
                      </td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <span style={{
                          fontFamily: 'JetBrains Mono',
                          fontSize: '0.68rem',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: item.action?.includes('admin') || item.action?.includes('suspended')
                            ? 'rgba(218, 54, 51, 0.2)'
                            : 'rgba(229, 169, 60, 0.1)',
                          color: item.action?.includes('admin') || item.action?.includes('suspended')
                            ? '#DA3633'
                            : '#E5A93C',
                          fontWeight: 600,
                        }}>
                          {item.action}
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <span style={{
                          textTransform: 'uppercase',
                          fontSize: '0.65rem',
                          background: '#21262D',
                          color: '#C9D1D9',
                          padding: '2px 5px',
                          borderRadius: '3px',
                          marginRight: '0.35rem',
                        }}>
                          {item.actor_role}
                        </span>
                        <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.68rem', color: '#8B949E' }}>
                          {item.actor_id ? item.actor_id.slice(0, 8) : 'sys'}
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 1rem', fontFamily: 'JetBrains Mono', color: '#58A6FF' }}>
                        {item.bid_id || '—'}
                      </td>
                      <td style={{ padding: '0.65rem 1rem', color: '#C9D1D9', maxWidth: '300px' }}>
                        {item.reason || 'Automated transaction'}
                      </td>
                      <td style={{ padding: '0.65rem 1rem', fontFamily: 'JetBrains Mono', color: '#8B949E' }}>
                        {item.ip_address || 'internal'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* BID DETAIL DRAWER (SLIDE-OVER / MODAL)                                 */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {selectedBidId && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '560px',
          maxWidth: '100%',
          background: '#161B22',
          borderLeft: '1px solid #30363D',
          boxShadow: '-8px 0 24px rgba(0,0,0,0.6)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.2s ease',
        }}>
          {/* Drawer Header */}
          <div style={{
            padding: '1.25rem',
            borderBottom: '1px solid #30363D',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#0D1117',
          }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#8B949E', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Bid Forensic Inspection
              </div>
              <h3 style={{
                fontFamily: 'JetBrains Mono',
                fontSize: '1.1rem',
                color: '#E5A93C',
                margin: '0.2rem 0 0',
                fontWeight: 700,
              }}>
                {selectedBidId}
              </h3>
            </div>
            <button
              onClick={() => setSelectedBidId(null)}
              style={{
                background: 'transparent',
                border: '1px solid #30363D',
                color: '#8B949E',
                borderRadius: '6px',
                padding: '6px',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Drawer Body */}
          <div style={{ padding: '1.25rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {drawerLoading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#8B949E' }}>
                Fetching audit timeline and quote registry…
              </div>
            ) : (
              <>
                {/* Status & Key Parameters */}
                <div style={{
                  background: '#0D1117',
                  border: '1px solid #30363D',
                  borderRadius: '8px',
                  padding: '1rem',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '0.75rem',
                  fontSize: '0.78rem',
                }}>
                  <div>
                    <span style={{ color: '#8B949E' }}>Status:</span>
                    <div style={{ fontWeight: 700, textTransform: 'uppercase', marginTop: '0.2rem', color: STATUS_STYLES[drawerData?.bid?.status]?.color || '#2EA043' }}>
                      {drawerData?.bid?.status || 'open'}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: '#8B949E' }}>Target Warehouse / FPO:</span>
                    <div style={{ color: '#C9D1D9', fontWeight: 600, marginTop: '0.2rem' }}>
                      {drawerData?.bid?.target_warehouse_name || 'Collective FPO'}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: '#8B949E' }}>Crop:</span>
                    <div style={{ color: '#E5A93C', fontWeight: 600, marginTop: '0.2rem', textTransform: 'capitalize' }}>
                      {drawerData?.bid?.crop_type}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: '#8B949E' }}>Ceiling Rate:</span>
                    <div style={{ color: '#C9D1D9', fontWeight: 700, fontFamily: 'JetBrains Mono', marginTop: '0.2rem' }}>
                      ₹{parseFloat(drawerData?.bid?.max_price_per_kg || drawerData?.bid?.offer_price || 0).toFixed(2)} / kg
                    </div>
                  </div>
                  <div>
                    <span style={{ color: '#8B949E' }}>Target Volume:</span>
                    <div style={{ color: '#C9D1D9', fontWeight: 600, fontFamily: 'JetBrains Mono', marginTop: '0.2rem' }}>
                      {drawerData?.bid?.quantity_tonnes} tonnes
                    </div>
                  </div>
                  <div>
                    <span style={{ color: '#8B949E' }}>Delivery Deadline:</span>
                    <div style={{ color: '#C9D1D9', marginTop: '0.2rem' }}>
                      {drawerData?.bid?.delivery_deadline || '—'}
                    </div>
                  </div>
                </div>

                {/* MSP Compliance Box */}
                {(() => {
                  const crop = (drawerData?.bid?.crop_type || '').toLowerCase();
                  const mspObj = CCEA_MSP[crop] || { msp: 50 };
                  const offerPrice = parseFloat(drawerData?.bid?.max_price_per_kg || drawerData?.bid?.offer_price || 0);
                  const premiumPct = mspObj.msp > 0 ? (((offerPrice - mspObj.msp) / mspObj.msp) * 100).toFixed(1) : 0;
                  return (
                    <div style={{
                      background: 'rgba(229, 169, 60, 0.08)',
                      border: '1px solid rgba(229, 169, 60, 0.25)',
                      borderRadius: '8px',
                      padding: '0.85rem 1rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <div>
                        <div style={{ fontSize: '0.72rem', color: '#E5A93C', fontWeight: 600 }}>CCEA Statutory MSP Benchmark</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#C9D1D9', fontFamily: 'JetBrains Mono' }}>
                          ₹{mspObj.msp.toFixed(2)} / kg
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.72rem', color: '#8B949E' }}>Offer Premium</div>
                        <div style={{
                          fontSize: '0.95rem',
                          fontWeight: 700,
                          fontFamily: 'JetBrains Mono',
                          color: offerPrice >= mspObj.msp ? '#2EA043' : '#DA3633',
                        }}>
                          {offerPrice >= mspObj.msp ? `+${premiumPct}%` : `${premiumPct}%`}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Ranked Quotes */}
                <div>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#C9D1D9', margin: '0 0 0.5rem' }}>
                    Ranked Seller Quotes ({drawerData?.quotes?.length || 0})
                  </h4>
                  {(!drawerData?.quotes || drawerData.quotes.length === 0) ? (
                    <div style={{
                      padding: '1rem',
                      background: '#0D1117',
                      border: '1px solid #30363D',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      color: '#8B949E',
                      textAlign: 'center',
                    }}>
                      No seller quotes submitted for this lot yet.
                    </div>
                  ) : (
                    <div style={{
                      background: '#0D1117',
                      border: '1px solid #30363D',
                      borderRadius: '6px',
                      overflowX: 'auto',
                    }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #30363D', color: '#8B949E' }}>
                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Farmer / Seller</th>
                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Rate (₹/kg)</th>
                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Qty</th>
                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Status</th>
                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Admin Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {drawerData.quotes.map(q => (
                            <tr key={q.id} style={{ borderBottom: '1px solid #21262D' }}>
                              <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'JetBrains Mono', color: '#C9D1D9' }}>
                                {q.farmer_id ? q.farmer_id.slice(0, 10) : 'Farmer'}
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'JetBrains Mono', fontWeight: 600, color: '#2EA043' }}>
                                ₹{q.ask_price_per_kg}
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'JetBrains Mono' }}>
                                {q.offered_qty_kg} kg
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem' }}>
                                <span style={{
                                  fontSize: '0.65rem',
                                  padding: '1px 5px',
                                  borderRadius: '3px',
                                  background: q.status === 'accepted' ? 'rgba(46, 160, 67, 0.2)' : '#21262D',
                                  color: q.status === 'accepted' ? '#2EA043' : '#8B949E',
                                  textTransform: 'uppercase',
                                }}>
                                  {q.status}
                                </span>
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                                {q.status !== 'voided' && (
                                  <button
                                    onClick={() => {
                                      setActionModal({
                                        isOpen: true,
                                        actionType: 'void_quote',
                                        targetId: q.id,
                                        targetTitle: `Void Quote #${q.id.slice(0, 8)}`,
                                        reason: '',
                                        submitting: false,
                                      });
                                    }}
                                    style={{
                                      background: 'rgba(218, 54, 51, 0.15)',
                                      border: '1px solid rgba(218, 54, 51, 0.3)',
                                      color: '#DA3633',
                                      borderRadius: '4px',
                                      padding: '2px 6px',
                                      fontSize: '0.68rem',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Void Quote
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Audit Timeline */}
                <div>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#C9D1D9', margin: '0 0 0.5rem' }}>
                    Immutable Audit Timeline
                  </h4>
                  {(!drawerData?.audit_trail || drawerData.audit_trail.length === 0) ? (
                    <div style={{ fontSize: '0.75rem', color: '#8B949E', padding: '0.5rem' }}>
                      No prior audit events recorded for this lot.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {drawerData.audit_trail.map(a => (
                        <div
                          key={a.id}
                          style={{
                            background: '#0D1117',
                            border: '1px solid #21262D',
                            borderRadius: '6px',
                            padding: '0.6rem 0.75rem',
                            fontSize: '0.72rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <div>
                            <span style={{
                              fontFamily: 'JetBrains Mono',
                              color: '#E5A93C',
                              fontWeight: 600,
                              marginRight: '0.4rem',
                            }}>
                              {a.action}
                            </span>
                            <span style={{ color: '#8B949E' }}>by {a.actor_role}</span>
                            {a.reason && (
                              <div style={{ color: '#C9D1D9', marginTop: '0.2rem' }}>
                                Reason: {a.reason}
                              </div>
                            )}
                          </div>
                          <span style={{ color: '#8B949E', fontFamily: 'JetBrains Mono', fontSize: '0.68rem' }}>
                            {timeAgo(a.created_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Drawer Actions Footer */}
          <div style={{
            padding: '1rem 1.25rem',
            borderTop: '1px solid #30363D',
            background: '#0D1117',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.6rem',
            justifyContent: 'flex-end',
          }}>
            {drawerData?.bid?.status === 'frozen' ? (
              <button
                onClick={() => {
                  setActionModal({
                    isOpen: true,
                    actionType: 'unfreeze',
                    targetId: selectedBidId,
                    targetTitle: `Unfreeze Bid #${selectedBidId}`,
                    reason: '',
                    submitting: false,
                  });
                }}
                style={{
                  background: 'rgba(46, 160, 67, 0.2)',
                  border: '1px solid #2EA043',
                  color: '#2EA043',
                  borderRadius: '6px',
                  padding: '0.5rem 0.85rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
              >
                <Unlock size={14} /> Unfreeze Bid
              </button>
            ) : (
              <button
                onClick={() => {
                  setActionModal({
                    isOpen: true,
                    actionType: 'freeze',
                    targetId: selectedBidId,
                    targetTitle: `Freeze Bid #${selectedBidId}`,
                    reason: '',
                    submitting: false,
                  });
                }}
                style={{
                  background: 'rgba(218, 54, 51, 0.15)',
                  border: '1px solid #DA3633',
                  color: '#DA3633',
                  borderRadius: '6px',
                  padding: '0.5rem 0.85rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
              >
                <Lock size={14} /> Freeze Bid
              </button>
            )}

            {drawerData?.bid?.status !== 'force_closed' && drawerData?.bid?.status !== 'cancelled' && (
              <button
                onClick={() => {
                  setActionModal({
                    isOpen: true,
                    actionType: 'force_close',
                    targetId: selectedBidId,
                    targetTitle: `Force Close Bid #${selectedBidId}`,
                    reason: '',
                    submitting: false,
                  });
                }}
                style={{
                  background: '#DA3633',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '6px',
                  padding: '0.5rem 0.85rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
              >
                <XCircle size={14} /> Force Close
              </button>
            )}

            {/* FPO Suspension Toggle */}
            <button
              onClick={() => {
                setActionModal({
                  isOpen: true,
                  actionType: 'suspend_fpo',
                  targetId: drawerData?.bid?.fpo_id || 'fpo-user',
                  targetTitle: 'Suspend FPO Bidding Privileges',
                  reason: '',
                  submitting: false,
                });
              }}
              style={{
                background: 'transparent',
                border: '1px solid #30363D',
                color: '#8B949E',
                borderRadius: '6px',
                padding: '0.5rem 0.85rem',
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
              }}
            >
              <Ban size={14} /> Suspend FPO
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ADMINISTRATIVE REASON CONFIRMATION MODAL                               */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {actionModal.isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '1rem',
        }}>
          <div style={{
            background: '#161B22',
            border: '1px solid #30363D',
            borderRadius: '12px',
            width: '480px',
            maxWidth: '100%',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertTriangle size={18} color="#DA3633" />
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#C9D1D9' }}>
                  {actionModal.targetTitle}
                </h3>
              </div>
              <button
                onClick={() => setActionModal(prev => ({ ...prev, isOpen: false }))}
                style={{ background: 'transparent', border: 'none', color: '#8B949E', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.78rem', color: '#8B949E', margin: 0 }}>
              All administrative actions are cryptographically written to the append-only audit trail and dispatch notices to affected stakeholders. A justification reason is strictly required.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.75rem', color: '#C9D1D9', fontWeight: 600 }}>
                Administrative Justification / Reason <span style={{ color: '#DA3633' }}>*</span>
              </label>
              <textarea
                rows={4}
                placeholder="Specify regulatory, MSP compliance, or anomaly justification…"
                value={actionModal.reason}
                onChange={e => setActionModal(prev => ({ ...prev, reason: e.target.value }))}
                style={{
                  background: '#0D1117',
                  border: '1px solid #30363D',
                  borderRadius: '6px',
                  color: '#C9D1D9',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.8rem',
                  fontFamily: 'inherit',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setActionModal(prev => ({ ...prev, isOpen: false }))}
                style={{
                  background: 'transparent',
                  border: '1px solid #30363D',
                  color: '#8B949E',
                  borderRadius: '6px',
                  padding: '0.5rem 1rem',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionModal.submitting}
                onClick={handleExecuteAction}
                style={{
                  background: '#DA3633',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '6px',
                  padding: '0.5rem 1.25rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: actionModal.submitting ? 'not-allowed' : 'pointer',
                  opacity: actionModal.submitting ? 0.6 : 1,
                }}
              >
                {actionModal.submitting ? 'Enforcing…' : 'Confirm Action'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
