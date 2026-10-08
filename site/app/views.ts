// What every explorer view gives the app, and what the app gives every view.
import type { Model } from './model.ts';

/** Parameters read from an address: path parts and query values, by name. */
export type Params = Record<string, string | undefined>;

export type ViewName = 'careers' | 'storylines' | 'shows' | 'titles' | 'calendar' | 'dynasties';

export interface AppContext {
  model: Model;
  /** Height of the active view's tools while they stick to the top of the window. */
  stickyHeight(): number;
  /** Opens a modal dialog with this markup (its heading should have id="dialog-title"). */
  dialog(html: string): void;
  /** A view's state settled: the app updates the address and the document title. */
  changed(): void;
  /** Opens an app address in place, as a new history entry. */
  go(address: string): void;
}

export interface AppView {
  /** The view's section: its tools and its content. */
  el: HTMLElement;
  /** The section tab this view belongs to, by path. */
  tab: string;
  /** The view became visible: repaint anything that changed while it was hidden. */
  show(): void;
  /** The view is being hidden: close previews and popovers. */
  hide(): void;
  /** Puts the view into the state an address describes. */
  apply(params: Params): void | Promise<void>;
  /** The address of the current state. */
  address(): string;
  /** What the page is about right now, for the document title; null for the view's default. */
  subject(): string | null;
}

/** Builds a query string from the values that are set. */
export function query(values: Params): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** A section element with the given markup, hidden until the app shows it. */
export function section(name: ViewName, html: string): HTMLElement {
  const el = document.createElement('section');
  el.className = 'app-section';
  el.dataset.section = name;
  el.hidden = true;
  el.innerHTML = html;
  return el;
}
