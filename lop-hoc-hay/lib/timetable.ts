export type TimetableDay={weekday:number;subjects:string[];morning?:string[];afternoon?:string[]};
export type SchoolSession='morning'|'afternoon';
export const sessionLabels={morning:'Sáng',afternoon:'Chiều'};
export function sessionsOf(day:TimetableDay):{morning:string[];afternoon:string[]}{
 if(day.morning!==undefined||day.afternoon!==undefined)return {morning:day.morning||[],afternoon:day.afternoon||[]};
 // Legacy daily timetables remain active. Never shift blank periods or discard extra old periods.
 return {morning:day.subjects.length?day.subjects.slice(0,5):Array(5).fill(''),afternoon:day.subjects.length>5?day.subjects.slice(5):[]};
}
export function schoolSessions(day:TimetableDay):SchoolSession[]{const s=sessionsOf(day);return (['morning','afternoon'] as const).filter(k=>s[k].length>0)}
export function dutySession(source:string):string{return / · Buổi chiều$/.test(source)?'Chiều':/ · Buổi sáng$/.test(source)?'Sáng':'Lịch cũ / cả ngày'}
const norm=(s:unknown)=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().replace(/[^a-z0-9]/g,'');
export function timetableFromGrid(grid:string[][]):TimetableDay[]{
 const header=grid.findIndex(row=>row.some(c=>norm(c)==='thu')&&row.some(c=>norm(c)==='buoi'));
 if(header<0)throw Error('Không thấy hàng tiêu đề Thứ, Buổi, Tiết 1–5. Hãy dùng file mẫu.');
 const cols=grid[header].map(norm),dc=cols.indexOf('thu'),sc=cols.indexOf('buoi');
 if(cols.some(c=>/^tiet(?:[6-9]|\d{2,})$/.test(c)))throw Error('Mỗi buổi chỉ có tối đa 5 tiết.');
 const periods=[1,2,3,4,5].map(n=>cols.indexOf('tiet'+n));if(periods.some(i=>i<0))throw Error('Cần đủ cột Tiết 1 đến Tiết 5.');
 const names=['hai','ba','tu','nam','sau','bay'];const seen=new Set<string>(),days=new Map<number,TimetableDay>();
 for(let i=header+1;i<grid.length;i++){
  const row=grid[i];if(!row.some(c=>String(c||'').trim()))continue;
  const raw=norm(row[dc]);const weekday=/^(?:thu)?[2-7]$/.test(raw)?Number(raw.replace('thu',''))-1:names.findIndex(n=>raw==='thu'+n)+1;
  if(weekday<1||weekday>6){if(periods.some(c=>String(row[c]||'').trim()))throw Error('Dòng '+(i+1)+': Thứ phải từ 2 đến 7.');continue}
  const session=norm(row[sc])==='sang'?'morning':norm(row[sc])==='chieu'?'afternoon':null;if(!session)throw Error('Dòng '+(i+1)+': Buổi phải là Sáng hoặc Chiều.');
  const key=weekday+'|'+session;if(seen.has(key))throw Error('Dòng '+(i+1)+': trùng ngày và buổi học.');seen.add(key);
  const values=periods.map(c=>String(row[c]||'').trim());if(values.some(v=>v.length>80||/^[=+@]/.test(v)))throw Error('Dòng '+(i+1)+': chỉ nhập tên môn ngắn gọn, không dùng công thức.');
  if(!values.some(Boolean))continue;
  const day=days.get(weekday)||{weekday,subjects:[],morning:[],afternoon:[]};day[session]=values;days.set(weekday,day);
 }
 const rows=[...days.values()].sort((a,b)=>a.weekday-b.weekday).map(d=>({...d,subjects:[...(d.morning||[]),...(d.afternoon||[])].filter(Boolean)}));
 if(!rows.length)throw Error('File chưa có môn học nào. Điền tên môn vào các ô Tiết 1–5 trước khi nhập.');return rows;
}
