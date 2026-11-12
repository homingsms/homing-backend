export const MESSAGE_STATES = [
  'scheduled',
  'pending',
  'leased',
  'queued',
  'sending',
  'sent',
  'delivered',
  'failed',
  'cancelled',
  'expired',
] as const;

export type MessageState = (typeof MESSAGE_STATES)[number];

export const DEVICE_REPORT_STATES = ['queued', 'sending', 'sent', 'delivered', 'failed'] as const;
export type DeviceReportState = (typeof DEVICE_REPORT_STATES)[number];

export const FINAL_STATES: readonly MessageState[] = ['delivered', 'failed', 'cancelled', 'expired'];
export const CANCELLABLE_STATES: readonly MessageState[] = ['scheduled', 'pending', 'leased'];
export const IN_FLIGHT_STATES: readonly MessageState[] = ['leased', 'queued', 'sending'];

export const MESSAGE_TYPES = ['sms', 'data', 'mms'] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const MESSAGE_PRIORITIES = ['normal', 'otp'] as const;
export type MessagePriority = (typeof MESSAGE_PRIORITIES)[number];
