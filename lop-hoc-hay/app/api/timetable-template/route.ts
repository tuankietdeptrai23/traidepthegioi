import {timetableTemplateBase64} from '@/lib/timetable-template';
export function GET(){const bytes=Uint8Array.from(atob(timetableTemplateBase64),c=>c.charCodeAt(0));return new Response(bytes,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="Mau_thoi_khoa_bieu.xlsx"','Cache-Control':'public, max-age=3600'}})}
