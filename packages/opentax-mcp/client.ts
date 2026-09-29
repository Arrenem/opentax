import { basename } from 'node:path';
import { lstat } from 'node:fs/promises';
import { openAsBlob } from 'node:fs';
import { evidenceForm, evidenceMimeType, MAX_EVIDENCE_BYTES, readApiResponse, type OpenTaxApi } from './api';

export class OpenTaxClient implements OpenTaxApi {
  private base: string;
  constructor(baseUrl = process.env.OPENTAX_BASE_URL, private token = process.env.OPENTAX_AGENT_TOKEN ?? '') {
    if (!baseUrl || !this.token) throw new Error('OPENTAX_BASE_URL and OPENTAX_AGENT_TOKEN are required');
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
      throw new Error('OPENTAX_BASE_URL must use HTTPS (HTTP is allowed for localhost)');
    }
    this.base = url.origin;
  }
  async request(method: string, path: string, data?: unknown) {
    if (!path.startsWith('/api/')) throw new Error('Invalid API path');
    const response = await fetch(new URL(path, this.base), {
      method, redirect: 'error',
      headers: { Authorization: `Bearer ${this.token}`, ...(data instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
      body: data === undefined ? undefined : data instanceof FormData ? data : JSON.stringify(data),
    });
    return readApiResponse(response);
  }
  async uploadEvidenceFile(file: Blob, name: string, metadata: Record<string, string> = {}) {
    return this.request('POST', '/api/documents', evidenceForm(file, name, metadata));
  }
  async uploadEvidence(filePath: string, metadata: Record<string, string> = {}) {
    const stats = await lstat(filePath);
    if (!stats.isFile()) throw new Error('Evidence must be a regular file');
    if (stats.size === 0 || stats.size > MAX_EVIDENCE_BYTES) throw new Error('Evidence must be 1 byte to 10 MB');
    const name = basename(filePath);
    const type = evidenceMimeType(name);
    if (!type) throw new Error('Unsupported evidence type');
    return this.uploadEvidenceFile(await openAsBlob(filePath, { type }), name, metadata);
  }
}
