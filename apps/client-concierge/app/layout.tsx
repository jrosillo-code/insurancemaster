import type { Metadata, Viewport } from 'next';
import { clientDictionary } from '@rosillo/i18n';
import { locale } from '../lib/locale';
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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e4eaf0' },
    { media: '(prefers-color-scheme: dark)', color: '#070a0c' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const active = await locale();
  const t = clientDictionary(active);
  return (
    <html lang={active}>
      <body>
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
