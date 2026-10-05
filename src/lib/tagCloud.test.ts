// countTags / tagWeight / topTags — the pure half of TagCloud. The counting case
// runs over the repo's REAL content tree, parsed with the real frontmatter parser,
// so a drifted fixture cannot agree with the code by accident (ways_of_working §4).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from './frontmatter';
import { countTags, tagWeight, topTags, type TagCount } from './tagCloud';

const CONTENT_ROOT = '/app/content/';

/** Every .mdx under the repo's content/ as a metadata map keyed the way the
 *  store keys it (absolute module path under the app root). */
const realCorpusMetadata = (): Record<string, { tags?: unknown }> => {
  const dir = join(process.cwd(), 'content');
  const walk = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.mdx') ? [join(d, e.name)] : [],
    );
  const files: Record<string, { tags?: unknown }> = {};
  for (const abs of walk(dir)) {
    const { data } = parseFrontmatter(readFileSync(abs, 'utf8'));
    files[CONTENT_ROOT + abs.slice(dir.length + 1)] = { tags: (data as { tags?: unknown }).tags };
  }
  return files;
};

/** The same count, computed independently in the test from the same parsed map. */
const expectCounts = (files: Record<string, { tags?: unknown }>): TagCount[] => {
  const counts = new Map<string, number>();
  for (const [p, m] of Object.entries(files)) {
    if (!p.startsWith(CONTENT_ROOT)) continue;
    for (const t of Array.isArray(m.tags) ? (m.tags as string[]) : []) {
      if (t.startsWith('ui/')) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return [...counts.keys()].sort().map((tag) => ({ tag, count: counts.get(tag)! }));
};

describe('countTags', () => {
  it('over the real corpus, equals the independent count and carries no ui/ tag', () => {
    const files = realCorpusMetadata();
    expect(Object.keys(files).length).toBeGreaterThan(0);
    const result = countTags(files, CONTENT_ROOT);
    expect(result).toEqual(expectCounts(files));
    expect(result.some(({ tag }) => tag.startsWith('ui/'))).toBe(false);
  });

  it('ignores entries outside the content root and non-array tags', () => {
    const result = countTags(
      {
        '/app/content/a.mdx': { tags: ['x'] },
        '/other/b.mdx': { tags: ['x'] },
        '/app/content/c.mdx': { tags: 'x' },
        '/app/content/d.mdx': null,
      },
      CONTENT_ROOT,
    );
    expect(result).toEqual([{ tag: 'x', count: 1 }]);
  });
});

describe('tagWeight', () => {
  it('gives the minimum 0 and the maximum 1', () => {
    expect(tagWeight(1, 1, 191)).toBe(0);
    expect(tagWeight(191, 1, 191)).toBe(1);
  });

  it('is strictly increasing over the real corpus spread (1, 15, 191)', () => {
    const w = [1, 15, 191].map((c) => tagWeight(c, 1, 191));
    expect(w[0]!).toBeLessThan(w[1]!);
    expect(w[1]!).toBeLessThan(w[2]!);
    // Logarithmic: a tag 15x the minimum sits well under the arithmetic midpoint.
    expect(w[1]!).toBeLessThan(0.6);
  });

  it('clamps a count beyond the range', () => {
    expect(tagWeight(10_000, 1, 191)).toBe(1);
  });

  it('returns 0 when there is no spread (one tag, or all equal)', () => {
    expect(tagWeight(7, 7, 7)).toBe(0);
  });

  it('returns 0 for a count below 1 or a non-finite count', () => {
    expect(tagWeight(0, 1, 10)).toBe(0);
    expect(tagWeight(Number.NaN, 1, 10)).toBe(0);
  });
});

describe('topTags', () => {
  const five: TagCount[] = [
    { tag: 'alpha', count: 3 },
    { tag: 'beta', count: 9 },
    { tag: 'gamma', count: 12 },
    { tag: 'delta', count: 12 },
    { tag: 'epsilon', count: 1 },
  ];

  it('keeps the N highest counts and returns them in tag order', () => {
    expect(topTags(five, 2).map((t) => t.tag)).toEqual(['delta', 'gamma']);
  });

  it('breaks a tie at the cut by tag name', () => {
    // beta(9) and a tie between gamma/delta(12): limit 2 takes delta+gamma; a
    // tie AT the cut (limit 3 leaves beta out) — add a second 9 to force it.
    const withTie: TagCount[] = [...five.slice(0, 2), { tag: 'zed', count: 9 }, ...five.slice(2)];
    expect(topTags(withTie, 3).map((t) => t.tag)).toEqual(['beta', 'delta', 'gamma']);
  });

  it('returns the input when no limit is given', () => {
    expect(topTags(five)).toBe(five);
  });
});
