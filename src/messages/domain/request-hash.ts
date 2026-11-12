import { canonicalJson } from '@/common/crypto/canonical-json';
import { sha256Hex } from '@/common/crypto/secrets';
import type { AttachmentInput, MessageContentInput } from './content-rules';
import type { MessagePriority } from './states';

export interface HashableMessageRequest extends MessageContentInput {
  to: string;
  priority?: MessagePriority;
  deliveryReport?: boolean;
  metadata?: Record<string, string>;
}

function attachmentFingerprint(attachment: AttachmentInput) {
  return { contentType: attachment.contentType, name: attachment.name ?? null, sha256: sha256Hex(attachment.data) };
}

export function messageRequestHash(request: HashableMessageRequest): string {
  return sha256Hex(
    canonicalJson({
      type: request.type,
      to: request.to,
      text: request.text ?? null,
      data: request.data ?? null,
      port: request.port ?? null,
      subject: request.subject ?? null,
      attachments: (request.attachments ?? []).map(attachmentFingerprint),
      deviceId: request.deviceId ?? null,
      simSlot: request.simSlot ?? null,
      scheduleAt: request.scheduleAt?.toISOString() ?? null,
      validUntil: request.validUntil?.toISOString() ?? null,
      priority: request.priority ?? 'normal',
      deliveryReport: request.deliveryReport ?? true,
      metadata: request.metadata ?? {},
    }),
  );
}
