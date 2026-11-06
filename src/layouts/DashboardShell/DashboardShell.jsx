// src/layouts/DashboardShell/DashboardShell.jsx
// Shared layout for all 6 role dashboards: sidebar + top bar + hero + content.
// Public API (props) is unchanged so every dashboard keeps working as-is.

import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { getRoleMeta } from '@/config/navigation';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardShell({
  role,
  user,
  children,
  activeSection,
  onSectionChange,
  unreadNotifCount = 0,
  highFlagCount = 0,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const meta = getRoleMeta(role);
  const firstName = (user?.full_name || user?.email || 'there').split(/[\s@]/)[0];
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="app-shell">
      <Sidebar
        role={role}
        user={user}
        activeSection={activeSection}
        onSectionChange={onSectionChange}
        unreadNotifCount={unreadNotifCount}
        highFlagCount={highFlagCount}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      {mobileOpen && (
        <div className="sidebar-backdrop lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar role={role} activeSection={activeSection} onOpenMobile={() => setMobileOpen(true)} />

        <main className="content-canvas">
          {/* Role hero — photography sits behind a dark gradient so text stays legible */}
          <section
            className="hero-banner mb-6 anim-fade-in"
            style={{ backgroundImage: `url('${meta.image}')` }}
          >
            <div className="flex flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between md:px-8">
              <div className="max-w-2xl">
                <div className="mb-1 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-canola-400">
                  {today}
                </div>
                <h2 className="m-0 font-heading text-2xl font-bold md:text-[1.7rem]">
                  {greeting()}, {firstName}
                </h2>
                <p className="mt-1 text-sm text-white/80">{meta.tagline}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-solid border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur">
                  {meta.label} Workspace
                </span>
              </div>
            </div>
          </section>

          <div className="relative anim-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
