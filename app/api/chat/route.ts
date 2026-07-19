import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { chatWithGemini, ChatMode, ContentTarget } from "@/lib/gemini/chatWithGemini";
import { callGeminiWithRotation } from "@/lib/gemini/keyRotation";

export async function GET() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  const body = await req.json();
  const model: string = body?.model || "gemini-3-flash-preview";
  const mode: ChatMode = body?.mode || "biasa";
  const pesanPertama: string = (body?.pesan || "").trim();
  const sumber_topik_id = body?.sumber_topik_id || null;
  const sumber_naskah_id = body?.sumber_naskah_id || null;
  const contextText: string | undefined = body?.contextText || undefined;
  const contentTarget: ContentTarget = body?.contentTarget || null;

  if (!pesanPertama) {
    return NextResponse.json({ error: "Pesan tidak boleh kosong" }, { status: 400 });
  }

  const { data: session, error: sessionError } = await supabase
    .from("chat_sessions")
    .insert({
      user_id: user.id,
      judul: pesanPertama.slice(0, 50),
      model,
      mode,
      sumber_topik_id,
      sumber_naskah_id,
      content_target: contentTarget,
    })
    .select()
    .single();

  if (sessionError || !session) {
    return NextResponse.json(
      { error: sessionError?.message || "Gagal membuat sesi chat" },
      { status: 500 }
    );
  }

  await supabase.from("chat_messages").insert({
    session_id: session.id,
    role: "user",
    content: pesanPertama,
  });

  let jawaban: string;
  try {
    jawaban = await callGeminiWithRotation(supabase, (apiKey) =>
      chatWithGemini(
        [{ role: "user", content: pesanPertama }],
        apiKey,
        model,
        mode,
        contextText,
        contentTarget
      )
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Gagal mendapat jawaban dari AI", sessionId: session.id },
      { status: 500 }
    );
  }

  await supabase.from("chat_messages").insert({
    session_id: session.id,
    role: "assistant",
    content: jawaban,
  });

  return NextResponse.json({ sessionId: session.id, jawaban });
}