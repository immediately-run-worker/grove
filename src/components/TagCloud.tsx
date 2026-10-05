/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { useMetadataQuery } from '@immediately-run/sdk';
import { contentDir } from '../lib/content';
import { queryPaths } from '../lib/wiki';
import { countTags, tagWeight, topTags, type TagCount } from '../lib/tagCloud';

// Import-free engine component: every tag across the site, sized by frequency.
// Chrome tags (`ui/*`) are excluded — they drive layout, not classification.
//
// Sizing: each chip carries its weight as `--tag-weight` and the CSS owns the
// pixels (11.5–22px) — the old `11 + count * 2 + 'px'` inline style had no
// ceiling and let a frequent tag fill the viewport. The wrapper carries the
// `--weighted` modifier so the rule never touches TagList's plain chips, which
// share the `.grove-tagcloud` wrapper class.

// A bad `limit` warns once per distinct value per session — an authored page
// never goes blank over a prop.
const warnedLimits = new Set<string>();

export default function TagCloud({ limit }: { limit?: number }) {
  const limitOk = limit === undefined || (Number.isInteger(limit) && limit > 0);
  useEffect(() => {
    if (limitOk) return;
    const key = String(limit);
    if (warnedLimits.has(key)) return;
    warnedLimits.add(key);
    console.warn(`TagCloud: limit must be a positive integer, got ${key} — showing every tag`);
  }, [limit, limitOk]);

  const queryFn = useCallback((filesMetadata: Record<string, any>) => {
    // The query contract is string-valued, so the pairs ride as `tag:count`
    // (the encoding is unchanged).
    return countTags(filesMetadata, contentDir()).map(({ tag, count }) => `${tag}:${count}`);
  }, []);

  const result = useMetadataQuery(queryFn);
  const entries: string[] = queryPaths(result);
  const pairs: TagCount[] = entries.map((e) => {
    const [tag, count] = e.split(':');
    return { tag: tag!, count: Number(count) };
  });
  const shown = topTags(pairs, limitOk ? limit : undefined);
  const counts = shown.map((p) => p.count);
  const min = Math.min(...counts);
  const max = Math.max(...counts);

  return (
    <div className="grove-tagcloud grove-tagcloud--weighted">
      {shown.map(({ tag, count }) => (
        <span
          key={tag}
          className="grove-tag"
          style={{ '--tag-weight': String(tagWeight(count, min, max)) } as CSSProperties}
        >
          #{tag} <span className="grove-tag__count">{count}</span>
        </span>
      ))}
    </div>
  );
}
