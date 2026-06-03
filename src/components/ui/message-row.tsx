"use client";

import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useState, useRef } from "react";

const QUICK_EMOJIS = ["🔥", "😂", "💯", "❤️", "😭", "🤔"];

interface Reaction {
  emoji: string;
  count: number;
  hasReacted: boolean;
}

interface MessageRowProps {
  username: string;
  body: string;
  createdAt: string;
  isOwn?: boolean;
  className?: string;
  replyToUsername?: string | null;
  replyToBody?: string | null;
  onReplyClick?: () => void;
  onTapReply?: () => void;
  reactions?: Reaction[];
  onReact?: (emoji: string) => void;
}

export function MessageRow({
  username,
  body,
  createdAt,
  isOwn,
  className,
  replyToUsername,
  replyToBody,
  onReplyClick,
  onTapReply,
  reactions,
  onReact,
}: MessageRowProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => {
      setShowEmojiPicker(true);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleReact = (emoji: string) => {
    onReact?.(emoji);
    setShowEmojiPicker(false);
  };

  return (
    <div className={cn("group relative flex flex-col gap-0.5 px-4 py-1.5", isOwn && "items-end", className)}>
      {/* Reply context indicator */}
      {replyToUsername && replyToBody && (
        <button
          onClick={onReplyClick}
          className={cn(
            "flex items-center gap-1.5 text-[11px] text-text-tertiary hover:text-text-secondary transition-colors max-w-[85%] truncate",
            isOwn && "flex-row-reverse"
          )}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 opacity-50">
            <path d="M2 8V4C2 2.89543 2.89543 2 4 2H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M4 6L2 8L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="truncate">
            <span className="font-medium">{replyToUsername}</span>
            {" "}
            <span className="opacity-70">{replyToBody}</span>
          </span>
        </button>
      )}

      <div className="flex items-baseline gap-2">
        <span className={cn("text-xs font-medium", isOwn ? "text-accent" : "text-text-secondary")}>
          {username}
        </span>
        <span className="text-[10px] text-text-tertiary">
          {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
        </span>
      </div>

      {/* Message bubble + action buttons */}
      <div className={cn("flex items-start gap-1", isOwn && "flex-row-reverse")}>
        <div
          className={cn(
            "max-w-[80%] rounded-lg px-3 py-2 text-sm relative",
            isOwn
              ? "bg-accent text-white rounded-br-sm"
              : "bg-border-light text-text-primary rounded-bl-sm"
          )}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          {body}
        </div>

        {/* Action buttons — visible on hover (desktop) or always subtle (mobile) */}
        {!isOwn && (
          <div className={cn(
            "flex items-center gap-0.5 shrink-0 pt-1",
            "opacity-40 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          )}>
            {onTapReply && (
              <button
                onClick={onTapReply}
                className="text-text-tertiary hover:text-text-secondary p-1 rounded"
                title="Reply"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 10V5.5C3 4.11929 4.11929 3 5.5 3H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M5.5 7.5L3 10L5.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
            {onReact && (
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="text-text-tertiary hover:text-text-secondary p-1 rounded"
                title="React"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
                  <circle cx="5.5" cy="6" r="0.75" fill="currentColor"/>
                  <circle cx="8.5" cy="6" r="0.75" fill="currentColor"/>
                  <path d="M5 9C5.5 9.8 6.2 10 7 10C7.8 10 8.5 9.8 9 9" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Emoji picker popup */}
      {showEmojiPicker && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowEmojiPicker(false)} />
          <div className={cn(
            "absolute z-50 flex gap-1 bg-surface border border-border rounded-full px-2 py-1.5 shadow-lg",
            isOwn ? "right-4" : "left-4",
            "-mt-1"
          )}>
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleReact(emoji)}
                className="text-lg hover:scale-125 transition-transform px-0.5"
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Reaction pills */}
      {reactions && reactions.length > 0 && (
        <div className={cn("flex gap-1 flex-wrap mt-0.5", isOwn && "justify-end")}>
          {reactions.map((r) => (
            <button
              key={r.emoji}
              onClick={() => onReact?.(r.emoji)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border transition-colors",
                r.hasReacted
                  ? "bg-accent/10 border-accent/30 text-accent"
                  : "bg-border-light/50 border-border text-text-secondary hover:border-accent/30"
              )}
            >
              <span>{r.emoji}</span>
              <span>{r.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
