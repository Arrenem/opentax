export const dynamic = 'force-dynamic';
export const maxDuration = 60;
import type { NextRequest } from 'next/server';
import { handleMcpRequest } from '@/lib/mcp/handler';
import { preflight } from '@/lib/mcp/oauthHttp';

export const GET = (req: NextRequest) => handleMcpRequest(req);
export const POST = (req: NextRequest) => handleMcpRequest(req);
export const DELETE = (req: NextRequest) => handleMcpRequest(req);
export const OPTIONS = preflight;
