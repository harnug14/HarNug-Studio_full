import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { callGeminiWithRotation } from "@/lib/gemini/keyRotation";
import { parseJsonResponse } from "@/lib/gemini/parseJsonResponse";
import { fetchTavilySearchResults } from "@/lib/tavily";

// DIBERI WAKTU 60 DETIK AGAR VERCEL TIDAK MEMUTUS PAKSA (0% TIMEOUT 504)
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// OTAK UTAMA RESMI: GEMINI 3.6 FLASH
const MAIN_MODEL = "gemini-3.6-flash";

async function requestGoogleGemini(
  apiKey: string,
  userPrompt: string,
  systemPrompt: string
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MAIN_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.7,
        },
      }),
    }
  );

  const rawText = await response.text();

  if (!response.ok) {
    let errorDetail = rawText;
    try {
      const errJson = JSON.parse(rawText);
      errorDetail = errJson.error?.message || rawText;
    } catch {}
    throw new Error(`[${response.status}] ${errorDetail}`);
  }

  const json = JSON.parse(rawText);
  return json.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
}

async function callGeminiApi(
  supabase: any,
  userPrompt: string,
  systemPrompt: string
): Promise<string> {
  return await callGeminiWithRotation(supabase, async (apiKey) => {
    return await requestGoogleGemini(apiKey, userPrompt, systemPrompt);
  });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Belum login" }, { status: 401 });
    }

    const {
      kategori = "Curious History & Sejarah Unik Kehidupan Manusia",
      durasi = "45-60 detik",
      topikDisukai = "",
      topikDitolak = "",
      jumlah = 5,
      referenceProfileId = null,
    } = await req.json();

    // EKSEKUSI KUERI DATABASE PARALEL
    const [profileRes, historyRes] = await Promise.all([
      referenceProfileId
        ? supabase
            .from("channel_analysis")
            .select("profile_name, channel_analysis_entries(title, full_script)")
            .eq("id", referenceProfileId)
            .single()
        : Promise.resolve({ data: null }),
      supabase
        .from("topik")
        .select("judul")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    let referenceContextText = "";
    let isProfileMode = false;

    if (profileRes.data && profileRes.data.channel_analysis_entries?.length) {
      isProfileMode = true;
      const samples = profileRes.data.channel_analysis_entries
        .map((e: any, idx: number) => {
          return `Contoh Naskah ${idx + 1}: ${e.title}\nNaskah Utuh:\n${e.full_script || ""}`;
        })
        .join("\n\n---\n\n");

      referenceContextText = `\n\nREFERENSI PROFIL CHANNEL LENGKAP ("${profileRes.data.profile_name}"):\n${samples}`;
    }

    let riwayatTopikText = "";
    if (historyRes.data && historyRes.data.length > 0) {
      const daftarJudul = historyRes.data
        .map((t: any, idx: number) => `- ${t.judul}`)
        .join("\n");
      riwayatTopikText = `\n\n--- DAFTAR TOPIK YANG SUDAH PERNAH DIBUAT (WAJIB DIHINDARI 100%) ---\n${daftarJudul}\n\nATURAN ANTI-DUPLIKASI MUTLAK: Dilarang keras membuat topik dengan INTI CERITA/SUBJEK yang sama dari daftar di atas (misal: jika sudah ada sejarah popok, DILARANG membuat topik popok lagi meskipun judul/penjelasannya berbeda).`;
    }

    // 💡 ATURAN MUTLAK BLACKLIST (TOPIK DITOLAK)
    let blacklistInstruction = "";
    if (topikDitolak && topikDitolak.trim()) {
      blacklistInstruction = `\n\n⛔ PROTOKOL BLACKLIST MUTLAK (DILARANG KERAS):
Pengguna secara tegas MENOLAK topik terkait: "${topikDitolak}".
KAMU DILARANG KERAS menghasilkan kandidat topik apa pun yang menyebut, membahas, atau berkaitan langsung maupun tidak langsung dengan "${topikDitolak}". Pelanggaran aturan ini dianggap kegagalan fatal.`;
    }

    // 💡 AMBIL DATA RISET DARI TAVILY
    let tavilyContext = "";
    try {
      const searchQuery = topikDisukai
        ? `fakta sejarah unik aneh manusia ${topikDisukai}`
        : `peristiwa sejarah unik aneh misteri kehidupan manusia masa lalu trivia mendalam`;
      const tavilyRes = await fetchTavilySearchResults(searchQuery);
      if (tavilyRes) {
        tavilyContext = `\n\n[DATA FAKTA SEJARAH OTENTIK DARI WEB]:\n${tavilyRes}\n\nGunakan fakta otentik di atas sebagai rujukan validasi agar topik 100% berbasis peristiwa nyata.`;
      }
    } catch (e) {
      console.warn("[Topik] Gagal fetch Tavily, lanjut tanpa search tambahan:", e);
    }

    const systemPrompt = `Kamu adalah seorang Lead Content Strategist & Topic Curator kelas dunia spesialis niche Curious Pop History & Sejarah Unik Kehidupan Manusia (standar channel Dafiology).

KRITERIA KUALITAS TOPIK TINGGI (ANTI-SEPELE):
1. WAJIB BERBOBOT: Topik harus memiliki unsur KONSEKUENSI NYATA, BENTURAN BUDAYA, DILEMA MORAL, atau KEANEHAN EKSTREM peradaban masa lalu. JANGAN memilih hal sepele yang membosankan tanpa intrik cerita.
2. HOOK PENASARAN: Judul harus memicu rasa ingin tahu yang kuat (Curiosity Gap) tapi tetap konkret dan elegan.
3. KAYA FAKTA OTENTIK: Berakar pada sejarah nyata dunia yang bisa diverifikasi.

RUBRIK VALIDASI SKOR (/50):
- Relevansi & Ketertarikan Audiens (/10)
- Potensi Visual Dramatis (/10)
- Kekuatan Konflik & Cerita (/10)
- Kekuatan Hook (/10)
- Potensi Retensi Viral (/10)
Total skor WAJIB >= 40/50.

FORMAT JSON OUTPUT PERSIS (pure JSON object):
{
  "candidates": [
    {
      "judul": "Judul Ide Topik yang Memikat, Dramatis, dan Konkret",
      "penjelasan": "Penjelasan 2-3 kalimat mengenai inti konflik/kejadian sejarah di balik topik ini dan kenapa ini menarik.",
      "skor": { "total": 46 },
      "alasanKelulusan": "Penjelasan kenapa topik ini berbobot tinggi dan lolos skor >= 40/50."
    }
  ]
}${riwayatTopikText}${blacklistInstruction}`;

    const userPrompt = isProfileMode
      ? `PROFIL CHANNEL DIPILIH:${referenceContextText}${tavilyContext}

Instruksi:
Pelajari pola channel di atas. Hasilkan ${jumlah} kandidat ide topik baru yang berbobot tinggi, bebas duplikasi, dan PATUHI protokol blacklist jika ada. Berikan dalam format JSON murni.`
      : `Parameter Ideation Topic:
- Niche: ${kategori}
- Durasi Target: ${durasi}
- Fokus yang Disukai: ${topikDisukai || "Peristiwa unik, dilema masa lalu, asal-usul yang mengejutkan"}
- Topik Ditolak: ${topikDitolak || "Tidak ada"}
- Jumlah: ${jumlah} kandidat${tavilyContext}

Hasilkan ${jumlah} ide topik berbobot tinggi yang lolos skor >= 40/50 dalam JSON murni sekarang.`;

    const rawResponse = await callGeminiApi(
      supabase,
      userPrompt,
      systemPrompt
    );

    const parsedData: any = parseJsonResponse(rawResponse, { candidates: [] });

    return NextResponse.json({ data: parsedData.candidates || [] });
  } catch (err: any) {
    console.error("Error generating topic candidates:", err);
    return NextResponse.json(
      { error: err.message || "Gagal membuat kandidat topik" },
      { status: 500 }
    );
  }
}
