export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireScope, requireUser, apiErrorResponse } from '@/lib/auth/authenticateRequest';
import { listAssets, createAsset, updateAsset, replaceAssets } from '@/lib/domain/assets/service';
import type { FixedAsset } from '@/types';
export async function GET(req: NextRequest) {
  try { const auth = await authenticateRequest(req); requireScope(auth, 'read');
    return NextResponse.json({ assets: await listAssets(auth) });
  } catch (e) { return apiErrorResponse(e); }
}
export async function POST(req: NextRequest) {
  try { const auth = await authenticateRequest(req); requireScope(auth, 'assets:write');
    const result = await createAsset(auth, await req.json());
    return NextResponse.json(result, { status: result.status === 'created' ? 201 : 200 });
  } catch (e) { return apiErrorResponse(e); }
}
export async function PATCH(req: NextRequest) {
  try { const auth = await authenticateRequest(req); requireScope(auth, 'assets:write');
    const { assetId, updates } = await req.json(); await updateAsset(auth, assetId, updates);
    return NextResponse.json({ success: true });
  } catch (e) { return apiErrorResponse(e); }
}
export async function PUT(req: NextRequest) {
  try { const auth = await authenticateRequest(req); requireUser(auth);
    const body = await req.json() as { assets: FixedAsset[] };
    return NextResponse.json({ assets: await replaceAssets(auth, body.assets) });
  } catch (e) { return apiErrorResponse(e); }
}
