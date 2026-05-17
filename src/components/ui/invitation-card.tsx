"use client";

import { Button } from "./button";
import { Card } from "./card";
import { Badge } from "./badge";

interface InvitationCardProps {
  roomName: string;
  reason: string;
  safetyTier: "GREEN" | "YELLOW" | "RED";
  memberCount: number;
  onAccept: () => void;
  onDecline: () => void;
  loading?: boolean;
}

const tierBadge = {
  GREEN: { variant: "green" as const, label: "Open" },
  YELLOW: { variant: "yellow" as const, label: "Sensitive" },
  RED: { variant: "red" as const, label: "Safe space" },
};

export function InvitationCard({
  roomName,
  reason,
  safetyTier,
  memberCount,
  onAccept,
  onDecline,
  loading,
}: InvitationCardProps) {
  const tier = tierBadge[safetyTier];

  return (
    <Card>
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-sm text-text-primary">{roomName}</h3>
        <Badge variant={tier.variant}>{tier.label}</Badge>
      </div>
      <p className="text-xs text-text-secondary mb-1">{reason}</p>
      <p className="text-xs text-text-tertiary mb-3">{memberCount} members</p>
      <div className="flex gap-2">
        <Button size="sm" onClick={onAccept} loading={loading}>
          Join room
        </Button>
        <Button size="sm" variant="ghost" onClick={onDecline} disabled={loading}>
          Not now
        </Button>
      </div>
    </Card>
  );
}
