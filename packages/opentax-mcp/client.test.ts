import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenTaxClient } from './client';
let folder = '';
afterEach(async () => { vi.unstubAllGlobals(); if (folder) await rm(folder, { recursive: true, force: true }); folder = ''; });
describe('OpenTax HTTPS client', () => {
  it('rejects non-HTTPS hosts and redirects', async () => {
    expect(() => new OpenTaxClient('http://example.com', 'otk_token')).toThrow('HTTPS');
    const fetchMock = vi.fn(async (url: URL, options: RequestInit) => {
      expect(url.hostname).toBe('opentax.test');
      expect(options.redirect).toBe('error');
      return Response.redirect('https://other.test/', 302);
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(new OpenTaxClient('https://opentax.test', 'otk_token').request('GET', '/api/settings')).rejects.toThrow();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
  });
  it('streams a regular evidence file with basename only', async () => {
    folder = await mkdtemp(join(tmpdir(), 'opentax-mcp-'));
    const file = join(folder, 'invoice.pdf');
    await writeFile(file, Buffer.from('%PDF-1.4'));
    const fetchMock = vi.fn(async (url: URL, options: RequestInit) => {
      expect(url.pathname).toBe('/api/documents');
      const form = options.body as FormData;
      const part = form.get('file') as File;
      expect(part.name).toBe('invoice.pdf');
      expect(part.type).toBe('application/pdf');
      expect(await part.text()).toBe('%PDF-1.4');
      expect(form.get('documentType')).toBe('invoice');
      expect(JSON.stringify(Array.from(form.entries()))).not.toContain(folder);
      return Response.json({ id: 'evidence-1' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await new OpenTaxClient('https://opentax.test', 'otk_token').uploadEvidence(file, { documentType: 'invoice' });
    expect(result).toEqual({ id: 'evidence-1' });
    expect(fetchMock).toHaveBeenCalledOnce();
    await symlink(file, join(folder, 'linked.pdf'));
    await expect(new OpenTaxClient('https://opentax.test', 'otk_token').uploadEvidence(join(folder, 'linked.pdf'))).rejects.toThrow('regular file');
    await writeFile(join(folder, 'data.csv'), 'a,b');
    await expect(new OpenTaxClient('https://opentax.test', 'otk_token').uploadEvidence(join(folder, 'data.csv'))).rejects.toThrow('Unsupported');
  });
});
