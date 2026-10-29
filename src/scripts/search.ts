// Forgiving room search for the house map.
// - Finds rooms by project title, room name, floor ("attic", "2F", "阁楼"), inventory and what's inside.
// - Understands chapters: "ch. 3", "chapter 3", "#3", "第3章", or a bare "3". "ch." alone lists every chapter.
// - Ignores case, accents and punctuation; tolerates small typos ("kitchn", "attik") when nothing matches exactly.
// - Every word should match; if nothing matches all of them, rooms matching some of them are shown.

export interface SearchRoom {
  slug: string; floor: string; title: string; titleZh: string; zh: string; en: string;
  chapter: number; locked: boolean; where: string; more: string;
}

const norm = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const isHan = (s: string) => /\p{Script=Han}/u.test(s);
const STOP = new Set(['ch', 'chap', 'chapter', 'chapters', 'no', 'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'and', '第', '章']);

/** Edit distance, stopping early once it exceeds max. */
function within(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

interface Field { text: string; words: string[]; weight: number }

/** How well one query word matches one field: 0 = not at all. */
function scoreToken(tok: string, f: Field, fuzzy: boolean) {
  if (isHan(tok)) {
    if (f.text.includes(tok)) return 3;
    // Characters in any order, e.g. "阁楼层" vs "阁楼".
    return [...tok].every((c) => f.text.includes(c)) ? 1 : 0;
  }
  let best = 0;
  for (const w of f.words) {
    if (w === tok) return 3;
    if (w.startsWith(tok)) best = Math.max(best, 2);
    // Mid-word matches only in names, so "stairs" doesn't find every room tagged "upstairs".
    else if (tok.length >= 3 && f.weight >= 3 && w.includes(tok)) best = Math.max(best, 1.5);
    else if (fuzzy && tok.length >= 4 && /\D/.test(tok)) {
      const max = tok.length >= 7 ? 2 : 1;
      // Compare with the whole word and with its start, so a typo in a prefix still counts.
      if (within(tok, w, max) || (w.length > tok.length && within(tok, w.slice(0, tok.length), max))) best = Math.max(best, 1);
    }
  }
  return best;
}

export function searchRooms(rooms: SearchRoom[], query: string): SearchRoom[] {
  // Typos are only forgiven when the exact spelling finds nothing, so "roof" doesn't also find every "room".
  const exact = run(rooms, query, false);
  return exact.length ? exact : run(rooms, query, true);
}

function run(rooms: SearchRoom[], query: string, fuzzy: boolean): SearchRoom[] {
  let q = query.trim();
  if (!q) return [];
  // Chapter numbers in their usual spellings.
  let chapter: number | null = null;
  q = q.replace(/(?:\bch(?:ap(?:ter)?)?\.?\s*|#|第\s*)(\d+)\s*章?/i, (_, n) => { chapter = Number(n); return ' '; });
  const asked = /\bch(?:ap(?:ter)?s?)?\b|第|章/i.test(q);
  const tokens = norm(q).split(' ').filter((t) => t && !STOP.has(t));
  // A bare number is most likely a chapter.
  if (chapter === null && tokens.length === 1 && /^\d+$/.test(tokens[0])) chapter = Number(tokens.pop());

  if (!tokens.length) {
    if (chapter !== null) return rooms.filter((r) => r.chapter === chapter);
    return asked ? [...rooms].sort((a, b) => a.chapter - b.chapter) : [];
  }

  const scored = rooms
    .filter((r) => chapter === null || r.chapter === chapter)
    .map((r) => {
      const fields: Field[] = [
        [r.title, 4], [r.titleZh, 4], [r.en, 3], [r.zh, 3], [r.where, 2], [r.more, 1],
      ].map(([t, w]) => { const text = norm(t as string); return { text, words: text.split(' '), weight: w as number }; });
      let score = 0;
      let hits = 0;
      for (const tok of tokens) {
        const best = Math.max(...fields.map((f) => scoreToken(tok, f, fuzzy) * f.weight));
        if (best > 0) hits++;
        score += best;
      }
      return { r, score, hits };
    })
    .filter((x) => x.hits > 0);

  const all = scored.filter((x) => x.hits === tokens.length);
  return (all.length ? all : scored)
    .sort((a, b) => b.hits - a.hits || b.score - a.score || a.r.chapter - b.r.chapter)
    .map((x) => x.r);
}
