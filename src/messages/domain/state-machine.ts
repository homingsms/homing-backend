import { CANCELLABLE_STATES, type DeviceReportState, FINAL_STATES, type MessageState } from './states';

const PROGRESS: Partial<Record<MessageState, number>> = {
  pending: 0,
  leased: 1,
  queued: 2,
  sending: 3,
  sent: 4,
  delivered: 5,
};

export function isFinal(state: MessageState): boolean {
  return FINAL_STATES.includes(state);
}

export function isCancellable(state: MessageState): boolean {
  return CANCELLABLE_STATES.includes(state);
}

export function canTransition(from: MessageState, to: MessageState): boolean {
  if (from === to || isFinal(from)) {
    return false;
  }
  switch (to) {
    case 'scheduled':
      return false;
    case 'pending':
      return from === 'scheduled' || from === 'leased';
    case 'leased':
      return from === 'pending';
    case 'cancelled':
      return isCancellable(from);
    case 'expired':
      return from === 'scheduled' || from === 'pending';
    case 'failed':
      return true;
    default: {
      const fromRank = PROGRESS[from];
      const toRank = PROGRESS[to];
      return fromRank !== undefined && toRank !== undefined && toRank > fromRank;
    }
  }
}

export type ReportOutcome =
  | { kind: 'apply' }
  | { kind: 'duplicate' }
  | { kind: 'reject'; reason: 'invalid_transition' | 'cancelled' };

export function classifyReport(current: MessageState, reported: DeviceReportState): ReportOutcome {
  if (current === 'cancelled') {
    return { kind: 'reject', reason: 'cancelled' };
  }
  if (current === reported) {
    return { kind: 'duplicate' };
  }
  const currentRank = PROGRESS[current];
  const reportedRank = PROGRESS[reported];
  if (reported !== 'failed' && current !== 'failed' && currentRank !== undefined && reportedRank !== undefined && reportedRank <= currentRank) {
    return { kind: 'duplicate' };
  }
  return canTransition(current, reported) ? { kind: 'apply' } : { kind: 'reject', reason: 'invalid_transition' };
}
