import {careAttendance,HttpError} from '@/lib/server';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{const u=new URL(req.url),id=u.searchParams.get('classId')||'',day=u.searchParams.get('date')||'';return Response.json({records:await careAttendance(id,day)},{headers:{'Cache-Control':'no-store'}})}catch(e){return Response.json({error:e instanceof HttpError?e.message:'Không tải được điểm danh.'},{status:e instanceof HttpError?e.status:500,headers:{'Cache-Control':'no-store'}})}}
