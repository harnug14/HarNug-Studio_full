import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { callGeminiWithRotation } from "@/lib/gemini/keyRotation";
import { DEFAULT_GEMINI_MODEL } from "@/lib/config";

const GEMINI_MODEL = DEFAULT_GEMINI_MODEL;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Belum login" }, { status: 401 });
    }

    // Ambil data naskah
    const { data: naskah, error: fetchErr } = await supabase
      .from("naskah")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (fetchErr || !naskah) {
      return NextResponse.json({ error: "Naskah tidak ditemukan" }, { status: 404 });
    }

    const systemPrompt = `Kamu adalah seorang Fact-Checker & Internal Consistency Validator spesifik untuk naskah video YouTube Shorts.
Tugasmu adalah menganalisis naskah berikut secara ketat.

--- ALUR KERJA FACT CHECK ---
1. Ekstrak SEMUA KLAIM FAKTUAL SPESIFIK (tahun, nama tokoh, tempat, urutan kejadian, angka).
2. Periksa KONSISTENSI INTERNAL & LOGIKA KRONOLOGIS (apakah ada pertentangan antar kalimat, timeline melompat/mustahil, atau penamaan tidak konsisten).
3. Tandai klaim apa pun yang meragukan atau berpotensi salah sebagai "Perlu Review".
4. Tentukan STATUS VERIFIKASI:
   - "Perlu Review" jika ada kejanggalan internal, kontradiksi, atau fakta tahun/nama yang tampak janggal.
   - "Konsisten" jika alur logika internal 100% konsisten.

5. FORMAT OUTPUT JSON PERSIS TANPA MARKDOWN MARKUP LAIN (pure JSON object):
{
  "statusVerification": "Perlu Review" atau "Konsisten",
  "factualClaims": [
    { "klaim": "Klaim fakta spesifik", "status": "Konsisten" atau "Perlu Review", "catatan": "Penjelasan singkat" }
  ],
  "internalConsistencyScore": 95,
  "ringkasanEvaluasi": "Ringkasan hasil pengecekan internal naskah...",
  "rekomendasiRevisi": ["Point saran revisi jika ada"]
}`;

    const userPrompt = `Naskah untuk di-fact check:
Judul: ${naskah.judul}
Isi Naskah:
"${naskah.isi_naskah}"

Jalankan Pengecekan Konsistensi Faktual & Internal sekarang dalam format JSON.`;

    const rawResponse = await callGeminiWithRotation(supabase, async (apiKey) => {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: {
              responseMimeType: "application/json",
            },
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API Error: ${response.status} - ${errText}`);
      }

      const json = await response.json();
      return json.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    });

    let factCheckResult: any = {};
    try {
      factCheckResult = JSON.parse(rawResponse);
    } catch (e) {
      const cleanJson = rawResponse.replace(/```json/g, "").replace(/```/g, "").trim();
      factCheckResult = JSON.parse(cleanJson);
    }

    const newStatus = "review";

    // Update data naskah di database
    const { data: updatedNaskah, error: updateErr } = await supabase
      .from("naskah")
      .update({
        fact_check_result: factCheckResult,
        status: newStatus,
      })
      .eq("id", id)
      .select()
      .single();

    if (updateErr) {
      console.error("Gagal update fact_check_result ke Supabase:", updateErr);
    }

    return NextResponse.json({
      data: updatedNaskah || naskah,
      factCheckResult,
    });
  } catch (err: any) {
    console.error("Fact check error:", err);
    return NextResponse.json(
      { error: err.message || "Gagal menjalankan Fact Check" },
      { status: 500 }
    );
  }
}
