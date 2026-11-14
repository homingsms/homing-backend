import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { CodedBadRequestException } from '@/common/http/error-codes';
import {
  acceptanceContext,
  assertCurrentTermsVersion,
  assertTermsAccepted,
  CURRENT_TERMS_VERSION,
  termsAcceptance,
  termsAcceptanceRequired,
} from './terms';

function codeOf(run: () => void): string | undefined {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as CodedBadRequestException).code;
  }
  return undefined;
}

function fakeRequest(ip: string | undefined, userAgent: string | undefined): Request {
  return { ip, get: (name: string) => (name.toLowerCase() === 'user-agent' ? userAgent : undefined) } as unknown as Request;
}

describe('terms acceptance rules', () => {
  it('uses the dated current version', () => {
    expect(CURRENT_TERMS_VERSION).toBe('2026-11-14');
  });

  it('needs acceptTerms to be exactly true', () => {
    expect(codeOf(() => assertTermsAccepted(undefined, CURRENT_TERMS_VERSION))).toBe('terms_not_accepted');
    expect(codeOf(() => assertTermsAccepted(false, CURRENT_TERMS_VERSION))).toBe('terms_not_accepted');
  });

  it('needs the current version', () => {
    expect(codeOf(() => assertTermsAccepted(true, undefined))).toBe('terms_version_mismatch');
    expect(codeOf(() => assertTermsAccepted(true, '2025-01-01'))).toBe('terms_version_mismatch');
    expect(codeOf(() => assertCurrentTermsVersion('2025-01-01'))).toBe('terms_version_mismatch');
    expect(codeOf(() => assertTermsAccepted(true, CURRENT_TERMS_VERSION))).toBeUndefined();
  });

  it('puts the code and a message list in the error response', () => {
    const error = new CodedBadRequestException('terms_not_accepted', 'nope');
    expect(error.getResponse()).toEqual({ message: ['nope'], code: 'terms_not_accepted' });
  });

  it('asks again when the accepted version is missing or old', () => {
    expect(termsAcceptanceRequired(null)).toBe(true);
    expect(termsAcceptanceRequired('2025-01-01')).toBe(true);
    expect(termsAcceptanceRequired(CURRENT_TERMS_VERSION)).toBe(false);
  });

  it('records the IP and a capped user agent', () => {
    const context = acceptanceContext(fakeRequest('203.0.113.9', 'x'.repeat(600)));
    expect(context.ip).toBe('203.0.113.9');
    expect(context.userAgent).toHaveLength(512);
    expect(acceptanceContext(fakeRequest(undefined, undefined))).toEqual({ ip: null, userAgent: null });
    const at = new Date('2026-11-14T10:00:00Z');
    expect(termsAcceptance(context, at)).toEqual({ version: CURRENT_TERMS_VERSION, acceptedAt: at, ...context });
  });
});
