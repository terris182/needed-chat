interface AdSlotProps {
  placement: "chat-inline" | "room-door" | "feed";
  roomSafetyTier?: "GREEN" | "YELLOW" | "RED";
  userTier?: "free" | "plus" | "host" | "admin";
}

export function AdSlot({ placement, roomSafetyTier, userTier = "free" }: AdSlotProps) {
  // Plus/Host/Admin: zero ads anywhere (§18)
  if (userTier !== "free") return null;

  // RED rooms: no ads. YELLOW: ads at door only, not in chat. GREEN: ads everywhere.
  if (roomSafetyTier === "RED") return null;
  if (roomSafetyTier === "YELLOW" && placement === "chat-inline") return null;

  // Never on /journal, /onboarding, auth/billing pages (enforced by not rendering AdSlot on those routes)

  return (
    <div className="w-full bg-border-light rounded-md p-3 text-center">
      <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Sponsored</p>
      {/* Real ad integration in Phase 4. FTC-compliant "Sponsored" label always visible. */}
    </div>
  );
}
