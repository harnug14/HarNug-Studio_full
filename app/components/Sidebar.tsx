"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useTheme } from "./ThemeProvider";

const NAV_ITEMS = [
  {
    label: "Profile",
    href: "/",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    label: "Reference",
    href: "/referensi",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
    ),
  },
  {
    label: "Topic",
    href: "/topik",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
  {
    label: "Script",
    href: "/naskah",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M16 13H8" />
        <path d="M16 17H8" />
        <path d="M10 9H8" />
      </svg>
    ),
  },
  {
    label: "Visual",
    href: "/visual",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
        <line x1="7" y1="2" x2="7" y2="22" />
        <line x1="17" y1="2" x2="17" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="2" y1="7" x2="7" y2="7" />
        <line x1="2" y1="17" x2="7" y2="17" />
        <line x1="17" y1="7" x2="22" y2="7" />
        <line x1="17" y1="17" x2="22" y2="17" />
      </svg>
    ),
  },
  {
    label: "Chat",
    href: "/ai-chat",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    label: "Api Key",
    href: "/settings/api-keys",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
      </svg>
    ),
  },
];

export default function Sidebar({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<{
    email: string;
    created_at: string;
    last_sign_in_at: string | null;
  } | null>(null);
  const [loadingReset, setLoadingReset] = useState(false);
  const [resetMessage, setResetMessage] = useState("");

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserProfile({
          email: user.email || "",
          created_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at || null,
        });
      }
    }
    loadProfile();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const handleResetPassword = async () => {
    if (!userProfile?.email) return;
    setLoadingReset(true);
    setResetMessage("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(userProfile.email, {
        redirectTo: window.location.origin + "/login",
      });
      if (error) {
        setResetMessage(`error:${error.message}`);
      } else {
        setResetMessage("success:Email reset password telah dikirim ke kotak masuk Anda.");
      }
    } catch (e: any) {
      setResetMessage(`error:${e.message}`);
    }
    setLoadingReset(false);
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="sidebar-mobile-toggle"
        aria-label="Toggle menu"
        style={{
          position: "fixed",
          top: 16,
          left: 16,
          zIndex: 60,
          display: "none",
          width: 40,
          height: 40,
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--glass-border)",
          background: "var(--bg-elevated)",
          backdropFilter: "blur(12px)",
          color: "var(--text-primary)",
          cursor: "pointer",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {mobileOpen ? (
            <path d="M18 6L6 18M6 6l12 12" />
          ) : (
            <>
              <path d="M3 12h18M3 6h18M3 18h18" />
            </>
          )}
        </svg>
      </button>

      {/* Overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 39,
          }}
        />
      )}

      {/* Account Modal Overlay */}
      {accountOpen && (
        <div
          onClick={() => { setAccountOpen(false); setResetMessage(""); }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 420,
              margin: "0 16px",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--glass-border)",
              background: "var(--bg-elevated)",
              backdropFilter: "blur(24px)",
              padding: 0,
              overflow: "hidden",
              animation: "fadeIn 0.2s ease",
            }}
          >
            {/* Modal Header */}
            <div style={{
              padding: "24px 24px 20px",
              borderBottom: "1px solid var(--glass-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                Account Settings
              </h3>
              <button
                onClick={() => { setAccountOpen(false); setResetMessage(""); }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-tertiary)",
                  cursor: "pointer",
                  padding: 4,
                  display: "flex",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 24 }}>
              {/* User Info */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: "50%", background: "var(--accent-gradient)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, fontWeight: 700, color: "#fff", flexShrink: 0,
                }}>
                  {userProfile?.email?.charAt(0).toUpperCase() || "?"}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 2 }}>
                    {userProfile?.email || userEmail || "—"}
                  </div>
                  <span className="badge badge-success" style={{ fontSize: 10 }}>Active Account</span>
                </div>
              </div>

              {/* Details */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                padding: 16,
                borderRadius: "var(--radius-md)",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid var(--glass-border)",
                marginBottom: 20,
              }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Joined</div>
                  <div style={{ fontSize: 13, color: "var(--text-primary)" }}>
                    {userProfile ? new Date(userProfile.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Last Login</div>
                  <div style={{ fontSize: 13, color: "var(--text-primary)" }}>
                    {userProfile?.last_sign_in_at ? new Date(userProfile.last_sign_in_at).toLocaleString("id-ID") : "—"}
                  </div>
                </div>
              </div>

              {/* Password Reset */}
              <button
                onClick={handleResetPassword}
                disabled={loadingReset}
                className="btn btn-secondary"
                style={{ width: "100%", marginBottom: resetMessage ? 12 : 16 }}
              >
                {loadingReset ? (
                  <><span className="spinner"/> Sending...</>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    Reset Password
                  </>
                )}
              </button>
              {resetMessage && (
                <div style={{
                  padding: "10px 14px",
                  borderRadius: "var(--radius-md)",
                  fontSize: 13,
                  marginBottom: 16,
                  background: resetMessage.startsWith("error:") ? "rgba(239, 68, 68, 0.1)" : "rgba(34, 197, 94, 0.1)",
                  border: `1px solid ${resetMessage.startsWith("error:") ? "rgba(239, 68, 68, 0.2)" : "rgba(34, 197, 94, 0.2)"}`,
                  color: resetMessage.startsWith("error:") ? "#fca5a5" : "#86efac",
                }}>
                  {resetMessage.replace(/^(error:|success:)/, "")}
                </div>
              )}

              {/* Logout */}
              <button
                onClick={handleLogout}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  background: "rgba(239, 68, 68, 0.06)",
                  color: "#f87171",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  transition: "all var(--transition-fast)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(239, 68, 68, 0.15)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(239, 68, 68, 0.06)";
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: "var(--sidebar-width)",
          background: "var(--bg-primary)",
          borderRight: "1px solid var(--glass-border)",
          backdropFilter: "blur(16px)",
          display: "flex",
          flexDirection: "column",
          zIndex: 40,
          transform: mobileOpen ? "translateX(0)" : undefined,
          transition: "transform var(--transition-base)",
        }}
        className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}
      >
        {/* Logo */}
        <div
          style={{
            padding: "24px 20px 20px",
            borderBottom: "1px solid var(--glass-border)",
          }}
        >
          <Link href="/" style={{ textDecoration: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "var(--radius-md)",
                  background: "var(--accent-primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#fff",
                  flexShrink: 0,
                }}
              >
                H
              </div>
              <div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  HarNug Studio
                </div>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                  AI Creator Studio
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Nav items */}
        <nav
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px 10px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {NAV_ITEMS.map((navItem) => {
              const active = isActive(navItem.href);

              return (
                <Link
                  key={navItem.href}
                  href={navItem.href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 12px",
                    borderRadius: "var(--radius-md)",
                    textDecoration: "none",
                    fontSize: 14,
                    fontWeight: active ? 500 : 400,
                    color: active ? "var(--text-primary)" : "var(--text-secondary)",
                    background: active
                      ? "var(--accent-muted)"
                      : "transparent",
                    borderLeft: active
                      ? "2px solid var(--accent-primary)"
                      : "2px solid transparent",
                    transition: "all var(--transition-fast)",
                    position: "relative",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
                      e.currentTarget.style.color = "var(--text-primary)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "var(--text-secondary)";
                    }
                  }}
                >
                  <span style={{ opacity: active ? 1 : 0.6, display: "flex", flexShrink: 0 }}>
                    {navItem.icon}
                  </span>
                  <span>{navItem.label}</span>
                  {active && (
                    <div
                      style={{
                        position: "absolute",
                        left: -1,
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: 2,
                        height: 20,
                        background: "var(--accent-primary)",
                        borderRadius: 1,
                      }}
                    />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User section — clickable avatar */}
        <div
          style={{
            padding: "16px 16px 20px",
            borderTop: "1px solid var(--glass-border)",
            display: "flex",
            gap: 8,
          }}
        >
          <button
            onClick={() => setAccountOpen(true)}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--glass-border)",
              background: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
              transition: "all var(--transition-fast)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--glass-bg-hover)";
              e.currentTarget.style.borderColor = "var(--accent-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "var(--glass-border)";
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "var(--radius-full)",
                background: "var(--accent-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 600,
                color: "#fff",
                flexShrink: 0,
              }}
            >
              {(userEmail || "?").charAt(0).toUpperCase()}
            </div>
            <div
              style={{
                fontSize: 12,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
                textAlign: "left",
              }}
            >
              {userEmail || "Account"}
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.4, flexShrink: 0 }}>
              <path d="M12 15l-3-3h6l-3 3z" fill="currentColor" stroke="none" />
              <path d="M12 9l3 3H9l3-3z" fill="currentColor" stroke="none" />
            </svg>
          </button>
          
          <button
            onClick={toggleTheme}
            style={{
              width: 46,
              height: 46,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--glass-border)",
              background: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all var(--transition-fast)",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--glass-bg-hover)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>
      </aside>

      <style jsx>{`
        @media (max-width: 768px) {
          .sidebar-mobile-toggle {
            display: flex !important;
          }
          .sidebar {
            transform: translateX(-100%);
          }
          .sidebar-open {
            transform: translateX(0) !important;
          }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}
