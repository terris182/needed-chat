-- Update bot usernames to match user auto-generated format (adjective-noun-NN)
-- Bot user IDs are in BOT_USER_IDS env var, mapped by persona index
-- This updates ALL users_profile rows where is_bot = true

UPDATE users_profile SET username = 'warm-harbor-14' WHERE username = 'marisol_anon';
UPDATE users_profile SET username = 'steady-ridge-07' WHERE username = 'theo_anon';
UPDATE users_profile SET username = 'deep-bloom-33' WHERE username = 'cedar_anon';
UPDATE users_profile SET username = 'calm-stone-51' WHERE username = 'juno_anon';
UPDATE users_profile SET username = 'bright-dawn-22' WHERE username = 'wren_anon';
