// Entry-relative asset resolution (R3-313) — the ONE place that turns "an entry's
// `cover:`/`img src`" into the fs path the SDK's `MountImage` reads.
//
// The distinction this module exists for: a body image resolves against the entry
// currently being rendered (the entry context's key via useEntryKey — AssetImage;
// the routed key only as the no-provider fallback), while a
// cover resolves against its owning entry — the entry the card/row/tile is about,
// which under dispatch is usually a different base. Getting this wrong is not a bug
// in `AssetImage`; it is the second half of design-pass gap 7: a `<DocList>` card or
// `<Timeline>` row showing another entry's picture resolved against the wrong base
// by construction.
//
// Pure path arithmetic — no fs, no React — so the dispatch guarantee (the chroot
// prefix is host knowledge the viewer reads THROUGH but never publishes) is testable
// here in isolation.

/** Resolve `relativePath` against the directory of `basePath` (both fs paths). */
export function resolvePath(basePath: string, relativePath: string): string {
  if (relativePath.startsWith('/')) return relativePath;
  const parts = basePath.split('/');
  parts.pop(); // the base is the entry's FILE path; assets resolve against its dir
  for (const part of relativePath.split('/')) {
    if (part === '.' || part === '') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

/**
 * The mount-relative path `MountImage` should read an entry-declared asset at.
 *
 * @param entryPath the OWNING entry's absolute fs path (the metadata key space —
 *        `/app/content/…` fork, `/mnt/<hash>/…` dispatch)
 * @param src the declared asset reference (entry-relative, or absolute `/…` which
 *        roots at the filesystem — the same escape rule body images follow)
 * @returns the path with the leading slash stripped (root-mount-relative), or `''`
 *          when there is nothing to resolve (caller degrades)
 */
export function entryAssetRelPath(entryPath: string, src: string | undefined | null): string {
  if (typeof src !== 'string' || !src.trim()) return '';
  return resolvePath(entryPath, src.trim()).replace(/^\/+/, '');
}
