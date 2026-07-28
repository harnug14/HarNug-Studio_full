"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Sidebar from "./Sidebar";
import { User } from "@supabase/supabase-js";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState(false);

  const isLoginPage = pathname === "/login";
  const isChatPage = pathname?.includes("chat");

  useEffect(() => {
    if (isLoginPage) {
      setLoading(false);
      setChecked(true);
      return;
    }

    async function checkAuth() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        router.push("/login");
        return;
      }

      setUser(currentUser);
      setLoading(false);
      setChecked(true);
    }

    checkAuth();
  }, [router, isLoginPage]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (loading || !checked) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-primary)",
        }}
      >
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar userEmail={user?.email || undefined} />
      <main
        style={{
          flex: 1,
          padding: isChatPage ? "0" : "32px 40px",
          maxWidth: "100%",
          overflow: "hidden",
          minHeight: "100vh",
          height: isChatPage ? "100vh" : "auto",
        }}
        className={`dashboard-main ${isChatPage ? "is-chat-page" : ""}`}
      >
        <div
          style={{
            maxWidth: isChatPage ? "100%" : 900,
            margin: isChatPage ? 0 : "0 auto",
            height: isChatPage ? "100%" : "auto",
            width: "100%",
          }}
        >
          {children}
        </div>
      </main>

      {/* Global Responsive Fix untuk Semua Halaman di HP */}
      <style jsx global>{`
        .dashboard-main {
          margin-left: var(--sidebar-width, 260px);
          transition: margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }

        @media (max-width: 768px) {
          .dashboard-main {
            margin-left: 0 !important;
            padding: 24px 16px !important;
            padding-top: 64px !important;
          }
          .dashboard-main.is-chat-page {
            padding: 0 !important;
            height: 100vh !important;
          }

          /* Container tombol berjajar otomatis membuat tombol ke-2 berpindah ke baris bawah secara utuh */
          .dashboard-main div[style*="display: flex"],
          .dashboard-main div[style*="display:flex"] {
            flex-wrap: wrap !important;
          }

          /* Mencegah huruf mengeja vertikal kebawah */
          .dashboard-main button {
            max-width: 100% !important;
            white-space: nowrap !important;
          }

          .dashboard-main select,
          .dashboard-main input {
            max-width: 100% !important;
          }
        }
      `}</style>
    </div>
  );
}
