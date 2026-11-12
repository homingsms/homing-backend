export function retryDelayMs(failedAttempts: number, baseDelayMs: number): number {
  return baseDelayMs * 2 ** Math.max(0, failedAttempts - 1);
}
