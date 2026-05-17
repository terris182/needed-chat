import { Card } from "./card";

interface PinnedPromptCardProps {
  prompt: string;
  responseCount?: number;
}

export function PinnedPromptCard({ prompt, responseCount }: PinnedPromptCardProps) {
  return (
    <Card className="bg-accent-light border-accent/20">
      <p className="text-sm font-medium text-accent">{prompt}</p>
      {responseCount !== undefined && (
        <p className="text-xs text-text-tertiary mt-1">{responseCount} responses today</p>
      )}
    </Card>
  );
}
