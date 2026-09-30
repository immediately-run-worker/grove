# Brief 08 — The story river (a TiddlyWiki-style reading mode)

A second way to read a Grove: instead of one entry per page, the reader keeps a **single
column of open entries — the story river** — and following a link opens the target as a
new card in that column. This is an homage to TiddlyWiki, one of immediately.run's
inspirations. It is built as a **separate app on top of Grove**, so every surface here is
Grove's existing vocabulary rearranged, not a new visual language.

**For:** Claude Design (or any designer, human or agent).
**Read with:** [`../HANDOFF.md`](../HANDOFF.md) and [`00-foundation`](./00-foundation.md)
(the brand, tokens, wiki-link states and motifs — all hold here unchanged),
[`01-reading-view`](./01-reading-view.md) (the entry you are now putting in a card),
[`02-shell-navigation-and-authoring`](./02-shell-navigation-and-authoring.md) (the chrome
around the river). **The behaviour contract** is the docs repo's
`content/specs/APP_CUSTOMIZATION_SPEC.mdx` §6. Where this brief and §6 disagree, §6 wins;
flag the disagreement rather than designing around it.

---

## How a reader gets here

A wiki's author chooses the river in one of two ways. They can make it the wiki's only way
to open, or offer it beside the normal page view as "Open as Story river". The river is a
separate app on top of Grove, and the host opens it on the wiki's files. That choice happens
outside your surfaces, but it explains two things you'll see: the river can't write to the
wiki itself (Edit asks the host), and the same wiki may also exist as ordinary Grove pages.

## What you're designing, in one paragraph

A reading surface where entries **accumulate** instead of replacing each other. The reader
starts with one card (say, *Engineering*). They click *Ada Lovelace* inside it, and an
*Ada Lovelace* card slides in directly below. They click *Engineering* again from Ada's
card: nothing new opens; the view scrolls back up to the Engineering card and briefly marks
it. They close Ada's card with its **×**. The URL always describes the river, so a shared
link or a reload reproduces it exactly. Design the river page, the card, every state a card
can be in, the motion for open / focus / close, and the chrome around the river, at
desktop and mobile widths, in dark and light.

## The six interactions (design each one as a sequence, not a still)

| # | Reader does | What must be visible |
|---|---|---|
| 1 | Clicks a link, inside a card, to an entry that is **not open** | A new card appears **directly below** the card containing the link, scrolls into view, takes focus. The reader must see where it came from. |
| 2 | Clicks a link in the **sidebar, nav or search** to an entry that is not open | A new card appears **at the top** of the river and takes focus. |
| 3 | Clicks a link to an entry that is **already open** | No new card. The view scrolls to the existing card, which gets a brief **"here it is"** highlight, then settles. The order doesn't change. |
| 4 | Closes a card | It leaves; the cards below close the gap; focus lands on the heading of the card that took its place. |
| 5 | Presses Back | The previous river comes back exactly: the last-opened card is gone again. No special UI — but the transition must not look like a crash. |
| 6 | Clicks **Edit** on a card | The control shows it is asking; the host opens the workbench editor on that entry (not yours to draw — show it as a labelled placeholder region). The river stays exactly where it was, and the edited card is marked. If the host declines, the note appears in the card header and the river is otherwise untouched. |

Interaction 3 is the one most likely to feel broken if under-designed: the reader clicked a
link and "nothing opened". The highlight has to read as a deliberate answer ("it's this
one, already open"), not a glitch.

## The card

A card is one Grove entry, reading exactly as in brief 01, inside a river-owned frame.

- **Header** (`.river-card__header`)
  - The entry title: Gabarito, ends on a period, may take the gradient clip like any entry
    title. This is the card's focus target and accessible name.
  - **Close** — Lucide `x`, 16–20px, `currentColor`, a 44×44 touch target on mobile.
    **Absent** on the only card in the river (the river is never empty).
  - **Copy link to this entry** — Lucide `link`. Copies a link that opens a river of just
    this card. Needs a quiet confirmation state ("Link copied.").
  - **Edit** — Lucide `pencil`, the TiddlyWiki-style call to action on every card. It
    **asks the workbench to open this entry in its main editor pane**; the editor itself is
    the host's, beside or around the app, and is not yours to draw. The request can be
    declined, so the control needs four looks: **ready**; **asking** (a brief busy state
    while the host responds); **declined** (a short inline note in the card header, e.g.
    "Editing isn't available here.", never a dialog); and **absent** when the host says the
    reader can't edit this wiki. When the reader simply closes the editor, the card shows
    nothing.
  - Optional: a mono micro-label with the entry's path or section (Space Mono,
    `--ink-3`), if it helps the reader tell cards apart in a long river. Your call — show
    with and without.
- **Body** — the entry's prose and components, as brief 01. **No section layout** (no
  hero band, no "more people" rail): a card is just the entry.
- **Footer** — the entry's metadata line and tags, as stock.

**Card separation is the central visual question.** Options to explore, not a
prescription: hairline-bordered `--panel` cards with `--r-lg`, versus borderless prose
divided by a hairline rule with the header as the only frame. Long cards must still read
as *one entry each* at a glance, and the brand's hard-offset hover shadow must not make a
whole card look clickable.

## Card states (each one needs a frame)

1. **Resting** — open, not focused.
2. **Focused** — the card the reader is on. Subtle: an accent hairline on the leading
   edge, or a header tint. It changes as the reader scrolls, so it must never be loud.
3. **Just opened** — the entrance (interaction 1 / 2).
4. **Found** — the "here it is" highlight (interaction 3). Short, decays to *focused*.
5. **Loading** — cards render lazily and a large entry takes seconds. A skeleton at a
   plausible height, with the title already shown (the river knows it before the body
   loads). Reuse brief 05's skeleton language.
6. **Closing** — the exit, and the gap closing behind it.
7. **Could not open** — a key in a shared link no longer exists. Don't draw a broken card:
   the river shows a single dismissible notice at the top ("1 entry in this link no longer
   exists.") and opens the rest.
8. **Read-only** — the host says this reader can't edit: no Edit control; nothing else
   changes.
9. **Edit requested** — the header while the workbench editor is opening this entry, and
   after: which card is being edited should be visible at a glance (a quiet marker on the
   header), so the reader can find their place when they come back from the editor.

## The page around the river

- **Desktop:** the stock Grove chrome (brief 02: nav, sidebar, search, theme control,
  footer) around a **single river column** at the reading measure (brief 00's ~68–72ch).
  A **rail** beside the river shows the **focused card's** table of contents and backlinks;
  it updates as focus moves. Design the moment the rail changes its content: it should be
  calm, not flicker on every scroll.
- **Sidebar and open cards:** the sidebar highlights the focused entry as it does today.
  Explore whether it should also **mark the other open entries** (a dot, a tick, a weight
  change) — that marker is how interaction 3 becomes predictable before the click.
- **Mobile (value 8 — not an afterthought):** one column, no rail. The card header may
  stick while its card is in view, so close and edit stay reachable in a long entry; show
  whether that helps or crowds the screen. The sidebar lives in the existing drawer.
  Interaction 1 on a phone scrolls the reader away from the link they tapped — show how
  they understand what happened and how they get back (Back, or scrolling up to the
  source card).
- **A long river:** show one with 8–10 cards, most collapsed out of view, to prove the
  page still has a shape and the focused card is findable.

## Motion

Restrained, as the brand requires (`.14s`-scale transitions). Open, close, and the found
highlight are the only animations. Everything has a **reduced-motion** variant: no slide,
no scroll animation — the card simply appears, and the highlight is a static outline that
fades.

## Sample content (use the real Grove corpus)

Grove's own sample wiki (`grove/content/`) is a fictional company, *Meridian*. Build the
mockup from it so the river looks like a real reading session:

- Start on *Home*. Open *Engineering* (`teams/engineering.mdx`) from the nav
  (interaction 2, top insert). In the Engineering card, open *Incident response*
  (`processes/incident-response.mdx`) from its prose, and *Ada Lovelace*
  (`people/ada-lovelace.mdx`) from its people directory (interaction 1, each directly
  below Engineering). In Ada's card, click "engineering" — Engineering is already open
  (interaction 3).
- Every sample entry is short (the longest is ~45 lines). For the long-card frames, extend
  *Onboarding* (`handbook/onboarding.mdx`) with plausible extra sections, and label the
  frame as padded sample content.

## Hard constraints

- **Tokens only.** Every colour, radius, shadow and font comes from `src/index.css`
  (`--bg`, `--panel`, `--panel-2`, `--ink`, `--ink-2`, `--ink-3`, `--line`, `--line-2`,
  `--accent`, `--accent-2`, `--grad`, `--r-*`, `--shadow-card`, `--disp`, `--sans`,
  `--mono`). New classes follow Grove's naming (`.river-*` beside the existing
  `.grove-*`), so a CSS-only theme can re-skin the river like everything else.
- **Dark default, light via `data-theme="light"`** — deliver both for the river page and
  the card states.
- **Sentence case, headlines end on a period, no emoji.** Icons are Lucide at 16–24px in
  `currentColor`: `x`, `link`, `pencil`, `chevron-*` as needed.
- **Don't draw host chrome.** The immediately.run host frame, sign-in, consent prompts, its
  seam or header UI, **the workbench editor** that Edit opens, and **the first-use prompt**
  that asks a reader to allow the river to open a wiki are all the host's. The river is inside
  the app's frame. Imitating host chrome is treated as spoofing.
- **The body vocabulary is Grove's safe set.** The river renders entries with Grove's safe
  renderer, so a card shows Grove's built-in components (brief 03) and nothing a wiki ships
  as its own code. Don't design wiki-specific widgets into cards.
- **One theme across the river.** Cards don't carry their own themes; the river takes the
  home entry's. Don't design per-card theming.
- **Accessibility:** each card is an `article` labelled by its title heading;
  close and copy are real buttons with labels; focus moves visibly on open and close; the
  found highlight isn't colour-only.

## Out of scope (don't design these)

Drag-to-reorder cards, editing inside a card (Edit hands off to the workbench), close-all /
close-others, a
permalink-versus-permaview toggle, and any server or sync indicator. The river exists only
in the URL.

## Deliverables

1. The river page at **desktop and mobile**, dark and light, with the sample session above.
2. The **card** in all nine states, plus the Edit control's four looks.
3. **Sequences** (storyboards or prototype) for the six interactions, plus reduced-motion
   variants of 1, 3 and 4.
4. The **rail** (desktop) following focus, and the **sidebar** with the open-entry marker
   explored.
5. A **long river** (8–10 cards).
6. The river under **one alternate Grove theme** (brief 05's showcase) — same DOM, CSS
   only — to prove the new classes are themeable.
7. A short note on the open design questions below, with your recommendation.

## Open design questions (answer with a recommendation)

- **Card frame:** bordered panel or ruled prose (see *The card*)?
- **Focused-card indicator:** how quiet can it be and still be findable in a long river?
- **Chrome-link insertion:** the spec defaults sidebar/nav/search opens to the **top** of
  the river (TiddlyWiki's rule). If, deep in a long river, a top insert disorients more
  than it helps, say so and propose "below the focused card" instead.
- **Sticky card header on mobile:** does it earn its space?
