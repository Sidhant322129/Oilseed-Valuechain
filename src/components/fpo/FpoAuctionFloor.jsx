// src/components/fpo/FpoAuctionFloor.jsx
// Sovereign Harvest — FPO / Processor Live Mandi Auction Floor
// Features:
//   - Auction Floor: grid of live + scheduled lots with filters, watchlist, live price
//   - Bidder Lot Room: real-time bidding UI with YOU ARE WINNING / OUTBID banner,
//       quick increment buttons, proxy max-bid toggle, total cost preview,
//       bidding limit meter, idempotency-safe submit with button lock.
//   - My Bids: Active (winning/outbid), Won (settle action), Lost tabs.
//   - Requirements Board: post demand (crop, qty, max price >= MSP, deadline).
//   - Top stat cards: active bids, lots won, total value won.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Gavel, TrendingUp, Clock, CheckCircle, AlertTriangle, Eye,
  RefreshCw, X, Star, StarOff, ArrowUpRight, ShieldCheck, Radio,
  Tag, MapPin, Layers, Bell, ChevronRight, Plus, Wallet, Target,
  Package, Filter, Search, Zap, Award, BarChart2, AlertCircle,
  ExternalLink, ClipboardList, Send, Calendar,
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts';
import { apiGet, apiPost } from '@/services/api';
import { supabase } from '@/lib/supabaseClient';
import { getErrorMessage } from '@/utils/getErrorMessage';

// ── Constants ──────────────────────────────────────────────────────────────────
const CCEA_MSP = {
  mustard:   62.50,
  soybean:   51.80,
  groundnut: 71.50,
  sunflower: 76.00,
  sesame:    92.00,
  safflower: 61.50,
  linseed:   60.00,
  castor:    65.00,
  nigerseed: 38.00,
};

const CROP_OPTIONS = ['mustard', 'groundnut', 'soybean', 'sunflower', 'sesame', 'safflower', 'castor', 'nigerseed', 'linseed'];
const GRADE_LABELS = { A: 'Grade A (Export)', B: 'Grade B (Premium)', C: 'Grade C (Standard)', D: 'Grade D (Commercial)' };

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(val, decimals = 2) {
  if (val === null || val === undefined || isNaN(Number(val))) return '₹—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(val));
}

function fmtCompact(val) {
  const n = Number(val);
  if (!n) return '₹0';
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return fmt(n, 0);
}

function computeCountdown(endsAtStr) {
  if (!endsAtStr) return { text: '—', color: '#8B949E', isUrgent: false };
  const diff = new Date(endsAtStr).getTime() - Date.now();
  if (diff <= 0) return { text: 'Closed', color: '#8B949E', isUrgent: false };
  const totalMins = Math.floor(diff / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const secs = Math.floor((diff % 60000) / 1000);
  if (totalMins < 1) return { text: `${secs}s`, color: '#DA3633', isUrgent: true };
  if (totalMins < 5) return { text: `${mins}m ${secs}s`, color: '#E5A93C', isUrgent: true };
  if (hours < 24) return { text: `${hours}h ${mins}m`, color: '#2EA043', isUrgent: false };
  return { text: `${Math.floor(hours / 24)}d ${hours % 24}h`, color: '#C9D1D9', isUrgent: false };
}

function getIncrementStep(currentPrice) {
  const p = Number(currentPrice) || 0;
  if (p < 50) return 0.25;
  if (p <= 100) return 0.50;
  return 1.00;
}

function statusChip(status) {
  const configs = {
    live:      { bg: 'rgba(46,160,67,0.15)',  color: '#2EA043', label: '● LIVE' },
    closing:   { bg: 'rgba(229,169,60,0.15)', color: '#E5A93C', label: '⏳ CLOSING' },
    scheduled: { bg: 'rgba(130,80,255,0.15)', color: '#bc8cff', label: '⏰ Scheduled' },
    sold:      { bg: 'rgba(46,160,67,0.10)',  color: '#4F7A5B', label: '✔ Sold' },
    unsold:    { bg: 'rgba(218,54,51,0.10)',  color: '#DA3633', label: '✕ Unsold' },
    cancelled: { bg: 'rgba(139,148,158,0.15)',color: '#8B949E', label: '✕ Cancelled' },
    draft:     { bg: 'rgba(139,148,158,0.15)',color: '#8B949E', label: 'Draft' },
  };
  const c = configs[status] || configs.draft;
  return (
    <span style={{
      fontSize: '0.65rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '999px',
      background: c.bg, color: c.color, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
    }}>{c.label}</span>
  );
}

// ── Stat Card ──────────────────────────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, color = '#174A36', sub }) => (
  <div className="card" style={{ padding: '1.25rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{label}</span>
      <div style={{ background: `${color}1A`, padding: '6px', borderRadius: '8px' }}>
        <Icon size={16} style={{ color }} />
      </div>
    </div>
    <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
    {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{sub}</div>}
  </div>
);

// ── Toast ──────────────────────────────────────────────────────────────────────
const Toast = ({ msg, onClose }) => {
  if (!msg) return null;
  const isErr = msg.type === 'error';
  return (
    <div style={{
      position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 9999,
      background: isErr ? 'rgba(218,54,51,0.95)' : 'rgba(20,41,31,0.95)',
      color: isErr ? '#fff' : '#2EA043', border: `1px solid ${isErr ? '#DA3633' : '#2EA043'}`,
      padding: '0.75rem 1.25rem', borderRadius: '10px', fontSize: '0.83rem',
      maxWidth: '360px', display: 'flex', alignItems: 'center', gap: '0.65rem',
      boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
    }}>
      {isErr ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
      <span style={{ flex: 1 }}>{msg.text}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
        <X size={14} />
      </button>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════════
export default function FpoAuctionFloor({ session, userProfile }) {
  const [tab, setTab] = useState('floor');
  const [myBidsTab, setMyBidsTab] = useState('active');

  const [lots, setLots] = useState([]);
  const [lotsLoading, setLotsLoading] = useState(true);
  const [watchlist, setWatchlist] = useState(new Set());

  const [filterCrop, setFilterCrop] = useState('');
  const [filterGrade, setFilterGrade] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('live,closing,scheduled');

  const [activeLotId, setActiveLotId] = useState(null);
  const [lotDetail, setLotDetail] = useState(null);
  const [lotLoading, setLotLoading] = useState(false);
  const [priceHistory, setPriceHistory] = useState([]);
  const [priceFlash, setPriceFlash] = useState(false);

  const [bidAmount, setBidAmount] = useState('');
  const [useProxy, setUseProxy] = useState(false);
  const [proxyMax, setProxyMax] = useState('');
  const [bidSubmitting, setBidSubmitting] = useState(false);
  const [confirmModal, setConfirmModal] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [bidError, setBidError] = useState('');

  const [myBids, setMyBids] = useState({ active: [], won: [], lost: [] });
  const [myBidsLoading, setMyBidsLoading] = useState(false);
  const [bidderStats, setBidderStats] = useState({ active_bids: 0, lots_won: 0, total_value_won: 0, available_limit: 500000, blocked_amount: 0 });

  const [requirements, setRequirements] = useState([]);
  const [reqLoading, setReqLoading] = useState(false);
  const [reqForm, setReqForm] = useState({ crop_type: '', quantity_kg: '', max_price_per_kg: '', deadline: '', notes: '' });
  const [reqSubmitting, setReqSubmitting] = useState(false);
  const [reqMsg, setReqMsg] = useState(null);
  const [showReqForm, setShowReqForm] = useState(false);

  const [toast, setToast] = useState(null);
  const realtimeRef = useRef(null);
  const pollRef = useRef(null);
  const prevHighBid = useRef(null);

  function showToast(text, type = 'success') {
    setToast({ text, type });
    setTimeout(() => setToast(null), 5000);
  }

  function newIdempotencyKey() {
    return `bid_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  const fetchLots = useCallback(async () => {
    setLotsLoading(true);
    try {
      const statuses = filterStatus || 'live,closing,scheduled';
      const params = new URLSearchParams({ status: statuses });
      if (filterCrop) params.set('crop_type', filterCrop);
      if (filterGrade) params.set('grade', filterGrade);
      const data = await apiGet(`/auction/lots?${params}`);
      setLots(data.lots || []);
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setLotsLoading(false);
    }
  }, [filterCrop, filterGrade, filterStatus]);

  const fetchLotDetail = useCallback(async (lotId) => {
    if (!lotId) return;
    setLotLoading(true);
    try {
      const data = await apiGet(`/auction/lots/${lotId}`);
      const lot = data.lot || null;
      if (lot && prevHighBid.current !== null && prevHighBid.current !== lot.current_high_bid) {
        setPriceFlash(true);
        setTimeout(() => setPriceFlash(false), 800);
      }
      prevHighBid.current = lot?.current_high_bid;
      setLotDetail(lot);
      setPriceHistory((data.bids || []).map((b, i) => ({ t: i + 1, price: Number(b.amount_per_kg) })));
      if (lot) {
        const step = getIncrementStep(lot.current_high_bid || lot.start_price_per_kg);
        const minBid = lot.current_high_bid
          ? Number(lot.current_high_bid) + step
          : Number(lot.start_price_per_kg);
        setBidAmount(minBid.toFixed(2));
      }
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setLotLoading(false);
    }
  }, []);

  const fetchWatchlist = useCallback(async () => {
    try {
      const data = await apiGet('/auction/watchlist');
      setWatchlist(new Set((data.watchlist || []).map(w => w.lot_id)));
    } catch { /* silent */ }
  }, []);

  const fetchMyBids = useCallback(async () => {
    setMyBidsLoading(true);
    try {
      const data = await apiGet('/auction/my-bids');
      const active = (data.bids || []).filter(b => ['active', 'winning', 'outbid'].includes(b.status));
      const won = (data.bids || []).filter(b => b.status === 'won');
      const lost = (data.bids || []).filter(b => b.status === 'lost');
      setMyBids({ active, won, lost });
      setBidderStats({
        active_bids: active.length,
        lots_won: won.length,
        total_value_won: won.reduce((s, b) => s + (Number(b.amount_per_kg) * Number(b.auction_lots?.qty_kg || 0)), 0),
        available_limit: data.available_limit || 500000,
        blocked_amount: data.blocked_amount || 0,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setMyBidsLoading(false);
    }
  }, []);

  const fetchRequirements = useCallback(async () => {
    setReqLoading(true);
    try {
      const data = await apiGet('/auction/requirements');
      setRequirements(data.requirements || []);
    } catch { /* silent */ }
    finally { setReqLoading(false); }
  }, []);

  useEffect(() => {
    fetchLots();
    fetchWatchlist();
    fetchMyBids();
  }, [fetchLots, fetchWatchlist, fetchMyBids]);

  useEffect(() => {
    if (tab === 'requirements') fetchRequirements();
    if (tab === 'my_bids') fetchMyBids();
  }, [tab, fetchRequirements, fetchMyBids]);

  useEffect(() => {
    if (!activeLotId) return;
    prevHighBid.current = null;
    fetchLotDetail(activeLotId);
    pollRef.current = setInterval(() => fetchLotDetail(activeLotId), 5000);
    try {
      const ch = supabase.channel(`lot_${activeLotId}`)
        .on('broadcast', { event: 'bid_placed' }, () => { fetchLotDetail(activeLotId); fetchMyBids(); })
        .on('broadcast', { event: 'lot_status' }, () => fetchLotDetail(activeLotId))
        .subscribe();
      realtimeRef.current = ch;
    } catch { /* fallback to polling */ }
    return () => {
      clearInterval(pollRef.current);
      if (realtimeRef.current) supabase.removeChannel(realtimeRef.current);
    };
  }, [activeLotId]);

  useEffect(() => {
    if (tab !== 'floor' || activeLotId) return;
    const t = setInterval(fetchLots, 10000);
    return () => clearInterval(t);
  }, [tab, activeLotId, fetchLots]);

  async function toggleWatchlist(lotId) {
    const isWatching = watchlist.has(lotId);
    const updated = new Set(watchlist);
    isWatching ? updated.delete(lotId) : updated.add(lotId);
    setWatchlist(updated);
    try {
      await apiPost('/auction/watchlist', { lot_id: lotId, action: isWatching ? 'remove' : 'add' });
    } catch { setWatchlist(watchlist); }
  }

  function openConfirmModal() {
    setBidError('');
    const amt = parseFloat(bidAmount);
    if (!lotDetail) return;
    const msp = CCEA_MSP[lotDetail.crop_type?.toLowerCase()] || 0;
    if (isNaN(amt)) { setBidError('Enter a valid bid amount'); return; }
    if (amt < msp) { setBidError(`Bid must be at least the statutory MSP of ₹${msp}/kg`); return; }
    const step = getIncrementStep(lotDetail.current_high_bid || lotDetail.start_price_per_kg);
    const minBid = lotDetail.current_high_bid ? Number(lotDetail.current_high_bid) + step : Number(lotDetail.start_price_per_kg);
    if (amt < minBid) { setBidError(`Bid must be at least ₹${minBid.toFixed(2)}/kg (current high + ₹${step} increment)`); return; }
    if (useProxy && proxyMax && parseFloat(proxyMax) < amt) { setBidError('Proxy max must be ≥ your bid amount'); return; }
    setIdempotencyKey(newIdempotencyKey());
    setConfirmModal(true);
  }

  async function submitBid() {
    if (!lotDetail || bidSubmitting) return;
    setBidSubmitting(true);
    setBidError('');
    setConfirmModal(false);
    try {
      const payload = { lot_id: lotDetail.id, amount_per_kg: parseFloat(bidAmount), idempotency_key: idempotencyKey };
      if (useProxy && proxyMax) payload.max_proxy_amount = parseFloat(proxyMax);
      const result = await apiPost('/auction/bid', payload);
      showToast(result.message || 'Bid placed successfully!', 'success');
      fetchLotDetail(activeLotId);
      fetchMyBids();
    } catch (err) {
      const msg = getErrorMessage(err);
      setBidError(msg);
      showToast(msg, 'error');
    } finally {
      setBidSubmitting(false);
    }
  }

  function applyIncrement(multiplier) {
    const step = getIncrementStep(lotDetail?.current_high_bid || lotDetail?.start_price_per_kg || 0);
    const current = parseFloat(bidAmount) || 0;
    setBidAmount((current + step * multiplier).toFixed(2));
  }

  async function submitRequirement(e) {
    e.preventDefault();
    setReqSubmitting(true);
    setReqMsg(null);
    try {
      const msp = CCEA_MSP[reqForm.crop_type] || 0;
      if (parseFloat(reqForm.max_price_per_kg) < msp) {
        setReqMsg({ type: 'error', text: `Max price must be at or above the statutory MSP of ₹${msp}/kg for ${reqForm.crop_type}` });
        setReqSubmitting(false);
        return;
      }
      await apiPost('/auction/requirements', {
        crop_type: reqForm.crop_type,
        quantity_kg: parseFloat(reqForm.quantity_kg),
        max_price_per_kg: parseFloat(reqForm.max_price_per_kg),
        deadline: reqForm.deadline,
        notes: reqForm.notes,
      });
      setReqMsg({ type: 'success', text: 'Requirement posted! Farmers can now list lots against it.' });
      setReqForm({ crop_type: '', quantity_kg: '', max_price_per_kg: '', deadline: '', notes: '' });
      setShowReqForm(false);
      fetchRequirements();
    } catch (err) {
      setReqMsg({ type: 'error', text: getErrorMessage(err) });
    } finally {
      setReqSubmitting(false);
    }
  }

  const filteredLots = lots.filter(lot => {
    if (!filterSearch) return true;
    const q = filterSearch.toLowerCase();
    return lot.crop_type?.toLowerCase().includes(q) || lot.location?.toLowerCase().includes(q);
  });

  const myBidOnLot = lotDetail ? [...myBids.active, ...myBids.won].find(b => b.lot_id === lotDetail.id) : null;
  const isWinning = myBidOnLot?.status === 'winning' || myBidOnLot?.status === 'won';
  const isOutbid = myBidOnLot?.status === 'outbid';

  const inputStyle = {
    background: 'var(--bg-card)', border: '1px solid var(--border-color)',
    borderRadius: '6px', color: 'var(--text-primary)', padding: '0.5rem 0.75rem',
    fontSize: '0.82rem', fontFamily: 'var(--font-body)', outline: 'none', width: '100%',
    boxSizing: 'border-box',
  };

  const tabs = [
    { id: 'floor', label: 'Auction Floor', icon: Gavel },
    { id: 'my_bids', label: `My Bids (${bidderStats.active_bids})`, icon: Target },
    { id: 'requirements', label: 'Requirements Board', icon: ClipboardList },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <style>{`
        @keyframes priceFlashGreen { 0%,100%{background:transparent} 30%{background:rgba(46,160,67,0.28)} }
        @keyframes spin { to{transform:rotate(360deg)} }
      `}</style>
      <Toast msg={toast} onClose={() => setToast(null)} />

      {/* ── Stat Cards ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
        <StatCard icon={Gavel}      label="Active Bids"      color="#E5A93C" value={bidderStats.active_bids}  sub="Live or winning positions" />
        <StatCard icon={Award}      label="Lots Won"         color="#2EA043" value={bidderStats.lots_won}      sub="All-time auction victories" />
        <StatCard icon={Wallet}     label="Total Value Won"  color="#bc8cff" value={fmtCompact(bidderStats.total_value_won)} sub="Settled & pending" />
        <StatCard icon={ShieldCheck} label="Available Limit" color="#174A36" value={fmtCompact(bidderStats.available_limit - bidderStats.blocked_amount)} sub={`${fmtCompact(bidderStats.blocked_amount)} blocked`} />
      </div>

      {/* ── Tab Bar ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '0.1rem' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); if (t.id !== 'floor') setActiveLotId(null); }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', fontSize: '0.82rem', fontWeight: tab === t.id ? 700 : 400, color: tab === t.id ? '#E5A93C' : 'var(--text-muted)', background: 'none', border: 'none', borderBottom: tab === t.id ? '2px solid #E5A93C' : '2px solid transparent', cursor: 'pointer', transition: 'all 0.15s' }}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* AUCTION FLOOR — LOT GRID */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === 'floor' && !activeLotId && (
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '160px' }}>
              <Search size={13} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input placeholder="Search crop, location…" value={filterSearch} onChange={e => setFilterSearch(e.target.value)} style={{ ...inputStyle, paddingLeft: '2rem' }} />
            </div>
            <select value={filterCrop} onChange={e => { setFilterCrop(e.target.value); setTimeout(fetchLots, 0); }} style={{ ...inputStyle, width: 'auto', minWidth: '130px' }}>
              <option value="">All Crops</option>
              {CROP_OPTIONS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
            <select value={filterGrade} onChange={e => { setFilterGrade(e.target.value); setTimeout(fetchLots, 0); }} style={{ ...inputStyle, width: 'auto', minWidth: '130px' }}>
              <option value="">All Grades</option>
              {Object.entries(GRADE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setTimeout(fetchLots, 0); }} style={{ ...inputStyle, width: 'auto', minWidth: '180px' }}>
              <option value="live,closing,scheduled">Live + Scheduled</option>
              <option value="live,closing">Live Only</option>
              <option value="scheduled">Scheduled Only</option>
              <option value="sold">Sold (History)</option>
              <option value="unsold">Unsold (History)</option>
            </select>
            <button onClick={fetchLots} style={{ background: 'var(--bg-sunken)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', padding: '0.5rem 0.75rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>

          {lotsLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[1, 2, 3].map(i => <div key={i} className="card" style={{ padding: '1.25rem', height: '100px', background: 'var(--bg-card)', borderRadius: '12px', opacity: 0.5 }} />)}
            </div>
          ) : filteredLots.length === 0 ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
              <Gavel size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 0.75rem', display: 'block' }} />
              <h3 style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)', marginBottom: '0.5rem' }}>No lots found</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Adjust filters or check back soon.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {[...filteredLots].sort((a, b) => {
                const ord = { live: 0, closing: 0, scheduled: 1, sold: 2, unsold: 3 };
                if ((ord[a.status] ?? 9) !== (ord[b.status] ?? 9)) return (ord[a.status] ?? 9) - (ord[b.status] ?? 9);
                return new Date(a.ends_at) - new Date(b.ends_at);
              }).map(lot => {
                const cd = computeCountdown(lot.ends_at);
                const msp = CCEA_MSP[lot.crop_type?.toLowerCase()] || 0;
                const currentBid = Number(lot.current_high_bid) || Number(lot.start_price_per_kg);
                const premiumPct = msp > 0 ? (((currentBid - msp) / msp) * 100).toFixed(1) : null;
                const isWatched = watchlist.has(lot.id);
                const isLive = lot.status === 'live' || lot.status === 'closing';
                return (
                  <div key={lot.id} className="card" style={{ padding: '1rem 1.25rem', border: isLive ? '1px solid rgba(46,160,67,0.3)' : '1px solid var(--border-color)', cursor: 'pointer', transition: 'border-color 0.2s' }} onClick={() => setActiveLotId(lot.id)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{lot.crop_type}</span>
                          {statusChip(lot.status)}
                          {lot.grade && <span style={{ fontSize: '0.65rem', background: 'var(--bg-sunken)', color: 'var(--text-muted)', padding: '0.15rem 0.45rem', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>{lot.grade}</span>}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          <span><Package size={11} style={{ marginRight: '3px', verticalAlign: 'middle' }} />{Number(lot.qty_kg || 0).toLocaleString('en-IN')} kg</span>
                          <span><MapPin size={11} style={{ marginRight: '3px', verticalAlign: 'middle' }} />{lot.location || '—'}</span>
                          {(lot.bid_count > 0) && <span><Gavel size={11} style={{ marginRight: '3px', verticalAlign: 'middle' }} />{lot.bid_count} bid{lot.bid_count !== 1 ? 's' : ''}</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', minWidth: '130px' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', fontWeight: 700, color: lot.current_high_bid ? '#2EA043' : 'var(--text-primary)' }}>
                          {fmt(currentBid, 2)}<span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>/kg</span>
                        </div>
                        {premiumPct && <div style={{ fontSize: '0.68rem', color: Number(premiumPct) >= 0 ? '#2EA043' : '#DA3633' }}>{Number(premiumPct) >= 0 ? '+' : ''}{premiumPct}% vs MSP</div>}
                        {isLive && <div style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: cd.color, fontWeight: 600, marginTop: '0.2rem' }}>⏱ {cd.text}</div>}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end' }}>
                        <button onClick={e => { e.stopPropagation(); toggleWatchlist(lot.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isWatched ? '#E5A93C' : 'var(--text-muted)', padding: '0.25rem' }} title={isWatched ? 'Remove from watchlist' : 'Watch lot'}>
                          {isWatched ? <Star size={16} fill="#E5A93C" /> : <StarOff size={16} />}
                        </button>
                        {isLive
                          ? <button onClick={e => { e.stopPropagation(); setActiveLotId(lot.id); }} style={{ background: '#174A36', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.35rem 0.7rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Gavel size={12} /> BID NOW</button>
                          : <button onClick={e => { e.stopPropagation(); setActiveLotId(lot.id); }} style={{ background: 'var(--bg-sunken)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.35rem 0.7rem', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Eye size={12} /> View</button>
                        }
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* BIDDER LOT ROOM */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === 'floor' && activeLotId && (
        <div>
          <button onClick={() => { setActiveLotId(null); setLotDetail(null); setBidError(''); setConfirmModal(false); prevHighBid.current = null; }} style={{ background: 'var(--bg-sunken)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: '7px', padding: '0.4rem 0.85rem', fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '1.25rem' }}>
            ← Back to Auction Floor
          </button>

          {(lotLoading && !lotDetail) ? (
            <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
              <RefreshCw size={28} style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 0.75rem' }} />
              <p style={{ color: 'var(--text-muted)' }}>Loading lot details…</p>
            </div>
          ) : !lotDetail ? (
            <div className="card" style={{ padding: '2rem', textAlign: 'center' }}><AlertCircle size={24} style={{ color: '#DA3633', display: 'block', margin: '0 auto 0.5rem' }} /><p style={{ color: 'var(--text-muted)' }}>Lot not found.</p></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(280px, 320px)', gap: '1.25rem', alignItems: 'start' }}>
              {/* LEFT */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Main lot card */}
                <div className="card" style={{ padding: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, textTransform: 'capitalize' }}>{lotDetail.crop_type}</h2>
                        {statusChip(lotDetail.status)}
                        {lotDetail.grade && <span style={{ fontSize: '0.7rem', background: 'var(--bg-sunken)', color: 'var(--text-muted)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>{GRADE_LABELS[lotDetail.grade] || lotDetail.grade}</span>}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.2rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <span><Package size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />{Number(lotDetail.qty_kg).toLocaleString('en-IN')} kg</span>
                        <span><MapPin size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />{lotDetail.location || '—'}</span>
                        <span><Gavel size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />{lotDetail.bid_count || 0} bids</span>
                        <span><Eye size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />{lotDetail.watcher_count || 0} watching</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2rem', fontWeight: 700, color: '#2EA043', animation: priceFlash ? 'priceFlashGreen 0.8s ease' : 'none', borderRadius: '8px', padding: '0.1rem 0.25rem' }}>
                        {fmt(lotDetail.current_high_bid || lotDetail.start_price_per_kg, 2)}<span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 400 }}>/kg</span>
                      </div>
                      {(() => {
                        const msp = CCEA_MSP[lotDetail.crop_type?.toLowerCase()] || 0;
                        const cur = Number(lotDetail.current_high_bid) || Number(lotDetail.start_price_per_kg);
                        const pct = msp > 0 ? (((cur - msp) / msp) * 100).toFixed(1) : null;
                        return pct ? <div style={{ fontSize: '0.75rem', color: Number(pct) >= 0 ? '#2EA043' : '#DA3633' }}>{Number(pct) >= 0 ? '+' : ''}{pct}% vs MSP (₹{msp}/kg)</div> : null;
                      })()}
                      {(lotDetail.status === 'live' || lotDetail.status === 'closing') && (() => {
                        const cd = computeCountdown(lotDetail.ends_at);
                        return <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: cd.color, fontWeight: 700, marginTop: '0.25rem' }}>⏱ {cd.text} remaining</div>;
                      })()}
                    </div>
                  </div>

                  {isWinning && <div style={{ background: 'rgba(46,160,67,0.15)', border: '1px solid #2EA043', borderRadius: '8px', padding: '0.65rem 1rem', color: '#2EA043', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}><CheckCircle size={16} /> YOU ARE WINNING — Your bid of {fmt(myBidOnLot?.amount_per_kg, 2)}/kg is the highest</div>}
                  {isOutbid && <div style={{ background: 'rgba(218,54,51,0.12)', border: '1px solid #DA3633', borderRadius: '8px', padding: '0.65rem 1rem', color: '#DA3633', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}><AlertTriangle size={16} /> YOU'VE BEEN OUTBID — Raise your bid to stay in the race</div>}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.85rem', marginTop: '0.75rem' }}>
                    {[
                      { label: 'Reserve Price', value: `${fmt(lotDetail.reserve_price_per_kg, 2)}/kg` },
                      { label: 'Start Price', value: `${fmt(lotDetail.start_price_per_kg, 2)}/kg` },
                      { label: 'Min Increment', value: `₹${getIncrementStep(lotDetail.current_high_bid || lotDetail.start_price_per_kg)}/kg` },
                      { label: 'Statutory MSP', value: `${fmt(CCEA_MSP[lotDetail.crop_type?.toLowerCase()] || 0, 2)}/kg` },
                      { label: 'Total Quantity', value: `${Number(lotDetail.qty_kg).toLocaleString('en-IN')} kg` },
                      { label: 'Total at Current', value: fmtCompact(Number(lotDetail.current_high_bid || lotDetail.start_price_per_kg) * Number(lotDetail.qty_kg)) },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ background: 'var(--bg-sunken)', borderRadius: '8px', padding: '0.65rem 0.85rem' }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>{label}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: 600 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Price timeline chart */}
                {priceHistory.length > 1 && (
                  <div className="card" style={{ padding: '1.25rem' }}>
                    <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.88rem', color: 'var(--text-primary)', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <BarChart2 size={14} /> Price Discovery Timeline
                    </h4>
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={priceHistory} margin={{ top: 5, right: 10, left: 10, bottom: 15 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#30363D" />
                        <XAxis dataKey="t" stroke="#8B949E" tick={{ fontSize: 10 }} label={{ value: 'Bid #', position: 'insideBottom', offset: -10, fill: '#8B949E', fontSize: 10 }} />
                        <YAxis stroke="#8B949E" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} tickFormatter={v => `₹${v}`} />
                        <Tooltip formatter={v => [`₹${Number(v).toFixed(2)}/kg`, 'Bid']} contentStyle={{ background: '#161B22', border: '1px solid #30363D', borderRadius: '8px', fontSize: '0.8rem', color: '#C9D1D9' }} />
                        {CCEA_MSP[lotDetail.crop_type?.toLowerCase()] && (
                          <ReferenceLine y={CCEA_MSP[lotDetail.crop_type?.toLowerCase()]} stroke="#E5A93C" strokeDasharray="4 2" label={{ value: 'MSP', fill: '#E5A93C', fontSize: 10, position: 'insideTopRight' }} />
                        )}
                        <Line type="monotone" dataKey="price" stroke="#2EA043" strokeWidth={2} dot={{ r: 3, fill: '#2EA043' }} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Anonymized bid ladder */}
                {(lotDetail.bids_ladder?.length > 0) && (
                  <div className="card" style={{ padding: '1.25rem' }}>
                    <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.88rem', color: 'var(--text-primary)', margin: '0 0 0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Layers size={14} /> Bid Ladder — Anonymized
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      {(lotDetail.bids_ladder || []).slice(0, 10).map((b, i) => (
                        <div key={b.id || i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.45rem 0.75rem', background: i === 0 ? 'rgba(46,160,67,0.08)' : 'var(--bg-sunken)', borderRadius: '6px', border: i === 0 ? '1px solid rgba(46,160,67,0.3)' : '1px solid transparent' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: i === 0 ? '#2EA043' : 'var(--text-muted)', width: '24px', fontWeight: 700 }}>#{i + 1}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', color: i === 0 ? '#2EA043' : 'var(--text-primary)', fontWeight: 600, flex: 1 }}>
                            {fmt(b.amount_per_kg, 2)}/kg {b.is_auto && <span style={{ fontSize: '0.65rem', color: '#bc8cff', marginLeft: '4px' }}>AUTO</span>}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{b.bidder_label || `Bidder ${String.fromCharCode(65 + i)}`}</span>
                        </div>
                      ))}
                    </div>
                    <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '0.65rem 0 0' }}>Identities are revealed only after the lot is sold.</p>
                  </div>
                )}
              </div>

              {/* RIGHT — Bid Panel */}
              <div style={{ position: 'sticky', top: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Limit meter */}
                <div className="card" style={{ padding: '1rem' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Bidding Capacity</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
                    <span style={{ color: '#2EA043' }}>{fmtCompact(bidderStats.available_limit - bidderStats.blocked_amount)} free</span>
                    <span style={{ color: 'var(--text-muted)' }}>{fmtCompact(bidderStats.blocked_amount)} blocked</span>
                  </div>
                  <div style={{ height: '6px', background: 'var(--bg-sunken)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, (bidderStats.blocked_amount / (bidderStats.available_limit || 1)) * 100)}%`, background: '#E5A93C', borderRadius: '3px', transition: 'width 0.4s' }} />
                  </div>
                </div>

                {/* Bid form */}
                {(lotDetail.status === 'live' || lotDetail.status === 'closing') ? (
                  <div className="card" style={{ padding: '1.25rem' }}>
                    <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', color: 'var(--text-primary)', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Gavel size={15} /> Place Your Bid
                    </h4>
                    {bidError && (
                      <div style={{ background: 'rgba(218,54,51,0.12)', border: '1px solid rgba(218,54,51,0.4)', borderRadius: '6px', padding: '0.55rem 0.75rem', color: '#DA3633', fontSize: '0.78rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                        <AlertCircle size={13} style={{ flexShrink: 0, marginTop: '1px' }} /> {bidError}
                      </div>
                    )}
                    <div style={{ marginBottom: '0.75rem' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>Quick increment:</div>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {[1, 2, 5].map(mult => {
                          const step = getIncrementStep(lotDetail.current_high_bid || lotDetail.start_price_per_kg);
                          return (
                            <button key={mult} onClick={() => applyIncrement(mult)} style={{ flex: 1, background: 'var(--bg-sunken)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '0.4rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
                              +₹{(step * mult).toFixed(2)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div style={{ marginBottom: '0.75rem' }}>
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Your Bid (₹/kg) *</label>
                      <input type="number" step="0.25" value={bidAmount} onChange={e => setBidAmount(e.target.value)} style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: '1.1rem', textAlign: 'right' }} />
                    </div>
                    {bidAmount && !isNaN(parseFloat(bidAmount)) && lotDetail.qty_kg && (
                      <div style={{ background: 'rgba(46,160,67,0.08)', border: '1px solid rgba(46,160,67,0.2)', borderRadius: '6px', padding: '0.55rem 0.75rem', marginBottom: '0.75rem' }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Total at this bid:</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: '#2EA043', fontWeight: 700 }}>{fmt(parseFloat(bidAmount) * Number(lotDetail.qty_kg), 0)}</div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>₹{parseFloat(bidAmount).toFixed(2)}/kg × {Number(lotDetail.qty_kg).toLocaleString('en-IN')} kg</div>
                      </div>
                    )}
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text-primary)' }}>
                        <input type="checkbox" checked={useProxy} onChange={e => setUseProxy(e.target.checked)} style={{ accentColor: '#E5A93C' }} />
                        Enable Proxy (Auto) Bidding
                      </label>
                      {useProxy && (
                        <div style={{ marginTop: '0.5rem' }}>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Max proxy amount (₹/kg)</label>
                          <input type="number" step="0.25" value={proxyMax} onChange={e => setProxyMax(e.target.value)} placeholder="e.g. 75.00" style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} />
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>System bids minimum needed to win, up to your max.</div>
                        </div>
                      )}
                    </div>
                    <button onClick={openConfirmModal} disabled={bidSubmitting} style={{ width: '100%', background: '#174A36', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.65rem', fontSize: '0.88rem', fontWeight: 700, cursor: bidSubmitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontFamily: 'var(--font-heading)', opacity: bidSubmitting ? 0.6 : 1 }}>
                      <Gavel size={16} /> {bidSubmitting ? 'Placing Bid…' : 'Place Bid'}
                    </button>
                    <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '0.5rem 0 0', textAlign: 'center' }}>Confirmation dialog appears before submission.</p>
                  </div>
                ) : (
                  <div className="card" style={{ padding: '1.25rem', textAlign: 'center' }}>
                    <AlertCircle size={20} style={{ color: 'var(--text-muted)', margin: '0 auto 0.5rem', display: 'block' }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                      {lotDetail.status === 'scheduled' ? 'Bidding opens when the lot goes live.' : lotDetail.status === 'sold' ? 'This lot has been sold.' : lotDetail.status === 'unsold' ? 'This lot did not meet the reserve price.' : 'Bidding is closed for this lot.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Confirm Modal */}
          {confirmModal && lotDetail && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '1rem' }}>
              <div className="card" style={{ padding: '1.75rem', maxWidth: '420px', width: '100%' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ShieldCheck size={18} style={{ color: '#E5A93C' }} /> Confirm Your Bid
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.25rem' }}>
                  {[
                    { label: 'Lot', value: `${lotDetail.crop_type} — ${Number(lotDetail.qty_kg).toLocaleString('en-IN')} kg` },
                    { label: 'Your Bid', value: `${fmt(bidAmount, 2)}/kg` },
                    { label: 'Total Value', value: fmtCompact(parseFloat(bidAmount) * Number(lotDetail.qty_kg)) },
                    ...(useProxy && proxyMax ? [{ label: 'Proxy Max', value: `${fmt(proxyMax, 2)}/kg` }] : []),
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>{value}</span>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>This bid is binding. Retraction requires admin approval and is logged in the audit trail.</p>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button onClick={() => setConfirmModal(false)} style={{ flex: 1, background: 'var(--bg-sunken)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '7px', padding: '0.55rem', fontSize: '0.82rem', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={submitBid} disabled={bidSubmitting} style={{ flex: 1, background: '#174A36', color: '#fff', border: 'none', borderRadius: '7px', padding: '0.55rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                    <Gavel size={14} /> Confirm Bid
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MY BIDS TAB */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === 'my_bids' && (
        <div>
          <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1.25rem' }}>
            {[{ id: 'active', label: `Active (${myBids.active.length})` }, { id: 'won', label: `Won (${myBids.won.length})` }, { id: 'lost', label: `Lost (${myBids.lost.length})` }].map(t => (
              <button key={t.id} onClick={() => setMyBidsTab(t.id)} style={{ padding: '0.5rem 0.9rem', fontSize: '0.8rem', fontWeight: myBidsTab === t.id ? 700 : 400, color: myBidsTab === t.id ? '#E5A93C' : 'var(--text-muted)', background: 'none', border: 'none', borderBottom: myBidsTab === t.id ? '2px solid #E5A93C' : '2px solid transparent', cursor: 'pointer' }}>{t.label}</button>
            ))}
          </div>
          {myBidsLoading ? (
            <div className="card" style={{ padding: '2rem', textAlign: 'center' }}><RefreshCw size={20} style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto' }} /></div>
          ) : myBids[myBidsTab].length === 0 ? (
            <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
              <Gavel size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 0.75rem', display: 'block' }} />
              <h3 style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)', marginBottom: '0.5rem' }}>No {myBidsTab} bids</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{myBidsTab === 'active' ? 'Go to Auction Floor and place bids on live lots.' : myBidsTab === 'won' ? 'Lots you win will appear here for settlement.' : 'Outbid positions will appear here.'}</p>
              {myBidsTab === 'active' && <button onClick={() => setTab('floor')} style={{ marginTop: '0.75rem', background: '#174A36', color: '#fff', border: 'none', borderRadius: '7px', padding: '0.5rem 1rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}><Gavel size={14} /> Go to Auction Floor</button>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {myBids[myBidsTab].map(bid => (
                <div key={bid.id} className="card" style={{ padding: '1rem 1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize', fontSize: '0.95rem' }}>{bid.auction_lots?.crop_type || 'Lot'}</span>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', background: bid.status === 'winning' ? 'rgba(46,160,67,0.15)' : bid.status === 'outbid' ? 'rgba(218,54,51,0.12)' : bid.status === 'won' ? 'rgba(46,160,67,0.1)' : 'var(--bg-sunken)', color: bid.status === 'winning' ? '#2EA043' : bid.status === 'outbid' ? '#DA3633' : bid.status === 'won' ? '#4F7A5B' : 'var(--text-muted)' }}>{bid.status?.toUpperCase()}</span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <span>Bid: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{fmt(bid.amount_per_kg, 2)}/kg</strong></span>
                        {bid.auction_lots?.qty_kg && <span>Total: <strong style={{ fontFamily: 'var(--font-mono)', color: '#2EA043' }}>{fmtCompact(Number(bid.amount_per_kg) * Number(bid.auction_lots.qty_kg))}</strong></span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button onClick={() => { setActiveLotId(bid.lot_id); setTab('floor'); }} style={{ background: 'var(--bg-sunken)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: '6px', padding: '0.35rem 0.65rem', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Eye size={12} /> View Lot</button>
                      {bid.status === 'won' && <button style={{ background: '#174A36', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.35rem 0.7rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Wallet size={12} /> Settle Payment</button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* REQUIREMENTS BOARD TAB */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {tab === 'requirements' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', color: 'var(--text-primary)', margin: '0 0 0.2rem' }}>Procurement Requirements Board</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>Post your crop demand. Farmers see it and list auction lots against your requirements with one click.</p>
            </div>
            <button onClick={() => setShowReqForm(!showReqForm)} style={{ background: '#174A36', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.5rem 1rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
              <Plus size={14} /> Post Requirement
            </button>
          </div>

          {showReqForm && (
            <div className="card" style={{ padding: '1.5rem', marginBottom: '1.25rem', border: '1px solid rgba(229,169,60,0.3)' }}>
              <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', color: '#E5A93C', margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><ClipboardList size={15} /> New Procurement Requirement</h4>
              {reqMsg && <div style={{ background: reqMsg.type === 'success' ? 'rgba(46,160,67,0.12)' : 'rgba(218,54,51,0.12)', border: `1px solid ${reqMsg.type === 'success' ? '#2EA043' : '#DA3633'}`, borderRadius: '6px', padding: '0.55rem 0.75rem', color: reqMsg.type === 'success' ? '#2EA043' : '#DA3633', fontSize: '0.8rem', marginBottom: '1rem' }}>{reqMsg.text}</div>}
              <form onSubmit={submitRequirement}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem', marginBottom: '1rem' }}>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Crop Type *</label>
                    <select required value={reqForm.crop_type} onChange={e => setReqForm(p => ({ ...p, crop_type: e.target.value }))} style={inputStyle}>
                      <option value="">Select crop…</option>
                      {CROP_OPTIONS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Quantity (kg) *</label>
                    <input required type="number" min="100" value={reqForm.quantity_kg} onChange={e => setReqForm(p => ({ ...p, quantity_kg: e.target.value }))} placeholder="e.g. 50000" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>
                      Max Price (₹/kg) * {reqForm.crop_type && <span style={{ color: '#E5A93C' }}>— MSP: ₹{CCEA_MSP[reqForm.crop_type] || '—'}</span>}
                    </label>
                    <input required type="number" step="0.25" value={reqForm.max_price_per_kg} onChange={e => setReqForm(p => ({ ...p, max_price_per_kg: e.target.value }))} placeholder="e.g. 70.00" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Deadline *</label>
                    <input required type="date" min={new Date().toISOString().split('T')[0]} value={reqForm.deadline} onChange={e => setReqForm(p => ({ ...p, deadline: e.target.value }))} style={inputStyle} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>Notes / Specifications</label>
                    <input type="text" value={reqForm.notes} onChange={e => setReqForm(p => ({ ...p, notes: e.target.value }))} placeholder="e.g. Min 99% purity, Grade A preferred, ex-mandi delivery" style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setShowReqForm(false)} style={{ background: 'var(--bg-sunken)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '7px', padding: '0.45rem 0.85rem', fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" disabled={reqSubmitting} style={{ background: '#174A36', color: '#fff', border: 'none', borderRadius: '7px', padding: '0.45rem 0.95rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: reqSubmitting ? 0.6 : 1 }}>
                    <Send size={13} /> {reqSubmitting ? 'Posting…' : 'Post Requirement'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {reqLoading ? (
            <div className="card" style={{ padding: '2rem', textAlign: 'center' }}><RefreshCw size={20} style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto' }} /></div>
          ) : requirements.length === 0 ? (
            <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
              <ClipboardList size={32} style={{ color: 'var(--text-muted)', margin: '0 auto 0.75rem', display: 'block' }} />
              <h3 style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)', marginBottom: '0.5rem' }}>No requirements posted yet</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Post your first procurement requirement to attract farmer lots.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {requirements.map(req => (
                <div key={req.id} className="card" style={{ padding: '1rem 1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize', fontSize: '0.95rem' }}>{req.crop_type}</span>
                        <span style={{ fontSize: '0.65rem', background: 'rgba(229,169,60,0.12)', color: '#E5A93C', border: '1px solid rgba(229,169,60,0.3)', padding: '0.15rem 0.5rem', borderRadius: '999px', fontWeight: 700 }}>DEMAND</span>
                        {req.lots_count > 0 && <span style={{ fontSize: '0.65rem', background: 'rgba(46,160,67,0.12)', color: '#2EA043', padding: '0.15rem 0.5rem', borderRadius: '999px', fontWeight: 700 }}>{req.lots_count} lot{req.lots_count !== 1 ? 's' : ''} listed</span>}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                        <span>Qty: <strong>{Number(req.quantity_kg || 0).toLocaleString('en-IN')} kg</strong></span>
                        <span>Max: <strong style={{ fontFamily: 'var(--font-mono)' }}>₹{req.max_price_per_kg}/kg</strong></span>
                        <span>Deadline: <strong>{req.deadline ? new Date(req.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</strong></span>
                      </div>
                      {req.notes && <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0.35rem 0 0' }}>{req.notes}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
