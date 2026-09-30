# Design handoff — Grove, an MDX wiki engine

**Read this first.** It's the self-contained on-ramp for designing the visual assets
needed to build **Grove**. With this doc plus the briefs in [`briefs/`](./briefs/), you
have everything you need to produce the layouts, components, states, and brand assets.

**For:** Claude Design (or any designer, human or agent) generating Grove's UI.
**Source of truth:**
- `docs/product-defs/grove.md` — **the product** (what Grove is, every feature named
  below traces to a section there). Read it before the briefs.
- `src/index.css` — **the tokens** (the contract; pull every colour, font, radius,
  shadow from here — don't eyeball).
- `CLAUDE.md` "Design system" — voice + visual foundations for the immediately.run
  brand Grove lives inside.

## What you're designing, in one paragraph

Grove is a **wiki / knowledge-garden engine** that runs as one immediately.run app: every
entry is a single MDX file, entries interlink with `[[wiki-links]]`, and the whole site
renders in the browser. You are designing **the reading experience, the run-mode chrome,
and Grove's own embedded agent conversation** — the entry page, the navigation, the
index/collection surfaces, the built-in components, the extensibility views, **the embedded
Grove agent conversation (Grove's *primary* authoring surface)**, every
empty/loading/error state, a small Grove brand mark, and **the default theme plus two or
three alternate themes** that prove Grove can be re-skinned by editing CSS alone. You are
**not** designing a code *editor* or any sign-in — those stay **host** surfaces Grove
delegates to. You **are** designing Grove's **embedded agent conversation**: the app's own
capability-scoped agent (each `CLAUDE.md` security model §8), which is *distinct from, and
never a spoof of,* the host's agent pane (see *Hard constraints*).

## Grove is an app *in* the immediately.run design system — not a new brand

Inherit the brand wholesale: cool near-black canvas, the magenta↔violet signature
gradient, Gabarito display / Public Sans body / Space Mono details, hairline borders, the
hard-offset hover shadow, sentence case, headlines that end on a period, no emoji. Pull
all of it from `src/index.css` and `CLAUDE.md` "Design system". The **default Grove
theme** *is* the immediately.run brand applied to a wiki. (Brief `00-foundation` lists the
few Grove-specific motifs layered on top.)

## Audience rule (every surface, in priority order)

The platform's audience priority (`product_values` §2/§5/§8), specialised for Grove:
1. **Readers** — mobile-first; the reading surface is the product. Typography, link
   integrity, fast first paint. Most visits never edit.
2. **Authors, including non-technical ones** — they mostly *ask the agent*; the manual
   editing affordance is a fallback. Design clean, discoverable affordances, not an
   author console.
3. **Coding agents** — semantic landmarks, stable structure, clean headings; agents read
   the same DOM screen readers do.

A desktop-human-only design is wrong here.

## The two themes problem (a core deliverable, not a flourish)

Grove's product promise is **CSS-only theming** (`grove.md` "Theming & layout"). That has
a concrete design consequence: every surface must be built from **stable, semantic class
names + design tokens**, never bespoke one-off styling, so a fork can re-skin by editing
CSS. To prove it, you deliver:
- **The default theme** — on the immediately.run brand.
- **Two–three alternate themes** keyed to the real use cases (`grove.md` "Representative
  use cases"): e.g. a saturated **Pixies** music theme, a soft **family-journal** theme, a
  parchment-ish **Lord of the Rings** theme — *same components and DOM, different CSS.*
Show the same entry rendered under each, side by side, to make the claim visible.

## The asset / screen inventory (what the briefs cover)

| Brief | Surface | Why it matters |
|---|---|---|
| `00-foundation` | Grove-specific motifs, the class-name/token contract, the app mark | the shared base every other brief assumes |
| `01-reading-view` | the entry page: MDX prose, entry header, backlinks, ToC, wiki-link styling, layout variants | the hero surface — readers live here |
| `02-shell-navigation-and-authoring` | top nav, sidebar (tag-driven + namespace tree), footer, search, theme toggle, mobile chrome, the **edit / new-entry / ask-the-agent affordances** | how you move through a Grove and hand off to the host |
| `03-indexes-and-component-library` | home/index, `<DocList>` feeds, tag pages, tag cloud, recently-updated, and each built-in component's appearance + an author `<Infobox>` | discovery + the component vocabulary |
| `04-extensibility-views` | the agent-built views: animated **timeline**, **family tree**, **directory/table** | proves the extension surface is designable |
| `05-states-and-theming` | loading skeletons, empty, error/404/broken-link, read-only viewer; the default + alternate **theme showcase**; the Grove app icon | the unglamorous surfaces + the themeability proof |
| `06-agent-conversation` | Grove's **embedded coding-agent conversation** — an **integral, always-present** surface with a minimal non-obscuring resting affordance (Safari-URL-bar style; **iterate** the form), proposed-change previews, all states, mobile, the workbench hand-off | Grove's **primary authoring surface**, baked in front and center |
| `08-story-river` | the **story river**: a TiddlyWiki-style reading mode, built as a separate app on Grove, where links open entries as cards in one column — the river page, the card and its states, open / focus / close motion, the focus-following rail, mobile | the pressure test of customizable navigation (`APP_CUSTOMIZATION_SPEC` §6 in the docs repo) |

## Grove's foundation is the agent contract — and it's mostly invisible to you

Grove's single most important property is **agent legibility**: every instance carries a
self-describing **contract** (`grove.md` "The agent contract") so a future coding-agent
session re-derives how *this* wiki works. That contract is **agent-facing infrastructure,
not a surface you style** — `GROVE.md` and the generated `.grove/manifest.json` are read by
agents, and validation/drift **diagnostics surface through the host edit experience**,
which Grove must not imitate (see constraint 1). So it changes little about what you draw —
but you should know it's the product's centre of gravity, and it has these visual
touchpoints to get right:

1. **Make conventions legible *in the content itself*** — this is why wiki-link states
   (resolved / broken / ambiguous), tag chips, and the namespace tree must read clearly
   (briefs 00–02). The structure a reader sees is the same structure an agent reads.
2. **The embedded Grove agent (brief 06) is the contract's working interface** — it's the
   contract-aware agent that reads and updates `GROVE.md`. Designing that conversation well
   *is* designing how most users touch the contract, even though the contract files
   themselves stay unstyled.
3. **An optional "about this wiki" / colophon entry** — a human-readable rendering of the
   instance's conventions (what tags mean, what custom components exist) is just a normal
   MDX entry rendered in the reading view; design no special chrome for it, but a tasteful
   colophon/`/about` pattern is a welcome example. Never render a fake "diagnostics panel"
   or host editor chrome.

## Hard constraints (read before drawing anything)

1. **Don't imitate host chrome — but Grove's *own* agent is allowed** (`grove.md` security
   model + "Authoring"; each `CLAUDE.md` §8). Grove must **never** render a fake code
   editor, a fake *host* agent pane, a fake consent dialog, a fake validation/diagnostics
   panel, or a sign-in. When the user edits **text**, Grove shows an **edit affordance**
   that *hands off* to the platform editor — design the affordance, not the editor; contract
   validation/drift **diagnostics are a host surface** too. **The one exception is the
   agent conversation:** Grove deliberately ships its *own* embedded agent (brief 06),
   scoped to Grove's grants via the SDK catalog — so you **do** design that surface. It must
   be clearly **Grove's own** (its own placement/identity within the app), never styled to
   pass as the host's trusted agent pane, and privileged actions (writes, contribute) still
   route through the host. Spoofing host surfaces reads as hostile; building your own
   capability-scoped agent does not.
2. **Reading-first, with the agent as the deliberate always-present exception.** Run-mode
   UI stays free of *editor* chrome; the edit affordance is unobtrusive and writable-only;
   the **read-only viewer** has no edit affordance at all. But the **agent communication is
   baked in, front and center** — always present and one gesture away (brief 06). Reconcile
   the two the way the iOS Safari URL bar does: a **minimal persistent affordance** (thin
   bottom input line / pull tab / icon) that **never obscures content on mobile** and
   expands only on demand. Front-and-center, not in-the-way.
3. **Tokens are the contract.** Colours/fonts/radii/shadows come from
   `src/index.css`. No hard-coded hexes in mockups you'd want a dev to copy.
4. **No emoji, ever.** Icons are **Lucide** (16–24px, `currentColor`, ~1.75 stroke) plus
   the unicode micro-set (`★ → ● ☀ ☾`). Mono micro-labels are the one UPPERCASE-tracked
   exception.
5. **Every dynamic surface needs four states:** loading (**skeleton**, not spinner;
   ~150ms budget), content, **empty** (designed, never broken), **error/404** (incl. a
   broken/ambiguous `[[wiki-link]]` target).
6. **Accessibility AA on both themes**, full keyboard operability, visible focus rings
   (the glow ring), semantic landmarks/headings, never state-by-gradient-alone.

## Deliverable per brief

Layouts at **mobile + desktop**, all four states, interaction/transition notes (restrained
`~.14s`, no bounce/spring; respect `prefers-reduced-motion`), **drafted on-brand copy** for
the key strings (sentence case, period-terminated headlines, mono `/slug` and `#tag`
labels), a **component inventory mapped to the tokens and to the `.grove-*` class names**
in brief `00`, and — where relevant — the **routes** affordances point at (`#/slug` hash
routes within the app; the host hand-off for editing). Call out any forkability/theming
note specific to that surface.
