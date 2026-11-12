export interface DeviceMessageResponse {
  id: string;
  type: 'sms' | 'data' | 'mms';
  to: string;
  text: string | null;
  data: string | null;
  port: number | null;
  subject: string | null;
  attachments: { contentType: string; name: string | null; data: string }[];
  simSlot: number | null;
  priority: 'normal' | 'otp';
  deliveryReport: boolean;
  validUntil: string | null;
  attempt: number;
  leaseExpiresAt: string;
}

export type ReportResultStatus = 'accepted' | 'duplicate' | 'rejected';
export type ReportRejectReason = 'not_found' | 'not_leased_to_device' | 'invalid_transition' | 'cancelled';

export interface StateReportResult {
  messageId: string;
  status: ReportResultStatus;
  reason: ReportRejectReason | null;
}
