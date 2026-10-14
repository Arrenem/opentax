// Transport-neutral pieces shared by the stdio adapter and the remote /api/mcp endpoint.
// Keep this file free of Node-only imports: it is bundled into the Next.js server too.

export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export interface OpenTaxApi {
  request(method: string, path: string, data?: unknown): Promise<unknown>;
  uploadEvidenceFile(file: Blob, name: string, metadata?: Record<string, string>): Promise<unknown>;
}

export function evidenceMimeType(name: string) {
  const lower = name.toLowerCase();
  return lower.endsWith('.pdf') ? 'application/pdf' : lower.endsWith('.jpg') || lower.endsWith('.jpeg') ? 'image/jpeg' :
    lower.endsWith('.png') ? 'image/png' : null;
}

export function evidenceForm(file: Blob, name: string, metadata: Record<string, string> = {}) {
  if (file.size === 0 || file.size > MAX_EVIDENCE_BYTES) throw new Error('Evidence must be 1 byte to 10 MB');
  const form = new FormData();
  form.append('file', file, name);
  for (const [key, value] of Object.entries(metadata)) if (value && key !== 'file_path') form.append(key, value);
  return form;
}

export async function readApiResponse(response: Response) {
  const body = await response.json().catch(() => ({ error: { code: 'INVALID_RESPONSE' } }));
  if (!response.ok) {
    const error = body?.error;
    throw new Error(JSON.stringify({ status: response.status, code: typeof error === 'object' ? error.code : error ?? 'API_ERROR',
      message: typeof error === 'object' ? error.message : error ?? 'API request failed' }));
  }
  return body;
}
