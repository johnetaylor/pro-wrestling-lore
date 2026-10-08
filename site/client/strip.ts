// Career strips: a tooltip for every mark, and a click on a match dot opens that match.
(() => {
  const strips = document.querySelectorAll<SVGSVGElement>('.strip svg');
  if (!strips.length) return;
  const tip = document.createElement('div');
  tip.className = 'strip-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.append(tip);

  for (const svg of strips) {
    // Move native <title> tooltips into data attributes so only ours shows.
    for (const t of svg.querySelectorAll('title')) {
      t.parentElement?.setAttribute('data-tip', t.textContent ?? '');
      t.remove();
    }
    svg.addEventListener('pointermove', (ev) => {
      const el = (ev.target as Element).closest('[data-tip]');
      if (!el || ev.pointerType === 'touch') {
        tip.hidden = true;
        return;
      }
      tip.textContent = el.getAttribute('data-tip');
      tip.hidden = false;
      const pad = 14;
      const w = tip.offsetWidth;
      const x = Math.min(window.innerWidth - w - 8, ev.clientX + pad);
      tip.style.transform = `translate(${Math.max(8, x)}px, ${ev.clientY + pad}px)`;
    });
    svg.addEventListener('pointerleave', () => {
      tip.hidden = true;
    });
    svg.addEventListener('click', (ev) => {
      const el = (ev.target as Element).closest('[data-href]');
      if (el) location.href = el.getAttribute('data-href')!;
    });
  }
})();
