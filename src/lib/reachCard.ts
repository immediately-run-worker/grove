// The reach card (GROVE_AGENT_SPEC §6) — the agent's envelope, rendered as rows in
// the two-word vocabulary with a cause for every ✗ (R-SP-3). R-GA-1: every row is
// COMPUTED from the session's envelope (provider four-state, chat grant, mount
// writability, packaging, source trust); no capability claim on any pixel of this
// surface is hand-written copy. The four old banners collapse into these rows; chips
// render only for rows that are ✓ — derived, not curated.
//
// R3-752: a row whose outcome is a destination is not a denial — the apply row
// renders `→ elsewhere` (R-GA-3 still holds: never from this panel), the packaging
// substrate is its own neutral row, the source-trust sentence is its own line keyed
// on WHY the source reads as shared (R-SP-3/R-SP-6), and the tool-less degrade is a
// visible qualifier on the Q&A row instead of a silent downgrade (SPEC_AUDIT §2.8u).

import type { AgentContextBlock, ChatProviderState } from '@immediately-run/sdk';

/** Why `sourceShared` reads as it does — the SDK's own union, indexed off the
 *  exported block so the two can never drift (R6: one home, the SDK's). */
export type SourceSharedBasis = AgentContextBlock['sourceSharedBasis'];

/** The visually-hidden word for a row's state — one home for the map the panel
 *  renders per row and announces through its live region (R6). */
export function stateWord(state: ReachRow['state']): string {
  return state === 'ok' ? 'available' : state === 'blocked' ? 'unavailable' : state === 'elsewhere' ? 'opens elsewhere' : 'not applicable';
}

/** One reach-card row.
 *
 *  `state: 'neutral'` renders neither ✓ nor ✗. Four producers, all of them "we are not
 *  claiming anything here":
 *   1. the `unknown` provider state — rendering a cause there re-creates the false banner
 *      R3-300 fixed: `unknown` means unanswered, not ungranted;
 *   2. since R3-752, the packaging row — substrate context, not a capability claim;
 *   3. since R3-688, the Q&A row while the CATALOG is unanswered — the same "not told
 *      yet" as (1), one channel over;
 *   4. since R3-688, the exhaustiveness fallback at the end of the Q&A chain. Unreachable
 *      while `ChatProviderState` has four members, and deliberately neutral rather than ✓
 *      so that a fifth member added without updating this file degrades to claiming
 *      nothing instead of claiming everything.
 *
 *  `state: 'elsewhere'` is the apply row: the outcome happens at another surface, which is
 *  where to go — never a ✗. */
/** R3-790 — the one spelling of the ungranted-chat cause: the row renders it and
 *  the composer's refusal toast composes from it, so a reword cannot drift the
 *  two surfaces R-GA-1 holds to agreement. The tail is its own constant so the
 *  cancelled toast composes the SAME clause without splitting a literal at
 *  runtime (a reword of the cause must never render 'undefined' into copy). */
export const READING_WORKS_NORMAL = 'reading works as normal';
export const UNGRANTED_CHAT_CAUSE = `this Grove wasn't granted chat — ${READING_WORKS_NORMAL}`;

export interface ReachRow {
  key: 'packaging' | 'answer' | 'read' | 'draft' | 'apply';
  label: string;
  state: 'ok' | 'blocked' | 'neutral' | 'elsewhere';
  cause?: string;
  /** R3-790 — the row's earning affordance: on the ✗ chat row, an 'Enable chat'
   *  control whose CLICK invokes (the host's lazy consent gesture mints on that
   *  same activation, site-main#612). Declared here so the card stays the one
   *  computed surface; the panel renders it, never invents it. */
  action?: 'enable-chat';
  /** Where a `'elsewhere'` row's outcome happens — rendered after `→`, never a ✗. */
  destination?: string;
  /** Chips this row contributes when ✓ — the panel renders exactly these. */
  chips?: string[];
}

export interface ReachInputs {
  providerState: ChatProviderState;
  /** Whether the grant-filtered catalog advertises `llm:chat` (the consented
   *  capability — absent on an ungranted fork, a distinct cause from "no key").
   *
   *  Since R3-688 this is the BELT, not the primary discriminator: a 0.72.0 host marks
   *  the grantless answer on the provider channel itself, and that mark is read first.
   *  But it is still checked BEFORE `not-configured`, not after, because a host
   *  predating the mark answers an ungranted fork with `{ provider: null }` — the same
   *  payload as keyless — so not-configured would otherwise win and send a user who HAS
   *  a key to Settings. See the ordering note in `computeReachRows` for the one
   *  imprecision that buys, and how `catalogAnswered` bounds it. */
  chatGranted: boolean;
  /** Whether the host has actually ANSWERED the catalog (`useCatalogAnswered()`).
   *
   *  `!chatGranted` is true both for "not granted" and for "has not replied yet", and
   *  the value cannot tell them apart because an empty catalog is a legitimate answer.
   *  This does, because the push channel has no value-equality check: a second
   *  notification means the host spoke. While it is `false`, the card declines to name
   *  a cause rather than guessing one. */
  catalogAnswered: boolean;
  writable: boolean;
  /** Fail-closed source trust (git ⇒ indeterminate ⇒ treated as shared). Not
   *  rendered on any row since R3-752 — it is the source-trust LINE's input (see
   *  `sourceTrustLine`) — but part of the envelope, so the cross-product over the
   *  card's inputs can assert no input re-blocks the apply row. */
  sourceShared: boolean;
  /** The corpus mount id (`getCorpusMountId()`): `null` is a fork reading its own
   *  bundled corpus, an id is a wiki mounted into it. One fact, decided once at
   *  boot by the same delegation as the root — never a second source of truth. */
  mountId: string | null;
  /** Whether the configured provider advertises `features.tools`. `false` with a
   *  configured provider degrades the agent to context-stuffing (G-GA-8) — a real
   *  capability change the card must show, not hide (SPEC_AUDIT §2.8u). */
  toolsSupported: boolean;
}

/** The rows, computed. Order is the card's display order: the substrate first
 *  (context for every row under it), then the capability rows. */
export function computeReachRows({
  providerState,
  chatGranted,
  catalogAnswered,
  writable,
  mountId,
  toolsSupported,
}: ReachInputs): ReachRow[] {
  // Row 0 — packaging (R3-752). Context, not a claim: `neutral`, no chips, no
  // capability words. A pinned-library consumer is indistinguishable from a fork at
  // runtime and the distinction does not change reach, so the row states the
  // substrate — never a guess at how the app was assembled.
  const packaging: ReachRow = {
    key: 'packaging',
    label: mountId === null ? 'Reads its own entries' : 'Reads a wiki mounted into it',
    state: 'neutral',
  };

  // Row 1 — Q&A. The provider states × the grant, with the two NOT-causes never
  // conflated (G-GA-10): "no key" is the user's to fix in Settings; "not granted"
  // is this copy's consent state, and reading works either way. A configured
  // provider without `features.tools` keeps the ✓ — asking still works — and
  // carries the degrade as a qualifier (G-GA-8, SPEC_AUDIT §2.8u).
  //
  // R3-688: the host now marks the grantless answer on the provider channel itself
  // (`ungranted`), so the consent cause is computable even though an ungranted frame is
  // never told the provider — the host's grant decision IS the fact. The catalog check is
  // the BELT for a host predating the mark, and it is checked BEFORE not-configured
  // because a pre-mark host answers an ungranted fork with `{provider: null}` — the same
  // payload as keyless — so not-configured would win and send a user who has a key to
  // Settings.
  //
  // THE UNANSWERED CATALOG, and the two wrong answers before this one (grove#75 r1, r2).
  //
  // `!chatGranted` is true both for "not granted" and for "the host has not replied yet",
  // and the catalog's VALUE cannot separate them because an empty catalog is a legitimate
  // answer. Round 1 caught the belt firing on the unanswered case and claiming a consent
  // state about a frame that may hold the grant.
  //
  // Wrong answer 1: gate on `catalog.length > 0`. That reads an empty ANSWER as silence,
  // which turns the G-GA-10 case below (a configured provider beside an empty catalog)
  // from a permanent correct ✗ into a permanent unbacked ✓ — the R-GA-1 violation this
  // card exists to prevent. Measured; two tests catch it.
  //
  // Wrong answer 2: declare it unfixable without an SDK change. Round 2 found it is
  // derivable here, because the push channel has no value-equality check — a second
  // notification means the host spoke, even when the value equals the initial `[]`. That
  // is `useCatalogAnswered()`.
  //
  // So: while the catalog is unanswered the row is NEUTRAL — no cause named. `catalogAnswered`
  // alone is not enough, because falling through to the ✓ arm would trade an under-claim
  // for an over-claim, and over-claiming is the one R-GA-1 forbids outright.
  let answer: ReachRow;
  const degrade = toolsSupported ? '' : ' (reads a summary of this wiki, not entries on demand)';
  if (providerState.status === 'unknown') {
    answer = { key: 'answer', label: 'Answer questions about this wiki', state: 'neutral' };
  } else if (providerState.status === 'ungranted') {
    answer = {
      key: 'answer',
      label: 'Answer questions about this wiki',
      state: 'blocked',
      cause: UNGRANTED_CHAT_CAUSE,
      // R3-790: the host's MARK says the grant is missing (provider and key state
      // unknown — the mark does not tell); the invoke this row's own click makes is
      // what the host's lazy gesture earns on that same activation.
      action: 'enable-chat',
    };
  } else if (!chatGranted) {
    answer = catalogAnswered
      ? {
          key: 'answer',
          label: 'Answer questions about this wiki',
          state: 'blocked',
          cause: UNGRANTED_CHAT_CAUSE,
          // R3-790: the affordance only when a provider RESOLVES (status
          // 'configured' with the grant missing) — on a keyless host the invoke's
          // earning path is the SP-7 connect flow, which the not-configured copy
          // already names (Settings); offering both rows' affordances here would
          // blur which half is missing.
          ...(providerState.status === 'configured' ? { action: 'enable-chat' as const } : {}),
        }
      : // The host has not answered the catalog. We know nothing about the grant, so name
        // nothing — the same shape `unknown` uses for an unanswered provider.
        { key: 'answer', label: 'Answer questions about this wiki', state: 'neutral' };
  } else if (providerState.status === 'not-configured') {
    answer = {
      key: 'answer',
      label: 'Answer questions about this wiki',
      state: 'blocked',
      cause: 'no model key connected — add one in Settings',
    };
  } else if (providerState.status === 'configured') {
    answer = {
      key: 'answer',
      label: `Answer questions about this wiki${degrade}`,
      state: 'ok',
      chips: ['Summarize this entry', 'What entries are tagged security?'],
    };
  } else {
    // The ✓ arm is NARROWED to `configured` and this is the exhaustiveness check. The open
    // `else` it replaces dates from R3-489, the file's first commit, and survived R3-752
    // untouched; R3-688 is what closes it. Left open, a FIFTH provider state would land on
    // ✓ with chips — an unbacked capability claim (R-GA-1) that `tsc` would not mention.
    // A fourth was just added; the fifth must be a compile error, not a silent grant.
    const unreachable: never = providerState;
    void unreachable;
    answer = { key: 'answer', label: 'Answer questions about this wiki', state: 'neutral' };
  }

  // Row 2 — the body source. Both packagings define one post-S2 (the fork's own
  // bundled corpus; the dispatched wiki mount), so this row is ✓ unless degenerate.
  // It is computed, not assumed: the day a packaging lacks a source, the card says so.
  const read: ReachRow = {
    key: 'read',
    label: 'Read entries and structure',
    state: 'ok',
  };

  // Row 3 — drafting. Writability is the mount's answer; the chip proposes an edit
  // the agent DESCRIBES (S4's host-confirmed diffs are not built — v1 drafts in chat).
  const draft: ReachRow = writable
    ? {
        key: 'draft',
        label: 'Draft changes',
        state: 'ok',
        chips: [`Suggest an edit for "${'this entry'}"`],
      }
    : { key: 'draft', label: 'Draft changes', state: 'blocked', cause: 'you’re a reader here' };

  // Row 4 — applying. NEVER from this panel (R-GA-3): the widget renders content and
  // is exactly the broker core_concepts §8a Axis D forbids. That is a DESTINATION,
  // not a denial — where to go, stated as one — so it renders `→`, never ✗. The
  // source-trust sentence does not ride here: it is a property of the source, and it
  // has its own line under the card (`sourceTrustLine`).
  const apply: ReachRow = {
    key: 'apply',
    label: 'Apply changes',
    state: 'elsewhere',
    destination: 'in the editor or workbench, where you confirm them',
  };

  return [packaging, answer, read, draft, apply];
}

/** The chips the panel shows: exactly the ✓ rows' chips, in card order (R-GA-1 —
 *  derived from the envelope, never curated). */
export function reachChips(rows: ReachRow[]): string[] {
  return rows.flatMap((r) => (r.state === 'ok' ? r.chips ?? [] : []));
}

/**
 * The source-trust line under the card (R3-752). It is a property of the SOURCE,
 * not of the apply row it used to be glued to, and its copy is chosen by WHY the
 * source reads as shared — a cause the reader can act on (R-SP-3), never a
 * classification (R-SP-6). `null` when the source is not shared: no line, no
 * reassurance about a regime that is not running.
 */
export function sourceTrustLine(shared: boolean, basis: SourceSharedBasis): string | null {
  if (!shared) return null;
  return basis === 'git-indeterminate'
    ? 'anyone who can push to this repo can change what the agent reads'
    : 'others can change what the agent reads here';
}

/** R-GA-6's unconditional egress line — shown whenever a provider is bound,
 *  whatever the wiki's trust mode: Q&A composes read + provider egress, and the
 *  confidentiality axis is grant-based, not sharedness-based. */
export const EGRESS_DISCLOSURE =
  'answers come from your connected model provider, which receives what the agent reads here';

export function showEgressDisclosure(providerState: ChatProviderState): boolean {
  return providerState.status === 'configured';
}
