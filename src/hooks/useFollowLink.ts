// `useFollowLink` — read the active navigation policy (APP_CUSTOMIZATION §4.3,
// R3-872). The hook lives in its own file per the repo's one-hook-per-file
// convention; the context + the stock default live in `lib/navigationPolicy.ts`
// (no components there — the Fast-Refresh rule).
import { useContext } from 'react';
import { NavigationPolicyContext, type FollowLink } from '../lib/navigationPolicy';

/** The active navigation policy — the provider's, or the stock `navigate(href)`. */
export function useFollowLink(): FollowLink {
  return useContext(NavigationPolicyContext);
}
