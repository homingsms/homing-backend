import { canTransition, classifyReport, isCancellable } from './state-machine';
import { MESSAGE_STATES } from './states';

describe('canTransition', () => {
  it('follows the happy path', () => {
    const path = ['scheduled', 'pending', 'leased', 'queued', 'sending', 'sent', 'delivered'] as const;
    for (let index = 1; index < path.length; index += 1) {
      expect(canTransition(path[index - 1]!, path[index]!)).toBe(true);
    }
  });

  it('allows forward jumps and late carrier failures', () => {
    expect(canTransition('leased', 'sent')).toBe(true);
    expect(canTransition('pending', 'queued')).toBe(true);
    expect(canTransition('sent', 'failed')).toBe(true);
  });

  it('never leaves a final state', () => {
    for (const from of ['delivered', 'failed', 'cancelled', 'expired'] as const) {
      for (const to of MESSAGE_STATES) {
        expect(canTransition(from, to)).toBe(false);
      }
    }
  });

  it('never moves backwards in progress', () => {
    expect(canTransition('sent', 'sending')).toBe(false);
    expect(canTransition('queued', 'leased')).toBe(false);
    expect(canTransition('queued', 'pending')).toBe(false);
  });

  it('only cancels before the phone queues the message', () => {
    expect(MESSAGE_STATES.filter(isCancellable)).toEqual(['scheduled', 'pending', 'leased']);
    expect(canTransition('queued', 'cancelled')).toBe(false);
  });

  it('expires only messages that never reached a phone', () => {
    expect(canTransition('pending', 'expired')).toBe(true);
    expect(canTransition('leased', 'expired')).toBe(false);
  });
});

describe('classifyReport', () => {
  it('applies forward reports', () => {
    expect(classifyReport('leased', 'queued')).toEqual({ kind: 'apply' });
    expect(classifyReport('sent', 'delivered')).toEqual({ kind: 'apply' });
    expect(classifyReport('queued', 'failed')).toEqual({ kind: 'apply' });
  });

  it('treats repeated or older reports as duplicates', () => {
    expect(classifyReport('sent', 'sent')).toEqual({ kind: 'duplicate' });
    expect(classifyReport('delivered', 'sending')).toEqual({ kind: 'duplicate' });
    expect(classifyReport('failed', 'failed')).toEqual({ kind: 'duplicate' });
  });

  it('rejects reports for cancelled messages', () => {
    expect(classifyReport('cancelled', 'queued')).toEqual({ kind: 'reject', reason: 'cancelled' });
  });

  it('rejects impossible transitions', () => {
    expect(classifyReport('failed', 'sent')).toEqual({ kind: 'reject', reason: 'invalid_transition' });
    expect(classifyReport('delivered', 'failed')).toEqual({ kind: 'reject', reason: 'invalid_transition' });
    expect(classifyReport('scheduled', 'queued')).toEqual({ kind: 'reject', reason: 'invalid_transition' });
  });
});
