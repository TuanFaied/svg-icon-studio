import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'SVG Icon Studio',
  description: 'Draw pixel icons or convert images to clean SVG, entirely in your browser.',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#191c21' },
  ],
};

// Set the theme before paint to avoid a light flash in dark mode.
// Dark is the default; 'system' follows the OS, 'light' forces light.
const themeScript = `(function(){var d=true;try{var t=localStorage.getItem('sis.theme');d=t==='light'?false:t==='system'?matchMedia('(prefers-color-scheme: dark)').matches:true}catch(e){}document.documentElement.dataset.theme=d?'dark':'light'})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
