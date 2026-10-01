import { isContentEntryPath } from '@immediately-run/mdx-plugins';
import { FS_PREFIX, normalizeAbsolute, resolveLinkTarget } from '@immediately-run/sdk/linkSpace';

// Path conventions for Grove content.
//
// The CANONICAL KEY in this app is the file's ABSOLUTE module/fs path, e.g.
// `/app/content/handbook/onboarding.mdx`. This is the SAME identifier used by:
//   • the metadata store — `useFileMetadata(key)` / `useMetadataQuery` are keyed
//     by it (since the bundler change "Key MDX metadata by the absolute /app
//     module path", sandbox #41 — metadata and modules now share one path);
//   • the fs / `<Include>` / `module.dynamicImport` / `fs.readFile` path space.
//
// So an entry's metadata is read and its body is rendered with the identical
// string — no more juggling two path spaces. The ONLY place a different space
// appears is the URL/href layer, which owns the `/files`↔APP_ROOT translation:
// `keyToHref` strips `/app` (the runtime <Link> then prepends `/files`), and
// `keyToRepoRel` strips `/app/` for requestEdit. Pure helpers — no components.

import { getContentRoot, isDispatched } from './contentRoot';

export const APP_PREFIX = '/app';
export const FILES_PREFIX = '/files';

/** Where this instance's corpus lives — `/app/content/` for a fork, the delegated
 *  directory for a dispatched viewer. A FUNCTION, not a constant: see
 *  [[contentRoot]] for why capturing it at module scope is the bug it replaces. */
export function contentDir(): string {
  return getContentRoot();
}

/** The site root entry — the home page of whichever corpus is mounted. */
export function homeKey(): string {
  return `${getContentRoot()}home.mdx`;
}

/** Is this a content-entry metadata key? */
export function isEntryKey(key: string): boolean {
  return key.startsWith(contentDir()) && /\.mdx?$/.test(key);
}

/** Is this a folder-convention layout file (`…/_layout.mdx`)? These are structure,
 *  not entries: they wrap pages at an `<Outlet/>` and are excluded from every
 *  content enumeration (routing, nav, sidebar tree, index, search, backlinks). */
export function isLayoutKey(key: string): boolean {
  return /(^|\/)_layout\.mdx?$/.test(key);
}

/** Is this a *content entry* — an `.mdx` under content that a reader can navigate to?
 *  Excludes layout files and any other `_`-prefixed structural file. This is the
 *  single predicate every enumeration (nav, sidebar, 404 index, search, indexes)
 *  should filter on, so layout files never leak into reader-facing surfaces. */
export function isContentEntry(key: string): boolean {
  // The ROOTING is this viewer's (a metadata key under whichever corpus is mounted);
  // the ENTRY RULE is shared with the corpus tooling (R3-277a), because a file that
  // counts as an entry in one and not the other is a page that exists but cannot be
  // found — or an index row pointing at a layout wrapper.
  if (!key.startsWith(contentDir())) return false;
  // R3-309 — underscore-prefixed DIRECTORIES are copy-source, not pages. The canon's
  // entry rule excludes only the exact `_layout.mdx` filename; `content/_layouts/` (the
  // layout starters) would otherwise be routable, searchable, indexed pages rendered
  // mid-catalogue. This is GROVE's rooting-layer policy on top of the canon, not a
  // second entry rule: the docs corpus has no `_`-directories, so the canon never
  // needed the rule and grove's starters do.
  if (/(?:^|\/)_[^/]+\//.test(key.slice(contentDir().length))) return false;
  return isContentEntryPath(key);
}

/** `handbook/onboarding` → `/app/content/handbook/onboarding.mdx` (the canonical key). */
export function slugToKey(slug: string): string {
  return contentDir() + slug.replace(/^\//, '') + '.mdx';
}

/**
 * The prefix the URL space is measured FROM — the one place the two packagings differ in
 * how a key becomes a link, and vice versa.
 *
 * A FORK's URLs are anchored at the app root, so a key `/app/content/x.mdx` is the href
 * `/content/x.mdx` — `content/` included. That is not a detail to tidy up: those URLs are
 * published, cited and deep-linked, so the fork's mapping must stay byte-identical.
 *
 * A DISPATCHED viewer has no app-root to measure from — the corpus is a chroot minted AT
 * the content directory, so the mount root IS the corpus root and hrefs are corpus-relative
 * (`/plot/the-rail.mdx`). Nothing is published against that space yet, which is why it can
 * be defined here rather than negotiated.
 *
 * (The repo-load URL space — where a dispatched entry's URL must name a path in the CONTENT
 * repo, `content/` segment and all — is R3-172's, and is decided when that space exists.
 * Under the task/overlay dispatch that ships today there is no external URL to preserve.)
 */
function urlAnchor(): string {
  return isDispatched() ? contentDir().replace(/\/+$/, '') : APP_PREFIX;
}

/** Canonical key → href for the runtime <Link>. The key is the absolute fs path; the URL
 *  space drops the anchor and <Link> prepends `/files` itself. */
export function keyToHref(key: string): string {
  const anchor = urlAnchor();
  return key.startsWith(anchor) ? key.slice(anchor.length) : key;
}

/** Canonical key → the absolute fs/module path for <Include> / dynamicImport /
 *  fs.readFile. The canonical key already IS that path, so this is identity. */
export function keyToInclude(key: string): string {
  return key;
}

/** Canonical key → absolute fs path (alias of {@link keyToInclude}, for reads). */
export function keyToFsPath(key: string): string {
  return key;
}

/** Canonical key → repo-relative path for requestEdit (`content/…`). */
export function keyToRepoRel(key: string): string {
  return key.replace(/^\/app\//, '').replace(/^\//, '');
}

/**
 * R3-268 — the viewed-document declaration for a navigation target (the value the
 * resolver hands the SDK): the destination entry's path in this app's VISIBLE tree.
 *
 * Two path spaces, one per packaging:
 *  - **Fork**: the engine repo IS the working tree, so the `/app/`-anchored key strips
 *    to a repo-relative path (`content/themes.mdx`) — `keyToRepoRel`, unchanged.
 *  - **Dispatch**: the delegated corpus mount is ALL this app can see or name, so the
 *    declaration is CORPUS-relative (`themes.mdx` — the key minus the content root).
 *    The host owns the corpus→repo translation and joins its chroot prefix before the
 *    existence check. `keyToRepoRel` here was the bug: it only knows the `/app/`
 *    anchor, so a dispatched key leaked its sandbox MOUNT path (`mnt/<hash>/…`) into
 *    the declaration, the host's existence check missed, and the highlight silently
 *    degraded to none.
 *
 * A non-entry view declares `null` (clear the highlight).
 */
export function viewedDocumentForTarget(targetHref: string): string | null {
  const path = new URL(targetHref, 'https://placeholder.invalid').pathname;
  const i = path.indexOf(`${FILES_PREFIX}/`);
  const sandboxPath = i >= 0 ? path.slice(i) : '';
  const key = sandboxPathToKey(sandboxPath);
  if (!isEntryKey(key)) return null;
  // isEntryKey guarantees the key starts with the content root, so the slice is total.
  return isDispatched() ? key.slice(getContentRoot().length) : keyToRepoRel(key);
}

/** Split a link target into its path part and its `#fragment` (the `#` kept), e.g.
 *  `"FOO.mdx#sec-8-9"` → `["FOO.mdx", "#sec-8-9"]`. Only the FIRST `#` splits. */
export function splitFragment(href: string): [string, string] {
  const i = href.indexOf('#');
  return i === -1 ? [href, ''] : [href.slice(0, i), href.slice(i)];
}

/** Collapse `.` and `..` segments in an absolute key — the shared normalizer
 *  (R3-277b; was a local copy of the same arithmetic). */
const normalizeKey = normalizeAbsolute;

/**
 * The canonical keys a link href may denote, most-specific first — empty when the href
 * is external, a bare anchor, or doesn't name a content entry.
 *
 * An author writes links RELATIVE to the entry they are in (`[Roadmap](roadmap/index.mdx)`
 * from `content/home.mdx`), which is the same rule `scripts/lib/wiki.mjs` `contentResolve`
 * applies to `[[…]]` links and `check-docs-wiki` audits them by. Resolving markdown links
 * the same way is what keeps the rendered wiki and the corpus gate agreeing: before this,
 * a relative href fell through to a plain `<a>`, the sandbox performed a real navigation,
 * and the app died with "Failed to construct 'URL': Invalid URL".
 *
 * Two candidates rather than one, so a `foo.md` still finds `foo.mdx`. R3-252 rewrote the
 * corpus off those pre-cutover names and `check-docs-wiki` now refuses new ones, so this
 * fallback should never fire from committed content — it is kept because the gate being
 * STRICTER than the renderer is the right asymmetry: a stale hand-typed link should still
 * land a reader somewhere, and only the corpus is held to the canonical name. The CALLER
 * picks the first candidate that exists, so this stays pure and testable.
 */
export function hrefKeyCandidates(href: string, fromKey: string): string[] {
  const abs = hrefTargetKey(href, fromKey);
  if (!abs || !/\.mdx?$/.test(abs)) return [];
  return abs.endsWith('.md') ? [abs, abs + 'x'] : [abs];
}

/**
 * The corpus path an in-app href denotes — WITHOUT requiring it to name a file. Null for
 * an external scheme, a bare anchor, or a path that resolves outside the corpus.
 *
 * Split out from {@link hrefKeyCandidates} because a folder is a destination now: since
 * directory listings landed, `[the handbook](handbook)` names something real, and the
 * extension test that makes an entry an entry would have rendered it as a broken link.
 * The two callers ask different questions of the same resolution — "which entry?" and
 * "which path?" — so the resolution lives here once.
 */
// R3-184 S2 (PERSISTENCE_SPEC §8.3) — the `$fs:` clamp ON the render path, the one
// the spec's dated note names as the missing piece. This file's hrefTargetKey is
// where a corpus document's link targets actually resolve (grove's own WikiLink
// override routes here), so the clamp lives HERE: `bundleChrooted: isDispatched()`
// makes the shared resolver treat `$fs:/p` exactly like `/p` under the bundle root
// (R3-319), so a dispatched corpus document's `$fs:/mnt/{hash}/…` cannot name a
// federated mount materialised beside it — the app-level mount point is not a
// corpus path. The fork (own repo, not a corpus mount) keeps `$fs:`
// mount-absolute, as shipped. The LinkSpaceContext field in GroveWiki carries the
// same flag for the SDK's generic component consumers, the day a release that
// forwards it is pinned.
const linkSpaceOpts = (fromKey: string) => ({
  currentFile: fromKey,
  // The canonical spelling (mdx-plugins reads bundleRoot-else-corpusRoot; the
  // deprecated corpusRoot opts field stays for older consumers, not for new code).
  bundleRoot: getContentRoot(),
  bundleChrooted: isDispatched(),
});

export function hrefTargetKey(href: string, fromKey: string): string | null {
  if (!href) return null;
  if (/^(https?:|mailto:|tel:|#)/i.test(href)) return null;
  const [rawPath] = splitFragment(href);
  if (!rawPath) return null;
  const path = rawPath.replace(/^\/files/, '');
  // R3-277b: resolution is the SHARED resolver (`@immediately-run/sdk/linkSpace`,
  // R3-273) — the same function the platform's own WikiLink and the docs corpus
  // checker route through, so the runtime and the gate cannot drift. Relative
  // targets resolve against the authoring file; `$fs:` targets resolve
  // mount-absolute (addressing, never reach — R3-273).
  if (!path.startsWith('/')) {
    const rel = resolveLinkTarget(path, linkSpaceOpts(fromKey));
    if (rel.state !== 'resolved') return null;
    // Confinement, not tidiness: an href in foreign content is untrusted, and the
    // result flows into `fs` reads. In the default space anything that lands outside
    // the corpus denotes nothing (`$fs:` is exempt by design; the entry checks
    // downstream decide what renders).
    return rel.path.startsWith(contentDir()) || path.startsWith(FS_PREFIX) ? rel.path : null;
  }
  // Absolute spellings come in two generations, both accepted INBOUND (the R3-272
  // rule; emission via keyToHref stays canonical): the legacy repo-root spelling
  // ('/content/handbook/x.mdx' — anchored where the corpus's own repo keeps it,
  // under 'content/') and the canonical corpus-absolute ('/handbook/x.mdx' —
  // anchored at the corpus root by the shared resolver). The legacy spelling is
  // recognized by its prefix and wins when it matches, because that is the only
  // form a repo-shaped corpus could have meant by it; anything else is
  // corpus-absolute, closed under traversal ('..' clamps INSIDE the corpus —
  // R3-273's rule, which supersedes this file's old escape-to-null behavior).
  const legacyPrefix = contentDir().endsWith('/content/') ? '/content' : null;
  if (legacyPrefix && (path === legacyPrefix || path.startsWith(`${legacyPrefix}/`))) {
    const legacyAnchor = contentDir().slice(0, -'content/'.length);
    const legacy = normalizeAbsolute(legacyAnchor + path);
    if (legacy.startsWith(contentDir())) return legacy;
  }
  const corpusAnchored = resolveLinkTarget(path, linkSpaceOpts(fromKey));
  if (corpusAnchored.state === 'resolved' && corpusAnchored.path.startsWith(contentDir())) {
    return corpusAnchored.path;
  }
  return null;
}

/**
 * What an href in an entry body IS, which decides whether it may become a real `<a>`.
 *
 * A real `<a href>` performs a REAL NAVIGATION on click, which takes the sandboxed frame
 * out of the app — the R3-252 crash (`Failed to construct 'URL': Invalid URL`). So an
 * anchor is only ever correct for an href that genuinely means to leave the document:
 *
 * - `'external'` — an absolute scheme (`https:`, `mailto:`, `tel:`). Leaving is the point.
 * - `'anchor'`   — a bare `#fragment`. Same document; navigates nowhere.
 * - `'content'`  — anything else: a link INTO the corpus. It must be routed, and if it
 *   cannot be resolved to an entry it is BROKEN — never "external by default". That
 *   fallthrough is what made an unresolvable body link lethal instead of merely wrong,
 *   and it is the class the wiki still contains (`../scripts/x.mjs`, `.claude/…`).
 */
export function linkKind(href: string): 'external' | 'anchor' | 'content' {
  if (/^(https?:|mailto:|tel:)/i.test(href)) return 'external';
  if (href.startsWith('#')) return 'anchor';
  return 'content';
}

/** Current navigation sandboxPath → the canonical metadata/Include key. */
export function sandboxPathToKey(sandboxPath: string): string {
  if (!sandboxPath || sandboxPath === '/') return homeKey();
  const anchor = urlAnchor();
  let p = sandboxPath;
  if (p.startsWith(FILES_PREFIX)) p = p.slice(FILES_PREFIX.length); // /files/content/x → /content/x
  if (!p.startsWith(anchor + '/')) p = anchor + p; // relative → anchored (an anchored path stays)
  // NORMALIZE BEFORE CHECKING. The containment test below used to run on the raw text, so
  // `/../../app/src/App.tsx` anchored to `/task/t1/dir/../../app/src/App.tsx` — which
  // starts with the content root as a STRING and resolves somewhere else entirely as a
  // PATH. The key flows straight into `fs.readFile` (entry bodies, reading time,
  // backlinks), and under dispatch the URL is attacker-influenceable: a link in foreign
  // content, or a crafted address. Resolve the traversal first, then ask where it landed.
  p = normalizeKey(p);
  if (p === anchor || p === anchor + '/') return homeKey();
  // The guard, not a formality: anything that does not land inside the corpus resolves
  // HOME rather than becoming a key that reads some other file.
  return p.startsWith(contentDir()) ? p : homeKey();
}
