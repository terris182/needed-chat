import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
}

export function Card({ className, padded = true, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "bg-surface rounded-lg border border-border",
        padded && "p-4",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
