import type { Metadata, Viewport } from 'next';
import { clientDictionary } from '@rosillo/i18n';
import { locale } from '../lib/locale';
import { Mesh } from '@rosillo/brand';
// Tokens, fonts and primitives first; this app's layout overrides them.
import '@rosillo/brand/theme.css';
import './globals.css';

/**
 * `lang` on <html> follows the toggle. It is not decoration: it selects the voice a
 * screen reader uses and the dictionary a browser hyphenates with, so leaving it at
 * `es` on an English page makes the page actively worse for the people who most need
 * it to be right.
 *
 * Metadata is generated per request for the same reason — the browser tab and the
 * share card should not be in the other language from the page.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = clientDictionary(await locale());
  return {
    title: t['meta.title'],
    description: t['meta.description'],
    // A prototype holding synthetic personal data should never be indexed.
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // One colour: the theme is dark at every system setting, so offering a light
  // one would tint the browser chrome a shade the page never uses.
  themeColor: '#14120f',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const active = await locale();
  const t = clientDictionary(active);
  return (
    <html lang={active}>
      <body>
        {/* The field, behind everything. Falls back to the CSS gradient on .mesh
            when WebGL is unavailable or reduced motion is asked for. */}
        <Mesh />
        <a className="skip-link" href="#conversacion">
          {t['skip.toConversation']}
        </a>
        {/*
          The synthetic-data banner is part of the layout, not a dismissible
          component, so no route can render without it (blueprint §21 Milestone C).
        */}
        <div className="synthetic-banner" role="status">
          {t['banner.text']} · <a href="/limitaciones">{t['banner.link']}</a>
        </div>
        <div className="shell">{children}</div>
      </body>
    </html>
  );
}
