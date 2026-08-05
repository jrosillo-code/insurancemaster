import type { Metadata, Viewport } from 'next';
import { employeeDictionary } from '@rosillo/i18n';
import { locale } from '../lib/locale';
import './globals.css';

/** `lang` follows the toggle — it selects the screen-reader voice, not just a label. */
export async function generateMetadata(): Promise<Metadata> {
  const t = employeeDictionary(await locale());
  return {
    title: t['meta.title'],
    description: t['meta.description'],
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#dfe6ed' },
    { media: '(prefers-color-scheme: dark)', color: '#06090b' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const active = await locale();
  const t = employeeDictionary(active);
  return (
    <html lang={active}>
      <body>
        <div className="synthetic-banner" role="status">
          {t['banner.text']}
        </div>
        <div className="wrap">{children}</div>
      </body>
    </html>
  );
}
