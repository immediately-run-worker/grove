/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback } from 'react';
import { Link, useFileMetadata, useMetadataQuery } from '@immediately-run/sdk';
import { contentDir, keyToHref } from '../lib/content';
import { queryPaths } from '../lib/wiki';
import { useEntryKey } from '../hooks/useEntryKey';
import { useFollowLink } from '../hooks/useFollowLink';
import { followLinkOnClick } from '../lib/navigationPolicy';

interface Props {
  team?: string;
  compact?: boolean;
}

function isPerson(m: any): boolean {
  return m && m.name && m.role && m.team && m.phone;
}

function Row({ path, compact }: { path: string; compact?: boolean }) {
  const m = useFileMetadata(path) as any;
  const from = useEntryKey();
  const follow = useFollowLink();
  if (!m) return null;
  return (
    <tr>
      <td style={{ fontWeight: 600 }}>
        <Link href={keyToHref(path)} onClick={followLinkOnClick(follow, { key: path, href: keyToHref(path), from })}>{m.name}</Link>
      </td>
      <td>{m.role}</td>
      {!compact && <td>{m.team}</td>}
      <td className="mono">{m.phone}</td>
      {!compact && <td className="mono">{m.email}</td>}
    </tr>
  );
}

// Import-free engine component: the phone book, built from per-person entries.
export default function Directory({ team, compact }: Props) {
  const queryFn = useCallback(
    (filesMetadata: Record<string, any>) =>
      Object.keys(filesMetadata)
        .filter((p) => p.startsWith(contentDir()) && isPerson(filesMetadata[p]))
        .filter((p) => !team || filesMetadata[p].team === team)
        .sort((a, b) => (filesMetadata[a].name < filesMetadata[b].name ? -1 : 1)),
    [team]
  );
  const result = useMetadataQuery(queryFn);
  const paths: string[] = queryPaths(result);

  return (
    <div className="grove-table-wrap">
      <table className="grove-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            {!compact && <th>Team</th>}
            <th>Phone</th>
            {!compact && <th>Email</th>}
          </tr>
        </thead>
        <tbody>
          {paths.map((p) => (
            <Row key={p} path={p} compact={compact} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
