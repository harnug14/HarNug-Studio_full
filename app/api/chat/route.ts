import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { chatWithGemini, ChatMode, ContentTarget } from "@/lib/gemini/chatWithGemini";
import { callGeminiWithRotation } from "@/lib/gemini/keyRotation";
import { chatWithGroq } from "@/lib/groq/chatWithGroq";
import { callGroqWithRotation } from "@/lib/groq/keyRotation";
import { DEFAULT_GEMINI_MODEL } from "@/lib/config";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

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

  let body: any;
  try {
    body = await req.json();
  } catch (err: any) {
    return NextResponse.json(
      { error: "Ukuran foto/file terlalu besar atau format request tidak valid." },
      { status: 400 }
    );
  }

  const model: string = body?.model || DEFAULT_GEMINI_MODEL;
  const mode: ChatMode = body?.mode || "biasa";
  const pesanPertama: string = (body?.pesan || "").trim();
  const attachments: any[] = body?.attachments || [];
  const sumber_topik_id = body?.sumber_topik_id || null;
  const sumber_naskah_id = body?.sumber_naskah_id || null;
  const contextText: string | undefined = body?.contextText || undefined;
  const contentTarget: ContentTarget = body?.contentTarget || null;

  if (!pesanPertama && attachments.length === 0) {
    return NextResponse.json({ error: "Pesan atau lampiran tidak boleh kosong" }, { status: 400 });
  }

  const judulSesi = pesanPertama
    ? pesanPertama.slice(0, 50)
    : attachments[0]?.name
    ? `Lampiran: ${attachments[0].name.slice(0, 40)}`
    : "Chat Baru";

  const { data: session, error: sessionError } = await supabase
    .from("chat_sessions")
    .insert({
      user_id: user.id,
      judul: judulSesi,
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

  const userContent = pesanPertama || (attachments.length > 0 ? `[Lampiran: ${attachments.map((a: any) => a.name).join(", ")}]` : "");

  await supabase.from("chat_messages").insert({
    session_id: session.id,
    role: "user",
    content: userContent,
  });

  const messagePayload: any = {
    role: "user",
    content: pesanPertama || (attachments.length > 0 ? "Berikut lampiran foto/file yang saya unggah." : ""),
    attachments: attachments,
  };

  let jawaban: string;
  try {
    if (model.startsWith("groq-")) {
      jawaban = await callGroqWithRotation(supabase, (apiKey) =>
        chatWithGroq(
          [messagePayload] as any,
          apiKey,
          model,
          mode,
          contextText,
          contentTarget
        )
      );
    } else {
      jawaban = await callGeminiWithRotation(supabase, (apiKey) =>
        chatWithGemini(
          [messagePayload] as any,
          apiKey,
          model,
          mode,
          contextText,
          contentTarget
        )
      );
    }
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