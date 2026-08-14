"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type VisualPackageItem = {
  id: string;
  judul: string;
  isi_visual: any;
  sumber_naskah_id: string | null;
  created_at: string;
};

type Naskah = {
  id: string;
  judul: string;
  isi_naskah: string | null;
  english_script: string | null;
  status: string;
};

function cleanTitle(text: string) {
  if (!text) return "";
  let cleaned = text;
  cleaned = cleaned.replace(/^visual\s*package\s*[-:]\s*/i, "");
  cleaned = cleaned.replace(/^(naskah|visual|topik|topic)\s*[-:]\s*/i, "");
  cleaned = cleaned.replace(/^naskah\s*[-:]\s*/i, "");
  return cleaned.trim();
}

function parseStringIfJson(str: any): any {
  if (typeof str !== "string") return str;
  const trimmed = str.trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      try {
        const repaired = trimmed.replace(/,\s*([\}\]])/g, "$1");
        return JSON.parse(repaired);
      } catch {}
    }
  }
  return str;
}

function resolveContent(raw: any): any {
  if (!raw) return {};
  if (typeof raw === "string") {
    const parsed = parseStringIfJson(raw);
    if (typeof parsed === "object") return resolveContent(parsed);
    return { summaryText: raw };
  }

  let result = { ...raw };

  for (const key of ["rawOutput", "rawText", "isi_visual", "data"]) {
    if (typeof result[key] === "string") {
      const parsed = parseStringIfJson(result[key]);
      if (typeof parsed === "object" && parsed !== null) {
        result = { ...parsed, ...result };
        delete result[key];
      }
    }
  }

  return result;
}

function resolveScenes(c: any): any[] {
  if (!c || typeof c !== "object") return [];
  if (Array.isArray(c)) return c;

  const knownKeys = ["scenes", "adegan", "storyboard", "items", "data", "scenesList", "sceneList", "shots"];
  for (const k of knownKeys) {
    if (Array.isArray(c[k]) && c[k].length > 0) return c[k];
  }

  for (const key of Object.keys(c)) {
    if (Array.isArray(c[key]) && c[key].length > 0 && typeof c[key][0] === "object") {
      return c[key];
    }
  }

  return [];
}

function VisualContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryNaskahId = searchParams.get("naskahId");
  const queryJudul = searchParams.get("judul");

  const [items, setItems] = useState<VisualPackageItem[]>([]);
  const [naskahList, setNaskahList] = useState<Naskah[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedNaskahId, setSelectedNaskahId] = useState(queryNaskahId || "");
  const [judulNaskah, setJudulNaskah] = useState(queryJudul ? cleanTitle(queryJudul) : "");
  const [isiNaskah, setIsiNaskah] = useState("");
  const [visualStyle, setVisualStyle] = useState("3D Unreal Engine 5");

  const [generating, setGenerating] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [genError, setGenError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // State untuk Tab Prompt aktif per Shot (key: shotIndex, value: 'full' | 'cleanBg' | 'isolated')
  const [activeTabMap, setActiveTabMap] = useState<Record<string, 'full' | 'cleanBg' | 'isolated'>>({});

  async function fetchVisual() {
    setLoading(true);
    try {
      const res = await fetch("/api/visual");
      const json = await res.json();
      if (Array.isArray(json?.data)) setItems(json.data);
    } catch (e) {
      console.error("[VisualUI] Fetch error:", e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchNaskahList() {
    try {
      const res = await fetch("/api/naskah");
      const json = await res.json();
      if (Array.isArray(json?.data)) setNaskahList(json.data);
    } catch (e) {
      console.error("[VisualUI] Naskah list error:", e);
    }
  }

  useEffect(() => {
    fetchVisual();
    fetchNaskahList();
  }, []);

  useEffect(() => {
    if (queryNaskahId && queryJudul) {
      setSelectedNaskahId(queryNaskahId);
      setJudulNaskah(cleanTitle(queryJudul));
    }
  }, [queryNaskahId, queryJudul]);

  function handleSelectNaskah(id: string) {
    setSelectedNaskahId(id);
    const n = Array.isArray(naskahList) ? naskahList.find((x) => x.id === id) : null;
    if (n) {
      setJudulNaskah(cleanTitle(n.judul || ""));
      setIsiNaskah(n.isi_naskah || "");
    }
  }

  async function handleGenerateVisual(e: React.FormEvent) {
    e.preventDefault();
    let textToUse = isiNaskah;
    if (!textToUse && selectedNaskahId && Array.isArray(naskahList)) {
      const n = naskahList.find((x) => x.id === selectedNaskahId);
      if (n) textToUse = n.isi_naskah || "";
    }
    if (!textToUse || !textToUse.trim()) return alert("Isi naskah tidak boleh kosong");

    setGenerating(true);
    setGenError("");
    setProgressMsg("Menjalankan 8-Layer Visual Director Engine...");

    try {
      // 1. Eksekusi Engine Pipeline Multi-Shot (Step 15 Orchestrator)
      const pipelineRes = await fetch("/api/visual/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptText: textToUse,
          confidenceScore: 0.95
        }),
      });

      const pipelineJson = await pipelineRes.json();

      if (!pipelineRes.ok || pipelineJson.error) {
        throw new Error(
          pipelineJson.message || pipelineJson.error || "Gagal memproses visual director engine."
        );
      }

      const generatedScenes = pipelineJson.scenes || [];
      if (!Array.isArray(generatedScenes) || generatedScenes.length === 0) {
        throw new Error("Gagal memecah adegan naskah.");
      }

      setProgressMsg("Menyimpan Visual Storyboard...");

      // 2. Simpan hasil generasi ke database via /api/visual
      const saveRes = await fetch("/api/visual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          judul: cleanTitle(judulNaskah || "Visual Director Storyboard"),
          sumber_naskah_id: selectedNaskahId || null,
          isi_visual: {
            summaryText: textToUse,
            styleTag: visualStyle,
            scenes: generatedScenes
          }
        }),
      });

      const saveJson = await saveRes.json();
      if (saveJson.error) throw new Error(saveJson.error);

      fetchVisual();
      if (saveJson.data?.id) setExpandedId(saveJson.data.id);
    } catch (err: any) {
      setGenError(err.message || "Gagal membuat panduan visual");
    } finally {
      setGenerating(false);
      setProgressMsg("");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Yakin mau hapus visual storyboard ini?")) return;
    await fetch(`/api/visual/${id}`, { method: "DELETE" });
    fetchVisual();
  }

  function handleCopyPrompts(scenes: any[]) {
    if (!Array.isArray(scenes)) return;
    const prompts = scenes
      .map((s, idx) => {
        const fullP = s.prompts?.fullScenePrompt || s.prompt || s.deskripsiVisual;
        const cleanBgP = s.prompts?.cleanBackgroundPrompt;
        const isolatedP = s.prompts?.isolatedCharacterPrompt;

        let block = `--- Shot #${s.scene || idx + 1} (${s.routingDecision || 'GENERATE'}) ---\n`;
        block += `[FULL SCENE]\n${fullP}\n`;
        if (cleanBgP) block += `\n[CLEAN BG EDIT]\n${cleanBgP}\n`;
        if (isolatedP) block += `\n[GREEN SCREEN EDIT]\n${isolatedP}\n`;

        return block;
      })
      .join("\n=========================================\n\n");
    navigator.clipboard.writeText(prompts);
    alert("Semua Triad Prompt disalin!");
  }

  function setShotTab(key: string, tab: 'full' | 'cleanBg' | 'isolated') {
    setActiveTabMap((prev) => ({ ...prev, [key]: tab }));
  }

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: 16 }}>
        <p className="page-subtitle">
          Penyusunan Storyboard & Prompt Visual untuk produksi video (Unreal Engine 5 & Triad Google Flow Prompts).
        </p>
      </div>

      <div className="glass-card-static" style={{ padding: 22, marginBottom: 24 }}>
        <form onSubmit={handleGenerateVisual}>
          <div style={{ marginBottom: 14 }}>
            <label className="form-label">Pilih Script Naskah *</label>
            <select value={selectedNaskahId} onChange={(e) => handleSelectNaskah(e.target.value)} className="select-field">
              <option value="">-- Pilih dari Daftar Naskah --</option>
              {Array.isArray(naskahList) && naskahList.map((n) => (
                <option key={n.id} value={n.id}>
                  {cleanTitle(n.judul)}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label className="form-label">Teks Naskah Acuan Visual</label>
            <textarea
              placeholder="Teks naskah yang akan dibuatkan panduan visualnya..."
              value={isiNaskah}
              onChange={(e) => setIsiNaskah(e.target.value)}
              rows={4}
              className="textarea-field"
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label className="form-label">Gaya Visual</label>
            <select value={visualStyle} onChange={(e) => setVisualStyle(e.target.value)} className="select-field">
              <option value="3D Unreal Engine 5">3D Unreal Engine 5 (9:16 Vertical)</option>
            </select>
          </div>

          <button type="submit" disabled={generating} className="btn btn-primary" style={{ width: "100%" }}>
            {generating ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="spinner" /> {progressMsg || "Memproses Storyboard..."}
              </span>
            ) : (
              <>Generate Storyboard</>
            )}
          </button>
        </form>

        {genError && (
          <div style={{ marginTop: 14, fontSize: 12, color: "var(--status-error)", background: "rgba(248, 113, 113, 0.1)", padding: "10px 14px", borderRadius: "var(--radius-md)" }}>
            {genError}
          </div>
        )}
      </div>

      <div className="section-title">
        Daftar Visual Storyboard ({items.length})
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 80 }} />)}
        </div>
      ) : items.length === 0 ? (
        <div className="glass-card-static" style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--text-tertiary)" }}>
          Belum ada Visual Storyboard tersimpan.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {Array.isArray(items) && items.map((item) => {
            const isExpanded = expandedId === item.id;
            const content = resolveContent(item.isi_visual);
            const scenes = resolveScenes(content);

            return (
              <div key={item.id} id={item.id} className="glass-card-static" style={{ padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px 0", color: "var(--text-primary)" }}>
                      {cleanTitle(item.judul)}
                    </h3>
                    <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span className="badge badge-neutral">{content.styleTag || "3D Unreal Engine 5"}</span>
                      <span className="badge badge-neutral">{scenes.length} Shot Beats</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {scenes.length > 0 && (
                      <button onClick={() => handleCopyPrompts(scenes)} className="btn btn-secondary btn-sm">
                        Salin Prompts
                      </button>
                    )}
                    <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="btn btn-primary btn-sm">
                      {isExpanded ? "Tutup" : "Lihat Storyboard"}
                    </button>
                    <button onClick={() => handleDelete(item.id)} className="btn btn-danger btn-sm">
                      Hapus
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
                    {scenes.length > 0 ? (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
                        {scenes.map((s: any, sIdx: number) => {
                          const num = s.scene || sIdx + 1;
                          const shotKey = `${item.id}-${sIdx}`;
                          const activeTab = activeTabMap[shotKey] || 'full';

                          const prompts = s.prompts || {};
                          const fullP = prompts.fullScenePrompt || s.prompt || s.deskripsiVisual;
                          const cleanBgP = prompts.cleanBackgroundPrompt || "Instruksi background plate tidak tersedia.";
                          const isolatedP = prompts.isolatedCharacterPrompt || "Instruksi isolated green screen tidak tersedia.";

                          const activePromptText =
                            activeTab === 'full'
                              ? fullP
                              : activeTab === 'cleanBg'
                              ? cleanBgP
                              : isolatedP;

                          return (
                            <div
                              key={sIdx}
                              style={{
                                background: "var(--bg-tertiary)",
                                border: "1px solid var(--border-subtle)",
                                borderRadius: "var(--radius-md)",
                                padding: 14,
                                display: "flex",
                                flexDirection: "column",
                                gap: 10,
                              }}
                            >
                              {/* Header Shot & Routing Badge */}
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
                                  Shot #{String(num).padStart(2, "0")}
                                </div>
                                {s.routingDecision && (
                                  <span className="badge badge-neutral" style={{ fontSize: 10 }}>
                                    {s.routingDecision}
                                  </span>
                                )}
                              </div>

                              {/* Kutipan Naskah (Naskah Chunk) */}
                              {s.naskahChunk && (
                                <div style={{ fontSize: 12, color: "var(--text-secondary)", fontStyle: "italic", borderLeft: "2px solid #38bdf8", paddingLeft: 8 }}>
                                  &ldquo;{s.naskahChunk}&rdquo;
                                </div>
                              )}

                              {/* Penjelasan Visual Direksi */}
                              {s.directorNote && (
                                <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                                  <strong style={{ color: "var(--text-secondary)" }}>Catatan Direksi:</strong> {s.directorNote}
                                </div>
                              )}

                              {/* Tab Selector 3 Varian Prompt */}
                              <div style={{ display: "flex", gap: 4, marginTop: 4, background: "var(--bg-secondary)", padding: 3, borderRadius: "var(--radius-sm)" }}>
                                <button
                                  type="button"
                                  onClick={() => setShotTab(shotKey, 'full')}
                                  style={{
                                    flex: 1,
                                    padding: "4px 6px",
                                    fontSize: 10,
                                    fontWeight: 600,
                                    borderRadius: "var(--radius-xs)",
                                    border: "none",
                                    cursor: "pointer",
                                    background: activeTab === 'full' ? "#38bdf8" : "transparent",
                                    color: activeTab === 'full' ? "#000" : "var(--text-secondary)"
                                  }}
                                >
                                  Full Scene
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setShotTab(shotKey, 'cleanBg')}
                                  style={{
                                    flex: 1,
                                    padding: "4px 6px",
                                    fontSize: 10,
                                    fontWeight: 600,
                                    borderRadius: "var(--radius-xs)",
                                    border: "none",
                                    cursor: "pointer",
                                    background: activeTab === 'cleanBg' ? "#38bdf8" : "transparent",
                                    color: activeTab === 'cleanBg' ? "#000" : "var(--text-secondary)"
                                  }}
                                >
                                  Clean BG (Edit)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setShotTab(shotKey, 'isolated')}
                                  style={{
                                    flex: 1,
                                    padding: "4px 6px",
                                    fontSize: 10,
                                    fontWeight: 600,
                                    borderRadius: "var(--radius-xs)",
                                    border: "none",
                                    cursor: "pointer",
                                    background: activeTab === 'isolated' ? "#38bdf8" : "transparent",
                                    color: activeTab === 'isolated' ? "#000" : "var(--text-secondary)"
                                  }}
                                >
                                  Green Screen (Edit)
                                </button>
                              </div>

                              {/* Prompt Display Box */}
                              <div style={{ background: "var(--bg-secondary)", padding: 10, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                                  <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)" }}>
                                    {activeTab === 'full' ? 'MASTER PROMPT' : activeTab === 'cleanBg' ? 'INPAINT CLEAN BG PROMPT' : 'INPAINT GREEN SCREEN PROMPT'}
                                  </span>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(activePromptText || "");
                                      alert(`Prompt Shot #${num} (${activeTab}) disalin!`);
                                    }}
                                    style={{ background: "none", border: "none", color: "#38bdf8", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
                                  >
                                    Salin
                                  </button>
                                </div>
                                <div style={{ fontSize: 11, color: "var(--text-primary)", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                                  {activePromptText}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)", textAlign: "center", padding: 12 }}>
                        Data adegan tidak ditemukan.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function VisualPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    }>
      <VisualContent />
    </Suspense>
  );
}
