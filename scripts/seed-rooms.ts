/**
 * Seed rooms + set all existing to active + generate embeddings.
 * Run: npx tsx scripts/seed-rooms.ts
 */
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function embed(text: string): Promise<number[]> {
  const r = await openai.embeddings.create({ model: "text-embedding-3-small", input: text });
  return r.data[0].embedding;
}

const NEW_ROOMS = [
  // Loneliness & isolation
  { title: "Lonely at Night", slug: "lonely-at-night" },
  { title: "No One to Talk To", slug: "no-one-to-talk-to" },
  { title: "Feeling Invisible", slug: "feeling-invisible" },
  { title: "New City, No Friends Yet", slug: "new-city-no-friends" },
  { title: "Living Alone", slug: "living-alone" },
  // Anxiety & overthinking
  { title: "Racing Thoughts", slug: "racing-thoughts" },
  { title: "Anxiety at 3am", slug: "anxiety-3am" },
  { title: "Dread Without a Name", slug: "dread-without-a-name" },
  { title: "Overthinking Everything", slug: "overthinking-everything" },
  // Grief & loss
  { title: "Grieving and Functioning", slug: "grieving-and-functioning" },
  { title: "Missing Someone", slug: "missing-someone" },
  { title: "Loss Nobody Talks About", slug: "loss-nobody-talks-about" },
  // Relationships
  { title: "Feeling Unseen in a Relationship", slug: "feeling-unseen" },
  { title: "After a Fight", slug: "after-a-fight" },
  { title: "Growing Apart", slug: "growing-apart" },
  { title: "Heartbreak", slug: "heartbreak" },
  // Burnout & work
  { title: "Exhausted and Stuck", slug: "exhausted-and-stuck" },
  { title: "Burnout", slug: "burnout" },
  { title: "Sunday Night Dread", slug: "sunday-night-dread" },
  // Identity & purpose
  { title: "Not Sure Who I Am Anymore", slug: "not-sure-who-i-am" },
  { title: "Quarter Life Stuff", slug: "quarter-life-stuff" },
  { title: "Life Transitions", slug: "life-transitions" },
  // Hard to say things
  { title: "Can't Say This Out Loud", slug: "cant-say-this-out-loud" },
  { title: "I'm Not Okay", slug: "im-not-okay" },
  { title: "Shame and Secrets", slug: "shame-and-secrets" },
];

async function main() {
  // 1. Set all existing rooms to active
  const { error: updateErr } = await sb.from("rooms").update({ status: "active" }).eq("status", "seeding");
  if (updateErr) console.error("update error:", updateErr);
  else console.log("Set existing seeding rooms to active");

  // 2. Add new rooms with embeddings
  let added = 0;
  for (const room of NEW_ROOMS) {
    const { data: existing } = await sb.from("rooms").select("id").eq("slug", room.slug).single();
    if (existing) { console.log(`skip (exists): ${room.title}`); continue; }

    const embedding = await embed(`${room.title} — anonymous peer support chat room`);
    const { error } = await sb.from("rooms").insert({
      title: room.title,
      slug: room.slug,
      status: "active",
      origin: "seed",
      embedding,
      invite_quota: 12,
      active_member_count: 0,
    });
    if (error) console.error(`error adding ${room.title}:`, error.message);
    else { console.log(`added: ${room.title}`); added++; }
    await new Promise(r => setTimeout(r, 200)); // rate limit
  }
  console.log(`\nDone. Added ${added} rooms.`);
}

main().catch(console.error);
