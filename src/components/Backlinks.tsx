/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState } from 'react';
import fs from 'fs';
import { Link, useFileMetadata, useMetadataQuery } from '@immediately-run/sdk';
import { isContentEntry, keyToFsPath, keyToHref } from '../lib/content';
import { useEntryKey } from '../hooks/useEntryKey';
import { useFollowLink } from '../hooks/useFollowLink';
import { followLinkOnClick } from '../lib/navigationPolicy';
import { backlinkSnippet, bodyLinksTo, crumb, queryPaths } from '../lib/wiki';
import InlineProse from './InlineProse';

interface Hit {
  key: string;
  snippet: string;
}

// One linking entry: title + namespace crumb + the snippet around the link.
function Row({ hit }: { hit: Hit }) {
  const meta = useFileMetadata(hit.key) as any;
  const from = useEntryKey();
  const follow = useFollowLink();
  return (
    <Link
      href={keyToHref(hit.key)}
      className="grove-bl"
      onClick={followLinkOnClick(follow, { key: hit.key, href: keyToHref(hit.key), from })}
    >
      <div className="grove-bl__t">
        <InlineProse text={meta?.title || crumb(hit.key)} trimPeriod />
        <span className="crumb">/{crumb(hit.key)}</span>
      </div>
      <div className="grove-bl__snip" dangerouslySetInnerHTML={{ __html: hit.snippet }} />
    </Link>
  );
}

// `<Backlinks/>` — the signature wiki affordance: who links here. Reads sibling
// entry bodies off the fs and scans for a link to the current entry.
export default function Backlinks() {
  const currentKey = useEntryKey();

  const allKeys = useCallback(
    (fm: Record<string, any>) => Object.keys(fm).filter(isContentEntry),
    []
  );
  const q = useMetadataQuery(allKeys);
  const keys: string[] = queryPaths(q);
  const keysKey = keys.join('|');

  const [hits, setHits] = useState<Hit[] | null>(null);

  useEffect(() => {
    let active = true;
    if (!keys.length) return; // index not loaded yet → keep the skeleton
    const others = keys.filter((k) => k !== currentKey);
    Promise.all(
      others.map((k) =>
        fs.promises
          .readFile(keyToFsPath(k), 'utf8')
          .then((body: unknown) => ({ key: k, body: String(body) }))
          .catch(() => null)
      )
    ).then((rows) => {
      if (!active) return;
      const found: Hit[] = [];
      for (const r of rows) {
        // R3-283: the linking entry's own key is part of the question — corpus links
        // are RELATIVE to the file they are written in, so `r.key` is what resolves them.
        if (r && bodyLinksTo(r.body, currentKey, r.key)) {
          found.push({ key: r.key, snippet: backlinkSnippet(r.body, currentKey, r.key) });
        }
      }
      setHits(found.sort((a, b) => (a.key < b.key ? -1 : 1)));
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, keysKey]);

  // Skeleton while the bodies resolve.
  if (hits === null) {
    return (
      <section className="grove-backlinks">
        <div className="grove-backlinks__h">Backlinks</div>
        <div className="grove-backlinks__list">
          <div className="sk sk-line" style={{ width: '60%' }} />
          <div className="sk sk-line" style={{ width: '40%' }} />
        </div>
      </section>
    );
  }

  return (
    <section className="grove-backlinks">
      <h2 className="grove-backlinks__h">
        Linked from
        <span className="n">{hits.length} {hits.length === 1 ? 'entry' : 'entries'}</span>
      </h2>
      {hits.length ? (
        <div className="grove-backlinks__list">
          {hits.map((h) => (
            <Row key={h.key} hit={h} />
          ))}
        </div>
      ) : (
        <p className="grove-bl__snip">Nothing links here yet.</p>
      )}
    </section>
  );
}
