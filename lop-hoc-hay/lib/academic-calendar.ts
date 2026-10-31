import {monday,dayPlus,type Config,type Row} from './domain';
export type AcademicCalendar={anchorWeek:string;anchorNumber:number;excludedWeeks:string[];monthsPerTerm:number};
const ready=(c:AcademicCalendar)=>!!c&&/^\d{4}-\d{2}-\d{2}$/.test(c.anchorWeek)&&Number.isFinite(Date.parse(c.anchorWeek+'T00:00:00Z'))&&Number.isInteger(c.anchorNumber)&&c.anchorNumber>=1&&c.anchorNumber<=60&&Array.isArray(c.excludedWeeks)&&!c.excludedWeeks.includes(c.anchorWeek);
const distance=(a:string,b:string)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/604800000);
export function schoolWeekNumber(date:string,c:AcademicCalendar):number|null{
 if(!ready(c)||!Number.isFinite(Date.parse(date+'T00:00:00Z')))return null;
 const w=monday(new Date(date));if(c.excludedWeeks.includes(w))return null;
 const diff=distance(c.anchorWeek,w),excluded=c.excludedWeeks.filter(x=>diff>=0?x>c.anchorWeek&&x<=w:x>=w&&x<c.anchorWeek).length;
 return c.anchorNumber+diff+(diff>=0?-excluded:excluded);
}
export function dateForSchoolWeek(number:number,c:AcademicCalendar):string{
 if(!ready(c)||!Number.isInteger(number)||number<1||number>120)return '';
 let date=c.anchorWeek,n=c.anchorNumber;const direction=number>=n?1:-1;
 while(n!==number){date=dayPlus(date,direction*7);if(!c.excludedWeeks.includes(date))n+=direction;}
 return date;
}
export function academicPeriod(date:string,config:Config):Row{
 const c=config.academicCalendar,w=monday(new Date(date));
 if(c&&ready(c)){const number=schoolWeekNumber(date,c);if(number!==null&&number>0){const month=Math.floor((number-1)/4)+1,yearStart=dateForSchoolWeek(1,c),start=dateForSchoolWeek((month-1)*4+1,c),end=dayPlus(dateForSchoolWeek(month*4,c),6);return {key:'study:'+yearStart+':'+month,label:'Tháng học '+month,number:month,weekNumber:number,start,end,firstWeek:(month-1)*4+1,lastWeek:month*4,yearStart,term:Math.min(2,Math.floor((month-1)/c.monthsPerTerm)+1),academic:true}}if(number===null){let prior=dayPlus(w,-7);while(c.excludedWeeks.includes(prior))prior=dayPlus(prior,-7);return {...academicPeriod(prior,config),holiday:true,weekNumber:null}}}
 const month=date.slice(0,7);return {key:month,label:'Tháng '+month.split('-').reverse().join('/'),start:month+'-01',end:month+'-31',academic:false};
}
export function periodFromKey(key:string,config:Config):Row|null{
 if(/^\d{4}-\d{2}$/.test(key))return academicPeriod(key+'-15',{...config,academicCalendar:undefined});
 const match=/^study:(\d{4}-\d{2}-\d{2}):(\d+)$/.exec(key),c=config.academicCalendar;if(!match||!c)return null;
 const number=Number(match[2]);if(number<1||number>30)return null;
 const p=academicPeriod(dateForSchoolWeek((number-1)*4+1,c),config);return p.key===key?p:null;
}
/** Only latest explicit teacher decision per month counts; never infer a downgrade from a score. */
export function termConductAlerts(decisions:Row[],config:Config):Row[]{
 if(!config.academicCalendar)return [];
 const latest=new Map<string,Row>();for(const d of decisions){const p=periodFromKey(d.cycleKey,config);if(p?.academic)latest.set(d.studentId+'|'+d.cycleKey,{...d,periodInfo:p})}
 const groups=new Map<string,Row[]>();for(const d of latest.values()){const p=d.periodInfo,key=d.studentId+'|'+p.yearStart+'|'+p.term;groups.set(key,[...(groups.get(key)||[]),d])}
 const out:Row[]=[];for(const rows of groups.values()){const lowered=rows.filter(d=>d.downgraded===true);if(lowered.length<2)continue;const last=lowered[lowered.length-1],p=last.periodInfo;out.push({id:'conduct-term:'+last.studentId+':'+p.yearStart+':'+p.term+':'+lowered.map(x=>x.id).sort().join(','),kind:'conduct-term',studentId:last.studentId,date:last.createdAt.slice(0,10),title:'Học kỳ '+p.term+': có '+lowered.length+' tháng bị hạ hạnh kiểm',detail:'Tính theo các tháng học của kỳ (mốc '+config.academicCalendar.monthsPerTerm+' tháng/kỳ). GV đối chiếu quy định và quyết định hạnh kiểm học kỳ.',approved:true,entryIds:[],evidence:[],decisions:lowered,term:p.term})}
 return out;
}
