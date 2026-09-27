// @vitest-environment jsdom
// G-GA-1 / G-GA-2 — the surface itself: with `writable=false` and no provider, the
// DOM contains no write-flavored chip and no "proposes the edit"/"host confirms"
// copy; with `writable=false` but a configured, granted provider, Q&A is fully
// enabled (read-only NEVER blocks asking — R-GA-5). Provider/grant state is driven
// through the SDK's REAL push channels (an emitting stub transport), not mocks of
// the hooks — the component reads what the host would have said.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

// `useHeadings` scans the DOM (no .grove-prose in this harness ⇒ no headings — fine).
// `fs` is read only through safeSources on the stuffing path, never in these cases.
vi.mock('fs', () => ({ default: { promises: { readFile: vi.fn(async () => '') } } }));

// runAgent is controllable for the stop-abort case (R3-608); everything else in
// the barrel stays real — the existing cases never invoke it.
const runAgentMock = vi.fn();
vi.mock('@immediately-run/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immediately-run/sdk')>()),
  runAgent: (opts: unknown) => runAgentMock(opts),
}));

// The transport stub, the renderer and the push driver live in
// `src/test/groveAgentHarness.tsx` — shared rather than copied, because
// `GroveAgent.unanswered.test.tsx` needs the same harness in a module registry where the
// catalog has never been answered (grove#75 round 3).
const { renderAgent, openPanel, push, protocolRequest } = await import('../../test/groveAgentHarness');

// NOTE: no per-test handler reset. The SDK's push channels are module-global and
// subscribe to the transport exactly once (the `started` flag in `createPushChannel`),
// so clearing the handler set would sever every later emit from the channels. Each
// test drives the FULL desired host state through its own pushes instead.

describe('G-GA-1 — no unbacked capability claims in the DOM', () => {
  it('writable=false + no provider: no write-flavored chip, no phantom-write copy', async () => {
    const { container } = await renderAgent({ writable: false });
    // The host generation this models matters, because the two pushes below only make
    // sense together on ONE of them. R-LLM-2 says a frame lacking `llm:chat` is answered
    // `{ provider: null }` — the SAME payload as a granted frame with no key — so on a
    // host that predates R3-688's `ungranted` mark this pair (null provider, empty
    // catalog) is exactly what an ungranted fork sees, and it is indistinguishable at the
    // provider channel from keyless-but-granted. That indistinguishability IS R3-688.
    // A 0.72.0 host would instead mark the answer, which the R3-688 case below covers.
    await push({ type: 'llm-provider', provider: null }); // pre-mark host: null either way
    await push({ type: 'api-catalog', methods: [] }); // nothing granted — the deciding fact
    await openPanel(container);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/add an entry|fix broken links|reorganize the sidebar|add a timeline/i);
    expect(text).not.toMatch(/proposes the edit|host confirms the write/i);
    expect(container.querySelectorAll('.ga-chip').length).toBe(0); // no ✓ rows ⇒ no chips
    // And the honest causes ARE there. R3-688 CHANGED which one this case gets, and the
    // change is the point of the item. On a pre-mark host the provider channel cannot
    // tell keyless from ungranted, so the CATALOG is the only fact that discriminates —
    // and it says not granted. The old order asked not-configured first and therefore
    // told a user who may well have a key to go add one, which cannot unblock them.
    // The key cause is still rendered for a frame the catalog says IS granted
    // (`reachCard.test.ts` — "not-configured names the KEY cause").
    expect(text).toContain("wasn't granted chat");
    expect(text).not.toContain('no model key connected');
    expect(text).toContain('you’re a reader here');
  });
});

describe('G-GA-2 / R-GA-5 — read-only never blocks Q&A', () => {
  it('writable=false + configured granted provider ⇒ input enabled, reach card says so', async () => {
    const { container } = await renderAgent({ writable: false });
    await push({
      type: 'llm-provider',
      provider: {
        providerId: 'llm.chat.anthropic',
        hostVouched: true,
        features: { vision: false, tools: true, jsonMode: true, reasoning: false, maxContextTokens: 100000 },
      },
    });
    await push({ type: 'api-catalog', methods: [{ name: 'llm:chat', capability: 'llm:chat', stream: true }] });
    await openPanel(container);
    const input = container.querySelector('.ga-foot input') as HTMLInputElement;
    expect(input.disabled).toBe(false);
    const text = container.textContent ?? '';
    expect(text).toContain('Answer questions about this wiki');
    expect(text).toContain('you’re a reader here'); // draft row still honest
    expect(container.textContent).not.toMatch(/Suggest an edit/i); // no write chip while read-only
  });

  it('keyless but GRANTED renders the KEY cause — the case the catalog decides the other way', async () => {
    // The counterpart the suite lost when the G-GA-1 case above changed verdict, and the
    // one that proves the reorder did not simply make the grant cause win everywhere.
    // Same provider payload as that case — `{ provider: null }`, which R-LLM-2 gives both
    // a keyless frame and (on a pre-mark host) an ungranted one — but the catalog says
    // `llm:chat` IS granted. So the only actionable fact is the missing key, and that is
    // what the card must say.
    const { container } = await renderAgent({ writable: true });
    await push({ type: 'llm-provider', provider: null });
    await push({ type: 'api-catalog', methods: [{ name: 'llm:chat', capability: 'llm:chat', stream: true }] });
    await openPanel(container);
    const text = container.textContent ?? '';
    expect(text).toContain('no model key connected — add one in Settings');
    expect(text).not.toContain("wasn't granted chat");
  });

  it('an ungranted fork renders the DISTINCT forbidden cause, never connect-a-key copy', async () => {
    const { container } = await renderAgent({ writable: true });
    await push({
      type: 'llm-provider',
      provider: {
        providerId: 'llm.chat.anthropic',
        hostVouched: true,
        features: { vision: false, tools: true, jsonMode: true, reasoning: false, maxContextTokens: 100000 },
      },
    });
    await push({ type: 'api-catalog', methods: [] }); // a key exists; this copy wasn't granted chat
    await openPanel(container);
    const text = container.textContent ?? '';
    expect(text).toContain("this Grove wasn't granted chat — reading works as normal");
    expect(text).not.toContain('add one in Settings');
    const input = container.querySelector('.ga-foot input') as HTMLInputElement;
    expect(input.disabled).toBe(true); // cannot ask — but reading works, and the card says why
  });

  it('R3-688 — the host-marked grantless answer renders the consent cause without any provider', async () => {
    // The ungranted fork is answered {provider:null, ungranted:true} — never the
    // provider — so before the mark this fork could only render the KEY copy. The
    // mark is the host's grant decision; the card repeats it, never invents it.
    const { container } = await renderAgent({ writable: true });
    await push({ type: 'llm-provider', provider: null, ungranted: true });
    await push({ type: 'api-catalog', methods: [] });
    await openPanel(container);
    const text = container.textContent ?? '';
    expect(text).toContain("this Grove wasn't granted chat — reading works as normal");
    expect(text).not.toContain('add one in Settings'); // the KEY copy — never conflated (G-GA-10)
  });

  it('R-GA-6 — the egress disclosure shows whenever a provider is bound', async () => {
    const { container } = await renderAgent({ writable: false });
    await push({
      type: 'llm-provider',
      provider: {
        providerId: 'llm.chat.anthropic',
        hostVouched: true,
        features: { vision: false, tools: true, jsonMode: true, reasoning: false, maxContextTokens: 100000 },
      },
    });
    await push({ type: 'api-catalog', methods: [{ name: 'llm:chat', capability: 'llm:chat', stream: true }] });
    await openPanel(container);
    expect(container.textContent).toContain('answers come from your connected model provider');
  });

  // R3-752 — the apply row is a DESTINATION: `→` on the row, no ✗ anywhere on the
  // card, and every row's state is text as well as glyph.
  it('R3-752 — read-only + configured granted provider: the apply row renders → elsewhere, never ✗, with hidden state words', async () => {
    const { container } = await renderAgent({ writable: false });
    await push({
      type: 'llm-provider',
      provider: {
        providerId: 'llm.chat.anthropic',
        hostVouched: true,
        features: { vision: false, tools: true, jsonMode: true, reasoning: false, maxContextTokens: 100000 },
      },
    });
    await push({ type: 'api-catalog', methods: [{ name: 'llm:chat', capability: 'llm:chat', stream: true }] });
    await openPanel(container);
    const card = container.querySelector('.ga-reach')!;
    const applyRow = card.querySelector('.ga-reach__row--elsewhere')!;
    expect(applyRow.textContent).toContain('Apply changes');
    expect(applyRow.textContent).toContain('→ in the editor or workbench, where you confirm them');
    // A destination is never rendered as a denial: the card's only ✗ is the draft
    // row's (read-only), the apply row's mark is the arrow.
    expect(applyRow.querySelector('.ga-reach__mark')!.textContent).toBe('→');
    expect(card.textContent).not.toContain('changes open in the editor'); // the old cause copy is gone
    // State is text, never glyph alone: the hidden words are in the tree.
    const words = [...card.querySelectorAll('.ga-reach__stateword')].map((n) => n.textContent);
    expect(words).toContain('available');
    expect(words).toContain('unavailable');
    expect(words).toContain('opens elsewhere');
    // The substrate is context, stated, with the git-indeterminate trust line under
    // the card (the SDK's fail-closed default basis).
    expect(card.textContent).toContain('Reads its own entries');
    expect(card.parentElement!.textContent).toContain('anyone who can push to this repo can change what the agent reads');
  });

  it('R3-752 — a grant flip is ANNOUNCED, not only re-rendered (R-IX-7): the standing live region tracks the card', async () => {
    const { container } = await renderAgent({ writable: false });
    await push({
      type: 'llm-provider',
      provider: {
        providerId: 'llm.chat.anthropic',
        hostVouched: true,
        features: { vision: false, tools: true, jsonMode: true, reasoning: false, maxContextTokens: 100000 },
      },
    });
    await push({ type: 'api-catalog', methods: [] }); // key, but NOT granted chat
    await openPanel(container);
    const live = container.querySelector('[role="status"].ga-reach__stateword')!;
    expect(live.getAttribute('aria-live') ?? 'polite').toBe('polite'); // role=status is polite by default
    expect(live.textContent).toContain('unavailable'); // the blocked Q&A row, in words

    // Grant chat: the flip must change the announcement — the Q&A segment goes
    // unavailable → available (the draft row stays honestly unavailable; read-only).
    await push({ type: 'api-catalog', methods: [{ name: 'llm:chat', capability: 'llm:chat', stream: true }] });
    expect(live.textContent).toContain('Answer questions about this wiki — available');
    expect(live.textContent).not.toContain('Answer questions about this wiki — unavailable');
  });

  it('R3-752 — a configured provider WITHOUT tools keeps Q&A ✓ and shows the degrade qualifier, not silence', async () => {
    const { container } = await renderAgent({ writable: false });
    await push({
      type: 'llm-provider',
      provider: {
        providerId: 'llm.chat.anthropic',
        hostVouched: true,
        features: { vision: false, tools: false, jsonMode: true, reasoning: false, maxContextTokens: 100000 },
      },
    });
    await push({ type: 'api-catalog', methods: [{ name: 'llm:chat', capability: 'llm:chat', stream: true }] });
    await openPanel(container);
    const answerRow = container.querySelector('.ga-reach__row--ok')!;
    expect(answerRow.textContent).toContain('Answer questions about this wiki');
    expect(answerRow.textContent).toContain('reads a summary of this wiki, not entries on demand');
  });
});

describe('R3-608 — the composer stops the run; a refusal surfaces, a cancel does not', () => {
  beforeAll(() => {
    // jsdom lacks Element.scrollTo; the auto-scroll effect only needs to be a no-op.
    HTMLElement.prototype.scrollTo = () => undefined as unknown as void;
  });
  const configured = {
    type: 'llm-provider',
    provider: {
      providerId: 'llm.chat.anthropic',
      hostVouched: true,
      features: { vision: false, tools: true, jsonMode: true, reasoning: false, maxContextTokens: 100000 },
    },
  } as const;
  const granted = {
    type: 'api-catalog',
    methods: [{ name: 'llm:chat', capability: 'llm:chat', stream: true }],
  } as const;

  it('stop aborts the in-flight run — signal aborted, streaming cleared, a Stopped row, no error', async () => {
    // The REAL loop contract on abort: the promise RESOLVES with the partial
    // transcript (a clean stop, never a thrown error) — the mock mirrors it.
    runAgentMock.mockImplementationOnce(
      (opts: { signal?: AbortSignal }) =>
        new Promise((resolve) => {
          opts.signal?.addEventListener('abort', () =>
            resolve([
              { role: 'user', content: 'what is here?' },
              { role: 'assistant', content: 'partial answer' },
            ]),
          );
        }),
    );
    const { container } = await renderAgent({ writable: false });
    await push(configured);
    await push(granted);
    await openPanel(container);
    const input = container.querySelector('.ga-foot input') as HTMLInputElement;
    await act(async () => {
      // The native value setter: React's tracker ignores a bare .value assign.
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'what is here?');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      (container.querySelector('.ga-foot .go') as HTMLElement).click();
    });
    // Streaming: the stop control exists and the send is spent.
    const stop = container.querySelector('.ga-foot .stop') as HTMLElement;
    expect(stop).toBeTruthy();
    let signal: AbortSignal | undefined;
    runAgentMock.mock.calls.forEach((c) => {
      signal = (c[0] as { signal?: AbortSignal }).signal;
    });
    expect(signal).toBeTruthy();
    await act(async () => {
      stop.click();
    });
    expect(signal!.aborted).toBe(true);
    expect(container.textContent).toContain('Stopped');
    expect(container.textContent).not.toContain('the model or backend errored');
    expect(container.querySelector('.ga-foot .stop')).toBeNull();
  });

  it('a REFUSING edit renders the failure text; a cancelled one renders nothing', async () => {
    // The real hook, through the real requestEdit → the controllable transport.
    const { useEditAffordance } = await import('../hooks/useEditAffordance');
    const refusedStates: boolean[] = [];
    function Probe() {
      const aff = useEditAffordance(false);
      refusedStates.push(aff.refused);
      return (
        <div>
          <button onClick={() => aff.openEditor('/app/content/wiki/security.mdx')}>edit</button>
          <div data-testid="refused">{aff.refused ? 'REFUSED' : ''}</div>
        </div>
      );
    }
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<Probe />);
    });

    // A refusal (anything not `cancelled`): the host said no — it must surface.
    protocolRequest.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'forbidden' }));
    await act(async () => {
      (host.querySelector('button') as HTMLElement).click();
    });
    expect(host.querySelector('[data-testid="refused"]')?.textContent).toBe('REFUSED');

    // A cancellation: the reader closed the editor — silent by contract.
    await act(async () => {
      root.render(<div />);
      root.render(<Probe />);
    });
    refusedStates.length = 0;
    protocolRequest.mockRejectedValueOnce(Object.assign(new Error('closed'), { code: 'cancelled' }));
    await act(async () => {
      (host.querySelector('button') as HTMLElement).click();
    });
    expect(host.querySelector('[data-testid="refused"]')?.textContent).toBe('');
    await act(async () => {
      root.unmount();
    });
  });

  it('the agent panel renders the refusal text where the affordance is offered', async () => {
    const { root, container: host } = await renderAgent(
      { writable: false },
      { shell: { editRefused: true } as Partial<import('../lib/shell').GroveShell> },
    );
    await openPanel(host);
    expect(host.textContent).toContain('Could not open the editor — the host refused');
    await act(async () => {
      root.unmount();
    });
  });
});

describe('R3-608 round 2 — the panel returns focus to its (unmounted) trigger', () => {
  it('Escape-close lands focus back on the resting input, not <body>', async () => {
    const { container } = await renderAgent({ writable: false });
    await push({ type: 'llm-provider', provider: null });
    await push({ type: 'api-catalog', methods: [] });
    // Open through the resting input (the real trigger path).
    const resting = container.querySelector('.ga-line input') as HTMLInputElement;
    await act(async () => {
      resting.focus();
    });
    expect(container.querySelector('.ga-panel')).toBeTruthy();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(container.querySelector('.ga-panel')).toBeNull();
    // The focus return rides a requestAnimationFrame — flush the frame.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 16));
    });
    // The resting line remounted and its SUBMIT control took focus — a real
    // stop that cannot reopen the panel, never <body>.
    const remounted = container.querySelector('.ga-line .go') as HTMLButtonElement;
    expect(remounted).toBeTruthy();
    expect(document.activeElement).toBe(remounted);
    expect(container.querySelector('.ga-panel')).toBeNull(); // focus did not reopen
  });
});

// ── R3-790 — the ungranted chat row's earning affordance ──────────────────────

describe("R3-790 — the ✗ chat row offers its earning affordance (click invokes; the host gesture mints)", () => {
  beforeAll(() => {
    HTMLElement.prototype.scrollTo = () => undefined as unknown as void;
  });

  it('renders Enable chat on the ungranted row — the host-marked forbidden cause', async () => {
    const { container } = await renderAgent({ writable: false });
    // The cold mark — no prior configured push: the host strips the provider from
    // every answer to an ungranted frame (the R3-688 test's shape).
    await push({ type: 'llm-provider', provider: null, ungranted: true });
    await push({ type: 'api-catalog', methods: [] }); // answered: nothing granted
    await openPanel(container);
    const enable = container.querySelector('.ga-reach__enable');
    expect(enable).toBeTruthy(); // the affordance exists on the ✗ row
    expect((enable as HTMLElement).textContent).toBe('Enable chat');
    // …and the row itself still tells the honest cause.
    expect(container.querySelector('.ga-reach__row--blocked')?.textContent).toContain(
      "this Grove wasn't granted chat",
    );
  });

  it('renders NO affordance when the provider is not configured (that row points at Settings)', async () => {
    const { container } = await renderAgent({ writable: false });
    await push({ type: 'llm-provider', provider: null }); // not-configured, not ungranted
    await push({ type: 'api-catalog', methods: [] });
    await openPanel(container);
    expect(container.querySelector('.ga-reach__enable')).toBeNull();
  });

  it("a click invokes; a DECLINED dialog ('cancelled') keeps the honest row and says so", async () => {
    runAgentMock.mockClear();
    runAgentMock.mockImplementationOnce(() => {
      const e = new Error('declined') as Error & { code?: string };
      e.code = 'cancelled';
      throw e;
    });
    const { container } = await renderAgent({ writable: false });
    // The cold mark — no prior configured push: the host strips the provider from
    // every answer to an ungranted frame (the R3-688 test's shape).
    await push({ type: 'llm-provider', provider: null, ungranted: true });
    await push({ type: 'api-catalog', methods: [] });
    await openPanel(container);
    await act(async () => {
      (container.querySelector('.ga-reach__enable') as HTMLButtonElement).click();
    });
    // The invoke RAN (runAgent was called once — the gesture's trigger)…
    expect(runAgentMock).toHaveBeenCalledTimes(1);
    // …the decline surfaced honestly…
    await act(async () => {
      await new Promise((r) => setTimeout(r, 16));
    });
    expect(container.querySelector('.ga-toast')?.textContent).toContain("chat didn't start — reading works as normal; you can try again anytime");
    // …and the row still reads the forbidden cause with the affordance for the next click.
    expect(container.querySelector('.ga-reach__row--blocked')?.textContent).toContain(
      "this Grove wasn't granted chat",
    );
    expect(container.querySelector('.ga-reach__enable')).toBeTruthy();
  });

  it('a click invokes; a still-FORBIDDEN answer surfaces the refusal toast (pre-gesture hosts)', async () => {
    runAgentMock.mockImplementationOnce(() => {
      const e = new Error('forbidden') as Error & { code?: string };
      e.code = 'forbidden';
      throw e;
    });
    const { container } = await renderAgent({ writable: false });
    // The cold mark — no prior configured push: the host strips the provider from
    // every answer to an ungranted frame (the R3-688 test's shape).
    await push({ type: 'llm-provider', provider: null, ungranted: true });
    await push({ type: 'api-catalog', methods: [] });
    await openPanel(container);
    await act(async () => {
      (container.querySelector('.ga-reach__enable') as HTMLButtonElement).click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 16));
    });
    expect(container.querySelector('.ga-toast')?.textContent).toContain("this Grove wasn't granted chat");
  });
});

// ── R3-790 round 1 — the GRANTED leg: the click's invoke proceeds when the grant lands ──

describe("R3-790 — the granted leg (click → invoke → the grant lands → the ask proceeds, the row flips)", () => {
  beforeAll(() => {
    HTMLElement.prototype.scrollTo = () => undefined as unknown as void;
  });
  const configured = {
    type: 'llm-provider',
    provider: {
      providerId: 'llm.chat.anthropic',
      hostVouched: true,
      features: { vision: false, tools: true, jsonMode: true, reasoning: false, maxContextTokens: 100000 },
    },
  } as const;
  const grantedCatalog = {
    type: 'api-catalog',
    methods: [{ name: 'llm:chat', capability: 'llm:chat', stream: true }],
  } as const;

  it("the affordance's click drives the invoke; the granted catalog flips the row ✓ and the input enables", async () => {
    runAgentMock.mockClear();
    runAgentMock.mockImplementationOnce(async () => [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Answer in one sentence: what can you tell me about this wiki?' }],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'This wiki is a small corpus about enabling chat.' }],
      },
    ]);
    const { container } = await renderAgent({ writable: false });
    await push({ type: 'llm-provider', provider: null, ungranted: true });
    await push({ type: 'api-catalog', methods: [] });
    await openPanel(container);
    // Before: the honest ✗ row + the affordance.
    expect(container.querySelector('.ga-reach__row--blocked')?.textContent).toContain(
      "this Grove wasn't granted chat",
    );
    await act(async () => {
      (container.querySelector('.ga-reach__enable') as HTMLButtonElement).click();
    });
    // The invoke RAN (the gesture's trigger).
    expect(runAgentMock).toHaveBeenCalledTimes(1);
    // The grant lands (the host's mint + lift answers the channels): push the
    // granted catalog + the configured provider — the envelope recomputes.
    await push(grantedCatalog);
    await push(configured);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 16));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 16));
    });
    // The ask PROCEEDED: the assistant answer is in the body…
    expect(container.querySelector('.ga-body')?.textContent).toContain('enabling chat');
    // …the ANSWER row flipped ✓ (the read-only draft row stays honestly ✗ — that is
    // its own row, not this one)…
    const answerRow = [...container.querySelectorAll('.ga-reach__row')].find((r) =>
      r.textContent?.includes('Answer questions about this wiki'),
    );
    expect(answerRow?.className).not.toContain('blocked');
    expect(container.querySelector('.ga-reach__enable')).toBeNull();
    // …and the composer input is ENABLED (canAsk true).
    const input = container.querySelector('.ga-foot input') as HTMLInputElement;
    expect(input?.disabled).toBe(false);
  });
});
