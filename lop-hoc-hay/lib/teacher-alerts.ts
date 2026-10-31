import type {Row,Config,Rule} from './domain';
export const eventDate=(e:Row)=>e.reportDate||e.week||String(e.createdAt||'').slice(0,10);
export function isSeriousRule(r:Partial<Rule>){return r.serious!==undefined?r.serious:/đánh nhau|bạo lực|hút thuốc|vô lễ|chất cấm/i.test(r.name||'')}
export function isUnlearned(e:Row){return e.ruleId==='unlearned'||/không thuộc bài/i.test(e.ruleName||'')}
export function isAssessment(e:Row){return e.category==='learning'&&(isUnlearned(e)||e.grade!==undefined&&e.grade!==null&&String(e.grade).trim()!=='')}
const order=(e:Row)=>eventDate(e)+'|'+String(Number(/academic-sheet\/(\d+)\//.exec(e.ruleId||'')?.[1]||0)).padStart(2,'0')+'|'+(e.createdAt||'')+'|'+e.id;
export function teacherAlerts(entries:Row[],config:Config,approvedOnly=false):Row[]{
 const records=entries.filter(e=>e.status!=='rejected'&&(!approvedOnly||e.status==='approved'));
 const alerts:Row[]=[];
 for(const e of records){const r=config.rules.find(r=>r.id===e.ruleId);if(r&&isSeriousRule(r))alerts.push({id:'serious:'+e.id,kind:'serious',studentId:e.studentId,subject:e.subject||'',date:eventDate(e),title:'Vi phạm cần giáo viên xem ngay',detail:e.ruleName,entryIds:[e.id],approved:e.status==='approved',evidence:[e]})}
 const groups=new Map<string,Row[]>();for(const e of records.filter(isUnlearned)){const key=e.studentId+'|'+eventDate(e).slice(0,7);groups.set(key,[...(groups.get(key)||[]),e])}
 for(const rows of groups.values()){rows.sort((a,b)=>order(a).localeCompare(order(b)));const count=rows.reduce((n,e)=>n+Math.max(1,Number(e.count)||1),0);if(count<2)continue;const last=rows[rows.length-1],month=eventDate(last).slice(0,7);const subjects=[...new Set(rows.map(e=>e.subject||'Chưa ghi môn'))];alerts.push({id:'unlearned:'+last.studentId+':'+month+':'+count+':'+last.id,kind:'unlearned',studentId:last.studentId,subject:subjects.join(', '),date:eventDate(last),title:'Không thuộc bài '+count+' lần trong tháng',detail:'Tháng '+month+' · Cộng tất cả môn: '+subjects.join(', '),entryIds:rows.map(e=>e.id),approved:rows.every(e=>e.status==='approved'),evidence:rows,count,month})}
 return alerts.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
}
