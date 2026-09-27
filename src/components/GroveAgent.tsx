import { useEffect, useMemo, useRef, useState } from 'react';
import {
  runAgent,
  createChatModelClient,
  useChatProviderState,
  useCatalog,
  useAllMetadata,
  useAgentContext,
  renderAgentContext,
  type AgentMessage,
} from '@immediately-run/sdk';
import { useShell, EDIT_REFUSED_NOTICE } from '../lib/shell';
import { useHeadings, useActiveHeading } from '../hooks/useHeadings';
import { useOverlayFocusDismiss } from '../hooks/useOverlayFocusDismiss';
import { getContentRoot } from '../lib/contentRoot';
import { createReadEntryTool, createGroveMetadataTool, groveAgentTools, toolExecutor } from '../lib/agentTools';
import { buildSystemPrompt } from '../lib/agentPrompt';
import { computeReachRows, reachChips, sourceTrustLine, stateWord, showEgressDisclosure, EGRESS_DISCLOSURE } from '../lib/reachCard';
import { getCorpusMountId } from '../lib/contentRoot';
import { transcriptToRows, toolActivityLine, type AgentRow } from '../lib/agentTranscript';
import { useCatalogAnswered } from '../hooks/useCatalogAnswered';
import { safeSources } from '../lib/safeSources';
import Icon from './Icon';

// `.grove-agent` — Grove's own embedded agent (GROVE_AGENT_SPEC).
//
// The surface is a FUNCTION of the session's envelope (R-GA-1): the reach card in
// the expanded header is computed from the provider four-state (R3-688 added the
// host-marked `ungranted` — the distinct not-granted cause), the `llm:chat`
// grant (the grant-filtered catalog), mount writability, the corpus packaging,
// tools support, and source trust — never hand-written copy. The loop rides the
// workbench's seam — SDK `runAgent` over the host `llm.chat` slot — and its two
// tools are the mount-chrooted `read_entry` and
// the index query (R-GA-2). The widget never writes (R-GA-3): every change is a
// hand-off to the editor / workbench. Read-only never blocks Q&A (R-GA-5). When a
// provider is bound the egress line is shown unconditionally (R-GA-6). Every
// corpus-derived byte entering the loop is fenced (R-GA-7).
export default function GroveAgent({
  writable,
  entryKey,
  entryTitle,
}: {
  writable: boolean;
  entryKey: string;
  entryTitle: string;
}) {
  const providerState = useChatProviderState();
  const catalog = useCatalog();
  const index = useAllMetadata();
  const headings = useHeadings(entryKey);
  const activeHeading = useActiveHeading(headings);
  const { openEditor, editRefused } = useShell();
  const [open, setOpen] = useState(false);
  const [detent, setDetent] = useState<'half' | 'full'>('half');
  const [resting, setResting] = useState('');
  const [draft, setDraft] = useState('');
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLInputElement>(null);
  // One AbortController per run (R3-608): the composer's stop control aborts the
  // in-flight run through the SDK signal the loop already honours.
  const abortRef = useRef<AbortController | null>(null);
  // The panel carries the dialog contract (R3-608): focus in, Tab trapped,
  // Escape, focus return — the shared hook, stack-aware.
  const dialogRef = useOverlayFocusDismiss(open, () => setOpen(false));

  // The envelope, computed (R-GA-1). `llm:chat` appears in the grant-filtered
  // catalog iff this app holds the consent — an ungranted fork reads a DISTINCT
  // cause from a user without a key (G-GA-10).
  const chatGranted = catalog.some((m) => m.name === 'llm:chat');
  // Distinguishes "granted nothing" from "has not replied yet" — `catalog` alone cannot,
  // because an empty catalog is a legitimate answer. See the hook for how it is derived.
  const catalogAnswered = useCatalogAnswered();
  const context = useAgentContext({ entryPath: entryKey, entryTitle, heading: activeHeading || undefined });
  // G-GA-8: a provider without `features.tools` degrades to context-stuffing.
  // Computed ONCE at render scope — the reach card's Q&A qualifier (R3-752) and the
  // ask() path below read the same fact, never two computations of it.
  const toolsSupported = providerState.status === 'configured' && providerState.provider.features.tools === true;
  const reachRows = useMemo(
    () =>
      computeReachRows({
        providerState,
        chatGranted,
        catalogAnswered,
        writable,
        sourceShared: context.sourceShared,
        mountId: getCorpusMountId(),
        toolsSupported,
      }),
    [providerState, chatGranted, catalogAnswered, writable, context.sourceShared, toolsSupported],
  );
  const chips = useMemo(() => reachChips(reachRows), [reachRows]);
  const trustLine = useMemo(
    () => sourceTrustLine(context.sourceShared, context.sourceSharedBasis),
    [context.sourceShared, context.sourceSharedBasis],
  );
  // R-IX-7 (R3-752): a state flip is ANNOUNCED, not only re-rendered — one standing
  // polite live region whose text is the card's computed summary. A grant flip
  // changes the text, which is what a status region announces; the visually hidden
  // per-row words are static text and announce nothing.
  const reachAnnouncement = useMemo(
    () => `What the agent can do here: ${reachRows.map((r) => `${r.label} — ${stateWord(r.state)}`).join('; ')}`,
    [reachRows],
  );
  const canAsk = providerState.status === 'configured' && chatGranted;

  // Read at CALL time (a scan may land, the reader may navigate) — refs kept fresh
  // in an effect, never written during render (the react-hooks compiler rejects that).
  const indexRef = useRef(index);
  const contextRef = useRef(context);
  const entryRef = useRef(entryKey);
  const headingRef = useRef(activeHeading);
  useEffect(() => {
    indexRef.current = index;
    contextRef.current = context;
    entryRef.current = entryKey;
    headingRef.current = activeHeading;
  }, [index, context, entryKey, activeHeading]);

  // The loop's transcript, kept so follow-up questions replay the tool-use chain.
  const transcriptRef = useRef<AgentMessage[]>([]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => footRef.current?.focus());
  }, [open]);
  // The panel's only trigger (the resting input) UNMOUNTS when it opens, and
  // its onFocus IS the open action — returning focus to it would reopen the
  // panel. So the close path returns focus to the resting line's SUBMIT
  // control (R-IX-1): a real stop in the same surface that never reopens
  // anything, so Escape never strands the keyboard on <body>. On mount the
  // effect stays quiet (was-open gate) or the panel would open itself.
  const restingGoRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (wasOpenRef.current && !open) requestAnimationFrame(() => restingGoRef.current?.focus());
    wasOpenRef.current = open;
  }, [open]);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [rows, streaming]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || streaming) return;
    setOpen(true);
    setDraft('');
    setResting('');
    setErrorToast(null);
    setRows((prev) => [...prev, { kind: 'user', text: q }]);
    setStreaming(true);

    // G-GA-8: a provider without `features.tools` degrades to context-stuffing —
    // the deixis block, an index summary, and the current entry body ride the
    // prompt; the request carries ZERO tools. The same hoisted fact the reach
    // card's Q&A qualifier reads (R3-752) — computed once at render scope.
    const chroot = getContentRoot();
    const currentKey = entryRef.current;
    const contextBlock = renderAgentContext({
      ...contextRef.current,
      entryPath: currentKey,
      heading: headingRef.current || undefined,
    });
    let stuffedBody: string | undefined;
    if (!toolsSupported) {
      stuffedBody = await safeSources.read(currentKey).catch(() => undefined);
    }
    const system = buildSystemPrompt({
      contextBlock,
      toolsSupported,
      ...(toolsSupported ? {} : { entryBody: stuffedBody, entryPath: currentKey, index: indexRef.current, chroot }),
    });
    const entryTool = createReadEntryTool(chroot);
    const metaTool = createGroveMetadataTool(chroot, () => indexRef.current);
    const execute = toolExecutor([entryTool, metaTool]);
    const tools = toolsSupported ? groveAgentTools(chroot, () => indexRef.current) : [];

    let acc = '';
    const pushAssistant = (text: string) =>
      setRows((prev) => {
        const next = prev.slice();
        if (next.length && next[next.length - 1].kind === 'assistant') next[next.length - 1] = { kind: 'assistant', text };
        else next.push({ kind: 'assistant', text });
        return next;
      });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const final = await runAgent({
        client: createChatModelClient(),
        tools,
        execute,
        system,
        prompt: q,
        history: transcriptRef.current,
        maxTurns: 8,
        signal: controller.signal,
        events: {
          onAssistantDelta: (t) => {
            acc += t;
            pushAssistant(acc);
          },
          onToolUse: (name, input) => {
            acc = '';
            setRows((prev) => {
              const next = prev.slice();
              if (next.length && next[next.length - 1].kind === 'assistant' && !next[next.length - 1].text) next.pop();
              next.push({ kind: 'activity', text: toolActivityLine(name, input) });
              return next;
            });
          },
        },
      });
      const rendered = transcriptToRows(final);
      // The real loop RESOLVES an aborted run with the partial transcript (a
      // clean stop, never a thrown error) — so the abort check lives here too,
      // not only in the catch: a stopped run keeps what streamed and appends a
      // named Stopped row (R3-608).
      if (controller.signal.aborted) {
        setRows((prev) => [...prev, { kind: 'activity', text: 'Stopped' }]);
        return;
      }
      if (!rendered.some((r) => r.kind === 'assistant')) throw new Error('empty');
      transcriptRef.current = final.slice();
      setRows(rendered);
    } catch (e) {
      // A stop is not an error (R3-608): the aborted run settles with a named
      // "Stopped" row, and the transcript keeps what streamed so far.
      if (controller.signal.aborted) {
        setRows((prev) => [...prev, { kind: 'activity', text: 'Stopped' }]);
        return;
      }
      const code = (e as { code?: string })?.code || (e as Error).message;
      setErrorToast(
        code === 'auth-required'
          ? 'no model key connected — add one in Settings'
          : code === 'forbidden'
            ? "this Grove wasn't granted chat — reading works as normal"
            : code === 'cancelled'
              ? "chat wasn't enabled — reading works as normal; you can try again anytime"
              : 'the model or backend errored — try again in a moment',
      );
      setRows((prev) =>
        prev.length && prev[prev.length - 1].kind === 'assistant' && !prev[prev.length - 1].text ? prev.slice(0, -1) : prev,
      );
    } finally {
      setStreaming(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  return (
    <div className="grove-agent">
      {/* Resting: the always-present thin input line. Q&A is never disabled by
          read-only (R-GA-5) — only by the envelope genuinely lacking a provider. */}
      {!open && (
        <form
          className="ga-line"
          onSubmit={(e) => {
            e.preventDefault();
            if (canAsk) void ask(resting);
            else setOpen(true);
          }}
        >
          <span className="mk" />
          <input
            value={resting}
            placeholder={`Ask Grove about “${entryTitle}”…`}
            onChange={(e) => setResting(e.target.value)}
            onFocus={() => setOpen(true)}
            aria-label="Ask Grove"
          />
          <button ref={restingGoRef} className="go" type="submit" aria-label="Ask Grove">
            <Icon name="send" />
          </button>
        </form>
      )}

      {/* Expanded: dock (desktop) / sheet (mobile). */}
      {open && (
        <>
          <div className="ga-scrim" onClick={() => setOpen(false)} />
          <div
            className="ga-panel"
            data-detent={detent}
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Ask Grove"
          >
            <div className="ga-panel-inner">
              <div className="ga-head">
                <span className="grip" onClick={() => setDetent((d) => (d === 'half' ? 'full' : 'half'))} />
                <span className="mk" />
                <span className="id">Grove</span>
                <span className="grow">
                  <button className="ic" aria-label={detent === 'half' ? 'Expand' : 'Collapse'} onClick={() => setDetent((d) => (d === 'half' ? 'full' : 'half'))}>
                    <Icon name={detent === 'half' ? 'chevron-down' : 'chevron-right'} />
                  </button>
                  <button className="ic" aria-label="Close" onClick={() => setOpen(false)}>
                    <Icon name="x" />
                  </button>
                </span>
              </div>

              {/* The reach card — the envelope, computed (R-GA-1). State is text as
                  well as glyph (R3-752): the hidden word beside the mark keeps the
                  card from reading as four identical lines to a screen reader. */}
              <div className="ga-reach" role="list" aria-label="What the agent can do here">
                {reachRows.map((r) => (
                  <div className={`ga-reach__row ga-reach__row--${r.state}`} role="listitem" key={r.key}>
                    <span className="ga-reach__mark" aria-hidden>
                      {r.state === 'ok' ? '✓' : r.state === 'blocked' ? '✗' : r.state === 'elsewhere' ? '→' : '·'}
                    </span>
                    <span className="ga-reach__stateword">{stateWord(r.state)}</span>
                    <span className="ga-reach__label">{r.label}</span>
                    {r.cause && <span className="ga-reach__cause">{r.cause}</span>}
                    {r.destination && <span className="ga-reach__cause">{`→ ${r.destination}`}</span>}
                    {r.action === 'enable-chat' && (
                      // R3-790: the earning affordance. Its click invokes ask() — the
                      // ungranted llm:chat invoke fires the HOST's consent dialog on this
                      // same activation (site-main#612), Allow mints + lifts, and the
                      // same ask proceeds to stream. A decline answers 'cancelled' (the
                      // catch below) and the row stays honestly ✗.
                      <button
                        type="button"
                        className="ga-reach__enable"
                        onClick={() =>
                          void ask(draft.trim() || 'Answer in one sentence: what can you tell me about this wiki?')
                        }
                      >
                        Enable chat
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {trustLine && <p className="ga-egress">{trustLine}</p>}
              {/* The standing live region (R-IX-7): the computed card summary, so a
                  state flip is announced politely and not only re-rendered. */}
              <div className="ga-reach__stateword" role="status">
                {reachAnnouncement}
              </div>
              {showEgressDisclosure(providerState) && <p className="ga-egress">{EGRESS_DISCLOSURE}</p>}
              {errorToast && (
                <div className="ga-toast" role="status">
                  {errorToast}
                </div>
              )}

              <div className="ga-body" ref={bodyRef}>
                {rows.length === 0 ? (
                  <>
                    <div className="ga-explain">
                      <b>Grove's agent</b> answers questions about this wiki — its entries, tags, and structure — from the
                      page you're on.
                    </div>
                    {chips.length > 0 && (
                      <div className="ga-chips">
                        {chips.map((c) => (
                          <button key={c} className="ga-chip" onClick={() => void ask(c)}>
                            {c}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  rows.map((r, i) =>
                    r.kind === 'activity' ? (
                      <div key={i} className="ga-activity">
                        <Icon name="file" />
                        {r.text}
                      </div>
                    ) : (
                      <div key={i} className={`ga-msg ${r.kind}`}>
                        <span className={`ga-msg__av ${r.kind === 'assistant' ? 'grove' : 'user'}`}>
                          {r.kind === 'assistant' ? '' : 'you'}
                        </span>
                        <div className="ga-msg__b">
                          <div className="ga-msg__who">{r.kind === 'assistant' ? 'Grove' : 'You'}</div>
                          <div className="ga-msg__txt">
                            {r.text}
                            {streaming && i === rows.length - 1 && r.kind === 'assistant' ? <span className="ga-cursor" /> : null}
                          </div>
                        </div>
                      </div>
                    ),
                  )
                )}
              </div>

              <div className="ga-foot">
                <form
                  className="ga-foot__row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void ask(draft);
                  }}
                >
                  <input
                    ref={footRef}
                    value={draft}
                    placeholder="Ask Grove…"
                    disabled={streaming || !canAsk}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  {streaming ? (
                    <button
                      className="stop"
                      type="button"
                      aria-label="Stop"
                      title="Stop"
                      onClick={() => abortRef.current?.abort()}
                    >
                      <Icon name="x" />
                    </button>
                  ) : null}
                  <button className="go" type="submit" disabled={streaming || !canAsk || !draft.trim()} aria-label={streaming ? 'Answering…' : 'Send'} title={streaming ? 'Answering…' : 'Send'}>
                    <Icon name="send" />
                  </button>
                </form>
                <div className="ga-foot__hand">
                  <span>{EGRESS_DISCLOSURE}</span>
                  {editRefused && (
                    <span className="ga-edit-refused" role="status">
                      {EDIT_REFUSED_NOTICE}
                    </span>
                  )}
                  <button type="button" onClick={() => openEditor(entryKey)}>
                    <Icon name="external" />
                    Open in the editor
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
