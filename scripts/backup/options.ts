import { parseArgs } from 'node:util';

export interface BackupOptions {
  mode: 'export' | 'restore' | 'validate';
  archive: string;
  project?: string;
  bucket?: string;
  uid?: string;
  apply: boolean;
}
export function parseOptions(args: string[]): BackupOptions | null {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    help: { type: 'boolean' }, apply: { type: 'boolean' }, archive: { type: 'string' },
    project: { type: 'string' }, bucket: { type: 'string' }, uid: { type: 'string' },
  } });
  if (values.help) return null;
  if (positionals.length !== 1 || !['export', 'restore', 'validate'].includes(positionals[0])) throw new Error('COMMAND_REQUIRED');
  if (!values.archive) throw new Error('ARCHIVE_REQUIRED');
  const mode = positionals[0] as BackupOptions['mode'];
  if (mode === 'validate' && (values.apply || values.project || values.bucket || values.uid)) throw new Error('VALIDATE_IS_OFFLINE');
  if (mode !== 'validate') {
    if (!values.project || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(values.project)) throw new Error('PROJECT_REQUIRED');
    if (!values.bucket || !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(values.bucket)) throw new Error('BUCKET_REQUIRED');
    if (!values.uid || values.uid.length > 128 || /[\/\x00-\x20\x7f]/.test(values.uid) || ['.','..'].includes(values.uid)) throw new Error('UID_REQUIRED');
  }
  return { mode, archive: values.archive, project: values.project, bucket: values.bucket, uid: values.uid, apply: values.apply === true };
}

export const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
export function assertArchiveSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_ARCHIVE_BYTES) throw new Error('ARCHIVE_SIZE_LIMIT');
}
