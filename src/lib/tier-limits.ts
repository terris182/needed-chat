// Tier-based limits (BUILD_PLAN §13, §18)

export const TIER_LIMITS = {
  free: { maxRooms: 3, ads: true, journalDays: 7, synthesis: false, canCreateRoom: false },
  plus: { maxRooms: 25, ads: false, journalDays: Infinity, synthesis: true, canCreateRoom: false },
  host: { maxRooms: 25, ads: false, journalDays: Infinity, synthesis: true, canCreateRoom: true },
  admin: { maxRooms: Infinity, ads: false, journalDays: Infinity, synthesis: true, canCreateRoom: true },
} as const;

export type SubscriptionTier = keyof typeof TIER_LIMITS;

export function getTierLimits(tier: SubscriptionTier) {
  return TIER_LIMITS[tier] ?? TIER_LIMITS.free;
}

export function canJoinRoom(tier: SubscriptionTier, currentRoomCount: number): boolean {
  return currentRoomCount < getTierLimits(tier).maxRooms;
}
