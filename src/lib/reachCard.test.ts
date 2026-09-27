// R-GA-1 / G-GA-1 / G-GA-6 / G-GA-10 / R-SP-6 — the reach card is a pure function of
// the envelope; no pixel claims a capability the session lacks, causes are distinct
// and concrete, and state flips recompute rows AND chips. R3-752: the apply row is a
// destination (`elsewhere`, never ✗), the packaging substrate is its own neutral row,
// the source-trust copy is keyed on its basis, and no row carries a model noun.
import { describe, it, expect } from "vitest";
import {
  computeReachRows,
  reachChips,
  sourceTrustLine,
  showEgressDisclosure,
} from "./reachCard";
import type { ChatProviderState } from "@immediately-run/sdk";

const configured = (tools = true): ChatProviderState => ({
  status: "configured",
  provider: {
    providerId: "llm.chat.anthropic",
    hostVouched: true,
    features: {
      vision: false,
      tools,
      jsonMode: true,
      reasoning: false,
      maxContextTokens: 100000,
    },
  },
});

const row = (rows: ReturnType<typeof computeReachRows>, key: string) =>
  rows.find((r) => r.key === key)!;

describe("G-GA-10 — the Q&A row renders the provider state honestly", () => {
  it("unknown renders NEUTRAL — no cause, no connect copy (the R3-300 rule)", () => {
    const rows = computeReachRows({
      providerState: { status: "unknown" },
      chatGranted: true,
      catalogAnswered: true,
      writable: true,
      sourceShared: true,
      mountId: null,
      toolsSupported: true,
    });
    expect(row(rows, "answer").state).toBe("neutral");
    expect(row(rows, "answer").cause).toBeUndefined();
  });

  it("not-configured names the KEY cause; ungranted names the CONSENT cause — never conflated", () => {
    const noKey = computeReachRows({
      providerState: { status: "not-configured" },
      chatGranted: true,
      catalogAnswered: true,
      writable: true,
      sourceShared: false,
      mountId: null,
      toolsSupported: true,
    });
    expect(row(noKey, "answer").state).toBe("blocked");
    expect(row(noKey, "answer").cause).toContain("add one in Settings");

    const forbidden = computeReachRows({
      providerState: configured(),
      chatGranted: false,
      catalogAnswered: true,
      writable: true,
      sourceShared: false,
      mountId: null,
      toolsSupported: true,
    });
    expect(row(forbidden, "answer").state).toBe("blocked");
    expect(row(forbidden, "answer").cause).toContain("wasn't granted chat");
    expect(row(forbidden, "answer").cause).not.toContain("Settings");
  });

  it("the host-marked UNGRANTED state names the consent cause WITHOUT a configured provider (R3-688)", () => {
    // The R3-688 exit: an ungranted fork is never told the provider, so before the
    // host mark the consent cause was uncomputable — the fork read not-configured and
    // rendered the KEY copy at a user who had one. The marked state fixes the cause
    // with nothing but the grant decision.
    const marked = computeReachRows({
      providerState: { status: "ungranted" },
      chatGranted: false,
      catalogAnswered: true,
      writable: true,
      sourceShared: false,
      mountId: null,
      toolsSupported: true,
    });
    expect(row(marked, "answer").state).toBe("blocked");
    expect(row(marked, "answer").cause).toContain("wasn't granted chat");
    expect(row(marked, "answer").cause).not.toContain("Settings");
    // The egress line stays hidden: no provider is bound for this frame.
    expect(showEgressDisclosure({ status: "ungranted" })).toBe(false);
  });

  it("the mark ALONE blocks — ungranted with a granted-looking catalog (R3-688, isolating)", () => {
    // THE test for this item, and it was missing: every other ungranted case also sets
    // `chatGranted: false`, so `!chatGranted` satisfies them on its own and the whole
    // R3-688 arm could be deleted with the suite green. Round 1 proved that by deleting
    // `providerState.status === 'ungranted' ||` — 499/499 still passed.
    //
    // This is the one input that isolates the mark: a stale or racing catalog still
    // advertising `llm:chat` beside a host that has marked the answer ungranted.
    //
    // What deleting the arm does now, measured: the input falls into the exhaustiveness
    // branch and renders `neutral`, so line 59's state assertion is what catches it. It
    // is `'ok'` WITH both chips — an unbacked capability claim, not merely a wrong cause
    // — only before the tail was narrowed in the same commit, which is the state round 1
    // found. Both are caught; the chip assertions below hold the stronger, older shape.
    const marked = computeReachRows({
      providerState: { status: "ungranted" },
      chatGranted: true,
      catalogAnswered: true,
      writable: true,
      sourceShared: false,
      mountId: null,
      toolsSupported: true,
    });
    expect(row(marked, "answer").state).toBe("blocked");
    expect(row(marked, "answer").cause).toContain("wasn't granted chat");
    expect(row(marked, "answer").cause).not.toContain("Settings");
    expect(row(marked, "answer").chips).toBeUndefined();
    expect(
      reachChips(marked).some((c) => /summarize|tagged security/i.test(c)),
    ).toBe(false);
  });

  it("an UNANSWERED catalog names no cause — neutral, not a guessed consent state", () => {
    // `!chatGranted` is true both for "not granted" and for "the host has not replied",
    // and the catalog's value cannot separate them (an empty catalog is a real answer).
    // Guessing "not granted" claims a consent state about a frame that may hold the
    // grant; guessing the ✓ arm claims a capability it may not have, which R-GA-1
    // forbids outright. So: name nothing, exactly as `unknown` does one channel over.
    const waiting = computeReachRows({
      providerState: { status: "not-configured" },
      chatGranted: false,
      catalogAnswered: false,
      writable: true,
      sourceShared: false,
      mountId: null,
      toolsSupported: true,
    });
    expect(row(waiting, "answer").state).toBe("neutral");
    expect(row(waiting, "answer").cause).toBeUndefined();
    expect(row(waiting, "answer").chips).toBeUndefined();

    // …and a CONFIGURED provider must not fall through to ✓ while the grant is unknown.
    const keyed = computeReachRows({
      providerState: configured(),
      chatGranted: false,
      catalogAnswered: false,
      writable: true,
      sourceShared: false,
      mountId: null,
      toolsSupported: true,
    });
    expect(row(keyed, "answer").state).toBe("neutral");
    expect(
      reachChips(keyed).some((c) => /summarize|tagged security/i.test(c)),
    ).toBe(false);
  });

  it("the host MARK does not wait for the catalog — ungranted blocks with no answer at all", () => {
    // The mark is authoritative on its own; gating it behind the catalog would reintroduce
    // the very gap R3-688 closes.
    const marked = computeReachRows({
      providerState: { status: "ungranted" },
      chatGranted: false,
      catalogAnswered: false,
      writable: true,
      sourceShared: false,
      mountId: null,
      toolsSupported: true,
    });
    expect(row(marked, "answer").state).toBe("blocked");
    expect(row(marked, "answer").cause).toContain("wasn't granted chat");
  });

  it("configured + granted is ✓ and carries the read-flavored chips", () => {
    const ok = computeReachRows({
      providerState: configured(),
      chatGranted: true,
      catalogAnswered: true,
      writable: false,
      sourceShared: false,
      mountId: null,
      toolsSupported: true,
    });
    expect(row(ok, "answer").state).toBe("ok");
    expect(row(ok, "answer").chips).toBeDefined();
  });
});

describe("G-GA-1 — the read/draft/apply rows derive from writability, never copy", () => {
  it("read-only blocks Draft with the reader cause and yields NO write chip", () => {
    const rows = computeReachRows({
      providerState: configured(),
      chatGranted: true,
      catalogAnswered: true,
      writable: false,
      sourceShared: false,
      mountId: null,
      toolsSupported: true,
    });
    expect(row(rows, "draft").state).toBe("blocked");
    expect(row(rows, "draft").cause).toContain("reader");
    const chips = reachChips(rows);
    expect(
      chips.some((c) =>
        /add an entry|fix broken|reorganize|timeline|suggest an edit/i.test(c),
      ),
    ).toBe(false);
  });

  it("writable turns Draft ✓ — and its chip is a DESCRIBE, not an apply", () => {
    const rows = computeReachRows({
      providerState: configured(),
      chatGranted: true,
      catalogAnswered: true,
      writable: true,
      sourceShared: false,
      mountId: null,
      toolsSupported: true,
    });
    expect(row(rows, "draft").state).toBe("ok");
    expect((row(rows, "draft").chips ?? []).join(" ")).toMatch(
      /suggest an edit/i,
    );
  });
});

describe("R3-752 — the apply row is a destination, across every input (R-GA-3)", () => {
  // Every member of the union, including the one R3-688 adds — the spec calls this sweep
  // the mechanical guarantee for R-SP-6, and it was enumerating three of four, missing
  // exactly the state this item is about.
  const states: ChatProviderState[] = [
    { status: "unknown" },
    { status: "not-configured" },
    { status: "ungranted" },
    configured(true),
    configured(false),
  ];
  // The full cross-product of {writable} × {sourceShared} × {provider states}: NO input
  // can put the apply row back to blocked or put the trust sentence back on it.
  for (const writable of [true, false]) {
    for (const sourceShared of [true, false]) {
      for (const providerState of states) {
        it(`writable=${writable} sourceShared=${sourceShared} provider=${providerState.status} → elsewhere with a destination and no cause`, () => {
          const rows = computeReachRows({
            providerState,
            chatGranted: true,
            catalogAnswered: true,
            writable,
            sourceShared,
            mountId: "space:abc",
            toolsSupported: true,
          });
          expect(row(rows, "apply").state).toBe("elsewhere");
          expect(row(rows, "apply").destination).toContain(
            "editor or workbench",
          );
          expect(row(rows, "apply").cause).toBeUndefined();
        });
      }
    }
  }

  it("the source-trust sentence is a property of the SOURCE — never on the apply row", () => {
    const rows = computeReachRows({
      providerState: configured(),
      chatGranted: true,
      catalogAnswered: true,
      writable: true,
      sourceShared: true,
      mountId: null,
      toolsSupported: true,
    });
    expect(JSON.stringify(row(rows, "apply"))).not.toContain("others can");
    expect(JSON.stringify(row(rows, "apply"))).not.toContain(
      "push to this repo",
    );
  });
});

describe("R3-752 — the packaging row states the substrate, as context (neutral, no chips)", () => {
  it("mountId: null is the own-corpus row; an id is the mounted row", () => {
    const own = computeReachRows({
      providerState: configured(),
      chatGranted: true,
      catalogAnswered: true,
      writable: true,
      sourceShared: true,
      mountId: null,
      toolsSupported: true,
    });
    expect(row(own, "packaging").label).toBe("Reads its own entries");
    expect(row(own, "packaging").state).toBe("neutral");

    const mounted = computeReachRows({
      providerState: configured(),
      chatGranted: true,
      catalogAnswered: true,
      writable: true,
      sourceShared: true,
      mountId: "space:abc",
      toolsSupported: true,
    });
    expect(row(mounted, "packaging").label).toBe(
      "Reads a wiki mounted into it",
    );
    expect(row(mounted, "packaging").state).toBe("neutral");
  });

  it("the packaging row contributes no chips — either packaging, same chip set", () => {
    const own = reachChips(
      computeReachRows({
        providerState: configured(),
        chatGranted: true,
        catalogAnswered: true,
        writable: true,
        sourceShared: true,
        mountId: null,
        toolsSupported: true,
      }),
    );
    const mounted = reachChips(
      computeReachRows({
        providerState: configured(),
        chatGranted: true,
        catalogAnswered: true,
        writable: true,
        sourceShared: true,
        mountId: "space:abc",
        toolsSupported: true,
      }),
    );
    expect(mounted).toEqual(own);
  });
});

describe("R3-752 — the source-trust line is keyed on WHY the source reads as shared", () => {
  it("the two bases produce different strings, neither on a row", () => {
    const git = sourceTrustLine(true, "git-indeterminate");
    const mount = sourceTrustLine(true, "mount-trust-mode");
    expect(git).toContain("push to this repo");
    expect(mount).toContain("others can change");
    expect(git).not.toBe(mount);
  });

  it("a source that is not shared renders NO line — no reassurance about a regime not running", () => {
    expect(sourceTrustLine(false, "git-indeterminate")).toBeNull();
    expect(sourceTrustLine(false, "mount-trust-mode")).toBeNull();
  });
});

describe("R3-752 — R-SP-6: no model nouns anywhere on the card, checked mechanically", () => {
  // Every member of the union, including the one R3-688 adds — the spec calls this sweep
  // the mechanical guarantee for R-SP-6, and it was enumerating three of four, missing
  // exactly the state this item is about.
  const states: ChatProviderState[] = [
    { status: "unknown" },
    { status: "not-configured" },
    { status: "ungranted" },
    configured(true),
    configured(false),
  ];
  const banned =
    /\b(taint|tainted|tier|principal|trust mode|capability|grant|shared source|low-trust)\b/i;

  it("no string any row produces matches the banned vocabulary, over the full cross-product", () => {
    for (const writable of [true, false]) {
      for (const sourceShared of [true, false]) {
        for (const providerState of states) {
          for (const mountId of [null, "space:abc"]) {
            for (const toolsSupported of [true, false]) {
              for (const chatGranted of [true, false]) {
                for (const catalogAnswered of [true, false]) {
                  const rows = computeReachRows({
                    providerState,
                    chatGranted,
                    catalogAnswered,
                    writable,
                    sourceShared,
                    mountId,
                    toolsSupported,
                  });
                  const strings = rows.flatMap((r) =>
                    [
                      r.label,
                      r.cause,
                      r.destination,
                      ...(r.chips ?? []),
                    ].filter((s): s is string => typeof s === "string"),
                  );
                  for (const s of strings) expect(s).not.toMatch(banned);
                }
              }
            }
          }
        }
      }
    }
  });

  it("the source-trust lines pass the same vocabulary rule", () => {
    for (const basis of ["git-indeterminate", "mount-trust-mode"] as const) {
      const line = sourceTrustLine(true, basis)!;
      expect(line).not.toMatch(banned);
    }
  });
});

describe("R3-752 / G-GA-8 — the tool-less degrade is a visible qualifier, never a silent downgrade", () => {
  it("configured + granted + tools=false keeps row 1 ✓ and adds the degrade qualifier", () => {
    const degraded = computeReachRows({
      providerState: configured(false),
      chatGranted: true,
      catalogAnswered: true,
      writable: true,
      sourceShared: true,
      mountId: null,
      toolsSupported: false,
    });
    expect(row(degraded, "answer").state).toBe("ok");
    expect(row(degraded, "answer").label).toContain(
      "reads a summary of this wiki",
    );
    expect(row(degraded, "answer").chips).toBeDefined();
  });

  it("tools=true restores the plain label; a blocked row never grows the qualifier", () => {
    const fine = computeReachRows({
      providerState: configured(true),
      chatGranted: true,
      catalogAnswered: true,
      writable: true,
      sourceShared: true,
      mountId: null,
      toolsSupported: true,
    });
    expect(row(fine, "answer").label).toBe("Answer questions about this wiki");

    const noKey = computeReachRows({
      providerState: { status: "not-configured" },
      chatGranted: true,
      catalogAnswered: true,
      writable: true,
      sourceShared: true,
      mountId: null,
      toolsSupported: false,
    });
    expect(row(noKey, "answer").label).toBe("Answer questions about this wiki");
    expect(row(noKey, "answer").cause).toContain("add one in Settings");
  });
});

describe("G-GA-6 — envelope flips recompute rows and chips together", () => {
  it("disconnecting the provider flips answer ✓→blocked and drops its chips", () => {
    const before = computeReachRows({
      providerState: configured(),
      chatGranted: true,
      catalogAnswered: true,
      writable: true,
      sourceShared: false,
      mountId: null,
      toolsSupported: true,
    });
    const after = computeReachRows({
      providerState: { status: "not-configured" },
      chatGranted: true,
      catalogAnswered: true,
      writable: true,
      sourceShared: false,
      mountId: null,
      toolsSupported: true,
    });
    expect(row(before, "answer").state).toBe("ok");
    expect(row(after, "answer").state).toBe("blocked");
    expect(reachChips(after)).not.toContain("Summarize this entry");
  });

  it("revoking write flips draft ✓→blocked on the next computation", () => {
    const before = computeReachRows({
      providerState: configured(),
      chatGranted: true,
      catalogAnswered: true,
      writable: true,
      sourceShared: false,
      mountId: null,
      toolsSupported: true,
    });
    const after = computeReachRows({
      providerState: configured(),
      chatGranted: true,
      catalogAnswered: true,
      writable: false,
      sourceShared: false,
      mountId: null,
      toolsSupported: true,
    });
    expect(row(before, "draft").state).toBe("ok");
    expect(row(after, "draft").state).toBe("blocked");
  });
});

describe("R-GA-6 — the egress disclosure is unconditional when a provider is bound", () => {
  it("shows for configured, not for unknown or not-configured, whatever the trust mode", () => {
    expect(showEgressDisclosure(configured())).toBe(true);
    expect(showEgressDisclosure({ status: "unknown" })).toBe(false);
    expect(showEgressDisclosure({ status: "not-configured" })).toBe(false);
  });
});


// ── R3-790 — the earning affordance's arms ────────────────────────────────────

describe('R3-790 — the ✗ chat row carries the earning affordance on its arms', () => {
  const configured: ChatProviderState = {
    status: 'configured',
    provider: { providerId: 'llm.chat.anthropic', hostVouched: true, features: { vision: false, tools: true, jsonMode: true, reasoning: false, maxContextTokens: 100000 } },
  };
  const base = { writable: true, sourceShared: false, catalogAnswered: true, mountId: null };

  it('the host-marked ungranted arm carries it', () => {
    const rows = computeReachRows({ ...base, providerState: { status: 'ungranted' } as ChatProviderState, chatGranted: false, toolsSupported: true });
    expect(rows.find((r) => r.key === 'answer')?.action).toBe('enable-chat');
  });

  it("the belt arm carries it when the provider RESOLVES (configured, catalog answered, grant missing)", () => {
    const rows = computeReachRows({ ...base, providerState: configured, chatGranted: false, toolsSupported: true });
    expect(rows.find((r) => r.key === 'answer')?.action).toBe('enable-chat');
  });

  it('no arm carries it when the catalog is unanswered, or the provider is keyless', () => {
    const neutral = computeReachRows({ ...base, catalogAnswered: false, providerState: configured, chatGranted: false, toolsSupported: true });
    expect(neutral.find((r) => r.key === 'answer')?.action).toBeUndefined();
    const keyless = computeReachRows({ ...base, providerState: { status: 'not-configured' } as ChatProviderState, chatGranted: false, toolsSupported: true });
    expect(keyless.find((r) => r.key === 'answer')?.action).toBeUndefined();
  });
});
