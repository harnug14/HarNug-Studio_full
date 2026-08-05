"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { ThemeProvider } from "./ThemeProvider";
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
    <ThemeProvider>
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar userEmail={user?.email || undefined} />
        <main
          style={{
            flex: 1,
            padding: isChatPage ? "0" : "2px 20px 20px",
            maxWidth: "100%",
            overflow: "hidden",
            minHeight: "100vh",
            height: isChatPage ? "100vh" : "auto",
            display: "flex",
            flexDirection: "column",
          }}
          className={`dashboard-main ${isChatPage ? "is-chat-page" : ""}`}
        >
          {!isChatPage && <Header user={user} />}

          <div
            style={{
              maxWidth: "100%",
              width: "100%",
              margin: 0,
              height: isChatPage ? "100%" : "auto",
              display: "flex",
              flexDirection: "column",
              flex: 1,
            }}
          >
            <div style={{ flex: 1 }}>{children}</div>
          </div>
        </main>

        <style jsx global>{`
          .dashboard-main {
            margin-left: var(--sidebar-width, 240px);
            transition: margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          }

          @media (max-width: 768px) {
            html, body {
              overflow-x: hidden !important;
            }

            .dashboard-main {
              margin-left: 0 !important;
              padding: 2px 12px 20px !important;
              padding-top: 40px !important;
            }

            .dashboard-main.is-chat-page {
              position: fixed !important;
              inset: 0 !important;
              padding: 0 !important;
              height: 100dvh !important;
              width: 100vw !important;
              z-index: 10 !important;
            }

            .sidebar:not(.sidebar-open),
            .chat-sidebar:not(.open) {
              transform: translateX(-110%) !important;
              visibility: hidden !important;
              pointer-events: none !important;
            }
          }
        `}</style>
      </div>
    </ThemeProvider>
  );
}