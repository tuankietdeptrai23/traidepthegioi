export type SpeakingKpi = { minRequired: number; penalty: number; rewards: { min: number; points: number }[] };
export type Rule = {
    id: string;
    name: string;
    category: string;
    points: number;
    limit?: number;
    kind?: 'speaking-total';
    kpi?: SpeakingKpi;
};
export type AcademicBand = {min:number;points:number;kind:'learned'|'unlearned'};
export type Config = {
    academicBands?: AcademicBand[];
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
export const defaultConfig: Config = { base: 100, mode: 'sum', bonusAttendance: 10, bonusUniform: 10, bonusClean: 15, lastDutyDays: 1, violationDuty: true, preferMaleTrash: true, rows: 5, cols: 8, fundTarget: 100000, rewardWins: 3, conductBands: [{ min: 100, level: 'Tốt' }, { min: 80, level: 'Khá' }, { min: 60, level: 'Đạt' }, { min: -99999, level: 'Chưa đạt' }], rules: [
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
export function dutyPlan(snap: Row, week: string, config: Config) {
    const ranked = snap.standings.filter((g: Row) => g.count > 0);
    if (!ranked.length)
        return [];
    const min = Math.min(...ranked.map((g: Row) => g.score));
    const last = new Set(ranked.filter((g: Row) => g.score === min).map((g: Row) => g.id));
    const members = snap.students.filter((s: Row) => s.active && last.has(s.groupId));
    const tasks = ['Quét lớp', 'Lau bảng', 'Lau bàn', 'Đổ rác'];
    const out: Row[] = [];
    for (let d = 0; d < config.lastDutyDays; d++) {
        let queue = [...members];
        if (config.preferMaleTrash) {
            const male = queue.filter((s: Row) => s.gender === 'male');
            const weekIndex = Math.floor(Date.parse(week + 'T00:00:00Z') / 604800000);
            const pick = male[(weekIndex + d) % Math.max(male.length, 1)];
            if (pick) {
                queue = queue.filter((s: Row) => s.id !== pick.id);
                out.push({ studentId: pick.id, date: dayPlus(week, 7 + d), task: 'Đổ rác', source: 'Tổ cuối tuần ' + week, sourceKey: `last:${week}:${d}:${pick.id}` });
            }
        }
        queue.forEach((s: Row, i: number) => out.push({ studentId: s.id, date: dayPlus(week, 7 + d), task: tasks[i % (queue.length === members.length ? 4 : 3)], source: 'Tổ cuối tuần ' + week, sourceKey: `last:${week}:${d}:${s.id}` }));
    }
    if (config.violationDuty) {
        const offenders = [...new Set(snap.entries.filter((e: Row) => e.delta < 0 && e.status === 'approved').map((e: Row) => e.studentId))];
        offenders.forEach((id: any, i) => out.push({ studentId: id, date: dayPlus(week, 7 + config.lastDutyDays + i % Math.max(1, 5 - config.lastDutyDays)), task: 'Vệ sinh lớp', source: 'Vi phạm tuần ' + week, sourceKey: `violation:${week}:${id}` }));
    }
    return out;
}
export function validateConfig(c: any): Config {
    if (!c || !Number.isInteger(c.base) || c.base < 0 || c.base > 10000 || !['sum', 'average'].includes(c.mode) || !Array.isArray(c.rules) || !c.rules.length || c.rules.length > 100)
        throw Error('Cấu hình điểm chưa hợp lệ');
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
    return { ...c, preferMaleTrash: !!c.preferMaleTrash, violationDuty: !!c.violationDuty };
}

export function studentLoginBase(name:string){const value=name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]/g,'');return (value.length>=3?value:'hs'+value).slice(0,36)}
export function seatGroupIndex(seat:number,cols:number,count:number){return Math.min(count-1,Math.floor(((seat-1)%cols)*count/cols))}
