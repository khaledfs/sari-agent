import { NextResponse } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getOpenAIClient } from "@/lib/openai";

export async function POST(req: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const audio = formData.get("audio");
    if (!audio || !(audio instanceof File)) {
      return NextResponse.json({ success: false, message: "No audio file provided" }, { status: 400 });
    }

    const url = new URL(req.url);
    const localeParam = url.searchParams.get("locale") ?? "he";
    const localeToWhisper: Record<string, string> = { he: "he", ar: "ar", en: "en" };
    const language = localeToWhisper[localeParam] ?? "he";

    const openai = getOpenAIClient();
    const transcription = await openai.audio.transcriptions.create({
      file: audio,
      model: "whisper-1",
      language,
    });

    return NextResponse.json({ success: true, data: { text: transcription.text } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription failed.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
