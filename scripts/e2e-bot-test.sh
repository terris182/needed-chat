#!/bin/bash
set -e

SUPABASE_URL="https://ydxyuzqaobortwsnirnp.supabase.co"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkeHl1enFhb2JvcnR3c25pcm5wIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA0NzA4NCwiZXhwIjoyMDk0NjIzMDg0fQ.KQuT9qiDGQk81_ZGOGRCRjI0hhnegaSHsrMnlJrICMg"
APP_URL="https://needed.chat"
WEBHOOK_SECRET=""  # will read from env
HEADERS="-H \"apikey: $SERVICE_KEY\" -H \"Authorization: Bearer $SERVICE_KEY\" -H \"Content-Type: application/json\""

sb() {
  curl -s "$SUPABASE_URL/rest/v1/$1" \
    -H "apikey: $SERVICE_KEY" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    "${@:2}"
}

echo "=== needed.chat E2E Bot Test ==="
echo ""

# 1. Find an active room with a daily_prompt
echo "1. Finding active room..."
ROOM=$(sb "rooms?status=eq.active&select=id,title,slug,daily_prompt&limit=1" | python3 -c "import json,sys; r=json.load(sys.stdin)[0]; print(json.dumps(r))")
ROOM_ID=$(echo "$ROOM" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
ROOM_TITLE=$(echo "$ROOM" | python3 -c "import json,sys; print(json.load(sys.stdin)['title'])")
echo "   Room: $ROOM_TITLE ($ROOM_ID)"

# 2. Check existing messages
echo ""
echo "2. Checking existing messages..."
EXISTING=$(sb "messages?room_id=eq.$ROOM_ID&order=created_at.desc&limit=3&select=body,created_at,user_id")
echo "$EXISTING" | python3 -c "
import json, sys
msgs = json.load(sys.stdin)
for m in msgs:
    words = len(m['body'].split())
    print(f'   [{words}w] {m[\"body\"][:80]}...' if len(m['body'])>80 else f'   [{words}w] {m[\"body\"]}')
"

# 3. Test bot-continue endpoint — timing
echo ""
echo "3. Testing bot-continue timing..."
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
START=$(python3 -c "import time; print(time.time())")

RESULT=$(curl -sL -X POST "$APP_URL/api/ai/bot-continue" \
  -H "Content-Type: application/json" \
  -d "{\"room_id\":\"$ROOM_ID\",\"last_user_message_at\":\"$NOW\"}")

END=$(python3 -c "import time; print(time.time())")
ELAPSED=$(python3 -c "print(f'{$END - $START:.1f}s')")
echo "   Response time: $ELAPSED"
echo "   Result: $RESULT"

# 4. If it posted, check the message quality
POSTED=$(echo "$RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('posted', False))")
if [ "$POSTED" = "True" ]; then
  sleep 1
  echo ""
  echo "4. Checking posted message quality..."
  LATEST=$(sb "messages?room_id=eq.$ROOM_ID&order=created_at.desc&limit=1&select=body,user_id")
  echo "$LATEST" | python3 -c "
import json, sys
msg = json.load(sys.stdin)[0]
body = msg['body']
words = len(body.split())
print(f'   Word count: {words}')
print(f'   Message: {body}')
print()
issues = []
if words > 35: issues.append(f'TOO LONG ({words} words, target <25)')
if body.startswith('—'): issues.append('STARTS WITH EM-DASH (broken continuation)')
if '?' in body: issues.append('CONTAINS QUESTION (should not ask questions)')
if any(w in body.lower() for w in ['grounding', 'healing', 'safe space', 'validate', 'therapy']): issues.append('THERAPY-SPEAK detected')
if any(w in body.lower() for w in ['hello', 'hi ', 'hey ', 'welcome']): issues.append('GREETING detected')
if issues:
    print('   ⚠️  ISSUES:')
    for i in issues: print(f'      - {i}')
else:
    print('   ✅ Passed quality checks')
"
else
  echo "4. Bot didn't post this round (chance/gap skip) — retrying..."
  sleep 8
  NOW2=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  RESULT2=$(curl -sL -X POST "$APP_URL/api/ai/bot-continue" \
    -H "Content-Type: application/json" \
    -d "{\"room_id\":\"$ROOM_ID\",\"last_user_message_at\":\"$NOW2\"}")
  echo "   Retry result: $RESULT2"
fi

# 5. Test bot-reply (simulates user sending a message)
echo ""
echo "5. Testing bot-reply with simulated user message..."
# Get a non-bot user_id from the room
USER_ID=$(sb "room_members?room_id=eq.$ROOM_ID&select=user_id&limit=10" | python3 -c "
import json, sys, os
members = json.load(sys.stdin)
bot_ids = os.environ.get('BOT_USER_IDS', '').split(',')
for m in members:
    if m['user_id'] not in bot_ids:
        print(m['user_id'])
        break
" 2>/dev/null || echo "")

if [ -n "$USER_ID" ]; then
  # Insert a test user message
  sb "messages" -X POST -d "{\"room_id\":\"$ROOM_ID\",\"user_id\":\"$USER_ID\",\"body\":\"I keep thinking about the last time I felt completely free — like nothing was chasing me.\",\"message_type\":\"user\",\"moderation_status\":\"safe\"}" > /dev/null

  START2=$(python3 -c "import time; print(time.time())")
  REPLY=$(curl -sL -X POST "$APP_URL/api/ai/bot-reply" \
    -H "Content-Type: application/json" \
    -d "{\"room_id\":\"$ROOM_ID\",\"user_id\":\"$USER_ID\"}")
  END2=$(python3 -c "import time; print(time.time())")
  ELAPSED2=$(python3 -c "print(f'{$END2 - $START2:.1f}s')")
  echo "   bot-reply response time: $ELAPSED2"
  echo "   Result: $REPLY"

  REPLIED=$(echo "$REPLY" | python3 -c "import json,sys; print(json.load(sys.stdin).get('replied', False))")
  if [ "$REPLIED" = "True" ]; then
    sleep 1
    LATEST2=$(sb "messages?room_id=eq.$ROOM_ID&order=created_at.desc&limit=1&select=body")
    echo "$LATEST2" | python3 -c "
import json, sys
msg = json.load(sys.stdin)[0]
body = msg['body']
words = len(body.split())
print(f'   Reply [{words}w]: {body}')
issues = []
if words > 35: issues.append(f'TOO LONG ({words} words)')
if body.startswith('—'): issues.append('EM-DASH START')
if '?' in body: issues.append('QUESTION')
if issues:
    print(f'   ⚠️  {issues}')
else:
    print('   ✅ Reply quality OK')
"
  fi
fi

echo ""
echo "=== Test Complete ==="
