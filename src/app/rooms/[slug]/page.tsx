"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MessageRow } from "@/components/ui/message-row";
import { PinnedPromptCard } from "@/components/ui/pinned-prompt-card";
import { Button } from "@/components/ui/button";
import { AdSlot } from "@/components/ui/ad-slot";

interface Message {
  id: string;
  body: string;
  message_type: string;
  moderation_status: string;
  created_at: string;
  user_id: string;
  reply_to_id?: string | null;
  users_profile?: { username: string } | null;
}

interface Room {
  id: string;
  title: string;
  slug: string;
  description: string;
  ad_safety_rating: "green" | "yellow" | "red";
  daily_prompt: string | null;
  status: string;
  active_member_count: number;
}

export default function RoomPage() {
  const params = useParams();
  const slug = params.slug as string;
  const supabase = createClient();

  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const lastUserActivityRef = useRef<string>(new Date().toISOString());
  const botLoopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const botPaceRef = useRef<"active" | "slow" | "stopped">("active");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load room + user + initial messages
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: roomData } = await supabase
        .from("rooms")
        .select("*")
        .eq("slug", slug)
        .single();
      if (roomData) setRoom(roomData as Room);

      if (roomData) {
        const { data: msgs } = await supabase
          .from("messages")
          .select("*, users_profile(username)")
          .eq("room_id", roomData.id)
          .in("moderation_status", ["pending", "safe"])
          .order("created_at", { ascending: true })
          .limit(50);
        // Pre-fetch reply targets for threading display
        if (msgs) {
          const replyIds = msgs.filter((m: any) => m.reply_to_id).map((m: any) => m.reply_to_id);
          if (replyIds.length > 0) {
            const { data: replyMsgs } = await supabase
              .from("messages")
              .select("id, body, users_profile(username)")
              .in("id", replyIds);
            if (replyMsgs) {
              const replyMap = new Map(replyMsgs.map((r: any) => [r.id, r]));
              msgs.forEach((m: any) => {
                if (m.reply_to_id && replyMap.has(m.reply_to_id)) {
                  m._replyTarget = replyMap.get(m.reply_to_id);
                }
              });
            }
          }
        }
        if (msgs) setMessages(msgs as Message[]);
      }
    }
    init();
  }, [slug, supabase]);

  // Realtime subscription
  useEffect(() => {
    if (!room) return;

    const channel = supabase
      .channel(`room:${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${room.id}`,
        },
        async (payload) => {
          const msg = payload.new as any;
          if (msg.user_id) {
            const { data: profile } = await supabase
              .from("users_profile")
              .select("username")
              .eq("id", msg.user_id)
              .single();
            msg.users_profile = profile;
          }
          // Fetch reply target if this message is a reply
          if (msg.reply_to_id) {
            const { data: replyMsg } = await supabase
              .from("messages")
              .select("id, body, users_profile(username)")
              .eq("id", msg.reply_to_id)
              .single();
            if (replyMsg) msg._replyTarget = replyMsg;
          }
          setMessages((prev) => [...prev, msg as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room, supabase]);

  // Bot conversation loop — keeps bots chatting at a natural pace
  useEffect(() => {
    if (!room) return;
    const roomId = room.id;

    function scheduleBotContinue() {
      if (botPaceRef.current === "stopped") return;

      // Randomize interval based on pace
      const baseMs = botPaceRef.current === "slow" ? 25000 : 8000;
      const jitter = Math.random() * (botPaceRef.current === "slow" ? 10000 : 7000);
      const intervalMs = baseMs + jitter;

      botLoopRef.current = setTimeout(async () => {
        try {
          const res = await fetch("/api/ai/bot-continue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              room_id: roomId,
              last_user_message_at: lastUserActivityRef.current,
            }),
          });
          const data = await res.json();
          botPaceRef.current = data.pace || "active";
        } catch {
          // Network error — keep going
        }
        // Schedule next iteration (unless stopped)
        if (botPaceRef.current !== "stopped") {
          scheduleBotContinue();
        }
      }, intervalMs);
    }

    // Start the loop quickly so bots engage right away
    const startDelay = setTimeout(() => scheduleBotContinue(), 2000);

    return () => {
      clearTimeout(startDelay);
      if (botLoopRef.current) clearTimeout(botLoopRef.current);
    };
  }, [room]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || !room || !userId || sending) return;

    setSending(true);
    const body = newMessage.trim();
    setNewMessage("");

    // Track user activity — resets bot pace to active
    lastUserActivityRef.current = new Date().toISOString();
    if (botPaceRef.current === "stopped") {
      botPaceRef.current = "active";
      // Restart bot loop if it had stopped
      if (!botLoopRef.current) {
        const restartLoop = () => {
          if (botPaceRef.current === "stopped") return;
          const baseMs = botPaceRef.current === "slow" ? 25000 : 8000;
          const jitter = Math.random() * (botPaceRef.current === "slow" ? 10000 : 7000);
          botLoopRef.current = setTimeout(async () => {
            try {
              const res = await fetch("/api/ai/bot-continue", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  room_id: room.id,
                  last_user_message_at: lastUserActivityRef.current,
                }),
              });
              const data = await res.json();
              botPaceRef.current = data.pace || "active";
            } catch {}
            if (botPaceRef.current !== "stopped") restartLoop();
          }, baseMs + jitter);
        };
        restartLoop();
      }
    } else {
      botPaceRef.current = "active";
    }

    if (room.ad_safety_rating !== "green") {
      // YELLOW/RED: pre-publish moderation
      const { data: msg } = await supabase
        .from("messages")
        .insert({
          room_id: room.id,
          user_id: userId,
          body,
          moderation_status: "pending",
        })
        .select("id")
        .single();

      if (msg) {
        const res = await fetch("/api/ai/moderate-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message_id: msg.id,
            body,
            room_ad_safety_rating: room.ad_safety_rating,
          }),
        });
        const modResult = await res.json();

        if (modResult.status === "blocked") {
          await supabase.from("messages").delete().eq("id", msg.id);
        }
      }
    } else {
      // GREEN: post-publish, async moderation
      const { data: msg } = await supabase
        .from("messages")
        .insert({
          room_id: room.id,
          user_id: userId,
          body,
          moderation_status: "safe",
        })
        .select("id")
        .single();

      if (msg) {
        fetch("/api/ai/moderate-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message_id: msg.id,
            body,
            room_ad_safety_rating: room.ad_safety_rating,
          }),
        }).catch(() => {});
      }
    }

    await supabase
      .from("room_members")
      .update({ last_message_at: new Date().toISOString() })
      .eq("room_id", room.id)
      .eq("user_id", userId);

    // Trigger bot reply (fire-and-forget)
    fetch("/api/ai/bot-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: room.id, user_id: userId }),
    }).catch(() => {});

    setSending(false);
    inputRef.current?.focus();
  }

  if (!room) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-text-tertiary text-sm">Loading room...</p>
      </div>
    );
  }

  const isEarly = room.status === "seeding" && room.active_member_count < 3;

  return (
    <div className="flex flex-col h-dvh bg-bg">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-surface border-b border-border px-4 py-3 flex items-center gap-3">
        <a href="/rooms" className="text-text-tertiary hover:text-text-primary text-sm">
          &larr;
        </a>
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold text-sm text-text-primary truncate">{room.title}</h1>
          <p className="text-xs text-text-tertiary">
            {room.active_member_count} active &middot;{" "}
            {room.ad_safety_rating === "red"
              ? "safe space"
              : room.ad_safety_rating === "yellow"
                ? "sensitive"
                : "open"}
          </p>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {room.daily_prompt && (
          <div className="px-4 py-3">
            <PinnedPromptCard prompt={room.daily_prompt} />
          </div>
        )}

        {isEarly && (
          <div className="px-4 py-6 text-center">
            <p className="text-sm text-text-secondary font-medium">
              You&apos;re early &mdash; this room is just getting started.
            </p>
            <p className="text-xs text-text-tertiary mt-1">
              Be the first voice. Others with similar thoughts are being invited.
            </p>
          </div>
        )}

        {room.ad_safety_rating === "green" && (
          <div className="px-4 py-2">
            <AdSlot placement="chat-inline" roomSafetyTier="GREEN" />
          </div>
        )}

        <div className="py-2">
          {messages.map((msg) => {
            const replyTarget = (msg as any)._replyTarget;
            return (
              <MessageRow
                key={msg.id}
                username={msg.users_profile?.username || "anonymous"}
                body={msg.body}
                createdAt={msg.created_at}
                isOwn={msg.user_id === userId}
                replyToUsername={replyTarget?.users_profile?.username || null}
                replyToBody={replyTarget?.body ? (replyTarget.body.length > 50 ? replyTarget.body.slice(0, 50) + "…" : replyTarget.body) : null}
              />
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Compose */}
      <div className="border-t border-border bg-surface p-3 pb-[env(safe-area-inset-bottom)]">
        <form onSubmit={handleSend} className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            placeholder="Say something..."
            rows={1}
            className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
          <Button type="submit" size="sm" loading={sending} disabled={!newMessage.trim()}>
            Send
          </Button>
        </form>
      </div>
    </div>
  );
}
