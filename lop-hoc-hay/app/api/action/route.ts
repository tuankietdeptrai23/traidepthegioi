import { action, HttpError } from '@/lib/server';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
    try {
        const origin = req.headers.get('origin');
        if (!origin || origin !== new URL(req.url).origin)
            return Response.json({ error: 'Yêu cầu không hợp lệ' }, { status: 403 });
        if (!req.headers.get('content-type')?.includes('application/json'))
            return Response.json({ error: 'Chỉ nhận dữ liệu JSON' }, { status: 415 });
        const raw = await req.text();
        if (raw.length > 250000)
            return Response.json({ error: 'Dữ liệu quá lớn' }, { status: 413 });
        let data;
        try {
            data = JSON.parse(raw);
        }
        catch {
            return Response.json({ error: 'JSON không hợp lệ' }, { status: 400 });
        }
        if (!data || typeof data !== 'object' || Array.isArray(data)) return Response.json({error:'Dữ liệu không hợp lệ'},{status:400});
        return Response.json(await action(data), { headers: { 'Cache-Control': 'no-store' } });
    }
    catch (e) {
        console.error(e instanceof HttpError ? e.message : String(e));
        return Response.json({ error: e instanceof HttpError ? e.message : 'Không thể lưu. Kiểm tra dữ liệu và thử lại.' }, { status: e instanceof HttpError ? e.status : 500 });
    }
}
