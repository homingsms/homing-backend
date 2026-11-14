import type { Request } from 'express';
import { CodedBadRequestException } from '@/common/http/error-codes';

export const CURRENT_TERMS_VERSION = '2026-11-14';

export const TERMS_NOT_ACCEPTED = 'acceptTerms must be true to create an account';
export const TERMS_VERSION_MISMATCH = `termsVersion must be the current terms version ${CURRENT_TERMS_VERSION}`;

const USER_AGENT_MAX_LENGTH = 512;

export interface TermsAcceptance {
  version: string;
  acceptedAt: Date;
  ip: string | null;
  userAgent: string | null;
}

export interface AcceptanceContext {
  ip: string | null;
  userAgent: string | null;
}

export function acceptanceContext(request: Request): AcceptanceContext {
  const userAgent = request.get('user-agent');
  return {
    ip: request.ip ?? null,
    userAgent: userAgent ? userAgent.slice(0, USER_AGENT_MAX_LENGTH) : null,
  };
}

export function assertCurrentTermsVersion(version: string | undefined): void {
  if (version !== CURRENT_TERMS_VERSION) {
    throw new CodedBadRequestException('terms_version_mismatch', TERMS_VERSION_MISMATCH);
  }
}

export function assertTermsAccepted(acceptTerms: boolean | undefined, version: string | undefined): void {
  if (acceptTerms !== true) {
    throw new CodedBadRequestException('terms_not_accepted', TERMS_NOT_ACCEPTED);
  }
  assertCurrentTermsVersion(version);
}

export function termsAcceptance(context: AcceptanceContext, acceptedAt: Date = new Date()): TermsAcceptance {
  return { version: CURRENT_TERMS_VERSION, acceptedAt, ip: context.ip, userAgent: context.userAgent };
}

export function termsAcceptanceRequired(acceptedVersion: string | null): boolean {
  return acceptedVersion !== CURRENT_TERMS_VERSION;
}
