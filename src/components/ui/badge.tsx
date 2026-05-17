import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type BadgeVariant = "default" | "green" | "yellow" | "red" | "accent";

const variants: Record<BadgeVariant, string> = {
  default: "bg-border-light text-text-secondary",
  green: "bg-green-light text-green",
  yellow: "bg-yellow-light text-yellow",
  red: "bg-red-light text-red",
  accent: "bg-accent-light text-accent",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = "default", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
