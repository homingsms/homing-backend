import { validateMessageContent } from './content-rules';

const now = new Date('2026-11-12T10:00:00Z');

describe('validateMessageContent', () => {
  it('accepts a plain SMS', () => {
    expect(validateMessageContent({ type: 'sms', text: 'hello' }, now)).toEqual([]);
  });

  it('requires the fields of each type and rejects foreign ones', () => {
    expect(validateMessageContent({ type: 'sms' }, now)).toContain('text is required for sms messages');
    expect(validateMessageContent({ type: 'sms', text: 'x', port: 80 }, now)).toContain('port is not allowed for sms messages');
    expect(validateMessageContent({ type: 'data', data: 'AQID' }, now)).toContain('port is required for data messages');
    expect(validateMessageContent({ type: 'mms' }, now)).toContain('mms messages need text or at least one attachment');
  });

  it('checks base64 payload sizes', () => {
    expect(validateMessageContent({ type: 'data', data: 'not base64!', port: 9200 }, now)).toContain('data must be base64');
    const tooLong = Buffer.alloc(141).toString('base64');
    expect(validateMessageContent({ type: 'data', data: tooLong, port: 9200 }, now)).toContain('data must decode to 1 to 140 bytes');
    const big = Buffer.alloc(1024 * 1024 + 1).toString('base64');
    expect(validateMessageContent({ type: 'mms', attachments: [{ contentType: 'image/png', data: big }] }, now)).toContain(
      'attachments must be at most 1 MiB in total',
    );
  });

  it('checks routing and timing options', () => {
    expect(validateMessageContent({ type: 'sms', text: 'x', simSlot: 1 }, now)).toContain('simSlot requires deviceId');
    expect(validateMessageContent({ type: 'sms', text: 'x', validUntil: new Date('2026-11-12T09:00:00Z') }, now)).toContain(
      'validUntil must be in the future',
    );
    expect(
      validateMessageContent(
        { type: 'sms', text: 'x', scheduleAt: new Date('2026-11-13T00:00:00Z'), validUntil: new Date('2026-11-12T12:00:00Z') },
        now,
      ),
    ).toContain('validUntil must be after scheduleAt');
  });
});
