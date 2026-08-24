import { describe, expect, it } from 'vitest';
import {
  isQaRevealMode,
  progressiveScrollOffsets,
} from '../../src/lib/qa/reveal-safe';

describe('Full-page QA reveal-safe', () => {
  it('qa=1 and data-qa-reveal force visible mode', () => {
    expect(isQaRevealMode('?qa=1')).toBe(true);
    expect(isQaRevealMode('qa=1')).toBe(true);
    expect(isQaRevealMode('', '1')).toBe(true);
    expect(isQaRevealMode('')).toBe(false);
    expect(isQaRevealMode('?foo=1')).toBe(false);
  });

  it('progressive scroll covers full page height', () => {
    const offsets = progressiveScrollOffsets(4000, 900);
    expect(offsets[0]).toBe(0);
    expect(offsets[offsets.length - 1]).toBe(4000 - 900);
    expect(offsets.length).toBeGreaterThan(3);
  });
});
