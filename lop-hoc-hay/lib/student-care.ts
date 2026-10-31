import {type Row,canReport,parse} from './domain';
export const careKinds=['attendance','request','duty-proof','goal','handover','parent-contact','month-close'] as const;
export const careKey=(classId:string,kind:string,id:string)=>'student-care:'+classId+':'+kind+':'+id;
export function careVisible(records:Row[],teacher:boolean,roles:string[],own:Row|undefined){
 return records.filter(r=>teacher||r.kind==='attendance'&&(r.studentId===own?.id||canReport(roles,own?.groupId||'',r.groupId))||r.kind==='duty-proof'&&(r.studentId===own?.id||roles.some(x=>['leader','discipline'].includes(x))||roles.includes('group')&&r.groupId===own?.groupId)||r.kind==='handover'&&(r.fromId===own?.id||r.toId===own?.id)||['request','goal'].includes(r.kind)&&r.studentId===own?.id).map(r=>{const x={...r};if(!teacher){delete x.snapshot;x.history=(r.history||[]).map((h:Row)=>({at:h.at,action:h.action,note:h.note}));}return x});
}
export function nextCareRecord(old:Row|undefined,value:Row,actor:string,note=''):Row{
 const at=new Date().toISOString();const before=old?Object.fromEntries(Object.entries(old).filter(([k])=>!['history','snapshot'].includes(k))):null;
 const history=[...(old?.history||[]),{at,actor,action:old?'update':'create',note,before}];
 if(history.length>80)throw Error('Hồ sơ đã có 80 phiên bản; tạo hồ sơ bổ sung để giữ đầy đủ lịch sử.');
 return {...old,...value,createdAt:old?.createdAt||at,createdBy:old?.createdBy||actor,updatedAt:at,history};
}
export function personalReminders(d:Row):Row[]{
 const own=d.ownId;if(!own)return [];const day=d.serverToday,out:Row[]=[];
 for(const x of d.duties||[])if(x.studentId===own&&x.status!=='completed'&&x.status!=='cancelled'&&x.date>=day)out.push({id:'duty:'+x.id,date:x.date,title:x.date===day?'Hôm nay: '+x.task:'Lịch trực: '+x.task,detail:x.source,tab:'duties'});
 for(const c of d.fundCollections||[])if(c.status==='open'){const paid=(c.payments||[]).filter((p:Row)=>p.studentId===own).reduce((n:number,p:Row)=>n+(p.type==='income'?p.amount:-p.amount),0);if(paid<c.amount)out.push({id:'fund:'+c.id,date:c.dueDate,title:'Quỹ còn thiếu '+new Intl.NumberFormat('vi-VN').format(c.amount-paid)+' ₫',detail:c.title,tab:'funds'});}
 for(const a of d.activities||[])if(a.status==='open'&&a.date>=day&&parse<string[]>(a.participants,[]).includes(own))out.push({id:'activity:'+a.id,date:a.date,title:'Hoạt động: '+a.title,detail:'Đã đăng ký tham gia',tab:'activities'});
 for(const g of d.careRecords||[])if(g.kind==='goal'&&g.status!=='completed'&&g.status!=='archived'&&g.studentId===own)out.push({id:'goal:'+g.id,date:g.dueDate,title:'Mục tiêu: '+g.title,detail:g.status==='submitted'?'Đang chờ GV xác nhận':g.description,tab:'care'});
 return out.sort((a,b)=>a.date.localeCompare(b.date));
}
