/* eslint-disable @typescript-eslint/no-explicit-any */
// `<GroveEntry/>` — one entry from a key (APP_CUSTOMIZATION_SPEC §4.1, R3-872):
// the header with its edit affordance, the body on the safe or compiled path
// exactly as the stock page renders it, the metadata line and the tags, with
// `frame: 'chain' | 'none'` — 'chain' renders through the layout chain (the
// stock page's shape), 'none' renders the bare entry for shells composing
// several entries on one page. Either way it PUBLISHES the entry context, so
// everything inside resolves relative links and anchors against THIS entry
// (R3-871), and the fragment/heading scopes find its body (§4.5).
//
// The stock page renders through GroveEntry fed by the route key — one entry
// renderer, no fork.

import { useContext, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Include, useAllMetadata, useFileMetadata } from '@immediately-run/sdk';
import { EntryContext } from '../hooks/useEntryKey';
import { layoutChainForKey } from '../lib/layout';
import { criticalKeys } from '../lib/criticalKeys';
import { criticalFailure, entryPending } from '../lib/entryGate';
import { CorpusScanContext } from '../lib/corpusScanContext';
import { homeKey } from '../lib/content';
import { resolveSafeRender } from '../lib/renderMode';
import BootMessage from './BootMessage';
import DefaultLayout from './DefaultLayout';
import SafeLayout from './SafeLayout';
import PageView from './PageView';
import EntryBody from './EntryBody';
import { GroveShellContext, OutletContext } from '../lib/shell';

declare const module: any;

// Build the nested render for a layout chain (outermost first). Each layer wraps
// its `_layout.mdx` (or the built-in <DefaultLayout/>) in an OutletContext whose
// value is the node one level inward — so `<Outlet/>` inside a layer renders the
// next layer, and the innermost <Outlet/> renders the page (<PageView/>).
//
// `safe` picks the RENDERER for each layer, exactly as it does for entry bodies in
// <EntryBody/> (R3-263). Before this, every layer went through <Include> whatever the wiki
// declared — so an interpreter-mode wiki still EXECUTED author JavaScript out of its
// `_layout.mdx`, and the non-executable guarantee had a hole in the shell rather than in
// the entries. It is also what makes the chain work at all under dispatch: <Include>
// evaluates an app-source module, which a layout resident in a content mount is not.
function renderLayers(chain: string[], useDefault: boolean, safe: boolean): ReactNode {
  let node: ReactNode = <PageView />;
  if (useDefault) {
    return <OutletContext.Provider value={node}><DefaultLayout /></OutletContext.Provider>;
  }
  for (let i = chain.length - 1; i >= 0; i--) {
    const inner = node;
    node = (
      <OutletContext.Provider value={inner} key={chain[i]}>
        {safe ? <SafeLayout layoutKey={chain[i]} /> : <Include filename={chain[i]} baseModule={module} />}
      </OutletContext.Provider>
    );
  }
  return node;
}

/** The 'chain' frame: the entry inside its layout chain, with the entry gate
 *  (critical-file scan) waiting the body until its render inputs are read. */
function EntryFrame({ entryKey }: { entryKey: string }) {
  const meta = useFileMetadata(entryKey) as any;
  const homeMeta = useFileMetadata(homeKey()) as any;
  const allMeta = useAllMetadata() as Record<string, Record<string, unknown>>;
  // Interpreter mode (TRUST_MODES §5 / R3-213) — the decision lives in ONE
  // module (lib/renderMode.ts): the chain renderer, the body renderer and the
  // shell's `safe` field must never disagree.
  const safe: boolean = resolveSafeRender(homeMeta, meta);
  const chain: string[] = layoutChainForKey(entryKey, allMeta);
  const frameNone = meta?.frame === 'none' || meta?.frame === false;
  const useDefault = chain.length === 0 && !frameNone;

  // ── The entry gate (MDX_FROM_MOUNT_SPEC D8) ────────────────────────────────
  // The files that decide how THIS entry renders — itself, home, its layouts, its
  // `frame:` — are read ahead of the rest, and the body waits for them: an unread
  // row reads as `render` unset, which is the executing path. The chrome around it
  // stays mounted. The prioritize effect lives HERE now (moved with the gate) —
  // the shell carries the stylesheets' read state (wiki-wide), 'ready' standalone.
  const scanGate = useContext(CorpusScanContext);
  const sheets = useContext(GroveShellContext)?.stylesheetsStatus ?? 'ready';
  const critical = criticalKeys(entryKey, allMeta, scanGate.readFailure);
  const criticalSig = critical.join('|');
  useEffect(() => {
    scanGate.prioritize(criticalSig.split('|'));
  }, [scanGate, criticalSig]);
  const pending = entryPending(critical, scanGate.isSettled, sheets);
  const failure = criticalFailure(critical, scanGate.readFailure);

  return <>{failure ? <BootMessage>{failure}</BootMessage> : pending ? <BootMessage /> : renderLayers(chain, useDefault, safe)}</>;
}

export default function GroveEntry({
  entryKey,
  frame = 'chain',
}: {
  entryKey: string;
  /** 'chain' (default): the entry inside its layout chain — the stock page's
   *  shape. 'none': the bare entry (header + body + rails), for shells that
   *  compose several entries on one page. */
  frame?: 'chain' | 'none';
}) {
  return (
    <EntryContext.Provider value={{ entryKey }}>
      {frame === 'none' ? <EntryBody entryKey={entryKey} /> : <EntryFrame entryKey={entryKey} />}
    </EntryContext.Provider>
  );
}
