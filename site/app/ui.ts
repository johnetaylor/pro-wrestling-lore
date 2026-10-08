// Markup shared by the explorer views.

export const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6L2.5 9.3l6.6-.8z"/></svg>';
export const BELT = '<svg viewBox="0 0 24 14" aria-hidden="true"><rect x="1" y="4" width="22" height="6" rx="2"/><ellipse cx="12" cy="7" rx="5" ry="6"/></svg>';

/** The key to the timeline marks, used by Careers and Storylines. */
export const LEGEND = `<ul class="legend" aria-label="Key to the timeline">
<li><i class="key key-match" aria-hidden="true"></i>Match</li>
<li><i class="key key-title" aria-hidden="true"></i>Title match</li>
<li>${STAR.replace('<svg', '<svg class="key-star"')}Pay-per-view or premium live event</li>
<li><i class="key key-segment" aria-hidden="true"></i>Promo or appearance</li>
<li><i class="key key-involved" aria-hidden="true"></i>Involved, not competing</li>
<li><i class="key key-reign" aria-hidden="true"></i>Title reign</li>
</ul>`;

/** Promotion tabs for views that work one promotion at a time. */
export function promotionTabs(list: { id: string; name: string; color: string }[], current: string, label: string): string {
  return `<div class="promo-tabs" role="group" aria-label="${label}">${list
    .map((p) => `<button type="button" data-promotion="${p.id}" aria-pressed="${p.id === current}" style="--c:${p.color}">${p.name}</button>`)
    .join('')}</div>`;
}

/** Fit-to-width and actual-size buttons for a diagram, and the scale it is drawn at. */
export const ZOOM = '<div class="tree-zoom" role="group" aria-label="Diagram size"><button type="button" class="app-button" data-fit aria-pressed="true">Fit to width</button><button type="button" class="app-button" data-actual aria-pressed="false">Actual size</button><output class="tree-scale">100%</output></div>';

/**
 * Scales a fixed-size diagram to the width of its frame, or shows it at its own size with
 * sideways scrolling. Returns a function that redraws it at the current size.
 */
export function fitDiagram(frame: HTMLElement, canvas: HTMLElement, width: number, height: number, controls: HTMLElement): () => void {
  let fit = true;
  const stage = canvas.parentElement!;
  const draw = () => {
    const available = frame.clientWidth;
    if (!available) return;
    const scale = fit ? Math.min(1, available / width) : 1;
    canvas.style.transform = `scale(${scale})`;
    canvas.style.left = `${fit ? Math.max(0, (available - width * scale) / 2) : 0}px`;
    stage.style.width = fit ? '100%' : `${width}px`;
    stage.style.height = `${Math.ceil(height * scale)}px`;
    frame.classList.toggle('fit', fit);
    controls.querySelector('[data-fit]')!.setAttribute('aria-pressed', String(fit));
    controls.querySelector('[data-actual]')!.setAttribute('aria-pressed', String(!fit));
    controls.querySelector('.tree-scale')!.textContent = `${Math.round(scale * 100)}%`;
  };
  controls.querySelector('[data-fit]')!.addEventListener('click', () => {
    fit = true;
    draw();
    frame.scrollLeft = 0;
  });
  controls.querySelector('[data-actual]')!.addEventListener('click', () => {
    fit = false;
    draw();
  });
  new ResizeObserver(() => draw()).observe(frame);
  draw();
  return draw;
}
