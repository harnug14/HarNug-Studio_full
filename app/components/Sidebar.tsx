"use client";

import { useState, useEffect } from "react";
import Link from "next/navigation";
import { usePathname } from "next/navigation";

interface SidebarProps {
  userEmail?: string;
}

const MENU_ITEMS = [
  { label: "Profile", path: "/profile", icon: "user" },
  { label: "Reference", path: "/referensi", icon: "search" },
  { label: "Topic", path: "/topik", icon: "bulb" },
  { label: "Script", path: "/naskah", icon: "file-text" },
  { label: "Visual", path: "/visual", icon: "film" },
  { label: "Chat", path: "/chat", icon: "chat" },
  { label: "Api Key", path: "/api-key", icon: "key" },
];

export default function Sidebar({ userEmail }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    document.documentElement.style.setProperty(
      "--sidebar-width",
      collapsed ? "64px" : "260px"
    );
  }, [collapsed]);

  return (
    <>
      {/* Tombol Hamburger Utama khusus Mobile (Top-Left) */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="mobile-hamburger-btn"
        style={{
          position: "fixed",
          top: 10,
          left: 10,
          zIndex: 50,
          width: 36,
          height: 36,
          borderRadius: "var(--radius-md)",
          background: "var(--bg-secondary)",
          border: "1px solid var(--glass-border)",
          color: "var(--text-primary)",
          display: "none",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
        title="Menu Utama"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>

      {/* Backdrop Hitam untuk Menutup Sidebar Mobile (Tanpa Tombol X) */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(2px)",
            zIndex: 40,
          }}
        />
      )}

      {/* Main Sidebar Element */}
      <aside
        className={`main-app-sidebar ${mobileOpen ? "mobile-open" : ""}`}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: collapsed ? 64 : 260,
          background: "var(--bg-primary)",
          borderRight: "1px solid var(--glass-border)",
          display: "flex",
          flexDirection: "column",
          transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          zIndex: 45,
          overflow: "hidden",
        }}
      >
        {/* Header Main Sidebar - Tinggi 57px Presisi Simetris dengan Topbar */}
        <div
          style={{
            height: 57,
            padding: "0 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "space-between",
            borderBottom: "1px solid var(--glass-border)",
            flexShrink: 0,
            boxSizing: "border-box"
          }}
        >
          {!collapsed && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>
                HarNug Studio
              </div>
              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                AI Creator Studio
              </div>
            </div>
          )}

          {/* Tombol Toggle Sidebar Utama di PC (Ikon Hamburger 3 Garis [≡]) */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="desktop-toggle-btn"
            style={{
              width: 32,
              height: 32,
              borderRadius: "var(--radius-md)",
              border: "none",
              background: "transparent",
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
            title={collapsed ? "Buka Sidebar" : "Tutup Sidebar"}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* List Menu Navigation */}
        <nav style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 4, overflowY: "auto" }}>
          {MENU_ITEMS.map((item) => {
            const isActive = pathname === item.path || pathname?.startsWith(item.path);
            return (
              <a
                key={item.path}
                href={item.path}
                onClick={() => setMobileOpen(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  color: isActive ? "#fff" : "var(--text-secondary)",
                  background: isActive ? "var(--accent-primary)" : "transparent",
                  textDecoration: "none",
                  fontSize: 14,
                  fontWeight: isActive ? 500 : 400,
                  justifyContent: collapsed ? "center" : "flex-start",
                }}
              >
                <span style={{ fontSize: 16 }}>
                  {item.icon === "user" && "👤"}
                  {item.icon === "search" && "🔍"}
                  {item.icon === "bulb" && "💡"}
                  {item.icon === "file-text" && "📄"}
                  {item.icon === "film" && "🎞️"}
                  {item.icon === "chat" && "💬"}
                  {item.icon === "key" && "🔑"}
                </span>
                {!collapsed && <span>{item.label}</span>}
              </a>
            );
          })}
        </nav>

        {/* Footer Sidebar Utama */}
        {!collapsed && userEmail && (
          <div style={{ padding: 12, borderTop: "1px solid var(--glass-border)", fontSize: 12, color: "var(--text-tertiary)", flexShrink: 0 }}>
            {userEmail}
          </div>
        )}
      </aside>

      <style jsx>{`
        @media (max-width: 768px) {
          .mobile-hamburger-btn {
            display: flex !important;
          }

          .main-app-sidebar {
            transform: translateX(-100%);
            width: 260px !important;
          }

          .main-app-sidebar.mobile-open {
            transform: translateX(0);
          }

          .desktop-toggle-btn {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}
