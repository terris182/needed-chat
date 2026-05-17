import { cn } from "@/lib/utils";
import { Badge } from "./badge";

interface RoomTileProps {
  name: string;
  description?: string;
  memberCount: number;
  activeNow?: number;
  safetyTier: "GREEN" | "YELLOW" | "RED";
  hasUnread?: boolean;
  onClick?: () => void;
  className?: string;
}

const tierBadge = {
  GREEN: { variant: "green" as const, label: "Open" },
  YELLOW: { variant: "yellow" as const, label: "Sensitive" },
  RED: { variant: "red" as const, label: "Safe space" },
};

export function RoomTile({
  name,
  description,
  memberCount,
  activeNow,
  safetyTier,
  hasUnread,
  onClick,
  className,
}: RoomTileProps) {
  const tier = tierBadge[safetyTier];

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left bg-surface rounded-lg border border-border p-4 transition-colors",
        "hover:border-accent/30 active:bg-accent-light",
        hasUnread && "border-l-2 border-l-accent",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm text-text-primary truncate">{name}</h3>
          {description && (
            <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{description}</p>
          )}
        </div>
        <Badge variant={tier.variant}>{tier.label}</Badge>
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs text-text-tertiary">
        <span>{memberCount} members</span>
        {activeNow !== undefined && activeNow > 0 && (
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green animate-pulse" />
            {activeNow} online
          </span>
        )}
      </div>
    </button>
  );
}
