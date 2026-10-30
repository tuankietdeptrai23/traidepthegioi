export type Rule = {
    id: string;
    name: string;
    category: string;
    points: number;
    limit?: number;
};
export type Config = {
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
export const defaultConfig: Config = { base: 100, mode: 'sum', bonusAttendance: 10, bonusUniform: 10, bonusClean: 15, lastDutyDays: 1, violationDuty: true, preferMaleTrash: true, rows: 5, cols: 8, fundTarget: 100000, rewardWins: 3, conductBands: [{ min: 100, level: 'Tốt' }, { min: 80, level: 'Khá' }, { min: 60, level: 'Đạt' }, { min: -99999, level: 'Chưa đạt' }], rules: [
        { id: 'late', name: 'Đi học trễ', category: 'attendance', points: -5 }, { id: 'absence-permit', name: 'Nghỉ học có phép', category: 'absence', points: -2 }, { id: 'absence', name: 'Nghỉ không phép', category: 'absence', points: -5 }, { id: 'skip', name: 'Cúp tiết / bỏ chào cờ', category: 'absence', points: -10 },
        { id: 'grade8', name: 'Kiểm tra bài cũ: 8 điểm', category: 'learning', points: 5 }, { id: 'grade9', name: 'Kiểm tra bài cũ: 9 điểm', category: 'learning', points: 10 }, { id: 'grade10', name: 'Kiểm tra bài cũ: 10 điểm', category: 'learning', points: 15 },
        { id: 'speak8', name: 'Phát biểu từ 8 lần/tuần', category: 'speaking', points: 5, limit: 1 }, { id: 'speak12', name: 'Phát biểu từ 12 lần/tuần', category: 'speaking', points: 10, limit: 1 }, { id: 'speak20', name: 'Phát biểu từ 20 lần/tuần', category: 'speaking', points: 15, limit: 1 }, { id: 'speak30', name: 'Phát biểu từ 30 lần/tuần', category: 'speaking', points: 25, limit: 1 },
        { id: 'unlearned', name: 'Không thuộc bài / dưới 5 điểm', category: 'learning', points: -10 }, { id: 'notes', name: 'Không chép bài', category: 'learning', points: -10 }, { id: 'homework', name: 'Không làm bài tập', category: 'learning', points: -5 }, { id: 'uniform', name: 'Sai đồng phục, tác phong', category: 'uniform', points: -5 }, { id: 'noise', name: 'Mất trật tự', category: 'discipline', points: -10 }, { id: 'duty', name: 'Không tham gia trực / lao động', category: 'discipline', points: -20 }, { id: 'litter', name: 'Xả rác', category: 'discipline', points: -5 }, { id: 'rude', name: 'Nói tục / vô lễ', category: 'discipline', points: -20 }, { id: 'phone', name: 'Sử dụng điện thoại trong giờ', category: 'discipline', points: -20 }
    ] };
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
export function canReport(roles: string[], ownGroup: string, group: string) { return roles.includes('leader') || roles.includes('discipline') || roles.includes('study') || (roles.includes('group') && ownGroup === group); }
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
        ids.add(r.id);
    }
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
