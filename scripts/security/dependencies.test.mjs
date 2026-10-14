import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const root = new URL('../../', import.meta.url);
const semver = require('semver');

// Check every installed copy in each lock, rather than only the hoisted package.
test('lockfiles exclude the remediated vulnerable dependency versions', () => {
  const requirements = {
    'package-lock.json': {
      next: '>=16.3.8', '@modelcontextprotocol/client': '>=2.2.0',
      '@fastify/busboy': '>=3.2.2', '@grpc/grpc-js': '>=1.13.6 <1.14.0 || >=1.14.5',
      'source-map-js': '>=1.2.2', 'postcss-selector-parser': '>=7.1.6',
    },
  };
  for (const [file, packages] of Object.entries(requirements)) {
    const lock = JSON.parse(readFileSync(new URL(file, root), 'utf8'));
    for (const [name, range] of Object.entries(packages)) {
      const copies = Object.entries(lock.packages).filter(([path]) => path.endsWith(`node_modules/${name}`));
      assert.ok(copies.length, `${name} must be represented in ${file}`);
      for (const [path, pkg] of copies) assert.ok(semver.satisfies(pkg.version, range), `${file}:${path} ${pkg.version} does not satisfy ${range}`);
    }
  }
});

test('indexed source maps reject hostile offsets without hanging and preserve ordinary maps', () => {
  const script = `
    const assert = require('node:assert/strict');
    const {SourceMapConsumer, SourceNode} = require('source-map-js');
    const inner = {version:3,sources:['original.js'],names:[],mappings:'AAAA',sourcesContent:['hello']};
    const indexed = (line, map=inner) => ({version:3,sections:[{offset:{line,column:0},map}]});
    for (const line of [Infinity, 1e12, NaN, -1, 0.5, '10']) assert.throws(() => new SourceMapConsumer(indexed(line)));
    assert.throws(() => new SourceMapConsumer(indexed(6000000,indexed(6000000))));
    assert.equal(SourceNode.fromStringWithSourceMap('hello',new SourceMapConsumer(indexed(0))).toString(),'hello');
  `;
  const result = spawnSync(process.execPath, ['-e', script], { cwd: root, encoding: 'utf8', timeout: 5000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test('patched selector parser retains Tailwind private helper and normal selector behavior', () => {
  const tailwindRequire = createRequire(require.resolve('tailwindcss/package.json'));
  const parser = tailwindRequire('postcss-selector-parser');
  assert.equal(typeof tailwindRequire('postcss-selector-parser/dist/util/unesc').default, 'function');
  const selector = '.hover\\:text-red-500:hover > a[data-id="example"]';
  assert.equal(parser().processSync(selector), selector);
  const flat = '.a'.repeat(30000);
  assert.equal(parser().processSync(flat), flat);
});

test('multipart parsing preserves ordinary names and rejects CR/LF parameter injection', async () => {
  const Busboy = require('@fastify/busboy');
  async function parse(name) {
    const fields = [];
    const parser = new Busboy({ headers: { 'content-type': 'multipart/form-data; boundary=security-test' } });
    parser.on('field', (name, value) => fields.push({ name, value }));
    const completed = new Promise((resolve, reject) => { parser.on('finish', resolve); parser.on('error', reject); });
    parser.end(`--security-test\r\nContent-Disposition: form-data; name="${name}"\r\n\r\nhello\r\n--security-test--\r\n`);
    await completed;
    return fields;
  }
  assert.deepEqual(await parse('ordinary'), [{ name: 'ordinary', value: 'hello' }]);
  for (const name of ['bad\rname', 'bad\nname']) assert.deepEqual(await parse(name), []);
});
