// R3-266 — WHERE an edit goes, and whether one may be offered at all.
//
// Grove ships in two packagings, and the edit verb differs between them because the
// AUTHORITY does, not because dispatched content is somehow less editable:
//
//   • FORK      — the corpus is this app's own repo, so "edit this entry" is the
//                 present→edit transition on our own source: `requestEdit({ path })`,
//                 which is **self-scoped by contract** ("v1 supports only a repo-relative
//                 path in the CURRENT repo").
//   • DISPATCH  — the corpus is a MOUNT somebody handed us. `requestEdit` there would
//                 name a path in GROVE's repo, so the same call would offer to edit the
//                 viewer instead of the wiki on screen. The right verb is the one for a
//                 file in a mount: `invokeTask('edit-file', { file: capFile(...) })`,
//                 attenuating the corpus delegation down to the single entry.
//
// The previous code withheld the affordance under dispatch and said so in a comment that
// was careful to call it temporary. It was still the wrong outcome: dispatch changes the
// PACKAGING, not the authority — the same corpus, forked, is editable — so a read-only
// dispatched viewer breaks packaging-is-not-trust exactly where a reader would notice.
//
// **The mount decides.** Writability is a property of the delegation's current mode, not
// of how the app was loaded. That is why `corpusWritable` takes the live mount list rather
// than the boot-time flag. Since R3-877 a role downgrade no longer hides the affordance —
// it reroutes the delivery: `rw` hands the file to the `edit-file` overlay, `ro` asks the
// workbench under the reader's authority (`requestEdit({ bundleFile })`). The offer hides
// only when the host's `readerCanEdit` hint says the reader cannot edit, or a `read-only`
// refusal proved it.
//
// Pure — no SDK, no React — so all of the above is testable without a host.

import type { SandboxMount } from '@immediately-run/sdk/mounts';

/** How an edit of a content entry is delivered. */
export type EditTarget =
  /** The fork: our own repo, via the self-scoped present→edit transition. */
  | { via: 'self'; path: string }
  /** Dispatch, writable delegation: one file of the corpus, handed to the platform
   *  editor as a narrowed `edit-file` delegation (the overlay). */
  | { via: 'delegate'; mountId: string; relPath: string }
  /** Dispatch, read-only delegation (an app-declared opener's chroot): ask the
   *  workbench to open the entry's source in the main-pane editor under the
   *  reader's authority — `requestEdit({ bundleFile })` (R3-876 / APP_CUSTOMIZATION
   *  §5a). The path is bundle-relative with a leading slash. */
  | { via: 'workbench'; relPath: string };

export interface CorpusIdentity {
  /** Whether the corpus is a mount rather than this app's own repo. */
  dispatched: boolean;
  /** The content root, with a trailing slash (`getContentRoot()`). */
  contentRoot: string;
  /** The corpus mount id, when dispatched (`getCorpusMountId()`). */
  mountId: string | null;
  /** The corpus delegation's current mode, read off the live mount list (R3-877):
   *  `ro` routes the edit to the workbench under the reader's authority; `rw` keeps
   *  the `edit-file` overlay. Absent/unknown keeps the pre-R3-877 behavior
   *  (`delegate` — an `rw`-assuming host that announces no mode). */
  mountMode?: 'ro' | 'rw' | null;
}

/** `/app/content/x.mdx` → `content/x.mdx` — the fork's repo-relative path. */
export function keyToSelfPath(key: string): string {
  return key.replace(/^\/app\//, '').replace(/^\//, '');
}

/**
 * Where an edit of `entryKey` should go, or null when there is nowhere to send it.
 *
 * Null is not "read-only" — that is {@link corpusWritable}'s question. Null means the key
 * does not name a file in this corpus at all, or a dispatched viewer has no mount id to
 * delegate from (an older host that published the corpus without one). Either way there is
 * nothing to offer, and offering it anyway would produce a refusal the reader must decode.
 */
export function editTarget(entryKey: string, corpus: CorpusIdentity): EditTarget | null {
  if (typeof entryKey !== 'string' || entryKey === '') return null;
  if (!corpus.dispatched) return { via: 'self', path: keyToSelfPath(entryKey) };
  if (!corpus.mountId) return null;
  if (!entryKey.startsWith(corpus.contentRoot)) return null;
  const relPath = entryKey.slice(corpus.contentRoot.length);
  if (!relPath) return null;
  // An `ro` delegation (the opener's chroot — the only mode an app-declared opener
  // ever holds) goes to the workbench: the reader's authority, not ours — the mount
  // is never upgraded and nothing is minted for us. Leading-slash, the host's
  // `bundleFile` grammar.
  if (corpus.mountMode === 'ro') return { via: 'workbench', relPath: `/${relPath}` };
  return { via: 'delegate', mountId: corpus.mountId, relPath };
}

/**
 * May this instance offer an edit at all, given the mounts it holds RIGHT NOW?
 *
 * A fork asks about its working tree, as before. A dispatched viewer asks about the corpus
 * mount — and asks the live mount list, not the boot-time flag, so a live `rw → ro`
 * downgrade (a role change the host re-announces on the same mount id) reroutes the
 * delivery on the next render (to the workbench class) and an explicit
 * `readerCanEdit: false` hides the offer — rather than surfacing `EROFS` on click.
 * That is the whole difference between "hidden because you may not" and "shown, then
 * `EROFS` when you try".
 *
 * A corpus mount that has vanished from the list answers `false`: no mount, no write.
 */
export function corpusWritable(
  mounts: readonly SandboxMount[] | null | undefined,
  corpus: CorpusIdentity,
): boolean {
  const list = mounts ?? [];
  if (!corpus.dispatched) {
    return list.some((m) => m.type === 'worktree' && m.mode !== 'ro');
  }
  if (!corpus.mountId) return false;
  const mount = list.find((m) => (m.id ?? m.path) === corpus.mountId);
  // `mode` is absent on the primary repo mount and rw by default elsewhere; a corpus
  // mount that reports nothing is treated as writable exactly as `resolveOpenWiki` reads
  // it, so the two never disagree about the same mount.
  if (!mount) return false;
  if (mount.mode !== 'ro') return true;
  // R3-877 (APP_CUSTOMIZATION §5a.5): an `ro` delegation can still offer the
  // workbench edit — the reader's authority — gated on the host's advisory
  // `readerCanEdit` hint: offer when it is true, OR when the host sent no hint
  // (absent = unknown — the refusal would tell, and `read-only` hides it after).
  // Never offer on an explicit `false`.
  return mount.readerCanEdit !== false;
}
