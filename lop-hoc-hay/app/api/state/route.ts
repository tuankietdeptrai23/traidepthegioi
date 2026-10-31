import { state, HttpError } from '@/lib/server';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) { try {
    return Response.json(await state(new URL(req.url).searchParams.get('classId') || undefined), { headers: { 'Cache-Control': 'no-store' } });
}
catch (e) {
    if (!(e instanceof HttpError)) console.error('Class state load failed', e instanceof Error?e.message:String(e), e instanceof Error&&e.cause instanceof Error?e.cause.message:'');
    return Response.json({ error: e instanceof HttpError ? e.message : 'Không thể tải dữ liệu. Vui lòng thử lại.' }, { status: e instanceof HttpError ? e.status : 500, headers: { 'Cache-Control': 'no-store' } });
} }
