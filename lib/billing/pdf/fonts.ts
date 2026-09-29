'use client';

import { Font } from '@react-pdf/renderer';

let registered = false;

export function registerBillingPdfFonts() {
  if (registered || typeof window === 'undefined') return;
  const origin = window.location.origin;
  Font.register({
    family: 'NotoSansJP',
    fonts: [
      { src: `${origin}/fonts/NotoSansJP-Regular.ttf`, fontWeight: 400 },
      { src: `${origin}/fonts/NotoSansJP-Bold.ttf`, fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
