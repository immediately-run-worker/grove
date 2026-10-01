import { useMemo } from 'react';
import { MountImage } from '@immediately-run/sdk';
import type { SandboxMount } from '@immediately-run/sdk';
import { keyToFsPath } from '../lib/content';
import { resolvePath } from '../lib/assetPath';
import { useEntryKey } from '../hooks/useEntryKey';

// MDX `img` override: display a mount-relative image by reading its bytes off the
// sandbox fs (the opaque-origin iframe can't fetch a relative path). Resolves the
// src relative to the entry currently being rendered — the entry context's entry,
// not the URL (R3-871: inside an included fragment or a layout, the URL names the
// wrong base) — then hands the file to the SDK's `MountImage`, which owns the
// read → object URL → revoke lifecycle we used to hand-roll here.

// The whole sandbox fs, `/`-rooted. The resolved asset path is already absolute
// (`/app/content/…`), so anchor at root and pass it as the mount-relative path
// (leading slash stripped) — preserving the exact paths the old `fs.readFile` read.
const ROOT_MOUNT: SandboxMount = { path: '/', type: 'repo' };

interface Props {
  src?: string;
  alt?: string;
  className?: string;
}

export default function AssetImage({ src = '', alt = '', className }: Props) {
  const entryKey = useEntryKey();

  const relPath = useMemo(() => {
    // The entry's absolute fs path (/app/content/...) is the base for relative assets.
    const base = keyToFsPath(entryKey);
    return resolvePath(base, src).replace(/^\/+/, '');
  }, [entryKey, src]);

  return (
    <MountImage
      mount={ROOT_MOUNT}
      relPath={relPath}
      alt={alt}
      className={className || 'grove-img__el'}
      placeholder={
        <span className="grove-img__box" style={{ display: 'block', minHeight: 80 }} />
      }
      fallback={<span className="grove-img__cap">missing asset: {src}</span>}
    />
  );
}
