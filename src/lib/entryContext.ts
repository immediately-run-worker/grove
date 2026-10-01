// The entry context (APP_CUSTOMIZATION_SPEC §4.2; R3-871).
//
// Seven-plus Grove components used to work out "the entry I am in" from the
// URL (`sandboxPathToKey(ctx?.navigationState?.sandboxPath || '/')`). Inside
// anything but the routed entry — an included fragment, a layout, and next a
// story-river card — a relative `[[link]]` or `![](img.png)` resolved against
// the wrong base, and "self" was judged against the URL. The provider placed
// by `GroveWiki` (R3-872 moves it into `GroveEntry`) says which entry a
// subtree renders; this module owns the context shape and the pure fallback
// rule so both are testable without React.
import { createContext } from 'react';
import { sandboxPathToKey } from './content';

/** What a provider subtree declares: the metadata key of the entry it renders. */
export interface EntryContextValue {
  entryKey: string;
}

/** The provider seam itself (§4.2): null — not the routed key — when no
 *  provider is above, so the pure fallback rule below decides, exactly once.
 *  Lives here, beside the rule it carries, per the item's placement; it is a
 *  context object, not a component, so the Fast Refresh rule is not engaged. */
export const EntryContext = createContext<EntryContextValue | null>(null);

/**
 * The one fallback rule: the context's entry when a provider is present, the
 * routed key otherwise — computed by the real `sandboxPathToKey`, so the
 * default rendering is byte-identical to before the context existed
 * (R-CUST-3, default-preserving).
 */
export function entryKeyOr(contextValue: EntryContextValue | null | undefined, sandboxPath: string): string {
  // `||` (not `??`): an empty-string entryKey is "a provider that says
  // nothing", and falls back — '' is not a key anything can resolve against.
  return contextValue?.entryKey || sandboxPathToKey(sandboxPath || '/');
}
