import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { NextRequest, NextResponse } from "next/server";
import { testYoutubeKey } from "@/lib/apiTesters/testYoutubeKey";
import { testGeminiKey } from "@/lib/apiTesters/testGeminiKey";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "id wajib diisi" }, { status: 400 });
  }

  // Ambil data key dari Supabase
  const { data: keyRow, error: fetchError } = await supabase
    .from("api_keys")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !keyRow) {
    return NextResponse.json({ error: "Key tidak ditemukan" }, { status: 404 });
  }

  // Test key sesuai provider-nya
  let result;
  if (keyRow.provider === "youtube") {
    result = await testYoutubeKey(keyRow.api_key);
  } else if (keyRow.provider === "gemini") {
    result = await testGeminiKey(keyRow.api_key);
  } else {
    return NextResponse.json({ error: "Provider tidak dikenal" }, { status: 400 });
  }

  // Tentukan status berdasarkan hasil test
  let status: "active" | "limited" | "error" = "error";
  if (result.valid) {
    status = "active";
  } else if (result.message.includes("Limit")) {
    status = "limited";
  }

  // Update status di Supabase
  const { data: updated, error: updateError } = await supabase
    .from("api_keys")
    .update({ status, last_checked_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ data: updated, message: result.message });
}