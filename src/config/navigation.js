// src/config/navigation.js
// Single source of truth for role-based sidebar navigation and role metadata.
// Section ids must match the SECTION_MAP keys inside each dashboard page.

import {
  LayoutDashboard, Leaf, ShoppingCart, Bell, Wallet, Warehouse, Truck,
  Users, TrendingUp, Camera, QrCode, ClipboardList, MapPin, ShieldAlert,
} from 'lucide-react';

export const NAV_LINKS = {
  farmer: [
    { icon: LayoutDashboard, label: 'Overview', id: 'overview' },
    { icon: Leaf, label: 'My Crops', id: 'crops' },
    { icon: TrendingUp, label: 'Mandi Price Trends', id: 'price_trends' },
    { icon: MapPin, label: 'Crop & Storage Map', id: 'crop_map' },
    { icon: ShoppingCart, label: 'Marketplace', id: 'marketplace' },
    { icon: Camera, label: 'Pest Detection', id: 'pest' },
    { icon: Wallet, label: 'Finance', id: 'finance' },
    { icon: Bell, label: 'Notifications', id: 'notifications' },
  ],
  fpo: [
    { icon: LayoutDashboard, label: 'Overview', id: 'overview' },
    { icon: Users, label: 'Farmer Registry', id: 'farmers' },
    { icon: ClipboardList, label: 'Procurement Bids', id: 'procurement' },
    { icon: ShoppingCart, label: 'Bulk Procurement', id: 'marketplace' },
    { icon: Warehouse, label: 'Storage', id: 'warehouse' },
    { icon: Bell, label: 'Notifications', id: 'notifications' },
  ],
  processor: [
    { icon: LayoutDashboard, label: 'Overview', id: 'overview' },
    { icon: Leaf, label: 'Batch Intake', id: 'batches' },
    { icon: Warehouse, label: 'Warehouses', id: 'warehouse' },
    { icon: Truck, label: 'Logistics', id: 'logistics' },
    { icon: QrCode, label: 'QR Verification', id: 'blockchain' },
    { icon: Bell, label: 'Notifications', id: 'notifications' },
  ],
  retailer: [
    { icon: LayoutDashboard, label: 'Overview', id: 'overview' },
    { icon: ShoppingCart, label: 'Marketplace', id: 'marketplace' },
    { icon: QrCode, label: 'Provenance QR', id: 'blockchain' },
    { icon: Wallet, label: 'Orders & Invoices', id: 'orders' },
    { icon: Bell, label: 'Notifications', id: 'notifications' },
  ],
  government: [
    { icon: LayoutDashboard, label: 'Overview', id: 'overview' },
    { icon: TrendingUp, label: 'Price Analytics', id: 'analytics' },
    { icon: Warehouse, label: 'Warehouse Map', id: 'warehouse' },
    { icon: Wallet, label: 'Scheme Manager', id: 'schemes' },
    { icon: Users, label: 'Farmer Profiles', id: 'farmers' },
  ],
  admin: [
    { icon: LayoutDashboard, label: 'Overview', id: 'overview' },
    { icon: ShieldAlert, label: 'Bid Monitor', id: 'bid_monitor' },
    { icon: Users, label: 'User Management', id: 'users' },
    { icon: Bell, label: 'Broadcast', id: 'broadcast' },
  ],
};

export const ROLE_META = {
  farmer: {
    label: 'Farmer',
    color: '#2EA043',
    tagline: 'Register crops, track prices and diagnose pests — all in one place.',
    image: '/images/farmer-image.jpg',
  },
  fpo: {
    label: 'FPO',
    color: '#3FB950',
    tagline: 'Aggregate member produce, manage bids and monitor storage.',
    image: '/images/farmer-image.jpg',
  },
  processor: {
    label: 'Processor',
    color: '#56D364',
    tagline: 'Verify batch intake, certify quality and publish provenance.',
    image: '/images/processor-image.jpg',
  },
  retailer: {
    label: 'Retailer',
    color: '#E5A93C',
    tagline: 'Source traceable oilseeds, pay securely and download invoices.',
    image: '/images/retailer-image.jpg',
  },
  government: {
    label: 'Government',
    color: '#58A6FF',
    tagline: 'Monitor supply, prices, storage capacity and scheme eligibility nationwide.',
    image: '/images/government-image.jpg',
  },
  admin: {
    label: 'Admin',
    color: '#F85149',
    tagline: 'Platform telemetry, user management and system broadcasts.',
    image: '/images/government-image.jpg',
  },
};

export const getRoleMeta = (role) => ROLE_META[role] || ROLE_META.farmer;
