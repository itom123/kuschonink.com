// Field Guide suggestions in Notion: the three databases' property names, the
// statuses, and how a suggestion becomes Notion properties and back. One place
// for the schema, shared by the Worker (worker/suggest.ts, the admin queue, the
// publisher) and the routine's tools (scripts/suggestions/nt.mts).
//
// Suggestions holds nothing private: the submitter's name and email are in
// Contacts, which only the site's own Notion integration can read (the
// routine's integration can't). See docs/GUIDES.md, "Suggestions".
import { P, R, type NotionPage, type Prop } from './notion.ts';
import { currentSlug, slugNames } from '../src/lib/guides/address.ts';
import type { AccessFile } from '../src/lib/guides/types';

/** What readSuggestion() and guideIs() need from access.json: the guides and their old addresses. */
type GuideNames = Pick<AccessFile, 'guides' | 'moved'>;

/** A suggestion's life, in the order it usually goes. */
export const STATUSES = ['NEW', 'ASKED', 'APPROVED', 'REFUSED', 'PROCESSING', 'READY', 'PUBLISHING', 'PUBLISHED', 'DUPLICATE', 'NEEDS CHECK', 'ERROR', 'SPAM'] as const;
export type Status = (typeof STATUSES)[number];

export const KINDS = ['exhibition', 'event', 'place'] as const;
export type Kind = (typeof KINDS)[number];
const KIND_NAME: Record<Kind, string> = { exhibition: 'Exhibition', event: 'Event', place: 'Place' };

/** Property names in the Suggestions database. */
export const S = {
  name: 'Name',
  status: 'Status',
  guide: 'Guide',
  kind: 'Kind',
  lang: 'Language',
  sentBy: 'Sent by',
  show: 'Show title',
  artists: 'Artists',
  dates: 'Dates',
  hours: 'Hours',
  address: 'Address',
  website: 'Website',
  links: 'Other links',
  description: 'Description',
  picture: 'Picture',
  pictureCredit: 'Picture credit',
  rights: 'Rights confirmed',
  own: 'Own show',
  creditAs: 'Credit as',
  reference: 'Reference',
  submission: 'Submission id',
  fingerprint: 'Fingerprint',
  duplicate: 'Possible duplicate',
  tier: 'Tier',
  showTo: 'Show to',
  notes: 'Owner notes',
  entry: 'Entry',
  webPicture: 'Web picture',
  result: 'Result',
  run: 'Run',
  itemId: 'Item id',
  commit: 'Commit',
  processed: 'Processed',
} as const;

/** Property names in the Contacts database (the site's integration only). */
export const C = {
  reference: 'Reference',
  submission: 'Submission id',
  suggestion: 'Suggestion',
  guide: 'Guide',
  submitter: 'Submitter',
  email: 'Email',
  mayContact: 'May contact',
} as const;

/** Property names in the Processing log database. */
export const L = {
  run: 'Run',
  when: 'When',
  trigger: 'Trigger',
  actor: 'Actor',
  pages: 'Pages',
  outcome: 'Outcome',
  commit: 'Commit',
  session: 'Session',
  details: 'Details',
} as const;

/** What the wizard sends, once checked (worker/suggest.ts). */
export interface Suggestion {
  guide: string;
  kind: Kind;
  name: string;
  show: string;
  artists: string;
  start: string;
  end: string;
  hours: string;
  address: string;
  website: string;
  links: string[];
  description: string;
  own: boolean;
  pictureCredit: string;
  rights: boolean;
  submitter: string;
  email: string;
  mayContact: boolean;
  creditAs: string;
  lang: 'en' | 'zh';
}

/** What the Worker adds. */
export interface Stamp {
  reference: string;
  submission: string;
  audience: string;
  fingerprint: string;
  duplicate: string;
  picture?: { id: string; name: string };
}

export function suggestionProps(s: Suggestion, t: Stamp): Record<string, Prop> {
  return {
    [S.name]: P.title(s.name),
    [S.status]: P.select('NEW'),
    [S.guide]: P.select(s.guide),
    [S.kind]: P.select(KIND_NAME[s.kind]),
    [S.lang]: P.select(s.lang),
    [S.sentBy]: P.select(t.audience),
    [S.show]: P.text(s.show),
    [S.artists]: P.text(s.artists),
    [S.dates]: P.date(s.start || s.end, s.start && s.end && s.end !== s.start ? s.end : null),
    [S.hours]: P.text(s.hours),
    [S.address]: P.text(s.address),
    [S.website]: P.url(s.website),
    [S.links]: P.text(s.links.join('\n')),
    [S.description]: P.text(s.description),
    [S.picture]: t.picture ? P.files([t.picture]) : P.noFiles(),
    [S.pictureCredit]: P.text(s.pictureCredit),
    [S.rights]: P.checkbox(s.rights),
    [S.own]: P.checkbox(s.own),
    [S.creditAs]: P.text(s.creditAs),
    [S.reference]: P.text(t.reference),
    [S.submission]: P.text(t.submission),
    [S.fingerprint]: P.text(t.fingerprint),
    [S.duplicate]: P.text(t.duplicate),
    [S.tier]: P.select('C'),
    [S.showTo]: P.select('Everyone'),
  };
}

export function contactProps(s: Suggestion, t: Stamp, suggestionPage: string): Record<string, Prop> {
  return {
    [C.reference]: P.title(t.reference),
    [C.submission]: P.text(t.submission),
    [C.suggestion]: P.text(suggestionPage),
    [C.guide]: P.select(s.guide),
    [C.submitter]: P.text(s.submitter),
    [C.email]: P.email(s.email),
    [C.mayContact]: P.checkbox(s.mayContact && !!s.email),
  };
}

export interface LogEntry {
  run: string;
  when?: string;
  trigger: 'scheduled' | 'approved' | 'manual' | 'submitted';
  actor: 'routine' | 'publisher' | 'admin' | 'worker';
  pages?: string;
  outcome: 'OK' | 'Partial' | 'Failed' | 'Nothing to do';
  commit?: string;
  session?: string;
  details?: string;
}

export function logProps(e: LogEntry, now: Date): Record<string, Prop> {
  return {
    [L.run]: P.title(e.run),
    [L.when]: P.date(e.when ?? now.toISOString()),
    [L.trigger]: P.select(e.trigger),
    [L.actor]: P.select(e.actor),
    [L.pages]: P.text(e.pages ?? ''),
    [L.outcome]: P.select(e.outcome),
    [L.commit]: P.url(e.commit),
    [L.session]: P.url(e.session),
    [L.details]: P.text(e.details ?? ''),
  };
}

/** A Suggestions page as plain fields (the admin queue, the routine's tools, the publisher). */
export interface SuggestionRow {
  id: string;
  url: string;
  created: string;
  status: Status | '';
  guide: string;
  kind: string;
  lang: string;
  sentBy: string;
  name: string;
  show: string;
  artists: string;
  start: string;
  end: string;
  hours: string;
  address: string;
  website: string;
  links: string[];
  description: string;
  pictures: { name: string; url: string }[];
  pictureCredit: string;
  rights: boolean;
  own: boolean;
  creditAs: string;
  reference: string;
  submission: string;
  fingerprint: string;
  duplicate: string;
  tier: string;
  showTo: string;
  notes: string;
  entry: string;
  webPictures: { name: string; url: string }[];
  result: string;
  run: string;
  itemId: string;
  commit: string;
  processed: string;
}

/**
 * A Suggestions page as a row. With `access`, a row sent under a guide's old
 * address (access.json "moved") reads as if it had always named the guide by
 * its address now, fingerprint included, so it still publishes and is still
 * found as a duplicate.
 */
export function readSuggestion(p: NotionPage, access?: GuideNames): SuggestionRow {
  const row = rowOf(p);
  const now = access ? currentSlug(access, row.guide) : null;
  if (!now || now === row.guide) return row;
  const fingerprint = row.fingerprint.startsWith(`${row.guide}|`) ? now + row.fingerprint.slice(row.guide.length) : row.fingerprint;
  return { ...row, guide: now, fingerprint };
}

/** A Notion filter for a guide's suggestions, under every name it has had (access.json "moved"). */
export function guideIs(access: GuideNames, slug: string): Record<string, unknown> {
  const names = slugNames(access, slug);
  const one = (n: string) => ({ property: S.guide, select: { equals: n } });
  return names.length === 1 ? one(slug) : { or: names.map(one) };
}

function rowOf(p: NotionPage): SuggestionRow {
  const d = R.date(p, S.dates);
  return {
    id: p.id,
    url: p.url ?? '',
    created: p.created_time ?? '',
    status: (STATUSES as readonly string[]).includes(R.select(p, S.status)) ? (R.select(p, S.status) as Status) : '',
    guide: R.select(p, S.guide),
    kind: R.select(p, S.kind).toLowerCase(),
    lang: R.select(p, S.lang),
    sentBy: R.select(p, S.sentBy),
    name: R.title(p, S.name),
    show: R.text(p, S.show),
    artists: R.text(p, S.artists),
    start: d.start.slice(0, 10),
    end: (d.end || d.start).slice(0, 10),
    hours: R.text(p, S.hours),
    address: R.text(p, S.address),
    website: R.url(p, S.website),
    links: R.text(p, S.links).split('\n').map((x) => x.trim()).filter(Boolean),
    description: R.text(p, S.description),
    pictures: R.files(p, S.picture).map(({ name, url }) => ({ name, url })),
    pictureCredit: R.text(p, S.pictureCredit),
    rights: R.checkbox(p, S.rights),
    own: R.checkbox(p, S.own),
    creditAs: R.text(p, S.creditAs),
    reference: R.text(p, S.reference),
    submission: R.text(p, S.submission),
    fingerprint: R.text(p, S.fingerprint),
    duplicate: R.text(p, S.duplicate),
    tier: R.select(p, S.tier) || 'C',
    showTo: R.select(p, S.showTo) || 'Everyone',
    notes: R.text(p, S.notes),
    entry: R.text(p, S.entry),
    webPictures: R.files(p, S.webPicture).map(({ name, url }) => ({ name, url })),
    result: R.text(p, S.result),
    run: R.text(p, S.run),
    itemId: R.text(p, S.itemId),
    commit: R.url(p, S.commit),
    processed: R.date(p, S.processed).start,
  };
}

/** A short reference people can quote: "S-" and four letters or digits that can't be mistaken (no 0/O, 1/I). */
export function newReference(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(4));
  return `S-${[...r].map((x) => A[x % 32]).join('')}`;
}

/** A filter for one select value. */
export const isStatus = (status: Status) => ({ property: S.status, select: { equals: status } });
