/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useContext, useEffect, useState } from 'react';
import fs from 'fs';
import type { Metadata } from '@immediately-run/sdk';
import {
  ScrollRestoration,
  useAllMetadata,
  useFileMetadata,
  useHostTheme,
  useMetadataQuery,
} from '@immediately-run/sdk';
import { TinkerableContext } from '@immediately-run/sdk/TinkerableContext';
import { LinkSpaceContext } from '@immediately-run/sdk/linkSpace';
import { BundleContext, toBundlePath, fromBundlePath } from '@immediately-run/sdk/bundle';
import {
  contentDir,
  homeKey,
  isContentEntry,
  keyToFsPath,
  keyToHref,
  keyToInclude,
  sandboxPathToKey,
} from './lib/content';
import { queryPaths, queryRecords, readingTime, stripFrontmatter } from './lib/wiki';
import { navQuery, plainLabel } from './lib/queries';
import type { NavRecord } from './lib/queries';
import { layoutChainForKey, resolveNavMode, resolvePageLayout } from './lib/layout';
import { resolveSafeRender } from './lib/renderMode';
import { folderIndexKey } from './lib/directory';
import GroveEntry from './components/GroveEntry';
import { resolvePalette, resolvePolarity, type Polarity } from './lib/themeSelection';
import { preferredPolarity } from './data/themes';
import { useDirectoryListing } from './hooks/useDirectoryListing';
import { useScrollReset } from './hooks/useScrollReset';
import { useEditAffordance } from './hooks/useEditAffordance';
import { getContentRoot, isDispatched } from './lib/contentRoot';
import type { RejectedComponent } from './lib/corpusComponents';
import { GroveShellContext } from './lib/shell';
import type { GroveShell, NavItem } from './lib/shell';
import Search from './components/Search';
import Drawer from './components/Drawer';
import GroveAgent from './components/GroveAgent';
import ThemeAssets from './components/ThemeAssets';
import ContentTheme from './components/ContentTheme';
import { themeAssetsFor } from './data/themeFonts';
import { useContentStylesheets } from './hooks/useContentStylesheets';

function readPref(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function writePref(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}

// Bundle-absolute path → the href that navigates to it, for CONTENT (R3-174).
//
// Module scope, and that is load-bearing rather than tidiness: this function is handed to
// content through `BundleContext`, and the SDK's `useBundleEntries` memoizes on its
// identity. A closure rebuilt each render would make that memo never hold, so the hook the
// SDK documents as "safe in a dependency array" would quietly stop being one — from the
// PROVIDER's side, where nobody using it would think to look. Nothing here is reactive:
// `contentDir()` is boot-settled module state and `keyToHref` is a pure function of it.
function bundleHref(bundlePath: string): string {
  const absolute = fromBundlePath(bundlePath, contentDir().replace(/\/+$/, ''));
  return absolute === null ? bundlePath : keyToHref(absolute);
}

/**
 * The wiki itself: routing, chrome, and the entry render. Everything here reads the
 * content root, so it may only mount once that root is settled — which is why the
 * default export of `App.tsx` is a gate in front of it rather than this component
 * (R3-169: under dispatch the root is a runtime value, not `/app/content/`).
 */
export default function GroveWiki({
  readOnly = false,
  rejectedComponents = [],
}: {
  readOnly?: boolean;
  /** Corpus component declarations that could not be loaded (R3-174). Shown, not
   *  swallowed: a `<RoadmapBoard/>` that silently never appears is indistinguishable from
   *  one nobody wrote, and the author has no other channel to learn which it was. */
  rejectedComponents?: RejectedComponent[];
}) {
  const ctx = useContext(TinkerableContext) as any;
  const sandboxPath: string = ctx?.navigationState?.sandboxPath || '/';
  const hash: string = ctx?.navigationState?.hash ?? '';

  // ── Theme selection (R3-308, 02-theme-contract §4) ─────────────────────────
  //
  // Two INDEPENDENT axes with three sources, resolved through ONE module
  // (lib/themeSelection) so no surface re-derives the precedence:
  //
  //   palette  = reader override, else the author's `theme:` on the home entry, else default
  //   polarity = reader override, else the host's theme, else the palette's preferred
  //
  // The stored prefs are OVERRIDES, nullable by nature: absent until the reader
  // acts, which is what gives the author's declaration its turn. They are written
  // by the user actions (chooseTheme/choosePolarity), NEVER by an effect on mount
  // — the old effects promoted the initial value to a reader choice on first
  // visit, which is exactly why a `theme:` declaration could never have won.
  // (Visitors from before this change carry a mount-written pref; it stands —
  // they are Grove readers, and a reader outranks an author.)
  const [readerTheme, setReaderTheme] = useState<string | null>(() => readPref('grove:theme'));
  const [readerAppearance, setReaderAppearance] = useState<Polarity | null>(() => {
    const p = readPref('grove:appearance');
    return p === 'light' || p === 'dark' ? p : null;
  });
  const chooseTheme = (id: string) => {
    setReaderTheme(id);
    writePref('grove:theme', id);
  };
  const choosePolarity = (wantLight: boolean) => {
    const p: Polarity = wantLight ? 'light' : 'dark';
    setReaderAppearance(p);
    writePref('grove:appearance', p);
  };
  // The host drives POLARITY ONLY (`theme:read` is the one theme capability the
  // open-wiki binding holds) — and only when there IS a host. `useHostTheme`'s
  // channel reports an `initial: 'dark'` before any host speaks, so an unframed
  // standalone `vite dev` render would otherwise carry a phantom host opinion
  // and flip light-preferred themes. Framed === a host exists to have one.
  const framed = typeof window !== 'undefined' && window.parent !== window;
  const hostTheme = useHostTheme();
  const hostPolarity: Polarity | null = framed ? hostTheme : null;
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mins, setMins] = useState(0);
  const [vw, setVw] = useState<'mobile' | 'desktop'>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches ? 'mobile' : 'desktop'
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)');
    const on = () => setVw(mq.matches ? 'mobile' : 'desktop');
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // ⌘K / Ctrl-K opens search.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  // R3-266 — dispatched content IS writable, and the MOUNT decides.
  //
  // This used to read `!isDispatched() && …`, withholding every edit affordance from a
  // dispatched viewer. The reason was real but the conclusion was not: `requestEdit` is
  // **self-scoped by contract**, so under dispatch it names a path in GROVE's repo rather
  // than in the corpus on screen. The fix is a verb swap, not a withheld capability — see
  // `lib/editTarget` — and the gate is the corpus mount's CURRENT mode, re-read on every
  // mount change so a live role downgrade hides the affordance instead of producing
  // `EROFS` on click.
  const { writable, busy: editBusy, refused: editRefused, openEditor, editHint } = useEditAffordance(readOnly);

  const routeKey = sandboxPathToKey(sandboxPath) || homeKey();
  // The site brand is a wiki-wide constant, so read it from the home entry's
  // `site` frontmatter — not the current entry's (which only home would carry),
  // else the brand flips to the 'Grove' fallback on every sub-page.
  const homeMeta = useFileMetadata(homeKey()) as any;
  // R3-308: the author's palette declaration — `theme:` on the home entry, the
  // wiki-wide sibling of `site:`. Like `site`, it is read from HOME and not the
  // current entry, so a sub-page never flips the wiki's look back to `default`.
  const authorTheme: string | null =
    typeof homeMeta?.theme === 'string' && homeMeta.theme ? homeMeta.theme : null;
  // The two axes, resolved through the one module that owns the precedence. `theme`
  // and `light` below are the RESOLVED values every surface renders from — the raw
  // reader overrides live only in state and in the menu handlers.
  const theme = resolvePalette({ reader: readerTheme, author: authorTheme });
  const polarity: Polarity = resolvePolarity({
    reader: readerAppearance,
    host: hostPolarity,
    preferred: preferredPolarity(theme),
  });
  const light = polarity === 'light';
  // Existence / 404: the whole index tells us if a followed link is dead. Layout
  // files are structure, not entries, so they're excluded here (and everywhere).
  const allKeysQuery = useCallback((fm: Record<string, any>) => Object.keys(fm).filter(isContentEntry), []);
  const idx = useMetadataQuery(allKeysQuery);
  const keys: string[] = queryPaths(idx);
  const indexLoaded = keys.length > 0;

  // A URL that names a FOLDER is a legitimate address, and there are two right answers
  // to it — in this order:
  //
  //   1. the folder's own `index.mdx`, if the author wrote one. Curation beats
  //      generation, and it is how a corpus overrides the listing per folder without
  //      touching the engine;
  //   2. otherwise the generated <DirectoryView> — the entries and assets that are
  //      actually there.
  //
  // Both used to be "No entry at …", which is the one answer that is false.
  const folderIndex = indexLoaded && !keys.includes(routeKey) ? folderIndexKey(routeKey, keys) : null;
  const entryKey = folderIndex ?? routeKey;
  const includePath = keyToInclude(entryKey);
  const meta = useFileMetadata(entryKey) as any;

  const layout = resolvePageLayout(meta);
  const siteTitle: string = meta?.site || homeMeta?.site || 'Grove';
  // Interpreter mode (TRUST_MODES §5 / R3-213): render this entry's body through the
  // non-executable safe renderer instead of the compiled `<Include>` path.
  //
  // Read from the HOME entry (wiki-wide) OR this entry (per-entry), because the two
  // answer different questions. Wiki-wide is the interpreter declaration — a Grove
  // rendering foreign content sets it there. Per-entry exists because this corpus has
  // one document, the non-executable proof page, whose whole point is planted code that
  // must NOT execute: on the compiled path that page doesn't just look wrong, it runs
  // (R3-252). A document that is only correct as data says so itself.
  const safe: boolean = resolveSafeRender(homeMeta, meta);
  const showRails = layout === 'doc' && !meta?.view;


  // Ask the filesystem only about a key the ENTRY index already missed: an ordinary page
  // render performs no extra I/O, and this readdir replaces a 404 that was about to
  // render anyway. The index cannot answer it — it holds `.md`/`.mdx` only, so a folder
  // of assets is invisible to it.
  const unresolved = indexLoaded && !keys.includes(entryKey);
  const directory = useDirectoryListing(unresolved ? entryKey : null);
  const missing = unresolved && directory.status === 'none';

  // The layout chain wrapping this entry (outermost first). Needs the full
  // frontmatter map (folder convention + `frame` override), so it reads the whole
  // metadata store and re-derives when the content set or the entry changes.
  const allMeta = useAllMetadata() as Record<string, Record<string, unknown>>;

  // ── Content-carried themes (R3-316; MDX_FROM_MOUNT_SPEC D7) ─────────────────
  // The stylesheets the home entry declares (`stylesheets:`); bodies are raw CSS
  // behind frontmatter, gated by the grammar inside ContentTheme and admitted only
  // into the lowest cascade layer. A declaration that names no entry, a sheet that
  // will not read, and a sheet the grammar rejects all degrade to a status line
  // naming it — never a silent drop, never a crash.
  const stylesheets = useContentStylesheets(homeMeta?.stylesheets, homeKey());
  const [rejectedSheet, setRejectedSheet] = useState<string | null>(null);
  const sheetErrors = rejectedSheet ? [...stylesheets.errors, rejectedSheet] : stylesheets.errors;

  // ── The entry gate (MDX_FROM_MOUNT_SPEC D8) ─────────────────────────────────
  // Under dispatch the index fills in while the wiki is already on screen. The files
  // that decide how THIS entry renders — itself, home, its layouts, its `frame:` — are
  // read ahead of the rest, and the body waits for them: an unread row reads as
  // `render` unset, which is the executing path. The chrome around it stays mounted.
  // R3-872: the entry gate (prioritize/pending/failure) and the safe derivation
  // moved into GroveEntry's chain frame — GroveWiki keeps only what the chrome
  // reads (navMode's root-layout lookup needs the chain's outermost key).
  const chain: string[] = layoutChainForKey(entryKey, allMeta);
  const frameNone = meta?.frame === 'none' || meta?.frame === false;

  // R3-309 — the nav arrangement is the ROOT layout's to choose (`nav: top` in the
  // outermost _layout.mdx's frontmatter; the default shell and the starters read the
  // same value through the shell). Undeclared or unknown → 'side', the arrangement
  // Grove has always shipped — never an unstyled page.
  const navMode = resolveNavMode(chain.length ? (allMeta[chain[0]!] as Record<string, unknown>) : undefined);
  // Every navigation starts at the top of the entry, except one aimed at a section. The
  // ref goes on `.device__scroll` below — the only thing on the page that scrolls.
  const scrollRef = useScrollReset(entryKey, hash);

  // Reading time: read the entry body once per entry.
  useEffect(() => {
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
  }, [entryKey]);

  // Records, not tab-encoded paths (R3-276a): the query selects `{ path, label }`
  // and the hook returns them as-is — no fake-path encoding round-trip.
  const navResult = useMetadataQuery<Metadata, NavRecord>(navQuery);
  const navItems: NavItem[] = queryRecords<NavRecord>(navResult).map(({ path, label }) => ({
    key: path,
    href: keyToHref(path),
    label,
  }));

  // Closest-match suggestion for a 404 (shared namespace or name overlap).
  const suggestion = missing
    ? keys
        .map((k) => ({ k, score: overlap(k, entryKey) }))
        .sort((a, b) => b.score - a.score)[0]?.k
    : undefined;

  const shell: GroveShell = {
    theme,
    setTheme: chooseTheme,
    light,
    setLight: choosePolarity,
    menuOpen,
    setMenuOpen,
    searchOpen,
    setSearchOpen,
    drawerOpen,
    setDrawerOpen,
    vw,
    navMode,
    writable,
    openEditor,
    editBusy,
    editRefused,
    editHint,
    siteTitle,
    safe,
    navItems,
    entryKey,
    includePath,
    layout,
    showRails,
    mins,
    missing,
    suggestion,
    directory,
    stylesheetsStatus: stylesheets.status,
  };

  // The bundle scope handed to CONTENT (R3-174; MDX_FROM_MOUNT_SPEC §2, §7 1a).
  //
  // A component the bundle ships cannot import this engine — it would resolve a second
  // copy from the registry, with its own `contentRoot` module state, and answer about the
  // wrong bundle — so everything it needs about the bundle arrives through the SDK, which
  // both sides genuinely share (one `/node_modules` per frame). Three facts, and each is
  // one a content component cannot derive for itself:
  //
  //  • `root` — so metadata keys can be rebased off the mount prefix. Content must never
  //    see `/mnt/<hash>/…`: it is host knowledge the viewer reads THROUGH but does not
  //    publish (the property `DirectoryList.test.tsx` pins), and it is not stable across
  //    loads, so anything content stored or linked with it would rot.
  //  • `entry` — the entry being READ, not the file the component sits in. A component in
  //    a `_layout.mdx` wraps the entry, so `<Include>`'s own module identity would name
  //    the layout; furniture in the layout chain (a status line, a dependency rail) needs
  //    the page it is describing.
  //  • `toHref` — because bundle-path→URL is this VIEWER's policy and the two packagings
  //    genuinely disagree (`urlAnchor`). Content that computed its own hrefs would be
  //    correct in exactly one packaging, which is the mode-invariance rule
  //    (PLATFORM_LAYERING §1.1) broken in the least visible possible way.
  // `contentRoot` is module state settled at boot, so it is read here — into a local the
  // memo can list as a dependency — rather than inside the factory. Calling it inside
  // would close over a value the dependency list does not name, which the React Compiler
  // correctly refuses to preserve memoization across.
  // Built fresh each render, like everything else in this component — no hand-memoization
  // (the rest of the file has none either; `react-hooks/preserve-manual-memoization`
  // rejects one here because `entryKey` derives from the metadata query's array).
  //
  // That is safe because the EXPENSIVE half does not key on this object's identity: the
  // SDK's `useBundleEntries` destructures `{root, toHref}` and memoizes on those, and both
  // are stable — `root` is a string compared by value, `toHref` is the module-scope
  // `bundleHref` above. A new wrapper re-renders consumers (cheap); it does not re-derive
  // 800-odd entries. Making `toHref` a closure would silently undo that, which is the
  // whole reason it is not one.
  const bundleRoot = contentDir().replace(/\/+$/, '');
  const bundleEntry = toBundlePath(entryKey, bundleRoot);
  const bundleScope = { root: bundleRoot, entry: bundleEntry, toHref: bundleHref };

  return (
    // R3-277b: declare the enclosing bundle for the platform's link-space consumers
    // (the shared resolver's bundle-anchored absolute + `$fs:` handling read this).
    // R3-482: the SDK pin (^0.72.0, #75) reads `bundleRoot` new-then-old, so the new
    // spelling is stated alone — the deprecated `corpusRoot` stays in the type for
    // older consumers (mdx-plugins' forever-compat) but no longer here.
    <LinkSpaceContext.Provider
      value={{
        bundleRoot: getContentRoot(),
        // R3-184 S2 (PERSISTENCE_SPEC §8.3) — the `$fs:` clamp, on this render path.
        // The clamp that is IN FORCE lives in `lib/content.ts` (`linkSpaceOpts`):
        // `hrefTargetKey` is where a corpus document's link targets actually
        // resolve (grove's own WikiLink override routes there), and it passes
        // `bundleChrooted: isDispatched()` to the shared resolver (R3-319's
        // chroot), so a dispatched corpus document's `$fs:/mnt/{hash}/…` cannot
        // name a federated mount materialised beside it — the app-level mount
        // point is not a corpus path — and the fork's `$fs:` stays
        // mount-absolute. THIS field carries the same flag for the SDK's generic
        // component consumers (WikiLink/MDXComponents): the pinned SDK 0.72.0
        // does not forward it, so it is decided-but-not-consumed until a
        // forwarding release is published and pinned — the booked follow-up,
        // stated here rather than blurred (§8.3's dated note:
        // built-but-not-in-force is a materially different state from done).
        bundleChrooted: isDispatched(),
      }}
    >
    {/* R3-174: the bundle scope CONTENT reads — sibling to the link space, not a
        replacement for it. The two answer different questions: `LinkSpaceContext` tells
        the platform's link resolver where absolute hrefs are anchored; `BundleContext`
        tells a component the bundle ships which entries exist, which one is being read,
        and how to turn a bundle path into a URL. */}
    <BundleContext value={bundleScope}>
    <GroveShellContext.Provider value={shell}>
      <div
        className="grove-root"
        data-vw={vw}
        data-nav={navMode}
        data-grove-theme={theme === 'default' ? undefined : theme}
        data-theme={polarity}
      >
        {/* R3-310: the ACTIVE theme's declared faces — the engine mints blob:
            @font-face rules (R3-315's mechanism); switching themes revokes the
            outgoing set and re-mints. */}
        <ThemeAssets declarations={themeAssetsFor(theme)} />
        <ContentTheme sheets={stylesheets.sheets} onRejected={(path, v) => setRejectedSheet(`${path}:${v.line} — ${v.reason}`)} />
        {/* R3-627: remember where the reader was on the entry they leave, and put
            them back there on Back. Grove's scroller is its own container, so the
            ref goes across; `useScrollReset` above stands down on the same
            traversal so the two do not fight. */}
        <ScrollRestoration scroller={scrollRef} />
        <div className="device__scroll" ref={scrollRef}>
          {sheetErrors.length > 0 ? (
            <div className="grove-decl-error" role="status">
              <strong>A stylesheet this corpus declares could not be applied.</strong>
              <ul>
                {sheetErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {rejectedComponents.length > 0 ? (
            <div className="grove-decl-error" role="status">
              <strong>This corpus declares components that could not be loaded.</strong>
              <ul>
                {rejectedComponents.map((r) => (
                  <li key={r.name}>
                    <code>{r.name}</code> — {r.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="grove-shell" data-nav={frameNone ? undefined : navMode}>
            {/* R3-872: the entry region is GroveEntry — the chain, the gate and the
                entry context (R3-871) live inside it, so a shell composing entries
                directly renders the same thing (APP_CUSTOMIZATION §4.1). */}
            <GroveEntry entryKey={entryKey} frame={frameNone ? 'none' : 'chain'} />
          </div>
        </div>

        {searchOpen ? <Search onClose={() => setSearchOpen(false)} /> : null}
        {drawerOpen ? (
          <Drawer
            siteTitle={siteTitle}
            nav={navItems.map((n) => ({ key: n.key, href: n.href, label: n.label, cur: n.key === entryKey }))}
            onClose={() => setDrawerOpen(false)}
          />
        ) : null}
        <GroveAgent writable={writable} entryKey={entryKey} entryTitle={plainLabel(meta?.title || 'this entry')} />
      </div>
    </GroveShellContext.Provider>
    </BundleContext>
    </LinkSpaceContext.Provider>
  );
}

// Crude closest-match score for the 404 suggestion: shared namespace + name chars.
function overlap(a: string, b: string): number {
  const an = a.replace(contentDir(), '').replace(/\.mdx?$/, '');
  const bn = b.replace(contentDir(), '').replace(/\.mdx?$/, '');
  const aNs = an.split('/').slice(0, -1).join('/');
  const bNs = bn.split('/').slice(0, -1).join('/');
  let score = aNs && aNs === bNs ? 5 : 0;
  const aName = an.split('/').pop() || '';
  const bName = bn.split('/').pop() || '';
  for (const ch of new Set(aName)) if (bName.includes(ch)) score++;
  return score;
}
