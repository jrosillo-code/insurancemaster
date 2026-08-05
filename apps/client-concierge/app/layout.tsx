import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Rosillo · Asistente',
  description:
    'Prototipo de asistente conversacional de Rosillo Hermanos. Datos sintéticos únicamente.',
  // A prototype holding synthetic personal data should never be indexed.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b5c8a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {/*
          The synthetic-data banner is part of the layout, not a dismissible
          component, so no route can render without it (blueprint §21 Milestone C).
        */}
        <div className="synthetic-banner" role="status">
          PROTOTIPO · DATOS SINTÉTICOS · Ningún dato real de clientes de Rosillo ·{' '}
          <a href="/limitaciones">Qué NO hace este prototipo</a>
        </div>
        <div className="shell">{children}</div>
      </body>
    </html>
  );
}
