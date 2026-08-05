import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Rosillo · Espacio del empleado',
  description: 'Prototipo interno de revisión de tareas. Datos sintéticos únicamente.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eef0f1' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0f11' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <div className="synthetic-banner" role="status">
          PROTOTIPO INTERNO · DATOS SINTÉTICOS · Sin conexión a segElevia, correo ni aseguradoras ·
          Ninguna acción sale de Rosillo
        </div>
        <div className="wrap">{children}</div>
      </body>
    </html>
  );
}
