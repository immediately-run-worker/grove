// @vitest-environment jsdom
// R3-877 — the workbench delivery of the edit affordance for a read-only opener
// delegation: `requestEdit({ bundleFile })`, with the refusal contract pinned:
// `read-only` hides the affordance until the next mount announcement, `cancelled`
// stays silent, `forbidden` (and anything else) sets `refused`.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { EditAffordance } from './useEditAffordance';

const requestEditMock = vi.fn<(t?: unknown) => Promise<void>>();
const invokeTaskMock = vi.fn<(a: unknown) => Promise<void>>();
const useMountsMock = vi.fn<() => unknown[]>();

vi.mock('@immediately-run/sdk', () => ({
  requestEdit: (a?: unknown) => requestEditMock(a),
  invokeTask: (a: unknown) => invokeTaskMock(a),
  capFile: (ref: unknown, opts: unknown) => ({ ...(ref as object), ...(opts as object) }),
  useMounts: () => useMountsMock(),
}));

// The corpus identity comes from the real contentRoot module, driven through its
// own producer (R3-877 round 1, R2) — never a hand-typed shape.
import { getContentRoot, resetContentRoot, setContentRoot } from '../lib/contentRoot';

import { useEditAffordance } from './useEditAffordance';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RO_MOUNT = { type: 'task-delegation', path: '/task/t1/dir', id: '/task/t1/dir', mode: 'ro', readerCanEdit: true };

let latest: EditAffordance | null = null;
function Probe() {
  const affordance = useEditAffordance(false);
  useEffect(() => {
    latest = affordance;
  });
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  setContentRoot('/task/t1/dir', { mountId: '/task/t1/dir' });
  requestEditMock.mockReset().mockResolvedValue(undefined);
  invokeTaskMock.mockReset().mockResolvedValue(undefined);
  useMountsMock.mockReset().mockReturnValue([RO_MOUNT]);
  latest = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Probe />));
});

const rerender = () => act(() => root.render(<Probe />));

afterEach(() => {
  resetContentRoot();
  act(() => root.unmount());
  container.remove();
});
const open = async (key = `${getContentRoot()}plot/the-rail.mdx`) => {
  await act(async () => {
    latest!.openEditor(key);
    await Promise.resolve();
  });
  rerender();
};

describe('useEditAffordance — the workbench delivery (R3-877)', () => {
  it('an ro delegation offers Edit and delivers it as requestEdit({ bundleFile })', async () => {
    expect(latest!.writable).toBe(true);
    await open();
    expect(requestEditMock).toHaveBeenCalledWith({ bundleFile: '/plot/the-rail.mdx' });
    expect(invokeTaskMock).not.toHaveBeenCalled();
    expect(latest!.refused).toBe(false);
  });

  it('an ro delegation with `readerCanEdit: false` does not offer the control', () => {
    useMountsMock.mockReturnValue([{ ...RO_MOUNT, readerCanEdit: false }]);
    rerender();
    expect(latest!.writable).toBe(false);
  });

  it('a `read-only` refusal hides the affordance until the next mount announcement', async () => {
    requestEditMock.mockRejectedValue(Object.assign(new Error('no'), { code: 'read-only' }));
    await open();
    expect(latest!.refused).toBe(false); // not a render-in-place refusal
    expect(latest!.writable).toBe(false); // hidden…
    useMountsMock.mockReturnValue([{ ...RO_MOUNT }]); // …until the next announcement…
    rerender();
    expect(latest!.writable).toBe(true); // …unlatches it.
  });

  it('a `cancelled` rejection stays silent (the reader closed the editor)', async () => {
    requestEditMock.mockRejectedValue(Object.assign(new Error('closed'), { code: 'cancelled' }));
    await open();
    expect(latest!.refused).toBe(false);
    expect(latest!.writable).toBe(true);
  });

  it('a `forbidden` refusal sets `refused` (rendered as text in place) and never retries via edit-file', async () => {
    requestEditMock.mockRejectedValue(Object.assign(new Error('no'), { code: 'forbidden' }));
    await open();
    expect(latest!.refused).toBe(true);
    expect(invokeTaskMock).not.toHaveBeenCalled();
  });
});
