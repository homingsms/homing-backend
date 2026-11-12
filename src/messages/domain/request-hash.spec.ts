import { messageRequestHash } from './request-hash';

describe('messageRequestHash', () => {
  const base = {
    type: 'sms' as const,
    to: '+2348012345678',
    text: 'Your code is 123456',
    metadata: { orderId: '42', customer: 'abc' },
  };

  it('is stable regardless of key order and defaults', () => {
    const reordered = { metadata: { customer: 'abc', orderId: '42' }, text: base.text, to: base.to, type: base.type };
    expect(messageRequestHash(reordered)).toBe(messageRequestHash(base));
    expect(messageRequestHash({ ...base, priority: 'normal', deliveryReport: true })).toBe(messageRequestHash(base));
  });

  it('changes when the content or routing changes', () => {
    const original = messageRequestHash(base);
    expect(messageRequestHash({ ...base, text: 'Your code is 654321' })).not.toBe(original);
    expect(messageRequestHash({ ...base, deviceId: 'dev_a' })).not.toBe(original);
    expect(messageRequestHash({ ...base, priority: 'otp' })).not.toBe(original);
    expect(messageRequestHash({ ...base, scheduleAt: new Date('2030-01-01T00:00:00Z') })).not.toBe(original);
  });

  it('fingerprints attachments by content', () => {
    const mms = { type: 'mms' as const, to: base.to, attachments: [{ contentType: 'image/png', data: 'AAAA' }] };
    expect(messageRequestHash(mms)).toBe(messageRequestHash({ ...mms, attachments: [{ contentType: 'image/png', data: 'AAAA' }] }));
    expect(messageRequestHash(mms)).not.toBe(messageRequestHash({ ...mms, attachments: [{ contentType: 'image/png', data: 'AAAB' }] }));
  });
});
