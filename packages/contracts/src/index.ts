import type {
  components as PublicComponents,
  operations as PublicOperations,
  paths as PublicPaths,
  webhooks as PublicWebhooks,
} from './generated/public';
import type {
  components as DeviceComponents,
  operations as DeviceOperations,
  paths as DevicePaths,
} from './generated/device';

export type {
  DeviceComponents,
  DeviceOperations,
  DevicePaths,
  PublicComponents,
  PublicOperations,
  PublicPaths,
  PublicWebhooks,
};

type PublicSchemas = PublicComponents['schemas'];
type DeviceSchemas = DeviceComponents['schemas'];

export type ApiError = PublicSchemas['Error'];
export type ErrorCode = PublicSchemas['ErrorCode'];
export type TermsVersion = PublicSchemas['TermsVersion'];
export type AcceptTermsRequest = PublicSchemas['AcceptTermsRequest'];
export type Scope = PublicSchemas['Scope'];
export type User = PublicSchemas['User'];
export type Role = PublicSchemas['Role'];
export type Membership = PublicSchemas['Membership'];
export type SwitchAccountRequest = PublicSchemas['SwitchAccountRequest'];
export type DeleteAccountRequest = PublicSchemas['DeleteAccountRequest'];
export type TeamMember = PublicSchemas['TeamMember'];
export type TeamMemberList = PublicSchemas['TeamMemberList'];
export type UpdateTeamMemberRequest = PublicSchemas['UpdateTeamMemberRequest'];
export type InviteRole = PublicSchemas['InviteRole'];
export type InviteStatus = PublicSchemas['InviteStatus'];
export type Invite = PublicSchemas['Invite'];
export type InviteWithLink = PublicSchemas['InviteWithLink'];
export type InviteList = PublicSchemas['InviteList'];
export type CreateInviteRequest = PublicSchemas['CreateInviteRequest'];
export type InvitePreview = PublicSchemas['InvitePreview'];
export type Account = PublicSchemas['Account'];
export type Session = PublicSchemas['Session'];
export type RoutingStrategy = PublicSchemas['RoutingStrategy'];
export type SignUpRequest = PublicSchemas['SignUpRequest'];
export type SignInRequest = PublicSchemas['SignInRequest'];
export type UpdateAccountRequest = PublicSchemas['UpdateAccountRequest'];
export type ApiKey = PublicSchemas['ApiKey'];
export type ApiKeyWithSecret = PublicSchemas['ApiKeyWithSecret'];
export type ApiKeyList = PublicSchemas['ApiKeyList'];
export type CreateApiKeyRequest = PublicSchemas['CreateApiKeyRequest'];
export type Device = PublicSchemas['Device'];
export type DeviceList = PublicSchemas['DeviceList'];
export type DeviceStatus = PublicSchemas['DeviceStatus'];
export type DevicePresence = PublicSchemas['DevicePresence'];
export type DeviceStatusReason = PublicSchemas['DeviceStatusReason'];
export type DeviceStatusReasonCode = PublicSchemas['DeviceStatusReasonCode'];
export type DeviceHealth = PublicSchemas['DeviceHealth'];
export type Sim = PublicSchemas['Sim'];
export type UpdateDeviceRequest = PublicSchemas['UpdateDeviceRequest'];
export type CreatePairingCodeRequest = PublicSchemas['CreatePairingCodeRequest'];
export type PairingCode = PublicSchemas['PairingCode'];
export type MessageType = PublicSchemas['MessageType'];
export type MessageState = PublicSchemas['MessageState'];
export type MessagePriority = PublicSchemas['MessagePriority'];
export type SendMessageRequest = PublicSchemas['SendMessageRequest'];
export type SendSmsRequest = PublicSchemas['SendSmsRequest'];
export type SendDataSmsRequest = PublicSchemas['SendDataSmsRequest'];
export type SendMmsRequest = PublicSchemas['SendMmsRequest'];
export type Message = PublicSchemas['Message'];
export type MessageDetail = PublicSchemas['MessageDetail'];
export type MessageEvent = PublicSchemas['MessageEvent'];
export type MessageError = PublicSchemas['MessageError'];
export type MessagePage = PublicSchemas['MessagePage'];
export type InboxMessage = PublicSchemas['InboxMessage'];
export type InboxPage = PublicSchemas['InboxPage'];
export type WebhookEventType = PublicSchemas['WebhookEventType'];
export type SubscribableEventType = PublicSchemas['SubscribableEventType'];
export type WebhookEndpoint = PublicSchemas['WebhookEndpoint'];
export type WebhookEndpointWithSecret = PublicSchemas['WebhookEndpointWithSecret'];
export type WebhookEndpointList = PublicSchemas['WebhookEndpointList'];
export type CreateWebhookRequest = PublicSchemas['CreateWebhookRequest'];
export type UpdateWebhookRequest = PublicSchemas['UpdateWebhookRequest'];
export type WebhookSecret = PublicSchemas['WebhookSecret'];
export type WebhookDelivery = PublicSchemas['WebhookDelivery'];
export type WebhookDeliveryStatus = PublicSchemas['WebhookDeliveryStatus'];
export type WebhookDeliveryPage = PublicSchemas['WebhookDeliveryPage'];
export type UsageSummary = PublicSchemas['UsageSummary'];
export type DailyUsage = PublicSchemas['DailyUsage'];
export type DailyUsageList = PublicSchemas['DailyUsageList'];
export type DeviceUsage = PublicSchemas['DeviceUsage'];
export type DeviceUsageList = PublicSchemas['DeviceUsageList'];
export type Health = PublicSchemas['Health'];
export type WebhookEventEnvelope = PublicSchemas['WebhookEventEnvelope'];
export type MessageWebhookEvent = PublicSchemas['MessageWebhookEvent'];
export type InboxWebhookEvent = PublicSchemas['InboxWebhookEvent'];
export type DeviceWebhookEvent = PublicSchemas['DeviceWebhookEvent'];
export type OptOutWebhookEvent = PublicSchemas['OptOutWebhookEvent'];
export type TestWebhookEvent = PublicSchemas['TestWebhookEvent'];
export type WebhookEvent =
  | MessageWebhookEvent
  | InboxWebhookEvent
  | DeviceWebhookEvent
  | OptOutWebhookEvent
  | TestWebhookEvent;

export type PairRequest = DeviceSchemas['PairRequest'];
export type PairResponse = DeviceSchemas['PairResponse'];
export type HeartbeatRequest = DeviceSchemas['HeartbeatRequest'];
export type HeartbeatResponse = DeviceSchemas['HeartbeatResponse'];
export type FcmTokenRequest = DeviceSchemas['FcmTokenRequest'];
export type PullRequest = DeviceSchemas['PullRequest'];
export type PullResponse = DeviceSchemas['PullResponse'];
export type DeviceMessage = DeviceSchemas['DeviceMessage'];
export type DeviceReportState = DeviceSchemas['DeviceReportState'];
export type StateReport = DeviceSchemas['StateReport'];
export type StateReportRequest = DeviceSchemas['StateReportRequest'];
export type StateReportResult = DeviceSchemas['StateReportResult'];
export type StateReportResponse = DeviceSchemas['StateReportResponse'];
export type InboxUpload = DeviceSchemas['InboxUpload'];
export type InboxPushRequest = DeviceSchemas['InboxPushRequest'];
export type InboxPushResponse = DeviceSchemas['InboxPushResponse'];
export type DeviceSettings = DeviceSchemas['DeviceSettings'];
export type FcmWakeData = DeviceSchemas['FcmWakeData'];

export const SCOPES = [
  'messages:send',
  'messages:read',
  'inbox:read',
  'webhooks:manage',
  'devices:manage',
  'admin',
] as const satisfies readonly Scope[];

export const ROLES = ['owner', 'admin', 'member'] as const satisfies readonly Role[];

export const INVITE_ROLES = ['admin', 'member'] as const satisfies readonly InviteRole[];

export const DEVICE_STATUSES = ['online', 'degraded', 'offline'] as const satisfies readonly DeviceStatus[];

export const DEVICE_STATUS_REASON_CODES = [
  'paused',
  'low_battery',
  'no_network',
  'all_sims_disabled',
  'sim_no_signal',
  'device_cap_reached',
  'sim_cap_reached',
  'stale_heartbeat',
] as const satisfies readonly DeviceStatusReasonCode[];

export const MESSAGE_TYPES = ['sms', 'data', 'mms'] as const satisfies readonly MessageType[];

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
] as const satisfies readonly MessageState[];

export const FINAL_MESSAGE_STATES = [
  'delivered',
  'failed',
  'cancelled',
  'expired',
] as const satisfies readonly MessageState[];

export const CANCELLABLE_MESSAGE_STATES = [
  'scheduled',
  'pending',
  'leased',
] as const satisfies readonly MessageState[];

export const DEVICE_REPORT_STATES = [
  'queued',
  'sending',
  'sent',
  'delivered',
  'failed',
] as const satisfies readonly DeviceReportState[];

export const SUBSCRIBABLE_EVENT_TYPES = [
  'message.sent',
  'message.delivered',
  'message.failed',
  'message.cancelled',
  'message.expired',
  'inbox.received',
  'device.online',
  'device.offline',
  'opt_out.received',
] as const satisfies readonly SubscribableEventType[];

export const WEBHOOK_EVENT_TYPES = [
  ...SUBSCRIBABLE_EVENT_TYPES,
  'webhook.test',
] as const satisfies readonly WebhookEventType[];

export const FCM_WAKE_REASONS = [
  'messages_pending',
  'settings_changed',
  'device_removed',
] as const satisfies readonly FcmWakeData['reason'][];

export const ERROR_CODES = ['terms_not_accepted', 'terms_version_mismatch'] as const satisfies readonly ErrorCode[];

export const CURRENT_TERMS_VERSION = '2026-11-14' satisfies TermsVersion;

export const API_BASE_PATH = '/api/v1';
export const SESSION_COOKIE_NAME = 'homing_session';
export const API_KEY_PREFIX = 'hk_live_';
export const DEVICE_TOKEN_PREFIX = 'hd_';
export const WEBHOOK_SECRET_PREFIX = 'whsec_';
export const IDEMPOTENT_REPLAYED_HEADER = 'Idempotent-Replayed';
export const WEBHOOK_SIGNATURE_HEADER = 'Homing-Signature';
export const WEBHOOK_EVENT_ID_HEADER = 'Homing-Event-Id';
export const WEBHOOK_EVENT_TYPE_HEADER = 'Homing-Event-Type';
export const WEBHOOK_SIGNATURE_VERSION = 'v1';
export const WEBHOOK_TOLERANCE_SECONDS = 300;
export const FCM_WAKE_KIND = 'homing.wake';
