import type { InviteRole, Role } from '@/common/auth/roles';

export interface TeamMemberResponse {
  userId: string;
  email: string;
  name: string;
  role: Role;
  joinedAt: string;
}

export type InviteStatus = 'pending' | 'expired';

export interface InviteResponse {
  id: string;
  email: string;
  role: InviteRole;
  status: InviteStatus;
  invitedBy: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface InviteWithLinkResponse extends InviteResponse {
  inviteUrl: string;
}

export interface InvitePreviewResponse {
  accountName: string;
  email: string;
  role: InviteRole;
  invitedBy: string | null;
  expiresAt: string;
}
