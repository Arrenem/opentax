import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The application does not enable React Compiler. Keep the existing
      // data-fetching hooks while applying the non-Compiler React rules.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/immutability': 'off',
      // Evidence images use signed Storage URLs with arbitrary filenames.
      '@next/next/no-img-element': 'off',
    },
  },
  { files: ['**/*.test.ts'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'packages/opentax-mcp/dist/**', 'site/dist/**', '.wrangler/**']),
]);
