"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Sidebar from "./Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState(false);

  const isLoginPage = pathname === "/login";

  useEffect(() => {
    if (isLoginPage) {
      setLoading(false);
      setChecked(true);
      return;
    }

    async function checkAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUserEmail(user.email || undefined);
      setLoading(false);
      setChecked(true);
    }
    checkAuth();
  }, [router, isLoginPage]);

  // Halaman login: render polos tanpa Sidebar, tanpa auth-check gate
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
      <Sidebar userEmail={userEmail} />
      <main
        style={{
          flex: 1,
          marginLeft: "var(--sidebar-width)",
          padding: "32px 40px",
          maxWidth: "100%",
          overflow: "hidden",
          minHeight: "100vh",
        }}
        className="dashboard-main"
      >
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          {children}
        </div>
      </main>
      <style jsx>{`
        @media (max-width: 768px) {
          .dashboard-main {
            margin-left: 0 !important;
            padding: 24px 16px !important;
            padding-top: 64px !important;
          }
        }
      `}</style>
    </div>
  );
}