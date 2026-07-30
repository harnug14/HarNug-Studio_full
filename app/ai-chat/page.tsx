"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

interface ChatMessageItem {
  id?: string;
  role: "user" | "assistant";
  content: string;
  attachments?: { name: string; url: string; type: string; base64?: string }[];
}

interface SessionItem {
  id: string;
  judul: string;
  model: string;
  mode: string;
  created_at: string;
}

interface AttachmentFile {
  name: string;
  type: string;
  base64: string;
  previewUrl?: string;
}

// Menghapus pilihan gemini-3.1-pro yang tidak terdaftar di Google API
const MODEL_OPTIONS = [
  { value: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
  { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "groq-llama-3.3-70b-versatile", label: "Groq Llama 3.3 70B" },
  { value: "groq-mixtral-8x7b-32768", label: "Groq Mixtral 8x7B" },
];

const CHAT_SIDEBAR_STORAGE_KEY = "ai_chat_sidebar_open";

function EditIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function AiChatContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [authLoading, setAuthLoading] = useState(true);

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState(MODEL_OPTIONS[0].value);

  const [isThinking, setIsThinking] = useState(false);
  const [isWebSearch, setIsWebSearch] = useState(false);

  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeakingId, setIsSpeakingId] = useState<string | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [spinningId, setSpinningId] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  const [previewAttachment, setPreviewAttachment] = useState<{
    name: string;
    url: string;
    type: string;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);

  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [dropdownOpenId, setDropdownOpenId] = useState<string | null>(null);
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarReady, setSidebarReady] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth <= 768) {
      if (sidebarOpen) {
        document.body.classList.add("chat-history-open");
      } else {
        document.body.classList.remove("chat-history-open");
      }
    }
    return () => {
      document.body.classList.remove("chat-history-open");
    };
  }, [sidebarOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpenId(null);
      }
      if (plusMenuRef.current && !plusMenuRef.current.contains(event.target as Node)) {
        setPlusMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

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

  const handleCopy = (id: string, text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  const handleStartEdit = (index: number, content: string) => {
    setEditingIndex(index);
    setEditingText(content);
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditingText("");
  };

  const handleSaveEdit = (index: number) => {
    if (!editingText.trim()) return;
    const newContent = editingText.trim();
    setEditingIndex(null);
    setEditingText("");

    setMessages((prev) => prev.slice(0, index));
    handleSend(newContent);
  };

  const handleRetryUser = (id: string, text: string) => {
    setSpinningId(id);
    setTimeout(() => setSpinningId(null), 1000);
    handleSend(text);
  };

  const handleRegenerateAI = (id: string) => {
    setSpinningId(id);
    setTimeout(() => setSpinningId(null), 1000);
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) {
      handleSend(lastUser.content);
    }
  };

  const handleReadAloud = (id: string, text: string) => {
    if (!text) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      alert("Browser Anda tidak mendukung fitur Read Aloud.");
      return;
    }

    if (isSpeakingId === id) {
      window.speechSynthesis.cancel();
      setIsSpeakingId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "id-ID";
    utterance.onend = () => setIsSpeakingId(null);
    utterance.onerror = () => setIsSpeakingId(null);
    setIsSpeakingId(id);
    window.speechSynthesis.speak(utterance);
  };

  const handleVoiceInput = () => {
    if (typeof window === "undefined") return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Browser Anda belum mendukung input suara. Silakan gunakan Google Chrome terbaru.");
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "id-ID";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      if (transcript) {
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };

    recognition.onerror = () => setIsListening(false);
    recognition.start();
  };

  const handleAttachmentClick = (att: { name: string; url: string; type: string }) => {
    if (att.type.startsWith("image/") || att.url.startsWith("data:image/")) {
      setPreviewAttachment(att);
    } else {
      const win = window.open();
      if (win) {
        if (att.url.startsWith("data:")) {
          win.document.write(
            `<iframe src="${att.url}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`
          );
        } else {
          win.location.href = att.url;
        }
      }
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setLoading(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, fileType: "image" | "file" | "camera") => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Raw = event.target?.result as string;
        if (!base64Raw) return;

        setAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            type: file.type || (fileType === "file" ? "application/pdf" : "image/png"),
            base64: base64Raw,
            previewUrl: fileType !== "file" ? base64Raw : undefined,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });

    setPlusMenuOpen(false);
    if (e.target) e.target.value = "";
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

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
        
        const sessMode = data.session.mode || "biasa";
        setIsThinking(sessMode.includes("berpikir"));
        setIsWebSearch(sessMode.includes("search"));
      }
    } catch {
      // silent
    }
    setLoading(false);
  }

  function startNewChat() {
    setActiveSessionId(null);
    setMessages([]);
    setInput("");
    setAttachments([]);
    setIsThinking(false);
    setIsWebSearch(false);
    if (typeof window !== "undefined" && window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  }

  async function handleSend(overrideContent?: string) {
    if (loading) return;

    const rawText = overrideContent !== undefined ? overrideContent : input.trim();
    const pesanDikirim = rawText;

    if (!pesanDikirim && attachments.length === 0) return;

    const currentAttachments = [...attachments];
    if (overrideContent === undefined) setInput("");
    setAttachments([]);
    if (inputRef.current) inputRef.current.style.height = "auto";
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: pesanDikirim,
        attachments: currentAttachments.map((a) => ({
          name: a.name,
          url: a.previewUrl || a.base64 || "",
          type: a.type,
          base64: a.base64,
        })),
      },
    ]);

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
          signal: controller.signal,
          body: JSON.stringify({
            pesan: pesanDikirim,
            model,
            mode: modeDipakai,
            attachments: currentAttachments,
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
          signal: controller.signal,
          body: JSON.stringify({
            pesan: pesanDikirim,
            attachments: currentAttachments,
          }),
        });
        const data = await res.json();

        if (!res.ok) {
          setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${data.error || "Gagal mendapat jawaban"}` }]);
        } else {
          setMessages((prev) => [...prev, { role: "assistant", content: data.jawaban }]);
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err.message || "Terjadi kesalahan"}` }]);
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
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

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    );
  }

  return (
    <div style={{ height: "100%", width: "100%", background: "var(--bg-primary)", overflow: "hidden", position: "relative" }}>
      
      <input
        type="file"
        ref={cameraInputRef}
        onChange={(e) => handleFileUpload(e, "camera")}
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
      />
      <input
        type="file"
        ref={imageInputRef}
        onChange={(e) => handleFileUpload(e, "image")}
        accept="image/*"
        style={{ display: "none" }}
        multiple
      />
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => handleFileUpload(e, "file")}
        accept=".pdf,.txt,.doc,.docx,.csv"
        style={{ display: "none" }}
        multiple
      />

      {sidebarOpen && (
        <div
          className="chat-mobile-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {previewAttachment && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(6px)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setPreviewAttachment(null)}
        >
          <div
            style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh", display: "flex", flexDirection: "column", alignItems: "center" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewAttachment(null)}
              style={{
                position: "absolute",
                top: -36,
                right: -10,
                background: "none",
                border: "none",
                color: "#fff",
                fontSize: 22,
                cursor: "pointer",
              }}
            >
              ✕
            </button>
            {previewAttachment.type.startsWith("image/") || previewAttachment.url.startsWith("data:image/") ? (
              <img
                src={previewAttachment.url}
                alt={previewAttachment.name}
                style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: "8px", objectFit: "contain", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}
              />
            ) : (
              <iframe
                src={previewAttachment.url}
                title={previewAttachment.name}
                style={{ width: "80vw", height: "80vh", border: "none", borderRadius: "8px", background: "#fff" }}
              />
            )}
            <div style={{ color: "#fff", marginTop: 12, fontSize: 13, fontWeight: 500, textAlign: "center" }}>
              {previewAttachment.name}
            </div>
          </div>
        </div>
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
          <div style={{ height: 57, padding: "0 10px", display: "flex", alignItems: "center", borderBottom: "none", flexShrink: 0 }}>
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
                    background: isActive ? "var(--glass-bg-hover)" : "transparent",
                    borderLeft: isActive ? "2px solid var(--text-primary)" : "2px solid transparent",
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

        <div style={{ flex: "1 1 0%", display: "flex", flexDirection: "column", position: "relative", minWidth: 0, height: "100%", overflow: "hidden", background: "var(--bg-primary)" }}>
          <div
            className="chat-header-bar"
            style={{
              height: 57,
              padding: "0 20px",
              borderBottom: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              zIndex: 5,
              flexShrink: 0,
              gap: 12,
              boxSizing: "border-box"
            }}
          >
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

            <div style={{ flex: 1 }} />

            <div style={{ width: 36, flexShrink: 0 }} />
          </div>

          <div className="chat-messages-area" style={{ flex: "1 1 auto", overflowY: "auto", overflowX: "hidden", padding: "24px", display: "flex", flexDirection: "column", minHeight: 0 }}>
            {messages.length === 0 ? (
              <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                flex: 1,
                width: "100%",
                height: "100%",
                minHeight: 280,
                textAlign: "center",
                padding: "20px 16px",
              }}>
                <div style={{
                  fontSize: 22,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  letterSpacing: "-0.01em",
                }}>
                  Ada yang bisa dibantu?
                </div>
              </div>
            ) : (
              <div style={{ maxWidth: 840, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
                {messages.map((m, i) => {
                  const msgId = m.id || `msg-${i}`;
                  const isEditingThis = editingIndex === i;

                  return (
                    <div key={i} className="animate-fade-in-up" style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: m.role === "user" ? "flex-end" : "flex-start",
                      width: "100%",
                    }}>
                      <div className="chat-bubble-wrapper" style={{
                        maxWidth: m.role === "user" ? "80%" : "92%",
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: m.role === "user" ? "flex-end" : "flex-start",
                      }}>
                        {m.attachments && m.attachments.length > 0 && (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8, justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                            {m.attachments.map((att, ai) => (
                              <div
                                key={ai}
                                onClick={() => handleAttachmentClick({ name: att.name, url: att.url || att.base64 || "", type: att.type })}
                                style={{
                                  borderRadius: "var(--radius-md)",
                                  overflow: "hidden",
                                  border: "1px solid var(--glass-border)",
                                  background: "var(--bg-secondary)",
                                  padding: 4,
                                  cursor: "pointer",
                                  transition: "transform 0.15s ease",
                                }}
                                title="Klik untuk membuka lampiran"
                                onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.03)"}
                                onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                              >
                                {att.type.startsWith("image/") || att.url.startsWith("data:image/") ? (
                                  <img src={att.url} alt={att.name} style={{ maxWidth: 180, maxHeight: 130, objectFit: "cover", borderRadius: "var(--radius-sm)" }} />
                                ) : (
                                  <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                                    <span>📄</span>
                                    <span style={{ fontWeight: 500 }}>{att.name}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {m.role === "user" ? (
                          (m.content || isEditingThis) && (
                            <div style={{
                              padding: "12px 16px",
                              borderRadius: "var(--radius-lg)",
                              borderTopRightRadius: "4px",
                              background: "var(--bg-elevated)",
                              border: "1px solid var(--glass-border-hover)",
                              fontSize: 14,
                              lineHeight: 1.6,
                              color: "var(--text-primary)",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              overflowWrap: "break-word",
                              width: isEditingThis ? "100%" : "auto",
                              minWidth: isEditingThis ? 280 : "auto",
                            }}>
                              {isEditingThis ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
                                  <textarea
                                    value={editingText}
                                    onChange={(e) => setEditingText(e.target.value)}
                                    rows={3}
                                    style={{
                                      width: "100%",
                                      background: "rgba(0,0,0,0.2)",
                                      border: "1px solid var(--glass-border)",
                                      borderRadius: "8px",
                                      padding: "8px 10px",
                                      color: "var(--text-primary)",
                                      fontSize: 14,
                                      outline: "none",
                                      resize: "vertical",
                                    }}
                                  />
                                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                    <button
                                      type="button"
                                      onClick={handleCancelEdit}
                                      style={{
                                        padding: "4px 12px",
                                        borderRadius: "6px",
                                        fontSize: 12,
                                        background: "transparent",
                                        border: "1px solid var(--glass-border)",
                                        color: "var(--text-secondary)",
                                        cursor: "pointer",
                                      }}
                                    >
                                      Batal
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSaveEdit(i)}
                                      style={{
                                        padding: "4px 12px",
                                        borderRadius: "6px",
                                        fontSize: 12,
                                        background: "var(--text-primary)",
                                        border: "none",
                                        color: "var(--bg-primary)",
                                        fontWeight: 600,
                                        cursor: "pointer",
                                      }}
                                    >
                                      Simpan
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                m.content
                              )}
                            </div>
                          )
                        ) : (
                          <div style={{
                            padding: "4px 0",
                            background: "transparent",
                            border: "none",
                            fontSize: 14,
                            lineHeight: 1.6,
                            color: "var(--text-primary)",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            overflowWrap: "break-word",
                            width: "100%",
                          }}>
                            <div>{m.content}</div>
                          </div>
                        )}

                        {!isEditingThis && (
                          <div style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            marginTop: 4,
                            color: "var(--text-tertiary)",
                          }}>
                            {m.role === "user" ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleRetryUser(msgId, m.content)}
                                  className={`chat-action-btn ${spinningId === msgId ? "spinning-icon" : ""}`}
                                  title="Retry"
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStartEdit(i, m.content)}
                                  className="chat-action-btn"
                                  title="Edit"
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                                </button>
                                {m.content && (
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(msgId, m.content)}
                                    className="chat-action-btn"
                                    title="Copy"
                                  >
                                    {copiedId === msgId ? (
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                    ) : (
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                    )}
                                  </button>
                                )}
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(msgId, m.content)}
                                  className="chat-action-btn"
                                  title="Copy"
                                >
                                  {copiedId === msgId ? (
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                  ) : (
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReadAloud(msgId, m.content)}
                                  className={`chat-action-btn ${isSpeakingId === msgId ? "active-speaking" : ""}`}
                                  title="Read aloud"
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRegenerateAI(msgId)}
                                  className={`chat-action-btn ${spinningId === msgId ? "spinning-icon" : ""}`}
                                  title="Retry"
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {loading && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--text-secondary)", fontSize: 13, padding: "8px 0" }}>
                    <div className="spinner" style={{ width: 14, height: 14 }} />
                    <span>Sedang mengetik...</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div
            className="chat-input-container"
            style={{
              padding: "12px 20px",
              borderTop: "none",
              flexShrink: 0,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div style={{ width: "100%", maxWidth: 840 }}>
              
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
                    padding: "4px 12px",
                    borderRadius: "16px",
                    fontSize: 11,
                    fontWeight: isThinking ? 600 : 400,
                    background: isThinking ? "var(--glass-bg-hover)" : "rgba(255, 255, 255, 0.04)",
                    color: isThinking ? "var(--text-primary)" : "var(--text-secondary)",
                    border: `1px solid ${isThinking ? "var(--text-primary)" : "var(--glass-border)"}`,
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
                    padding: "4px 12px",
                    borderRadius: "16px",
                    fontSize: 11,
                    fontWeight: isWebSearch ? 600 : 400,
                    background: isWebSearch ? "var(--glass-bg-hover)" : "rgba(255, 255, 255, 0.04)",
                    color: isWebSearch ? "var(--text-primary)" : "var(--text-secondary)",
                    border: `1px solid ${isWebSearch ? "var(--text-primary)" : "var(--glass-border)"}`,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  Web Search {isWebSearch ? "✓" : ""}
                </button>
              </div>

              <div style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--glass-border)",
                borderRadius: "var(--radius-xl)",
                padding: "12px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                position: "relative",
              }}>
                {attachments.length > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderBottom: "1px solid var(--glass-border)", paddingBottom: 10 }}>
                    {attachments.map((att, ai) => (
                      <div
                        key={ai}
                        onClick={() => handleAttachmentClick({ name: att.name, url: att.previewUrl || att.base64 || "", type: att.type })}
                        style={{
                          position: "relative",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--glass-border)",
                          borderRadius: "var(--radius-md)",
                          padding: "4px 8px",
                          fontSize: 12,
                          color: "var(--text-primary)",
                          cursor: "pointer",
                        }}
                        title="Klik untuk pratinjau foto/file"
                      >
                        {att.previewUrl ? (
                          <img src={att.previewUrl} alt={att.name} style={{ width: 24, height: 24, borderRadius: 4, objectFit: "cover" }} />
                        ) : (
                          <span>📄</span>
                        )}
                        <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.name}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeAttachment(ai);
                          }}
                          style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: "0 2px", fontSize: 14 }}
                          title="Hapus lampiran"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

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
                  placeholder="Mengobrol dengan HarNug AI..."
                  rows={1}
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "var(--text-primary)",
                    fontSize: 14,
                    lineHeight: 1.5,
                    resize: "none",
                    maxHeight: 140,
                    minWidth: 0,
                  }}
                />

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, width: "100%", flexWrap: "nowrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 auto", minWidth: 0 }}>
                    <div ref={plusMenuRef} style={{ position: "relative", flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={() => setPlusMenuOpen((prev) => !prev)}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "var(--radius-full)",
                          background: "var(--glass-bg-hover)",
                          border: "1px solid var(--glass-border)",
                          color: "var(--text-primary)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                        }}
                        title="Lampirkan foto, kamera, atau dokumen"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                      </button>

                      {plusMenuOpen && (
                        <div style={{
                          position: "absolute",
                          bottom: "100%",
                          left: 0,
                          marginBottom: 8,
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--glass-border)",
                          borderRadius: "var(--radius-xl)",
                          padding: "8px 10px",
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                          zIndex: 50,
                          minWidth: 160,
                          boxShadow: "var(--shadow-md)"
                        }}>
                          <button
                            type="button"
                            onClick={() => cameraInputRef.current?.click()}
                            style={{
                              display: "flex", alignItems: "center", gap: 12, padding: "8px 10px",
                              background: "transparent", border: "none", color: "var(--text-primary)", fontSize: 13,
                              textAlign: "left", cursor: "pointer", borderRadius: "var(--radius-md)", fontWeight: 500
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                          >
                            <div style={{
                              width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.08)",
                              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                            }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                            </div>
                            Kamera
                          </button>

                          <button
                            type="button"
                            onClick={() => imageInputRef.current?.click()}
                            style={{
                              display: "flex", alignItems: "center", gap: 12, padding: "8px 10px",
                              background: "transparent", border: "none", color: "var(--text-primary)", fontSize: 13,
                              textAlign: "left", cursor: "pointer", borderRadius: "var(--radius-md)", fontWeight: 500
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                          >
                            <div style={{
                              width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.08)",
                              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                            }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                            </div>
                            Foto
                          </button>

                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                              display: "flex", alignItems: "center", gap: 12, padding: "8px 10px",
                              background: "transparent", border: "none", color: "var(--text-primary)", fontSize: 13,
                              textAlign: "left", cursor: "pointer", borderRadius: "var(--radius-md)", fontWeight: 500
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                          >
                            <div style={{
                              width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.08)",
                              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                            }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                            </div>
                            File
                          </button>
                        </div>
                      )}
                    </div>

                    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
                      <select
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        style={{
                          height: 28,
                          padding: "0 22px 0 10px",
                          fontSize: 11,
                          fontWeight: 500,
                          borderRadius: 14,
                          background: "rgba(255, 255, 255, 0.06)",
                          border: "1px solid var(--glass-border)",
                          color: "var(--text-primary)",
                          cursor: "pointer",
                          outline: "none",
                          appearance: "none",
                          WebkitAppearance: "none",
                          maxWidth: 140,
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {MODEL_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value} style={{ background: "#1a1a1a", color: "#fff" }}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                        style={{ position: "absolute", right: 8, pointerEvents: "none", color: "var(--text-secondary)" }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>

                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={handleVoiceInput}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: "var(--radius-full)",
                        background: isListening ? "rgba(239, 68, 68, 0.2)" : "rgba(255, 255, 255, 0.06)",
                        border: `1px solid ${isListening ? "#f87171" : "var(--glass-border)"}`,
                        color: isListening ? "#f87171" : "var(--text-primary)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        animation: isListening ? "pulse 1.2s infinite" : "none",
                      }}
                      title={isListening ? "Mendengarkan suara..." : "Bicara pesan suara"}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                      </svg>
                    </button>

                    {loading ? (
                      <button
                        type="button"
                        onClick={handleStop}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: "var(--radius-full)",
                          background: "var(--text-primary)",
                          border: "none",
                          color: "var(--bg-primary)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                        title="Hentikan AI seketika"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSend()}
                        disabled={!input.trim() && attachments.length === 0}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: "var(--radius-full)",
                          background: "var(--text-primary)",
                          border: "none",
                          color: "var(--bg-primary)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          flexShrink: 0,
                          opacity: !input.trim() && attachments.length === 0 ? 0.3 : 1,
                        }}
                        title="Kirim Pesan"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="22" y1="2" x2="11" y2="13"></line>
                          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ textAlign: "center", fontSize: 10, color: "var(--text-tertiary)", marginTop: 6 }}>
                AI dapat melakukan kesalahan. Harap verifikasi info penting.
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .chat-mobile-overlay {
          display: none;
        }

        .chat-action-btn {
          background: transparent;
          border: none;
          color: var(--text-tertiary);
          cursor: pointer;
          padding: 5px;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.15s ease, color 0.15s ease;
          outline: none;
        }

        .chat-action-btn:hover {
          color: var(--text-primary);
          background: var(--glass-bg-hover, rgba(150, 150, 150, 0.12));
          transform: scale(1.18) translateY(-1px);
        }

        .chat-action-btn:active {
          transform: scale(0.88) translateY(0);
          background: var(--glass-border, rgba(150, 150, 150, 0.25));
        }

        .spinning-icon {
          animation: spin 0.8s ease-in-out infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .chat-action-btn.active-speaking {
          color: var(--text-primary);
          background: var(--glass-bg-hover, rgba(150, 150, 150, 0.15));
          animation: pulse-speaker 1.2s infinite;
        }

        @keyframes pulse-speaker {
          0% { transform: scale(1); }
          50% { transform: scale(1.12); }
          100% { transform: scale(1); }
        }

        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.08); }
          100% { transform: scale(1); }
        }

        @media (max-width: 768px) {
          :global(body.chat-history-open .sidebar-mobile-toggle) {
            display: none !important;
          }

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
            height: 100% !important;
            z-index: 30 !important;
            background: var(--bg-primary) !important;
            box-shadow: 4px 0 24px rgba(0, 0, 0, 0.5) !important;
            width: 270px !important;
            min-width: 270px !important;
            max-width: 270px !important;
            transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), visibility 0.25s !important;
          }

          .chat-sidebar:not(.open) {
            transform: translateX(-105%) !important;
            visibility: hidden !important;
            pointer-events: none !important;
          }

          .chat-sidebar.open {
            transform: translateX(0) !important;
            visibility: visible !important;
            pointer-events: auto !important;
          }

          .mobile-header-left-space {
            padding-left: 56px !important;
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
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    }>
      <AiChatContent />
    </Suspense>
  );
}