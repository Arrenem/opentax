#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { OpenTaxClient } from './client';
import { createServer as createToolServer } from './tools';

export function createServer(client = new OpenTaxClient()) {
  return createToolServer(client, { uploadEvidenceFromPath: (path, metadata) => client.uploadEvidence(path, metadata) });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void serveStdio(() => createServer());
}
