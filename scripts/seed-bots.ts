/**
 * One-time script: creates 5 bot users in Supabase and prints their IDs.
 * Run: npx tsx scripts/seed-bots.ts
 * Then add BOT_USER_IDS=id1,id2,id3,id4,id5 to Vercel env vars (same order as BOT_PERSONAS).
 */
import { createClient } from "@supabase/supabase-js";
import { BOT_PERSONAS } from "../src/lib/bots/personas";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const ids: string[] = [];

  for (const persona of BOT_PERSONAS) {
    const email = `bot-${persona.username}@needed.chat`;

    // Create auth user
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password: crypto.randomUUID(),
      email_confirm: true,
    });

    if (authErr) {
      // If already exists, look up by email
      const { data: existing } = await supabase.auth.admin.listUsers();
      const found = existing?.users?.find((u) => u.email === email);
      if (found) {
        console.log(`${persona.displayName} already exists: ${found.id}`);
        ids.push(found.id);
        continue;
      }
      console.error(`Failed to create ${persona.displayName}:`, authErr.message);
      continue;
    }

    const userId = authData.user.id;

    // Create profile
    await supabase.from("users_profile").upsert({
      id: userId,
      username: persona.username,
      display_name: persona.displayName,
      matchmaking_enabled: false,
    });

    console.log(`Created ${persona.displayName}: ${userId}`);
    ids.push(userId);
  }

  console.log("\nAdd this to Vercel env vars:");
  console.log(`BOT_USER_IDS=${ids.join(",")}`);
}

main().catch(console.error);
