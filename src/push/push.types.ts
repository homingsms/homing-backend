export const FCM_WAKE_KIND = 'homing.wake';

export type WakeReason = 'messages_pending' | 'settings_changed' | 'device_removed';

export interface WakeTarget {
  id: string;
  fcmToken: string | null;
}

export interface FcmWakeData {
  [key: string]: string;
  kind: typeof FCM_WAKE_KIND;
  reason: WakeReason;
  deviceId: string;
  sentAt: string;
}

export function buildWakeData(deviceId: string, reason: WakeReason, now: Date): FcmWakeData {
  return { kind: FCM_WAKE_KIND, reason, deviceId, sentAt: now.toISOString() };
}
