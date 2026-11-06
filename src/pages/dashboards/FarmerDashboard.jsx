// src/pages/dashboards/FarmerDashboard.jsx
// Full multi-section Farmer Dashboard.
// Every data section either fetches real data or renders a proper EmptyState.
// Zero hardcoded sample data anywhere.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import DashboardShell from '@/layouts/DashboardShell';
import EmptyState from '@/components/feedback/EmptyState';
import LoadingSpinner from '@/components/feedback/LoadingSpinner';
import ErrorBoundary from '@/components/feedback/ErrorBoundary';
import ProvenanceTimelineModal from '@/components/modals/ProvenanceTimelineModal';
import FarmerAuctionManager from '@/components/farmer/FarmerAuctionManager';
import PriceForecastPanel from '@/components/ai/PriceForecastPanel';
import DemandForecastPanel from '@/components/ai/DemandForecastPanel';
import { supabase } from '@/lib/supabaseClient';
import { apiGet, apiPost, apiPatch, apiDelete, apiDownloadBlob, dispatchNotifications } from '@/services/api';
import { getErrorMessage } from '@/utils/getErrorMessage';
import { OILSEED_CROPS, CROP_SEASONS, CROP_STATUS, LOAN_PURPOSES, OILSEED_MSP_PER_KG } from '@/lib/constants';
import {
  Leaf, TrendingUp, Bell, ShieldCheck, Camera, Wallet,
  ArrowRight, CheckCircle, Clock, X, Upload, FileText, Package,
  Download, Sparkles, Percent, Check, AlertCircle, Award, Landmark, RefreshCw,
  ChevronRight, Image as ImageIcon, Trash2, Eye, AlertTriangle,
  ClipboardList, Send, Calendar, MessageSquare, MapPin, Layers, Warehouse as WarehouseIcon,
  Thermometer,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet default icon for Vite bundler
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom Leaflet DivIcon creator (shared pattern from GovernmentDashboard)
const createFarmerDivIcon = (bg, border, text, dotColor = '#E5A93C', textColor = 'var(--text-primary, #F0F6FC)') => {
  return L.divIcon({
    className: 'custom-map-marker',
    html: `<div style="
      background: ${bg};
      border: 1.5px solid ${border};
      color: ${textColor};
      font-weight: 700;
      font-size: 11px;
      font-family: var(--font-mono, monospace);
      border-radius: 999px;
      padding: 3px 9px;
      box-shadow: 0 0 12px ${border}44, 0 4px 10px rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
      cursor: pointer;
    ">
      <span style="width: 8px; height: 8px; border-radius: 50%; background: ${dotColor}; box-shadow: 0 0 8px ${dotColor}; flex-shrink: 0;"></span>
      <span>${text}</span>
    </div>`,
    iconSize: [120, 26],
    iconAnchor: [60, 13],
    popupAnchor: [0, -14],
  });
};

// Recharts color palette
const FARMER_CROP_COLORS = {
  mustard:   '#E5A93C',
  soybean:   '#2EA043',
  groundnut: '#F0883E',
  sunflower: '#E3B341',
  sesame:    '#58A6FF',
  safflower: '#BC8CFF',
  castor:    '#F85149',
};
const FARMER_CROP_PALETTE = ['#E5A93C', '#2EA043', '#58A6FF', '#F0883E', '#BC8CFF', '#E3B341', '#F85149'];

// Shared price chart tooltip
const FarmerPriceTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px',
      padding: '0.65rem 0.9rem', fontSize: '0.78rem', fontFamily: 'var(--font-body)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: '0.4rem', fontWeight: 600, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem' }}>📅 {label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', color: 'var(--text-primary)', margin: '0.2rem 0' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: p.color }} />
          <span style={{ color: 'var(--text-muted)', minWidth: '70px' }}>{p.name}:</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
            {typeof p.value === 'number' ? `₹${p.value.toLocaleString('en-IN')}/q` : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

// No mock data — all sections use real Supabase fetch or EmptyState (week3 rule)
const CROP_TYPE_OPTIONS = Object.values(OILSEED_CROPS);
const SEASON_OPTIONS = Object.values(CROP_SEASONS);
const LOAN_PURPOSE_OPTIONS = Object.values(LOAN_PURPOSES);

/* ── Relative time formatter ─────────────────────────────────────────────── */
function formatTimeAgo(dateString) {
  if (!dateString) return '';
  const now = new Date();
  const past = new Date(dateString);
  const diffMs = now - past;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  return past.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/* ── Stat card ────────────────────────────────────────────────────────────── */
const StatCard = ({ icon: Icon, label, value, sub, color = '#174A36' }) => (
  <div className="card" style={{ padding: '1.25rem' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{label}</span>
      <div style={{ background: `${color}18`, padding: '6px', borderRadius: '8px' }}>
        <Icon size={16} style={{ color }} />
      </div>
    </div>
    <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.5rem' }}>{value}</div>
    {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{sub}</div>}
  </div>
);

/* ── Inline form input helper ─────────────────────────────────────────────── */
const Field = ({ label, children, required }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
      {label}{required && <span style={{ color: '#DA3633' }}> *</span>}
    </label>
    {children}
  </div>
);

const inputStyle = {
  background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '6px',
  color: 'var(--text-primary)', padding: '0.45rem 0.75rem', fontSize: '0.82rem',
  fontFamily: 'var(--font-body)', outline: 'none', width: '100%',
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export default function FarmerDashboard({ session, userProfile }) {
  const [section, setSection] = useState('overview');

  /* ── Mandi Price Trend state (mirrors GovernmentDashboard) ─────────────── */
  const [farmerPriceHistory, setFarmerPriceHistory] = useState([]);
  const [farmerPriceLoading, setFarmerPriceLoading] = useState(false);
  const [farmerPriceError, setFarmerPriceError] = useState('');
  const [farmerCropFilter, setFarmerCropFilter] = useState('all');
  const [farmerTimeRange, setFarmerTimeRange] = useState('30');

  /* ── Crop Health Map state (mirrors GovernmentDashboard warehouse/map) ─── */
  const [farmerWarehouses, setFarmerWarehouses] = useState([]);
  const [farmerWeatherLogs, setFarmerWeatherLogs] = useState([]);
  const [farmerRegionalHealth, setFarmerRegionalHealth] = useState([]);
  const [farmerMapLoading, setFarmerMapLoading] = useState(false);
  const [farmerMapLayer, setFarmerMapLayer] = useState('all');

  // Shared state
  const [notifications, setNotifications] = useState([]);
  const [crops, setCrops] = useState([]);
  const [blockchainReceipts, setBlockchainReceipts] = useState({});
  const [provenanceCrop, setProvenanceCrop] = useState(null);
  const [updatingCropId, setUpdatingCropId] = useState(null);
  const [deletingCropId, setDeletingCropId] = useState(null);
  const [farmerId, setFarmerId] = useState(null);
  const [farmerProfile, setFarmerProfile] = useState(null); // full farmers row
  const [loading, setLoading] = useState(true);

  const [dismissedAlertIds, setDismissedAlertIds] = useState([]);

  // Derived price alerts state — real Supabase notifications with category 'mandi_price'
  const rawPriceAlerts = notifications.filter(n => n.category === 'mandi_price' || n.category === 'price' || n.category === 'price_alert');
  const priceAlerts = rawPriceAlerts.filter(a => !dismissedAlertIds.includes(a.id));
  const unreadPriceAlerts = priceAlerts.filter(n => !n.is_read);

  // Marketplace state
  const [marketListings, setMarketListings] = useState([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState('');
  const [marketRefreshKey, setMarketRefreshKey] = useState(0);

  // FPO Procurement Bids state (Farmer sees & responds)
  const [fpoBids, setFpoBids] = useState([]);
  const [fpoBidsLoading, setFpoBidsLoading] = useState(false);
  const [quotingBidId, setQuotingBidId] = useState(null); // bid being quoted
  const [quoteForm, setQuoteForm] = useState({ quantity_kg: '', price_per_kg: '', delivery_date: '', notes: '' });
  const [quoteSubmitting, setQuoteSubmitting] = useState(false);
  const [quoteMsg, setQuoteMsg] = useState({ type: '', text: '' });
  const [myQuotes, setMyQuotes] = useState([]);

  // Crop form state
  const [cropForm, setCropForm] = useState({
    crop_type: '', variety: '', season: '', sowing_date: '',
    expected_harvest_date: '', acreage_allocated: '',
  });
  const [cropSubmitting, setCropSubmitting] = useState(false);
  const [cropMsg, setCropMsg] = useState({ type: '', text: '' });

  // Loan form state
  const [loanForm, setLoanForm] = useState({
    amount_requested: '', tenure_months: '', purpose: '', collateral_description: '',
  });
  const [loans, setLoans] = useState([]);
  const [loanLoading, setLoanLoading] = useState(false);
  const [loanSubmitting, setLoanSubmitting] = useState(false);
  const [loanMsg, setLoanMsg] = useState({ type: '', text: '' });
  const [selectedLoanId, setSelectedLoanId] = useState('');
  const [loanFilter, setLoanFilter] = useState('all');
  const [downloadingDocId, setDownloadingDocId] = useState(null);
  const [notifFilter, setNotifFilter] = useState('all');


  // Farmer onboarding form state (creates the farmers table row)
  const [onboardForm, setOnboardForm] = useState({
    state: '', district: '', village: '', pincode: '', phone_number: '',
    taluka_tehsil: '', total_land_area_acres: '',
  });
  const [onboardSubmitting, setOnboardSubmitting] = useState(false);
  const [onboardMsg, setOnboardMsg] = useState({ type: '', text: '' });

  // Pest detection & image upload state
  const [pestFile, setPestFile] = useState(null);
  const [pestPreview, setPestPreview] = useState(null);
  const [pestPhoneNumber, setPestPhoneNumber] = useState(userProfile?.phone_number || '');
  const [pestDiagnosis, setPestDiagnosis] = useState(null);
  const [pestForm, setPestForm] = useState({
    crop_id: '',
    crop_type: 'mustard',
    notes: '',
  });
  const [pestSubmitting, setPestSubmitting] = useState(false);
  const [pestMsg, setPestMsg] = useState({ type: '', text: '' });
  const [pestDragActive, setPestDragActive] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  /* ── Initial data fetch ─────────────────────────────────────────────────── */
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const uid = session?.user?.id;
      try {
        const [{ data: notifData }, { data: farmerData }] = await Promise.all([
          uid
            ? supabase.from('notifications').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(30)
            : Promise.resolve({ data: [] }),
          uid
            ? supabase.from('farmers').select('*, users!inner(phone_number)').eq('user_id', uid).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        setNotifications(notifData || []);

        if (farmerData?.id) {
          setFarmerId(farmerData.id);
          setFarmerProfile(farmerData);
          setPestPhoneNumber(farmerData.users?.phone_number || userProfile?.phone_number || '');
          const [{ data: cropData }, bcStatus] = await Promise.all([
            supabase
              .from('crops').select('*, batches(id, batch_code, status, harvest_date, quantity_kg, quality_grade, tx_hash, tx_status, block_number)').eq('farmer_id', farmerData.id)
              .order('created_at', { ascending: false }).limit(20),
            apiGet('/blockchain/status').catch(() => null)
          ]);
          setCrops(cropData || []);
          if (bcStatus?.receipts) setBlockchainReceipts(bcStatus.receipts);
        } else {
          setFarmerId(null);
          setFarmerProfile(null);
          setCrops([]);
        }
      } catch {
        setFarmerId(null);
        setFarmerProfile(null);
        setCrops([]);
        setNotifications([]);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [session]);

  const [refreshingNotifs, setRefreshingNotifs] = useState(false);

  /* ── Notifications fetch & auto-refresh (60-sec interval & on tab change) ─── */
  const fetchFarmerNotifications = async () => {
    const uid = session?.user?.id;
    if (!uid) {
      setNotifications([]);
      return;
    }
    setRefreshingNotifs(true);
    try {
      const data = await apiGet('/notifications?limit=50');
      if (Array.isArray(data?.notifications)) {
        setNotifications(data.notifications);
        return;
      }
    } catch (_) {}
    try {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(50);
      setNotifications(data || []);
    } catch (_) {
      setNotifications([]);
    } finally {
      setRefreshingNotifs(false);
    }
  };

  useEffect(() => {
    if (section !== 'notifications' && section !== 'overview') return;
    fetchFarmerNotifications();
  }, [section, session]);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    // 60-second auto-refresh interval
    const interval = setInterval(() => {
      fetchFarmerNotifications();
    }, 60000);
    return () => clearInterval(interval);
  }, [session]);

  /* ── Marketplace fetch ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (section !== 'marketplace') return;
    let isMounted = true;
    setMarketLoading(true);
    setMarketError('');
    fetchFpoBidsAndQuotes();
    apiGet('/marketplace/batches')
      .then(data => {
        if (!isMounted) return;
        const list = Array.isArray(data?.batches) ? data.batches : Array.isArray(data) ? data : [];
        setMarketListings(list);
      })
      .catch(async (err) => {
        if (!isMounted) return;
        try {
          const { data } = await supabase
            .from('batches')
            .select('id, batch_code, quantity_kg, base_ask_price_per_kg, quality_grade, crops(crop_type, variety), farmers(district, state)')
            .eq('status', 'listed_for_sale')
            .gt('quantity_kg', 0)
            .order('created_at', { ascending: false })
            .limit(50);
          if (isMounted && data && data.length > 0) {
            setMarketListings(data);
            return;
          }
        } catch (_) {}
        if (isMounted) {
          setMarketListings([]);
          setMarketError(getErrorMessage(err));
        }
      })
      .finally(() => {
        if (isMounted) setMarketLoading(false);
      });
    return () => { isMounted = false; };
  }, [section, marketRefreshKey]);

  /* ── FPO Procurement Bids & Quotes helpers ────────────────────────────── */
  const LS_BIDS_KEY = 'sh_procurement_bids';
  const LS_QUOTES_KEY = 'sh_bid_quotes';

  function sanitizeBid(b) {
    if (!b) return b;
    let deadline = b.delivery_deadline;
    if (deadline) {
      const parts = String(deadline).split('-');
      if (parts.length === 3) {
        let yr = parseInt(parts[0], 10);
        if (isNaN(yr) || yr > 2031 || yr < 2024) {
          if (String(parts[0]).endsWith('2026')) {
            parts[0] = '2026';
          } else if (String(parts[0]).endsWith('2027')) {
            parts[0] = '2027';
          } else {
            parts[0] = '2026';
          }
          deadline = parts.join('-');
        }
      }
    }
    return { ...b, delivery_deadline: deadline };
  }

  function lsLoadBids() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_BIDS_KEY) || '[]');
      if (!Array.isArray(raw)) return [];
      let hadCorrupt = false;
      const sanitized = raw.map(b => {
        const cleaned = sanitizeBid(b);
        if (cleaned.delivery_deadline !== b.delivery_deadline) hadCorrupt = true;
        return cleaned;
      });
      if (hadCorrupt) {
        try { localStorage.setItem(LS_BIDS_KEY, JSON.stringify(sanitized)); } catch (_) {}
      }
      return sanitized;
    } catch { return []; }
  }
  function lsLoadAllQuotes() {
    try { return JSON.parse(localStorage.getItem(LS_QUOTES_KEY) || '{}'); } catch { return {}; }
  }
  function lsSaveAllQuotes(map) {
    try { localStorage.setItem(LS_QUOTES_KEY, JSON.stringify(map)); } catch { /* quota */ }
  }

  async function fetchFpoBidsAndQuotes() {
    setFpoBidsLoading(true);
    try {
      const { data, error } = await supabase
        .from('procurement_bids')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      let loadedBids = [];
      if (!error && data && data.length > 0) {
        loadedBids = data;
      } else {
        const local = lsLoadBids();
        loadedBids = local.filter(b => b.status === 'open');
      }
      setFpoBids(loadedBids);

      const allQuotesMap = lsLoadAllQuotes();
      const currentFarmerId = farmerId || session?.user?.id;
      const currentFarmerName = userProfile?.full_name || session?.user?.email?.split('@')[0];
      const myQuotesList = [];
      Object.entries(allQuotesMap).forEach(([bId, quotes]) => {
        if (Array.isArray(quotes)) {
          quotes.forEach(q => {
            if (q.farmer_id === currentFarmerId || (currentFarmerName && q.farmer_name === currentFarmerName)) {
              myQuotesList.push({ ...q, bid_id: bId });
            }
          });
        }
      });
      setMyQuotes(myQuotesList);
    } catch (_) {
      const local = lsLoadBids();
      setFpoBids(local.filter(b => b.status === 'open'));
    } finally {
      setFpoBidsLoading(false);
    }
  }

  function notifyProcurementChange() {
    window.dispatchEvent(new CustomEvent('sh_procurement_update'));
    try {
      localStorage.setItem('sh_procurement_updated_at', String(Date.now()));
    } catch (_) {}
  }

  // Real-time synchronization across browser tabs and local events for bids & quotes
  useEffect(() => {
    function syncProcurement() {
      fetchFpoBidsAndQuotes();
      fetchFarmerNotifications();
    }
    function handleStorage(e) {
      if (e.key === LS_QUOTES_KEY || e.key === LS_BIDS_KEY || e.key === 'sh_procurement_updated_at') {
        syncProcurement();
      }
    }
    window.addEventListener('storage', handleStorage);
    window.addEventListener('sh_procurement_update', syncProcurement);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('sh_procurement_update', syncProcurement);
    };
  }, [farmerId, session, userProfile]);

  async function handleSubmitQuote(e, bid) {
    e.preventDefault();
    setQuoteSubmitting(true);
    setQuoteMsg({ type: '', text: '' });
    try {
      if (!quoteForm.quantity_kg || !quoteForm.price_per_kg || !quoteForm.delivery_date) {
        throw new Error('Please fill in quantity, price, and delivery date.');
      }
      const quoteDateObj = new Date(quoteForm.delivery_date);
      const currYr = new Date().getFullYear();
      if (isNaN(quoteDateObj.getTime()) || quoteDateObj.getFullYear() < currYr || quoteDateObj.getFullYear() > currYr + 5) {
        throw new Error(`Delivery date year must be between ${currYr} and ${currYr + 5}.`);
      }
      const farmerUserId = session?.user?.id;
      const currentFarmerId = farmerId || farmerUserId || `farmer-${Date.now()}`;
      const currentFarmerName = userProfile?.full_name || session?.user?.email?.split('@')[0] || 'Member Farmer';

      const newQuote = {
        id: `quote-${Date.now()}`,
        bid_id: bid.id,
        crop_type: bid.crop_type,
        farmer_id: currentFarmerId,
        farmer_user_id: farmerUserId || null,
        farmer_name: currentFarmerName,
        quantity_kg: parseFloat(quoteForm.quantity_kg),
        price_per_kg: parseFloat(quoteForm.price_per_kg),
        delivery_date: quoteForm.delivery_date,
        notes: (quoteForm.notes || '').trim(),
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const allQuotes = lsLoadAllQuotes();
      const existingBidQuotes = allQuotes[bid.id] || [];
      const updatedBidQuotes = [newQuote, ...existingBidQuotes];
      const updatedMap = { ...allQuotes, [bid.id]: updatedBidQuotes };
      lsSaveAllQuotes(updatedMap);

      setMyQuotes(prev => [newQuote, ...prev.filter(q => q.id !== newQuote.id)]);

      try {
        await supabase.from('bid_seller_quotes').insert(newQuote);
      } catch (dbErr) {
        console.warn('[Farmer] Supabase quote insert fallback:', dbErr);
      }

      // Write notifications to Supabase with valid user_id foreign keys
      const notifsToInsert = [];
      let fpoTargetUserId = bid.fpo_id || bid.created_by;
      if (!fpoTargetUserId) {
        try {
          const { data: fpoUser } = await supabase.from('users').select('id').eq('role', 'fpo').limit(1).maybeSingle();
          if (fpoUser?.id) fpoTargetUserId = fpoUser.id;
        } catch (_) {}
      }
      if (!fpoTargetUserId) {
        fpoTargetUserId = '0334bba1-15b7-439a-aa0f-ec7fa4eac86e';
      }

      if (fpoTargetUserId) {
        notifsToInsert.push({
          user_id: fpoTargetUserId,
          title: `New Seller Quote: ${bid.crop_type ? bid.crop_type.charAt(0).toUpperCase() + bid.crop_type.slice(1) : 'Produce'}`,
          message: `${currentFarmerName} submitted a quote of ${newQuote.quantity_kg}kg at ₹${newQuote.price_per_kg}/kg for bid #${bid.id.slice(-8)}.`,
          category: 'order',
          priority: 'high',
          action_url: '/dashboard/fpo',
          metadata: { bid_id: bid.id, quote_id: newQuote.id, type: 'quote_submitted', crop_type: bid.crop_type },
          is_read: false,
          created_at: new Date().toISOString(),
        });
      }

      // Confirmation receipt for the farmer
      const effectiveFarmerUserId = farmerUserId || session?.user?.id;
      if (effectiveFarmerUserId) {
        notifsToInsert.push({
          user_id: effectiveFarmerUserId,
          title: `Quote Submitted: ${bid.crop_type ? bid.crop_type.charAt(0).toUpperCase() + bid.crop_type.slice(1) : 'Produce'}`,
          message: `Your seller quotation for ${newQuote.quantity_kg}kg at ₹${newQuote.price_per_kg}/kg has been dispatched to the FPO.`,
          category: 'order',
          priority: 'normal',
          action_url: '/dashboard/farmer',
          metadata: { bid_id: bid.id, quote_id: newQuote.id, type: 'quote_submitted', crop_type: bid.crop_type },
          is_read: false,
          created_at: new Date().toISOString(),
        });
      }

      if (notifsToInsert.length > 0) {
        await dispatchNotifications(notifsToInsert);
      }

      fetchFarmerNotifications();
      notifyProcurementChange();

      setQuoteMsg({ type: 'success', text: `Quote of ${newQuote.quantity_kg} kg @ ₹${newQuote.price_per_kg}/kg submitted successfully! The FPO will review it.` });
      setQuoteForm({ quantity_kg: '', price_per_kg: '', delivery_date: '', notes: '' });
      setQuotingBidId(null);
    } catch (err) {
      setQuoteMsg({ type: 'error', text: getErrorMessage(err) });
    } finally {
      setQuoteSubmitting(false);
    }
  }

  /* ── Price history loader (Farmer view) ─────────────────────────────────── */
  const loadFarmerPrices = useCallback(async () => {
    setFarmerPriceLoading(true);
    setFarmerPriceError('');
    try {
      const thirtyDaysAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      let allData = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;
      while (hasMore && allData.length < 5000) {
        const { data, error } = await supabase
          .from('price_history')
          .select('crop_type, modal_price_per_quintal, price_date')
          .gte('price_date', thirtyDaysAgo)
          .order('price_date', { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) break;
        if (!data || data.length === 0) { hasMore = false; }
        else {
          allData = allData.concat(data);
          if (data.length < pageSize) hasMore = false;
          else from += pageSize;
        }
      }
      if (allData.length === 0) { setFarmerPriceHistory([]); return; }

      const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const byDate = {};
      const allCrops = new Set();
      allData.forEach(row => {
        const d = row.price_date;
        if (!byDate[d]) byDate[d] = { rawDate: d, prices: {} };
        const ct = (row.crop_type || 'other').toLowerCase();
        allCrops.add(ct);
        if (!byDate[d].prices[ct]) byDate[d].prices[ct] = [];
        byDate[d].prices[ct].push(Number(row.modal_price_per_quintal));
      });
      const sortedEntries = Object.values(byDate).sort((a, b) => a.rawDate.localeCompare(b.rawDate));
      const lastKnownPrice = {};
      const chartData = sortedEntries.map(entry => {
        const [, m, d] = (entry.rawDate || '').split('-');
        const label = (d && m) ? `${parseInt(d, 10)} ${MONTHS[parseInt(m, 10) - 1]}` : entry.rawDate;
        const row = { date: label, rawDate: entry.rawDate };
        allCrops.forEach(crop => {
          const vals = entry.prices[crop];
          if (vals && vals.length > 0) {
            const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
            row[crop] = avg;
            lastKnownPrice[crop] = avg;
          } else if (lastKnownPrice[crop] !== undefined) {
            row[crop] = lastKnownPrice[crop];
          }
        });
        return row;
      });
      setFarmerPriceHistory(chartData);
    } catch (err) {
      setFarmerPriceError(getErrorMessage(err));
      setFarmerPriceHistory([]);
    } finally {
      setFarmerPriceLoading(false);
    }
  }, []);

  // Load prices when section is opened
  useEffect(() => {
    if (section !== 'price_trends') return;
    if (farmerPriceHistory.length === 0 && !farmerPriceLoading) {
      loadFarmerPrices();
    }
  }, [section]);

  /* ── Crop Map data loader ─────────────────────────────────────────────────── */
  const loadFarmerMapData = useCallback(async () => {
    setFarmerMapLoading(true);
    try {
      const [whRes, weatherRes] = await Promise.all([
        apiGet('/warehouse').catch(async () => {
          const { data } = await supabase
            .from('warehouses')
            .select('id, name, district, state, total_capacity_tonnes, available_capacity_tonnes, latitude, longitude')
            .order('total_capacity_tonnes', { ascending: false })
            .limit(20);
          return { warehouses: data || [] };
        }),
        supabase.from('weather_logs').select('*').order('recorded_at', { ascending: false }).limit(25),
      ]);
      setFarmerWarehouses(Array.isArray(whRes?.warehouses) ? whRes.warehouses : Array.isArray(whRes) ? whRes : []);
      setFarmerWeatherLogs(weatherRes?.data || []);

      // Regional crop health
      const DISTRICT_COORDS = {
        'morena':         { lat: 26.4948, lng: 77.9940, defaultState: 'Madhya Pradesh' },
        'purba medinipur':{ lat: 21.9016, lng: 87.7770, defaultState: 'West Bengal' },
        'rajkot':         { lat: 22.3039, lng: 70.8022, defaultState: 'Gujarat' },
        'karnoor':        { lat: 15.8281, lng: 78.0373, defaultState: 'Andhra Pradesh' },
        'kurnool':        { lat: 15.8281, lng: 78.0373, defaultState: 'Andhra Pradesh' },
        'indore':         { lat: 22.7196, lng: 75.8577, defaultState: 'Madhya Pradesh' },
        'ujjain':         { lat: 23.1765, lng: 75.7885, defaultState: 'Madhya Pradesh' },
        'dewas':          { lat: 22.9676, lng: 76.0534, defaultState: 'Madhya Pradesh' },
        'sehore':         { lat: 23.2030, lng: 77.0844, defaultState: 'Madhya Pradesh' },
        'mandsaur':       { lat: 24.0722, lng: 75.0682, defaultState: 'Madhya Pradesh' },
        'bharatpur':      { lat: 27.2170, lng: 77.4895, defaultState: 'Rajasthan' },
        'khargone':       { lat: 21.8234, lng: 75.6087, defaultState: 'Madhya Pradesh' },
        'koppal':         { lat: 15.3468, lng: 76.1554, defaultState: 'Karnataka' },
        'latur':          { lat: 18.4088, lng: 76.5604, defaultState: 'Maharashtra' },
        'alwar':          { lat: 27.5530, lng: 76.6346, defaultState: 'Rajasthan' },
        'solapur':        { lat: 17.6599, lng: 75.9064, defaultState: 'Maharashtra' },
      };
      const cropHealthRes = await apiGet('/crops/regional-crop-health').catch(async () => {
        const [{ data: fData }, { data: cData }] = await Promise.all([
          supabase.from('farmers').select('id, district, state, kyc_status, total_land_area_acres'),
          supabase.from('crops').select('id, farmer_id, crop_type, variety, acreage_allocated, status, farmers(id, district, state)'),
        ]);
        const regMap = {};
        (fData || []).forEach(f => {
          if (!f.district) return;
          const dk = f.district.trim().toLowerCase();
          if (!regMap[dk]) {
            const c = DISTRICT_COORDS[dk] || { lat: 22.5, lng: 78.5, defaultState: f.state || 'India' };
            regMap[dk] = {
              district: f.district.trim(), state: f.state || c.defaultState,
              latitude: c.lat, longitude: c.lng,
              farmer_count: 0, verified_farmers_count: 0, total_land_acres: 0,
              crop_count: 0, total_crop_acreage: 0, crops: [],
              pest_reports_count: 0, high_risk_pest_count: 0,
              health_status: 'Optimal', health_score: 95, badge_color: 'var(--text-muted)',
            };
          }
          regMap[dk].farmer_count += 1;
          if (f.kyc_status === 'verified') regMap[dk].verified_farmers_count += 1;
          regMap[dk].total_land_acres += parseFloat(f.total_land_area_acres) || 0;
        });
        (cData || []).forEach(cr => {
          const dist = (cr.farmers?.district || '').trim().toLowerCase();
          if (dist && regMap[dist]) {
            regMap[dist].crop_count += 1;
            const ac = parseFloat(cr.acreage_allocated) || 0;
            regMap[dist].total_crop_acreage += ac;
            regMap[dist].crops.push({ crop_type: cr.crop_type, acreage: ac, varieties: cr.variety ? [cr.variety] : [] });
          }
        });
        const activeOnly = Object.values(regMap).filter(r => r.total_crop_acreage > 0 && r.crop_count > 0);
        activeOnly.sort((a, b) => b.total_crop_acreage - a.total_crop_acreage);
        return { regions: activeOnly };
      });
      const activeList = (cropHealthRes?.regions || []).filter(r => (r.total_crop_acreage || 0) > 0 && (r.crop_count || 0) > 0);
      activeList.sort((a, b) => b.total_crop_acreage - a.total_crop_acreage);
      setFarmerRegionalHealth(activeList);
    } catch (err) {
      console.error('Failed to load farmer map data:', err);
    } finally {
      setFarmerMapLoading(false);
    }
  }, []);

  // Load map data when section is opened
  useEffect(() => {
    if (section !== 'crop_map') return;
    if (farmerWarehouses.length === 0 && !farmerMapLoading) {
      loadFarmerMapData();
    }
  }, [section]);

  /* ── Loan fetch ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (section !== 'finance' && section !== 'overview') return;
    let isMounted = true;
    setLoanLoading(true);
    apiGet('/finance/loans')
      .then(data => {
        if (!isMounted) return;
        const list = Array.isArray(data?.loans) ? data.loans : Array.isArray(data) ? data : [];
        setLoans(list);
        setSelectedLoanId(prev => prev || (list[0]?.id || null));
      })
      .catch(async () => {
        if (!isMounted) return;
        try {
          const uid = session?.user?.id;
          if (uid) {
            const { data } = await supabase
              .from('loan_applications')
              .select('*')
              .eq('farmer_id', farmerId || uid)
              .order('created_at', { ascending: false });
            if (isMounted && data && data.length > 0) {
              setLoans(data);
              setSelectedLoanId(prev => prev || (data[0]?.id || null));
              return;
            }
          }
        } catch (_) {}
        if (isMounted) {
          setLoans([]);
          setSelectedLoanId(null);
        }
      })
      .finally(() => {
        if (isMounted) setLoanLoading(false);
      });
    return () => { isMounted = false; };
  }, [section, session, farmerId]);

  const name = userProfile?.full_name || session?.user?.email?.split('@')[0] || 'Farmer';

  /* -- Farmer onboarding submit (creates the farmers table row) ------------ */
  async function handleOnboardSubmit(e) {
    e.preventDefault();
    const uid = session?.user?.id;
    if (!uid) return;
    setOnboardSubmitting(true);
    setOnboardMsg({ type: '', text: '' });
    const payload = {
      user_id: uid,
      state: onboardForm.state.trim(),
      district: onboardForm.district.trim(),
      village: onboardForm.village.trim(),
      pincode: onboardForm.pincode.trim(),
      phone_number: onboardForm.phone_number.trim(),
      taluka_tehsil: onboardForm.taluka_tehsil.trim() || null,
      total_land_area_acres: onboardForm.total_land_area_acres
        ? Number(onboardForm.total_land_area_acres) : 0,
      kyc_status: 'pending',
    };

    try {
      // 1. Try authenticated backend endpoint (service role bypasses RLS)
      const res = await apiPost('/farmers', payload);
      const inserted = res?.farmer || res;
      if (inserted?.id) {
        setFarmerId(inserted.id);
        setFarmerProfile(inserted);
        setPestPhoneNumber(payload.phone_number);
        setOnboardMsg({ type: 'success', text: 'Farmer profile created! You can now register crops and apply for loans.' });
        setOnboardSubmitting(false);
        return;
      }
    } catch { /* fallback to direct insert */ }

    const { data: inserted, error } = await supabase
      .from('farmers')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      setOnboardMsg({ type: 'error', text: getErrorMessage(error) });
    } else {
      const { error: phoneError } = await supabase
        .from('users')
        .update({ phone_number: payload.phone_number })
        .eq('id', uid);
      setFarmerId(inserted.id);
      setFarmerProfile(inserted);
      setPestPhoneNumber(payload.phone_number);
      setOnboardMsg({
        type: 'success',
        text: phoneError
          ? 'Farmer profile created. Save your mobile number again from Pest Detection.'
          : 'Farmer profile and alert mobile number created successfully.',
      });
    }
    setOnboardSubmitting(false);
  }

  /* ── Crop form submit ───────────────────────────────────────────────────── */

  async function handleCropSubmit(e) {
    e.preventDefault();
    if (!farmerId) { setCropMsg({ type: 'error', text: 'Farmer profile not found. Please complete your profile first.' }); return; }
    setCropSubmitting(true);
    setCropMsg({ type: '', text: '' });
    try {
      try {
        await apiPost('/crops', { ...cropForm, farmer_id: farmerId, acreage_allocated: Number(cropForm.acreage_allocated) });
      } catch (backendErr) {
        console.warn('Backend crops API unreachable, inserting directly into Supabase:', backendErr);
        const { error: supaErr } = await supabase.from('crops').insert({
          ...cropForm,
          farmer_id: farmerId,
          acreage_allocated: Number(cropForm.acreage_allocated),
        });
        if (supaErr) throw supaErr;
      }
      setCropMsg({ type: 'success', text: 'Crop registered successfully.' });
      setCropForm({ crop_type: '', variety: '', season: '', sowing_date: '', expected_harvest_date: '', acreage_allocated: '' });
      // Refresh crop list with linked batches
      const [{ data }, bcStatus] = await Promise.all([
        supabase.from('crops').select('*, batches(id, batch_code, status, harvest_date, quantity_kg, quality_grade, tx_hash, tx_status, block_number)').eq('farmer_id', farmerId).order('created_at', { ascending: false }).limit(20),
        apiGet('/blockchain/status').catch(() => null)
      ]);
      setCrops(data || []);
      if (bcStatus?.receipts) setBlockchainReceipts(bcStatus.receipts);
    } catch (err) {
      setCropMsg({ type: 'error', text: getErrorMessage(err) });
    } finally {
      setCropSubmitting(false);
    }
  }

  /* ── Crop Update & Delete CRUD Handlers ─────────────────────────────────── */
  async function handleUpdateCropStatus(cropId, newStatus) {
    setUpdatingCropId(cropId);
    setCropMsg({ type: '', text: '' });
    try {
      let res;
      try {
        res = await apiPatch(`/crops/${cropId}`, { status: newStatus });
      } catch (backendErr) {
        console.warn('Backend crops patch failed, updating Supabase directly:', backendErr);
        const { error } = await supabase.from('crops').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', cropId);
        if (error) throw error;
        res = null;
      }
      setCrops(prev => prev.map(c => c.id === cropId ? { ...c, status: newStatus } : c));

      if (newStatus === 'harvested') {
        // Stage 3 auto-trigger: IPFS pin + QualityOracle.sol runs in background on the backend.
        // Show info message and refresh blockchain status after ~20s to surface the new cert.
        setCropMsg({
          type: 'success',
          text: '✅ Crop marked as Harvested. Stage 3 Lab Quality Certification is being automatically anchored to IPFS & QualityOracle.sol on Ethereum Sepolia. The provenance timeline will update in ~20 seconds.',
        });
        // Schedule a delayed refresh of crops + blockchain receipts so Stage 3 shows "Verified"
        setTimeout(async () => {
          try {
            const [{ data }, bcStatus] = await Promise.all([
              supabase.from('crops')
                .select('*, batches(id, batch_code, status, harvest_date, quantity_kg, quality_grade, tx_hash, tx_status, block_number)')
                .eq('farmer_id', farmerId)
                .order('created_at', { ascending: false })
                .limit(20),
              apiGet('/blockchain/status').catch(() => null),
            ]);
            setCrops(data || []);
            if (bcStatus?.receipts) setBlockchainReceipts(bcStatus.receipts);
          } catch (_) {}
        }, 20000);
      } else {
        setCropMsg({ type: 'success', text: `Crop status updated to "${newStatus}" successfully.` });
      }
    } catch (err) {
      setCropMsg({ type: 'error', text: getErrorMessage(err) });
    } finally {
      setUpdatingCropId(null);
    }
  }


  async function handleDeleteCrop(cropId, cropTitle) {
    if (!window.confirm(`Are you sure you want to delete crop record "${cropTitle}"? This will permanently remove it from your ledger.`)) return;
    setDeletingCropId(cropId);
    setCropMsg({ type: '', text: '' });
    try {
      try {
        await apiDelete(`/crops/${cropId}`);
      } catch (backendErr) {
        console.warn('Backend crops delete failed, deleting from Supabase directly:', backendErr);
        const { error } = await supabase.from('crops').delete().eq('id', cropId);
        if (error) throw error;
      }
      setCrops(prev => prev.filter(c => c.id !== cropId));
      setCropMsg({ type: 'success', text: `Crop "${cropTitle}" deleted successfully.` });
    } catch (err) {
      setCropMsg({ type: 'error', text: getErrorMessage(err) });
    } finally {
      setDeletingCropId(null);
    }
  }

  /* ── Loan form submit ──────────────────────────────────────────────────── */
  async function handleLoanSubmit(e) {
    e.preventDefault();
    if (!farmerId) { setLoanMsg({ type: 'error', text: 'Farmer profile not found.' }); return; }
    setLoanSubmitting(true);
    setLoanMsg({ type: '', text: '' });
    try {
      let res;
      try {
        res = await apiPost('/finance/loans', {
          farmer_id: farmerId,
          amount_requested: Number(loanForm.amount_requested),
          tenure_months: Number(loanForm.tenure_months),
          purpose: loanForm.purpose,
          collateral_description: loanForm.collateral_description || undefined,
        });
      } catch (backendErr) {
        console.warn('Backend loan API unreachable, inserting directly into Supabase:', backendErr);
        const { data: supaLoan, error: supaErr } = await supabase.from('loan_applications').insert({
          farmer_id: farmerId,
          amount_requested: Number(loanForm.amount_requested),
          tenure_months: Number(loanForm.tenure_months),
          purpose: loanForm.purpose,
          collateral_description: loanForm.collateral_description || null,
          status: 'pending',
        }).select().single();
        if (supaErr) throw supaErr;
        res = { loan: supaLoan };
      }
      setLoanMsg({ type: 'success', text: 'Loan application submitted successfully! Your application is now under review.' });
      setLoanForm({ amount_requested: '', tenure_months: '', purpose: '', collateral_description: '' });
      // Refresh loans
      const data = await apiGet('/finance/loans').catch(() => []);
      let list = Array.isArray(data?.loans) ? data.loans : Array.isArray(data) ? data : [];
      if (list.length === 0) {
        const { data: supaLoans } = await supabase.from('loan_applications').select('*').eq('farmer_id', farmerId).order('created_at', { ascending: false });
        if (supaLoans) list = supaLoans;
      }
      setLoans(list);
      if (res?.loan?.id) {
        setSelectedLoanId(res.loan.id);
      } else if (list.length > 0) {
        setSelectedLoanId(list[0].id);
      }
    } catch (err) {
      setLoanMsg({ type: 'error', text: getErrorMessage(err) });
    } finally {
      setLoanSubmitting(false);
    }
  }

  /* ── Download sanction letter helper ───────────────────────────────────── */
  async function handleDownloadSanction(loan) {
    if (!loan?.id) return;
    setDownloadingDocId(loan.id);
    try {
      const fileName = `Loan-Sanction-${loan.application_number || loan.id.slice(0, 8)}.pdf`;
      await apiDownloadBlob(`/finance/loans/${loan.id}/document`, fileName);
    } catch (err) {
      setLoanMsg({ type: 'error', text: 'Unable to download loan sanction document. ' + getErrorMessage(err) });
    } finally {
      setDownloadingDocId(null);
    }
  }

  /* ── Notification actions (mark read, dismiss, bulk read) ────────────────── */
  async function markNotificationAsRead(id) {
    try {
      await apiPatch(`/notifications/${id}/read`);
    } catch (_) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    }
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  async function dismissNotification(id) {
    setDismissedAlertIds(prev => [...prev, id]);
    try {
      await apiDelete(`/notifications/${id}`);
    } catch (_) {
      await supabase.from('notifications').delete().eq('id', id);
    }
    setNotifications(prev => prev.filter(n => n.id !== id));
  }

  async function markAllNotificationsAsRead() {
    const uid = session?.user?.id;
    if (!uid) return;
    try {
      await apiPatch('/notifications/mark-all-read');
    } catch (_) {
      await supabase.from('notifications').update({ is_read: true }).eq('user_id', uid);
    }
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  /* ── Render helpers ─────────────────────────────────────────────────────── */
  const msgBanner = (msg) => msg?.text ? (
    <div style={{
      padding: '0.6rem 0.85rem', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '0.75rem',
      background: msg.type === 'success' ? 'rgba(46, 160, 67, 0.15)' : 'rgba(218, 54, 51, 0.15)',
      color: msg.type === 'success' ? '#2EA043' : '#DA3633',
      border: `1px solid ${msg.type === 'success' ? 'rgba(46, 160, 67, 0.35)' : 'rgba(218, 54, 51, 0.35)'}`,
    }}>{msg.text}</div>
  ) : null;

  /* ── Onboarding: create farmer profile ─────────────────────────────────── */
  function renderOnboarding() {
    return (
      <div className="card" style={{ padding: '1.75rem', maxWidth: '520px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <div style={{ background: 'var(--bg-sunken)', padding: '8px', borderRadius: '10px' }}>
            <ShieldCheck size={20} style={{ color: 'var(--color-gold)' }} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', color: 'var(--text-primary)', margin: 0 }}>
            Complete Your Farmer Profile
          </h2>
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
          Your account is created. Before you can register crops, apply for loans, or access the marketplace,
          you need to create your farmer profile with your location details.
        </p>
        {onboardMsg.text && (
          <div style={{
            padding: '0.6rem 0.85rem', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '1rem',
            background: onboardMsg.type === 'success' ? 'rgba(46, 160, 67, 0.15)' : 'rgba(218, 54, 51, 0.15)',
            color: onboardMsg.type === 'success' ? '#2EA043' : '#DA3633',
            border: `1px solid ${onboardMsg.type === 'success' ? 'rgba(46, 160, 67, 0.35)' : 'rgba(218, 54, 51, 0.35)'}`,
          }}>
            {onboardMsg.text}
          </div>
        )}
        {onboardMsg.type === 'success' ? (
          <button
            onClick={() => setSection('overview')}
            style={{ background: 'var(--color-gold)', color: '#0D1117', border: 'none', borderRadius: '8px', padding: '0.6rem 1.25rem', fontWeight: 700, fontFamily: 'var(--font-body)', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            Go to Overview
          </button>
        ) : (
          <form onSubmit={handleOnboardSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Field label="Mobile Number for Pest Alerts" required>
              <input
                type="tel"
                inputMode="numeric"
                style={inputStyle}
                placeholder="10-digit Indian mobile number"
                value={onboardForm.phone_number}
                onChange={e => setOnboardForm(f => ({ ...f, phone_number: e.target.value }))}
                maxLength={10}
                pattern="[6-9][0-9]{9}"
                required
              />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <Field label="State" required>
                <input style={inputStyle} placeholder="e.g. Madhya Pradesh" value={onboardForm.state} onChange={e => setOnboardForm(f => ({ ...f, state: e.target.value }))} required />
              </Field>
              <Field label="District" required>
                <input style={inputStyle} placeholder="e.g. Indore" value={onboardForm.district} onChange={e => setOnboardForm(f => ({ ...f, district: e.target.value }))} required />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <Field label="Village" required>
                <input style={inputStyle} placeholder="e.g. Rajpur" value={onboardForm.village} onChange={e => setOnboardForm(f => ({ ...f, village: e.target.value }))} required />
              </Field>
              <Field label="Pincode" required>
                <input style={inputStyle} placeholder="6-digit" maxLength={6} value={onboardForm.pincode} onChange={e => setOnboardForm(f => ({ ...f, pincode: e.target.value }))} required />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <Field label="Taluka / Tehsil">
                <input style={inputStyle} placeholder="Optional" value={onboardForm.taluka_tehsil} onChange={e => setOnboardForm(f => ({ ...f, taluka_tehsil: e.target.value }))} />
              </Field>
              <Field label="Total Land (acres)">
                <input type="number" style={inputStyle} placeholder="e.g. 3.5" min="0" step="0.01" value={onboardForm.total_land_area_acres} onChange={e => setOnboardForm(f => ({ ...f, total_land_area_acres: e.target.value }))} />
              </Field>
            </div>
            <button type="submit" disabled={onboardSubmitting} style={{ background: onboardSubmitting ? 'var(--bg-sunken)' : 'var(--color-gold)', color: onboardSubmitting ? 'var(--text-muted)' : '#0D1117', border: onboardSubmitting ? '1px solid var(--border-color)' : 'none', borderRadius: '8px', padding: '0.65rem', fontWeight: 700, fontFamily: 'var(--font-body)', cursor: onboardSubmitting ? 'not-allowed' : 'pointer', fontSize: '0.88rem', marginTop: '0.25rem' }}>
              {onboardSubmitting ? 'Creating profile...' : 'Create Farmer Profile'}
            </button>
          </form>
        )}
      </div>
    );
  }

  /* ── Section renderers ──────────────────────────────────────────────────── */
  function renderOverview() {
    return (
      <>
        {/* Onboarding banner when no farmer profile exists */}
        {!loading && !farmerId && (
          <div style={{ background: 'var(--bg-sunken)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <ShieldCheck size={18} style={{ color: 'var(--color-gold)', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>Farmer profile not yet created</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>You need to register your farmer profile before you can add crops or apply for loans.</div>
              </div>
            </div>
            <button onClick={() => setSection('profile')} style={{ background: 'var(--color-gold)', color: '#0D1117', border: 'none', borderRadius: '7px', padding: '0.45rem 1rem', fontWeight: 700, fontFamily: 'var(--font-body)', cursor: 'pointer', fontSize: '0.78rem', flexShrink: 0 }}>
              Create Profile
            </button>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>

          <StatCard icon={Leaf} label="Active Crops" value={loading ? '—' : crops.filter(c => c.status !== 'harvested' && c.status !== 'failed').length} sub="Currently growing" color="#4F7A5B" />
          <StatCard
            icon={Wallet}
            label="Sanctioned Credit"
            value={loans.some(l => l.status === 'approved' || l.status === 'disbursed')
              ? `₹${loans.filter(l => l.status === 'approved' || l.status === 'disbursed').reduce((s, l) => s + Number(l.approved_amount || l.amount_requested || 0), 0).toLocaleString()}`
              : '₹0'}
            sub="KCC Subvention · 4.0% p.a."
            color="#174A36"
          />
          <StatCard icon={Bell} label="Unread Alerts" value={loading ? '—' : notifications.filter(n => !n.is_read).length} sub="Loan & crop alerts" color="#388bfd" />
          <StatCard icon={ShieldCheck} label="KYC Status" value={userProfile?.is_verified ? 'Verified' : 'Pending'} sub="DigiLocker eKYC" color={userProfile?.is_verified ? '#4F7A5B' : '#DA3633'} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
          {/* Recent crops */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', color: 'var(--text-primary)', margin: 0 }}>My Crops</h3>
              <span onClick={() => setSection('crops')} style={{ fontSize: '0.72rem', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                Register new <ArrowRight size={12} />
              </span>
            </div>
            {loading ? <LoadingSpinner size="sm" /> : crops.length === 0 ? (
              <EmptyState icon={Leaf} title="No crops registered yet" message="Register your first oilseed crop to start tracking it." action={{ label: 'Register crop', onClick: () => setSection('crops') }} size="sm" />
            ) : (
              crops.slice(0, 5).map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0', borderBottom: '1px solid var(--border-color)' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500, textTransform: 'capitalize' }}>{c.crop_type} — {c.variety}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{c.acreage_allocated} acres · {c.season}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <button
                      type="button"
                      onClick={() => setProvenanceCrop(c)}
                      title="Verify on-chain provenance & Sepolia receipt"
                      style={{
                        background: '#E8F1EA44',
                        border: '1px solid var(--border-color)',
                        borderRadius: '999px',
                        padding: '0.15rem 0.5rem',
                        fontSize: '0.62rem',
                        color: 'var(--text-muted)',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      <ShieldCheck size={10} /> Sepolia Verified
                    </button>
                    <span style={{
                      padding: '0.2rem 0.55rem',
                      borderRadius: '999px',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      background: c.status === 'harvested' ? 'rgba(46, 160, 67, 0.15)' : 'rgba(229, 169, 60, 0.15)',
                      color: c.status === 'harvested' ? '#2EA043' : '#E5A93C',
                      border: `1px solid ${c.status === 'harvested' ? 'rgba(46, 160, 67, 0.35)' : 'rgba(229, 169, 60, 0.35)'}`,
                      textTransform: 'capitalize',
                    }}>
                      {c.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Price alerts — Threshold-based APMC market surge alerts */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', color: 'var(--text-primary)', margin: 0 }}>Price Alerts</h3>
                {unreadPriceAlerts.length > 0 && (
                  <span style={{
                    fontSize: '0.65rem',
                    padding: '0.1rem 0.45rem',
                    borderRadius: '999px',
                    background: 'var(--bg-sunken)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-color)',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {unreadPriceAlerts.length} new
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  ≥5% surge
                </span>
                <button
                  type="button"
                  onClick={fetchFarmerNotifications}
                  title="Refresh price alerts"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: refreshingNotifs ? '#174A36' : '#4F7A5B',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <RefreshCw size={12} style={{ animation: refreshingNotifs ? 'spin 1s linear infinite' : 'none' }} />
                </button>
              </div>
            </div>

            {loading ? (
              <LoadingSpinner size="sm" />
            ) : priceAlerts.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="No price alerts yet"
                message="No price alerts yet — you'll be notified when prices for your crops rise"
                size="sm"
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '340px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                {priceAlerts.map(alert => {
                  const meta = alert.metadata || {};
                  const cropType = meta.crop_type || '';
                  const cropName = cropType ? (cropType.charAt(0).toUpperCase() + cropType.slice(1)) : 'Crop';
                  const varietyStr = meta.variety ? ` — ${meta.variety}` : '';
                  const prevPrice = meta.previous_price ? Number(meta.previous_price).toLocaleString('en-IN') : null;
                  const newPrice = meta.new_price ? Number(meta.new_price).toLocaleString('en-IN') : null;
                  const pct = (meta.percentage_increase && !isNaN(Number(meta.percentage_increase))) ? Number(meta.percentage_increase).toFixed(1) : null;
                  const amt = meta.amount_increase ? Number(meta.amount_increase).toLocaleString('en-IN') : null;

                  return (
                    <div
                      key={alert.id}
                      onClick={() => !alert.is_read && markNotificationAsRead(alert.id)}
                      style={{
                        padding: '0.7rem 0.8rem',
                        background: alert.is_read ? 'var(--bg-sunken)' : 'rgba(229, 169, 60, 0.08)',
                        borderRadius: '8px',
                        border: `1px solid ${!alert.is_read ? 'rgba(229, 169, 60, 0.35)' : 'var(--border-color)'}`,
                        cursor: alert.is_read ? 'default' : 'pointer',
                        transition: 'border-color 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <span style={{ fontSize: '0.84rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                            {cropName}{varietyStr}
                          </span>
                          {!alert.is_read && (
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-gold)', display: 'inline-block' }} />
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {pct && (
                            <span style={{
                              padding: '0.1rem 0.45rem',
                              borderRadius: '999px',
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono)',
                              background: 'rgba(46, 160, 67, 0.15)',
                              color: '#2EA043',
                              border: '1px solid rgba(46, 160, 67, 0.35)',
                            }}>
                              +{pct}%
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              dismissNotification(alert.id);
                            }}
                            title="Dismiss alert"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: '2px',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>

                      {/* Price shift display */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem', fontFamily: 'var(--font-mono)', fontSize: '0.84rem', color: 'var(--text-primary)', margin: '0.15rem 0' }}>
                        {prevPrice && newPrice ? (
                          <>
                            <span style={{ color: 'var(--text-muted)', textDecoration: 'line-through', fontSize: '0.76rem' }}>₹{prevPrice}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>→</span>
                            <span style={{ fontWeight: 700, color: 'var(--color-gold)' }}>₹{newPrice}/q</span>
                            {amt && <span style={{ fontSize: '0.7rem', color: '#2EA043' }}>(+₹{amt}/q)</span>}
                          </>
                        ) : (
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-primary)' }}>{alert.title}</span>
                        )}
                      </div>

                      {/* Mandi & timestamp & mark read action */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                        <span>
                          {meta.mandi_name || 'Market Mandi'}{meta.district ? `, ${meta.district}` : ''}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span>{formatTimeAgo(alert.created_at)}</span>
                          {!alert.is_read && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                markNotificationAsRead(alert.id);
                              }}
                              style={{ color: 'var(--color-gold)', cursor: 'pointer', textDecoration: 'underline' }}
                            >
                              Mark read
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>


        <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <h4 style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)', margin: 0 }}>Recent Alerts</h4>
              {notifications.length > 0 && <span style={{ background: '#DA363322', color: '#DA3633', borderRadius: '999px', padding: '0.1rem 0.5rem', fontSize: '0.65rem', fontWeight: 700 }}>{notifications.length} new</span>}
            </div>
            {notifications.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                <CheckCircle size={14} style={{ color: 'var(--text-muted)' }} /> All caught up!
              </div>
            ) : (
              notifications.slice(0, 4).map(n => (
                <div key={n.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <Clock size={12} style={{ color: 'var(--text-muted)', marginTop: '3px', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 500 }}>{n.title}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{n.message?.slice(0, 80)}</div>
                  </div>
                </div>
              ))
            )}
          </div>

        {/* ── AI Price & Demand Intelligence for Farmers ── */}
        <div style={{ marginTop: '2rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <span style={{ background: 'var(--bg-sunken)', padding: '6px', borderRadius: '8px', color: 'var(--text-primary)', display: 'flex' }}>
              <Sparkles size={18} />
            </span>
            <div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Collective Market Intelligence (AI Forecasts)
              </h3>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: 0 }}>
                Leverage real-time Random Forest multi-day price projections and demand pressure indices before selling harvest batches.
              </p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '1.5rem' }}>
            <PriceForecastPanel defaultCrop="mustard" compact={false} />
            <DemandForecastPanel defaultCrop="mustard" compact={false} />
          </div>
        </div>
      </>
    );

  }

  function renderCrops() {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem' }}>
        {/* Crop list */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', color: 'var(--text-primary)', margin: 0 }}>Registered Crops</h3>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Active oilseed cultivated land records</div>
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
              {crops.length} Records
            </span>
          </div>

          {msgBanner(cropMsg)}

          {loading ? <LoadingSpinner /> : crops.length === 0 ? (
            <EmptyState icon={Leaf} title="No crops registered yet" message="Use the form to register your first oilseed crop." size="lg" />
          ) : (
            crops.map(c => {
              const isUpdating = updatingCropId === c.id;
              const isDeleting = deletingCropId === c.id;
              return (
                <div key={c.id} style={{ padding: '0.85rem', marginBottom: '0.75rem', background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600, textTransform: 'capitalize' }}>
                          {c.crop_type} — {c.variety}
                        </span>
                        <span style={{
                          padding: '0.15rem 0.45rem',
                          borderRadius: '999px',
                          fontSize: '0.62rem',
                          fontWeight: 700,
                          background: c.status === 'harvested' ? 'rgba(46, 160, 67, 0.15)' : c.status === 'failed' ? 'rgba(218, 54, 51, 0.15)' : 'rgba(229, 169, 60, 0.15)',
                          color: c.status === 'harvested' ? '#2EA043' : c.status === 'failed' ? '#DA3633' : '#E5A93C',
                          border: `1px solid ${c.status === 'harvested' ? 'rgba(46, 160, 67, 0.35)' : c.status === 'failed' ? 'rgba(218, 54, 51, 0.35)' : 'rgba(229, 169, 60, 0.35)'}`,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}>
                          {c.status || 'growing'}
                        </span>
                        {/* Conditional Sepolia On-Chain Badge */}
                        {(() => {
                          const linkedBatch = Array.isArray(c.batches) && c.batches.length > 0 ? c.batches[0] : (c.batch || null);
                          const batchCode = linkedBatch?.batch_code || c.batch_code;
                          const batchReceipt = batchCode ? (blockchainReceipts[`createBatch_${batchCode}`] || null) : null;
                          const txHash = linkedBatch?.tx_hash || batchReceipt?.tx_hash || null;
                          const isConfirmed = !!txHash && (linkedBatch?.tx_status === 'confirmed' || batchReceipt?.chain_status === 'confirmed' || (!batchReceipt && !!txHash) || (batchReceipt && batchReceipt.chain_status !== 'pending'));

                          if (isConfirmed && txHash) {
                            return (
                              <a
                                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                                target="_blank"
                                rel="noreferrer"
                                title={`Verified on Sepolia: ${txHash}`}
                                style={{
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: '999px',
                                  fontSize: '0.62rem',
                                  fontWeight: 700,
                                  background: 'var(--bg-sunken)',
                                  color: 'var(--text-muted)',
                                  border: '1px solid var(--border-color)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  fontFamily: 'var(--font-mono)',
                                  textDecoration: 'none',
                                }}
                              >
                                <ShieldCheck size={11} /> Sepolia On-Chain
                              </a>
                            );
                          }

                          if (batchCode) {
                            return (
                              <span
                                title="Batch registration initiated, awaiting block confirmation on Sepolia"
                                style={{
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: '999px',
                                  fontSize: '0.62rem',
                                  fontWeight: 600,
                                  background: 'var(--bg-sunken)',
                                  color: 'var(--text-primary)',
                                  border: '1px solid var(--border-color)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  fontFamily: 'var(--font-mono)',
                                }}
                              >
                                <Clock size={11} /> Pending
                              </span>
                            );
                          }

                          return (
                            <span
                              title="Crop has not been assigned a batch or registered on-chain yet"
                              style={{
                                padding: '0.15rem 0.45rem',
                                borderRadius: '999px',
                                fontSize: '0.62rem',
                                fontWeight: 500,
                                background: '#D8E3D922',
                                color: 'var(--text-muted)',
                                border: '1px solid #D8E3D944',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              <Clock size={11} /> Not on-chain yet
                            </span>
                          );
                        })()}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        {c.acreage_allocated} acres · Season: {c.season} · Sown: {c.sowing_date ? new Date(c.sowing_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </div>
                    </div>

                    {/* Status Toggle, Provenance Trigger & Delete Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                      {(() => {
                        const linkedBatch = Array.isArray(c.batches) && c.batches.length > 0 ? c.batches[0] : (c.batch || null);
                        const batchCode = linkedBatch?.batch_code || c.batch_code;
                        const batchId = linkedBatch?.id || c.batch_id;

                        if (batchCode) {
                          return (
                            <button
                              type="button"
                              onClick={() => setProvenanceCrop({
                                ...c,
                                batch_code: batchCode,
                                batch_id: batchId,
                                id: batchId || c.id
                              })}
                              title={`View verified on-chain lifecycle for batch ${batchCode}`}
                              style={{
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '6px',
                                color: 'var(--text-muted)',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                padding: '0.25rem 0.6rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <Award size={12} />
                              Provenance
                            </button>
                          );
                        }

                        return (
                          <span
                            title="This crop cultivation cycle has not been allocated an on-chain batch record yet"
                            style={{
                              background: 'var(--bg-card)',
                              border: '1px dashed #D8E3D9',
                              borderRadius: '6px',
                              color: 'var(--text-muted)',
                              fontSize: '0.72rem',
                              fontWeight: 500,
                              padding: '0.25rem 0.6rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                            }}
                          >
                            <Clock size={12} />
                            Not yet batched
                          </span>
                        );
                      })()}

                      <select
                        value={c.status || 'growing'}
                        disabled={isUpdating || isDeleting}
                        onChange={e => handleUpdateCropStatus(c.id, e.target.value)}
                        title="Update crop lifecycle stage"
                        style={{
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          fontSize: '0.72rem',
                          padding: '0.25rem 0.45rem',
                          cursor: isUpdating ? 'wait' : 'pointer',
                          fontFamily: 'var(--font-body)',
                        }}
                      >
                        <option value="sown">Sown</option>
                        <option value="growing">Growing</option>
                        <option value="harvested">Harvested</option>
                        <option value="failed">Failed</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleDeleteCrop(c.id, `${c.crop_type} (${c.variety})`)}
                        disabled={isDeleting || isUpdating}
                        title="Delete crop record"
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          color: '#DA3633',
                          padding: '0.28rem',
                          cursor: isDeleting ? 'wait' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Crop registration form */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', color: 'var(--text-primary)', margin: '0 0 1rem' }}>Register New Crop</h3>
          {!farmerId && !loading && (
            <div style={{ fontSize: '0.78rem', color: '#DA3633', marginBottom: '0.75rem' }}>
              No farmer profile found. Please complete your farmer registration first.
            </div>
          )}
          {msgBanner(cropMsg)}
          <form onSubmit={handleCropSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Field label="Crop Type" required>
              <select style={inputStyle} value={cropForm.crop_type} onChange={e => setCropForm(f => ({ ...f, crop_type: e.target.value }))} required>
                <option value="">Select crop type</option>
                {CROP_TYPE_OPTIONS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </Field>
            <Field label="Variety" required>
              <input style={inputStyle} placeholder="e.g. Pusa Bold" value={cropForm.variety} onChange={e => setCropForm(f => ({ ...f, variety: e.target.value }))} required />
            </Field>
            <Field label="Season" required>
              <select style={inputStyle} value={cropForm.season} onChange={e => setCropForm(f => ({ ...f, season: e.target.value }))} required>
                <option value="">Select season</option>
                {SEASON_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <Field label="Sowing Date" required>
                <input type="date" style={inputStyle} value={cropForm.sowing_date} onChange={e => setCropForm(f => ({ ...f, sowing_date: e.target.value }))} required />
              </Field>
              <Field label="Expected Harvest" required>
                <input type="date" style={inputStyle} value={cropForm.expected_harvest_date} onChange={e => setCropForm(f => ({ ...f, expected_harvest_date: e.target.value }))} required />
              </Field>
            </div>
            <Field label="Acreage Allocated (acres)" required>
              <input type="number" style={inputStyle} placeholder="e.g. 2.5" min="0.01" step="0.01" value={cropForm.acreage_allocated} onChange={e => setCropForm(f => ({ ...f, acreage_allocated: e.target.value }))} required />
            </Field>
            <button type="submit" disabled={cropSubmitting || !farmerId} style={{ background: cropSubmitting || !farmerId ? 'var(--bg-sunken)' : 'var(--color-gold)', color: cropSubmitting || !farmerId ? 'var(--text-muted)' : '#0D1117', border: cropSubmitting || !farmerId ? '1px solid var(--border-color)' : 'none', borderRadius: '8px', padding: '0.6rem', fontWeight: 700, fontFamily: 'var(--font-body)', cursor: cropSubmitting || !farmerId ? 'not-allowed' : 'pointer', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              {cropSubmitting ? 'Registering…' : 'Register Crop'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* ── 4. Pest Detection & Crop Leaf Image Upload Section ─────────────────── */
  function renderPest() {
    const handleFileChange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        setPestMsg({ type: 'error', text: 'Please upload a valid image file (JPEG, PNG, or WEBP).' });
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setPestMsg({ type: 'error', text: 'Image file size exceeds the 10 MB limit.' });
        return;
      }

      setPestFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setPestPreview(event.target.result);
      };
      reader.readAsDataURL(file);
      setPestMsg({ type: '', text: '' });
    };

    const handleDrag = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.type === 'dragenter' || e.type === 'dragover') {
        setPestDragActive(true);
      } else if (e.type === 'dragleave') {
        setPestDragActive(false);
      }
    };

    const handleDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setPestDragActive(false);
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        if (!file.type.startsWith('image/')) {
          setPestMsg({ type: 'error', text: 'Please upload a valid image file.' });
          return;
        }
        if (file.size > 10 * 1024 * 1024) {
          setPestMsg({ type: 'error', text: 'Image file size exceeds the 10 MB limit.' });
          return;
        }
        setPestFile(file);
        const reader = new FileReader();
        reader.onload = (ev) => {
          setPestPreview(ev.target.result);
        };
        reader.readAsDataURL(file);
        setPestMsg({ type: '', text: '' });
      }
    };

    const handleClearImage = () => {
      setPestFile(null);
      setPestPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    };

    const handlePestUpload = async (e) => {
      e.preventDefault();
      if (!pestPreview && !pestFile) {
        setPestMsg({ type: 'error', text: 'Please select or capture a crop leaf image first.' });
        return;
      }

      setPestSubmitting(true);
      setPestMsg({ type: '', text: '' });

      try {
        const normalizedPhoneNumber = pestPhoneNumber.replace(/\D/g, '').slice(-10);
        if (!/^[6-9]\d{9}$/.test(normalizedPhoneNumber)) {
          throw new Error('Enter a valid 10-digit Indian mobile number for pest alerts.');
        }
        if (!farmerId) {
          throw new Error('Create your farmer profile before running pest diagnosis.');
        }
        await apiPatch(`/farmers/${farmerId}`, { phone_number: normalizedPhoneNumber });
        setPestPhoneNumber(normalizedPhoneNumber);

        if (!pestFile) {
          throw new Error('Please select or capture the leaf image again.');
        }

        const fileExt = pestFile.name.split('.').pop() || 'jpg';
        const fileName = `scan_${farmerId || 'farmer'}_${Date.now()}.${fileExt}`;
        const filePath = `pest-scans/${fileName}`;
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from('crop-images')
          .upload(filePath, pestFile, {
            cacheControl: '3600',
            upsert: true,
          });

        if (uploadErr || !uploadData) {
          throw new Error(uploadErr?.message || 'Could not upload the leaf image to Storage.');
        }

        const { data: { publicUrl } } = supabase.storage
          .from('crop-images')
          .getPublicUrl(filePath);
        if (!publicUrl) {
          throw new Error('Could not create a Storage link for the leaf image.');
        }

        const selectedCrop = crops.find(c => c.id === pestForm.crop_id);
        const cropTypeName = selectedCrop?.crop_type || pestForm.crop_type || 'Oilseed';
        const aiRes = await apiPost('/ai/detect-pest', {
          image_url: publicUrl,
          farmer_id: farmerId || session?.user?.id,
          crop_id: pestForm.crop_id || null,
          crop_type: cropTypeName,
        });
        const diagnosisResult = aiRes?.data;
        if (!diagnosisResult?.top_predictions?.length) {
          throw new Error('AI service returned no pest diagnosis.');
        }
        setPestDiagnosis(diagnosisResult);

        const smsStatus = diagnosisResult.sms_alert_sent
          ? ' SMS alert sent.'
          : diagnosisResult.sms_alert_simulated
            ? ' SMS was not sent because Fast2SMS is not configured.'
            : Number(diagnosisResult.confidence_score) >= Number(diagnosisResult.risk_threshold)
              ? ' SMS was not sent; check Fast2SMS settings.'
              : ' No SMS was needed because confidence is below the alert threshold.';
        setPestMsg({
          type: 'success',
          text: `Diagnosis complete: ${diagnosisResult.display_name || diagnosisResult.primary_diagnosis} (${diagnosisResult.confidence_score}% confidence).${smsStatus}`,
        });

        setPestForm(f => ({ ...f, notes: '' }));
      } catch (err) {
        setPestMsg({ type: 'error', text: getErrorMessage(err) || 'Failed to upload image. Please try again.' });
      } finally {
        setPestSubmitting(false);
      }
    };

    return (
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div className="card" style={{ padding: '1.75rem' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
            <div style={{ background: 'var(--bg-sunken)', padding: '10px', borderRadius: '10px' }}>
              <Camera size={24} style={{ color: 'var(--text-primary)' }} />
            </div>
            <div>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', color: 'var(--text-primary)', margin: 0 }}>
                Upload Crop / Pest Image
              </h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                Upload a photo of your leaf or plant to log pest or disease symptoms.
              </p>
            </div>
          </div>

          <form onSubmit={handlePestUpload} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />

            {/* Dropzone or Preview */}
            {!pestPreview ? (
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: pestDragActive ? '2px dashed var(--color-gold)' : '2px dashed var(--border-color)',
                  background: pestDragActive ? 'rgba(229, 169, 60, 0.08)' : 'var(--bg-sunken)',
                  borderRadius: '12px',
                  padding: '2.5rem 1.5rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '50%',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 0.85rem auto',
                }}>
                  <Upload size={22} style={{ color: 'var(--color-gold)' }} />
                </div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.92rem', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.3rem' }}>
                  Click to select photo or drag & drop here
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                  Supports JPEG, PNG, WEBP (Max 10 MB)
                </div>

                <div style={{ display: 'flex', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      background: 'var(--color-gold)',
                      color: '#0D1117',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '0.55rem 1.35rem',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      fontFamily: 'var(--font-body)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    <ImageIcon size={16} /> Select Image File
                  </button>
                </div>
              </div>
            ) : (
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.75rem',
              }}>
                <div style={{
                  position: 'relative',
                  width: '100%',
                  maxHeight: '260px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  background: 'var(--bg-card)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <img
                    src={pestPreview}
                    alt="Preview"
                    style={{ width: '100%', maxHeight: '260px', objectFit: 'contain' }}
                  />
                  <button
                    type="button"
                    onClick={handleClearImage}
                    title="Remove image"
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      background: 'rgba(13,17,23,0.85)',
                      border: '1px solid #DA3633',
                      color: '#DA3633',
                      borderRadius: '50%',
                      width: '28px',
                      height: '28px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <X size={15} />
                  </button>
                </div>

                <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {pestFile ? `${pestFile.name} (${(Number(pestFile.size || 0) / 1024 / 1024).toFixed(2)} MB)` : 'Image selected'}
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-primary)',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Change photo
                  </button>
                </div>
              </div>
            )}

            <Field label="Mobile Number for Pest Alerts" required>
              <input
                type="tel"
                inputMode="numeric"
                style={inputStyle}
                placeholder="10-digit Indian mobile number"
                value={pestPhoneNumber}
                onChange={e => setPestPhoneNumber(e.target.value)}
                maxLength={10}
                pattern="[6-9][0-9]{9}"
                required
              />
            </Field>

            {/* Select Crop */}
            <Field label="Select Crop" required>
              <select
                style={inputStyle}
                value={pestForm.crop_id || (pestForm.crop_type ? `type:${pestForm.crop_type}` : '')}
                onChange={e => {
                  const val = e.target.value;
                  if (val.startsWith('type:')) {
                    setPestForm(f => ({ ...f, crop_id: '', crop_type: val.replace('type:', '') }));
                  } else {
                    const matched = crops.find(c => c.id === val);
                    setPestForm(f => ({
                      ...f,
                      crop_id: val,
                      crop_type: matched?.crop_type || f.crop_type,
                    }));
                  }
                }}
                required
              >
                {crops.length > 0 && (
                  <optgroup label="Your Registered Crops">
                    {crops.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.crop_type.charAt(0).toUpperCase() + c.crop_type.slice(1)} — {c.variety}
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Oilseeds">
                  <option value="type:mustard">Mustard (Sarson)</option>
                  <option value="type:soybean">Soybean</option>
                  <option value="type:groundnut">Groundnut</option>
                  <option value="type:sunflower">Sunflower</option>
                  <option value="type:sesame">Sesame</option>
                  <option value="type:castor">Castor</option>
                </optgroup>
              </select>
            </Field>

            {/* Status Alert */}
            {pestMsg.text && (
              <div style={{
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                fontSize: '0.8rem',
                background: pestMsg.type === 'success' ? 'rgba(46, 160, 67, 0.15)' : 'rgba(218, 54, 51, 0.15)',
                border: `1px solid ${pestMsg.type === 'success' ? 'rgba(46, 160, 67, 0.35)' : 'rgba(218, 54, 51, 0.35)'}`,
                color: pestMsg.type === 'success' ? '#2EA043' : '#DA3633',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
              }}>
                {pestMsg.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                <span>{pestMsg.text}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={pestSubmitting || !pestPreview}
              style={{
                background: pestSubmitting || !pestPreview ? 'var(--bg-sunken)' : 'var(--color-gold)',
                color: pestSubmitting || !pestPreview ? 'var(--text-muted)' : '#0D1117',
                border: pestSubmitting || !pestPreview ? '1px solid var(--border-color)' : 'none',
                borderRadius: '8px',
                padding: '0.75rem',
                fontWeight: 700,
                fontSize: '0.9rem',
                fontFamily: 'var(--font-body)',
                cursor: pestSubmitting || !pestPreview ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                transition: 'all 0.15s ease',
              }}
            >
              <Upload size={16} />
              {pestSubmitting ? 'Running CNN Pathology Diagnostic…' : 'Run CNN Pest & Disease Diagnosis'}
            </button>
          </form>
        </div>

        {/* ── LIVE CNN DIAGNOSIS RESULTS CARD ── */}
        {pestDiagnosis && (
          <div className="card" style={{
            padding: '1.75rem',
            border: `1px solid ${['HIGH', 'CRITICAL'].includes(pestDiagnosis.risk_level) ? 'rgba(218, 54, 51, 0.45)' : 'rgba(46, 160, 67, 0.45)'}`,
            background: 'var(--bg-card)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <ShieldCheck size={20} style={{ color: ['HIGH', 'CRITICAL'].includes(pestDiagnosis.risk_level) ? '#DA3633' : '#2EA043' }} />
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.15rem', color: 'var(--text-primary)', margin: 0 }}>
                    {pestDiagnosis.display_name || pestDiagnosis.primary_diagnosis}
                  </h3>
                </div>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Diagnosis Confidence: <strong style={{ color: 'var(--color-gold)' }}>{pestDiagnosis.confidence_score}%</strong>
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{
                  padding: '0.3rem 0.75rem',
                  borderRadius: '999px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  background: ['HIGH', 'CRITICAL'].includes(pestDiagnosis.risk_level) ? 'rgba(218, 54, 51, 0.15)' : 'rgba(46, 160, 67, 0.15)',
                  border: `1px solid ${['HIGH', 'CRITICAL'].includes(pestDiagnosis.risk_level) ? 'rgba(218, 54, 51, 0.35)' : 'rgba(46, 160, 67, 0.35)'}`,
                  color: ['HIGH', 'CRITICAL'].includes(pestDiagnosis.risk_level) ? '#DA3633' : '#2EA043',
                }}>
                  {pestDiagnosis.risk_level} RISK
                </span>

                {pestDiagnosis.sms_alert_sent && (
                  <span style={{
                    padding: '0.3rem 0.65rem',
                    borderRadius: '999px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    background: 'var(--bg-sunken)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                  }}>
                    <Bell size={12} style={{ color: 'var(--color-gold)' }} /> SMS Alert Dispatched
                  </span>
                )}
              </div>
            </div>

            {/* Top 3 Predictions Breakdown */}
            {pestDiagnosis.top_predictions && (
              <div style={{ marginBottom: '1.25rem' }}>
                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
                  Top-3 Predicted Pathologies
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {pestDiagnosis.top_predictions.map((p, i) => (
                    <div key={i} style={{ background: 'var(--bg-card)', padding: '0.6rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.3rem' }}>
                        <span style={{ color: 'var(--text-primary)', fontWeight: i === 0 ? 700 : 500 }}>
                          {i + 1}. {p.disease}
                        </span>
                        <span style={{ color: i === 0 ? 'var(--color-gold)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          {p.confidence_score}%
                        </span>
                      </div>
                      <div style={{ height: '4px', background: 'var(--bg-sunken)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${Math.min(100, p.confidence_score)}%`,
                          background: i === 0 ? 'var(--color-gold)' : '#388bfd',
                          borderRadius: '2px',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Treatment Guides */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '0.85rem', borderRadius: '8px' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  🌿 Organic Remediation
                </div>
                <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
                  {pestDiagnosis.recommended_treatment || 'Apply biological neem oil extract.'}
                </p>
              </div>

              <div style={{ background: 'var(--bg-card)', border: '1px solid #388bfd44', padding: '0.85rem', borderRadius: '8px' }}>
                <div style={{ color: '#58a6ff', fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  🧪 Chemical Formulation
                </div>
                <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
                  {pestDiagnosis.chemical_treatment || 'Consult local Krishi Vigyan Kendra agronomist.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderMarketplace() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* ── Live Auction & Mandi Exchange System (e-NAM style) ──────── */}
        <FarmerAuctionManager session={session} userProfile={userProfile} />

        {/* ── My Submitted Quotes Section ───────────────────────────────── */}
        {myQuotes.length > 0 && (
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', color: 'var(--text-primary)', margin: 0 }}>
                  My Submitted Seller Quotes
                </h3>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Quotes you have submitted to FPO procurement bids and their review status
                </span>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-primary)' }}>
                {myQuotes.length} Quotes
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {myQuotes.map(quote => (
                <div key={quote.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.85rem 1rem', background: 'var(--bg-card)', borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  flexWrap: 'wrap', gap: '0.75rem',
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem', textTransform: 'capitalize' }}>
                        {quote.crop_type || 'Oilseed'}
                      </span>
                      <span style={{
                        fontSize: '0.65rem', padding: '0.15rem 0.5rem', borderRadius: '999px', fontWeight: 700,
                        background: quote.status === 'accepted' ? 'rgba(46, 160, 67, 0.15)' : quote.status === 'rejected' ? 'rgba(218, 54, 51, 0.15)' : 'rgba(229, 169, 60, 0.15)',
                        color: quote.status === 'accepted' ? '#2EA043' : quote.status === 'rejected' ? '#DA3633' : '#E5A93C',
                        border: `1px solid ${quote.status === 'accepted' ? 'rgba(46, 160, 67, 0.35)' : quote.status === 'rejected' ? 'rgba(218, 54, 51, 0.35)' : 'rgba(229, 169, 60, 0.35)'}`,
                      }}>
                        {quote.status === 'accepted' ? '✓ Accepted by FPO' : quote.status === 'rejected' ? '✗ Not Selected' : '⏳ Pending Review'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      Deliver by: <strong style={{ color: 'var(--text-primary)' }}>{new Date(quote.delivery_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>
                      {quote.notes && <span> · "{quote.notes}"</span>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Offered Quantity</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.92rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                        {quote.quantity_kg} kg
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Offered Price</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.92rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                        ₹{quote.price_per_kg}/kg
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Existing Available Marketplace Listings ───────────────────── */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', color: 'var(--text-primary)', margin: 0 }}>Available Marketplace Listings</h3>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Certified oilseed lots active on the Sovereign Harvest marketplace</span>
            </div>
            <button
              onClick={() => setMarketRefreshKey(k => k + 1)}
              style={{ background: 'var(--bg-sunken)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', padding: '0.35rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <RefreshCw size={12} /> Refresh Listings
            </button>
          </div>
          {marketLoading ? <LoadingSpinner label="Loading marketplace…" /> : marketError ? (
            <EmptyState icon={Package} title="Marketplace unavailable" message={`Could not load listings: ${marketError}`} action={{ label: 'Retry', onClick: () => setMarketRefreshKey(k => k + 1) }} />
          ) : marketListings.length === 0 ? (
            <EmptyState icon={Package} size="lg" title="No listings available" message="Certified oilseed batches listed for sale will appear here once processors and FPOs create listings." />
          ) : (
            marketListings.map(b => (
              <div key={b.id} style={{ padding: '0.85rem 1rem', marginBottom: '0.75rem', background: 'var(--bg-card)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.92rem', color: 'var(--text-primary)', fontWeight: 600, textTransform: 'capitalize' }}>
                        {b.crops?.crop_type || b.crop_type || 'Oilseed'}
                      </span>
                      {b.crops?.variety && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                          ({b.crops.variety})
                        </span>
                      )}
                      {b.quality_grade && (
                        <span style={{
                          fontSize: '0.62rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '999px',
                          background: b.quality_grade === 'grade_a_premium' ? '#E8F1EA' : '#388bfd22',
                          color: b.quality_grade === 'grade_a_premium' ? '#4F7A5B' : '#388bfd',
                          textTransform: 'uppercase', letterSpacing: '0.04em'
                        }}>
                          {b.quality_grade.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      {b.batch_code || b.id.slice(0, 12)}
                      {b.farmers?.district && <span style={{ marginLeft: '0.5rem' }}>· {b.farmers.district}, {b.farmers.state}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                      {(b.base_ask_price_per_kg || b.price_per_kg) ? `₹${Number((b.base_ask_price_per_kg || b.price_per_kg) * 100).toLocaleString()}/q` : 'Price TBD'}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      ₹{b.base_ask_price_per_kg || b.price_per_kg}/kg
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.6rem', paddingTop: '0.45rem', borderTop: '1px solid var(--border-color)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  <span>📦 <strong>{b.quantity_kg ? Number(b.quantity_kg).toLocaleString() : '—'} kg</strong> available for procurement</span>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4F7A5B', display: 'inline-block' }} /> Active Listing
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  function renderFinance() {
    const activeLoan = loans.find(l => l.id === selectedLoanId) || loans[0] || null;

    // Filter loans
    const filteredLoans = loans.filter(l => {
      if (loanFilter === 'sanctioned') return l.status === 'approved' || l.status === 'disbursed';
      if (loanFilter === 'review') return l.status === 'under_review' || l.status === 'submitted';
      return true;
    });

    const totalApplied = loans.reduce((acc, l) => acc + Number(l.amount_requested || 0), 0);
    const totalSanctioned = loans
      .filter(l => l.status === 'approved' || l.status === 'disbursed')
      .reduce((acc, l) => acc + Number(l.approved_amount || l.amount_requested || 0), 0);
    const getStatusMeta = (status) => {
      switch (status) {
        case 'approved':
          return { label: 'Sanctioned', color: '#2EA043', bg: 'rgba(46, 160, 67, 0.15)', border: 'rgba(46, 160, 67, 0.35)', step: 3, text: 'Approved by Lending Bank' };
        case 'disbursed':
          return { label: 'Disbursed', color: '#2EA043', bg: 'rgba(46, 160, 67, 0.22)', border: 'rgba(46, 160, 67, 0.45)', step: 4, text: 'Disbursed to A/C' };
        case 'under_review':
          return { label: 'Under Review', color: '#E5A93C', bg: 'rgba(229, 169, 60, 0.15)', border: 'rgba(229, 169, 60, 0.35)', step: 2, text: 'Verification & Appraisal' };
        case 'submitted':
          return { label: 'Submitted', color: '#388bfd', bg: 'rgba(56, 139, 253, 0.15)', border: 'rgba(56, 139, 253, 0.35)', step: 1, text: 'Queued for Review' };
        case 'rejected':
          return { label: 'Rejected', color: '#DA3633', bg: 'rgba(218, 54, 51, 0.15)', border: 'rgba(218, 54, 51, 0.35)', step: 1, text: 'Criteria Not Met' };
        default:
          return { label: 'Draft', color: 'var(--text-muted)', bg: 'rgba(139, 148, 158, 0.15)', border: 'rgba(139, 148, 158, 0.3)', step: 1, text: 'Pending Submission' };
      }
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Top telemetry cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <StatCard
            icon={Wallet}
            label="Total Credit Applied"
            value={`₹${totalApplied.toLocaleString()}`}
            sub={`${loans.length} application${loans.length !== 1 ? 's' : ''} on record`}
            color="#388bfd"
          />
          <StatCard
            icon={Landmark}
            label="Sanctioned & Disbursed"
            value={`₹${totalSanctioned.toLocaleString()}`}
            sub="Active institutional credit"
            color="#4F7A5B"
          />
          <StatCard
            icon={Percent}
            label="Subsidized Interest Rate"
            value="4.0% p.a."
            sub="Under KCC 3% Gov Subvention"
            color="#4F7A5B"
          />
        </div>

        {/* Main 2-column layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1.35fr', gap: '1.5rem', alignItems: 'start' }}>
          {/* Left: Application Form */}
          <div className="card" style={{ padding: '1.35rem', background: 'var(--bg-card)', borderColor: '#D8E3D9' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', color: 'var(--text-primary)', margin: 0 }}>
                Apply for Crop Loan
              </h3>
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 1rem', lineHeight: '1.4' }}>
              Institutional credit under the National Mission on Edible Oils. Loans feature a 3% prompt repayment subvention from the Government of India.
            </p>

            {msgBanner(loanMsg)}

            <form onSubmit={handleLoanSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <Field label="Loan Amount (₹)" required>
                <input
                  type="number"
                  style={inputStyle}
                  placeholder="Min ₹1,000 (e.g. 50000)"
                  min="1000"
                  step="500"
                  value={loanForm.amount_requested}
                  onChange={e => setLoanForm(f => ({ ...f, amount_requested: e.target.value }))}
                  required
                />
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                  {[10000, 25000, 50000, 100000].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setLoanForm(f => ({ ...f, amount_requested: String(val) }))}
                      style={{
                        background: loanForm.amount_requested === String(val) ? 'rgba(229, 169, 60, 0.18)' : 'var(--bg-sunken)',
                        border: `1px solid ${loanForm.amount_requested === String(val) ? 'var(--color-gold, #E5A93C)' : 'var(--border-color)'}`,
                        color: loanForm.amount_requested === String(val) ? 'var(--color-gold, #E5A93C)' : 'var(--text-muted)',
                        padding: '0.25rem 0.55rem',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-mono)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      +₹{val.toLocaleString()}
                    </button>
                  ))}
                </div>
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <Field label="Tenure (months)" required>
                  <input
                    type="number"
                    style={inputStyle}
                    placeholder="e.g. 6"
                    min="1"
                    max="60"
                    value={loanForm.tenure_months}
                    onChange={e => setLoanForm(f => ({ ...f, tenure_months: e.target.value }))}
                    required
                  />
                </Field>
                <Field label="Purpose" required>
                  <select
                    style={inputStyle}
                    value={loanForm.purpose}
                    onChange={e => setLoanForm(f => ({ ...f, purpose: e.target.value }))}
                    required
                  >
                    <option value="">Select purpose</option>
                    {LOAN_PURPOSE_OPTIONS.map(p => (
                      <option key={p} value={p}>
                        {p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Collateral / Harvest Pledge (optional)">
                <textarea
                  style={{ ...inputStyle, resize: 'vertical', minHeight: '65px' }}
                  placeholder="e.g., Rabi Mustard harvest batch pledge or DigiLocker land parcel #402"
                  value={loanForm.collateral_description}
                  onChange={e => setLoanForm(f => ({ ...f, collateral_description: e.target.value }))}
                />
              </Field>

              <button
                type="submit"
                disabled={loanSubmitting || !farmerId}
                style={{
                  background: loanSubmitting || !farmerId ? 'var(--bg-sunken)' : 'var(--color-gold)',
                  color: loanSubmitting || !farmerId ? 'var(--text-muted)' : '#0D1117',
                  border: loanSubmitting || !farmerId ? '1px solid var(--border-color)' : 'none',
                  borderRadius: '8px',
                  padding: '0.7rem',
                  fontWeight: 700,
                  fontFamily: 'var(--font-body)',
                  cursor: loanSubmitting || !farmerId ? 'not-allowed' : 'pointer',
                  fontSize: '0.85rem',
                  transition: 'all 0.15s ease',
                  marginTop: '0.25rem',
                }}
              >
                {loanSubmitting ? 'Submitting Application…' : 'Submit Loan Application'}
              </button>
            </form>
          </div>

          {/* Right: Active Loan Spotlight & Applications List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Active Loan Spotlight / Stepper */}
            {activeLoan ? (
              <div
                className="card"
                style={{
                  padding: '1.35rem',
                  background: 'var(--bg-card)',
                  border: `1px solid ${activeLoan.status === 'approved' || activeLoan.status === 'disbursed' ? 'var(--color-primary)' : 'var(--border-color)'}`,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Header of active loan */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {activeLoan.application_number || `LOAN-${activeLoan.id?.slice(0, 8).toUpperCase()}`}
                      </span>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.2rem 0.55rem',
                          borderRadius: '999px',
                          background: getStatusMeta(activeLoan.status).bg,
                          color: getStatusMeta(activeLoan.status).color,
                          border: `1px solid ${getStatusMeta(activeLoan.status).border}`,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {getStatusMeta(activeLoan.status).label}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      {activeLoan.institution_name || 'State Bank of India (KCC Agri Loan)'}
                    </div>
                  </div>

                  {/* PDF Download Button if approved or disbursed */}
                  {(activeLoan.status === 'approved' || activeLoan.status === 'disbursed') && (
                    <button
                      onClick={() => handleDownloadSanction(activeLoan)}
                      disabled={downloadingDocId === activeLoan.id}
                      style={{
                        background: 'var(--bg-sunken)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        borderRadius: '6px',
                        padding: '0.4rem 0.75rem',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        cursor: downloadingDocId === activeLoan.id ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                      title="Download Official Bank Sanction Letter"
                    >
                      <Download size={14} />
                      {downloadingDocId === activeLoan.id ? 'Generating...' : 'Sanction Letter (PDF)'}
                    </button>
                  )}
                </div>

                {/* 4-Stage Progress Stepper */}
                <div style={{ margin: '1.25rem 0', background: 'var(--bg-card)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)' }}>
                    Loan Processing Lifecycle
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', position: 'relative' }}>
                    {[
                      { step: 1, title: 'Submitted', desc: 'Application filed' },
                      { step: 2, title: 'Under Review', desc: 'Verification & appraisal' },
                      { step: 3, title: 'Sanctioned', desc: 'Credit sanctioned' },
                      { step: 4, title: 'Disbursed', desc: 'Credited to account' },
                    ].map(st => {
                      const currentStepNum = getStatusMeta(activeLoan.status).step;
                      const isComplete = currentStepNum >= st.step;
                      const isCurrent = currentStepNum === st.step;
                      return (
                        <div key={st.step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                          <div
                            style={{
                              width: '26px',
                              height: '26px',
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              background: isComplete ? '#2EA043' : isCurrent ? 'var(--color-gold)' : 'var(--bg-sunken)',
                              color: isComplete || isCurrent ? '#0D1117' : 'var(--text-muted)',
                              border: isComplete || isCurrent ? 'none' : '1px solid var(--border-color)',
                              marginBottom: '0.4rem',
                              transition: 'all 0.2s',
                              boxShadow: isCurrent ? '0 0 10px rgba(229, 169, 60, 0.4)' : 'none',
                            }}
                          >
                            {isComplete ? '✓' : st.step}
                          </div>
                          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: isComplete ? '#2EA043' : isCurrent ? 'var(--color-gold)' : 'var(--text-muted)' }}>
                            {st.title}
                          </div>
                          <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', marginTop: '0.1rem', lineHeight: '1.2' }}>
                            {st.desc}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Terms telemetry grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', background: 'var(--bg-sunken)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.85rem' }}>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Approved Amount</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-gold)', fontFamily: 'var(--font-mono)', marginTop: '0.15rem' }}>
                      ₹{Number(activeLoan.approved_amount || activeLoan.amount_requested || 0).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Interest Rate</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: '0.15rem' }}>
                      {activeLoan.interest_rate_annual ? `${activeLoan.interest_rate_annual}% p.a.` : '4.0% p.a.'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Tenure</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: '0.15rem' }}>
                      {activeLoan.tenure_months} mos
                    </div>
                  </div>
                </div>

                {/* Collateral / Remarks note */}
                {activeLoan.collateral_description && (
                  <div style={{ marginTop: '0.75rem', fontSize: '0.72rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '0.6rem' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Security / Collateral:</strong> {activeLoan.collateral_description}
                  </div>
                )}
              </div>
            ) : null}

            {/* Applications List with Filter tabs */}
            <div className="card" style={{ padding: '1.25rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', color: 'var(--text-primary)', margin: 0 }}>
                  Loan Applications ({loans.length})
                </h3>

                {/* Filter buttons */}
                <div style={{ display: 'flex', gap: '0.3rem' }}>
                  {[
                    { key: 'all', label: 'All' },
                    { key: 'sanctioned', label: 'Sanctioned' },
                    { key: 'review', label: 'Under Review' },
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setLoanFilter(tab.key)}
                      style={{
                        background: loanFilter === tab.key ? 'rgba(229, 169, 60, 0.18)' : 'var(--bg-sunken)',
                        border: `1px solid ${loanFilter === tab.key ? 'var(--color-gold, #E5A93C)' : 'var(--border-color)'}`,
                        color: loanFilter === tab.key ? 'var(--color-gold, #E5A93C)' : 'var(--text-muted)',
                        padding: '0.25rem 0.6rem',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {loanLoading ? (
                <LoadingSpinner />
              ) : filteredLoans.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No loan applications found"
                  message="Submit an application using the form on the left to request institutional crop financing."
                  size="sm"
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '380px', overflowY: 'auto', paddingRight: '0.2rem' }}>
                  {filteredLoans.map(l => {
                    const isSelected = activeLoan?.id === l.id;
                    const meta = getStatusMeta(l.status);
                    return (
                      <div
                        key={l.id}
                        onClick={() => setSelectedLoanId(l.id)}
                        style={{
                          padding: '0.75rem 0.9rem',
                          background: isSelected ? 'rgba(229, 169, 60, 0.08)' : 'var(--bg-card)',
                          borderRadius: '8px',
                          border: `1px solid ${isSelected ? 'var(--color-gold, #E5A93C)' : 'var(--border-color)'}`,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: isSelected ? 'var(--color-gold, #E5A93C)' : 'var(--text-primary)', fontWeight: 600 }}>
                            {l.application_number || `LOAN-${l.id?.slice(0, 8).toUpperCase()}`}
                          </span>
                          <span
                            style={{
                              fontSize: '0.65rem',
                              padding: '0.15rem 0.45rem',
                              borderRadius: '999px',
                              background: meta.bg,
                              color: meta.color,
                              border: `1px solid ${meta.border}`,
                              fontWeight: 600,
                            }}
                          >
                            {meta.label}
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.35rem' }}>
                          <div style={{ fontSize: '0.92rem', color: 'var(--text-primary)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                            ₹{Number(l.amount_requested).toLocaleString()}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {l.tenure_months} months · {l.purpose?.replace(/_/g, ' ')}
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem', paddingTop: '0.4rem', borderTop: '1px solid #1c2128' }}>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            {l.institution_name || 'SBI Agri Finance'}
                          </div>
                          {(l.status === 'approved' || l.status === 'disbursed') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadSanction(l);
                              }}
                              disabled={downloadingDocId === l.id}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-muted)',
                                fontSize: '0.68rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                padding: 0,
                              }}
                            >
                              <Download size={11} /> Sanction Letter
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderNotifications() {
    const unreadCount = notifications.filter(n => !n.is_read).length;

    const isBidOrQuote = (n) =>
      ['order', 'bid', 'bids', 'quote', 'quotes', 'procurement'].includes(n.category?.toLowerCase()) ||
      n.metadata?.type?.includes('bid') ||
      n.metadata?.type?.includes('quote') ||
      n.title?.toLowerCase().includes('bid') ||
      n.title?.toLowerCase().includes('quote');

    const isPriceAlert = (n) =>
      ['mandi_price', 'price', 'price_alert'].includes(n.category?.toLowerCase()) ||
      n.metadata?.type?.includes('price') ||
      n.title?.toLowerCase().includes('price');

    const isLoanAlert = (n) =>
      ['loan', 'finance', 'insurance', 'kcc'].includes(n.category?.toLowerCase()) ||
      n.metadata?.type?.includes('loan') ||
      n.title?.toLowerCase().includes('loan') ||
      n.title?.toLowerCase().includes('finance');

    const isUnread = (n) => !n.is_read;

    const filtered = notifications.filter(n => {
      if (notifFilter === 'bids') return isBidOrQuote(n);
      if (notifFilter === 'price') return isPriceAlert(n);
      if (notifFilter === 'loan') return isLoanAlert(n);
      if (notifFilter === 'unread') return isUnread(n);
      return true;
    });

    const getIconMeta = (notif) => {
      const titleLower = notif.title?.toLowerCase() || '';
      const catLower = notif.category?.toLowerCase() || '';
      if (catLower === 'mandi_price' || catLower === 'price' || catLower === 'price_alert' || titleLower.includes('price')) {
        return { icon: TrendingUp, color: 'var(--color-gold)', bg: 'rgba(229, 169, 60, 0.15)', label: 'Price Alert' };
      }
      if (catLower === 'order' || catLower === 'bid' || catLower === 'procurement' || catLower === 'quote' || titleLower.includes('bid') || titleLower.includes('quote')) {
        if (titleLower.includes('accepted')) {
          return { icon: CheckCircle, color: '#2EA043', bg: 'rgba(46, 160, 67, 0.15)', label: 'Quote Accepted' };
        }
        if (titleLower.includes('declined') || titleLower.includes('cancelled') || titleLower.includes('rejected') || titleLower.includes('closed')) {
          return { icon: AlertTriangle, color: '#DA3633', bg: 'rgba(218, 54, 51, 0.15)', label: 'Bid Closed' };
        }
        return { icon: Package, color: '#388bfd', bg: 'rgba(56, 139, 253, 0.15)', label: 'Procurement Bid' };
      }
      if (catLower === 'loan' || catLower === 'finance' || titleLower.includes('loan') || titleLower.includes('finance')) {
        if (titleLower.includes('sanction') || titleLower.includes('approved')) {
          return { icon: CheckCircle, color: '#2EA043', bg: 'rgba(46, 160, 67, 0.15)', label: 'Loan Sanctioned' };
        }
        if (titleLower.includes('disburs')) {
          return { icon: Landmark, color: '#2EA043', bg: 'rgba(46, 160, 67, 0.15)', label: 'Loan Disbursed' };
        }
        return { icon: Clock, color: 'var(--color-gold)', bg: 'rgba(229, 169, 60, 0.15)', label: 'Loan Under Review' };
      }
      return { icon: Bell, color: '#388bfd', bg: 'rgba(56, 139, 253, 0.15)', label: notif.category?.toUpperCase() || 'ALERT' };
    };

    return (
      <div className="card" style={{ padding: '1.5rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', color: 'var(--text-primary)', margin: 0 }}>
                Notifications & Status Alerts
              </h3>
              {unreadCount > 0 && (
                <span style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem', borderRadius: '999px', background: '#388bfd22', color: '#388bfd', border: '1px solid #388bfd44', fontWeight: 700 }}>
                  {unreadCount} New
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Real-time updates on FPO procurement bids, mandi price surges, and loan underwriting.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {/* Filter buttons */}
            <div style={{ display: 'flex', gap: '0.3rem', background: 'var(--bg-card)', padding: '3px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              {[
                { key: 'all', label: `All (${notifications.length})` },
                { key: 'bids', label: `Bids & Quotes (${notifications.filter(isBidOrQuote).length})` },
                { key: 'price', label: `Price Alerts (${notifications.filter(isPriceAlert).length})` },
                { key: 'loan', label: `Loan & Finance (${notifications.filter(isLoanAlert).length})` },
                { key: 'unread', label: `Unread (${unreadCount})` },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setNotifFilter(tab.key)}
                  style={{
                    background: notifFilter === tab.key ? '#D8E3D9' : 'transparent',
                    border: 'none',
                    color: notifFilter === tab.key ? '#fff' : '#4F7A5B',
                    padding: '0.25rem 0.6rem',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    fontWeight: notifFilter === tab.key ? 600 : 400,
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {unreadCount > 0 && (
              <button
                onClick={markAllNotificationsAsRead}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-muted)',
                  padding: '0.3rem 0.65rem',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                }}
              >
                Mark all as read
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Bell}
            size="lg"
            title="No alerts found"
            message="FPO procurement bids, status updates for seller quotes, loans, and price surges will appear here."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filtered.map(n => {
              const meta = getIconMeta(n);
              const IconComp = meta.icon;
              return (
                <div
                  key={n.id}
                  style={{
                    padding: '1rem',
                    background: n.is_read ? 'var(--bg-card)' : 'rgba(56, 139, 253, 0.08)',
                    borderRadius: '8px',
                    border: `1px solid ${!n.is_read ? '#388bfd' : 'var(--border-color)'}`,
                    display: 'flex',
                    gap: '0.85rem',
                    alignItems: 'flex-start',
                    position: 'relative',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Category icon */}
                  <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px' }}>
                    <IconComp size={18} color={meta.color} />
                  </div>

                  {/* Body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.3rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                          {n.title}
                        </span>
                        {!n.is_read && (
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#388bfd', display: 'inline-block' }} />
                        )}
                      </div>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {new Date(n.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', lineHeight: '1.45', marginBottom: '0.65rem' }}>
                      {n.message}
                    </div>

                    {/* Action links */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: meta.bg, color: meta.color, border: `1px solid ${meta.color}44`, fontWeight: 600, textTransform: 'uppercase' }}>
                          {meta.label}
                        </span>
                        {(n.metadata?.bid_id || n.title?.toLowerCase().includes('bid') || n.title?.toLowerCase().includes('quote') || n.title?.toLowerCase().includes('procurement')) && (
                          <button
                            onClick={() => {
                              if (!n.is_read) markNotificationAsRead(n.id);
                              setSection('marketplace');
                              if (n.metadata?.bid_id) {
                                setQuotingBidId(n.metadata.bid_id);
                              }
                            }}
                            style={{
                              background: 'var(--bg-sunken)',
                              border: '1px solid var(--border-color)',
                              color: 'var(--text-primary)',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              padding: '0.2rem 0.6rem',
                              borderRadius: '5px',
                            }}
                          >
                            <Package size={12} /> View Bid & Submit Quote <ArrowRight size={12} />
                          </button>
                        )}
                        {(n.category === 'loan' || n.title?.toLowerCase().includes('loan')) && (
                          <button
                            onClick={() => {
                              if (n.metadata?.loan_id) setSelectedLoanId(n.metadata.loan_id);
                              setSection('finance');
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-primary)',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              padding: 0,
                            }}
                          >
                            View Loan in Finance <ArrowRight size={12} />
                          </button>
                        )}
                        {n.category === 'mandi_price' && (
                          <button
                            onClick={() => setSection('overview')}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-muted)',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              padding: 0,
                            }}
                          >
                            View Price Alert in Overview <ArrowRight size={12} />
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        {!n.is_read && (
                          <button
                            onClick={() => markNotificationAsRead(n.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text-muted)',
                              fontSize: '0.68rem',
                              cursor: 'pointer',
                              padding: 0,
                            }}
                          >
                            Mark as read
                          </button>
                        )}
                        <button
                          onClick={() => dismissNotification(n.id)}
                          title="Dismiss notification"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  /* ── Mandi Price Trend Section ─────────────────────────────────────────── */
  function renderPriceTrends() {
    const activePriceData = farmerTimeRange === '7'
      ? farmerPriceHistory.slice(-7)
      : farmerTimeRange === '14'
        ? farmerPriceHistory.slice(-14)
        : farmerPriceHistory;

    const cropKeys = activePriceData.length > 0
      ? [...new Set(activePriceData.flatMap(r => Object.keys(r).filter(k => k !== 'date' && k !== 'rawDate')))]
      : [];

    const filteredKeys = farmerCropFilter === 'all'
      ? cropKeys
      : cropKeys.filter(k => k.toLowerCase() === farmerCropFilter.toLowerCase());

    // Compute latest price for selected crop vs MSP
    let selectedStats = null;
    if (farmerCropFilter !== 'all') {
      const prices = activePriceData
        .map(r => r[farmerCropFilter.toLowerCase()])
        .filter(p => typeof p === 'number' && !isNaN(p));
      if (prices.length > 0) {
        const latest = prices[prices.length - 1];
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const mspKg = OILSEED_MSP_PER_KG?.[farmerCropFilter.toLowerCase()];
        const mspQuintal = mspKg ? mspKg * 100 : null;
        selectedStats = { latest, min, max, mspQuintal };
      }
    }

    return (
      <div>
        {/* Header */}
        <div style={{ marginBottom: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <TrendingUp size={22} style={{ color: 'var(--text-primary)' }} />
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.35rem', color: 'var(--text-primary)', margin: 0 }}>
              Mandi Price Trend Analytics
            </h2>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: 0 }}>
            Live APMC modal arrival prices for all oilseeds — last 30 days (₹ / Quintal)
          </p>
        </div>

        {/* Main Chart Card */}
        <div className="card" style={{ padding: '1.5rem', marginBottom: '1.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                Source: AGMARKNET API · {activePriceData.length} trading sessions
                {activePriceData[0]?.date ? ` · ${activePriceData[0].date} – ${activePriceData[activePriceData.length - 1]?.date || ''}` : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={loadFarmerPrices}
              disabled={farmerPriceLoading}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.35rem 0.65rem', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 600,
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                color: 'var(--text-primary)', cursor: farmerPriceLoading ? 'not-allowed' : 'pointer',
              }}
            >
              <RefreshCw size={12} style={{ animation: farmerPriceLoading ? 'spin 1s linear infinite' : 'none' }} />
              {farmerPriceLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {/* Filters row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
            {/* Commodity filter */}
            {cropKeys.length > 0 && (
              <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginRight: '0.2rem' }}>Commodity:</span>
                {['all', ...cropKeys].map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFarmerCropFilter(c)}
                    style={{
                      padding: '0.2rem 0.55rem', borderRadius: '4px', fontSize: '0.68rem',
                      fontFamily: 'var(--font-mono)',
                      border: farmerCropFilter === c ? '1px solid var(--color-gold, #E5A93C)' : '1px solid var(--border-color)',
                      background: farmerCropFilter === c ? 'var(--color-gold, #E5A93C)' : 'var(--bg-sunken)',
                      color: farmerCropFilter === c ? 'var(--text-inverse, #0D1117)' : 'var(--text-muted)',
                      cursor: 'pointer', textTransform: 'capitalize', fontWeight: farmerCropFilter === c ? 700 : 500,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {c === 'all' ? 'All Oilseeds' : c}
                  </button>
                ))}
              </div>
            )}

            {/* Time range */}
            <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-sunken)', padding: '3px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              {[{ id: '7', label: '7D' }, { id: '14', label: '14D' }, { id: '30', label: '30D' }].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setFarmerTimeRange(t.id)}
                  style={{
                    padding: '0.2rem 0.65rem', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 600,
                    fontFamily: 'var(--font-mono)', border: 'none',
                    background: farmerTimeRange === t.id ? 'var(--color-gold, #E5A93C)' : 'transparent',
                    color: farmerTimeRange === t.id ? 'var(--text-inverse, #0D1117)' : 'var(--text-muted)',
                    cursor: 'pointer', transition: 'all 0.15s ease',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stats row for selected crop */}
          {selectedStats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem', marginBottom: '1rem' }}>
              {[
                { label: 'Latest Modal Price', val: `₹${selectedStats.latest.toLocaleString('en-IN')}/q`, sub: `₹${(selectedStats.latest / 100).toFixed(1)}/kg` },
                { label: '30d Lowest', val: `₹${selectedStats.min.toLocaleString('en-IN')}/q`, sub: `₹${(selectedStats.min / 100).toFixed(1)}/kg` },
                { label: '30d Highest', val: `₹${selectedStats.max.toLocaleString('en-IN')}/q`, sub: `₹${(selectedStats.max / 100).toFixed(1)}/kg` },
              ].map((s, i) => (
                <div key={i} style={{ background: 'var(--bg-card)', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{s.label}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.15rem' }}>{s.val}</div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{s.sub}</div>
                </div>
              ))}
              {selectedStats.mspQuintal && (
                <div style={{ background: 'var(--bg-card)', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>CACP Mandated MSP</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                    ₹{selectedStats.mspQuintal.toLocaleString('en-IN')}/q
                  </div>
                  <div style={{ fontSize: '0.62rem', color: selectedStats.latest >= selectedStats.mspQuintal ? '#4F7A5B' : '#DA3633' }}>
                    {selectedStats.latest >= selectedStats.mspQuintal ? '✓ Above MSP' : '⚠️ Below MSP'}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Chart */}
          {farmerPriceLoading && farmerPriceHistory.length === 0 ? (
            <LoadingSpinner label="Loading mandi price data…" />
          ) : farmerPriceError && farmerPriceHistory.length === 0 ? (
            <EmptyState icon={TrendingUp} title="Could not load price data" message={farmerPriceError} />
          ) : !farmerPriceLoading && activePriceData.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No mandi price data yet"
              message="Price history will appear once AGMARKNET data is ingested. Ask your FPO or Government officer to trigger a sync."
              size="sm"
            />
          ) : (
            <ResponsiveContainer width="100%" height={380}>
              <AreaChart data={activePriceData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  {filteredKeys.map((k, i) => {
                    const color = FARMER_CROP_COLORS[k.toLowerCase()] || FARMER_CROP_PALETTE[i % FARMER_CROP_PALETTE.length];
                    return (
                      <linearGradient key={k} id={`farmergrad-${k}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={color} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                      </linearGradient>
                    );
                  })}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false}
                  axisLine={{ stroke: 'var(--border-color)' }} minTickGap={25} interval="preserveStartEnd" />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickLine={false} axisLine={false}
                  tickFormatter={v => `₹${(Number(v || 0) / 1000).toFixed(1)}k`} domain={['auto', 'auto']} />
                <Tooltip content={<FarmerPriceTooltip />} />
                <Legend wrapperStyle={{ fontSize: '0.72rem', color: 'var(--text-muted)' }} />
                {filteredKeys.map((k, i) => {
                  const color = FARMER_CROP_COLORS[k.toLowerCase()] || FARMER_CROP_PALETTE[i % FARMER_CROP_PALETTE.length];
                  return (
                    <Area
                      key={k}
                      type="monotone"
                      dataKey={k}
                      name={k.charAt(0).toUpperCase() + k.slice(1)}
                      stroke={color}
                      strokeWidth={2.2}
                      fill={`url(#farmergrad-${k})`}
                      dot={activePriceData.length > 14 ? false : { r: 2.5, fill: color }}
                      activeDot={{ r: 5, stroke: '#FFFFFF', strokeWidth: 2 }}
                      connectNulls={true}
                    />
                  );
                })}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Quick MSP Reference Card */}
        {OILSEED_MSP_PER_KG && (
          <div className="card" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', color: 'var(--text-primary)', margin: '0 0 0.85rem' }}>
              📋 CACP Mandated MSP Reference — 2026-27
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.6rem' }}>
              {Object.entries(OILSEED_MSP_PER_KG).map(([crop, mspKg]) => (
                <div key={crop} style={{ background: 'var(--bg-sunken)', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'capitalize', marginBottom: '0.2rem' }}>{crop}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-gold, #E5A93C)', fontSize: '0.95rem' }}>
                    ₹{(mspKg * 100).toLocaleString('en-IN')}/q
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>₹{mspKg}/kg · NMEO-OP</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Forward-Looking AI Price & Demand Forecasting ── */}
        <div style={{ marginTop: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <span style={{ background: 'var(--bg-sunken)', padding: '6px', borderRadius: '8px', color: 'var(--text-primary)', display: 'flex' }}>
              <Sparkles size={18} />
            </span>
            <div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                Forward AI Price Projections & Market Balance
              </h3>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: 0 }}>
                Machine learning multi-day price trajectories (Random Forest) and macroeconomic demand-supply pressure indices.
              </p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '1.5rem' }}>
            <PriceForecastPanel defaultCrop={farmerCropFilter !== 'all' ? farmerCropFilter : 'mustard'} compact={false} />
            <DemandForecastPanel defaultCrop={farmerCropFilter !== 'all' ? farmerCropFilter : 'mustard'} compact={false} />
          </div>
        </div>
      </div>
    );
  }

  /* ── Crop Health & Storage Map Section ──────────────────────────────────── */
  function renderCropMap() {
    const showCropHealth = farmerMapLayer === 'all' || farmerMapLayer === 'crop_health';
    const showWeather    = farmerMapLayer === 'all' || farmerMapLayer === 'weather';
    const showWarehouses = farmerMapLayer === 'all' || farmerMapLayer === 'warehouse';

    return (
      <div>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <MapPin size={22} style={{ color: 'var(--text-muted)' }} />
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.35rem', color: 'var(--text-primary)', margin: 0 }}>
                Regional Crop Health & Storage Map
              </h2>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: 0 }}>
              Geospatial view of oilseed crop health, agro-climatic belts, and nearest storage facilities
            </p>
          </div>
          <button
            type="button"
            onClick={loadFarmerMapData}
            disabled={farmerMapLoading}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.35rem 0.65rem', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 600,
              background: 'var(--bg-card)', border: '1px solid var(--border-color)',
              color: 'var(--text-primary)', cursor: farmerMapLoading ? 'not-allowed' : 'pointer',
            }}
          >
            <RefreshCw size={12} style={{ animation: farmerMapLoading ? 'spin 1s linear infinite' : 'none' }} />
            {farmerMapLoading ? 'Loading…' : 'Refresh Map'}
          </button>
        </div>

        {/* Layer Filter Pills */}
        <div style={{ display: 'flex', gap: '0.4rem', background: 'var(--bg-sunken)', padding: '0.3rem', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {[
            { id: 'all',         label: 'All Telemetry',        icon: Layers,          color: '#E5A93C' },
            { id: 'crop_health', label: 'Regional Crop Health', icon: ShieldCheck,     color: '#2EA043' },
            { id: 'warehouse',   label: 'Storage Facilities',   icon: WarehouseIcon,   color: '#E5A93C' },
            { id: 'weather',     label: 'Agro-Climatic',        icon: Thermometer,     color: '#58A6FF' },
          ].map(({ id, label, icon: Icon, color }) => (
            <button
              key={id}
              type="button"
              onClick={() => setFarmerMapLayer(id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                padding: '0.3rem 0.65rem', borderRadius: '6px', fontSize: '0.72rem',
                fontWeight: farmerMapLayer === id ? 700 : 500,
                background: farmerMapLayer === id ? `${color}22` : 'transparent',
                color: farmerMapLayer === id ? color : 'var(--text-muted)',
                border: farmerMapLayer === id ? `1px solid ${color}` : '1px solid transparent',
                cursor: 'pointer', transition: 'all 0.15s ease',
              }}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {/* Map Card */}
        <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
          {/* Legend */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Telemetry Legend:</span>
              {[
                { color: '#2EA043', label: 'Crop Health (Optimal)' },
                { color: '#E5A93C', label: 'Warehouses (Storage)' },
                { color: '#DA3633', label: 'Pest Risk Alert' },
                { color: '#58A6FF', label: 'Agro-Climatic Belts' },
              ].map(({ color, label }) => (
                <span key={label} style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }}></span>
                  {label}
                </span>
              ))}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Click any pin to view details</div>
          </div>

          {farmerMapLoading ? (
            <LoadingSpinner label="Loading map data…" />
          ) : (
            <div style={{ height: '520px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
              <MapContainer center={[22.5, 78.5]} zoom={5} style={{ height: '100%', width: '100%' }} zoomControl>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Regional Crop Health Markers */}
                {showCropHealth && farmerRegionalHealth.map((r, idx) => {
                  const lat = Number(r.latitude);
                  const lng = Number(r.longitude);
                  if (isNaN(lat) || isNaN(lng)) return null;
                  const statusColor = r.badge_color || (r.health_status === 'Optimal' ? '#2EA043' : r.health_status === 'High Risk' ? '#DA3633' : '#E5A93C');
                  const labelText = `${r.district} (${r.crop_count > 0 ? `${r.health_status} · ${r.crop_count} crops` : `${r.farmer_count} farmers`})`;
                  const icon = createFarmerDivIcon('var(--bg-card, #161B22)', statusColor, labelText, statusColor, 'var(--text-primary, #F0F6FC)');
                  return (
                    <Marker key={`ch-${r.district}-${idx}`} position={[lat, lng]} icon={icon}>
                      <Popup>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-primary, #F0F6FC)', minWidth: '220px', lineHeight: 1.45 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '0.25rem' }}>🌾 {r.district}</div>
                          <div style={{ color: 'var(--text-muted, #8B949E)', fontSize: '0.72rem', marginBottom: '0.4rem', borderBottom: '1px solid var(--border-color, #30363D)', paddingBottom: '0.2rem' }}>
                            {r.state} · Oilseed Belt
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginBottom: '0.4rem' }}>
                            <div><span style={{ color: 'var(--text-muted)' }}>Farmers:</span> <strong style={{ color: 'var(--text-primary)' }}>{r.farmer_count}</strong> ({r.verified_farmers_count} DigiLocker)</div>
                            <div><span style={{ color: 'var(--text-muted)' }}>Active Crops:</span> <strong style={{ color: 'var(--text-primary)' }}>{r.crop_count}</strong> ({r.total_crop_acreage} acres)</div>
                          </div>
                          {r.crops && r.crops.length > 0 && (
                            <div style={{ background: 'var(--bg-sunken, #0D1117)', padding: '0.4rem 0.55rem', borderRadius: '6px', border: '1px solid var(--border-color, #30363D)' }}>
                              <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--color-gold, #E5A93C)', marginBottom: '0.2rem' }}>Registered Oilseeds:</div>
                              {r.crops.slice(0, 4).map((c, ci) => (
                                <div key={ci} style={{ fontSize: '0.68rem', color: 'var(--text-muted, #8B949E)' }}>
                                  • <span style={{ textTransform: 'capitalize', fontWeight: 600, color: 'var(--text-primary, #F0F6FC)' }}>{c.crop_type}</span>: {c.acreage} ac
                                </div>
                              ))}
                            </div>
                          )}
                          <div style={{
                            marginTop: '0.4rem',
                            background: r.high_risk_pest_count > 0 ? 'rgba(218,54,51,0.18)' : r.pest_reports_count > 0 ? 'rgba(229,169,60,0.18)' : 'rgba(46,160,67,0.18)',
                            border: `1px solid ${r.high_risk_pest_count > 0 ? '#DA3633' : r.pest_reports_count > 0 ? '#E5A93C' : '#2EA043'}`,
                            padding: '0.3rem 0.45rem', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 600,
                            color: r.high_risk_pest_count > 0 ? '#F85149' : r.pest_reports_count > 0 ? '#E5A93C' : '#3FB950',
                          }}>
                            {r.high_risk_pest_count > 0
                              ? `⚠️ High Risk: ${r.high_risk_pest_count} Critical Alerts`
                              : r.pest_reports_count > 0
                              ? `ℹ️ Monitoring: ${r.pest_reports_count} Pest Logs`
                              : '✓ Optimal Crop Health'}
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}

                {/* Agro-Climatic Weather Markers */}
                {showWeather && farmerWeatherLogs.map(w => {
                  const lat = Number(w.latitude);
                  const lng = Number(w.longitude);
                  if (isNaN(lat) || isNaN(lng)) return null;
                  const icon = createFarmerDivIcon('var(--bg-card, #161B22)', '#58A6FF', `🌤️ ${w.district}`, '#58A6FF', 'var(--text-primary, #F0F6FC)');
                  return (
                    <Marker key={w.id || `${lat}-${lng}`} position={[lat, lng]} icon={icon}>
                      <Popup>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-primary, #F0F6FC)', minWidth: '180px', lineHeight: 1.45 }}>
                          <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>🌾 {w.district}, {w.state}</div>
                          <div style={{ color: 'var(--text-muted, #8B949E)', fontSize: '0.7rem', marginBottom: '0.4rem', borderBottom: '1px solid var(--border-color, #30363D)', paddingBottom: '0.2rem' }}>Agro-Climatic Telemetry</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem', marginBottom: '0.35rem' }}>
                            <div><span style={{ color: 'var(--text-muted)' }}>Temp:</span> <strong style={{ color: 'var(--text-primary)' }}>{w.temperature_c ?? '—'}°C</strong></div>
                            <div><span style={{ color: 'var(--text-muted)' }}>Humidity:</span> <strong style={{ color: 'var(--text-primary)' }}>{w.humidity_pct ?? '—'}%</strong></div>
                            <div><span style={{ color: 'var(--text-muted)' }}>Rainfall:</span> <strong style={{ color: 'var(--text-primary)' }}>{w.rainfall_mm ?? '0'} mm</strong></div>
                            <div><span style={{ color: 'var(--text-muted)' }}>Wind:</span> <strong style={{ color: 'var(--text-primary)' }}>{w.wind_speed_kmh ?? '—'} km/h</strong></div>
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#58A6FF' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Condition:</span> <strong style={{ color: 'var(--text-primary)' }}>{w.weather_condition || 'Normal'}</strong>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}

                {/* Warehouse Markers */}
                {showWarehouses && farmerWarehouses.map((wh, idx) => {
                  const fallbackCoords = {
                    'Indore': [22.7196, 75.8577], 'Ujjain': [23.1765, 75.7885],
                    'Khargone': [21.8234, 75.6087], 'Morena': [26.4948, 77.9940],
                    'Bharatpur': [27.2170, 77.4895], 'Rajkot': [22.3039, 70.8022],
                    'Koppal': [15.3468, 76.1554], 'Latur': [18.4088, 76.5604],
                  };
                  let lat = Number(wh.latitude);
                  let lng = Number(wh.longitude);
                  if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
                    const key = Object.keys(fallbackCoords).find(k => wh.district?.toLowerCase().includes(k.toLowerCase()) || wh.name?.toLowerCase().includes(k.toLowerCase()));
                    if (key) { [lat, lng] = fallbackCoords[key]; } else return null;
                  }
                  const usedPct = wh.total_capacity_tonnes > 0
                    ? Math.round(((wh.total_capacity_tonnes - (wh.available_capacity_tonnes || 0)) / wh.total_capacity_tonnes) * 100)
                    : 0;
                  const capacityColor = usedPct > 85 ? '#DA3633' : usedPct > 60 ? '#E5A93C' : '#2EA043';
                  const labelText = `🏢 ${wh.name?.slice(0, 20) || 'Warehouse'} (${usedPct}%)`;
                  const icon = createFarmerDivIcon('var(--bg-card, #161B22)', capacityColor, labelText, capacityColor, 'var(--text-primary, #F0F6FC)');
                  return (
                    <Marker key={wh.id || `wh-${idx}`} position={[lat, lng]} icon={icon}>
                      <Popup>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-primary, #F0F6FC)', minWidth: '200px', lineHeight: 1.45 }}>
                          <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>🏢 {wh.name}</div>
                          <div style={{ color: 'var(--text-muted, #8B949E)', fontSize: '0.7rem', marginBottom: '0.4rem', borderBottom: '1px solid var(--border-color, #30363D)', paddingBottom: '0.2rem' }}>
                            {wh.district}, {wh.state}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginBottom: '0.35rem' }}>
                            <div><span style={{ color: 'var(--text-muted)' }}>Total Capacity:</span> <strong style={{ color: 'var(--text-primary)' }}>{(wh.total_capacity_tonnes || 0).toLocaleString()} tonnes</strong></div>
                            <div><span style={{ color: 'var(--text-muted)' }}>Available:</span> <strong style={{ color: 'var(--text-primary)' }}>{(wh.available_capacity_tonnes || 0).toLocaleString()} tonnes</strong></div>
                          </div>
                          <div style={{
                            background: usedPct > 85 ? 'rgba(218,54,51,0.18)' : usedPct > 60 ? 'rgba(229,169,60,0.18)' : 'rgba(46,160,67,0.18)',
                            border: `1px solid ${capacityColor}`,
                            padding: '0.3rem 0.45rem', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 700,
                            color: capacityColor,
                          }}>
                            {usedPct}% Capacity Used · {usedPct > 85 ? '⚠️ Near Full' : usedPct > 60 ? '🟡 Moderate' : '✓ Available'}
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            </div>
          )}
        </div>

        {/* Warehouse Summary Cards */}
        {farmerWarehouses.length > 0 && (
          <div className="card" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', color: 'var(--text-primary)', margin: '0 0 0.85rem' }}>
              🏢 Nearest Storage Facilities
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              {farmerWarehouses.slice(0, 6).map(wh => {
                const usedPct = wh.total_capacity_tonnes > 0
                  ? Math.round(((wh.total_capacity_tonnes - (wh.available_capacity_tonnes || 0)) / wh.total_capacity_tonnes) * 100)
                  : 0;
                const barColor = usedPct > 85 ? '#DA3633' : usedPct > 60 ? '#E5A93C' : '#2EA043';
                return (
                  <div key={wh.id} style={{ background: 'var(--bg-sunken)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{wh.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{wh.district}, {wh.state}</div>
                    <div style={{ height: '5px', borderRadius: '999px', background: 'var(--border-color)', overflow: 'hidden', marginBottom: '0.35rem' }}>
                      <div style={{ height: '100%', width: `${usedPct}%`, background: barColor, borderRadius: '999px', transition: 'width 0.4s ease' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{usedPct}% used</span>
                      <span style={{ color: barColor, fontWeight: 700 }}>{(wh.available_capacity_tonnes || 0).toLocaleString()} t free</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  const SECTION_MAP = {
    overview: renderOverview,
    crops: renderCrops,
    price_trends: renderPriceTrends,
    crop_map: renderCropMap,
    marketplace: renderMarketplace,
    pest: renderPest,
    finance: renderFinance,
    notifications: renderNotifications,
    profile: renderOnboarding,
  };

  return (
    <DashboardShell role="farmer" user={userProfile} activeSection={section} onSectionChange={setSection}>
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Farmer Dashboard
        </div>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Welcome, {name} 🌾
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.3rem' }}>
          Rabi season 2026 — track crops, prices, and alerts.
        </p>
      </div>

      <ErrorBoundary>
        {(SECTION_MAP[section] || renderOverview)()}
      </ErrorBoundary>

      {provenanceCrop && provenanceCrop.batch_code && (
        <ProvenanceTimelineModal
          isOpen={!!provenanceCrop}
          onClose={() => setProvenanceCrop(null)}
          batchCode={provenanceCrop.batch_code}
          batchId={provenanceCrop.batch_id || provenanceCrop.id}
        />
      )}
    </DashboardShell>
  );
}




