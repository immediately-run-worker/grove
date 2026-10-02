// Shell state shared between the engine root (App) and the chrome components the
// LAYOUT arranges (GroveNav, GroveSidebar, GroveFooter, PageView). The chrome's
// interactive brains stay in React; only their *placement* moved into content
// (`_layout.mdx`). Those components read this context, so a layout can arrange
// them anywhere and they still work.
//
// This file exports only contexts/hooks/types (no components) so it's exempt from
// the Fast-Refresh "components-only" rule.
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { DirectoryListing } from '../hooks/useDirectoryListing';

export interface NavItem {
  key: string;
  href: string;
  label: string;
}

/** Everything the arranged chrome needs, provided once by App at the engine root. */
export interface GroveShell {
  // Theme / appearance
  theme: string;
  setTheme: (t: string) => void;
  light: boolean;
  setLight: (v: boolean) => void;
  menuOpen: boolean;
  setMenuOpen: (v: boolean | ((o: boolean) => boolean)) => void;
  // Overlays
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  drawerOpen: boolean;
  setDrawerOpen: (v: boolean) => void;
  // Environment
  vw: 'mobile' | 'desktop';
  navMode: 'top' | 'side';
  /** Whether to render an edit affordance — the corpus MOUNT's answer, re-read live
   *  (R3-266), never a property of how this instance was packaged. */
  writable: boolean;
  /** Open a content entry in the platform editor. Which verb that takes differs by
   *  packaging (`lib/editTarget`); the chrome never has to know which. */
  openEditor: (entryKey: string) => void;
  /** True while an editor is being summoned, for a busy label. */
  editBusy: boolean;
  /** True when the host REFUSED the last edit request — render it where the
   *  affordance was offered (3.3.1, R3-608); a cancelled request never sets it. */
  editRefused: boolean;
  /** What a save actually does, for the affordance's title — under dispatch it says
   *  the write lands in the mounted content and can be proposed back as a PR
   *  (R3-643 / site-main #576 wired the contribute flow to the content repo). */
  editHint: string;
  siteTitle: string;
  /** Interpreter mode (TRUST_MODES §5): render this entry's body through the
   *  non-executable safe renderer (R3-213) instead of the compiled/executable `<Include>`
   *  path. Driven by `render: safe` on the HOME entry (wiki-wide) or on the entry itself
   *  (per-entry, R3-252); default false (compiled MDX). */
  safe: boolean;
  navItems: NavItem[];
  // Current entry (the page the innermost <Outlet/> renders)
  entryKey: string;
  includePath: string;
  layout: string;
  showRails: boolean;
  mins: number;
  missing: boolean;
  suggestion?: string;
  /** Whether the current URL names a FOLDER rather than an entry, and what is in it.
   *  `checking` while the readdir is in flight — <PageView> must render neither the
   *  entry nor the 404 then, or a folder URL flashes "No entry at …" before healing. */
  directory: DirectoryListing;
  /** R3-872 — the entry frame's gate input: the content stylesheets' read state.
   *  Wiki-wide (the home entry's declaration), provided by the engine root;
   *  standalone compositions default to 'ready' (no sheets declared). */
  stylesheetsStatus?: 'loading' | 'ready';
}

/** The refusal sentence, ONE home (R6, R3-608): every surface that offers an edit
 *  renders this where the affordance was offered. */
export const EDIT_REFUSED_NOTICE = 'Could not open the editor — the host refused';

export const GroveShellContext = createContext<GroveShell | null>(null);

/** Read the shell context. Throws if used outside App's provider — which only
 *  happens if chrome is rendered outside the Grove tree, a real bug. */
export function useShell(): GroveShell {
  const ctx = useContext(GroveShellContext);
  if (!ctx) throw new Error('useShell() must be used within <GroveShellContext.Provider>');
  return ctx;
}

/** The node an `<Outlet/>` renders: the next-inward layout, or — at the bottom of
 *  the chain — the page itself (`<PageView/>`). Each layer sets this for its own
 *  subtree, so nested layouts compose. */
export const OutletContext = createContext<ReactNode>(null);
