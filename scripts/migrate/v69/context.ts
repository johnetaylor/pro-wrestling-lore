// Shared state for the v69 migration: the snapshot, identity map, and the log.

export interface ReviewItem {
  kind: string;
  title: string;
  detail?: string;
  records?: string[];
  sources?: string[];
  decision?: string;
}

export class MigrationLog {
  notes: string[] = [];
  review: ReviewItem[] = [];
  counts: Record<string, number> = {};
  note(text: string): void {
    this.notes.push(text);
  }
  queue(item: ReviewItem): void {
    this.review.push(item);
  }
  count(key: string, n = 1): void {
    this.counts[key] = (this.counts[key] ?? 0) + n;
  }
}

export interface LegacyIdMaps {
  people: Record<string, string>; // legacy person id -> person id
  segments: Record<string, string>; // legacy moment / card id -> '<showId>#<key>'
  shows: Record<string, string>; // legacy show id -> show id
  reigns: Record<string, string>; // legacy reign id -> '<titleId>#<reignId>'
  storylines: Record<string, string>; // legacy story id -> storyline id
  chapters: Record<string, string>; // legacy story moment id -> '<storylineId>#<chapterId>'
  families: Record<string, string>;
  series: Record<string, string>; // legacy show family -> series id
}

export function emptyMaps(): LegacyIdMaps {
  return { people: {}, segments: {}, shows: {}, reigns: {}, storylines: {}, chapters: {}, families: {}, series: {} };
}
