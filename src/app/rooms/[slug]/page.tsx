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
  metadata?: { context_prompt?: string } | null;
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
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string; body: string } | null>(null);
  const [reactions, setReactions] = useState<Record<string, { emoji: string; count: number; users: string[] }[]>>({});
  const lastUserActivityRef = useRef<string>(new Date().toISOString());
  const botLoopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const botPaceRef = useRef<"active" | "slow" | "stopped">("active");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [myUsername, setMyUsername] = useState<string>("");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    // "near bottom" if within ~120px of the end
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  // Only auto-scroll when the user is already at the bottom — don't yank them
  // away while they're reading older messages.
  useEffect(() => {
    if (atBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Load room + user + initial messages
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingRoom(false); return; }
      setUserId(user.id);
      supabase
        .from("users_profile")
        .select("username")
        .eq("id", user.id)
        .single()
        .then(({ data }: any) => { if (data?.username) setMyUsername(data.username); });

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
        if (msgs) {
          setMessages(msgs as Message[]);
          // Fetch reactions for all messages
          const msgIds = msgs.map((m: any) => m.id);
          if (msgIds.length > 0) {
            const { data: rxns } = await supabase
              .from("message_reactions")
              .select("message_id, emoji, user_id")
              .in("message_id", msgIds);
            if (rxns) {
              const rxnMap: Record<string, { emoji: string; count: number; users: string[] }[]> = {};
              for (const r of rxns as any[]) {
                if (!rxnMap[r.message_id]) rxnMap[r.message_id] = [];
                const existing = rxnMap[r.message_id].find((x: any) => x.emoji === r.emoji);
                if (existing) {
                  existing.count++;
                  existing.users.push(r.user_id);
                } else {
                  rxnMap[r.message_id].push({ emoji: r.emoji, count: 1, users: [r.user_id] });
                }
              }
              setReactions(rxnMap);
            }
          }
        }
      }
      setLoadingRoom(false);
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
          setMessages((prev) => {
            // Already have this message (avoid double-insert)
            if (prev.some((m) => m.id === msg.id)) return prev;
            // Reconcile an optimistic placeholder from this user with the same text
            const idx = prev.findIndex(
              (m) => (m as any)._optimistic && m.user_id === msg.user_id && m.body === msg.body
            );
            if (idx !== -1) {
              const copy = [...prev];
              copy[idx] = msg as Message;
              return copy;
            }
            return [...prev, msg as Message];
          });
        }
      )
      .subscribe();

    // Also subscribe to reaction changes
    const rxnChannel = supabase
      .channel(`reactions:${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
        },
        async () => {
          // Refetch all reactions for current messages
          const msgIds = messages.map((m) => m.id);
          if (msgIds.length === 0) return;
          const { data: rxns } = await supabase
            .from("message_reactions")
            .select("message_id, emoji, user_id")
            .in("message_id", msgIds);
          if (rxns) {
            const rxnMap: Record<string, { emoji: string; count: number; users: string[] }[]> = {};
            for (const r of rxns as any[]) {
              if (!rxnMap[r.message_id]) rxnMap[r.message_id] = [];
              const existing = rxnMap[r.message_id].find((x: any) => x.emoji === r.emoji);
              if (existing) { existing.count++; existing.users.push(r.user_id); }
              else rxnMap[r.message_id].push({ emoji: r.emoji, count: 1, users: [r.user_id] });
            }
            setReactions(rxnMap);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(rxnChannel);
    };
  }, [room, supabase, messages]);

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
    const replyToId = replyingTo?.id || null;
    const replySnapshot = replyingTo;
    const draftSnapshot = newMessage;
    setNewMessage("");
    setReplyingTo(null);

    // Optimistic echo — show the message instantly so sending feels immediate.
    const tempId = `temp-${Date.now()}`;
    const optimistic: any = {
      id: tempId,
      body,
      message_type: "user",
      moderation_status: "safe",
      created_at: new Date().toISOString(),
      user_id: userId,
      reply_to_id: replyToId,
      users_profile: { username: myUsername || "you" },
      _optimistic: true,
      _replyTarget: replySnapshot
        ? { id: replySnapshot.id, body: replySnapshot.body, users_profile: { username: replySnapshot.username } }
        : undefined,
    };
    atBottomRef.current = true;
    setMessages((prev) => [...prev, optimistic as Message]);

    const rollback = (msg: string) => {
      setMessages((prev) => prev.filter((m) => m.id !== tempId && !(m as any)._blockedId));
      setNewMessage((cur) => cur || draftSnapshot);
      if (replySnapshot) setReplyingTo(replySnapshot);
      showToast(msg);
    };

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
      const { data: msg, error } = await supabase
        .from("messages")
        .insert({
          room_id: room.id,
          user_id: userId,
          body,
          moderation_status: "pending",
          reply_to_id: replyToId,
        })
        .select("id")
        .single();

      if (error || !msg) {
        rollback("Couldn't send — check your connection and try again.");
        setSending(false);
        return;
      }

      try {
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
          // Remove the optimistic + any echoed copy, and let the user know why.
          setMessages((prev) => prev.filter((m) => m.id !== tempId && m.id !== msg.id));
          setNewMessage((cur) => cur || draftSnapshot);
          showToast("This is a sensitive room — that message touched on something it filters, so it wasn't posted.");
          setSending(false);
          return;
        }
      } catch {
        // Moderation call failed but the message is saved as pending — leave it.
      }
    } else {
      // GREEN: post-publish, async moderation
      const { data: msg, error } = await supabase
        .from("messages")
        .insert({
          room_id: room.id,
          user_id: userId,
          body,
          moderation_status: "safe",
          reply_to_id: replyToId,
        })
        .select("id")
        .single();

      if (error || !msg) {
        rollback("Couldn't send — check your connection and try again.");
        setSending(false);
        return;
      }

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
    if (loadingRoom) {
      // Skeleton while the room loads
      return (
        <div className="flex flex-col h-dvh bg-bg">
          <header className="sticky top-0 z-40 bg-surface border-b border-border px-4 py-3 flex items-center gap-3">
            <span className="text-text-tertiary text-sm">&larr;</span>
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-40 rounded bg-border animate-pulse" />
              <div className="h-2.5 w-24 rounded bg-border-light animate-pulse" />
            </div>
          </header>
          <div className="flex-1 px-4 py-4 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className={`flex ${i % 2 ? "justify-end" : "justify-start"}`}>
                <div className={`h-10 rounded-2xl bg-border-light animate-pulse ${i % 2 ? "w-1/2" : "w-2/3"}`} />
              </div>
            ))}
          </div>
        </div>
      );
    }
    // Loaded but no such room
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-text-secondary text-sm">This room isn&apos;t available anymore.</p>
        <a href="/rooms" className="text-accent text-sm font-medium hover:underline">
          Back to your rooms
        </a>
      </div>
    );
  }

  async function handleReact(messageId: string, emoji: string) {
    if (!userId) return;
    const msgReactions = reactions[messageId] || [];
    const existing = msgReactions.find((r) => r.emoji === emoji);
    const hasReacted = existing?.users.includes(userId);

    if (hasReacted) {
      // Remove reaction
      await supabase
        .from("message_reactions")
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", userId)
        .eq("emoji", emoji);
      setReactions((prev) => {
        const updated = { ...prev };
        const arr = (updated[messageId] || []).map((r) =>
          r.emoji === emoji ? { ...r, count: r.count - 1, users: r.users.filter((u) => u !== userId) } : r
        ).filter((r) => r.count > 0);
        if (arr.length === 0) delete updated[messageId];
        else updated[messageId] = arr;
        return updated;
      });
    } else {
      // Add reaction
      await supabase
        .from("message_reactions")
        .insert({ message_id: messageId, user_id: userId, emoji });
      setReactions((prev) => {
        const updated = { ...prev };
        const arr = [...(updated[messageId] || [])];
        const ex = arr.find((r) => r.emoji === emoji);
        if (ex) {
          ex.count++;
          ex.users.push(userId);
        } else {
          arr.push({ emoji, count: 1, users: [userId] });
        }
        updated[messageId] = arr;
        return updated;
      });
    }
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
      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
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
                contextPrompt={msg.metadata?.context_prompt || null}
                replyToUsername={replyTarget?.users_profile?.username || null}
                replyToBody={replyTarget?.body ? (replyTarget.body.length > 50 ? replyTarget.body.slice(0, 50) + "…" : replyTarget.body) : null}
                onTapReply={() => {
                  setReplyingTo({
                    id: msg.id,
                    username: msg.users_profile?.username || "anonymous",
                    body: msg.body,
                  });
                  inputRef.current?.focus();
                }}
                reactions={(reactions[msg.id] || []).map((r) => ({
                  emoji: r.emoji,
                  count: r.count,
                  hasReacted: r.users.includes(userId || ""),
                }))}
                onReact={(emoji) => handleReact(msg.id, emoji)}
              />
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Transient feedback (send failed / message filtered) */}
      {toast && (
        <div className="px-3 pb-1.5">
          <div
            role="status"
            className="text-xs text-text-secondary bg-surface border border-border rounded-lg px-3 py-2 shadow-sm"
          >
            {toast}
          </div>
        </div>
      )}

      {/* Compose */}
      <div className="border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
        {replyingTo && (
          <div className="flex items-center gap-2 px-3 pt-2 pb-1">
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className="shrink-0 text-text-tertiary">
              <path d="M2 8V4C2 2.89543 2.89543 2 4 2H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M4 6L2 8L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div className="flex-1 min-w-0 text-xs text-text-secondary truncate">
              <span className="font-medium">{replyingTo.username}</span>{" "}
              <span className="text-text-tertiary">{replyingTo.body.length > 60 ? replyingTo.body.slice(0, 60) + "…" : replyingTo.body}</span>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="text-text-tertiary hover:text-text-primary p-0.5"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M4 4L10 10M10 4L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        )}
        <form onSubmit={handleSend} className="flex gap-2 items-end p-3 pt-1.5">
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
