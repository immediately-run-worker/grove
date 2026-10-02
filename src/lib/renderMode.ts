// The safe-vs-compiled render decision, in ONE place (R3-872 review, round 1):
// interpreter mode is read from the HOME entry (wiki-wide) OR the current entry
// (per-entry), and the two answer different questions — wiki-wide is the
// interpreter declaration for foreign content; per-entry exists for the document
// that is only correct as data (R3-252's proof page). Three renderers decide on
// this — the layout chain's renderer pick, the entry body's pick, and the shell's
// `safe` field — and drift between them is a trust-boundary hole (an executing
// body inside a safe chain), never a style issue. Pure, so the rule is testable
// without a render.

/** True when the entry renders through the non-executable interpreter path. */
export function resolveSafeRender(
  homeMeta: Record<string, unknown> | null | undefined,
  entryMeta: Record<string, unknown> | null | undefined,
): boolean {
  return homeMeta?.render === 'safe' || entryMeta?.render === 'safe';
}
