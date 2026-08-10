import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { callGeminiWithRotation, GeminiQuotaError } from "@/lib/gemini/keyRotation";
import { parseJsonResponse } from "@/lib/gemini/parseJsonResponse";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

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
      kategori = "Umum/Edukasi",
      durasi = "45-60 detik",
      topikDisukai = "",
      topikDitolak = "",
      jumlah = 5,
      referenceProfileId = null,
    } = await req.json();

    let referenceContextText = "";
    if (referenceProfileId) {
      const { data: channelProfile } = await supabase
        .from("channel_analysis")
        .select("profile_name, channel_analysis_entries(title, full_script)")
        .eq("id", referenceProfileId)
        .single();

      if (channelProfile && channelProfile.channel_analysis_entries?.length) {
        const samples = channelProfile.channel_analysis_entries
          .map((e: any, idx: number) => `Contoh ${idx + 1}: ${e.title}\nNaskah: ${e.full_script}`)
          .join("\n\n---\n\n");
        referenceContextText = `\n\nREFERENSI CHANNEL ("${channelProfile.profile_name}"):\n${samples}`;
      }
    }

    const { data: existingTopics } = await supabase
      .from("topik")
      .select("judul")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    let riwayatTopikText = "";
    if (existingTopics && existingTopics.length > 0) {
      const daftarJudul = existingTopics.map((t: any, idx: number) => `${idx + 1}. ${t.judul}`).join("\n");
      riwayatTopikText = `\n\nTOPIK YANG SUDAH ADA (WAJIB DIBEDAKAN):\n${daftarJudul}`;
    }

    const systemPrompt = `Kamu adalah Expert YouTube Shorts Content Strategist.
Hasilkan ${jumlah} ide topik video YouTube Shorts berkualitas tinggi yang unik dan berpotensi viral.

RUBRIK VALIDASI SKOR (/50): Relevansi, Visual, Struktur, Hook, Viral (Total wajib >= 40/50).

FORMAT JSON OUTPUT PERSIS (pure JSON):
{
  "candidates": [
    {
      "judul": "Judul Topik yang Menarik dan Konkret",
      "penjelasan": "Penjelasan singkat 2 kalimat kenapa topik ini menarik.",
      "skor": { "relevansi": 9, "visual": 9, "struktur": 8, "hook": 9, "viral": 8, "total": 43 },
      "alasanKelulusan": "Alasan lolos skor >= 40/50."
    }
  ]
}${riwayatTopikText}`;

    const userPrompt = referenceProfileId
      ? `PROFIL CHANNEL DIPIILIH:${referenceContextText}\nHasilkan ${jumlah} ide topik baru yang konsisten dengan channel tersebut dalam JSON murni.`
      : `Parameter Ideation Topic:
- Kategori: ${kategori}
- Target Durasi: ${durasi}
- Fokus: ${topikDisukai || "Bebas"}
- Ditolak: ${topikDitolak || "Tidak ada"}
- Jumlah: ${jumlah} kandidat

Hasilkan kandidat topik yang lolos skor >= 40/50 dalam JSON murni sekarang.`;

    // Panggilan super cepat via Key Rotation tanpa delay
    const rawResponse = await callGeminiWithRotation(supabase, async (apiKey) => {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.9,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini Error: ${response.status}`);
      }

      const json = await response.json();
      return json.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    });

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
