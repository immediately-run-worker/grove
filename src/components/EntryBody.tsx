/* eslint-disable @typescript-eslint/no-explicit-any */
// `<EntryBody/>` — ONE entry's content region (R3-872, APP_CUSTOMIZATION §4.1):
// the header (with its edit affordance), the body on the safe or compiled path
// exactly as the stock page renders it, the metadata line and the tags. Carved
// out of PageView so `GroveEntry` (and any shell composing several entries on one
// page) renders the same thing the stock page does — there is one entry renderer.
//
// Reads the shell context NON-throwing (the stock page provides it; a bare
// library-mode composition does not) and derives anything missing from the
// entryKey itself — one derivation, two possible readers.
import { useEffect, useState } from 'react';
import { useContext } from 'react';
import { Include, useFileMetadata } from '@immediately-run/sdk';
import { GroveShellContext } from '../lib/shell';
import { keyToInclude, homeKey } from '../lib/content';
import { resolvePageLayout } from '../lib/layout';
import { readingTime, stripFrontmatter } from '../lib/wiki';
import { keyToFsPath } from '../lib/content';
import { resolveSafeRender } from '../lib/renderMode';
import { useEditAffordance } from '../hooks/useEditAffordance';
import fs from 'fs';
import EntryHeader from './EntryHeader';
import SafeEntryBody from './SafeEntryBody';
import ScrollToFragment from './ScrollToFragment';
import Toc from './Toc';
import Backlinks from './Backlinks';

declare const module: any;

/** The reading-time minutes for one entry — read the body once per entry.
 *  `enabled` gates the read (hooks may not be conditional): the stock page's shell
 *  computes `mins` once already, and a second read per navigation is the
 *  double-read this flag exists to prevent (review round 1). */
function useReadingTimeMins(entryKey: string, enabled: boolean): number {
  const [mins, setMins] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMins(0);
    fs.promises
      .readFile(keyToFsPath(entryKey), 'utf8')
      .then((b: unknown) => {
        if (active) setMins(readingTime(stripFrontmatter(String(b))));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [entryKey, enabled]);
  return mins;
}

export default function EntryBody({ entryKey }: { entryKey: string }) {
  const sh = useContext(GroveShellContext);
  const meta = useFileMetadata(entryKey) as any;
  const homeMeta = useFileMetadata(homeKey()) as any;
  // The shell's values win when present (the stock page derives them once);
  // standalone, the same expressions run here.
  const includePath = sh?.includePath ?? keyToInclude(entryKey);
  const layout = sh?.layout ?? resolvePageLayout(meta);
  const showRails = sh?.showRails ?? (layout === 'doc' && !meta?.view);
  const safe = sh?.safe ?? resolveSafeRender(homeMeta, meta);
  const vw = sh?.vw ?? 'desktop';
  const localMins = useReadingTimeMins(entryKey, !sh); // the shell computes it on the stock page
  const mins = sh?.mins ?? localMins;

  return (
    <article className="grove-page" data-layout={layout}>
      <div className="gp-main">
        {sh ? (
          <EntryHeader
            entryKey={entryKey}
            writable={sh.writable}
            mins={mins}
            affordance={{ busy: sh.editBusy, refused: sh.editRefused, openEditor: sh.openEditor, hint: sh.editHint }}
          />
        ) : (
          // Standalone (library mode): the header's affordance derives itself —
          // the mount's live answer, exactly what the shell would have carried.
          <StandaloneHeader entryKey={entryKey} mins={mins} />
        )}
        {showRails && vw === 'mobile' ? (
          <details className="grove-toc__disclosure">
            <summary>On this page</summary>
            <Toc entryKey={entryKey} />
          </details>
        ) : null}
        <div className="grove-prose">
          {/* Interpreter mode (R3-213) renders the raw entry as data — no author JS runs;
              executable mode compiles + runs the MDX via <Include>. Both are supported,
              and since R3-252 the choice is per-entry as well as wiki-wide.

              `key={entryKey}` forces an unmount across a client-side navigation. Without
              it React reuses this subtree and keeps the PREVIOUS document mounted while
              the new one compiles, so `#sec-4` resolves against the wrong entry — every
              entry here numbers its sections from 1, so that lookup always succeeds and
              always lands wrong. Measured on the host: a citation to core_concepts §4
              ("4 — Principal") scrolled to a different document's "4. The provider-facing
              contract" (R3-249's hazard, reintroduced).

              R3-872: BOTH paths now carry the `data-entry` marker (the compiled path's
              omission predates entry-scoped fragment resolution). On the compiled path
              the marker is present while the body compiles — that reads as "scoped, not
              yet found", and `resolveFragmentTarget`'s null-until-found is exactly the
              wait the caller needs; the marker means "this subtree is entry X's region",
              and an uncommitted body contains no fragment target to find, so the old
              claim-too-early failure has no path to fire. */}
          {safe ? (
            <SafeEntryBody entryKey={entryKey} />
          ) : (
            <div className="grove-entry-body" key={entryKey} data-entry={entryKey}>
              <Include filename={includePath} baseModule={module} />
              <ScrollToFragment entryKey={entryKey} />
            </div>
          )}
        </div>
        {showRails ? <Backlinks /> : null}
      </div>
      {showRails && vw === 'desktop' ? <Toc entryKey={entryKey} /> : null}
    </article>
  );
}

/** The header for a shell-less composition: the edit affordance derives itself
 *  from the live mount set (the hook only runs on this path — no double
 *  subscription on the stock page). */
function StandaloneHeader({ entryKey, mins }: { entryKey: string; mins: number }) {
  const local = useEditAffordance();
  return (
    <EntryHeader
      entryKey={entryKey}
      writable={local.writable}
      mins={mins}
      affordance={{ busy: local.busy, refused: local.refused, openEditor: local.openEditor, hint: local.editHint }}
    />
  );
}
