"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Sidebar from "../components/Sidebar";

// (Keep all the interfaces and options same as before)
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
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
  { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "groq-llama-3.3-70b-versatile", label: "Groq Llama 3.3 70B" },
  { value: "groq-mixtral-8x7b-32768", label: "Groq Mixtral 8x7B" },
];

const MODE_OPTIONS = [
  { value: "biasa", label: "Biasa" },
  { value: "mendalam", label: "Deep Dive" },
  { value: "berpikir", label: "Thinking" },
  { value: "search", label: "Web Search" },
];

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

  const [userEmail, setUserEmail] = useState<string | undefined>();
  const [authLoading, setAuthLoading] = useState(true);

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState(MODEL_OPTIONS[0].value);
  const [mode, setMode] = useState(MODE_OPTIONS[0].value);
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

  const [sidebarOpen, setSidebarOpen] = useState(true); // For chat sessions sidebar

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUserEmail(user.email || undefined);
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
      const res = await fetch("/api/referensi");
      const data = await res.json();
      const ref = (data.data || []).find((r: any) => r.id === referensiId);
      if (ref) {
        setContextLabel(`Referensi: ${ref.channel_title || ref.channel_url}`);
        setSaveTarget("topik");
        setContextText(
          `Berikut data analisis channel referensi "${ref.channel_url}":\n\n- Niche/Topik Utama: ${ref.analysis_niche || "-"}\n- Gaya Visual: ${ref.analysis_visual || "-"}\n- Gaya Editing: ${ref.analysis_editing || "-"}\n- Hook & CTA: ${ref.analysis_hook_cta || "-"}\n\nBerdasarkan data di atas, tolong buatkan 5 ide topik video YouTube Shorts yang SANGAT RELEVAN dan BENAR-BENAR DITURUNKAN dari niche referensi tersebut. JANGAN berikan ide yang terlalu acak atau melenceng jauh. Topik ini harus terasa seperti video yang mungkin diunggah oleh channel referensi itu sendiri, namun dengan angle (sudut pandang) orisinal yang baru.\n\nUntuk tiap ide, berikan judul singkat yang sangat memikat (klik-bait positif) dan 1-2 kalimat penjelasan konkret tentang visual atau isi videonya.`
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
        setContextLabel(`Topik: ${topik.judul}`);
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
        setContextLabel(`Naskah: ${naskah.judul}`);
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
    try {
      const res = await fetch(`/api/chat/${sessionId}`);
      const data = await res.json();
      if (res.ok) {
        setMessages(data.messages || []);
        setModel(data.session.model);
        setMode(data.session.mode);
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

    try {
      if (!activeSessionId) {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pesan: pesanDikirim,
            model,
            mode,
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
      } else {
        // Show temporary toast or visual feedback instead of alert if possible, but alert is okay for now
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
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Global Navigation Sidebar */}
      <Sidebar userEmail={userEmail} />

      {/* Chat Application Area */}
      <div
        className="chat-container"
        style={{
          flex: 1,
          marginLeft: "var(--sidebar-width)",
          display: "flex",
          height: "100vh",
          background: "var(--bg-primary)",
        }}
      >
        {/* Chat Sessions Sidebar */}
        <div
          className={`chat-sidebar ${sidebarOpen ? "open" : ""}`}
          style={{
            width: 280,
            background: "rgba(10, 10, 10, 0.95)",
            borderRight: "1px solid var(--glass-border)",
            display: "flex",
            flexDirection: "column",
            transition: "all var(--transition-base)",
            flexShrink: 0,
            zIndex: 10,
          }}
        >
          <div style={{ padding: 16 }}>
            <button
              onClick={startNewChat}
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", fontWeight: 600 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Chat Baru
            </button>
          </div>

          <div style={{ padding: "0 16px 8px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Riwayat Chat
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 16px" }}>
            {loadingSessions && <div className="skeleton" style={{ height: 40, marginBottom: 8 }} />}

            {sessions.map((s) => {
              const isRenaming = renamingSessionId === s.id;
              const isActive = activeSessionId === s.id;

              return (
                <div
                  key={s.id}
                  onClick={() => !isRenaming && openSession(s.id)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--radius-md)",
                    marginBottom: 4,
                    cursor: isRenaming ? "default" : "pointer",
                    background: isActive ? "rgba(168, 85, 247, 0.1)" : "transparent",
                    border: `1px solid ${isActive ? "rgba(168, 85, 247, 0.2)" : "transparent"}`,
                    color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    transition: "all var(--transition-fast)",
                  }}
                  className="chat-session-item"
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                  }}
                  onMouseLeave={(e) => {
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
                      style={{ padding: "4px 8px", fontSize: 13 }}
                    />
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isActive ? "var(--accent-purple)" : "currentColor"} strokeWidth="2" style={{ flexShrink: 0 }}>
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, fontSize: 13, fontWeight: isActive ? 500 : 400 }}>
                        {s.judul}
                      </span>
                      <div className="session-actions" style={{ display: "flex", opacity: isActive ? 1 : 0 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); startRename(s); }}
                          className="btn-ghost btn-icon"
                          style={{ width: 24, height: 24, padding: 0 }}
                          title="Ganti nama"
                        >
                          <EditIcon />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id); }}
                          className="btn-ghost btn-icon"
                          style={{ width: 24, height: 24, padding: 0, color: "var(--status-error)" }}
                          title="Hapus"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Chat Main Area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative" }}>
          
          {/* Header */}
          <div style={{
            padding: "16px 24px",
            borderBottom: "1px solid var(--glass-border)",
            background: "rgba(5, 5, 5, 0.8)",
            backdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            zIndex: 5,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                className="btn-ghost btn-icon toggle-sidebar-btn"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                style={{ width: 36, height: 36 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
              </button>
              
              <div style={{ display: "flex", gap: 12 }}>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="select-field"
                  style={{ width: 200, padding: "8px 32px 8px 12px", background: "rgba(255,255,255,0.03)" }}
                >
                  {MODEL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  className="select-field"
                  style={{ width: 150, padding: "8px 32px 8px 12px", background: "rgba(255,255,255,0.03)" }}
                >
                  {MODE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Context Banner */}
          {contextLabel && (
            <div style={{
              background: "linear-gradient(90deg, rgba(168, 85, 247, 0.1), rgba(6, 182, 212, 0.1))",
              borderBottom: "1px solid rgba(168, 85, 247, 0.2)",
              padding: "10px 24px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 13,
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%", background: "var(--accent-gradient)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff"
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ color: "var(--text-secondary)" }}>Konteks termuat dari </span>
                <strong style={{ color: "var(--text-primary)" }}>{contextLabel}</strong>
                {saveTarget === "naskah" && <span style={{ marginLeft: 8, color: "var(--accent-cyan)", fontSize: 12 }}>— Pencarian web otomatis aktif</span>}
              </div>
            </div>
          )}

          {/* Messages Area */}
          <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: 24 }}>
            {messages.length === 0 && (
              <div style={{ margin: "auto", textAlign: "center", maxWidth: 400 }}>
                <div style={{
                  width: 64, height: 64, borderRadius: "var(--radius-2xl)", background: "var(--glass-bg)", border: "1px solid var(--glass-border)",
                  display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", color: "var(--accent-purple)"
                }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: "var(--text-primary)" }}>Mulai Chat Baru</h2>
                <p style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  {!contextLabel 
                    ? "Tanyakan apapun, generate naskah, ide topik, atau riset konten YouTube Shorts Anda di sini."
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
                  gap: 16,
                  alignItems: "flex-start",
                }}>
                  {/* Avatar */}
                  <div style={{
                    width: 36, height: 36, borderRadius: "var(--radius-full)", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: m.role === "user" ? "rgba(255,255,255,0.1)" : "var(--accent-gradient)",
                    color: "#fff", border: `1px solid ${m.role === "user" ? "rgba(255,255,255,0.2)" : "transparent"}`,
                  }}>
                    {m.role === "user" ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    )}
                  </div>

                  {/* Bubble */}
                  <div style={{
                    maxWidth: "75%",
                    minWidth: 0,
                  }}>
                    <div style={{
                      padding: "14px 18px",
                      borderRadius: "var(--radius-lg)",
                      borderTopLeftRadius: m.role === "assistant" ? 4 : "var(--radius-lg)",
                      borderTopRightRadius: m.role === "user" ? 4 : "var(--radius-lg)",
                      background: m.role === "user" ? "rgba(255,255,255,0.08)" : "var(--glass-bg)",
                      border: `1px solid ${m.role === "user" ? "rgba(255,255,255,0.1)" : "var(--glass-border)"}`,
                      fontSize: 14,
                      lineHeight: 1.6,
                      color: "var(--text-primary)",
                      whiteSpace: "pre-wrap",
                      boxShadow: m.role === "assistant" ? "0 4px 20px rgba(0,0,0,0.2)" : "none",
                    }}>
                      {m.role === "assistant" && cards.length > 0 ? (
                        <>
                          {sisaTeks && <div style={{ marginBottom: 16 }}>{sisaTeks}</div>}
                          <div style={{ display: "grid", gap: 12 }}>
                            {cards.map((card, ci) => {
                              const cardKey = `${i}-${ci}`;
                              return (
                                <div key={ci} style={{
                                  position: "relative",
                                  border: "1px solid var(--glass-border)",
                                  borderRadius: "var(--radius-md)",
                                  padding: 16,
                                  background: "rgba(0,0,0,0.2)",
                                  transition: "all var(--transition-fast)",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.borderColor = "var(--accent-purple)";
                                  e.currentTarget.style.boxShadow = "var(--shadow-glow-purple)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.borderColor = "var(--glass-border)";
                                  e.currentTarget.style.boxShadow = "none";
                                }}>
                                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6, paddingRight: 40, color: "var(--accent-cyan)" }}>{card.judul}</div>
                                  <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>{card.deskripsi}</div>
                                  <button
                                    onClick={() => handleSaveCard(i, ci, card)}
                                    disabled={savingCardKey === cardKey}
                                    title="Simpan ke Topik"
                                    style={{
                                      position: "absolute", top: 12, right: 12, width: 32, height: 32, borderRadius: "var(--radius-full)",
                                      background: "rgba(168, 85, 247, 0.15)", border: "1px solid rgba(168, 85, 247, 0.3)",
                                      color: "var(--accent-purple)", cursor: savingCardKey === cardKey ? "not-allowed" : "pointer",
                                      display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                                      transition: "all 0.2s"
                                    }}
                                  >
                                    <SaveIcon />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : m.role === "assistant" ? cleanContent : m.content}
                    </div>

                    {/* Quick Action Below Bubble */}
                    {isSavableDraft && cards.length === 0 && (
                      <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 8 }} className="animate-fade-in">
                        <button
                          onClick={() => openSaveForm(i, cleanContent)}
                          className="btn btn-secondary btn-sm"
                          style={{ gap: 6, color: "var(--accent-teal)" }}
                        >
                          <SaveIcon />
                          Simpan ke Menu {saveTarget === "naskah" ? "Naskah" : "Visual"}
                        </button>
                      </div>
                    )}

                    {/* Inline Save Form */}
                    {savingMessageIndex === i && (
                      <div className="glass-card animate-fade-in-up" style={{ marginTop: 12, padding: 16, border: "1px solid var(--accent-teal)" }}>
                        <div style={{ marginBottom: 12 }}>
                          <label className="form-label">Judul</label>
                          <input
                            type="text"
                            value={saveJudul}
                            onChange={(e) => setSaveJudul(e.target.value)}
                            className="input-field"
                          />
                        </div>
                        <div style={{ marginBottom: 16 }}>
                          <label className="form-label">Isi</label>
                          <textarea
                            value={saveCatatan}
                            onChange={(e) => setSaveCatatan(e.target.value)}
                            rows={4}
                            className="textarea-field"
                          />
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={handleConfirmSave} disabled={saveSubmitting || !saveJudul.trim()} className="btn btn-primary btn-sm">
                            {saveSubmitting ? "Menyimpan..." : "Konfirmasi Simpan"}
                          </button>
                          <button onClick={cancelSaveForm} className="btn btn-ghost btn-sm">Batal</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="animate-fade-in-up" style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{ width: 36, height: 36, borderRadius: "var(--radius-full)", background: "var(--accent-gradient)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <div style={{ padding: "16px 20px", borderRadius: "var(--radius-lg)", borderTopLeftRadius: 4, background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent-purple)", animation: "typing-bounce 1s infinite 0s" }} />
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent-cyan)", animation: "typing-bounce 1s infinite 0.2s" }} />
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent-teal)", animation: "typing-bounce 1s infinite 0.4s" }} />
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} style={{ height: 20 }} />
          </div>

          {/* Input Area */}
          <div style={{ padding: "16px 24px 24px", background: "linear-gradient(transparent, var(--bg-primary) 20%)" }}>
            <div style={{
              display: "flex",
              alignItems: "flex-end",
              background: "var(--bg-elevated)",
              border: "1px solid var(--glass-border)",
              borderRadius: "var(--radius-xl)",
              padding: "8px 12px",
              boxShadow: "var(--shadow-lg)",
              transition: "border-color var(--transition-fast)",
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = "var(--accent-purple)"}
            onBlur={(e) => e.currentTarget.style.borderColor = "var(--glass-border)"}
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
                placeholder={contextText && !contextSent ? "Ketik pesan tambahan atau langsung Enter..." : "Pesan ke HarNug AI..."}
                disabled={loading}
                rows={1}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  color: "var(--text-primary)",
                  padding: "10px",
                  fontSize: 15,
                  resize: "none",
                  outline: "none",
                  maxHeight: 150,
                  fontFamily: "inherit",
                }}
              />
              <button
                onClick={handleSend}
                disabled={loading || (!input.trim() && (contextSent || !contextText))}
                style={{
                  width: 44, height: 44, borderRadius: "50%",
                  background: loading || (!input.trim() && (contextSent || !contextText)) ? "rgba(255,255,255,0.1)" : "var(--accent-gradient)",
                  color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                  border: "none", cursor: loading || (!input.trim() && (contextSent || !contextText)) ? "not-allowed" : "pointer",
                  margin: 2, flexShrink: 0,
                  transition: "all var(--transition-fast)",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "translateX(2px)" }}><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            </div>
            <div style={{ textAlign: "center", fontSize: 11, color: "var(--text-tertiary)", marginTop: 12 }}>
              AI dapat melakukan kesalahan. Harap verifikasi info penting.
            </div>
          </div>
          
        </div>
      </div>

      <style jsx>{`
        .chat-session-item .session-actions {
          opacity: 0;
        }
        .chat-session-item:hover .session-actions {
          opacity: 1;
        }
        @media (max-width: 900px) {
          .chat-sidebar {
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            z-index: 20;
            transform: translateX(-100%);
          }
          .chat-sidebar.open {
            transform: translateX(0);
          }
          .toggle-sidebar-btn {
            display: flex !important;
          }
        }
        @media (max-width: 768px) {
          .chat-container {
            margin-left: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}

export default function AiChatPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#050505" }}>
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    }>
      <AiChatContent />
    </Suspense>
  );
}