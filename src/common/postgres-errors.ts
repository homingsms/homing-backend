export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const direct = 'code' in error && error.code === '23505';
  const cause = 'cause' in error ? error.cause : undefined;
  return direct || (cause !== undefined && isUniqueViolation(cause));
}
