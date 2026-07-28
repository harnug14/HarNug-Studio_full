"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

interface ChatMessageItem {
  id?: string;
  role: "user" | "assistant";
  content: string;
}

interface SessionItem {
  id: string;
  judul: string;
  model: string;
  mode: string;
  created_at: string;
}

type SaveTarget = "topik" | "naskah" | "visual" | null;

interface TopikCard {
  judul: string;
  deskripsi: string;
}

const MODEL_OPTIONS = [
  { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash (Rekomendasi)" },
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
  { value: "groq-llama-3.3-70b-versatile", label: "Groq Llama 3.3 70B" },
  { value: "groq-mixtral-8x7b-32768", label: "Groq Mixtral 8x7B" },
];

const CHAT_SIDEBAR_STORAGE_KEY = "ai_chat_sidebar_open";

function SaveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function parseTopikCards(content: string): { cards: TopikCard[]; sisaTeks: string } {
  const lines = content.split("\n");
  const cards: TopikCard[] = [];
  const sisaBaris: string[] = [];
  const pattern = /^\[TOPIK\]\s*(.+?)\s*\|\s*(.+)$/;

  for (const line of lines) {
    const match = line.trim().match(pattern);
    if (match) {
      cards.push({ judul: match[1].trim(), deskripsi: match[2].trim() });
    } else if (line.trim().length > 0) {
      sisaBaris.push(line);
    }
  }

  return { cards, sisaTeks: sisaBaris.join("\n") };
}

function parseDraftMarker(content: string): { isDraft: boolean; cleanContent: string } {
  const trimmed = content.trim();
  if (trimmed.startsWith("[DRAFT_NASKAH]") || trimmed.startsWith("[DRAFT_VISUAL]")) {
    const cleanContent = trimmed
      .replace(/^\[DRAFT_NASKAH\]\s*/, "")
      .replace(/^\[DRAFT_VISUAL\]\s*/, "")
      .trim();
    return { isDraft: true, cleanContent };
  }
  return { isDraft: false, cleanContent: content };
}

function AiChatContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromReferensi = searchParams.get("fromReferensi");
  const fromTopik = searchParams.get("fromTopik");
  const fromNaskah = searchParams.get("fromNaskah");

  const [authLoading, setAuthLoading] = useState(true);

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState(MODEL_OPTIONS[0].value);

  // Toggle Mode Independen (bisa 0, 1, atau keduanya aktif)
  const [isThinking, setIsThinking] = useState(false);
  const [isWebSearch, setIsWebSearch] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [contextLabel, setContextLabel] = useState<string | null>(null);
  const [contextText, setContextText] = useState<string | null>(null);
  const [contextSent, setContextSent] = useState(false);

  const [saveTarget, setSaveTarget] = useState<SaveTarget>(null);

  const [savingMessageIndex, setSavingMessageIndex] = useState<number | null>(null);
  const [saveJudul, setSaveJudul] = useState("");
  const [saveCatatan, setSaveCatatan] = useState("");
  const [saveSubmitting, setSaveSubmitting] = useState(false);

  const [savingCardKey, setSavingCardKey] = useState<string | null>(null);

  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [dropdownOpenId, setDropdownOpenId] = useState<string | null>(null);
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarReady, setSidebarReady] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpenId(null);
      }
    }
    if (dropdownOpenId) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownOpenId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(CHAT_SIDEBAR_STORAGE_KEY);
      if (saved !== null) {
        setSidebarOpen(saved === "true");
      } else {
        setSidebarOpen(window.innerWidth > 768);
      }
    } catch {
      // silent
    }
    setSidebarReady(true);
  }, []);

  useEffect(() => {
    if (!sidebarReady) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(CHAT_SIDEBAR_STORAGE_KEY, String(sidebarOpen));
    } catch {
      // silent
    }
  }, [sidebarOpen, sidebarReady]);

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setAuthLoading(false);
    }
    checkAuth();
  }, [router]);

  useEffect(() => {
    if (authLoading) return;
    fetchSessions();

    if (fromReferensi) {
      loadContextFromReferensi(fromReferensi);
    } else if (fromTopik) {
      loadContextFromTopik(fromTopik);
    } else if (fromNaskah) {
      loadContextFromNaskah(fromNaskah);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (renamingSessionId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingSessionId]);

  const adjustTextareaHeight = () => {
    const el = inputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 150) + "px";
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [input]);

  async function fetchSessions() {
    setLoadingSessions(true);
    try {
      const res = await fetch("/api/chat");
      const data = await res.json();
      if (res.ok) setSessions(data.data || []);
    } catch {
      // silent
    }
    setLoadingSessions(false);
  }

  async function loadContextFromReferensi(referensiId: string) {
    try {
      const res = await fetch("/api/channel-analysis");
      const data = await res.json();
      const ref = (data.data || []).find((r: any) => r.id === referensiId);
      if (ref) {
        const entries = ref.channel_analysis_entries || [];
        const entrySummary = entries.slice(0, 5).map((e: any, idx: number) => `${idx + 1}. ${e.title}`).join("\n");
        setContextLabel(`Referensi: ${ref.profile_name}`);
        setSaveTarget("topik");
        setContextText(
          `Berikut data profil channel referensi "${ref.profile_name}" (${ref.channel_link || "tanpa link"}):\n\nContoh Naskah/Video Referensi:\n${entrySummary || "(Belum ada entri naskah tersimpan)"}\n\nBerdasarkan contoh naskah di atas, tolong analisis pola niche, gaya visual, dan ritmenya, lalu buatkan 5 ide topik video YouTube Shorts yang SANGAT RELEVAN dan BENAR-BENAR DITURUNKAN dari channel referensi tersebut.\n\nUntuk tiap ide, berikan judul singkat yang sangat memikat (klik-bait positif) dan 1-2 kalimat penjelasan konkret tentang visual atau isi videonya.`
        );
      }
    } catch {
      // silent
    }
  }

  async function loadContextFromTopik(topikId: string) {
    try {
      const res = await fetch("/api/topik");
      const data = await res.json();
      const topik = (data.data || []).find((t: any) => t.id === topikId);
      if (topik) {
        setContextLabel(`Topic: ${topik.judul}`);
        setSaveTarget("naskah");
        setContextText(
          `Judul topik: ${topik.judul}${topik.catatan ? `\nCatatan: ${topik.catatan}` : ""}\n\nTolong buatkan naskah video YouTube Shorts berdasarkan topik ini.`
        );
      }
    } catch {
      // silent
    }
  }

  async function loadContextFromNaskah(naskahId: string) {
    try {
      const res = await fetch("/api/naskah");
      const data = await res.json();
      const naskah = (data.data || []).find((n: any) => n.id === naskahId);
      if (naskah) {
        setContextLabel(`Script: ${naskah.judul}`);
        setSaveTarget("visual");
        setContextText(
          `Judul naskah: ${naskah.judul}\nIsi naskah:\n${naskah.isi_naskah || ""}\n\nTolong buatkan panduan visual/storyboard berdasarkan naskah ini.`
        );
      }
    } catch {
      // silent
    }
  }

  async function openSession(sessionId: string) {
    setActiveSessionId(sessionId);
    setLoading(true);
    if (typeof window !== "undefined" && window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
    try {
      const res = await fetch(`/api/chat/${sessionId}`);
      const data = await res.json();
      if (res.ok) {
        setMessages(data.messages || []);
        setModel(data.session.model);
        
        // Load state toggle mode dari session
        const sessMode = data.session.mode || "biasa";
        setIsThinking(sessMode.includes("berpikir"));
        setIsWebSearch(sessMode.includes("search"));

        setSaveTarget(data.session.content_target || null);
      }
    } catch {
      // silent
    }
    setLoading(false);
  }

  function startNewChat() {
    setActiveSessionId(null);
    setMessages([]);
    setContextLabel(null);
    setContextText(null);
    setContextSent(false);
    setSaveTarget(null);
    setSavingMessageIndex(null);
    setSavingCardKey(null);
    setInput("");
    setIsThinking(false);
    setIsWebSearch(false);
    if (typeof window !== "undefined" && window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  }

  async function handleSend() {
    if (loading) return;

    const pesanDikirim = input.trim() || (!contextSent && contextText ? contextText : "");
    if (!pesanDikirim) return;

    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setLoading(true);
    if (contextText) setContextSent(true);

    setMessages((prev) => [...prev, { role: "user", content: pesanDikirim }]);

    // Penentuan string mode yang dikirim ke API
    let modeDipakai = "biasa";
    if (isThinking && isWebSearch) {
      modeDipakai = "berpikir+search";
    } else if (isThinking) {
      modeDipakai = "berpikir";
    } else if (isWebSearch) {
      modeDipakai = "search";
    }

    try {
      if (!activeSessionId) {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pesan: pesanDikirim,
            model,
            mode: modeDipakai,
            sumber_topik_id: fromTopik || null,
            sumber_naskah_id: fromNaskah || null,
            contextText: undefined,
            contentTarget: saveTarget,
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${data.error || "Gagal mendapat jawaban"}` }]);
        } else {
          setActiveSessionId(data.sessionId);
          setMessages((prev) => [...prev, { role: "assistant", content: data.jawaban }]);
          await fetchSessions();
        }
      } else {
        const res = await fetch(`/api/chat/${activeSessionId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pesan: pesanDikirim }),
        });
        const data = await res.json();

        if (!res.ok) {
          setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${data.error || "Gagal mendapat jawaban"}` }]);
        } else {
          setMessages((prev) => [...prev, { role: "assistant", content: data.jawaban }]);
        }
      }
    } catch (err: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err.message || "Terjadi kesalahan"}` }]);
    }

    setLoading(false);
  }

  async function handleDeleteSession(sessionId: string) {
    if (!confirm("Hapus sesi chat ini?")) return;
    try {
      const res = await fetch(`/api/chat/${sessionId}`, { method: "DELETE" });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (activeSessionId === sessionId) startNewChat();
      }
    } catch {
      // silent
    }
  }

  function startRename(session: SessionItem) {
    setRenamingSessionId(session.id);
    setRenameValue(session.judul);
  }

  function cancelRename() {
    setRenamingSessionId(null);
    setRenameValue("");
  }

  async function confirmRename(sessionId: string) {
    const judulBaru = renameValue.trim();
    if (!judulBaru) {
      cancelRename();
      return;
    }
    try {
      const res = await fetch(`/api/chat/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ judul: judulBaru }),
      });
      if (res.ok) {
        setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, judul: judulBaru } : s)));
      }
    } catch {
      // silent
    }
    cancelRename();
  }

  async function handleSaveCard(msgIndex: number, cardIndex: number, card: TopikCard) {
    const key = `${msgIndex}-${cardIndex}`;
    setSavingCardKey(key);
    try {
      const res = await fetch("/api/topik", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ judul: card.judul, catatan: card.deskripsi }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert("Gagal menyimpan: " + (data.error || "Terjadi kesalahan"));
      }
    } catch (err: any) {
      alert("Gagal menyimpan: " + (err.message || "Terjadi kesalahan"));
    }
    setSavingCardKey(null);
  }

  function openSaveForm(index: number, content: string) {
    setSavingMessageIndex(index);
    const firstLine = content.split("\n")[0].replace(/^#+\s*/, "").trim();
    setSaveJudul(firstLine.slice(0, 100) || "Tanpa judul");
    setSaveCatatan(content);
  }

  function cancelSaveForm() {
    setSavingMessageIndex(null);
    setSaveJudul("");
    setSaveCatatan("");
  }

  async function handleConfirmSave() {
    if (!saveTarget || !saveJudul.trim()) return;
    setSaveSubmitting(true);

    try {
      let endpoint = "";
      let body: Record<string, any> = {};

      if (saveTarget === "topik") {
        endpoint = "/api/topik";
        body = { judul: saveJudul, catatan: saveCatatan };
      } else if (saveTarget === "naskah") {
        endpoint = "/api/naskah";
        body = {
          judul: saveJudul,
          isiNaskah: saveCatatan,
          sumberTopikId: fromTopik || null,
        };
      } else if (saveTarget === "visual") {
        endpoint = "/api/visual";
        body = {
          judul: saveJudul,
          isi_visual: saveCatatan,
          sumber_naskah_id: fromNaskah || null,
        };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        alert("Gagal menyimpan: " + (data.error || "Terjadi kesalahan"));
      } else {
        cancelSaveForm();
      }
    } catch (err: any) {
      alert("Gagal menyimpan: " + (err.message || "Terjadi kesalahan"));
    }

    setSaveSubmitting(false);
  }

  if (authLoading) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    );
  }

  return (
    <div style={{ height: "100dvh", width: "100%", background: "var(--bg-primary)", overflow: "hidden", position: "relative" }}>
      
      {/* Overlay Backdrop khusus Mobile saat Drawer Riwayat Chat Terbuka */}
      {sidebarOpen && (
        <div
          className="chat-mobile-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div
        className="chat-container"
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          background: "var(--bg-primary)",
          minWidth: 0,
          overflow: "hidden",
          position: "relative"
        }}
      >
        {/* Sub-Sidebar Riwayat Chat */}
        <div
          className={`chat-sidebar ${sidebarOpen ? "open" : ""}`}
          style={{
            width: sidebarOpen ? 260 : 0,
            minWidth: sidebarOpen ? 260 : 0,
            maxWidth: sidebarOpen ? 260 : 0,
            display: "flex",
            background: "var(--bg-primary)",
            flexDirection: "column",
            transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            flexShrink: 0,
            zIndex: 30,
            overflow: "hidden",
            height: "100%",
            borderRight: sidebarOpen ? "1px solid var(--glass-border)" : "none",
          }}
        >
          {/* Header Sub-Sidebar yang Presisi Simetris dengan Main Topbar (57px) */}
          <div style={{ height: 57, padding: "0 10px", display: "flex", alignItems: "center", borderBottom: "1px solid var(--glass-border)", flexShrink: 0 }}>
            <button
              onClick={startNewChat}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
                gap: 10,
                padding: "8px 12px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--glass-border)",
                background: "transparent",
                color: "var(--text-primary)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all var(--transition-fast)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Chat Baru
            </button>
          </div>

          <div style={{ padding: "12px 12px 6px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0, whiteSpace: "nowrap" }}>
            Riwayat Chat
          </div>

          <div style={{ flex: "1 1 auto", overflowY: "auto", overflowX: "hidden", padding: "0 10px 16px", display: "flex", flexDirection: "column", gap: 2, minHeight: 0 }}>
            {loadingSessions && <div className="skeleton" style={{ height: 36, marginBottom: 6, borderRadius: "var(--radius-md)" }} />}

            {!loadingSessions && sessions.length === 0 && (
              <div style={{ padding: "12px 10px", fontSize: 13, color: "var(--text-tertiary)", textAlign: "center" }}>
                Belum ada riwayat chat.
              </div>
            )}

            {sessions.map((s) => {
              const isRenaming = renamingSessionId === s.id;
              const isActive = activeSessionId === s.id;
              const showActions = dropdownOpenId === s.id || hoveredSessionId === s.id;

              return (
                <div
                  key={s.id}
                  onClick={() => !isRenaming && openSession(s.id)}
                  style={{
                    padding: "9px 12px",
                    borderRadius: "var(--radius-md)",
                    cursor: isRenaming ? "default" : "pointer",
                    background: isActive ? "var(--accent-muted)" : "transparent",
                    borderLeft: isActive ? "2px solid var(--accent-primary)" : "2px solid transparent",
                    color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                    fontWeight: isActive ? 500 : 400,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    transition: "all var(--transition-fast)",
                    position: "relative",
                  }}
                  onMouseEnter={(e) => {
                    setHoveredSessionId(s.id);
                    if (!isActive) e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
                  }}
                  onMouseLeave={(e) => {
                    setHoveredSessionId(null);
                    if (!isActive) e.currentTarget.style.background = "transparent";
                  }}
                >
                  {isRenaming ? (
                    <input
                      ref={renameInputRef}
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          confirmRename(s.id);
                        } else if (e.key === "Escape") {
                          cancelRename();
                        }
                      }}
                      onBlur={() => confirmRename(s.id)}
                      className="input-field"
                      style={{ padding: "4px 8px", fontSize: 13, width: "100%" }}
                    />
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ flexShrink: 0, opacity: isActive ? 1 : 0.7 }}>
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0, fontSize: 13 }}>
                        {s.judul}
                      </span>
                      <div
                        className="session-actions"
                        style={{
                          display: "flex",
                          flexShrink: 0,
                          opacity: showActions ? 1 : 0,
                          pointerEvents: showActions ? "auto" : "none",
                        }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDropdownOpenId(dropdownOpenId === s.id ? null : s.id);
                          }}
                          className="btn-ghost btn-icon"
                          style={{ width: 24, height: 24, padding: 0, color: "var(--text-secondary)" }}
                          title="Opsi"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
                        </button>

                        {dropdownOpenId === s.id && (
                          <div
                            ref={dropdownRef}
                            style={{
                              position: "absolute",
                              right: 10,
                              top: "100%",
                              marginTop: 4,
                              background: "var(--bg-secondary)",
                              border: "1px solid var(--glass-border)",
                              borderRadius: "var(--radius-md)",
                              padding: 4,
                              zIndex: 40,
                              minWidth: 120,
                              boxShadow: "var(--shadow-md)"
                            }}
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDropdownOpenId(null);
                                startRename(s);
                              }}
                              style={{
                                width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
                                background: "transparent", border: "none", color: "var(--text-primary)", fontSize: 13,
                                textAlign: "left", cursor: "pointer", borderRadius: "var(--radius-sm)"
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                            >
                              <EditIcon /> Rename
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDropdownOpenId(null);
                                handleDeleteSession(s.id);
                              }}
                              style={{
                                width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
                                background: "transparent", border: "none", color: "var(--status-error)", fontSize: 13,
                                textAlign: "left", cursor: "pointer", borderRadius: "var(--radius-sm)"
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)"}
                              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Main Chat Content Area */}
        <div style={{ flex: "1 1 0%", display: "flex", flexDirection: "column", position: "relative", minWidth: 0, height: "100%", overflow: "hidden", background: "var(--bg-primary)" }}>
          {/* Header Bar — Tinggi 57px Presisi Simetris */}
          <div
            className="chat-header-bar"
            style={{
              height: 57,
              padding: "0 20px",
              borderBottom: "1px solid var(--glass-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              zIndex: 5,
              flexShrink: 0,
              gap: 12,
              boxSizing: "border-box"
            }}
          >
            {/* Tombol Ikon Panel [◧] khusus Riwayat Chat */}
            <div className="mobile-header-left-space" style={{ display: "flex", alignItems: "center" }}>
              <button
                className="btn-ghost btn-icon toggle-sidebar-btn"
                onClick={() => setSidebarOpen((prev) => !prev)}
                style={{
                  width: 36,
                  height: 36,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--glass-border)",
                  background: "transparent",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
                title={sidebarOpen ? "Sembunyikan Riwayat Chat" : "Tampilkan Riwayat Chat"}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="9" y1="3" x2="9" y2="21"></line>
                </svg>
              </button>
            </div>

            {/* Model Selector Tepat di Tengah Header */}
            <div style={{ flex: 1, display: "flex", justifyContent: "center", minWidth: 0 }}>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="select-field chat-select-field"
                style={{
                  maxWidth: 280,
                  width: "100%",
                  padding: "6px 28px 6px 12px",
                  fontSize: 13,
                  textAlign: "center",
                  borderRadius: "var(--radius-lg)",
                }}
              >
                {MODEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Penyeimbang Kanan */}
            <div style={{ width: 36, flexShrink: 0 }} />
          </div>

          {contextLabel && (
            <div style={{
              background: "linear-gradient(90deg, rgba(168, 85, 247, 0.08), rgba(6, 182, 212, 0.08))",
              borderBottom: "1px solid var(--glass-border)",
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 13,
              flexShrink: 0,
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%", background: "var(--accent-gradient)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: "var(--text-secondary)" }}>Konteks termuat dari </span>
                <strong style={{ color: "var(--text-primary)" }}>{contextLabel}</strong>
                {saveTarget === "naskah" && <span style={{ marginLeft: 8, color: "var(--accent-cyan)", fontSize: 12 }}>— Web search aktif</span>}
              </div>
            </div>
          )}

          {/* Area Pesan Chat */}
          <div className="chat-messages-area" style={{ flex: "1 1 auto", overflowY: "auto", overflowX: "hidden", padding: "24px", display: "flex", flexDirection: "column", gap: 20, minHeight: 0 }}>
            {messages.length === 0 && (
              <div style={{ margin: "auto", textAlign: "center", maxWidth: 400, padding: "0 16px" }}>
                <div style={{
                  width: 56, height: 56, borderRadius: "var(--radius-2xl)", background: "var(--glass-bg)", border: "1px solid var(--glass-border)",
                  display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: "var(--accent-purple)"
                }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: "var(--text-primary)" }}>Mulai Chat Baru</h2>
                <p style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.5 }}>
                  {!contextLabel
                    ? "Tanyakan apapun, generate script, ide topic, atau riset konten YouTube Shorts Anda di sini."
                    : `Tekan Kirim untuk meminta AI memproses konteks dari ${contextLabel}.`
                  }
                </p>
              </div>
            )}

            {messages.map((m, i) => {
              const { cards, sisaTeks } = m.role === "assistant" ? parseTopikCards(m.content) : { cards: [], sisaTeks: m.content };
              const { isDraft, cleanContent } = m.role === "assistant" ? parseDraftMarker(m.content) : { isDraft: false, cleanContent: m.content };
              const isSavableDraft = m.role === "assistant" && saveTarget && (saveTarget === "naskah" || saveTarget === "visual") && isDraft;

              return (
                <div key={i} className="animate-fade-in-up" style={{
                  display: "flex",
                  flexDirection: m.role === "user" ? "row-reverse" : "row",
                  gap: 12,
                  alignItems: "flex-start",
                  width: "100%",
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "var(--radius-full)", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: m.role === "user" ? "var(--glass-bg-hover)" : "var(--accent-primary)",
                    color: m.role === "user" ? "var(--text-primary)" : "#fff", border: `1px solid ${m.role === "user" ? "var(--glass-border)" : "transparent"}`,
                  }}>
                    {m.role === "user" ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                    )}
                  </div>

                  <div className="chat-bubble-wrapper" style={{ maxWidth: "82%", minWidth: 0 }}>
                    <div style={{
                      padding: "12px 16px",
                      borderRadius: "var(--radius-lg)",
                      borderTopLeftRadius: m.role === "assistant" ? 4 : "var(--radius-lg)",
                      borderTopRightRadius: m.role === "user" ? 4 : "var(--radius-lg)",
                      background: m.role === "user" ? "var(--bg-elevated)" : "var(--glass-bg)",
                      border: `1px solid ${m.role === "user" ? "var(--glass-border-hover)" : "var(--glass-border)"}`,
                      fontSize: 14,
                      lineHeight: 1.6,
                      color: "var(--text-primary)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      overflowWrap: "break-word",
                      boxShadow: m.role === "assistant" ? "var(--shadow-sm)" : "none",
                    }}>
                      {m.role === "assistant" && cards.length > 0 ? (
                        <>
                          {sisaTeks && <div style={{ marginBottom: 16 }}>{sisaTeks}</div>}
                          <div style={{ display: "grid", gap: 12 }}>
                            {cards.map((card, ci) => {
                              const cardKey = `${i}-${ci}`;
                              const isSavingCard = savingCardKey === cardKey;
                              return (
                                <div key={ci} style={{
                                  padding: 12,
                                  borderRadius: "var(--radius-md)",
                                  background: "var(--bg-secondary)",
                                  border: "1px solid var(--glass-border)",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 8,
                                }}>
                                  <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 13 }}>
                                    {card.judul}
                                  </div>
                                  <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                                    {card.deskripsi}
                                  </div>
                                  <button
                                    onClick={() => handleSaveCard(i, ci, card)}
                                    disabled={isSavingCard}
                                    className="btn btn-secondary btn-sm"
                                    style={{ alignSelf: "flex-start", marginTop: 4, gap: 6, fontSize: 12 }}
                                  >
                                    <SaveIcon />
                                    {isSavingCard ? "Menyimpan..." : "Simpan Topik"}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <div>{cleanContent}</div>
                      )}

                      {isSavableDraft && (
                        <div style={{ marginTop: 12 }}>
                          <button
                            onClick={() => openSaveForm(i, cleanContent)}
                            className="btn btn-primary btn-sm"
                            style={{ gap: 6, fontSize: 12 }}
                          >
                            <SaveIcon />
                            Simpan ke {saveTarget === "naskah" ? "Naskah" : "Visual"}
                          </button>
                        </div>
                      )}

                      {savingMessageIndex === i && (
                        <div style={{
                          marginTop: 12,
                          padding: 14,
                          borderRadius: "var(--radius-md)",
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--accent-primary)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                            Simpan ke {saveTarget === "topik" ? "Topik" : saveTarget === "naskah" ? "Naskah" : "Visual"}
                          </div>
                          <div>
                            <label style={{ display: "block", fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>Judul</label>
                            <input
                              type="text"
                              value={saveJudul}
                              onChange={(e) => setSaveJudul(e.target.value)}
                              className="input-field"
                              style={{ width: "100%", padding: "6px 10px", fontSize: 13 }}
                            />
                          </div>
                          <div>
                            <label style={{ display: "block", fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>Isi / Catatan</label>
                            <textarea
                              value={saveCatatan}
                              onChange={(e) => setSaveCatatan(e.target.value)}
                              className="input-field"
                              rows={3}
                              style={{ width: "100%", padding: "6px 10px", fontSize: 13, resize: "vertical" }}
                            />
                          </div>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                            <button
                              onClick={cancelSaveForm}
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: 12 }}
                            >
                              Batal
                            </button>
                            <button
                              onClick={handleConfirmSave}
                              disabled={saveSubmitting}
                              className="btn btn-primary btn-sm"
                              style={{ fontSize: 12 }}
                            >
                              {saveSubmitting ? "Menyimpan..." : "Konfirmasi Simpan"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {loading && (
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "var(--radius-full)", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "var(--accent-primary)", color: "#fff"
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                </div>
                <div style={{
                  padding: "10px 14px", borderRadius: "var(--radius-lg)", borderTopLeftRadius: 4,
                  background: "var(--glass-bg)", border: "1px solid var(--glass-border)", display: "flex", alignItems: "center", gap: 8
                }}>
                  <div className="spinner" style={{ width: 14, height: 14 }} />
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Sedang mengetik...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Chat Container */}
          <div
            className="chat-input-container"
            style={{
              padding: "12px 16px",
              borderTop: "1px solid var(--glass-border)",
              flexShrink: 0,
              maxWidth: 900,
              width: "100%",
              margin: "0 auto",
            }}
          >
            {/* Toggle Mode: Thinking & Web Search (Bisa 0, 1, atau keduanya aktif) */}
            <div
              className="chat-mode-pills"
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 8,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={() => setIsThinking((prev) => !prev)}
                style={{
                  padding: "5px 14px",
                  borderRadius: "16px",
                  fontSize: 12,
                  fontWeight: isThinking ? 600 : 400,
                  background: isThinking ? "rgba(168, 85, 247, 0.25)" : "rgba(255, 255, 255, 0.04)",
                  color: isThinking ? "var(--accent-purple, #a855f7)" : "var(--text-secondary)",
                  border: `1px solid ${isThinking ? "rgba(168, 85, 247, 0.6)" : "var(--glass-border)"}`,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                Thinking {isThinking ? "✓" : ""}
              </button>

              <button
                type="button"
                onClick={() => setIsWebSearch((prev) => !prev)}
                style={{
                  padding: "5px 14px",
                  borderRadius: "16px",
                  fontSize: 12,
                  fontWeight: isWebSearch ? 600 : 400,
                  background: isWebSearch ? "rgba(6, 182, 212, 0.25)" : "rgba(255, 255, 255, 0.04)",
                  color: isWebSearch ? "var(--accent-cyan, #06b6d4)" : "var(--text-secondary)",
                  border: `1px solid ${isWebSearch ? "rgba(6, 182, 212, 0.6)" : "var(--glass-border)"}`,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                Web Search {isWebSearch ? "✓" : ""}
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "flex-end",
                background: "var(--bg-secondary)",
                border: "1px solid var(--glass-border)",
                borderRadius: "var(--radius-xl)",
                padding: "6px 8px 6px 12px",
                width: "100%",
              }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={contextText && !contextSent ? "Klik Kirim untuk memproses konteks..." : "Pesan ke HarNug AI..."}
                rows={1}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--text-primary)",
                  fontSize: 14,
                  lineHeight: 1.5,
                  resize: "none",
                  maxHeight: 150,
                  minWidth: 0,
                }}
              />
              <button
                type="submit"
                disabled={loading || (!input.trim() && contextSent) || (!input.trim() && !contextText)}
                className="btn btn-primary btn-icon"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "var(--radius-lg)",
                  flexShrink: 0,
                  opacity: loading || (!input.trim() && contextSent) || (!input.trim() && !contextText) ? 0.5 : 1,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </form>
            <div style={{ textAlign: "center", fontSize: 10, color: "var(--text-tertiary)", marginTop: 6 }}>
              AI dapat melakukan kesalahan. Harap verifikasi info penting.
            </div>
          </div>
        </div>
      </div>

      {/* CSS Responsive Static */}
      <style jsx>{`
        .chat-mobile-overlay {
          display: none;
        }

        @media (max-width: 768px) {
          .chat-mobile-overlay {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(2px);
            z-index: 25;
          }

          .chat-sidebar {
            position: fixed !important;
            top: 0 !important;
            bottom: 0 !important;
            left: 0 !important;
            height: 100dvh !important;
            z-index: 30 !important;
            background: var(--bg-primary) !important;
            box-shadow: 4px 0 24px rgba(0, 0, 0, 0.5) !important;
            width: 270px !important;
            min-width: 270px !important;
            max-width: 270px !important;
            transform: translateX(-100%) !important;
            transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
          }

          .chat-sidebar.open {
            transform: translateX(0) !important;
          }

          /* Berikan ruang 48px di kiri header agar ikon Riwayat [◧] berada di sebelah ikon Hamburger [≡] tanpa saling bertumpuk */
          .mobile-header-left-space {
            padding-left: 48px !important;
          }

          .chat-header-bar {
            padding: 0 12px !important;
          }

          .chat-messages-area {
            padding: 14px 10px !important;
            gap: 14px !important;
          }

          .chat-bubble-wrapper {
            max-width: 90% !important;
          }

          .chat-input-container {
            padding: 8px 10px !important;
          }

          .chat-select-field {
            font-size: 11px !important;
          }
        }
      `}</style>
    </div>
  );
}

export default function AiChatPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    }>
      <AiChatContent />
    </Suspense>
  );
}
