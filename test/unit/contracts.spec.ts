import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { SCOPES } from '@/common/auth/scopes';
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
  ])('public %s', (schema, values) => {
    expect(enumOf(publicSpec, schema)).toEqual([...values]);
  });

  it('device report states', () => {
    expect(enumOf(deviceSpec, 'DeviceReportState')).toEqual([...DEVICE_REPORT_STATES]);
    expect(enumOf(deviceSpec, 'MessageType')).toEqual([...MESSAGE_TYPES]);
  });
});
