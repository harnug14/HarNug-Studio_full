"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

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
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview (rekomendasi)" },
  { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (lama)" },
];

const MODE_OPTIONS = [
  { value: "biasa", label: "Biasa" },
  { value: "mendalam", label: "Mendalam (Deep Dive)" },
  { value: "berpikir", label: "Berpikir (Thinking)" },
  { value: "search", label: "Website/Search" },
];

// Ikon bookmark kecil untuk tombol simpan
function SaveIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

// Deteksi baris berformat "[TOPIK] Judul | Deskripsi" di dalam sebuah teks.
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

// Deteksi penanda [DRAFT_NASKAH] atau [DRAFT_VISUAL] di awal balasan.
// Mengembalikan { isDraft, cleanContent } — cleanContent adalah teks tanpa penanda itu (untuk ditampilkan/disimpan).
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

export default function AiChatPage() {
  const searchParams = useSearchParams();
  const fromReferensi = searchParams.get("fromReferensi");
  const fromTopik = searchParams.get("fromTopik");
  const fromNaskah = searchParams.get("fromNaskah");

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

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSessions();

    if (fromReferensi) {
      loadContextFromReferensi(fromReferensi);
    } else if (fromTopik) {
      loadContextFromTopik(fromTopik);
    } else if (fromNaskah) {
      loadContextFromNaskah(fromNaskah);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function fetchSessions() {
    setLoadingSessions(true);
    try {
      const res = await fetch("/api/chat");
      const data = await res.json();
      if (res.ok) setSessions(data.data || []);
    } catch (e) {
      // diamkan
    }
    setLoadingSessions(false);
  }

  async function loadContextFromReferensi(referensiId: string) {
    try {
      const res = await fetch("/api/referensi");
      const data = await res.json();
      const ref = (data.data || []).find((r: any) => r.id === referensiId);
      if (ref) {
        setContextLabel(`Referensi: ${ref.channel_url}`);
        setSaveTarget("topik");
        setContextText(
          `Berikut hasil analisis channel YouTube "${ref.channel_url}":\n\n` +
            `Niche: ${ref.analysis_niche || "-"}\n` +
            `Visual: ${ref.analysis_visual || "-"}\n` +
            `Editing: ${ref.analysis_editing || "-"}\n` +
            `Hook & CTA: ${ref.analysis_hook_cta || "-"}\n\n` +
            `Tolong buatkan 5 ide topik video YouTube Shorts yang terinspirasi dari gaya channel ini, tapi dengan sudut pandang yang unik/berbeda. Untuk tiap ide, beri judul singkat dan 1-2 kalimat penjelasan.`
        );
      }
    } catch (e) {
      // diamkan
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
    } catch (e) {
      // diamkan
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
    } catch (e) {
      // diamkan
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
    } catch (e) {
      // diamkan
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
  }

  async function handleSend() {
    if (loading) return;

    const pesanDikirim = input.trim() || (!contextSent && contextText ? contextText : "");

    if (!pesanDikirim) return;

    setInput("");
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
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `Error: ${data.error || "Gagal mendapat jawaban"}` },
          ]);
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
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `Error: ${data.error || "Gagal mendapat jawaban"}` },
          ]);
        } else {
          setMessages((prev) => [...prev, { role: "assistant", content: data.jawaban }]);
        }
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${err.message || "Terjadi kesalahan"}` },
      ]);
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
    } catch (e) {
      // diamkan
    }
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
        alert(`Topik "${card.judul}" berhasil disimpan ke Menu Topik!`);
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
        const namaMenu =
          saveTarget === "topik" ? "Menu Topik" : saveTarget === "naskah" ? "Menu Naskah" : "Menu Visual";
        alert(`Berhasil disimpan ke ${namaMenu}!`);
        cancelSaveForm();
      }
    } catch (err: any) {
      alert("Gagal menyimpan: " + (err.message || "Terjadi kesalahan"));
    }

    setSaveSubmitting(false);
  }

  function saveButtonLabel() {
    if (saveTarget === "topik") return "Simpan sebagai Topik";
    if (saveTarget === "naskah") return "Simpan sebagai Naskah";
    if (saveTarget === "visual") return "Simpan sebagai Visual";
    return "";
  }

  function contextHintText() {
    if (!contextLabel) return "Mulai obrolan baru dengan mengetik pesan di bawah.";
    if (saveTarget === "topik")
      return `Context dimuat dari ${contextLabel}. Tekan Kirim untuk minta AI buatkan ide topik.`;
    if (saveTarget === "naskah")
      return `Context dimuat dari ${contextLabel}. Tekan Kirim untuk minta AI buatkan naskah.`;
    if (saveTarget === "visual")
      return `Context dimuat dari ${contextLabel}. Tekan Kirim untuk minta AI buatkan panduan visual.`;
    return `Context dimuat dari ${contextLabel}.`;
  }

  return (
    <div style={{ display: "flex", height: "100vh", color: "#fff" }}>
      <div
        style={{
          width: 240,
          borderRight: "1px solid #333",
          padding: 16,
          overflowY: "auto",
          flexShrink: 0,
        }}
      >
        <button
          onClick={startNewChat}
          style={{
            width: "100%",
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid #666",
            background: "#1a1a1a",
            color: "#fff",
            cursor: "pointer",
            marginBottom: 16,
          }}
        >
          + Chat Baru
        </button>

        <h3 style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>Riwayat</h3>

        {loadingSessions && <p style={{ color: "#666", fontSize: 12 }}>Memuat...</p>}

        {sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => openSession(s.id)}
            style={{
              padding: 8,
              borderRadius: 6,
              marginBottom: 4,
              cursor: "pointer",
              background: activeSessionId === s.id ? "#222" : "transparent",
              fontSize: 13,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {s.judul}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteSession(s.id);
              }}
              style={{
                background: "none",
                border: "none",
                color: "#f88",
                cursor: "pointer",
                fontSize: 11,
                flexShrink: 0,
                marginLeft: 4,
              }}
            >
              hapus
            </button>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            padding: 16,
            borderBottom: "1px solid #333",
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{
              padding: 6,
              borderRadius: 6,
              border: "1px solid #444",
              background: "#111",
              color: "#fff",
              fontSize: 13,
            }}
          >
            {MODEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            style={{
              padding: 6,
              borderRadius: 6,
              border: "1px solid #444",
              background: "#111",
              color: "#fff",
              fontSize: 13,
            }}
          >
            {MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {contextLabel && (
            <span style={{ fontSize: 12, color: "#6cf" }}>Context: {contextLabel}</span>
          )}
          {saveTarget === "naskah" && (
            <span style={{ fontSize: 11, color: "#6dc" }}>🔍 Pencarian web otomatis aktif (untuk sumber naskah)</span>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {messages.length === 0 && (
            <p style={{ color: "#666", fontSize: 14 }}>{contextHintText()}</p>
          )}

          {messages.map((m, i) => {
            const { cards, sisaTeks } =
              m.role === "assistant" ? parseTopikCards(m.content) : { cards: [], sisaTeks: m.content };

            const { isDraft, cleanContent } =
              m.role === "assistant" ? parseDraftMarker(m.content) : { isDraft: false, cleanContent: m.content };

            // Tentukan apakah pesan ini berhak dapat ikon simpan (untuk saveTarget naskah/visual)
            const isSavableDraft =
              m.role === "assistant" &&
              saveTarget &&
              (saveTarget === "naskah" || saveTarget === "visual") &&
              isDraft;

            return (
              <div key={i} style={{ marginBottom: 8 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "70%",
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: m.role === "user" ? "#1a4d7a" : "#222",
                      fontSize: 14,
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {m.role === "assistant" && cards.length > 0 ? (
                      <>
                        {sisaTeks && <div style={{ marginBottom: 10 }}>{sisaTeks}</div>}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {cards.map((card, ci) => {
                            const cardKey = `${i}-${ci}`;
                            return (
                              <div
                                key={ci}
                                style={{
                                  position: "relative",
                                  border: "1px solid #444",
                                  borderRadius: 8,
                                  padding: "8px 34px 8px 10px",
                                  background: "#1a1a1a",
                                }}
                              >
                                <div style={{ fontWeight: 600, marginBottom: 4 }}>{card.judul}</div>
                                <div style={{ fontSize: 13, opacity: 0.85 }}>{card.deskripsi}</div>
                                <button
                                  onClick={() => handleSaveCard(i, ci, card)}
                                  disabled={savingCardKey === cardKey}
                                  title="Simpan sebagai Topik"
                                  style={{
                                    position: "absolute",
                                    top: 8,
                                    right: 8,
                                    width: 24,
                                    height: 24,
                                    borderRadius: "50%",
                                    border: "1px solid #4a8",
                                    background: savingCardKey === cardKey ? "#234" : "transparent",
                                    color: "#6dc",
                                    cursor: savingCardKey === cardKey ? "not-allowed" : "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    padding: 0,
                                  }}
                                >
                                  <SaveIcon />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : m.role === "assistant" ? (
                      cleanContent
                    ) : (
                      m.content
                    )}
                  </div>
                </div>

                {/* Ikon simpan untuk naskah/visual: HANYA muncul kalau AI menandai balasan ini sebagai draft (isDraft true) */}
                {isSavableDraft && cards.length === 0 && (
                  <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 4 }}>
                    <button
                      onClick={() => openSaveForm(i, cleanContent)}
                      title={saveButtonLabel()}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        border: "1px solid #4a8",
                        background: "transparent",
                        color: "#6dc",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                      }}
                    >
                      <SaveIcon />
                    </button>
                  </div>
                )}

                {savingMessageIndex === i && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: 12,
                      border: "1px solid #4a8",
                      borderRadius: 8,
                      background: "#0f1f18",
                    }}
                  >
                    <label style={{ display: "block", fontSize: 12, marginBottom: 4, color: "#aaa" }}>
                      Judul
                    </label>
                    <input
                      type="text"
                      value={saveJudul}
                      onChange={(e) => setSaveJudul(e.target.value)}
                      style={{
                        width: "100%",
                        padding: 8,
                        borderRadius: 6,
                        border: "1px solid #444",
                        background: "#111",
                        color: "#fff",
                        marginBottom: 8,
                      }}
                    />
                    <label style={{ display: "block", fontSize: 12, marginBottom: 4, color: "#aaa" }}>
                      Isi
                    </label>
                    <textarea
                      value={saveCatatan}
                      onChange={(e) => setSaveCatatan(e.target.value)}
                      rows={6}
                      style={{
                        width: "100%",
                        padding: 8,
                        borderRadius: 6,
                        border: "1px solid #444",
                        background: "#111",
                        color: "#fff",
                        marginBottom: 8,
                      }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={handleConfirmSave}
                        disabled={saveSubmitting || !saveJudul.trim()}
                        style={{
                          padding: "6px 14px",
                          borderRadius: 6,
                          border: "1px solid #4a8",
                          background: "#1a3a2a",
                          color: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        {saveSubmitting ? "Menyimpan..." : "Konfirmasi Simpan"}
                      </button>
                      <button
                        onClick={cancelSaveForm}
                        style={{
                          padding: "6px 14px",
                          borderRadius: 6,
                          border: "1px solid #666",
                          background: "transparent",
                          color: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {loading && <div style={{ color: "#888", fontSize: 13 }}>AI sedang mengetik...</div>}

          <div ref={messagesEndRef} />
        </div>

        <div style={{ padding: 16, borderTop: "1px solid #333", display: "flex", gap: 8 }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              contextText && !contextSent ? "Ketik pesan tambahan (opsional), atau langsung tekan Kirim..." : "Ketik pesan..."
            }
            disabled={loading}
            style={{
              flex: 1,
              padding: 10,
              borderRadius: 6,
              border: "1px solid #444",
              background: "#111",
              color: "#fff",
            }}
          />
          <button
            onClick={handleSend}
            disabled={loading || (!input.trim() && (contextSent || !contextText))}
            style={{
              padding: "10px 20px",
              borderRadius: 6,
              border: "1px solid #666",
              background: loading ? "#333" : "#1a1a1a",
              color: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            Kirim
          </button>
        </div>
      </div>
    </div>
  );
}