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
    reportMode?: 'weekly' | 'daily';
    reportDays?: number[];
    speakingOpenDates?: string[];
    academicBands?: AcademicBand[];
    timetable?: TimetableDay[];
    dutyPolicyVersion?: 2;
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
export const defaultConfig: Config = { dutyPolicyVersion:2, timetable:defaultTimetable, base: 100, mode: 'sum', bonusAttendance: 10, bonusUniform: 10, bonusClean: 15, lastDutyDays: 2, violationDuty: true, preferMaleTrash: true, rows: 5, cols: 8, fundTarget: 100000, rewardWins: 3, conductBands: [{ min: 100, level: 'Tốt' }, { min: 80, level: 'Khá' }, { min: 60, level: 'Đạt' }, { min: -99999, level: 'Chưa đạt' }], rules: [
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
export function canReport(roles: string[], ownGroup: string, group: string) { return roles.some(r=>['leader','discipline','study','movement','treasurer'].includes(r)) || (roles.includes('group') && ownGroup === group); }
/** Each last-place group receives its own two school days. Violations are extra turns. */
export function dutyPlan(snap:Row,week:string,config:Config,existing:Row[]=[]):Row[]{
 const ranked=(snap.standings||[]).filter((g:Row)=>g.count>0);if(!ranked.length)return [];
 const minimum=Math.min(...ranked.map((g:Row)=>g.score));const last=ranked.filter((g:Row)=>g.score===minimum).sort((a:Row,b:Row)=>a.name?.localeCompare(b.name||'','vi')||String(a.id).localeCompare(String(b.id)));
 const eligible:Row[]=(snap.students||[]).filter((s:Row)=>s.active&&parse<string[]>(s.roles,[]).length===0);if(!eligible.length)return [];
 const days=(config.timetable||defaultTimetable).filter(d=>schoolSessions(d).length).sort((a,b)=>a.weekday-b.weekday);if(!days.length)return [];
 const lastIds=new Set(last.map((g:Row)=>g.id)),lastMembers=eligible.filter(s=>lastIds.has(s.groupId));
 const groupDays=last.flatMap((group:Row)=>Array.from({length:config.lastDutyDays},(_,i)=>({group,index:i+1})));
 const owed=new Map<string,number>();for(const e of snap.entries||[])if(config.violationDuty&&e.status==='approved'&&e.delta<0&&eligible.some(s=>s.id===e.studentId))owed.set(e.studentId,(owed.get(e.studentId)||0)+Math.max(1,Math.floor(Number(e.count)||1)));
 const loads=new Map<string,number>();for(const d of existing)loads.set(d.studentId,(loads.get(d.studentId)||0)+1);
 const out:Row[]=[],previous=new Map<string,string>();const seed=Math.floor(Date.parse(week+'T00:00:00Z')/604800000);let dayIndex=0;
 const maxRounds=groupDays.length+Math.max(0,...owed.values())+existing.length+2;
 for(let round=0;round<maxRounds;round++){
  let made=0;
  for(const day of days){
   const date=dayPlus(week,7+round*7+day.weekday-1);const groupDay=groupDays[dayIndex++];const reserved=existing.filter(x=>x.date===date);const used=new Set<string>(reserved.map(x=>x.studentId));
   const team=groupDay?eligible.filter(s=>s.groupId===groupDay.group.id):[];
   const target=Math.max(6,used.size+team.filter(s=>!used.has(s.id)).length);
   const classAlready=reserved.filter(r=>!['Đổ rác','Lau bảng'].includes(r.task)).length;
   const slots=[...Array(Math.max(0,target-2-classAlready)).fill('Trực lớp'),...(!reserved.some(r=>r.task==='Đổ rác')?['Đổ rác']:[]),...(!reserved.some(r=>r.task==='Lau bảng')?['Lau bảng']:[])].slice(0,Math.max(0,target-used.size));
   for(const task of slots){
    const required=team.filter(s=>!used.has(s.id));const violations=eligible.filter(s=>!used.has(s.id)&&(owed.get(s.id)||0)>0);
    const backup=lastMembers.filter(s=>!used.has(s.id));
    const pool=groupDay?(required.length?required:backup.length?backup:eligible.filter(s=>!used.has(s.id))):(violations.length?violations:backup.length?backup:eligible.filter(s=>!used.has(s.id)));
    if(!pool.length)continue;
    const person=pool.slice().sort((a,b)=>{const diff=(loads.get(a.id)||0)-(loads.get(b.id)||0);if(diff)return diff;if(task==='Đổ rác'&&config.preferMaleTrash&&a.gender!==b.gender){if(a.gender==='male')return -1;if(b.gender==='male')return 1;}const repeated=Number(previous.get(a.id)===task)-Number(previous.get(b.id)===task);if(repeated)return repeated;return ((eligible.indexOf(a)+seed)%eligible.length)-((eligible.indexOf(b)+seed)%eligible.length)})[0];
    const violation=!groupDay&&(owed.get(person.id)||0)>0;if(violation)owed.set(person.id,(owed.get(person.id)||0)-1);
    const sessions=schoolSessions(day);const morningCount=out.filter(r=>r.date===date&&r.task==='Trực lớp'&&r.source.endsWith(' · Buổi sáng')).length;const session=sessions.length===1?sessions[0]:task==='Đổ rác'?'afternoon':task==='Lau bảng'?'morning':morningCount<Math.ceil((target-2)/2)?'morning':'afternoon';
    const reason=groupDay?'Tổ cuối tuần '+week+' · '+groupDay.group.name+' · Ngày '+groupDay.index+'/'+config.lastDutyDays:violation?'Bù 1 lượt vi phạm tuần '+week:'Bổ sung đủ người từ tổ cuối tuần '+week;
    out.push({studentId:person.id,date,task,source:reason+(session==='afternoon'?' · Buổi chiều':' · Buổi sáng'),sourceKey:'automatic:'+week+':'+date+':'+person.id});used.add(person.id);loads.set(person.id,(loads.get(person.id)||0)+1);previous.set(person.id,task);made++;
   }
  }
  // Finish every school day in the week even if the violation queue becomes empty midweek.
  if(dayIndex>=groupDays.length&&[...owed.values()].every(n=>n===0))break;if(!made)break;
 }
 return out;
}
export function validateConfig(c: any): Config {
    if (!c || !Number.isInteger(c.base) || c.base < 0 || c.base > 10000 || !['sum', 'average'].includes(c.mode) || !Array.isArray(c.rules) || !c.rules.length || c.rules.length > 100)
        throw Error('Cấu hình điểm chưa hợp lệ');
    if(c.reportMode!==undefined&&!['weekly','daily'].includes(c.reportMode))throw Error('Chế độ báo cáo không hợp lệ');
    if(c.reportDays!==undefined&&(!Array.isArray(c.reportDays)||!c.reportDays.length||c.reportDays.some((d:any)=>!Number.isInteger(d)||d<1||d>6)||new Set(c.reportDays).size!==c.reportDays.length))throw Error('Chọn ngày báo cáo từ thứ Hai đến thứ Bảy');
    if(c.speakingOpenDates!==undefined&&(!Array.isArray(c.speakingOpenDates)||c.speakingOpenDates.length>60||c.speakingOpenDates.some((d:any)=>typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d+'T00:00:00Z'))||new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d)))throw Error('Ngày mở phát biểu không hợp lệ');
    if(c.rules.some((r:any)=>r.serious!==undefined&&typeof r.serious!=='boolean'))throw Error('Cờ cảnh báo nghiêm trọng phải là có / không.');
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
    return { ...c,dutyPolicyVersion:2, preferMaleTrash: !!c.preferMaleTrash, violationDuty: !!c.violationDuty };
}

export function studentLoginBase(name:string){const value=name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]/g,'');return (value.length>=3?value:'hs'+value).slice(0,36)}
export function seatGroupIndex(seat:number,cols:number,count:number){return Math.min(count-1,Math.floor(((seat-1)%cols)*count/cols))}
