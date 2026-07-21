import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Endpoint ini dipanggil otomatis 1x/hari oleh Vercel Cron.
// Tugasnya: reset semua API key Gemini & Groq yang berstatus "limited" balik jadi "active",
// mengikuti jadwal reset kuota harian.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error("[cron/reset-keys] Unauthorized - CRON_SECRET tidak cocok");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[cron/reset-keys] Mulai jalan:", new Date().toISOString());

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("api_keys")
    .update({
      status: "active",
      last_checked_at: new Date().toISOString(),
    })
    .in("provider", ["gemini", "groq"])
    .eq("status", "limited")
    .select();

  if (error) {
    console.error("[cron/reset-keys] Gagal update:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[cron/reset-keys] Selesai. ${data?.length || 0} key direset.`);

  return NextResponse.json({
    message: `Reset ${data?.length || 0} key Gemini/Groq dari limited ke active`,
    resetCount: data?.length || 0,
  });
}