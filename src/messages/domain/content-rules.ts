import type { MessageType } from './states';

export const MAX_DATA_BYTES = 140;
export const MAX_MMS_BYTES = 1024 * 1024;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export interface AttachmentInput {
  contentType: string;
  name?: string;
  data: string;
}

export interface MessageContentInput {
  type: MessageType;
  text?: string;
  data?: string;
  port?: number;
  subject?: string;
  attachments?: AttachmentInput[];
  deviceId?: string;
  simSlot?: number;
  scheduleAt?: Date;
  validUntil?: Date;
}

export function isBase64(value: string): boolean {
  return value.length % 4 === 0 && BASE64.test(value);
}

export function decodedLength(base64: string): number {
  return Buffer.from(base64, 'base64').length;
}

function forbid(input: MessageContentInput, fields: (keyof MessageContentInput)[]): string[] {
  return fields.filter((field) => input[field] !== undefined).map((field) => `${field} is not allowed for ${input.type} messages`);
}

function typeErrors(input: MessageContentInput): string[] {
  switch (input.type) {
    case 'sms':
      return [...(input.text ? [] : ['text is required for sms messages']), ...forbid(input, ['data', 'port', 'subject', 'attachments'])];
    case 'data': {
      const errors = forbid(input, ['text', 'subject', 'attachments']);
      if (input.port === undefined) {
        errors.push('port is required for data messages');
      }
      if (!input.data || !isBase64(input.data)) {
        errors.push('data must be base64');
      } else if (decodedLength(input.data) === 0 || decodedLength(input.data) > MAX_DATA_BYTES) {
        errors.push(`data must decode to 1 to ${MAX_DATA_BYTES} bytes`);
      }
      return errors;
    }
    case 'mms': {
      const errors = forbid(input, ['data', 'port']);
      const attachments = input.attachments ?? [];
      if (!input.text && attachments.length === 0) {
        errors.push('mms messages need text or at least one attachment');
      }
      if (attachments.some((attachment) => !attachment.data || !isBase64(attachment.data))) {
        errors.push('attachments data must be base64');
      } else if (attachments.reduce((sum, attachment) => sum + decodedLength(attachment.data), 0) > MAX_MMS_BYTES) {
        errors.push('attachments must be at most 1 MiB in total');
      }
      return errors;
    }
  }
}

export function validateMessageContent(input: MessageContentInput, now: Date): string[] {
  const errors = typeErrors(input);
  if (input.simSlot !== undefined && input.deviceId === undefined) {
    errors.push('simSlot requires deviceId');
  }
  if (input.validUntil && input.validUntil <= now) {
    errors.push('validUntil must be in the future');
  }
  if (input.validUntil && input.scheduleAt && input.validUntil <= input.scheduleAt) {
    errors.push('validUntil must be after scheduleAt');
  }
  return errors;
}
