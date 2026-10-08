// Search: suggestions under every search box, and the full list on /search/.
// The index loads on first use. Entries: [kind, name, url, detail, weight, aliases].
(() => {
  type Entry = [string, string, string, string, number, string?];
  interface Ready {
    entry: Entry;
    name: string;
    words: string[];
    alias: string[];
    detail: string[];
  }

  const KIND: Record<string, string> = { w: 'Wrestler', s: 'Show', e: 'Event', t: 'Championship', p: 'Promotion', y: 'Storyline' };
  // Wrestlers first, then championships, promotions and shows; storylines only when nothing
  // better matches as well.
  const KIND_BONUS: Record<string, number> = { w: 140, p: 120, t: 100, s: 100, e: 50, y: -60 };
  const indexUrl = document.querySelector<HTMLMetaElement>('meta[name="search-index"]')?.content;
  let loading: Promise<Ready[]> | null = null;

  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  function load(): Promise<Ready[]> {
    if (!indexUrl) return Promise.resolve([]);
    loading ??= fetch(indexUrl)
      .then((r) => r.json())
      .then((data: { items: Entry[] }) =>
        data.items.map((entry) => {
          const name = norm(entry[1]);
          return { entry, name, words: name.split(' '), alias: entry[5] ? entry[5].split('|').map(norm) : [], detail: norm(entry[3]).split(' ') };
        }),
      )
      .catch(() => {
        loading = null;
        return [];
      });
    return loading;
  }

  const hasPrefix = (words: string[], token: string) => words.some((w) => w.startsWith(token));

  function score(item: Ready, q: string, tokens: string[]): number {
    let s = 0;
    if (item.name === q) s += 1000;
    else if (item.alias.some((a) => a === q)) s += 800;
    else if (tokens.length === 1 && item.words.includes(q)) s += 450;
    else if (tokens.length === 1 && item.alias.some((a) => a.split(' ').includes(q))) s += 420;
    else if (item.name.startsWith(q)) s += 400;
    else if (tokens.length === 1 && hasPrefix(item.words, q)) s += 300;
    else if (item.alias.some((a) => a.startsWith(q))) s += 250;
    for (const t of tokens) {
      if (hasPrefix(item.words, t)) s += 60;
      else if (item.alias.some((a) => hasPrefix(a.split(' '), t))) s += 40;
      else if (hasPrefix(item.detail, t)) s += 15;
      else if (t.length > 2 && item.name.includes(t)) s += 10;
      else return 0;
    }
    return s + Math.log10(1 + item.entry[4]) * 25 + (KIND_BONUS[item.entry[0]] ?? 0);
  }

  async function search(query: string, limit: number): Promise<Entry[]> {
    const q = norm(query);
    if (!q) return [];
    const tokens = q.split(' ');
    const items = await load();
    const hits: [number, Entry][] = [];
    for (const item of items) {
      const s = score(item, q, tokens);
      if (s > 0) hits.push([s, item.entry]);
    }
    hits.sort((a, b) => b[0] - a[0] || a[1][1].localeCompare(b[1][1]));
    return hits.slice(0, limit).map((h) => h[1]);
  }

  function option(entry: Entry, id: string): HTMLLIElement {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.id = id;
    const a = document.createElement('a');
    a.href = entry[2];
    a.tabIndex = -1;
    const name = document.createElement('strong');
    name.textContent = entry[1];
    const meta = document.createElement('span');
    meta.textContent = [KIND[entry[0]], entry[3]].filter(Boolean).join(', ');
    a.append(name, meta);
    li.append(a);
    return li;
  }

  for (const form of document.querySelectorAll<HTMLFormElement>('form[data-search]')) {
    const input = form.querySelector('input')!;
    const list = form.querySelector<HTMLUListElement>('.search__results')!;
    let active = -1;
    let results: Entry[] = [];
    let seq = 0;

    const close = () => {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      active = -1;
    };
    const highlight = (i: number) => {
      const items = list.querySelectorAll('li');
      items.forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
      active = i;
      if (i >= 0) input.setAttribute('aria-activedescendant', items[i].id);
      else input.removeAttribute('aria-activedescendant');
    };
    const render = async () => {
      const mine = ++seq;
      const found = await search(input.value, 8);
      if (mine !== seq) return;
      results = found;
      list.replaceChildren(...found.map((e, i) => option(e, `${list.id}-${i}`)));
      if (!found.length && input.value.trim()) {
        const li = document.createElement('li');
        li.className = 'search__empty';
        li.textContent = 'No matches. Press Enter to search everything.';
        list.append(li);
      }
      const open = !!input.value.trim();
      list.hidden = !open;
      input.setAttribute('aria-expanded', String(open));
      highlight(-1);
    };

    input.addEventListener('focus', () => void load(), { once: true });
    input.addEventListener('input', () => void render());
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowDown' && results.length) {
        ev.preventDefault();
        highlight(Math.min(results.length - 1, active + 1));
      } else if (ev.key === 'ArrowUp' && results.length) {
        ev.preventDefault();
        highlight(Math.max(-1, active - 1));
      } else if (ev.key === 'Escape') close();
    });
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const target = active >= 0 ? results[active] : results.length && norm(results[0][1]) === norm(input.value) ? results[0] : null;
      location.href = target ? target[2] : `/search/?q=${encodeURIComponent(input.value.trim())}`;
    });
    document.addEventListener('click', (ev) => {
      if (!form.contains(ev.target as Node)) close();
    });
  }

  // The full results page.
  const page = document.getElementById('search-page-results');
  if (page) {
    const q = new URLSearchParams(location.search).get('q') ?? '';
    const box = document.querySelector<HTMLInputElement>('#page-search');
    if (box) box.value = q;
    if (q)
      void search(q, 100).then((found) => {
        const h = document.createElement('p');
        h.className = 'lede';
        h.textContent = found.length ? `${found.length === 100 ? 'Top 100' : found.length} ${found.length === 1 ? 'result' : 'results'} for “${q}”.` : `Nothing matches “${q}”. Try a ring name, a show or a championship.`;
        const ul = document.createElement('ul');
        ul.className = 'link-list';
        for (const e of found) {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = e[2];
          a.textContent = e[1];
          const meta = document.createElement('span');
          meta.className = 'quiet';
          meta.textContent = [KIND[e[0]], e[3]].filter(Boolean).join(', ');
          li.append(a, meta);
          ul.append(li);
        }
        page.replaceChildren(h, ul);
      });
  }
})();
