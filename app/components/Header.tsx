"use client";

import { useState, useEffect, useRef } from "react";
import { useTheme } from "./ThemeProvider";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, usePathname } from "next/navigation";
import { User } from "@supabase/supabase-js";
import ApiKeysModal from "./ApiKeysModal";

export default function Header({ user }: { user: User | null }) {
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showApiKeysModal, setShowApiKeysModal] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const getPageTitle = (path: string) => {
    if (path === "/") return "Dashboard";
    if (path.startsWith("/referensi")) return "Reference";
    if (path.startsWith("/topik")) return "Topic";
    if (path.startsWith("/naskah")) return "Script";
    if (path.startsWith("/visual")) return "Visual";
    if (path.startsWith("/ai-chat")) return "Chat";
    return "";
  };

  useEffect(() => {
    async function loadGoogleAvatar() {
      let url =
        user?.user_metadata?.avatar_url ||
        user?.user_metadata?.picture ||
        (user?.identities && user.identities[0]?.identity_data?.avatar_url) ||
        (user?.identities && user.identities[0]?.identity_data?.picture);

      if (!url) {
        const { data: { session } } = await supabase.auth.getSession();
        const u = session?.user;
        if (u) {
          url =
            u.user_metadata?.avatar_url ||
            u.user_metadata?.picture ||
            (u.identities && u.identities[0]?.identity_data?.avatar_url) ||
            (u.identities && u.identities[0]?.identity_data?.picture);
        }
      }

      if (url) {
        setAvatarUrl(url);
      }
    }

    loadGoogleAvatar();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      if (u) {
        const url =
          u.user_metadata?.avatar_url ||
          u.user_metadata?.picture ||
          (u.identities && u.identities[0]?.identity_data?.avatar_url) ||
          (u.identities && u.identities[0]?.identity_data?.picture);
        if (url) setAvatarUrl(url);
      }
    });

    return () => subscription.unsubscribe();
  }, [user]);

  const googleName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "User";

  const userEmail = user?.email || "";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 0 8px 0",
          width: "100%",
          zIndex: 40,
        }}
      >
        {/* Sebelah Kiri: Judul Halaman Sejajar dengan Icon Hamburger */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            {getPageTitle(pathname)}
          </h1>
        </div>

        {/* Sebelah Kanan: Toggle Mode & Profile Avatar Google */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Light / Dark Mode Toggle Button */}
          <button
            onClick={toggleTheme}
            className="btn-ghost btn-icon"
            style={{
              width: 34,
              height: 34,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
              background: "var(--bg-secondary)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all var(--transition-fast)",
            }}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          {/* Google Profile Photo Dropdown */}
          <div style={{ position: "relative" }} ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                border: "1.5px solid var(--border-medium)",
                padding: 0,
                background: "var(--bg-tertiary)",
                cursor: "pointer",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all var(--transition-fast)",
              }}
              title={googleName}
            >
              {avatarUrl && !imgError ? (
                <img
                  src={avatarUrl}
                  alt={googleName}
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  onError={() => setImgError(true)}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    background: "var(--bg-elevated)",
                    color: "var(--text-primary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
              )}
            </button>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <div
                className="animate-fade-in"
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  width: 230,
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-medium)",
                  borderRadius: "var(--radius-lg)",
                  boxShadow: "var(--shadow-lg)",
                  padding: "10px",
                  zIndex: 100,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 10, marginBottom: 6, borderBottom: "1px solid var(--border-subtle)" }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "var(--bg-tertiary)" }}>
                    {avatarUrl && !imgError ? (
                      <img src={avatarUrl} alt={googleName} referrerPolicy="no-referrer" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", background: "var(--bg-elevated)", color: "var(--text-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {googleName}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {userEmail}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    setShowApiKeysModal(true);
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    background: "transparent",
                    color: "var(--text-primary)",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background var(--transition-fast)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-tertiary)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                  </svg>
                  API Keys
                </button>

                <button
                  onClick={handleLogout}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    background: "transparent",
                    color: "var(--status-error)",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                    textAlign: "left",
                    marginTop: 2,
                    transition: "background var(--transition-fast)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {showApiKeysModal && (
        <ApiKeysModal onClose={() => setShowApiKeysModal(false)} />
      )}
    </>
  );
}