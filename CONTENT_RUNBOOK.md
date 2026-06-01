# needed.chat — Content/SEO Runbook (WHI-458)

Authoritative steps for the recurring organic-growth automation. Free organic
growth only; never paid ads, never AdSense. Linear issue: WHI-458.

## Environment / auth
- Working clone: `/Users/whitley/needed-chat-whi458` (origin = github.com/terris182/needed-chat, branch `main`).
- Vercel project = **needed-chat-deploy** (prj_h0GDqNeXWoMkYJdtKFXCSY4RhLjI) — this is the project that owns the needed.chat domain (NOT the project named "needed"). The clone's `.vercel` is already linked to it. If the clone is ever recreated, re-link: `vercel link --yes --project needed-chat-deploy --token="$VERCEL_TOKEN"`. Its Vercel env vars are fully configured (Supabase/OpenAI/Stripe/Resend/VAPID/CRON).
- GitHub push works over **SSH** (no PAT needed): origin is `git@github.com:terris182/needed-chat.git` and the Mac's `~/.ssh/id_ed25519` is authorized as terris182. So weekly batches should `git push origin HEAD:main` normally, then `vercel deploy --prod`.
- Auth + env helper (reads creds from Whitley.xlsx, never echoes them):
  - `python3 /Users/whitley/tmp/whi458_setup.py` -> ensures clone + writes `/Users/whitley/tmp/whi458.env`.
  - `source /Users/whitley/tmp/whi458.env` exports `VERCEL_TOKEN` and `OPENAI_API_KEY`.
- No GitHub PAT is stored. If `git push` fails on auth, deploy directly anyway
  (`vercel deploy --prod` uploads the local dir and builds on Vercel) and note
  that the push needs Terris to run, or rely on Vercel's own git integration.
- Deploy authorized directly for this non-Bubble app (CLAUDE.md exception 2026-05-31).

## Adding articles (the weekly batch)
1. `cd /Users/whitley/needed-chat-whi458 && git pull origin main` (best-effort).
2. Pick targets from `content/keyword-map.md` rows marked `queued`. ~4 per batch.
3. For each create `src/content/articles/<slug>.ts` exporting `const article: Article`
   (copy the shape of existing files). Fields: slug, title, description, keywords[],
   category, publishedAt (ISO now), updatedAt, readingMinutes, body[] of blocks
   (p / h2 / ul / quote).
4. Register each in `src/content/articles/index.ts` (import + add to array).
5. Mark those keyword rows `live (<slug>)` in `content/keyword-map.md`.
6. `npx tsc --noEmit` then `npx next build` must both pass.
7. `git add -A && git commit && git push origin HEAD:main` (best-effort).
8. `source /Users/whitley/tmp/whi458.env && vercel deploy --prod --yes --token="$VERCEL_TOKEN"`.
9. Verify: `curl -s -o /dev/null -w "%{http_code}" https://needed.chat/blog/<slug>` -> 200;
   confirm slug in `https://needed.chat/sitemap.xml`.
10. Ping: `curl -s "https://www.google.com/ping?sitemap=https://needed.chat/sitemap.xml"` (best-effort).

## Content quality bar (non-negotiable)
- Genuinely helpful, warm, specific. No fluff, no fake authority.
- E-E-A-T honest: peer support, not medical/clinical treatment.
- The `[slug]` page already appends a soft CTA + crisis resources, so the body
  stays gentle — do NOT hard-sell the app inside the body.
- Never target self-harm-method or crisis queries. Route distress to 988.

## Logging
- Append a one-line checkpoint to Linear WHI-458 (slugs shipped, deploy URL). Not chat.
