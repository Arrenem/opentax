export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireScope, apiErrorResponse } from '@/lib/auth/authenticateRequest';
import { searchCustomers, createCustomer, updateCustomer, deleteCustomer } from '@/lib/domain/customers/service';
export async function GET(req: NextRequest) {
  try { const auth = await authenticateRequest(req); requireScope(auth, 'read');
    return NextResponse.json({ customers: await searchCustomers(auth, new URL(req.url).searchParams.get('query') ?? '') });
  } catch (e) { return apiErrorResponse(e); }
}
export async function POST(req: NextRequest) {
  try { const auth = await authenticateRequest(req); requireScope(auth, 'contacts:write');
    const result = await createCustomer(auth, await req.json());
    return NextResponse.json({ id: result.id, status: result.status }, { status: result.status === 'created' ? 201 : 200 });
  } catch (e) { return apiErrorResponse(e); }
}
export async function PATCH(req: NextRequest) {
  try { const auth = await authenticateRequest(req); requireScope(auth, 'contacts:write');
    const { customerId, updates } = await req.json(); await updateCustomer(auth, customerId, updates);
    return NextResponse.json({ success: true });
  } catch (e) { return apiErrorResponse(e); }
}
export async function DELETE(req: NextRequest) {
  try { const auth = await authenticateRequest(req); requireScope(auth, 'contacts:write');
    const { customerId } = await req.json(); await deleteCustomer(auth, customerId);
    return NextResponse.json({ success: true });
  } catch (e) { return apiErrorResponse(e); }
}
