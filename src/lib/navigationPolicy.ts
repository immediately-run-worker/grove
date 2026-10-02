// The navigation policy (APP_CUSTOMIZATION_SPEC §4.3, R3-872) — every in-bundle entry
// link's plain click goes through ONE replaceable function, so a shell that composes
// GroveEntry decides what "follow" means (route, open elsewhere, intercept) without
// forking a component.
//
// This file exports no component (the Fast-Refresh rule), so the context lives here
// beside the default it falls back to.

import { createContext } from 'react';
import { navigate } from '@immediately-run/sdk';

/** A resolved link target: the corpus key, any `#fragment`, the concrete href the
 *  anchor already renders (modifier-/middle-click still open it in a new tab), and
 *  the entry the link was rendered inside (`from`). Resolution happens at the call
 *  site — the policy receives the ANSWER, never a string to re-derive. */
export interface FollowLinkTarget {
  key: string;
  fragment?: string;
  href: string;
  from?: string;
}

/** What a plain click on an entry link does. */
export type FollowLink = (target: FollowLinkTarget) => void;

/** The stock behaviour: navigate to the resolved href, exactly as the SDK's Link
 *  would have. */
export const defaultFollowLink: FollowLink = ({ href }) => navigate(href);

/**
 * The active policy. Read via `useFollowLink()` (the hook file keeps the
 * component-tree rule); the context's default is the stock behaviour, so an
 * unprovided tree behaves exactly as before (R-CUST-2).
 */
export const NavigationPolicyContext = createContext<FollowLink>(defaultFollowLink);

/**
 * The anchor `onClick` half of the policy (R-CUST-3): a PLAIN click (no modifier,
 * primary button) goes to the policy and never to the browser; a modified click
 * falls through to the anchor's real `href` (new tab/window semantics are the
 * browser's, and an anchor that lost them is a bug). A policy that throws is caught,
 * logged with the target, and NOT silently fallen back from (R-CUST-5: fail loudly).
 */
export function followLinkOnClick(
  follow: FollowLink,
  target: FollowLinkTarget,
): (e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; preventDefault: () => void }) => void {
  return (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    try {
      follow(target);
    } catch (err) {
      console.error(`[grove] the navigation policy threw for ${target.key}${target.fragment ?? ''}`, err);
    }
  };
}
