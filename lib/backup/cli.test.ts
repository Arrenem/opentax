import { describe, expect, it } from 'vitest';
import { parseOptions, assertArchiveSize, MAX_ARCHIVE_BYTES } from '../../scripts/backup/options';

describe('administrative backup CLI argument boundary', () => {
  it('uses the same bounded size for export and import', () => {
    expect(() => assertArchiveSize(MAX_ARCHIVE_BYTES)).not.toThrow();
    expect(() => assertArchiveSize(MAX_ARCHIVE_BYTES + 1)).toThrow();
    expect(() => assertArchiveSize(NaN)).toThrow();
  });
  it('defaults to offline plans and requires explicit identities', () => {
    expect(parseOptions(['export','--project','demo-source','--bucket','demo-source-evidence','--uid','owner','--archive','ledger.opentax-backup.json'])?.apply).toBe(false);
    expect(() => parseOptions(['export','--archive','ledger.json'])).toThrow();
    expect(() => parseOptions(['restore','--project','demo-target','--bucket','demo-target-evidence','--uid','../owner','--archive','ledger.json'])).toThrow();
  });
  it('validation cannot mutate or select an external target', () => {
    expect(parseOptions(['validate','--archive','ledger.json'])).toMatchObject({ mode:'validate',apply:false });
    expect(() => parseOptions(['validate','--archive','ledger.json','--apply'])).toThrow();
    expect(() => parseOptions(['validate','--archive','ledger.json','--project','demo-target'])).toThrow();
  });
  it('rejects unrecognized flags and modes rather than ignoring them', () => {
    expect(() => parseOptions(['restore','--yes'])).toThrow();
    expect(() => parseOptions(['delete','--archive','ledger.json'])).toThrow();
    expect(parseOptions(['--help'])).toBe(null);
  });
});
