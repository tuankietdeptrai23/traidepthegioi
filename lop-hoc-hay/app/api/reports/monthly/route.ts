import {settings} from '@/db/schema';
import {eq} from 'drizzle-orm';
import {careKey} from '@/lib/student-care';
import {state,identity,HttpError} from '@/lib/server';
import {periodFromKey} from '@/lib/academic-calendar';
import {monthlyConductSheets} from '@/lib/monthly-conduct-report';
import {buildReportWorkbook} from '@/lib/report-excel';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{const u=new URL(req.url),classId=u.searchParams.get('classId'),cycle=u.searchParams.get('cycle')||'';if(!classId||cycle.length>80)return Response.json({error:'Chọn lớp và tháng học.'},{status:400});const result=await state(classId),d=result.detail;if(!d?.teacher)return Response.json({error:'Chỉ GV hoặc admin được xuất hồ sơ rèn luyện tháng cả lớp.'},{status:403});const p=periodFromKey(cycle,d.config);if(!p?.academic)return Response.json({error:'Thiết lập tuần học và chọn tháng học gồm 4 tuần.'},{status:400});const {db}=await identity(),closed=await db.select().from(settings).where(eq(settings.key,careKey(classId,'month-close',cycle))).get();const record=closed?JSON.parse(closed.value):null;const bytes=buildReportWorkbook(record?.status==='locked'&&record.snapshot?.sheets?record.snapshot.sheets:monthlyConductSheets(d,cycle));return new Response(new Uint8Array(bytes).buffer,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="Ren_luyen_thang_hoc_'+p.number+'_'+p.yearStart+'.xlsx"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}catch(e){return Response.json({error:e instanceof HttpError?e.message:'Không thể xuất báo cáo tháng học.'},{status:e instanceof HttpError?e.status:500,headers:{'Cache-Control':'no-store'}})}}
