export const dynamic = 'force-dynamic';
import type { NextRequest } from 'next/server';
import { oauthJson, preflight, protectedResourceMetadata, publicOrigin } from '@/lib/mcp/oauthHttp';

// Served at /.well-known/oauth-protected-resource[/api/mcp] through next.config.mjs rewrites.
export const GET = (req: NextRequest) => oauthJson(protectedResourceMetadata(publicOrigin(req)));
export const OPTIONS = preflight;
