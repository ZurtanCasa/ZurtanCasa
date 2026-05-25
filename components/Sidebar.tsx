"use client";
import { useState } from "react";

export type TabId = "ceo" | "chat" | "performance" | "ads" | "roas" | "funnel" | "locales" | "articulos" | "precios" | "plan" | "tutorial";

const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: "ceo", icon: "🧠", label: "CEO" },
  { id: "chat", icon: "💬", label: "Chat" },
  { id: "performance", icon: "📊", label: "Performance" },
  { id: "ads", icon: "📈", label: "Ads Daily" },
  { id: "roas", icon: "🎯", label: "ROAS Triangulado" },
  { id: "funnel", icon: "🛒", label: "Funnel & ML" },
  { id: "locales", icon: "🏪", label: "Locales Físicos" },
  { id: "articulos", icon: "📦", label: "Artículos" },
  { id: "precios", icon: "💰", label: "Lista de Precios" },
  { id: "plan", icon: "📅", label: "Plan vs Real" },
  { id: "tutorial", icon: "📚", label: "Tutorial" },
];

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  lastRefresh: string | null;
}

export default function Sidebar({ activeTab, onTabChange, lastRefresh }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="sidebar-logo">
        <span style={{ fontSize: 20 }}>🏠</span>
        <div>
          <div className="sidebar-logo-text">ZurtanCasa</div>
          <div className="sidebar-logo-sub">Performance Dashboard</div>
        </div>
        <button className="sidebar-collapse-btn" onClick={() => setCollapsed(!collapsed)} title="Colapsar">
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      <nav className="sidebar-nav">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`nav-item${activeTab === tab.id ? " active" : ""}`}
            onClick={() => onTabChange(tab.id)}
            title={tab.label}
          >
            <span className="nav-icon">{tab.icon}</span>
            <span className="nav-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        {lastRefresh ? (
          <>
            <div>Actualizado</div>
            <div className="mono" style={{ fontSize: 10, marginTop: 2 }}>{lastRefresh}</div>
          </>
        ) : (
          <div>Sin datos aún</div>
        )}
      </div>
    </aside>
  );
}
