// R3-266 — dispatched content is writable, and the MOUNT decides.
//
// The two things these tests pin are the two things that were wrong before: a dispatched
// viewer must send its edit to the CORPUS (never to Grove's own repo), and whether it may
// offer one at all must be the corpus mount's CURRENT mode rather than a property of the
// packaging or a flag latched at boot.
import { describe, expect, it, afterEach } from 'vitest';
import { corpusWritable, editTarget, keyToSelfPath } from './editTarget';
import type { CorpusIdentity } from './editTarget';
import type { SandboxMount } from '@immediately-run/sdk/mounts';
import { getContentRoot, getCorpusMountId, isDispatched, resetContentRoot, setContentRoot } from './contentRoot';

// The corpus identities come from the REAL producer (R3-877 round 1, R2): the
// trailing-slash normalization every `slice` in editTarget depends on lives in
// `setContentRoot` — a hand-typed literal would keep passing while it broke.
const forkFor = (): CorpusIdentity => {
  resetContentRoot();
  return { dispatched: isDispatched(), contentRoot: getContentRoot(), mountId: getCorpusMountId() };
};
const dispatchedFor = (): CorpusIdentity => {
  setContentRoot('/task/t1/dir', { mountId: '/task/t1/dir' });
  return { dispatched: isDispatched(), contentRoot: getContentRoot(), mountId: getCorpusMountId() };
};
afterEach(() => resetContentRoot());

const fork: CorpusIdentity = forkFor();
const dispatched: CorpusIdentity = dispatchedFor();
// The dispatched entry keys, built off the producer's root — never a hand-typed prefix.
const IN = (rel: string) => `${dispatched.contentRoot}${rel}`;

const mount = (over: Partial<SandboxMount> = {}): SandboxMount =>
  ({ type: 'firestore', path: '/task/t1/dir', id: '/task/t1/dir', mode: 'rw', ...over }) as SandboxMount;

describe('editTarget — the verb follows the authority, not the packaging', () => {
  it('a FORK edits its own source through the self-scoped present→edit transition', () => {
    expect(editTarget('/app/content/handbook/onboarding.mdx', fork)).toEqual({
      via: 'self',
      path: 'content/handbook/onboarding.mdx',
    });
  });

  it('a DISPATCHED viewer delegates the CORPUS file, never a path in its own repo', () => {
    expect(editTarget(IN('plot/the-rail.mdx'), dispatched)).toEqual({
      via: 'delegate',
      mountId: '/task/t1/dir',
      relPath: 'plot/the-rail.mdx',
    });
  });

  it('is corpus-relative under dispatch — the mount root IS the corpus root', () => {
    const t = editTarget(IN('home.mdx'), dispatched);
    expect(t).toMatchObject({ relPath: 'home.mdx' });
    // The fork's `content/` segment must NOT leak into a corpus-relative path: the
    // delegated chroot is minted AT the content directory.
    expect((t as { relPath: string }).relPath.startsWith('content/')).toBe(false);
  });

  it('offers nothing for a key outside the mounted corpus (a leftover from the viewer)', () => {
    expect(editTarget('/app/content/home.mdx', dispatched)).toBeNull();
  });

  it('offers nothing when a dispatched corpus has no mount id to delegate from', () => {
    expect(editTarget(IN('home.mdx'), { ...dispatched, mountId: null })).toBeNull();
  });

  it('offers nothing for the corpus root itself (a directory is not an entry)', () => {
    expect(editTarget(IN(''), dispatched)).toBeNull();
  });

  it('never throws on a junk key', () => {
    expect(editTarget('', dispatched)).toBeNull();
    expect(editTarget(undefined as unknown as string, fork)).toBeNull();
  });

  it('keyToSelfPath strips the app anchor exactly as the fork URLs require', () => {
    expect(keyToSelfPath('/app/content/x.mdx')).toBe('content/x.mdx');
    expect(keyToSelfPath('/content/x.mdx')).toBe('content/x.mdx');
  });
});

describe('corpusWritable — the mount decides, live', () => {
  it('a fork asks about its working tree, as before', () => {
    expect(corpusWritable([{ type: 'worktree', path: '/app', mode: 'rw' } as SandboxMount], fork)).toBe(true);
    expect(corpusWritable([{ type: 'worktree', path: '/app', mode: 'ro' } as SandboxMount], fork)).toBe(false);
    expect(corpusWritable([], fork)).toBe(false);
  });

  it('a DISPATCHED viewer on an rw corpus is writable — packaging is not trust', () => {
    expect(corpusWritable([mount()], dispatched)).toBe(true);
  });

  it('a ro corpus with NO hint is still offerable (R3-877: the workbench class) — never EROFS, a refusal tells', () => {
    // Pre-R3-877 this was `false` — an ro mount hid the affordance outright. The
    // workbench class edits under the READER's authority, so OUR ro mount is the
    // normal case, not a refusal. An explicit `false` hint still hides it (below).
    expect(corpusWritable([mount({ mode: 'ro' })], dispatched)).toBe(true);
  });

  it('follows a LIVE downgrade: re-announced ro flips the DELIVERY, and a false hint flips the OFFER', () => {
    expect(corpusWritable([mount({ mode: 'rw' })], dispatched)).toBe(true);
    // ro with no hint: still offerable, now via the workbench (reader's authority).
    expect(corpusWritable([mount({ mode: 'ro' })], dispatched)).toBe(true);
    // ro with the host saying the reader cannot edit: hidden.
    expect(corpusWritable([mount({ mode: 'ro', readerCanEdit: false })], dispatched)).toBe(false);
  });

  it('a corpus mount that has vanished is not writable', () => {
    expect(corpusWritable([mount({ id: 'space:other', path: '/mnt/x' })], dispatched)).toBe(false);
    expect(corpusWritable([], dispatched)).toBe(false);
    expect(corpusWritable(null, dispatched)).toBe(false);
  });

  it('matches a mount that carries no id by its path (what the host publishes)', () => {
    expect(corpusWritable([{ type: 'firestore', path: '/task/t1/dir', mode: 'rw' } as SandboxMount], dispatched)).toBe(
      true,
    );
  });

  it('never reports writable when there is no mount id at all', () => {
    expect(corpusWritable([mount()], { ...dispatched, mountId: null })).toBe(false);
  });
});

// R3-877 — the third outcome: an ro delegation edits via the WORKBENCH, under the
// reader's authority (`requestEdit({ bundleFile })`, R3-876). Order of preference:
// self → delegate (rw) → workbench (ro).
describe('editTarget — the workbench class for a read-only delegation (R3-877)', () => {
  // The corpus identity's contentRoot mirrors the real getContentRoot() shape: the
  // delegated chroot root, trailing slash.
  const roCorpus: CorpusIdentity = { ...dispatched, mountMode: 'ro' };

  it('an `ro` dispatched corpus yields workbench with the leading-slash bundle-relative path', () => {
    expect(editTarget(IN('plot/the-rail.mdx'), roCorpus)).toEqual({
      via: 'workbench',
      relPath: '/plot/the-rail.mdx',
    });
  });

  it('an `rw` delegation still yields delegate (the edit-file overlay is unchanged)', () => {
    expect(editTarget(IN('plot/the-rail.mdx'), { ...dispatched, mountMode: 'rw' })).toEqual({
      via: 'delegate',
      mountId: '/task/t1/dir',
      relPath: 'plot/the-rail.mdx',
    });
  });

  it('an UNKNOWN mode (an older host announces none) keeps the pre-R3-877 delegate behavior', () => {
    expect(editTarget(IN('home.mdx'), dispatched)).toEqual({
      via: 'delegate',
      mountId: '/task/t1/dir',
      relPath: 'home.mdx',
    });
  });

  it('the corpus root itself is still nothing to edit, workbench included', () => {
    expect(editTarget(IN(''), roCorpus)).toBeNull();
  });
});

describe('corpusWritable — the ro delegation is offerable on the hint (R3-877)', () => {
  it('ro + readerCanEdit true → offered', () => {
    expect(corpusWritable([mount({ mode: 'ro', readerCanEdit: true })], dispatched)).toBe(true);
  });

  it('ro + readerCanEdit false → NOT offered (never show a control that refuses)', () => {
    expect(corpusWritable([mount({ mode: 'ro', readerCanEdit: false })], dispatched)).toBe(false);
  });
});
