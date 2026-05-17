-- Seed the 12 launch rooms (BUILD_PLAN §16)
-- Embeddings populated at deploy time via seed script calling OpenAI

-- GREEN (4) — pop culture, ads allowed in chat
insert into rooms (title, slug, description, category, intensity, ad_safety_rating, tags, meta_target, origin, status, entry_prompt, daily_prompt) values
(
  'Stranger Things Season 6',
  'stranger-things-s6',
  'Spoilers, theories, and emotional reactions to the final season.',
  'pop_culture', 'light', 'green',
  array['stranger-things','netflix','sci-fi','nostalgia'],
  'Stranger Things',
  'seed', 'seeding',
  'What was your moment this week — favorite scene, biggest WTF, character take?',
  'Make your case — who''s the most underrated character of the season?'
),
(
  'Severance Watchers',
  'severance-watchers',
  'For people still processing Lumon and what it means about work.',
  'pop_culture', 'medium', 'green',
  array['severance','apple-tv','work-life','thriller'],
  'Severance (TV series)',
  'seed', 'seeding',
  'What''s still bothering you about Lumon?',
  'What did the show tell you about your own life this week?'
),
(
  'New Music Friday',
  'new-music-friday',
  'What you actually pressed play on twice this week.',
  'pop_culture', 'light', 'green',
  array['music','new-releases','indie','discovery'],
  'Spotify',
  'seed', 'seeding',
  'What did you actually press play on twice this week?',
  'Drop the one song you couldn''t stop replaying.'
),
(
  'F1 + Drive to Survive',
  'f1-drive-to-survive',
  'Races, rivalries, and the takes that get you yelled at.',
  'pop_culture', 'light', 'green',
  array['f1','formula-1','motorsport','netflix'],
  'Formula 1',
  'seed', 'seeding',
  'Who''s your driver this season — and what''s the take you''d get yelled at for?',
  'If you had to pick ONE driver to win next race, who and why?'
);

-- YELLOW (4) — medium intensity, ads at door only
insert into rooms (title, slug, description, category, intensity, ad_safety_rating, tags, meta_target, origin, status, entry_prompt, daily_prompt) values
(
  'AI Is Changing My Work',
  'ai-changing-work',
  'Honest conversations about how AI is reshaping what we do.',
  'work', 'medium', 'yellow',
  array['ai','work','technology','career'],
  'Artificial intelligence',
  'seed', 'seeding',
  'What''s one thing AI has changed about your work — for better or worse?',
  'What''s the smallest, weirdest way AI changed your week at work?'
),
(
  'Creative People in a Weird Season',
  'creative-weird-season',
  'For when the work feels off and you''re trying anyway.',
  'creativity', 'medium', 'yellow',
  array['creative','writing','freelance','art'],
  'Writers + creative pros',
  'seed', 'seeding',
  'What''s the work been like lately, honestly?',
  'What did you try to make a little better this week, even badly?'
),
(
  'Sober Curious',
  'sober-curious',
  'Exploring your relationship with alcohol, wherever you are in it.',
  'habit_change', 'medium', 'yellow',
  array['sobriety','alcohol','wellness','habit-change'],
  'Sobriety',
  'seed', 'seeding',
  'What''s your relationship with drinking right now?',
  'What''s the trigger you noticed this week — the moment you wanted a drink and what you did with it?'
),
(
  'New Parents Trying to Stay Themselves',
  'new-parents',
  'Finding yourself again between the feedings.',
  'relationships', 'medium', 'yellow',
  array['parenting','identity','new-parents','self-care'],
  'New Parents',
  'seed', 'seeding',
  'What''s something you used to be that you''re trying to find your way back to?',
  'What''s one small thing you did just for you today, however briefly?'
);

-- RED (4) — deep, no ads anywhere
insert into rooms (title, slug, description, category, intensity, ad_safety_rating, tags, origin, status, entry_prompt, daily_prompt) values
(
  'I Needed to Say This Somewhere',
  'needed-to-say-this',
  'A room for the thing you came here to say.',
  'other', 'deep', 'red',
  array['venting','support','anonymous'],
  'seed', 'seeding',
  'What did you come here to say?',
  'What''s been on you that you haven''t told anyone yet?'
),
(
  'Hard Week',
  'hard-week',
  'When this week is hitting different.',
  'other', 'deep', 'red',
  array['support','struggle','weekly'],
  'seed', 'seeding',
  'What''s making this week hard?',
  'What''s been hard about this week, in one specific moment?'
),
(
  'Late Night Thoughts',
  'late-night-thoughts',
  'The things you keep thinking about after everyone''s asleep.',
  'other', 'deep', 'red',
  array['late-night','reflection','insomnia'],
  'seed', 'seeding',
  'What''s the thing you keep thinking about after everyone''s asleep?',
  'What did you keep thinking about last night before sleep?'
),
(
  'The Quiet Part',
  'the-quiet-part',
  'The thing you usually don''t say out loud.',
  'other', 'deep', 'red',
  array['vulnerability','honesty','unsaid'],
  'seed', 'seeding',
  'What''s the thing you usually don''t say out loud?',
  'What''s the thing you wish someone would just KNOW without you having to say it?'
);
