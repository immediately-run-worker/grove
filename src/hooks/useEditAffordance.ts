// R3-266 — the one place Grove decides whether to offer an edit, and how to deliver it.
//
// Every edit affordance in the wiki (the entry header's pencil, the 404's "Create it",
// the agent panel's link, the nav's "New entry") used to call `requestEdit` directly with
// a repo-relative path. That is correct for a FORK and wrong under DISPATCH, where it
// names a path in Grove's own repo rather than in the corpus on screen — so the affordance
// was withheld entirely and the wiki became read-only for the one packaging where the
// content is most obviously somebody's to edit.
//
// The decision is pure (`lib/editTarget`); this hook is the wiring: it reads the live
// mount list so a role downgrade reroutes the delivery on the next render (rw → the
// `edit-file` overlay; ro → the workbench under the reader's authority, R3-877) rather
// than producing `EROFS` on click — and a `readerCanEdit: false` hint or a `read-only`
// refusal hides the offer — and it hands back one `openEditor(entryKey)` the chrome
// calls without knowing which packaging it is in.
import { useCallback, useMemo, useState } from "react";
import {
  capFile,
  invokeTask,
  requestEdit,
  useMounts,
} from "@immediately-run/sdk";
import {
  getContentRoot,
  getCorpusMountId,
  isDispatched,
} from "../lib/contentRoot";
import { corpusWritable, editTarget } from "../lib/editTarget";

export interface EditAffordance {
  /** Whether to render an edit affordance at all — the MOUNT's answer, live. */
  writable: boolean;
  /** True while an editor is being summoned (for a busy label). */
  busy: boolean;
  /** True when the host REFUSED the last edit request — callers render it as
   *  text where the affordance was offered (3.3.1 / 4.1.3, R3-608). A
   *  `cancelled` rejection (the reader closed the editor) never sets this. */
  refused: boolean;
  /** Open `entryKey` in the platform editor. Never throws; a refusal is reported. */
  openEditor: (entryKey: string) => void;
  /**
   * What a save actually does, so the affordance can say so.
   *
   * Under a fork the app and the corpus are one repo, so "save" and "propose a
   * change" are one story. Under dispatch they are two mounts — and since
   * R3-643's host half (site-main #576) both are wired: the write lands in the
   * corpus mount, and the contribute flow forks/branches/opens the PR against
   * the CONTENT repo (the viewer's repo receives nothing).
   */
  editHint: string;
}

export function useEditAffordance(): EditAffordance {
  const mounts = useMounts();
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);

  // Read the corpus identity through the mount list's identity, so the memo re-runs when
  // the host re-announces a mount. The root itself is latched at boot (see `contentRoot`);
  // the MODE is not, and that is the half this hook exists to keep current. R3-877: the
  // delegation's live MODE now also routes the delivery (rw → the edit-file overlay,
  // ro → the workbench under the reader's authority).
  const corpus = useMemo(() => {
    const mountId = getCorpusMountId();
    const mount = mounts?.find((m) => (m.id ?? m.path) === mountId);
    return {
      dispatched: isDispatched(),
      contentRoot: getContentRoot(),
      mountId,
      mountMode: mount?.mode ?? null,
    };
  }, [mounts]);

  // R3-877: a `read-only` refusal (the reader cannot edit the source) hides the
  // affordance until the next mount announcement — the hint's re-announcement is
  // exactly what unlatches it. Reset on every mount-list change — the
  // render-adjusted-state pattern (not an effect, which would paint one frame
  // stale), the React-sanctioned form.
  const [readerReadOnly, setReaderReadOnly] = useState(false);
  const [resetFor, setResetFor] = useState(mounts);
  if (resetFor !== mounts) {
    setResetFor(mounts);
    setReaderReadOnly(false);
  }

  // No `readOnly` veto here (there was one until R3-878's live leg): the boot-time
  // read-only latch is the corpus delegation's `ro` mode, so gating on it hid the
  // affordance in exactly the one case the workbench delivery exists for — an
  // app-declared opener's chroot is always `ro` (APP_CUSTOMIZATION §5a). The live
  // mount list already answers writability (`corpusWritable`), re-read on every
  // announcement, and a `read-only` refusal latches the offer off above.
  const writable = !readerReadOnly && corpusWritable(mounts, corpus);

  // A refusal surfaces where the affordance was offered (3.3.1, R3-608);
  // `cancelled` — the reader closing the editor — stays silent by contract.
  const refusedUnlessCancelled = (e: unknown): undefined => {
    if ((e as { code?: string } | null)?.code !== "cancelled") setRefused(true);
    return undefined;
  };

  const openEditor = useCallback(
    (entryKey: string) => {
      const target = editTarget(entryKey, corpus);
      if (!target) return;
      setBusy(true);
      setRefused(false);
      const done = () => setBusy(false);
      if (target.via === "self") {
        // The fork: the present→edit transition on our own source. Self-scoped by
        // contract, which is exactly right when the corpus IS our repo.
        requestEdit({ path: target.path })
          .catch(refusedUnlessCancelled)
          .finally(done);
        return;
      }
      // Dispatch, read-only delegation: ask the workbench to open the entry's source
      // under the reader's authority (R3-876 / APP_CUSTOMIZATION §5a). Our chroot is
      // never upgraded and nothing is minted for us; the host needs a real gesture,
      // which this click is. `cancelled` stays silent; `read-only` hides the
      // affordance until the next mount announcement; anything else renders in place
      // as text (the `refused` flag) — and is never retried through `edit-file`.
      if (target.via === "workbench") {
        requestEdit({ bundleFile: target.relPath })
          .catch((e: unknown) => {
            const code = (e as { code?: string } | null)?.code;
            if (code === "cancelled") return;
            if (code === "read-only") {
              setReaderReadOnly(true);
              return;
            }
            setRefused(true);
          })
          .finally(done);
        return;
      }
      // Dispatch, writable delegation: attenuate the corpus delegation down to this
      // one file and hand it to the platform editor. Nothing new is minted — we
      // already hold the directory, and `edit-file` is one hop further along a chain
      // §5.7.1 bounds at depth 4. The host resolves the cap against our grants, so
      // this can only ever narrow.
      invokeTask("edit-file", {
        file: capFile(
          { mountId: target.mountId, relPath: target.relPath },
          { mode: "rw" },
        ),
      })
        .catch(refusedUnlessCancelled) // `cancelled` is how a reader closes the editor
        .finally(done);
    },
    [corpus],
  );

  const editHint = corpus.dispatched
    ? "Edits save to the mounted content, and can be proposed back to its repository as a PR."
    : "Edit this entry";

  return { writable, busy, refused, openEditor, editHint };
}
