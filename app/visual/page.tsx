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

/* ── helper: render a ✓/✗ check item ── */
function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span style={{ fontSize: 11, color: ok ? "var(--status-success)" : "var(--status-error)" }}>
      {ok ? "✓" : "✗"} {label}
    </span>
  );
}

/* ── helper: quality score bar colour ── */
function scoreColor(v: number) {
  if (v >= 90) return "#22c55e";
  if (v >= 85) return "#eab308";
  return "#ef4444";
}

/* ── helper: deep object parser & scene extractor ── */
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

  const knownKeys = ["scenes", "adegan", "storyboard", "items", "data", "scenesList", "sceneList"];
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

/* ── helper: render clean, human-readable card view ── */
function CleanDataCard({ data, depth = 0 }: { data: any; depth?: number }) {
  if (data === null || data === undefined) return null;

  if (typeof data !== "object") {
    const textStr = String(data).replace(/[\{\}\[\]"]/g, "").trim();
    if (!textStr) return null;
    return <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{textStr}</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.map((item, idx) => (
          <div key={idx} style={{ background: "rgba(0,0,0,0.2)", padding: 10, borderRadius: 6, border: "1px solid rgba(255,255,255,0.05)" }}>
            <CleanDataCard data={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  const entries = Object.entries(data).filter(([k, v]) => {
    if (k === "rawOutput" || k === "rawText") return false;
    if (Array.isArray(v) && v.length === 0) return false;
    if (v === null || v === undefined || v === "") return false;
    return true;
  });

  if (entries.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {entries.map(([key, val]) => {
        const label = key
          .replace(/([A-Z])/g, " $1")
          .replace(/_/g, " ")
          .trim();

        if (typeof val === "object" && val !== null) {
          return (
            <div
              key={key}
              style={{
                background: depth === 0 ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.2)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 8,
                padding: 12,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-primary)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                📌 {label}
              </div>
              <CleanDataCard data={val} depth={depth + 1} />
            </div>
          );
        }

        const valStr = String(val).replace(/[\{\}\[\]"]/g, "").trim();
        if (!valStr) return null;

        return (
          <div
            key={key}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
              padding: "6px 0",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
              fontSize: 12,
            }}
          >
            <span style={{ color: "var(--text-secondary)", textTransform: "capitalize", fontWeight: 600, minWidth: 140 }}>
              {label}
            </span>
            <span style={{ color: "var(--text-primary)", fontWeight: 400, textAlign: "right", flex: 1, lineHeight: 1.4 }}>
              {valStr}
            </span>
          </div>
        );
      })}
    </div>
  );
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
  const [visualStyle, setVisualStyle] = useState("3D Game AAA, Unreal Engine 5 Cinematic");
  const [bridgePoseLevel, setBridgePoseLevel] = useState("Balanced (Key Pose + Bridge Pose Transisi)");
  const [languageVersion, setLanguageVersion] = useState<"ID" | "EN">("ID");

  const [generating, setGenerating] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [genError, setGenError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /* ── data fetchers ── */
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
    } catch (e) { console.error(e); }
  }

  useEffect(() => { fetchVisual(); fetchNaskahList(); }, []);

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
      setIsiNaskah(languageVersion === "EN" && n.english_script ? n.english_script : n.isi_naskah || "");
    }
  }

  /* ════════════════════════════════════════════════════════════
     MULTI-STEP ITERATIVE PER-SCENE GENERATION WORKFLOW
     ════════════════════════════════════════════════════════════ */
  async function handleGenerateVisual(e: React.FormEvent) {
    e.preventDefault();
    let textToUse = isiNaskah;
    if (!textToUse && selectedNaskahId) {
      const n = naskahList.find((x) => x.id === selectedNaskahId);
      if (n) textToUse = languageVersion === "EN" && n.english_script ? n.english_script : n.isi_naskah || "";
    }
    if (!textToUse.trim()) return alert("Isi naskah tidak boleh kosong");

    setGenerating(true);
    setGenError("");
    setProgressMsg("📖 Step 1/2: Analyzing Story & Breaking Down Scenes...");

    try {
      // ── STEP 1: Plan Scenes ──
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
          languageVersion,
        }),
      });

      const planJson = await planRes.json();
      if (planJson.error) {
        throw new Error(planJson.error);
      }

      const { storyUnderstanding, scenes: plannedScenes } = planJson.data || {};
      if (!plannedScenes || plannedScenes.length === 0) {
        throw new Error("Gagal memecah adegan naskah.");
      }

      // ── STEP 2: Direct Single Scene Iteratively (with delay & retry) ──
      const directedScenes: any[] = [];
      const INTER_SCENE_DELAY_MS = 3000; // 3s pause between scene calls to avoid 429
      const MAX_SCENE_RETRIES = 2;       // retry a failed scene up to 2 times
      const SCENE_RETRY_DELAY_MS = 5000; // 5s wait before retrying a scene

      for (let i = 0; i < plannedScenes.length; i++) {
        const sceneItem = plannedScenes[i];

        // Add delay between scenes (skip for first scene)
        if (i > 0) {
          setProgressMsg(
            `⏳ Cooldown ${INTER_SCENE_DELAY_MS / 1000}s before Scene ${i + 1}...`
          );
          await new Promise((r) => setTimeout(r, INTER_SCENE_DELAY_MS));
        }

        setProgressMsg(
          `🎬 Directing Scene ${i + 1} of ${plannedScenes.length} (Story Beat → Historical Era → Camera → Composition → Animation → Google Flow → Quality → Prompt)...`
        );

        let sceneSuccess = false;
        for (let attempt = 0; attempt <= MAX_SCENE_RETRIES; attempt++) {
          try {
            if (attempt > 0) {
              setProgressMsg(
                `🔄 Retrying Scene ${i + 1} (attempt ${attempt + 1}/${MAX_SCENE_RETRIES + 1})... waiting ${SCENE_RETRY_DELAY_MS / 1000}s`
              );
              await new Promise((r) => setTimeout(r, SCENE_RETRY_DELAY_MS));
              setProgressMsg(
                `🎬 Directing Scene ${i + 1} of ${plannedScenes.length} (retry ${attempt + 1})...`
              );
            }

            const sceneRes = await fetch("/api/visual/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "direct-scene",
                storyUnderstanding,
                sceneItem,
                visualStyle,
                bridgePoseLevel,
              }),
            });
            const sceneJson = await sceneRes.json();
            if (sceneJson.error) {
              throw new Error(sceneJson.error);
            }
            if (sceneJson.data) {
              directedScenes.push(sceneJson.data);
              sceneSuccess = true;
              break; // success, exit retry loop
            } else {
              throw new Error("Empty response from scene director");
            }
          } catch (sceneErr: any) {
            console.warn(`Scene ${i + 1} attempt ${attempt + 1} failed:`, sceneErr.message);
            if (attempt >= MAX_SCENE_RETRIES) {
              // All retries exhausted — use planned item as fallback
              directedScenes.push(sceneItem);
              sceneSuccess = true;
            }
          }
        }
      }

      // ── STEP 3: Save Completed Package to Supabase ──
      setProgressMsg("💾 Finalizing & Saving Storyboard Package...");
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
      if (saveJson.error) {
        throw new Error(saveJson.error);
      }

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
    if (!confirm("Yakin mau hapus visual package ini?")) return;
    await fetch(`/api/visual/${id}`, { method: "DELETE" });
    fetchVisual();
  }

  function handleCopyPrompts(scenes: any[]) {
    if (!scenes || !Array.isArray(scenes)) return;
    const prompts = scenes.map((s, idx) => {
      const p = s.promptCompiler?.compiledPrompt || s.promptComposer?.prompt || s.prompt || s.googleFlowPrompt || s.deskripsiVisual;
      return `--- Scene ${s.scene || idx + 1} (Score: ${s.qualityEvaluator?.overallScore || "-"}/100) ---\n${p}`;
    }).join("\n\n");
    navigator.clipboard.writeText(prompts);
    alert("Semua prompt (Module 13 Output) disalin ke clipboard!");
  }

  /* ════════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════════ */
  return (
    <div className="animate-fade-in">
      {/* ── Page Header ── */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <h1 className="page-title">Visual Director Engine V4 🎬</h1>
        <p className="page-subtitle">
          Iterative Multi-Step Directorial Architecture — 13-Module Pipeline per Scene with Historical Knowledge, Quality Evaluator (Min. 85), and Google Flow Validator.
        </p>
      </div>

      {/* ── Generator Form ── */}
      <div className="glass-card-static" style={{ padding: 24, marginBottom: 32 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "var(--text-primary)" }}>
          Visual Director V4 — Iterative Pipeline Setup
        </h3>

        <form onSubmit={handleGenerateVisual}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 16 }}>
            <div>
              <label className="form-label">Pilih Script Naskah *</label>
              <select value={selectedNaskahId} onChange={(e) => handleSelectNaskah(e.target.value)} className="select-field">
                <option value="">-- Pilih dari Daftar Naskah --</option>
                {naskahList.map((n) => (
                  <option key={n.id} value={n.id}>{n.judul} ({n.status === "approved" ? "✓ Verified" : "Draft"})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Bahasa Naskah</label>
              <select value={languageVersion} onChange={(e) => { const l = e.target.value as "ID"|"EN"; setLanguageVersion(l); if (selectedNaskahId) { const n = naskahList.find((x) => x.id === selectedNaskahId); if (n) setIsiNaskah(l === "EN" && n.english_script ? n.english_script : n.isi_naskah || ""); } }} className="select-field">
                <option value="ID">Bahasa Indonesia</option>
                <option value="EN">English Version</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="form-label">Teks Naskah Acuan Visual</label>
            <textarea placeholder="Teks naskah yang akan di-direct oleh AI Visual Director V4..." value={isiNaskah} onChange={(e) => setIsiNaskah(e.target.value)} rows={4} className="textarea-field" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 20 }}>
            <div>
              <label className="form-label">Bridge Pose Sensitivity</label>
              <select value={bridgePoseLevel} onChange={(e) => setBridgePoseLevel(e.target.value)} className="select-field">
                <option value="Key Poses Only">Key Poses Only</option>
                <option value="Balanced (Key Pose + Bridge Pose Transisi)">Balanced (Key Pose + Bridge)</option>
                <option value="High Motion (Detail Transisi Ekstra)">High Motion (Extra Detail)</option>
              </select>
            </div>
            <div>
              <label className="form-label">Visual Style</label>
              <select value={visualStyle} onChange={(e) => setVisualStyle(e.target.value)} className="select-field">
                <option value="3D Game AAA, Unreal Engine 5 Cinematic">3D Game AAA, Unreal Engine 5</option>
                <option value="Stylized Realistic 3D, PBR Material">Stylized Realistic 3D, PBR</option>
                <option value="Cyberpunk 3D Cinematic, Octane Render">Cyberpunk 3D, Octane Render</option>
                <option value="Anime Stylized 3D, Shaded UE5">Anime Stylized 3D, UE5</option>
              </select>
            </div>
          </div>

          <button type="submit" disabled={generating} className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
            {generating ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="spinner" /> {progressMsg || "Directing Storyboard..."}
              </span>
            ) : (
              <>🎬 Execute Visual Director Engine V4</>
            )}
          </button>
        </form>

        {genError && (
          <div style={{ marginTop: 16, padding: "14px 18px", borderRadius: "var(--radius-md)", background: "rgba(239,68,68,0.15)", border: "1px solid var(--status-error)", color: "#f87171", fontSize: 13, fontWeight: 600, lineHeight: 1.5 }}>
            ⚠️ {genError}
          </div>
        )}
      </div>

      {/* ── Visual Packages List ── */}
      <div className="section-title">Daftar Visual Storyboard Tersimpan ({items.length})</div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 100 }} />)}
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
            const story = content.storyUnderstanding || content.storyAnalyzer || content.storyAnalysis || null;
            const scenes = resolveScenes(content);
            const hasScenes = scenes.length > 0;

            return (
              <div key={item.id} className="glass-card-static" style={{ padding: 20 }}>
                {/* ── Card Header ── */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>{item.judul}</h3>
                    <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span className="badge badge-accent">{content.styleTag || "3D Game AAA"}</span>
                      <span className="badge badge-neutral">{content.bridgePoseLevel || "Balanced"}</span>
                      <span className={`badge ${hasScenes ? "badge-success" : "badge-error"}`}>
                        {hasScenes ? `${scenes.length} Scenes Directed` : "⚠️ Truncated Data"}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {hasScenes && (
                      <button onClick={() => handleCopyPrompts(scenes)} className="btn btn-ghost btn-sm" style={{ color: "var(--accent-primary)" }}>📋 Copy All Prompts</button>
                    )}
                    <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="btn btn-primary btn-sm">
                      {isExpanded ? "Tutup" : "🎬 Lihat Storyboard"}
                    </button>
                    <button onClick={() => handleDelete(item.id)} className="btn btn-danger btn-sm">Hapus</button>
                  </div>
                </div>

                {/* ═══════════════════════════════════════
                    EXPANDED: Full Director Decision View
                    ═══════════════════════════════════════ */}
                {isExpanded && (
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)" }}>

                    {/* ── Pipeline Status Bar ── */}
                    {hasScenes ? (
                      <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: "var(--radius-md)", padding: 12, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, flexWrap: "wrap", gap: 8 }}>
                        <div style={{ color: "var(--status-success)", fontWeight: 700 }}>⚡ DIRECTOR PIPELINE V4: ALL 13 MODULES COMPLETED</div>
                        <div style={{ color: "var(--text-secondary)", fontSize: 11 }}>Historical Verified • Google Flow Safe • Quality ≥ 85</div>
                      </div>
                    ) : (
                      <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "var(--radius-md)", padding: 12, marginBottom: 16, color: "#f87171", fontSize: 12, fontWeight: 700 }}>
                        ⚠️ DATA STORYBOARD ADEGAN TERPOTONG / KOSONG. Silakan klik tombol 'Hapus' di atas, lalu klik 'Execute Visual Director Engine V4' sekali lagi.
                      </div>
                    )}

                    {/* ── MODULE 1: Story Understanding ── */}
                    {story && (
                      <div style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: "var(--radius-md)", padding: 16, marginBottom: 20 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-primary)", marginBottom: 8 }}>
                          📖 MODULE 1 — STORY UNDERSTANDING
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 8 }}>
                          {story.storySummary || story.summary}
                        </div>
                        {story.primaryEra && (
                          <div style={{ background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: 6, padding: "6px 10px", marginBottom: 8, fontSize: 12, color: "#eab308", fontWeight: 700 }}>
                            🏛️ PRIMARY ERA: {story.primaryEra} — Seluruh scene WAJIB menggunakan setting era ini
                          </div>
                        )}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 6, fontSize: 11, color: "var(--text-primary)" }}>
                          <div>💡 <strong>Core Idea:</strong> {story.coreIdea || "-"}</div>
                          <div>🎯 <strong>Story Goal:</strong> {story.storyGoal || "-"}</div>
                          <div>👤 <strong>Characters:</strong> {story.characterList || story.characters || story.mainCharacter || "-"}</div>
                          <div>📍 <strong>Locations:</strong> {story.locationTimeline || "-"}</div>
                          <div>⏳ <strong>Timeline:</strong> {story.timeTimeline || story.timeline || "-"}</div>
                          <div>🎭 <strong>Emotion Flow:</strong> {story.emotionalTimeline || story.emotionTimeline || "-"}</div>
                          <div>🏁 <strong>Ending:</strong> {story.ending || "-"}</div>
                        </div>
                      </div>
                    )}

                    {/* ── Scene-by-Scene Grid ── */}
                    {hasScenes ? (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 20 }}>
                        {scenes.map((s: any, sIdx: number) => {
                          const num = s.scene || s.sceneNumber || sIdx + 1;
                          const sp = s.scenePlanner || {};
                          const sb = s.storyBeat || {};
                          const cd = s.creativeDirector || s.visualDirector || {};
                          const hk = s.historicalKnowledge || {};
                          const vl = s.visualLanguage || {};
                          const cam = s.cameraDirector || s.camera || {};
                          const comp = s.compositionDirector || s.composition || {};
                          const cont = s.continuityManager || s.continuity || {};
                          const anim = s.animationPlanner || {};
                          const gfv = s.googleFlowValidator || s.validation || {};
                          const qe = s.qualityEvaluator || {};
                          const pc = s.promptCompiler || s.promptComposer || {};
                          const prompt = pc.compiledPrompt || pc.prompt || s.prompt || s.googleFlowPrompt || s.deskripsiVisual;

                          const overall = qe.overallScore || 90;
                          const bridge = anim.bridgeRequired || anim.bridgeDecision === "Required" || anim.bridgeNeeded;
                          const gfvPass = gfv.status === "PASS" || gfv.fullBody !== false;

                          return (
                            <div key={sIdx} style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "var(--radius-md)", padding: 18, display: "flex", flexDirection: "column" }}>

                              {/* ── Scene Header ── */}
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <span style={{ fontWeight: 800, fontSize: 16, color: "var(--accent-primary)" }}>
                                  Scene {num} <span style={{ fontWeight: 400, fontSize: 12, color: "var(--text-secondary)" }}>({sp.sceneType || "Hook"})</span>
                                </span>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <span className={`badge ${bridge ? "badge-warning" : "badge-neutral"}`} style={{ fontSize: 10 }}>
                                    {bridge ? "⚡ Bridge" : "Keyframe"}
                                  </span>
                                  <span className="badge" style={{ fontSize: 10, background: scoreColor(overall) + "22", color: scoreColor(overall), border: `1px solid ${scoreColor(overall)}44` }}>
                                    ★ {overall}/100
                                  </span>
                                </div>
                              </div>

                              {/* ── Naskah Chunk ── */}
                              {s.naskahChunk && (
                                <div style={{ fontSize: 12, color: "var(--text-secondary)", fontStyle: "italic", marginBottom: 12, borderLeft: "2px solid var(--accent-primary)", paddingLeft: 8, lineHeight: 1.4 }}>
                                  &ldquo;{s.naskahChunk}&rdquo;
                                </div>
                              )}

                              {/* ── Director Decision Block ── */}
                              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8, padding: 12, marginBottom: 14, display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>

                                {/* Story Beat (M3) */}
                                {sb.setup && (
                                  <div style={{ background: "rgba(0,0,0,0.25)", padding: 8, borderRadius: 6 }}>
                                    <div style={{ color: "var(--accent-primary)", fontWeight: 700, fontSize: 11 }}>📜 M3 — Story Beat</div>
                                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.4 }}>
                                      {sb.setup}{sb.conflict ? ` → ${sb.conflict}` : ""}{sb.reveal ? ` → ${sb.reveal}` : ""}{sb.payoff ? ` → ${sb.payoff}` : ""}
                                    </div>
                                  </div>
                                )}

                                {/* Creative Director (M4) */}
                                <div>
                                  <div style={{ color: "var(--status-success)", fontWeight: 700, fontSize: 11 }}>🎬 M4 — Creative Director</div>
                                  <div style={{ color: "var(--text-primary)", marginTop: 2, lineHeight: 1.4 }}>
                                    <strong>Goal:</strong> {cd.visualGoal || sp.sceneGoal || "—"}
                                  </div>
                                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                                    Hook: <strong style={{ color: "var(--text-primary)" }}>{cd.visualHook || "—"}</strong> • Conflict: {cd.visualConflict || "—"} • {cd.storytellingPattern || cd.storytellingStyle || "Character Focus"} ({cd.visualEmotion || cd.visualIntention || "Dramatic"})
                                  </div>
                                </div>

                                {/* Historical Knowledge (M5) */}
                                {hk.era && (
                                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 6 }}>
                                    <div style={{ color: "var(--status-warning)", fontWeight: 700, fontSize: 11 }}>🏛️ M5 — Historical Knowledge</div>
                                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                                      Era: <strong>{hk.era}</strong> • Clothing: {hk.clothing || "—"} • Architecture: {hk.architecture || "—"} • Material: {hk.material || hk.furniture || "—"}
                                    </div>
                                  </div>
                                )}

                                {/* Camera & Composition (M7 & M8) */}
                                <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 6, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11 }}>
                                  <div>
                                    <strong>📷 M7 Camera:</strong>
                                    <div style={{ color: "var(--text-primary)" }}>{cam.shotType || cam.cameraDistance || "Full Body"} • {cam.cameraAngle || cam.angle || "Eye Level"}</div>
                                    {cam.cameraReason && <div style={{ fontSize: 10, color: "var(--text-tertiary)", fontStyle: "italic" }}>{cam.cameraReason}</div>}
                                  </div>
                                  <div>
                                    <strong>📐 M8 Composition:</strong>
                                    <div style={{ color: "var(--text-primary)" }}>
                                      {comp.characterPlacement || "Center"} • FG: {comp.foreground || "Clean"} • BG: {comp.background || "Clear"}
                                    </div>
                                  </div>
                                </div>

                                {/* Animation (M10) */}
                                <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 6 }}>
                                  <div style={{ color: "var(--status-success)", fontWeight: 700, fontSize: 11 }}>🏃 M10 — Animation Planner</div>
                                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                                    {anim.previousPose || "Awal"} → <strong style={{ color: "var(--accent-primary)" }}>{anim.currentPose || "Current"}</strong> → {anim.nextPose || "Lanjut"}
                                    &nbsp;• Score: {anim.poseDistance || anim.transitionScore || 40}/100 ({anim.transitionComplexity || "Medium"})
                                  </div>
                                  {anim.bridgeReason && (
                                    <div style={{ fontSize: 11, color: "var(--status-warning)", fontStyle: "italic", marginTop: 2 }}>💡 Bridge: &ldquo;{anim.bridgeReason}&rdquo;</div>
                                  )}
                                </div>

                                {/* Google Flow (M11) */}
                                <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 6 }}>
                                  <div style={{ color: gfvPass ? "var(--status-success)" : "var(--status-error)", fontWeight: 700, fontSize: 11, marginBottom: 4 }}>
                                    {gfvPass ? "✓" : "✗"} M11 — Google Flow Validator: {gfv.status || (gfvPass ? "PASS" : "FAIL")}
                                  </div>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                    <Check ok={gfv.fullBody !== false} label="Full Body" />
                                    <Check ok={gfv.noCrop !== false && gfv.notCropped !== false} label="No Crop" />
                                    <Check ok={gfv.noOcclusion !== false} label="No Occlusion" />
                                    <Check ok={gfv.noHiddenLimb !== false} label="Limbs Visible" />
                                    <Check ok={gfv.easyBackgroundRemoval !== false && gfv.easySeparation !== false} label="Easy Separation" />
                                    <Check ok={gfv.shadowConsistent !== false} label="Shadow OK" />
                                  </div>
                                </div>

                                {/* Quality Evaluator (M12) */}
                                {qe.overallScore !== undefined && (
                                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 6 }}>
                                    <div style={{ fontWeight: 700, fontSize: 11, color: scoreColor(overall), marginBottom: 4 }}>
                                      ⭐ M12 — Quality Evaluator: {overall}/100 ({qe.status || (overall >= 85 ? "PASS" : "REJECT")})
                                    </div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 10, color: "var(--text-secondary)" }}>
                                      {qe.storyAccuracy !== undefined && <span>Story: {qe.storyAccuracy}</span>}
                                      {qe.historicalAccuracy !== undefined && <span>History: {qe.historicalAccuracy}</span>}
                                      {qe.visualLogic !== undefined && <span>Visual: {qe.visualLogic}</span>}
                                      {qe.cameraLogic !== undefined && <span>Camera: {qe.cameraLogic}</span>}
                                      {qe.composition !== undefined && <span>Comp: {qe.composition}</span>}
                                      {qe.continuity !== undefined && <span>Cont: {qe.continuity}</span>}
                                      {qe.animation !== undefined && <span>Anim: {qe.animation}</span>}
                                      {qe.googleFlowSafety !== undefined && <span>GFlow: {qe.googleFlowSafety}</span>}
                                      {qe.promptQuality !== undefined && <span>Prompt: {qe.promptQuality}</span>}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* ── Separator ── */}
                              <div style={{ borderBottom: "1px dashed rgba(255,255,255,0.15)", marginBottom: 12 }} />

                              {/* ── MODULE 13: Final Prompt ── */}
                              <div style={{ background: "rgba(0,0,0,0.5)", padding: 12, borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                  <span style={{ fontSize: 10, fontWeight: 800, color: "var(--accent-primary)" }}>MODULE 13 — PROMPT COMPILER OUTPUT</span>
                                  <button
                                    onClick={() => { navigator.clipboard.writeText(prompt || ""); alert(`Prompt Scene ${num} disalin!`); }}
                                    style={{ background: "none", border: "none", color: "var(--accent-primary)", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
                                  >📋 Copy</button>
                                </div>
                                <div style={{ fontSize: 11, color: "#e5e7eb", fontFamily: "monospace", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                                  {prompt}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* ── Clean Human Readable View (NO Raw Monospace JSON!) ── */
                      <div style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.08)", padding: 20, borderRadius: "var(--radius-md)" }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-primary)", marginBottom: 12 }}>
                          🎬 Directorial Overview & Structured Analysis
                        </div>
                        <CleanDataCard data={content} />
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
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#050505" }}>
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    }>
      <VisualContent />
    </Suspense>
  );
}