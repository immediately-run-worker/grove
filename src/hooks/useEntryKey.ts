// useEntryKey — "which entry am I rendered inside?" (R3-871).
//
// The one place the URL→key expression survives (R6): every component that
// needs the current entry reads this hook, so an included fragment or a
// layout resolves relative links against the entry it renders, not whatever
// the address bar happens to say. Falls back to the routed key when no
// provider is present — the default-preserving seam of APP_CUSTOMIZATION §3
// (R-CUST-2/3). Internal for now; R3-872 exports it with the other seams.
import { useContext } from 'react';
import { TinkerableContext } from '@immediately-run/sdk/TinkerableContext';
import { entryKeyOr, EntryContext } from '../lib/entryContext';

export { EntryContext };

/** The metadata key of the entry this subtree renders (the routed key when
 *  no provider is present). */
export function useEntryKey(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = useContext(TinkerableContext) as any;
  return entryKeyOr(useContext(EntryContext), ctx?.navigationState?.sandboxPath || '/');
}
