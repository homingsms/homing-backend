export const ROLES = ['owner', 'admin', 'member'] as const;

export type Role = (typeof ROLES)[number];

export const INVITE_ROLES = ['admin', 'member'] as const satisfies readonly Role[];

export type InviteRole = (typeof INVITE_ROLES)[number];

const RANK: Record<Role, number> = { member: 0, admin: 1, owner: 2 };

export function hasRole(actual: Role, required: Role): boolean {
  return RANK[actual] >= RANK[required];
}
