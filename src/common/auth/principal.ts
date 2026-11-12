import type { Scope } from './scopes';

export interface SessionPrincipal {
  kind: 'session';
  accountId: string;
  userId: string;
  sessionId: string;
}

export interface ApiKeyPrincipal {
  kind: 'apiKey';
  accountId: string;
  apiKeyId: string;
  scopes: Scope[];
}

export type Principal = SessionPrincipal | ApiKeyPrincipal;

export interface DevicePrincipal {
  id: string;
  accountId: string;
}
