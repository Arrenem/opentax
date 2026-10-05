import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ignoredDirectories = new Set(['.git', 'node_modules', '.next', 'out', 'build', 'coverage']);
const privatePaths = [
  /^site(?:\/|$)/,
  /^content\/articles(?:\/|$)/,
  /^(?:marketing|articles|landing-page)(?:\/|$)/,
  /^scripts\/(?:build-site\.mjs$|site[^/]*(?:\/|$))/,
  /^scripts\/ci\/(?:pages-deploy\.test|prepare-site-release|verify-site-release)\.mjs$/,
  /^tools\/(?:editor|pages-deploy)(?:\/|$)/,
  /^docs\/(?:article-[^/]+|keystatic-local-editor|pages-deployment)\.md$/,
  /^\.github\/workflows\/deploy-pages\.ya?ml$/,
];
const privateReference = /(?:content[\\/]articles|scripts[\\/]build-site\.mjs|tools[\\/](?:editor|pages-deploy)|\barticleId\b)/;
const siteCommand = /(?:\bsite:|build-site\.mjs|wrangler\s+pages|tools[\\/](?:editor|pages-deploy))/i;

export function isPrivateSourcePath(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
  return privatePaths.some((pattern) => pattern.test(normalized));
}

export async function findPublicSourceViolations(root) {
  const violations = [];

  async function inspect(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relativePath = prefix + entry.name;
      if (isPrivateSourcePath(relativePath)) {
        violations.push(`Private marketing source is not allowed: ${relativePath}`);
        continue;
      }
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) await inspect(path.join(directory, entry.name), relativePath + '/');
        continue;
      }
      if (!entry.isFile()) continue;
      const isAppSource = /^(?:app|components|hooks|lib|packages|plugins|types)\//.test(relativePath)
        && /\.(?:[cm]?[jt]sx?|json)$/.test(relativePath)
        && !relativePath.includes('/dist/');
      const isWorkflow = /^\.github\/workflows\/[^/]+\.ya?ml$/.test(relativePath);
      const isPackage = /(?:^|\/)package(?:-lock)?\.json$/.test(relativePath);
      if (!isAppSource && !isWorkflow && !isPackage) continue;
      const text = await readFile(path.join(directory, entry.name), 'utf8');
      if (isAppSource && privateReference.test(text)) {
        violations.push(`Application source must not depend on marketing content: ${relativePath}`);
      }
      if (isWorkflow && /(?:wrangler|CLOUDFLARE_API_TOKEN|deploy-pages|\bsite:(?:build|check|test|deploy))/i.test(text)) {
        violations.push(`Marketing build/deployment workflow is not allowed: ${relativePath}`);
      }
      if (isPackage) {
        const pkg = JSON.parse(text);
        const manifests = relativePath.endsWith('package-lock.json')
          ? Object.values(pkg.packages ?? {})
          : [pkg];
        if (relativePath.endsWith('package-lock.json') && Object.keys(pkg.packages ?? {}).some((name) => /(?:^|\/)node_modules\/marked$/.test(name))) {
          violations.push(`Marketing-only dependency is not allowed: ${relativePath} (marked)`);
        }
        for (const manifest of manifests) {
          for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
            if (/^site(?::|$)/i.test(name) || siteCommand.test(command)) {
              violations.push(`Marketing npm script is not allowed: ${relativePath} (${name})`);
            }
          }
          if (['dependencies', 'devDependencies', 'optionalDependencies'].some((key) => Object.hasOwn(manifest[key] ?? {}, 'marked'))) {
            violations.push(`Marketing-only dependency is not allowed: ${relativePath} (marked)`);
          }
        }
      }
    }
  }

  await inspect(root);
  return [...new Set(violations)].sort();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const violations = await findPublicSourceViolations(root);
  if (violations.length) {
    console.error(violations.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Public source boundary passed: app, MCP and documentation are independent of marketing sources.');
  }
}
