export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireScope, apiErrorResponse } from '@/lib/auth/authenticateRequest';
import { searchProjects, getProject, createProject, updateProject, deleteProject } from '@/lib/domain/projects/service';
export async function GET(req: NextRequest) {
  try { const auth = await authenticateRequest(req); requireScope(auth, 'read');
    const q = new URL(req.url).searchParams;
    if (q.get('id')) return NextResponse.json({ project: await getProject(auth, q.get('id')!) });
    return NextResponse.json({ projects: await searchProjects(auth, { customerId: q.get('customerId') ?? undefined,
      status: q.get('status') ?? undefined, query: q.get('query') ?? undefined }) });
  } catch (e) { return apiErrorResponse(e); }
}
export async function POST(req: NextRequest) {
  try { const auth = await authenticateRequest(req); requireScope(auth, 'contacts:write');
    const result = await createProject(auth, await req.json());
    return NextResponse.json({ id: result.id, status: result.status }, { status: result.status === 'created' ? 201 : 200 });
  } catch (e) { return apiErrorResponse(e); }
}
export async function PATCH(req: NextRequest) {
  try { const auth = await authenticateRequest(req); requireScope(auth, 'contacts:write');
    const { projectId, updates } = await req.json(); await updateProject(auth, projectId, updates);
    return NextResponse.json({ success: true });
  } catch (e) { return apiErrorResponse(e); }
}
export async function DELETE(req: NextRequest) {
  try { const auth = await authenticateRequest(req); requireScope(auth, 'contacts:write');
    const { projectId } = await req.json(); await deleteProject(auth, projectId);
    return NextResponse.json({ success: true });
  } catch (e) { return apiErrorResponse(e); }
}
