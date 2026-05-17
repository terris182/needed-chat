/**
 * Generate embeddings for all seed rooms.
 * Run after migrations: npx tsx scripts/seed-embeddings.ts
 * Requires OPENAI_API_KEY and SUPABASE_SERVICE_ROLE_KEY in env.
 */
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return res.data[0].embedding;
}

async function main() {
  const { data: rooms, error } = await supabase
    .from("rooms")
    .select("id, title, description, tags, entry_prompt, daily_prompt")
    .eq("origin", "seed")
    .is("embedding", null);

  if (error) throw error;
  if (!rooms?.length) {
    console.log("No rooms need embeddings.");
    return;
  }

  console.log(`Generating embeddings for ${rooms.length} rooms...`);

  for (const room of rooms) {
    // Combine room signals into a single embedding text
    const text = [
      room.title,
      room.description,
      room.tags?.join(", "),
      room.entry_prompt,
      room.daily_prompt,
    ]
      .filter(Boolean)
      .join(" | ");

    const embedding = await embed(text);

    const { error: updateError } = await supabase
      .from("rooms")
      .update({ embedding })
      .eq("id", room.id);

    if (updateError) {
      console.error(`Failed to update ${room.title}:`, updateError);
    } else {
      console.log(`✓ ${room.title}`);
    }
  }

  console.log("Done.");
}

main().catch(console.error);
