import { useMemo, useState } from 'react';
import { Link, useMetadataQuery } from '@immediately-run/sdk';
import type { Metadata } from '@immediately-run/sdk';
import { contentDir, keyToHref } from '../lib/content';
import { useEntryKey } from '../hooks/useEntryKey';
import { useFollowLink } from '../hooks/useFollowLink';
import { followLinkOnClick } from '../lib/navigationPolicy';
import { sidebarQuery } from '../lib/queries';
import { plainLabel } from '../lib/queries';
import InlineProse from './InlineProse';
import type { SidebarRecord } from '../lib/queries';
import Icon from './Icon';

interface TreeNode {
  name: string;
  key?: string; // leaf entry key
  title?: string;
  children: Record<string, TreeNode>;
}

function insert(root: TreeNode, key: string, title: string) {
  const rel = key.replace(contentDir(), '').replace(/\.mdx?$/, '');
  const parts = rel.split('/');
  let node = root;
  parts.forEach((part, i) => {
    const leaf = i === parts.length - 1;
    node.children[part] = node.children[part] || { name: part, children: {} };
    node = node.children[part];
    if (leaf) {
      node.key = key;
      node.title = title;
    }
  });
}

function hasDescendant(node: TreeNode, key: string): boolean {
  return Object.values(node.children).some((c) => c.key === key || hasDescendant(c, key));
}

function treeHoldsKey(node: TreeNode, key: string): boolean {
  return node.key === key || hasDescendant(node, key);
}

/** A row's stable id: a leaf is its entry key; a folder is its names-path
 *  (the `#dir:` prefix cannot collide with an entry key). `dirPath` is the
 *  accumulated folder names from the tree root, trailing slash included. */
function folderRowId(dirPath: string, name: string): string {
  return `#dir:${dirPath}${name}`;
}

/** The FIRST rendered row under a node (children in sorted order): the top
 *  child itself — a folder's button, or a leaf's link. */
function firstRowIdOf(node: TreeNode, dirPath: string): string | null {
  const childKeys = Object.keys(node.children).sort();
  if (!childKeys.length) return node.key ?? null;
  const first = node.children[childKeys[0]];
  return first.key ?? folderRowId(dirPath, first.name);
}

// A folder (has children) or a leaf entry. Folders are collapsible; the branch
// holding the current entry starts open. Rows are `treeitem`s under a roving
// tab stop (R3-608, APG Tree View): exactly one row is tabbable, arrows walk
// the tree — the #63 folder toggle keeps its handler and its aria-expanded.
function Branch({
  node,
  currentKey,
  depth,
  dirPath,
  stopRowId,
}: {
  node: TreeNode;
  currentKey: string;
  depth: number;
  dirPath: string;
  stopRowId: string | null;
}) {
  const childKeys = Object.keys(node.children).sort();
  const isFolder = childKeys.length > 0;
  const containsCurrent = !!currentKey && (node.key === currentKey || hasDescendant(node, currentKey));
  const [open, setOpen] = useState(depth < 1 || containsCurrent);
  const follow = useFollowLink();

  if (!isFolder) {
    return (
      <Link
        href={keyToHref(node.key!)}
        className="gs-tree__row"
        data-cur={node.key === currentKey ? '1' : '0'}
        data-tree-row="1"
        role="treeitem"
        aria-level={depth + 1}
        aria-current={node.key === currentKey ? 'page' : undefined}
        tabIndex={node.key === stopRowId ? 0 : -1}
        onClick={followLinkOnClick(follow, { key: node.key!, href: keyToHref(node.key!), from: currentKey })}
      >
        <Icon name="file" />
        <InlineProse text={node.title || node.name} trimPeriod />
      </Link>
    );
  }

  const rowId = folderRowId(dirPath, node.name);
  return (
    <div>
      <button
        type="button"
        className="gs-tree__row gs-folder"
        data-open={open ? '1' : '0'}
        data-tree-row="1"
        role="treeitem"
        aria-level={depth + 1}
        aria-expanded={open}
        /* Roving stop, with the collapsed-ancestor fallback (R3-608 review):
         * the folder holds the stop when it IS the stop's row, or when it is
         * collapsed yet CONTAINS the current entry — collapsing the branch the
         * reader is on must never unmount the tree's only tab stop. Exactly
         * one row qualifies either way: the collapsed folder is the nearest
         * rendered ancestor of the (unrendered) current row. */
        tabIndex={rowId === stopRowId || (!open && containsCurrent) ? 0 : -1}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="chevron-down" className="chev" />
        {node.name}
        <span className="ct">{childKeys.length}</span>
      </button>
      {open ? (
        <div className="gs-tree__children" role="group">
          {childKeys.map((k) => (
            <Branch
              key={k}
              node={node.children[k]}
              currentKey={currentKey}
              depth={depth + 1}
              dirPath={`${dirPath}${node.name}/`}
              stopRowId={stopRowId}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// `.grove-sidebar` — the wiki shell's left rail: a namespace tree + author-defined
// `ui/sidebar` sections (a header + a link into the tagged entry).
export default function Sidebar() {
  const currentKey = useEntryKey();
  const follow = useFollowLink();

  // Records, not tab-encoded paths (R3-276a).
  const q = useMetadataQuery<Metadata, SidebarRecord>(sidebarQuery);
  const rows: SidebarRecord[] = Array.isArray(q) ? q : [];

  const rowsKey = rows.map((r) => r.path).join('|');
  const { tree, sections } = useMemo(() => {
    const root: TreeNode = { name: '', children: {} };
    const secs: { key: string; label: string }[] = [];
    rows.forEach(({ path, title, tags, nav }) => {
      insert(root, path, title);
      if (tags.includes('ui/sidebar')) secs.push({ key: path, label: plainLabel(nav || title || path) });
    });
    return { tree: root, sections: secs };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsKey]);

  const topKeys = Object.keys(tree.children).sort();

  // The roving tab stop: the current entry's own row (its branch opens by
  // construction), else the tree's first rendered row.
  const stopRowId = useMemo(() => {
    if (currentKey && treeHoldsKey(tree, currentKey)) return currentKey;
    return firstRowIdOf(tree, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsKey, currentKey]);

  // The tree's keyboard controller (R3-608): Up/Down/Home/End walk the
  // RENDERED rows in DOM order; Right/Left expand/collapse by delegating to
  // the folder row's own handler (the #63 button's onClick) when the row's
  // aria-expanded says the arrow applies.
  const onTreeKeyDown = (e: React.KeyboardEvent) => {
    const rowsInOrder = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-tree-row]')];
    if (!rowsInOrder.length) return;
    const activeIdx = rowsInOrder.indexOf(document.activeElement as HTMLElement);
    const move = (idx: number) => {
      e.preventDefault();
      rowsInOrder[Math.max(0, Math.min(rowsInOrder.length - 1, idx))]?.focus();
    };
    if (e.key === 'ArrowDown') move(activeIdx + 1);
    else if (e.key === 'ArrowUp') move(activeIdx - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(rowsInOrder.length - 1);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const row = rowsInOrder[activeIdx];
      const wantOpen = e.key === 'ArrowRight';
      if (!row || row.getAttribute('aria-expanded') !== (wantOpen ? 'false' : 'true')) return;
      e.preventDefault();
      row.click(); // the #63 folder toggle's own handler
    }
  };

  return (
    <aside className="grove-sidebar">
      <div className="gs-block">
        <div className="gs-block__h">Browse</div>
        <div className="gs-tree" role="tree" aria-label="Entries" onKeyDown={onTreeKeyDown}>
          {topKeys.map((k) => (
            <Branch key={k} node={tree.children[k]} currentKey={currentKey} depth={0} dirPath="" stopRowId={stopRowId} />
          ))}
        </div>
      </div>
      {sections.map((s) => (
        <div className="gs-block" key={s.key}>
          <div className="gs-block__h">{s.label}</div>
          <div className="gs-section__body">
            <Link
              href={keyToHref(s.key)}
              className="grove-wikilink"
              data-state="ok"
              onClick={followLinkOnClick(follow, { key: s.key, href: keyToHref(s.key), from: currentKey })}
            >
              Open
            </Link>
          </div>
        </div>
      ))}
    </aside>
  );
}
