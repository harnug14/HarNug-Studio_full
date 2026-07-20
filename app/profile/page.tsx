"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { supabase } from "@/lib/supabaseClient";

interface UserProfile {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [loadingReset, setLoadingReset] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setProfile({
          id: user.id,
          email: user.email || "",
          created_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at || null,
        });
      }
      setLoading(false);
    }
    loadProfile();
  }, []);

  async function handleResetPassword() {
    if (!profile?.email) return;
    setLoadingReset(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
        redirectTo: window.location.origin + "/login",
      });
      if (error) {
        setMessage(`error:${error.message}`);
      } else {
        setMessage("success:Email reset password telah dikirim ke kotak masuk Anda.");
      }
    } catch (e: any) {
      setMessage(`error:${e.message}`);
    }
    setLoadingReset(false);
  }

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <h1 className="page-title">Profile</h1>
          <p className="page-subtitle">
            Informasi akun dan pengaturan keamanan HarNug Studio Anda.
          </p>
        </div>

        {loading ? (
          <div className="glass-card-static" style={{ padding: 32, display: "flex", gap: 24, alignItems: "center" }}>
            <div className="skeleton" style={{ width: 80, height: 80, borderRadius: "50%" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
              <div className="skeleton" style={{ height: 24, width: 200 }} />
              <div className="skeleton" style={{ height: 16, width: 300 }} />
            </div>
          </div>
        ) : profile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Profile Header Card */}
            <div className="glass-card-static" style={{ padding: 32, display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{
                width: 80, height: 80, borderRadius: "50%", background: "var(--accent-gradient)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 32, fontWeight: 700, color: "#fff", boxShadow: "var(--shadow-glow-purple)",
                flexShrink: 0
              }}>
                {profile.email.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 style={{ fontSize: 24, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                  {profile.email}
                </h2>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span className="badge badge-success">Active Account</span>
                  <span style={{ fontSize: 13, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                    ID: {profile.id.split("-")[0]}...
                  </span>
                </div>
              </div>
            </div>

            {/* Details & Security */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
              
              {/* Account Info */}
              <div className="glass-card-static" style={{ padding: 24 }}>
                <div className="section-title">Informasi Akun</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
                  <div>
                    <div className="form-label">Email terdaftar</div>
                    <div style={{ color: "var(--text-primary)", fontSize: 14 }}>{profile.email}</div>
                  </div>
                  <div>
                    <div className="form-label">Tanggal bergabung</div>
                    <div style={{ color: "var(--text-primary)", fontSize: 14 }}>
                      {new Date(profile.created_at).toLocaleDateString("id-ID", {
                        day: "numeric", month: "long", year: "numeric",
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="form-label">Login terakhir</div>
                    <div style={{ color: "var(--text-primary)", fontSize: 14 }}>
                      {profile.last_sign_in_at 
                        ? new Date(profile.last_sign_in_at).toLocaleString("id-ID")
                        : "-"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Security */}
              <div className="glass-card-static" style={{ padding: 24 }}>
                <div className="section-title">Keamanan</div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.5 }}>
                  Jika Anda ingin mengganti password, Anda bisa mengirimkan link reset password ke email Anda.
                </p>
                <button 
                  onClick={handleResetPassword} 
                  disabled={loadingReset} 
                  className="btn btn-secondary"
                  style={{ width: "100%" }}
                >
                  {loadingReset ? (
                    <><span className="spinner"/> Mengirim email...</>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      Kirim Link Reset Password
                    </>
                  )}
                </button>
                {message && (
                  <div style={{
                    marginTop: 16,
                    padding: "10px 14px",
                    borderRadius: "var(--radius-md)",
                    fontSize: 13,
                    background: message.startsWith("error:") ? "rgba(239, 68, 68, 0.1)" : "rgba(34, 197, 94, 0.1)",
                    border: `1px solid ${message.startsWith("error:") ? "rgba(239, 68, 68, 0.2)" : "rgba(34, 197, 94, 0.2)"}`,
                    color: message.startsWith("error:") ? "#fca5a5" : "#86efac",
                  }}>
                    {message.replace(/^(error:|success:)/, "")}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            Gagal memuat profil.
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
