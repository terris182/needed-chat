import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

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
}: MessageRowProps) {
  return (
    <div className={cn("group flex flex-col gap-0.5 px-4 py-1.5", isOwn && "items-end", className)}>
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
      <div className={cn("flex items-end gap-1.5", isOwn && "flex-row-reverse")}>
        <div
          className={cn(
            "max-w-[85%] rounded-lg px-3 py-2 text-sm",
            isOwn
              ? "bg-accent text-white rounded-br-sm"
              : "bg-border-light text-text-primary rounded-bl-sm"
          )}
        >
          {body}
        </div>
        {onTapReply && !isOwn && (
          <button
            onClick={onTapReply}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-text-tertiary hover:text-text-secondary p-1"
            title="Reply"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 10V5.5C3 4.11929 4.11929 3 5.5 3H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M5.5 7.5L3 10L5.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
