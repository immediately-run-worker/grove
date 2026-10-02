/* eslint-disable @typescript-eslint/no-explicit-any */
import { Fragment } from 'react';
import type { ComponentType } from 'react';
import { Link, useMDXComponents } from '@immediately-run/sdk';
import { useShell } from '../lib/shell';
import { useFollowLink } from '../hooks/useFollowLink';
import { followLinkOnClick } from '../lib/navigationPolicy';
import { keyToHref } from '../lib/content';
import { dirCrumbs, dirKeyToPath } from '../lib/directory';
import DirectoryList from './DirectoryList';
import Icon from './Icon';

// Resolving the table through the MDX component map is what makes it OVERRIDABLE.
// `useMDXComponents({})` returns the provider's map — the SDK defaults, under Grove's
// vocabulary, under whatever a fork or (once R3-174 lands) the CONTENT registered. So
// replacing `DirectoryList` replaces it everywhere it renders, including this route,
// rather than only where an author typed the tag. The literal `{}` is hoisted because
// the SDK memoizes on the argument's identity.
const NO_OVERRIDES = {};

/**
 * The reading view for a URL that names a FOLDER.
 *
 * Grove's routes are filesystem paths, so a folder is an address a reader can reach —
 * by typing it, by trimming a URL, from the host's file explorer, or by following a
 * link into a namespace. It used to resolve to "No entry at …", which is false: the
 * entries exist, one level down. This renders the folder instead: breadcrumb, name, and
 * the overridable `<DirectoryList/>`.
 *
 * (An author who wants a *curated* page at a folder URL writes `index.mdx` in it — the
 * router prefers that over this view. See `folderIndexKey`.)
 */
export default function DirectoryView() {
  const { entryKey, siteTitle } = useShell();
  const follow = useFollowLink();
  const components = useMDXComponents(NO_OVERRIDES) as Record<string, ComponentType<any> | undefined>;
  const List = components.DirectoryList ?? DirectoryList;

  const crumbs = dirCrumbs(entryKey);
  const name = crumbs.length ? crumbs[crumbs.length - 1].label : siteTitle;

  return (
    <article className="grove-page" data-layout="doc" data-view="directory">
      <div className="gp-main">
        <header className="grove-entry-header">
          <nav className="crumb">
            <Link href="/" onClick={followLinkOnClick(follow, { key: crumbs[0]?.key ?? '/', href: '/', from: entryKey })}>{siteTitle}</Link>
            {crumbs.slice(0, -1).map((c) => (
              <Fragment key={c.key}>
                <span aria-hidden="true">/</span>
                <Link href={keyToHref(c.key)} onClick={followLinkOnClick(follow, { key: c.key, href: keyToHref(c.key), from: entryKey })}>{c.label}</Link>
              </Fragment>
            ))}
          </nav>
          <h1>
            <span className="gdir__title-icon" aria-hidden="true">
              <Icon name="folder" />
            </span>
            {name}
          </h1>
          <div className="grove-meta">
            <span>Folder</span>
          </div>
        </header>
        <div className="grove-prose">
          <List path={dirKeyToPath(entryKey)} />
        </div>
      </div>
    </article>
  );
}
