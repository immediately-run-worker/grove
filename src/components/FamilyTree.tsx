/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMetadataQuery } from '@immediately-run/sdk';
import type { Metadata } from '@immediately-run/sdk';

import { useEntryKey } from '../hooks/useEntryKey';
import { familyTreeQuery } from '../lib/queries';
import type { FamilyNodeRecord } from '../lib/queries';

interface Node {
  id: string;
  label: string;
  group: string;
  x: number;
  y: number;
}

// `<FamilyTree/>` — the relational extension view. Reads each entry's relationship
// frontmatter (`parent`/`manager`/`team`) and draws the link-graph motif made
// literal: group hubs joined by hairline edges to their members. Genealogy
// (`parent`/`house`) and org charts (`team`/`manager`) share the same rendering.
export default function FamilyTree() {
  const currentKey = useEntryKey();

  // Records, not tab-encoded paths (R3-276a).
  const q = useMetadataQuery<Metadata, FamilyNodeRecord>(familyTreeQuery);
  const rows: FamilyNodeRecord[] = Array.isArray(q) ? q : [];

  if (!rows.length) {
    return <p className="grove-search__empty">No relationships defined.</p>;
  }

  // Deterministic layout: hubs evenly across the width, members stacked beneath.
  const groups: Record<string, typeof rows> = {};
  rows.forEach((r: any) => (groups[r.group] = groups[r.group] || []).push(r));
  const groupNames = Object.keys(groups).sort();
  const W = 720;
  const colW = W / groupNames.length;
  const hubs: Node[] = [];
  const members: Node[] = [];
  const edges: { x1: number; y1: number; x2: number; y2: number; cur: boolean }[] = [];
  groupNames.forEach((g, gi) => {
    const cx = colW * gi + colW / 2;
    const hub: Node = { id: g, label: g, group: g, x: cx, y: 46 };
    hubs.push(hub);
    groups[g].forEach((m: any, mi: number) => {
      const my = 120 + mi * 46;
      const mn: Node = { id: m.path, label: m.label, group: g, x: cx, y: my };
      members.push(mn);
      edges.push({ x1: cx, y1: 56, x2: cx, y2: my, cur: m.path === currentKey });
    });
  });
  const maxRows = Math.max(...groupNames.map((g) => groups[g].length));
  const H = 120 + maxRows * 46;

  return (
    <div className="grove-graph">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }}>
        {edges.map((e, i) => (
          <line
            key={i}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke={e.cur ? 'var(--accent)' : 'var(--line-2)'}
            strokeWidth={1}
          />
        ))}
        {hubs.map((h) => (
          <g key={h.id}>
            <circle cx={h.x} cy={h.y} r={7} fill="var(--accent-violet)" />
            <text x={h.x} y={h.y - 14} textAnchor="middle" fill="var(--ink)" fontSize={13} fontFamily="var(--disp)">
              {h.label}
            </text>
          </g>
        ))}
        {members.map((m) => (
          <g key={m.id}>
            <circle
              cx={m.x}
              cy={m.y}
              r={5}
              fill={m.id === currentKey ? 'var(--accent)' : 'var(--ink-3)'}
            />
            <text x={m.x + 12} y={m.y + 4} fill="var(--ink-2)" fontSize={12} fontFamily="var(--sans)">
              {m.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
