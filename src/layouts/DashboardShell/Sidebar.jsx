// src/layouts/DashboardShell/Sidebar.jsx
import React from 'react';
import { ChevronsLeft, ChevronsRight, Sprout, X } from 'lucide-react';
import { NAV_LINKS, getRoleMeta } from '@/config/navigation';
import { cn } from '@/utils/cn';

export default function Sidebar({
  role,
  user,
  activeSection,
  onSectionChange,
  unreadNotifCount = 0,
  highFlagCount = 0,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}) {
  const links = NAV_LINKS[role] || NAV_LINKS.farmer;
  const meta = getRoleMeta(role);
  const displayName = user?.full_name || user?.email || 'User';
  const initials = displayName.slice(0, 2).toUpperCase();

  const handleSelect = (id) => {
    onSectionChange?.(id);
    onCloseMobile?.();
  };

  return (
    <aside
      className={cn('sidebar', collapsed && 'is-collapsed', mobileOpen && 'is-mobile-open')}
      aria-label="Primary navigation"
    >
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-0 border-b border-solid border-line px-4">
        <div className="sidebar-brand-mark">
          <Sprout size={20} strokeWidth={2.2} />
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="font-heading text-[0.95rem] font-bold" style={{ color: 'var(--text-primary)' }}>Sovereign Harvest</div>
            <div className="font-mono text-[0.65rem] font-semibold tracking-[0.12em]" style={{ color: 'var(--color-gold, #E5A93C)' }}>
              NMEO-OP
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onCloseMobile}
          className="btn btn-ghost btn-icon ml-auto lg:hidden"
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        {!collapsed && <div className="sidebar-section-label">Workspace</div>}
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = activeSection === link.id;
          const isHighFlagBadge = link.id === 'bid_monitor' && highFlagCount > 0;
          const showBadge = (link.id === 'notifications' && unreadNotifCount > 0) || isHighFlagBadge;
          const badgeValue = isHighFlagBadge ? highFlagCount : unreadNotifCount;

          return (
            <button
              key={link.id}
              id={`nav-${link.id}`}
              type="button"
              onClick={() => handleSelect(link.id)}
              title={collapsed ? link.label : undefined}
              aria-current={isActive ? 'page' : undefined}
              className={cn('nav-item', isActive && 'is-active')}
            >
              <Icon size={18} className="nav-item-icon shrink-0" />
              {!collapsed && <span className="truncate">{link.label}</span>}
              {showBadge && !collapsed && (
                <span
                  className="nav-count"
                  style={isHighFlagBadge ? { background: '#DA3633', color: '#fff', border: '1px solid rgba(218,54,51,0.6)' } : undefined}
                >
                  {badgeValue}
                </span>
              )}
              {showBadge && collapsed && (
                <span
                  className="nav-dot"
                  style={isHighFlagBadge ? { background: '#DA3633', boxShadow: '0 0 6px #DA3633' } : undefined}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle (desktop) */}
      <div className="hidden px-3 pb-2 lg:block">
        <button
          type="button"
          onClick={onToggleCollapse}
          className={cn('nav-item', collapsed && 'justify-center')}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>

      {/* User */}
      <div className="border-0 border-t border-solid p-3" style={{ borderColor: 'var(--border-color)' }}>
        <div
          className={cn('flex items-center gap-3 rounded-xl p-2.5', collapsed && 'justify-center bg-transparent')}
          style={{ background: 'var(--bg-sunken)', border: '1px solid var(--border-color)' }}
        >
          <div
            className="avatar"
            style={{ background: `${meta.color}25`, color: meta.color, boxShadow: `inset 0 0 0 1.5px ${meta.color}66` }}
          >
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-[0.82rem] font-semibold" style={{ color: 'var(--text-primary)' }}>{displayName}</div>
              <div className="text-[0.68rem] font-bold uppercase tracking-wider" style={{ color: meta.color }}>
                {meta.label}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
