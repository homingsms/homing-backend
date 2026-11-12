import { matchOptOut } from './opt-out';

const keywords = ['STOP', 'UNSUBSCRIBE'];

describe('matchOptOut', () => {
  it('matches whole-message keywords in any case', () => {
    expect(matchOptOut('stop', keywords)).toBe('STOP');
    expect(matchOptOut('  Unsubscribe! ', keywords)).toBe('UNSUBSCRIBE');
  });

  it('ignores keywords inside longer messages', () => {
    expect(matchOptOut('please stop calling', keywords)).toBeNull();
    expect(matchOptOut(null, keywords)).toBeNull();
  });
});
