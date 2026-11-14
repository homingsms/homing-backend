import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { CURRENT_TERMS_VERSION } from '@/accounts/terms';
import { ERROR_CODES } from '@/common/http/error-codes';
import { INVITE_ROLES, ROLES } from '@/common/auth/roles';
import { SCOPES } from '@/common/auth/scopes';
import { DEVICE_STATUS_REASON_CODES, DEVICE_STATUSES } from '@/devices/domain/device-status';
import { DEVICE_REPORT_STATES, MESSAGE_PRIORITIES, MESSAGE_STATES, MESSAGE_TYPES } from '@/messages/domain/states';
import { SUBSCRIBABLE_EVENT_TYPES, WEBHOOK_EVENT_TYPES } from '@/webhooks/domain/event-types';

interface SchemaNode {
  enum?: string[];
}

interface Spec {
  components: { schemas: Record<string, SchemaNode> };
}

function loadSpec(name: string): Spec {
  return parse(readFileSync(join(__dirname, '../../packages/contracts/openapi', name), 'utf8')) as Spec;
}

const publicSpec = loadSpec('public.yaml');
const deviceSpec = loadSpec('device.yaml');
const enumOf = (spec: Spec, schema: string) => spec.components.schemas[schema]?.enum;

describe('server enums match the OpenAPI contracts', () => {
  it.each([
    ['Scope', SCOPES],
    ['MessageState', MESSAGE_STATES],
    ['MessageType', MESSAGE_TYPES],
    ['MessagePriority', MESSAGE_PRIORITIES],
    ['WebhookEventType', WEBHOOK_EVENT_TYPES],
    ['SubscribableEventType', SUBSCRIBABLE_EVENT_TYPES],
    ['Role', ROLES],
    ['InviteRole', INVITE_ROLES],
    ['DeviceStatus', DEVICE_STATUSES],
    ['DevicePresence', ['online', 'offline']],
    ['DeviceStatusReasonCode', DEVICE_STATUS_REASON_CODES],
    ['ErrorCode', ERROR_CODES],
    ['TermsVersion', [CURRENT_TERMS_VERSION]],
  ])('public %s', (schema, values) => {
    expect(enumOf(publicSpec, schema)).toEqual([...values]);
  });

  it('terms version and error codes in the contracts package match the server', () => {
    const source = readFileSync(join(__dirname, '../../packages/contracts/src/index.ts'), 'utf8');
    expect(source).toContain(`export const CURRENT_TERMS_VERSION = '${CURRENT_TERMS_VERSION}' satisfies TermsVersion;`);
    expect(source).toContain(
      `export const ERROR_CODES = [${ERROR_CODES.map((code) => `'${code}'`).join(', ')}] as const satisfies readonly ErrorCode[];`,
    );
  });

  it('device report states', () => {
    expect(enumOf(deviceSpec, 'DeviceReportState')).toEqual([...DEVICE_REPORT_STATES]);
    expect(enumOf(deviceSpec, 'MessageType')).toEqual([...MESSAGE_TYPES]);
  });
});
