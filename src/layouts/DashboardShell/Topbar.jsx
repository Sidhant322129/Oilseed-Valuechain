// src/layouts/DashboardShell/Topbar.jsx
import React from 'react';
import { LogOut, Menu, ChevronRight, Sun, Moon } from 'lucide-react';
import { signOut } from '@/lib/auth';
import { NAV_LINKS, getRoleMeta } from '@/config/navigation';
import { useTheme } from '@/context/ThemeContext';

export default function Topbar({ role, activeSection, onOpenMobile }) {
  const meta = getRoleMeta(role);
  const { theme, toggleTheme, isDark } = useTheme();
  const sectionLabel =
    (NAV_LINKS[role] || []).find((l) => l.id === activeSection)?.label || 'Overview';

  return (
    <header className="topbar">
      <button
        type="button"
        onClick={onOpenMobile}
        className="btn btn-outline btn-icon lg:hidden"
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
        <span className="hidden font-medium sm:inline" style={{ color: 'var(--text-muted)' }}>{meta.label} Console</span>
        <ChevronRight size={14} className="hidden sm:inline" style={{ color: 'var(--text-muted)' }} />
        <span className="truncate font-heading font-semibold" style={{ color: 'var(--text-primary)' }}>{sectionLabel}</span>
      </nav>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Night / Light Mode Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          className="theme-toggle-btn"
          title={isDark ? 'Switch to Day Mode' : 'Switch to Night Mode'}
          aria-label={isDark ? 'Switch to Day Mode' : 'Switch to Night Mode'}
        >
          {isDark ? (
            <>
              <Sun size={15} className="text-canola-400 animate-spin-slow" />
              <span className="text-xs font-semibold font-mono tracking-wider hidden md:inline">DAY</span>
            </>
          ) : (
            <>
              <Moon size={15} className="text-emerald-700" />
              <span className="text-xs font-semibold font-mono tracking-wider hidden md:inline">NIGHT</span>
            </>
          )}
        </button>

        <span
          className="badge"
          style={{ background: `${meta.color}14`, color: meta.color, borderColor: `${meta.color}40` }}
        >
          {meta.label}
        </span>

        <button
          id="btn-sign-out"
          type="button"
          onClick={() => signOut()}
          className="btn btn-danger btn-sm"
        >
          <LogOut size={14} />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
