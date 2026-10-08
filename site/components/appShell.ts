// The explorer's page shell: the container the app mounts into, and the static version of the
// page for readers and crawlers that don't run scripts. The app opens the view the page's own
// address names (data-path); site/app/main.ts does the rest.
import { html, type Raw } from '../lib/html.ts';

export interface AppShellOptions {
  /** The page's address, e.g. /wrestlers/hulk-hogan/. */
  path: string;
  /** Root-absolute folder of the data bundles, ending in a slash. */
  data: string;
  /** Document title for the plain timeline, restored when a focus is cleared. */
  homeTitle: string;
  /** Static content shown when the app can't run. */
  fallback: Raw;
}

export function appShell(o: AppShellOptions): Raw {
  return html`<div class="app" id="app" data-data="${o.data}" data-path="${o.path}" data-home-title="${o.homeTitle}">
<p class="app-status" data-status role="status">Loading the explorer…</p>
</div>
<div class="app-fallback" data-fallback>
${o.fallback}
</div>`;
}
