import { NextResponse } from "next/server";
import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

// Generate a warm public icebreaker question for entering a room
export async function POST(request: Request) {
  try {
    const { room_title, category, tags } = await request.json();

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 60,
      temperature: 0.85,
      messages: [
        {
          role: "system",
          content: `Write a single warm, open-ended icebreaker question for an anonymous peer support chat room.
Rules:
- 1 question only, no options
- Answers should be personal but not too revealing
- Helps people feel seen without requiring deep disclosure
- Specific to the room topic
- NOT "What brings you here?" — that's too generic
- Examples: "What's one small thing that's felt heavy lately?", "What does a hard day usually look like for you?", "Is there something you've been needing to say out loud?"
- Max 15 words`,
        },
        {
          role: "user",
          content: `Room: "${room_title}". Category: ${category}. Tags: ${(tags || []).join(", ")}`,
        },
      ],
    });

    const question = completion.choices[0]?.message?.content?.trim()
      ?.replace(/^["']|["']$/g, "") // strip surrounding quotes
      || "What's one thing you've been carrying that you haven't said out loud yet?";

    return NextResponse.json({ question });
  } catch (e) {
    return NextResponse.json({
      question: "What's one thing you've been carrying that you haven't said out loud yet?",
    });
  }
}
