import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { findPublicSourceViolations, isPrivateSourcePath } from './check-public-source-boundary.mjs';

const privateFiles = [
  'site/index.html', 'site/article-assets/image.png', 'content/articles/example.md',
  'marketing/index.html', 'articles/example.md', 'landing-page/index.html',
  'scripts/build-site.mjs', 'scripts/site-content.test.mjs', 'scripts/site/examples.test.mjs',
  'scripts/ci/pages-deploy.test.mjs', 'scripts/ci/prepare-site-release.mjs',
  'scripts/ci/verify-site-release.mjs', 'tools/editor/package.json',
  'tools/pages-deploy/package-lock.json', 'docs/article-publishing.md',
  'docs/article-publication-2026-10-05.md', 'docs/keystatic-local-editor.md',
  'docs/pages-deployment.md', '.github/workflows/deploy-pages.yml',
];

test('rejects marketing paths, including normalized case and Windows separators', () => {
  for (const file of privateFiles) assert.equal(isPrivateSourcePath(file), true, file);
  assert.equal(isPrivateSourcePath('./SITE\\index.html'), true);
});

test('allows app, MCP, app documentation and boundary checks', () => {
  for (const file of [
    'app/page.tsx', 'lib/accounting/aggregationFixtures.ts', 'packages/opentax-mcp/src/server.ts',
    'docs/architecture.md', 'docs/self-hosting.md', 'docs/mcp.md', 'docs/tax-rule-sources.md',
    'docs/public-source-boundary.md', 'README.md', 'LICENSE',
    'scripts/ci/check-public-source-boundary.mjs', '.github/workflows/app-ci.yml',
  ]) assert.equal(isPrivateSourcePath(file), false, file);
});

async function fixture(t, files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'opentax-source-boundary-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    const destination = path.join(root, name);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
  return root;
}

test('detects private directories before traversing or importing them', async (t) => {
  const root = await fixture(t, { 'site/index.html': '<html>private</html>', 'content/articles/case.md': 'private' });
  assert.equal((await findPublicSourceViolations(root)).length, 2);
});

test('detects private content imports in app tests', async (t) => {
  const root = await fixture(t, { 'lib/accounting/example.test.ts': "readFileSync('content/articles/examples.json')" });
  assert.match((await findPublicSourceViolations(root)).join('\n'), /must not depend on marketing content/);
});

test('rejects marketing commands and dependencies even under neutral filenames', async (t) => {
  const root = await fixture(t, {
    'package.json': JSON.stringify({ scripts: { release: 'wrangler pages deploy dist' }, devDependencies: { marked: '^18.0.14' } }),
    'package-lock.json': JSON.stringify({ packages: { '': {}, 'node_modules/marked': { version: '18.0.14' } } }),
    '.github/workflows/release.yml': 'steps:\n  - run: npm run site:build\n',
  });
  const violations = await findPublicSourceViolations(root);
  assert.equal(violations.length, 4);
});

test('accepts an independent app tree and ignores installed/generated code', async (t) => {
  const root = await fixture(t, {
    'package.json': JSON.stringify({ scripts: { test: 'vitest run' } }),
    'package-lock.json': JSON.stringify({ packages: { '': { dependencies: { next: '^16.3.6' } } } }),
    'lib/accounting/aggregationFixtures.ts': 'export const amounts = [2000, 3000];',
    '.github/workflows/app-ci.yml': 'permissions:\n  contents: read\n',
    'docs/self-hosting.md': '# Self-hosting',
    'node_modules/example/index.js': "'content/articles/ignored.json'",
    '.next/server/index.js': "'content/articles/ignored.json'",
  });
  assert.deepEqual(await findPublicSourceViolations(root), []);
});
