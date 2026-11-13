import { hasRole } from './roles';

describe('hasRole', () => {
  it.each([
    ['owner', 'owner', true],
    ['owner', 'admin', true],
    ['owner', 'member', true],
    ['admin', 'owner', false],
    ['admin', 'admin', true],
    ['admin', 'member', true],
    ['member', 'owner', false],
    ['member', 'admin', false],
    ['member', 'member', true],
  ] as const)('%s meets %s: %s', (actual, required, expected) => {
    expect(hasRole(actual, required)).toBe(expected);
  });
});
