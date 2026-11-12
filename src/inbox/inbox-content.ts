import { isBase64 } from '@/messages/domain/content-rules';
import type { InboxUploadDto } from './dto/push-inbox.dto';

export function inboxUploadErrors(uploads: InboxUploadDto[]): string[] {
  return uploads.flatMap((upload, index) => {
    const prefix = `messages.${index}`;
    const errors: string[] = [];
    if (upload.type === 'sms' && upload.text === undefined) {
      errors.push(`${prefix}.text is required for sms`);
    }
    if (upload.type === 'data' && (!upload.data || !isBase64(upload.data))) {
      errors.push(`${prefix}.data must be base64 for data messages`);
    }
    if ((upload.attachments ?? []).some((attachment) => !isBase64(attachment.data))) {
      errors.push(`${prefix}.attachments data must be base64`);
    }
    return errors;
  });
}
