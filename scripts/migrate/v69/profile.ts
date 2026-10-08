// Turns the v69 career-explorer HTML (Cody Rhodes, Hulk Hogan) into structured profile fields.
// The input is our own rendered snapshot with a fixed shape, so targeted patterns are enough.
import type { Associate, CareerProfile, LinkRef } from '../../lib/types.ts';
import { compact } from '../../lib/util.ts';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };

export function textOf(html: string | undefined): string {
  return String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ENTITIES[e])
    .replace(/\s+/g, ' ')
    .trim();
}

function linksIn(html: string): LinkRef[] {
  return [...html.matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({ label: textOf(m[2]), url: m[1].replace(/&amp;/g, '&') }));
}

function associates(html: string): Associate[] {
  return [...html.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(([, li]) => {
    const name = textOf(/<strong>([\s\S]*?)<\/strong>/.exec(li)?.[1]);
    const meta = textOf(/<span class="relationship-meta">([\s\S]*?)<\/span>/.exec(li)?.[1]);
    const note = [...li.matchAll(/<span(?: class="([^"]*)")?>([\s\S]*?)<\/span>/g)]
      .filter((s) => s[1] !== 'relationship-meta')
      .map((s) => textOf(s[2]))
      .join(' ');
    // Guest entries put the promotion first in the note: "WWF · WrestleMania I, 1985."
    const lead = !meta ? /^([A-Z][A-Za-z/ ]{1,15}) · (.+)$/.exec(note) : null;
    if (lead) return compact({ name, meta: lead[1], note: lead[2].charAt(0).toUpperCase() + lead[2].slice(1) }) as Associate;
    return compact({ name, meta: meta || undefined, note: note || undefined }) as Associate;
  });
}

export function parseLegacyProfile(biography?: string, details?: string): CareerProfile | undefined {
  const out: CareerProfile = {};
  if (biography) {
    const paras = [...biography.matchAll(/<p class="([^"]*)">([\s\S]*?)<\/p>/g)].filter((p) => /career-summary/.test(p[1]));
    out.intro = paras[0] ? textOf(paras[0][2]) : undefined;
    out.inBrief = paras.slice(1).map((p) => textOf(p[2])).join('\n\n') || undefined;
  }
  if (details) {
    const main = details.split('<details')[0];
    for (const [, head, body] of main.matchAll(/<h3>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3>|$)/g)) {
      const h = textOf(head).toLowerCase();
      const plain = [...body.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((p) => textOf(p[1])).join(' ');
      const notes = [...body.matchAll(/<p class="profile-note">([\s\S]*?)<\/p>/g)].map((p) => p[1]);
      if (h.startsWith('trained')) out.trainedBy = compact({ text: plain, links: notes.flatMap(linksIn) });
      else if (h.startsWith('signature')) {
        const moves = [...(/<div class="signature-moves">([\s\S]*?)<\/div>/.exec(body)?.[1] ?? '').matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => textOf(m[1]));
        const note = notes.map((n) => textOf(n.split('<a ')[0])).filter(Boolean).join(' ');
        out.signatureMoves = compact({ moves, note: note || undefined, links: notes.flatMap(linksIn) });
      } else if (h.startsWith('managers')) out.associates = associates(body);
    }
    for (const [, summary, body] of details.matchAll(/<details[^>]*>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)) {
      if (/cornermen/i.test(summary)) out.guestCornermen = associates(body);
      else if (/sources/i.test(summary)) out.links = linksIn(body);
    }
  }
  const result = compact(out);
  return Object.keys(result).length ? result : undefined;
}
