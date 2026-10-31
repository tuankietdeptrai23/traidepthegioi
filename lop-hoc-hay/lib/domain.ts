import {schoolSessions,type TimetableDay} from './timetable';
export type SpeakingKpi = { minRequired: number; penalty: number; rewards: { min: number; points: number }[] };
export type Rule = {
    id: string;
    name: string;
    category: string;
    points: number;
    serious?: boolean;
    limit?: number;
    kind?: 'speaking-total';
    kpi?: SpeakingKpi;
};
export type AcademicBand = {min:number;points:number;kind:'learned'|'unlearned'};
export type Config = {
    academicCalendar?: {anchorWeek:string;anchorNumber:number;excludedWeeks:string[];monthsPerTerm:number};
    learningPoints?: {initial:number;penalties:Record<string,number>};
    reportMode?: 'weekly' | 'daily';
    reportDays?: number[];
    speakingOpenDates?: string[];
    academicBands?: AcademicBand[];
    timetable?: TimetableDay[];
    dutyPolicyVersion?: 2|3;
    dutyMechanism?: {classWorkers:number;trashWorkers:number;boardWorkers:number;violationTurns:number;exemptOfficers:boolean;fallback:'balanced'|'last-group';afternoonClassWorkers?:number;afternoonTrashWorkers?:number;afternoonBoardWorkers?:number;shuffleSeed?:number;maxTrashPerStudent?:number;requireMaleTrash?:boolean;avoidConsecutiveTrash?:boolean;allowOfficerTrash?:boolean;ruleDuties?:Record<string,{turns:number;task:'any'|'trash'|'class';priority:number;heavy?:boolean}>};
    base: number;
    mode: 'sum' | 'average';
    rules: Rule[];
    bonusAttendance: number;
    bonusUniform: number;
    bonusClean: number;
    lastDutyDays: number;
    violationDuty: boolean;
    preferMaleTrash: boolean;
    rows: number;
    cols: number;
    fundTarget: number;
    rewardWins: number;
    conductBands: {
        min: number;
        level: string;
    }[];
};
export const defaultSpeakingRule: Rule = {
    id: 'speaking-weekly', name: 'Tổng phát biểu / tuần', category: 'speaking', points: 0,
    kind: 'speaking-total', kpi: {minRequired: 4, penalty: 5, rewards: [{min: 8, points: 5}, {min: 12, points: 10}]}
};
export function ruleScore(rule: Rule, count: number): number {
    if (rule.kind !== 'speaking-total') return count * rule.points;
    if (!rule.kpi) return 0;
    if (count < rule.kpi.minRequired) return -rule.kpi.penalty;
    return [...rule.kpi.rewards].reverse().find(t => count >= t.min)?.points ?? 0;
}
export function speakingKpiLabel(rule: Rule, count: number): string {
    if (rule.kind !== 'speaking-total' || !rule.kpi) return '';
    if (count < rule.kpi.minRequired) return 'Không đủ KPI (' + count + '/' + rule.kpi.minRequired + ')';
    const bonus = ruleScore(rule, count);
    return bonus > 0 ? 'Đạt mốc: +' + bonus + ' điểm' : 'Đạt KPI, chưa tới mốc thưởng';
}
export const defaultTimetable = [1,2,3,4,5].map(weekday=>({weekday,subjects:[] as string[]}));
export const dutyTasks = [{task:'Trực lớp',limit:4},{task:'Đổ rác',limit:1},{task:'Lau bảng',limit:1}] as const;
export const defaultConfig: Config = { dutyPolicyVersion:3, timetable:defaultTimetable, base: 100, mode: 'sum', bonusAttendance: 10, bonusUniform: 10, bonusClean: 15, lastDutyDays: 2, violationDuty: true, preferMaleTrash: true, rows: 5, cols: 8, fundTarget: 100000, rewardWins: 3, conductBands: [{ min: 100, level: 'Tốt' }, { min: 80, level: 'Khá' }, { min: 60, level: 'Đạt' }, { min: -99999, level: 'Chưa đạt' }], rules: [
        { id: 'late', name: 'Đi học trễ', category: 'attendance', points: -5 }, { id: 'absence-permit', name: 'Nghỉ học có phép', category: 'absence', points: -2 }, { id: 'absence', name: 'Nghỉ không phép', category: 'absence', points: -5 }, { id: 'skip', name: 'Cúp tiết / bỏ chào cờ', category: 'absence', points: -10 },
        { id: 'grade8', name: 'Kiểm tra bài cũ: 8 điểm', category: 'learning', points: 5 }, { id: 'grade9', name: 'Kiểm tra bài cũ: 9 điểm', category: 'learning', points: 10 }, { id: 'grade10', name: 'Kiểm tra bài cũ: 10 điểm', category: 'learning', points: 15 },
        defaultSpeakingRule,
        { id: 'unlearned', name: 'Không thuộc bài / dưới 5 điểm', category: 'learning', points: -10 }, { id: 'notes', name: 'Không chép bài', category: 'learning', points: -10 }, { id: 'homework', name: 'Không làm bài tập', category: 'learning', points: -5 }, { id: 'uniform', name: 'Sai đồng phục, tác phong', category: 'uniform', points: -5 }, { id: 'noise', name: 'Mất trật tự', category: 'discipline', points: -10 }, { id: 'duty', name: 'Không tham gia trực / lao động', category: 'discipline', points: -20 }, { id: 'litter', name: 'Xả rác', category: 'discipline', points: -5 }, { id: 'rude', name: 'Nói tục / vô lễ', category: 'discipline', points: -20 }, { id: 'phone', name: 'Sử dụng điện thoại trong giờ', category: 'discipline', points: -20 }
    ] };
export const classSubjects = ['Toán','Ngữ văn','Tiếng Anh','Vật lí','Hóa học','Sinh học','Lịch sử','Địa lí','Giáo dục kinh tế và pháp luật','Tin học','Công nghệ','Giáo dục thể chất','Giáo dục quốc phòng và an ninh','Âm nhạc','Mĩ thuật','Hoạt động trải nghiệm, hướng nghiệp'] as const;
export function needsLearningSubject(rule: Partial<Rule>): boolean {
    return rule.category === 'learning' || /^grade(?:8|9|10)$/.test(rule.id || '');
}
export function cleanSubject(raw: unknown): string {
    if (typeof raw !== 'string') return '';
    const candidate = raw.trim().replace(/\s+/g,' ');
    return classSubjects.find(x => x.toLocaleLowerCase('vi')===candidate.toLocaleLowerCase('vi')) || '';
}
export const roleLabels: Record<string, string> = { leader: 'Lớp trưởng', study: 'Lớp phó học tập', discipline: 'Lớp phó nề nếp', movement: 'Lớp phó phong trào', group: 'Tổ trưởng', treasurer: 'Thủ quỹ' };
export function parse<T>(s: string | null | undefined, f: T): T { try {
    return s ? JSON.parse(s) : f;
}
catch {
    return f;
} }
export function monday(date = new Date()): string { const d = new Date(date); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); }
export function dayPlus(date: string, n: number) { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export type Row = Record<string, any>;
export function standings(groups: Row[], students: Row[], entries: Row[], config: Config) {
    const approved = entries.filter(e => e.status === 'approved');
    return groups.map((g): Row => { const members = students.filter(s => s.groupId === g.id && s.active); const records = approved.filter(e => e.groupId === g.id); const personal = members.length * config.base + records.reduce((n, e) => n + e.delta, 0); const attendance = records.some(e => e.category === 'absence') ? 0 : config.bonusAttendance; const uniform = records.some(e => e.category === 'uniform' && e.delta < 0) ? 0 : config.bonusUniform; const clean = records.some(e => e.delta < 0) ? 0 : config.bonusClean; const bonus = attendance + uniform + clean; return { ...g, count: members.length, personal, bonus, score: members.length ? Math.round(((config.mode === 'average' ? personal / members.length : personal) + bonus) * 100) / 100 : 0, violations: records.filter(e => e.delta < 0).reduce((n, e) => n + e.count, 0) }; }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'vi')).map((g, i, a) => ({ ...g, rank: g.count ? 1 + a.filter(x => x.count && x.score > g.score).length : 0 }));
}
export function snapshot(groups: Row[], students: Row[], entries: Row[], config: Config) { return { config, standings: standings(groups, students, entries, config), students: students.map(s => ({ ...s, score: config.base + entries.filter(e => e.studentId === s.id && e.status === 'approved').reduce((n, e) => n + e.delta, 0) })), entries, lockedAt: new Date().toISOString() }; }
export function canViewClassCompetition(roles:string[]){return roles.some(r=>['leader','discipline','study','movement'].includes(r))}
export function canViewCompetitionGroup(teacher:boolean,roles:string[],ownGroup:string,group:string){return teacher||canViewClassCompetition(roles)||!!ownGroup&&ownGroup===group}
export function canReport(roles: string[], ownGroup: string, group: string) { return canViewClassCompetition(roles) || (roles.includes('group') && ownGroup === group); }
export function dutyMechanism(config:Config){return {classWorkers:4,trashWorkers:1,boardWorkers:1,violationTurns:1,exemptOfficers:true,fallback:'balanced' as 'balanced'|'last-group',afternoonClassWorkers:2,afternoonTrashWorkers:1,afternoonBoardWorkers:1,shuffleSeed:0,maxTrashPerStudent:2,requireMaleTrash:false,avoidConsecutiveTrash:true,allowOfficerTrash:false,ruleDuties:{} as Record<string,{turns:number;task:'any'|'trash'|'class';priority:number;heavy?:boolean}>,...config.dutyMechanism}}
export function dutyRuleKey(e:Row){return e.ruleId==='unlearned'||/không thuộc bài/i.test(e.ruleName||'')?'unlearned':e.ruleId}
export function dutyRule(e:Row,config:Config){const p=dutyMechanism(config),custom=p.ruleDuties?.[dutyRuleKey(e)],rule=config.rules.find(r=>r.id===dutyRuleKey(e)),heavy=rule?.serious===true||/điện thoại|vô lễ|đánh nhau|bạo lực|chất cấm/i.test(e.ruleName||rule?.name||'');return custom?{...custom,heavy:custom.heavy??custom.priority>=8}:{turns:p.violationTurns,task:heavy?'trash' as const:'any' as const,priority:heavy?8:0,heavy}}
export function dutyViolation(e:Row,config:Config){return e.status==='approved'&&(e.delta<0||!!dutyMechanism(config).ruleDuties?.[dutyRuleKey(e)]&&dutyRule(e,config).turns>0)}
function dutyRandom(id:string,seed:string){let h=2166136261;for(const c of seed+'|'+id)h=Math.imul(h^c.charCodeAt(0),16777619);h=Math.imul(h^(h>>>16),0x85ebca6b);h=Math.imul(h^(h>>>13),0xc2b2ae35);return (h^(h>>>16))>>>0}
export function dutyBalance(snap:Row,week:string,config:Config,rows:Row[]):Row[]{
 const policy=dutyMechanism(config),ranked=(snap.standings||[]).filter((g:Row)=>g.count),last=Math.min(...ranked.map((g:Row)=>g.score)),lastIds=new Set(ranked.filter((g:Row)=>g.score===last).map((g:Row)=>g.id));
 return (snap.students||[]).filter((s:Row)=>s.active&&(!policy.exemptOfficers||!parse<string[]>(s.roles,[]).length||policy.allowOfficerTrash&&s.gender==='male')).map((s:Row)=>{const base=lastIds.has(s.groupId)?config.lastDutyDays:0,violation=config.violationDuty?(snap.entries||[]).filter((e:Row)=>e.studentId===s.id&&dutyViolation(e,config)).reduce((n:number,e:Row)=>n+Math.max(1,Math.floor(Number(e.count)||1))*dutyRule(e,config).turns,0):0;const assigned=rows.filter((r:Row)=>r.status!=='cancelled'&&r.studentId===s.id&&['automatic:','last:','violation:'].some(p=>r.sourceKey?.startsWith(p+week+':'))),baseDone=assigned.filter((r:Row)=>r.source?.startsWith('Tổ cuối')).length,violationDone=assigned.filter((r:Row)=>r.source?.startsWith('Bù')||r.source?.startsWith('Vi phạm')).length;return {studentId:s.id,name:s.name,groupId:s.groupId,base,violation,baseDone,violationDone,remaining:Math.max(0,base-baseDone)+Math.max(0,violation-violationDone)}});
}
/** Baseline 6 morning / 4 afternoon; all excess turns remain inside the target week. */
export function dutyPlan(snap:Row,week:string,config:Config,existing:Row[]=[],notBefore=''):Row[]{
 const policy=dutyMechanism(config),ranked=(snap.standings||[]).filter((g:Row)=>g.count>0);if(!ranked.length)return [];
 const lastScore=Math.min(...ranked.map((g:Row)=>g.score)),lastIds=new Set(ranked.filter((g:Row)=>g.score===lastScore).map((g:Row)=>g.id));
 const eligible:Row[]=(snap.students||[]).filter((s:Row)=>s.active&&(!policy.exemptOfficers||parse<string[]>(s.roles,[]).length===0||policy.allowOfficerTrash&&s.gender==='male'));if(!eligible.length)return [];
 const days=(config.timetable||defaultTimetable).filter(d=>schoolSessions(d).length).sort((a,b)=>a.weekday-b.weekday);
 const debt=dutyBalance(snap,week,config,existing),base=new Map<string,number>(debt.map((x:Row)=>[x.studentId,Math.max(0,x.base-x.baseDone)])),owed=new Map<string,number>(debt.map((x:Row)=>[x.studentId,Math.max(0,x.violation-x.violationDone)]));
 const queues=new Map<string,Row[]>();for(const person of eligible){const q:Row[]=[];if(config.violationDuty)for(const e of snap.entries||[])if(e.studentId===person.id&&dutyViolation(e,config)){const rule=dutyRule(e,config);q.push({id:dutyRuleKey(e),name:e.ruleName,task:rule.task,priority:rule.priority,heavy:rule.heavy,remaining:rule.turns*Math.max(1,Math.floor(Number(e.count)||1))})}let paid=debt.find((x:Row)=>x.studentId===person.id)?.violationDone||0;q.sort((a,b)=>b.priority-a.priority);for(const item of q){const n=Math.min(paid,item.remaining);item.remaining-=n;paid-=n;}queues.set(person.id,q);}
 const trashCounts=new Map<string,number>();let previousTrash='';for(const r of existing.filter(r=>r.task==='Đổ rác'&&r.date>=dayPlus(week,7)&&r.date<=dayPlus(week,13)).sort((a,b)=>a.date.localeCompare(b.date))){trashCounts.set(r.studentId,(trashCounts.get(r.studentId)||0)+1);previousTrash=r.studentId;}
 const loads=new Map<string,number>(),used=new Set<string>(),dayLoads=new Map<string,number>(),baseDays=new Set<string>();
 const sessionOf=(r:Row)=>r.source?.endsWith(' · Buổi chiều')?'afternoon':r.source?.endsWith(' · Buổi sáng')?'morning':'legacy';
 for(const d of existing){loads.set(d.studentId,(loads.get(d.studentId)||0)+1);used.add(d.date+'|'+sessionOf(d)+'|'+d.studentId);dayLoads.set(d.date+'|'+d.studentId,(dayLoads.get(d.date+'|'+d.studentId)||0)+1);if(d.source?.startsWith('Tổ cuối'))baseDays.add(d.date+'|'+d.studentId)}
 const out:Row[]=[],sessions:Row[]=[],seed=Math.floor(Date.parse(week+'T00:00:00Z')/604800000)+(policy.shuffleSeed||0);
 for(const day of days){const date=dayPlus(week,7+day.weekday-1);if(date<notBefore||config.academicCalendar?.excludedWeeks.includes(monday(new Date(date))))continue;const active=schoolSessions(day);for(const session of active){const reserved=existing.filter(r=>r.date===date&&(sessionOf(r)===session||sessionOf(r)==='legacy'&&session===active[0]));const afternoon=session==='afternoon',work=afternoon?policy.afternoonClassWorkers:policy.classWorkers,trash=afternoon?policy.afternoonTrashWorkers:policy.trashWorkers,board=afternoon?policy.afternoonBoardWorkers:policy.boardWorkers;
  const slots=[...Array(Math.max(0,trash-reserved.filter(r=>r.task==='Đổ rác').length)).fill('Đổ rác'),...Array(Math.max(0,board-reserved.filter(r=>r.task==='Lau bảng').length)).fill('Lau bảng'),...Array(Math.max(0,work-reserved.filter(r=>!['Đổ rác','Lau bảng'].includes(r.task)).length)).fill('Trực lớp')];sessions.push({date,session,reserved,slots,baseline:work+trash+board,extra:0});}}
 const dates=[...new Set<string>(sessions.map(s=>s.date))],targets=new Map<string,Map<string,number>>(),plannedDay=new Map<string,number>(),plannedGroup=new Map<string,number>(),plannedGender=new Map<string,number>();
 const shuffled=eligible.slice().sort((a,b)=>dutyRandom(a.id,seed+'|targets')-dutyRandom(b.id,seed+'|targets'));
 for(const person of shuffled){const target=new Map<string,number>();targets.set(person.id,target);const baseTargetDays=new Set<string>();for(let i=0;i<(base.get(person.id)||0)+(owed.get(person.id)||0);i++){const isBase=i<(base.get(person.id)||0),options=dates.filter(date=>(target.get(date)||0)<sessions.filter(s=>s.date===date).length&&(!isBase||!baseTargetDays.has(date)));options.sort((a,b)=>(plannedGroup.get(a+'|'+person.groupId)||0)-(plannedGroup.get(b+'|'+person.groupId)||0)||(plannedGender.get(a+'|'+person.gender)||0)-(plannedGender.get(b+'|'+person.gender)||0)||(plannedDay.get(a)||0)-(plannedDay.get(b)||0)||dutyRandom(person.id,seed+'|'+a+'|'+i)-dutyRandom(person.id,seed+'|'+b+'|'+i));const date=options[0];if(!date)break;target.set(date,(target.get(date)||0)+1);plannedDay.set(date,(plannedDay.get(date)||0)+1);plannedGroup.set(date+'|'+person.groupId,(plannedGroup.get(date+'|'+person.groupId)||0)+1);plannedGender.set(date+'|'+person.gender,(plannedGender.get(date+'|'+person.gender)||0)+1);if(isBase)baseTargetDays.add(date);}}
 const actualGroup=new Map<string,number>(),actualGender=new Map<string,number>();for(const r of existing){const p=eligible.find(p=>p.id===r.studentId);if(p){actualGroup.set(r.date+'|'+p.groupId,(actualGroup.get(r.date+'|'+p.groupId)||0)+1);actualGender.set(r.date+'|'+p.gender,(actualGender.get(r.date+'|'+p.gender)||0)+1)}}
 const available=(person:Row,s:Row)=>!used.has(s.date+'|'+s.session+'|'+person.id)&&!used.has(s.date+'|legacy|'+person.id);
 const remaining=(id:string)=>(base.get(id)||0)+(owed.get(id)||0);
 function choose(s:Row,task:string,mandatoryOnly:boolean,forceAny=false){
  let candidates=eligible.filter(p=>available(p,s)&&(!policy.exemptOfficers||!parse<string[]>(p.roles,[]).length||task==='Đổ rác'&&policy.allowOfficerTrash));
  if(task==='Đổ rác'){candidates=candidates.filter(p=>(trashCounts.get(p.id)||0)<policy.maxTrashPerStudent&&(!policy.requireMaleTrash||p.gender==='male'||(queues.get(p.id)||[]).some(q=>q.remaining>0&&q.heavy)));if(!candidates.length)return null;}
  const heavy=(p:Row)=>(queues.get(p.id)||[]).some(q=>q.remaining>0&&q.heavy);
  const due=candidates.filter(p=>remaining(p.id)>0&&((owed.get(p.id)||0)>0||!baseDays.has(s.date+'|'+p.id))&&(!mandatoryOnly||forceAny||task==='Đổ rác'||(targets.get(p.id)?.get(s.date)||0)>0));
  if(task!=='Đổ rác'){if(due.length)candidates=due;else if(mandatoryOnly)return null;}
  if(!due.length&&policy.fallback==='last-group'&&task!=='Đổ rác'){const last=candidates.filter(p=>lastIds.has(p.groupId));if(last.length)candidates=last;}
  const tier=(p:Row)=>heavy(p)?0:p.gender==='male'&&lastIds.has(p.groupId)&&(base.get(p.id)||0)>0?1:p.gender==='male'&&(owed.get(p.id)||0)>0?2:p.gender!=='male'?3:4;
  const priority=(p:Row)=>Math.max(0,...(queues.get(p.id)||[]).filter(q=>q.remaining>0&&(q.task==='trash'&&task==='Đổ rác'||q.task==='class'&&task==='Trực lớp')).map(q=>q.priority+1));
  const baseEligible=(p:Row)=>(base.get(p.id)||0)>0&&!baseDays.has(s.date+'|'+p.id);
  candidates.sort((a,b)=>(task==='Đổ rác'&&config.preferMaleTrash?tier(a)-tier(b):0)||(task==='Đổ rác'&&policy.avoidConsecutiveTrash?Number(a.id===previousTrash)-Number(b.id===previousTrash):0)||(priority(b)-priority(a))||((actualGroup.get(s.date+'|'+a.groupId)||0)/Math.max(1,eligible.filter(p=>p.groupId===a.groupId).length)-(actualGroup.get(s.date+'|'+b.groupId)||0)/Math.max(1,eligible.filter(p=>p.groupId===b.groupId).length))||((actualGender.get(s.date+'|'+a.gender)||0)/Math.max(1,eligible.filter(p=>p.gender===a.gender).length)-(actualGender.get(s.date+'|'+b.gender)||0)/Math.max(1,eligible.filter(p=>p.gender===b.gender).length))||(task==='Đổ rác'?(trashCounts.get(a.id)||0)-(trashCounts.get(b.id)||0):0)||Number((dayLoads.get(s.date+'|'+a.id)||0)>0)-Number((dayLoads.get(s.date+'|'+b.id)||0)>0)||Number(baseEligible(b))-Number(baseEligible(a))||((base.get(b.id)||0)-(base.get(a.id)||0))||((owed.get(b.id)||0)-(owed.get(a.id)||0))||((loads.get(a.id)||0)-(loads.get(b.id)||0))||dutyRandom(a.id,seed+'|'+s.date+'|'+s.session+'|'+task)-dutyRandom(b.id,seed+'|'+s.date+'|'+s.session+'|'+task));return candidates[0]||null;
 }
 function assign(p:Row,s:Row,task:string,extra=false){actualGroup.set(s.date+'|'+p.groupId,(actualGroup.get(s.date+'|'+p.groupId)||0)+1);actualGender.set(s.date+'|'+p.gender,(actualGender.get(s.date+'|'+p.gender)||0)+1);const queue=queues.get(p.id)||[],preferred=queue.filter(q=>q.remaining>0&&(task==='Đổ rác'&&(q.task==='trash'||q.heavy)||task==='Trực lớp'&&q.task==='class')).sort((a,b)=>b.priority-a.priority)[0];const isBase=(base.get(p.id)||0)>0&&!baseDays.has(s.date+'|'+p.id)&&!preferred,isViolation=!isBase&&(owed.get(p.id)||0)>0;let consumed:Row|undefined;
  if(isBase){base.set(p.id,(base.get(p.id)||0)-1);baseDays.add(s.date+'|'+p.id)}else if(isViolation){owed.set(p.id,(owed.get(p.id)||0)-1);consumed=preferred||queue.filter(q=>q.remaining>0).sort((a,b)=>b.priority-a.priority)[0];if(consumed)consumed.remaining--;}if(isBase||isViolation){const planned=targets.get(p.id);const consumeDate=(planned?.get(s.date)||0)>0?s.date:dates.find(d=>(planned?.get(d)||0)>0);if(consumeDate)planned!.set(consumeDate,(planned!.get(consumeDate)||0)-1);}if(task==='Đổ rác'){trashCounts.set(p.id,(trashCounts.get(p.id)||0)+1);previousTrash=p.id;}
  const name=ranked.find((g:Row)=>g.id===p.groupId)?.name||'Tổ cuối',reason=isBase?'Tổ cuối tuần '+week+' · '+name+' · Lượt '+(config.lastDutyDays-(base.get(p.id)||0))+'/'+config.lastDutyDays:isViolation?'Bù 1 lượt vi phạm tuần '+week+(consumed?' · '+consumed.name+' · Quy tắc '+consumed.id:''):'Luân phiên bổ sung đủ người';
  out.push({studentId:p.id,date:s.date,task,source:reason+(extra?' · Bổ sung lượt trong tuần':'')+(s.session==='afternoon'?' · Buổi chiều':' · Buổi sáng'),sourceKey:'automatic:'+week+':'+s.date+':'+s.session+':'+p.id});used.add(s.date+'|'+s.session+'|'+p.id);loads.set(p.id,(loads.get(p.id)||0)+1);dayLoads.set(s.date+'|'+p.id,(dayLoads.get(s.date+'|'+p.id)||0)+1);if(extra)s.extra++;
 }
 // Allocate mandatory turns before filling unused baseline slots.
 for(const s of sessions){s.unfilled=[];for(const task of s.slots){const p=choose(s,task,true);if(p)assign(p,s,task);else s.unfilled.push(task)}}
 // Spill excess evenly across this week's sessions, preferring afternoon.
 let safety=debt.reduce((n:number,x:Row)=>n+x.base+x.violation,0)+1;
 while(safety-->0&&eligible.some(p=>remaining(p.id)>0)){const choices=sessions.slice().sort((a,b)=>Number(a.session!=='afternoon')-Number(b.session!=='afternoon')||a.extra-b.extra||a.date.localeCompare(b.date));let made=false;for(const s of choices){let task=s.unfilled[0]||'Trực lớp',p=choose(s,task,true,true);if(!p&&task!=='Trực lớp'){task='Trực lớp';p=choose(s,task,true,true);}if(p){const index=s.unfilled.indexOf(task);if(index>=0)s.unfilled.splice(index,1);assign(p,s,task,true);made=true;break}}if(!made)break;}
 for(const s of sessions)for(const task of s.unfilled){const p=choose(s,task,false);if(p)assign(p,s,task)}
 return out;
}
export function dutyScheduleWarnings(rows:Row[],week:string,config:Config,notBefore=''):string[]{
 const p=dutyMechanism(config),start=dayPlus(week,7),end=dayPlus(week,13),active=rows.filter(r=>r.status!=='cancelled'&&r.date>=start&&r.date<=end),warnings:string[]=[];
 for(const day of config.timetable||defaultTimetable){const date=dayPlus(start,day.weekday-1);if(date<notBefore||config.academicCalendar?.excludedWeeks.includes(monday(new Date(date))))continue;const sessions=schoolSessions(day);for(const session of sessions){const label=session==='afternoon'?'Buổi chiều':'Buổi sáng',r=active.filter(r=>r.date===date&&(r.source?.endsWith(' · '+label)||!r.source?.includes(' · Buổi ')&&session===sessions[0])),work=session==='afternoon'?p.afternoonClassWorkers:p.classWorkers,trash=session==='afternoon'?p.afternoonTrashWorkers:p.trashWorkers,board=session==='afternoon'?p.afternoonBoardWorkers:p.boardWorkers;
 if(r.filter(x=>x.task==='Đổ rác').length<trash)warnings.push(date+' '+label+': thiếu người đổ rác đủ điều kiện (giới hạn '+p.maxTrashPerStudent+' lần/bạn/tuần).');if(r.filter(x=>x.task==='Lau bảng').length<board)warnings.push(date+' '+label+': thiếu người lau bảng.');if(r.filter(x=>!['Đổ rác','Lau bảng'].includes(x.task)).length<work)warnings.push(date+' '+label+': thiếu người trực lớp.');if(new Set(r.map(x=>x.studentId)).size!==r.length)warnings.push(date+' '+label+': một người bị trùng nhiệm vụ.');}}
 const trashCounts=new Map<string,number>();for(const r of active.filter(r=>r.task==='Đổ rác'))trashCounts.set(r.studentId,(trashCounts.get(r.studentId)||0)+1);for(const [id,n] of trashCounts)if(n>p.maxTrashPerStudent)warnings.push('Học sinh '+id+' có '+n+' lượt đổ rác, vượt giới hạn '+p.maxTrashPerStudent+'. Lịch đã làm / thủ công cần GV đối chiếu.');return warnings;
}
export function validateConfig(c: any): Config {
    if (!c || !Number.isInteger(c.base) || c.base < 0 || c.base > 10000 || !['sum', 'average'].includes(c.mode) || !Array.isArray(c.rules) || !c.rules.length || c.rules.length > 100)
        throw Error('Cấu hình điểm chưa hợp lệ');
    if(c.reportMode!==undefined&&!['weekly','daily'].includes(c.reportMode))throw Error('Chế độ báo cáo không hợp lệ');
    if(c.reportDays!==undefined&&(!Array.isArray(c.reportDays)||!c.reportDays.length||c.reportDays.some((d:any)=>!Number.isInteger(d)||d<1||d>6)||new Set(c.reportDays).size!==c.reportDays.length))throw Error('Chọn ngày báo cáo từ thứ Hai đến thứ Bảy');
    if(c.speakingOpenDates!==undefined&&(!Array.isArray(c.speakingOpenDates)||c.speakingOpenDates.length>60||c.speakingOpenDates.some((d:any)=>typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d+'T00:00:00Z'))||new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d)))throw Error('Ngày mở phát biểu không hợp lệ');
    if(c.rules.some((r:any)=>r.serious!==undefined&&typeof r.serious!=='boolean'))throw Error('Cờ cảnh báo nghiêm trọng phải là có / không.');
    if(c.academicCalendar!==undefined){const a=c.academicCalendar;const validWeek=(s:any)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s&&monday(new Date(s))===s;if(!a||!validWeek(a.anchorWeek)||!Number.isInteger(a.anchorNumber)||a.anchorNumber<1||a.anchorNumber>60||!Number.isInteger(a.monthsPerTerm)||a.monthsPerTerm<1||a.monthsPerTerm>6||!Array.isArray(a.excludedWeeks)||a.excludedWeeks.length>80||a.excludedWeeks.some((w:any)=>!validWeek(w))||new Set(a.excludedWeeks).size!==a.excludedWeeks.length||a.excludedWeeks.includes(a.anchorWeek))throw Error('Lịch tuần học: chọn thứ Hai, số tuần 1–60, kỳ 1–6 tháng và các tuần nghỉ hợp lệ.');}
    if(c.learningPoints!==undefined){const p=c.learningPoints;if(!p||!Number.isInteger(p.initial)||p.initial<1||p.initial>10000||!p.penalties||Array.isArray(p.penalties)||typeof p.penalties!=='object'||Object.keys(p.penalties).length>101||Object.entries(p.penalties).some(([k,v]:[string,any])=>k!=='unlearned'&&!c.rules.some((r:Rule)=>r.id===k)||!Number.isInteger(v)||v<0||v>1000))throw Error('Điểm Học tập: điểm ban đầu từ 1–10000, mức trừ từ 0–1000 và thuộc quy tắc của lớp.');}
    if(c.dutyMechanism!==undefined){const p=c.dutyMechanism;if(!p||['classWorkers','trashWorkers','boardWorkers','violationTurns'].some(k=>!Number.isInteger(p[k])||p[k]<0||p[k]>20)||p.classWorkers+p.trashWorkers+p.boardWorkers<6||p.classWorkers+p.trashWorkers+p.boardWorkers>20||typeof p.exemptOfficers!=='boolean'||!['balanced','last-group'].includes(p.fallback))throw Error('Cơ chế trực: tổng 6–20 người/ngày; mỗi nhiệm vụ và số lượt vi phạm từ 0–20.');}
    if(c.dutyMechanism){const p=dutyMechanism(c);if(['afternoonClassWorkers','afternoonTrashWorkers','afternoonBoardWorkers'].some(k=>!Number.isInteger((p as any)[k])||(p as any)[k]<0||(p as any)[k]>20)||p.afternoonClassWorkers+p.afternoonTrashWorkers+p.afternoonBoardWorkers<1||p.afternoonClassWorkers+p.afternoonTrashWorkers+p.afternoonBoardWorkers>20||!Number.isInteger(p.shuffleSeed)||p.shuffleSeed<0||p.shuffleSeed>1000000)throw Error('Số người trực chiều từ 1–20 và mã phương án phải hợp lệ.');}
    if(c.dutyMechanism){const p=dutyMechanism(c);if(!Number.isInteger(p.maxTrashPerStudent)||p.maxTrashPerStudent<1||p.maxTrashPerStudent>10||['requireMaleTrash','avoidConsecutiveTrash','allowOfficerTrash'].some(k=>typeof (p as any)[k]!=='boolean')||!p.ruleDuties||Array.isArray(p.ruleDuties)||Object.keys(p.ruleDuties).length>101||Object.entries(p.ruleDuties).some(([id,r]:[string,any])=>id!=='unlearned'&&!c.rules.some((x:Rule)=>x.id===id)||!r||!Number.isInteger(r.turns)||r.turns<0||r.turns>20||!['any','trash','class'].includes(r.task)||!Number.isInteger(r.priority)||r.priority<0||r.priority>10||r.heavy!==undefined&&typeof r.heavy!=='boolean'))throw Error('Cơ chế đổ rác / quy tắc vi phạm không hợp lệ: tối đa 1–10 lần/bạn, mỗi lỗi 0–20 lượt, ưu tiên 0–10.');}
    const ids = new Set();
    for (const r of c.rules) {
        if (!r.id || ids.has(r.id) || typeof r.name !== 'string' || !r.name.trim() || r.name.length > 150 || !['attendance', 'absence', 'learning', 'speaking', 'uniform', 'discipline', 'movement'].includes(r.category) || !Number.isInteger(r.points) || Math.abs(r.points) > 1000 || (r.limit !== undefined && (!Number.isInteger(r.limit) || r.limit < 1 || r.limit > 100)))
            throw Error('Quy tắc điểm không hợp lệ');
        if (r.kind !== undefined && r.kind !== 'speaking-total') throw Error('Loại quy tắc chưa hợp lệ');
        if (r.kind === 'speaking-total') {
            if (r.category !== 'speaking' || r.points !== 0 || r.limit !== undefined || !r.kpi ||
                !Number.isInteger(r.kpi.minRequired) || r.kpi.minRequired < 1 || r.kpi.minRequired > 100 ||
                !Number.isInteger(r.kpi.penalty) || r.kpi.penalty < 0 || r.kpi.penalty > 1000 ||
                !Array.isArray(r.kpi.rewards) || r.kpi.rewards.length > 12 ||
                r.kpi.rewards.some((t: any) => !Number.isInteger(t.min) || t.min <= r.kpi.minRequired || t.min > 100 ||
                    !Number.isInteger(t.points) || t.points < 0 || t.points > 1000))
                throw Error('Mốc KPI phát biểu không hợp lệ');
            const sorted = r.kpi.rewards.map((t: any) => t.min);
            if (new Set(sorted).size !== sorted.length || sorted.some((x: number, i: number) => i > 0 && x <= sorted[i-1]))
                throw Error('Các mốc thưởng phải tăng dần và không trùng nhau');
        } else if (r.kpi !== undefined) throw Error('Chỉ quy tắc KPI được có mốc phát biểu');
        ids.add(r.id);
    }
    if (c.rules.some((r: Rule) => r.kind === 'speaking-total') &&
        c.rules.filter((r: Rule) => r.category === 'speaking').length !== 1)
        throw Error('KPI phát biểu không được dùng cùng quy tắc phát biểu cũ.');
    if(c.timetable!==undefined){if(!Array.isArray(c.timetable)||c.timetable.length>6||new Set(c.timetable.map((x:any)=>x.weekday)).size!==c.timetable.length||c.timetable.some((x:any)=>!Number.isInteger(x.weekday)||x.weekday<1||x.weekday>6||!Array.isArray(x.subjects)||x.subjects.length>12||x.subjects.some((v:any)=>typeof v!=='string'||v.length>80)))throw Error('Thời khóa biểu phải có ngày học hợp lệ và môn học ngắn gọn.');}
    if(c.timetable?.some((d:any)=>['morning','afternoon'].some(k=>d[k]!==undefined&&(!Array.isArray(d[k])||d[k].length>5||d[k].some((v:any)=>typeof v!=='string'||v.length>80)))))throw Error('Mỗi buổi sáng / chiều tối đa 5 tiết, tên môn tối đa 80 ký tự.');
    if(c.academicBands!==undefined){const bands=c.academicBands;if(!Array.isArray(bands)||!bands.length||bands.length>20||bands[0]?.min!==0||bands.some((b:any,i:number)=>!b||!Number.isFinite(b.min)||b.min<0||b.min>10||Math.abs(b.min*10-Math.round(b.min*10))>1e-8||!Number.isInteger(b.points)||Math.abs(b.points)>1000||!['learned','unlearned'].includes(b.kind)||(i>0&&b.min<=bands[i-1].min)))throw Error('Mốc thuộc bài phải bắt đầu từ 0, tăng dần đến tối đa 10 và có mức cộng/trừ hợp lệ.');}
    if (!Number.isInteger(c.rewardWins) || c.rewardWins < 1 || c.rewardWins > 6)
        throw Error('Số tuần khen thưởng phải từ 1 đến 6');
    for (const k of ['bonusAttendance', 'bonusUniform', 'bonusClean', 'fundTarget'])
        if (!Number.isInteger(c[k]) || c[k] < 0 || c[k] > 100000000)
            throw Error('Điểm thưởng / mức quỹ chưa hợp lệ');
    if (!Number.isInteger(c.rows) || c.rows < 1 || c.rows > 12 || !Number.isInteger(c.cols) || c.cols < 1 || c.cols > 12 || !Number.isInteger(c.lastDutyDays) || c.lastDutyDays < 0 || c.lastDutyDays > 5)
        throw Error('Số hàng, cột hoặc ngày trực chưa hợp lệ');
    if (!Array.isArray(c.conductBands) || !c.conductBands.length || c.conductBands.some((x: any) => !Number.isFinite(x.min) || !['Tốt', 'Khá', 'Đạt', 'Chưa đạt'].includes(x.level)))
        throw Error('Mốc đánh giá chưa hợp lệ');
    return { ...c,dutyPolicyVersion:3, preferMaleTrash: !!c.preferMaleTrash, violationDuty: !!c.violationDuty };
}

export function studentLoginBase(name:string){const value=name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]/g,'');return (value.length>=3?value:'hs'+value).slice(0,36)}
export function seatGroupIndex(seat:number,cols:number,count:number){return Math.min(count-1,Math.floor(((seat-1)%cols)*count/cols))}
