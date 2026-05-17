import { Card } from "./card";

interface OnThisDayCardProps {
  date: string;
  label: string;
  excerpt: string;
  roomName: string;
}

export function OnThisDayCard({ date, label, excerpt, roomName }: OnThisDayCardProps) {
  return (
    <Card className="border-accent/15 bg-accent-light/50">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium text-accent">{label}</span>
        <span className="text-[10px] text-text-tertiary">{date}</span>
      </div>
      <p className="text-sm text-text-primary line-clamp-3">{excerpt}</p>
      <p className="text-xs text-text-tertiary mt-1">in {roomName}</p>
    </Card>
  );
}
