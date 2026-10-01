// @vitest-environment jsdom
// R3-871 — the entry context's actual behaviour, over the real key grammar.
// The context key wins when a provider is present; the ROUTED key (real
// sandboxPathToKey) otherwise; and the component-level case — a relative link
// inside a non-routed entry resolving against that entry — is driven in
// WikiLink.test.tsx.
import { describe, it, expect } from 'vitest';
import { entryKeyOr } from './entryContext';
import { sandboxPathToKey } from './content';

describe('entryKeyOr — the one fallback rule (R3-871)', () => {
  it('returns the context key when a provider is present', () => {
    expect(entryKeyOr({ entryKey: '/app/content/teams/engineering.mdx' }, '/files/content/home.mdx')).toBe(
      '/app/content/teams/engineering.mdx',
    );
  });

  it('falls back to the ROUTED key when the context is null (no provider)', () => {
    expect(entryKeyOr(null, '/files/content/handbook/onboarding.mdx')).toBe(
      sandboxPathToKey('/files/content/handbook/onboarding.mdx'),
    );
  });

  it('treats an absent context the same as null', () => {
    expect(entryKeyOr(undefined, '/files/content/handbook/onboarding.mdx')).toBe(
      entryKeyOr(null, '/files/content/handbook/onboarding.mdx'),
    );
  });

  it('the fallback is computed by the REAL sandboxPathToKey — the routed cases', () => {
    // the folder URL form and the bare root both route HOME (the exact rule
    // sandboxPathToKey encodes), so the default rendering is unchanged.
    expect(entryKeyOr(null, '/')).toBe(sandboxPathToKey('/'));
    expect(entryKeyOr(null, '')).toBe(sandboxPathToKey('/'));
    // the /files-prefixed form strips to the content key
    expect(entryKeyOr(null, '/files/content/a/b.mdx')).toBe('/app/content/a/b.mdx');
  });
});
