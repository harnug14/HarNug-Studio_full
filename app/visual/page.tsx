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

function resolveAssetLibrary(c: any): any[] {
  if (!c || typeof c !== "object") return [];
  if (Array.isArray(c.assetLibrary)) return c.assetLibrary;
  return [];
}

function getBeatBadgeStyle(beatType: string) {
  const type = (beatType || "").toLowerCase();
  if (type.includes("establishing")) return { bg: "rgba(6,182,212,0.15)", border: "rgba(6,182,212,0.4)", color: "#22d3ee" };
  if (type.includes("action")) return { bg: "rgba(34,197,94,0.15)", border: "rgba(34,197,94,0.4)", color: "#4ade80" };
  if (type.includes("reaction")) return { bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.4)", color: "#fbbf24" };
  if (type.includes("detail") || type.includes("insert")) return { bg: "rgba(168,85,247,0.15)", border: "rgba(168,85,247,0.4)", color: "#c084fc" };
  if (type.includes("reveal")) return { bg: "rgba(236,72,153,0.15)", border: "rgba(236,72,153,0.4)", color: "#f472b6" };
  if (type.includes("transition")) return { bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.4)", color: "#f87171" };
  if (type.includes("emphasis") || type.includes("payoff")) return { bg: "rgba(234,179,8,0.15)", border: "rgba(234,179,8,0.4)", color: "#facc15" };
  return { bg: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.15)", color: "var(--text-secondary)" };
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
  const [judulNaskah, setJudulNaskah] = useState(queryJudul || "");
  const [isiNaskah, setIsiNaskah] = useState("");
  const [visualStyle, setVisualStyle] = useState("Sinematik 3D, Unreal Engine 5");
  const [bridgePoseLevel, setBridgePoseLevel] = useState("Seimbang (Key Pose + Transisi Mikro)");

  const [generating, setGenerating] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [genError, setGenError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function fetchVisual() {
    setLoading(true);
    const res = await fetch("/api/visual");
    const json = await res.json();
    if (json.data) setItems(json.data);
    setLoading(false);
  }

  async function fetchNaskahList() {
    try {
      const res = await fetch("/api/naskah");
      const json = await res.json();
      if (json.data) setNaskahList(json.data);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    fetchVisual();
    fetchNaskahList();
  }, []);

  useEffect(() => {
    if (queryNaskahId && queryJudul) {
      setSelectedNaskahId(queryNaskahId);
      setJudulNaskah(queryJudul);
    }
  }, [queryNaskahId, queryJudul]);

  function handleSelectNaskah(id: string) {
    setSelectedNaskahId(id);
    const n = naskahList.find((x) => x.id === id);
    if (n) {
      setJudulNaskah(n.judul);
      setIsiNaskah(n.isi_naskah || "");
    }
  }

  async function handleGenerateVisual(e: React.FormEvent) {
    e.preventDefault();
    let textToUse = isiNaskah;
    if (!textToUse && selectedNaskahId) {
      const n = naskahList.find((x) => x.id === selectedNaskahId);
      if (n) textToUse = n.isi_naskah || "";
    }
    if (!textToUse.trim()) return alert("Isi naskah tidak boleh kosong");

    setGenerating(true);
    setGenError("");
    setProgressMsg("📖 Step 1 & 2: Story World & Visual Beat Planning...");

    try {
      const planRes = await fetch("/api/visual/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "plan",
          naskahId: selectedNaskahId || null,
          judulNaskah,
          isiNaskah: textToUse,
          visualStyle,
          bridgePoseLevel,
        }),
      });

      const planJson = await planRes.json();
      if (planJson.error) throw new Error(planJson.error);

      const { storyUnderstanding, scenes: plannedScenes } = planJson.data || {};
      if (!plannedScenes || plannedScenes.length === 0) {
        throw new Error("Gagal memecah adegan naskah.");
      }

      const directedScenes: any[] = [];
      const globalAssetLibrary: any[] = [];
      const INTER_SCENE_DELAY_MS = 1000;
      const MAX_SCENE_RETRIES = 2;

      for (let i = 0; i < plannedScenes.length; i++) {
        const sceneItem = plannedScenes[i];

        if (i > 0) {
          await new Promise((r) => setTimeout(r, INTER_SCENE_DELAY_MS));
        }

        setProgressMsg(`🎬 Step 3-6: Directorial Intent -> Production Resources -> Prompt Composer V3 Shot #${i + 1} dari ${plannedScenes.length}...`);

        for (let attempt = 0; attempt <= MAX_SCENE_RETRIES; attempt++) {
          try {
            const sceneRes = await fetch("/api/visual/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "direct-scene",
                storyUnderstanding,
                sceneItem,
                visualStyle,
                bridgePoseLevel,
                existingAssetLibrary: globalAssetLibrary,
              }),
            });
            const sceneJson = await sceneRes.json();
            if (sceneJson.error) throw new Error(sceneJson.error);
            if (sceneJson.data) {
              const sd = sceneJson.data;
              directedScenes.push(sd);

              const ad = sd.assetDecision || {};
              if (ad.createdAsset && ad.createdAsset.assetId) {
                if (!globalAssetLibrary.some((a) => a.assetId === ad.createdAsset.assetId)) {
                  globalAssetLibrary.push({
                    assetId: ad.createdAsset.assetId,
                    assetName: ad.createdAsset.assetName,
                    assetType: ad.createdAsset.assetType,
                    createdFromScene: sd.scene,
                  });
                }
              }
              break;
            }
          } catch (sceneErr: any) {
            if (attempt >= MAX_SCENE_RETRIES) {
              directedScenes.push(sceneItem);
            }
          }
        }
      }

      setProgressMsg("💾 Menyimpan Storyboard & Global Asset Library...");

      const saveRes = await fetch("/api/visual/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          naskahId: selectedNaskahId || null,
          judulNaskah,
          visualStyle,
          bridgePoseLevel,
          storyUnderstanding,
          scenes: directedScenes,
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
    if (!scenes || !Array.isArray(scenes)) return;
    const prompts = scenes
      .map((s, idx) => {
        const ad = s.assetDecision || {};
        const p = s.promptCompiler?.compiledPrompt || s.prompt || s.deskripsiVisual;
        if (ad.assetStatus === "REUSED") {
          return `--- Shot #${s.scene || idx + 1} [${s.visualBeatType || "Beat"}] (REUSED: ${ad.targetAssetId || "Aset Lama"}) ---\nInstruksi Kamera: ${ad.productionInstruction || "Gunakan pergerakan kamera CapCut"}`;
        }
        return `--- Shot #${s.scene || idx + 1} [${s.visualBeatType || "Beat"}] (${ad.assetStatus || "NEW"}) ---\n${p}`;
      })
      .join("\n\n=========================================\n\n");
    navigator.clipboard.writeText(prompts);
    alert("Semua Prompt Composer V3 disalin ke clipboard!");
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header" style={{ marginBottom: 24 }}>
        <h1 className="page-title">Visual Director Engine V4 🎬</h1>
        <p className="page-subtitle">
          Architecture Freeze v1.0 — Decoupled Modular Pipeline (DDD Architecture).
        </p>
      </div>

      <div className="glass-card-static" style={{ padding: 24, marginBottom: 32 }}>
        <form onSubmit={handleGenerateVisual}>
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">Pilih Script Naskah *</label>
            <select value={selectedNaskahId} onChange={(e) => handleSelectNaskah(e.target.value)} className="select-field">
              <option value="">-- Pilih dari Daftar Naskah --</option>
              {naskahList.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.judul}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="form-label">Teks Naskah Acuan Visual</label>
            <textarea
              placeholder="Teks naskah yang akan disusun panduan visualnya..."
              value={isiNaskah}
              onChange={(e) => setIsiNaskah(e.target.value)}
              rows={4}
              className="textarea-field"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 20 }}>
            <div>
              <label className="form-label">Tingkat Transisi Pose Mikro</label>
              <select value={bridgePoseLevel} onChange={(e) => setBridgePoseLevel(e.target.value)} className="select-field">
                <option value="Key Poses Only">Key Pose Utuh Saja</option>
                <option value="Balanced (Key Pose + Bridge Pose Transisi)">Seimbang (Key Pose + Transisi Mikro)</option>
                <option value="High Motion (Detail Transisi Ekstra)">Gerakan Tinggi (Ekstra Transisi)</option>
              </select>
            </div>
            <div>
              <label className="form-label">Gaya Visual</label>
              <select value={visualStyle} onChange={(e) => setVisualStyle(e.target.value)} className="select-field">
                <option value="3D Game AAA, Unreal Engine 5 Cinematic">Sinematik 3D, Unreal Engine 5</option>
                <option value="Stylized Realistic 3D, PBR Material">Realistis 3D PBR</option>
                <option value="Cyberpunk 3D Cinematic, Octane Render">Cyberpunk 3D Sinematik</option>
                <option value="Anime Stylized 3D, Shaded UE5">Anime 3D Stylized</option>
              </select>
            </div>
          </div>

          <button type="submit" disabled={generating} className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
            {generating ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="spinner" /> {progressMsg || "Memproses Storyboard..."}
              </span>
            ) : (
              <>🎬 Buat Storyboard (Visual Director Pipeline V4)</>
            )}
          </button>
        </form>

        {genError && (
          <div
            style={{
              marginTop: 16,
              padding: "14px 18px",
              borderRadius: "var(--radius-md)",
              background: "rgba(239,68,68,0.15)",
              border: "1px solid var(--status-error)",
              color: "#f87171",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ⚠️ {genError}
          </div>
        )}
      </div>

      <div className="section-title">Daftar Visual Storyboard Tersimpan ({items.length})</div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 100 }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🎬</div>
          <div className="empty-state-text">Belum ada Visual Storyboard tersimpan.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {items.map((item) => {
            const isExpanded = expandedId === item.id;
            const content = resolveContent(item.isi_visual);
            const scenes = resolveScenes(content);
            const assetLib = resolveAssetLibrary(content);
            const hasScenes = scenes.length > 0;

            return (
              <div key={item.id} className="glass-card-static" style={{ padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>{item.judul}</h3>
                    <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span className="badge badge-accent">{content.styleTag || "Sinematik 3D"}</span>
                      <span className="badge badge-neutral">{scenes.length} Shot Beats</span>
                      {assetLib.length > 0 && <span className="badge badge-primary">{assetLib.length} Asset Library</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {hasScenes && (
                      <button onClick={() => handleCopyPrompts(scenes)} className="btn btn-ghost btn-sm" style={{ color: "var(--accent-primary)" }}>
                        📋 Salin Semua Prompt
                      </button>
                    )}
                    <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="btn btn-primary btn-sm">
                      {isExpanded ? "Tutup" : "🎬 Lihat Storyboard"}
                    </button>
                    <button onClick={() => handleDelete(item.id)} className="btn btn-danger btn-sm">
                      Hapus
                    </button>
                  </div>
                </div>

                {/* UI STORYBOARD SINEMATIK V4 ARCHITECTURE FREEZE V1.0 */}
                {isExpanded && (
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    {hasScenes ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
                          {scenes.map((s: any, sIdx: number) => {
                            const num = s.scene || sIdx + 1;
                            const ad = s.assetDecision || {};
                            const spec = s.sceneSpecification || {};
                            const beatType = spec.beat || s.visualBeatType || "Beat";
                            const beatBadge = getBeatBadgeStyle(beatType);
                            const status = ad.assetStatus || "NEW";
                            const pc = s.promptCompiler || {};
                            const prompt = pc.compiledPrompt || s.prompt;

                            let assetBadgeStyle = { bg: "rgba(34,197,94,0.15)", border: "rgba(34,197,94,0.4)", text: "#4ade80", label: "NEW ASSET" };
                            if (status === "REUSED") {
                              assetBadgeStyle = { bg: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.4)", text: "#60a5fa", label: `REUSED (${ad.targetAssetId || "Aset"})` };
                            } else if (status === "POSE_SWAP") {
                              assetBadgeStyle = { bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.4)", text: "#fbbf24", label: `POSE SWAP (${ad.targetAssetId || "Aset"})` };
                            }

                            return (
                              <div
                                key={sIdx}
                                style={{
                                  background: "rgba(0,0,0,0.3)",
                                  border: "1px solid rgba(255,255,255,0.08)",
                                  borderRadius: "var(--radius-md)",
                                  padding: 16,
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: 10,
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ fontWeight: 700, fontSize: 15, color: "var(--accent-primary)" }}>Shot #{num}</span>
                                    <span
                                      style={{
                                        fontSize: 11,
                                        fontWeight: 600,
                                        padding: "2px 8px",
                                        borderRadius: 4,
                                        background: beatBadge.bg,
                                        border: `1px solid ${beatBadge.border}`,
                                        color: beatBadge.color,
                                      }}
                                    >
                                      {beatType}
                                    </span>
                                  </div>
                                  <span
                                    style={{
                                      fontSize: 11,
                                      fontWeight: 700,
                                      padding: "3px 8px",
                                      borderRadius: 4,
                                      background: assetBadgeStyle.bg,
                                      border: `1px solid ${assetBadgeStyle.border}`,
                                      color: assetBadgeStyle.text,
                                    }}
                                  >
                                    {assetBadgeStyle.label}
                                  </span>
                                </div>

                                {s.primaryVisualFocus && (
                                  <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", background: "rgba(255,255,255,0.04)", padding: "6px 10px", borderRadius: 4 }}>
                                    🎯 Fokus Visual: {s.primaryVisualFocus}
                                  </div>
                                )}

                                {s.naskahChunk && (
                                  <div
                                    style={{
                                      fontSize: 12,
                                      color: "var(--text-secondary)",
                                      fontStyle: "italic",
                                      borderLeft: "2px solid var(--accent-primary)",
                                      paddingLeft: 8,
                                      lineHeight: 1.4,
                                    }}
                                  >
                                    &ldquo;{s.naskahChunk}&rdquo;
                                  </div>
                                )}

                                {status === "REUSED" ? (
                                  <div style={{ background: "rgba(59,130,246,0.1)", padding: 12, borderRadius: 6, border: "1px solid rgba(59,130,246,0.3)", marginTop: 4 }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", marginBottom: 4 }}>
                                      🎬 INSTRUKSI PRODUKSI / RE-FRAMING (TANPA GENERATE PROMPT BARU)
                                    </div>
                                    <div style={{ fontSize: 12, color: "#e0f2fe", lineHeight: 1.5 }}>
                                      {ad.productionInstruction || "Manfaatkan pergerakan kamera CapCut (Pan/Tilt/Zoom) dari aset sebelumnya."}
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{ background: "rgba(0,0,0,0.4)", padding: 12, borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)", marginTop: 4 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-primary)" }}>
                                        PROMPT COMPOSER V3 (VISUAL INSTRUCTION)
                                      </span>
                                      <button
                                        onClick={() => {
                                          navigator.clipboard.writeText(prompt || "");
                                          alert(`Prompt Shot #${num} disalin!`);
                                        }}
                                        style={{ background: "none", border: "none", color: "var(--accent-primary)", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
                                      >
                                        📋 Salin
                                      </button>
                                    </div>
                                    <div style={{ fontSize: 12, color: "#e5e7eb", lineHeight: 1.5, whiteSpace: "pre-wrap", fontFamily: "monospace" }}>{prompt}</div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* PANEL ASSET LIBRARY */}
                        {assetLib.length > 0 && (
                          <div style={{ marginTop: 16, background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "var(--radius-md)", padding: 16 }}>
                            <h4 style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-primary)", marginBottom: 12 }}>
                              📦 GLOBAL ASSET LIBRARY ({assetLib.length} Aset Terdaftar)
                            </h4>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                              {assetLib.map((ast: any, aIdx: number) => (
                                <div key={aIdx} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", padding: 10, borderRadius: 6 }}>
                                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>
                                    {ast.assetId}: {ast.assetName}
                                  </div>
                                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                                    Tipe: {ast.assetType} | Dibuat di Shot #{ast.createdFromScene}
                                  </div>
                                  {ast.usedInScenes && ast.usedInScenes.length > 0 && (
                                    <div style={{ fontSize: 10, color: "var(--accent-primary)", marginTop: 4 }}>
                                      Dipakai di Shot: #{ast.usedInScenes.join(", #")}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ padding: 16, fontSize: 13, color: "var(--text-secondary)", textAlign: "center" }}>
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
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#050505" }}>
          <div className="spinner" style={{ width: 28, height: 28 }} />
        </div>
      }
    >
      <VisualContent />
    </Suspense>
  );
}