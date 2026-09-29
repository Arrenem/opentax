import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenTax — 個人事業主向け青色申告会計',
  description: '個人事業主のための青色申告・インボイス対応会計Webアプリ',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f5f5f7',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
