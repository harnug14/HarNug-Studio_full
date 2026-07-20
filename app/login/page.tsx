"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-primary)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Animated gradient orbs */}
      <div
        style={{
          position: "absolute",
          top: "-20%",
          left: "-10%",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(168, 85, 247, 0.08) 0%, transparent 70%)",
          filter: "blur(60px)",
          animation: "gradient-shift 8s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-20%",
          right: "-10%",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(6, 182, 212, 0.08) 0%, transparent 70%)",
          filter: "blur(60px)",
          animation: "gradient-shift 8s ease-in-out infinite reverse",
          pointerEvents: "none",
        }}
      />

      <div
        className="animate-fade-in-up"
        style={{
          width: "100%",
          maxWidth: 420,
          padding: "0 24px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Logo / Branding */}
        <div
          style={{
            textAlign: "center",
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "var(--radius-lg)",
              background: "var(--accent-gradient)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              fontWeight: 800,
              color: "#fff",
              marginBottom: 16,
              boxShadow: "var(--shadow-glow-accent)",
            }}
          >
            H
          </div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: "var(--text-primary)",
              marginBottom: 6,
            }}
          >
            HarNug Studio
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-tertiary)" }}>
            AI Creator Studio — Login untuk mulai
          </p>
        </div>

        {/* Login Card */}
        <div
          className="glass-card-static gradient-border"
          style={{
            padding: 32,
          }}
        >
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 20 }}>
              <label className="form-label">Email</label>
              <input
                type="email"
                placeholder="nama@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                required
                autoFocus
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label className="form-label">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                required
              />
            </div>

            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--glass-bg)",
                  border: "1px solid var(--status-error)",
                  color: "var(--status-error)",
                  fontSize: 13,
                  marginBottom: 20,
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{
                width: "100%",
                padding: "12px 20px",
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  Masuk...
                </>
              ) : (
                "Masuk"
              )}
            </button>
          </form>
        </div>

        <p
          style={{
            textAlign: "center",
            marginTop: 24,
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          © 2026 HarNug Studio
        </p>
      </div>
    </div>
  );
}