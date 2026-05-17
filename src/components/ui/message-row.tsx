import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface MessageRowProps {
  username: string;
  body: string;
  createdAt: string;
  isOwn?: boolean;
  className?: string;
}

export function MessageRow({ username, body, createdAt, isOwn, className }: MessageRowProps) {
  return (
    <div className={cn("flex flex-col gap-0.5 px-4 py-1.5", isOwn && "items-end", className)}>
      <div className="flex items-baseline gap-2">
        <span className={cn("text-xs font-medium", isOwn ? "text-accent" : "text-text-secondary")}>
          {username}
        </span>
        <span className="text-[10px] text-text-tertiary">
          {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
        </span>
      </div>
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
    </div>
  );
}
