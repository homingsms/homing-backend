export const SCOPES = [
  'messages:send',
  'messages:read',
  'inbox:read',
  'webhooks:manage',
  'devices:manage',
  'admin',
] as const;

export type Scope = (typeof SCOPES)[number];

export const ADMIN_SCOPE: Scope = 'admin';
