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

  // SET NASKAH ID YANG SUDAH MEMILIKI VISUAL STORYBOARD
  const generatedNaskahIds = new Set(items.map((v) => v.sumber_naskah_id).filter(Boolean));

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
    if (typeof window !== "undefined" && window.location.hash && items.length > 0) {
      const targetId = window.location.hash.replace("#", "");
      if (targetId) {
        setTimeout(() => {
          const el = document.getElementById(targetId);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.style.transition = "border-color 0.5s ease, box-shadow 0.5s ease";
            el.style.borderColor = "#38bdf8";
            el.style.boxShadow = "0 0 12px rgba(56, 189, 248, 0.3)";
            setTimeout(() => {
              el.style.borderColor = "var(--border-subtle)";
              el.style.boxShadow = "none";
            }, 2500);
          }
        }, 300);
      }
    }
  }, [items]);

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
    setProgressMsg("Directing Storyboard & Beats...");

    try {
      const planRes = await fetch("/api/visual/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "plan",
          naskahId: selectedNaskahId || null,
          judulNaskah: cleanTitle(judulNaskah),
          isiNaskah: textToUse,
          visualStyle,
        }),
      });

      const planJson = await planRes.json();
      if (planJson.error) throw new Error(planJson.error);

      const { storyUnderstanding, scenes: plannedScenes } = planJson.data || {};
      if (!Array.isArray(plannedScenes) || plannedScenes.length === 0) {
        throw new Error("Gagal memecah adegan naskah.");
      }

      const directedScenes: any[] = [];
      const globalAssetLibrary: any[] = [];
      const INTER_SCENE_DELAY_MS = 1000;
      const MAX_SCENE_RETRIES = 2;
      let lastDirectorialSpec: any = undefined;
      let lastCharacterState: any = undefined;

      for (let i = 0; i < plannedScenes.length; i++) {
        const sceneItem = plannedScenes[i];

        if (i > 0) {
          await new Promise((r) => setTimeout(r, INTER_SCENE_DELAY_MS));
        }

        setProgressMsg(`Directing Shot #${i + 1} dari ${plannedScenes.length}...`);

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
                existingAssetLibrary: globalAssetLibrary,
                previousDirectorialSpec: lastDirectorialSpec,
                previousCharacterState: lastCharacterState,
              }),
            });
            const sceneJson = await sceneRes.json();
            if (sceneJson.error) throw new Error(sceneJson.error);
            if (sceneJson.data) {
              const sd = sceneJson.data;
              directedScenes.push(sd);
              lastDirectorialSpec = sd.sceneSpecification?.camera;
              if (sd.characterState) lastCharacterState = sd.characterState;

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

      setProgressMsg("Menyimpan Storyboard Visual...");

      const saveRes = await fetch("/api/visual/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          naskahId: selectedNaskahId || null,
          judulNaskah: cleanTitle(judulNaskah),
          visualStyle,
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
    if (!Array.isArray(scenes)) return;
    const prompts = scenes
      .map((s, idx) => {
        const ad = s.assetDecision || {};
        const p = s.promptCompiler?.compiledPrompt || s.prompt || s.deskripsiVisual;
        if (ad.assetStatus === "REUSED") {
          return `--- Shot #${s.scene || idx + 1} (REUSED: ${ad.targetAssetId || "Aset"}) ---\nInstruksi Kamera: ${ad.productionInstruction || "Gunakan pergerakan kamera CapCut"}`;
        }
        return `--- Shot #${s.scene || idx + 1} (${ad.assetStatus || "NEW"}) ---\n${p}`;
      })
      .join("\n\n=========================================\n\n");
    navigator.clipboard.writeText(prompts);
    alert("Semua Prompt disalin!");
  }

  return (
    <div className="animate-fade-in">
      {/* Subtitle Halaman */}
      <div style={{ marginBottom: 16 }}>
        <p className="page-subtitle">
          Penyusunan Storyboard & Prompt Visual untuk produksi video.
        </p>
      </div>

      <div className="glass-card-static" style={{ padding: 22, marginBottom: 24 }}>
        <form onSubmit={handleGenerateVisual}>
          <div style={{ marginBottom: 14 }}>
            <label className="form-label">Pilih Script Naskah *</label>
            <select value={selectedNaskahId} onChange={(e) => handleSelectNaskah(e.target.value)} className="select-field">
              <option value="">-- Pilih dari Daftar Naskah --</option>
              {Array.isArray(naskahList) && naskahList.map((n) => {
                const isGenerated = generatedNaskahIds.has(n.id);
                return (
                  <option key={n.id} value={n.id}>
                    {isGenerated ? `✓ ${cleanTitle(n.judul)}` : cleanTitle(n.judul)}
                  </option>
                );
              })}
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
              <option value="3D Unreal Engine 5">3D Unreal Engine 5</option>
              <option value="3D Realistic Human">3D Realistic Human</option>
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
                    <div style={{ marginTop: 4, display: "flex", gap: 6 }}>
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
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
                        {scenes.map((s: any, sIdx: number) => {
                          const num = s.scene || sIdx + 1;
                          const pc = s.promptCompiler || {};
                          const prompt = pc.compiledPrompt || s.prompt;

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
                              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
                                Shot #{String(num).padStart(2, "0")}
                              </div>

                              {s.naskahChunk && (
                                <div style={{ fontSize: 12, color: "var(--text-secondary)", fontStyle: "italic", borderLeft: "2px solid var(--border-medium)", paddingLeft: 8 }}>
                                  &ldquo;{s.naskahChunk}&rdquo;
                                </div>
                              )}

                              <div style={{ background: "var(--bg-secondary)", padding: 10, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                                  <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-tertiary)" }}>PROMPT</span>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(prompt || "");
                                      alert(`Prompt Shot #${num} disalin!`);
                                    }}
                                    style={{ background: "none", border: "none", color: "var(--text-primary)", cursor: "pointer", fontSize: 11, fontWeight: 500 }}
                                  >
                                    Salin
                                  </button>
                                </div>
                                <div style={{ fontSize: 11, color: "var(--text-primary)", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                                  {prompt}
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
