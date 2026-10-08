// The Storylines section: each promotion's storylines on one timeline.
import { createStorylines } from './storylines.ts';
import { LEGEND, promotionTabs } from './ui.ts';
import { query, section, type AppContext, type AppView, type Params } from './views.ts';
import type { StorylineBundle } from './model.ts';

export function createStorylinesView(ctx: AppContext, bundle: StorylineBundle): AppView {
  const el = section(
    'storylines',
    `<div class="app-tools">
${promotionTabs(bundle.promotions, bundle.promotions[0].id, 'Storylines by promotion')}
<div class="filters">
<label data-brand-filter>Brand<select data-control="brand"><option value="all">All brands</option><option value="Raw">Raw</option><option value="SmackDown">SmackDown</option><option value="NXT">NXT</option><option value="AAA">AAA</option></select></label>
<label>Period<select data-control="period"><option value="all">Full history</option></select></label>
<label>Sort by start<select data-control="order"><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></label>
<label>Scale<select data-control="scale"><option value="overview">Overview</option><option value="months">Month by month</option></select></label>
</div>
</div>
<div class="app-key">${LEGEND}</div>
<div class="app-view" data-root="storylines"></div>`,
  );
  const control = <T extends HTMLElement>(name: string) => el.querySelector<T>(`[data-control="${name}"]`)!;
  let quiet = false;
  const storylines = createStorylines({
    model: ctx.model,
    bundle,
    root: el.querySelector<HTMLElement>('[data-root="storylines"]')!,
    controls: { tabs: el.querySelector<HTMLElement>('.promo-tabs')!, brand: control('brand'), period: control('period'), order: control('order'), scale: control('scale') },
    stickyHeight: ctx.stickyHeight,
    openMoment: (id) => ctx.go(`/${query({ moment: id })}`),
    openPerson: (id) => ctx.go(`/wrestlers/${id}/`),
    changed: () => {
      if (!quiet) ctx.changed();
    },
  });
  return {
    el,
    tab: '/storylines/',
    show: () => storylines.show(),
    hide: () => storylines.hidePreview(),
    apply: (p: Params) => {
      quiet = true;
      try {
        storylines.apply({ promotion: p.promotion, story: p.story, chapter: p.chapter, period: p.period });
      } finally {
        quiet = false;
      }
    },
    address: () => {
      const s = storylines.getState();
      return `${s.story ? `/storylines/${s.story}/` : '/storylines/'}${query({ promotion: s.promotion, chapter: s.chapter, period: s.period })}`;
    },
    subject: () => storylines.subject(),
  };
}
