// Field Guide suggestions: keep contact details only as long as promised.
// The daily cron deletes a guide's Contacts pages, and the "Credit as" names
// in its Suggestions, 90 days after the guide's last day (guide.json window),
// and a year after sending for a guide without dates. What the guide already
// published (a credited name in items.json) is public and stays in its history,
// as the wizard says before anyone sends.
import { slugNames } from '../src/lib/guides/address.ts';
import type { AccessFile } from '../src/lib/guides/types';
import type { GitHub } from './github.ts';
import { P, type Notion } from './notion.ts';
import { C, logProps, S } from './suggestions.ts';

export const KEEP_DAYS = 90;
export const KEEP_UNDATED_DAYS = 365;
const DAY = 86400000;

export interface PrivacyDeps {
  notion: Notion;
  db: { contacts: string; suggestions: string; log: string };
  gh: GitHub;
  access: AccessFile;
  now: () => number;
  log: (...args: unknown[]) => void;
}

export async function privacySweep(deps: PrivacyDeps): Promise<{ contacts: number; credits: number; guides: string[] }> {
  const out = { contacts: 0, credits: 0, guides: [] as string[] };
  for (const slug of Object.keys(deps.access.guides).filter((s) => !s.startsWith('_'))) {
    let end = '';
    try {
      const at = await deps.gh.file(`src/content/guides/${slug}/guide.json`);
      end = (at ? (JSON.parse(at.text) as { window?: { end?: string } }).window?.end : '') ?? '';
    } catch (e) {
      deps.log('privacy: could not read guide.json', slug, (e as Error).message);
      continue; // don't guess: try again tomorrow
    }
    // Pages sent under the guide's old addresses (access.json "moved") keep their old name in Notion.
    const names = slugNames(deps.access, slug);
    const isGuide = (property: string) => (names.length === 1 ? { property, select: { equals: slug } } : { or: names.map((n) => ({ property, select: { equals: n } })) });
    const contactFilter = end
      ? Date.parse(`${end}T00:00:00Z`) + (KEEP_DAYS + 1) * DAY <= deps.now()
        ? isGuide(C.guide)
        : null
      : { and: [isGuide(C.guide), { timestamp: 'created_time', created_time: { before: new Date(deps.now() - KEEP_UNDATED_DAYS * DAY).toISOString() } }] };
    if (!contactFilter) continue;
    const contacts = await deps.notion.queryAll(deps.db.contacts, { filter: contactFilter }, 1000);
    for (const p of contacts) await deps.notion.trashPage(p.id);
    let credits = 0;
    if (end) {
      const credited = await deps.notion.queryAll(deps.db.suggestions, { filter: { and: [isGuide(S.guide), { property: S.creditAs, rich_text: { is_not_empty: true } }] } }, 1000);
      for (const p of credited) await deps.notion.updatePage(p.id, { [S.creditAs]: P.text('') });
      credits = credited.length;
    }
    if (contacts.length || credits) {
      out.contacts += contacts.length;
      out.credits += credits;
      out.guides.push(slug);
      try {
        await deps.notion.createPage(deps.db.log, logProps({ run: `Privacy: ${slug}`, trigger: 'scheduled', actor: 'worker', outcome: 'OK', details: `Deleted ${contacts.length} contact pages and cleared ${credits} credit names (${end ? `${KEEP_DAYS} days after ${end}` : `older than ${KEEP_UNDATED_DAYS} days`}).` }, new Date(deps.now())));
      } catch (e) {
        deps.log('privacy: could not write the log', (e as Error).message);
      }
    }
  }
  return out;
}
