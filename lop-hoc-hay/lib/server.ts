import { eq, and, or, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import * as t from '@/db/schema';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { defaultConfig, parse, canReport, monday, snapshot, dutyPlan, validateConfig, type Row, type Config } from './domain';
export class HttpError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
function fail(s: number, m: string): never { throw new HttpError(s, m); }
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const str = (v: any, max = 300) => typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : fail(400, 'Thông tin còn thiếu hoặc quá dài');
const email = (v: any) => { const s = str(v, 200).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
    fail(400, 'Email không hợp lệ'); return s; };
const safeUrl = (v: any) => { if (!v)
    return ''; try {
    const u = new URL(v);
    if (u.protocol !== 'https:')
        throw 0;
    return u.href.slice(0, 2000);
}
catch {
    return fail(400, 'Minh chứng phải là liên kết HTTPS');
} };
function date(v: any) { const s = str(v, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s + 'T00:00:00Z')) || new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) !== s)
    fail(400, 'Ngày không hợp lệ'); return s; }
function week(v: any) { const s = date(v); if (monday(new Date(s)) !== s)
    fail(400, 'Tuần phải bắt đầu vào thứ Hai'); return s; }
function amount(v: any, min = 0, max = 1e9) { const n = Number(v); if (!Number.isSafeInteger(n) || n < min || n > max)
    fail(400, 'Giá trị số không hợp lệ'); return n; }
export async function identity() {
    const who = await getChatGPTUser();
    if (!who)
        fail(401, 'Cần đăng nhập bằng ChatGPT');
    const db = getDb();
    const e = who.email.toLowerCase();
    // Owner-only Site at first deployment. Persist the first verified identity as administrator.
    await db.insert(t.settings).values({ key: 'owner', value: e }).onConflictDoNothing();
    const owner = await db.select().from(t.settings).where(eq(t.settings.key, 'owner')).get();
    if (owner?.value === e)
        await db.insert(t.users).values({ email: e, name: who.fullName || 'Quản trị viên', role: 'admin', active: 1 }).onConflictDoNothing();
    const u = await db.select().from(t.users).where(eq(t.users.email, e)).get();
    if (!u || !u.active)
        fail(403, 'Tài khoản chưa được cấp quyền hoặc đã khóa. Liên hệ quản trị viên / giáo viên.');
    return { db, user: u };
}
async function context(classId: string) {
    const { db, user } = await identity();
    const cls = await db.select().from(t.classes).where(eq(t.classes.id, classId)).get();
    if (!cls)
        fail(404, 'Không tìm thấy lớp');
    const own = await db.select().from(t.students).where(and(eq(t.students.classId, classId), eq(t.students.email, user.email), eq(t.students.active, 1))).get();
    const teacher = user.role === 'admin' || (user.role === 'teacher' && cls.teacherEmail === user.email);
    if (!teacher && !own)
        fail(403, 'Bạn không có quyền truy cập lớp này');
    return { db, user, cls, own, teacher, roles: parse<string[]>(own?.roles, []), config: { ...defaultConfig, ...parse<Config>(cls.config, defaultConfig) } };
}
async function log(db: any, user: Row, classId: string | null, action: string, details: Row) { await db.insert(t.audit).values({ id: uid(), classId, actor: user.email, action, details: JSON.stringify(details), createdAt: now() }); }
export async function state(classId?: string) {
    const { db, user } = await identity();
    const allClasses = await db.select().from(t.classes);
    const memberships = await db.select({ classId: t.students.classId }).from(t.students).where(and(eq(t.students.email, user.email), eq(t.students.active, 1)));
    const allowed = allClasses.filter(c => user.role === 'admin' || (user.role === 'teacher' && c.teacherEmail === user.email) || memberships.some(m => m.classId === c.id));
    const common: Row = { user, classes: allowed.map(c => ({ ...c, config: parse(c.config, defaultConfig) })), users: user.role === 'admin' ? await db.select().from(t.users) : [] };
    if (!classId)
        return common;
    const c = await context(classId);
    const { teacher, own, roles } = c;
    const classFilter = (table: any) => eq(table.classId, classId);
    const [groups, students, periods, entries, reports, grades, conduct, funds, activities, duties, notices, feedback, audit] = await Promise.all([
        db.select().from(t.groups).where(classFilter(t.groups)), db.select().from(t.students).where(classFilter(t.students)), db.select().from(t.periods).where(classFilter(t.periods)), db.select().from(t.entries).where(classFilter(t.entries)), db.select().from(t.reports).where(classFilter(t.reports)), db.select().from(t.grades).where(classFilter(t.grades)), db.select().from(t.conduct).where(classFilter(t.conduct)), db.select().from(t.funds).where(classFilter(t.funds)), db.select().from(t.activities).where(classFilter(t.activities)), db.select().from(t.duties).where(classFilter(t.duties)), db.select().from(t.notices).where(classFilter(t.notices)), db.select().from(t.feedback).where(classFilter(t.feedback)), teacher ? db.select().from(t.audit).where(classFilter(t.audit)) : Promise.resolve([])
    ]);
    const visibleStudent = (s: Row) => teacher || s.id === own?.id || canReport(roles, own?.groupId || '', s.groupId);
    const ids = new Set(students.filter(visibleStudent).map(s => s.id));
    // Aggregates are public within the class, detailed records remain scoped server-side.
    const weekly = [...new Set([monday(), ...entries.map(e => e.week), ...periods.map(p => p.week), ...reports.map(r => r.week)])];
    const ranks = Object.fromEntries(weekly.map(w => { const p = periods.find(p => p.week === w && p.status === 'locked'); return [w, p ? parse<Row>(p.snapshot, {}).standings : snapshot(groups, students, entries.filter(e => e.week === w), c.config).standings]; }));
    const historyScores = Object.fromEntries(periods.filter(p => p.status === 'locked').map(p => { const sn = parse<Row>(p.snapshot, {}); return [p.week, (sn.students || []).filter((s: Row) => ids.has(s.id)).map((s: Row) => ({ id: s.id, name: s.name, groupId: s.groupId, score: s.score }))]; }));
    common.detail = { ...c.cls, config: c.config, teacher, ownId: own?.id, roles, groups, students: students.map(s => teacher ? s : ({ ...s, email: s.id === own?.id ? s.email : '', roles: s.roles })), periods: periods.map(p => ({ ...p, snapshot: undefined })), entries: entries.filter(e => ids.has(e.studentId)), reports: reports.map(r => teacher || canReport(roles, own?.groupId || '', r.groupId) ? r : { ...r, note: '', createdBy: '' }), grades: grades.filter(g => (teacher || g.studentId === own?.id) && (g.confirmed || g.createdBy === user.email)), conduct: conduct.filter(x => teacher || x.studentId === own?.id), fundSummary: {income: funds.filter(f=>f.status==='approved'&&f.type==='income').reduce((n,f)=>n+f.amount,0),expense:funds.filter(f=>f.status==='approved'&&f.type==='expense').reduce((n,f)=>n+f.amount,0)}, funds: funds.filter(f => teacher || roles.includes('treasurer') || (f.status === 'approved' && (!f.studentId || f.studentId === own?.id))).map(f => teacher || roles.includes('treasurer') ? f : { ...f, proof: '', createdBy: '' }), activities, duties, notices, feedback: feedback.filter(f => teacher || f.createdBy === user.email), audit, ranks, historyScores };
    return common;
}
export async function action(b: Row) {
    const actionName = str(b.action, 50);
    if (['createClass', 'saveAccount'].includes(actionName)) {
        const { db, user } = await identity();
        if (user.role !== 'admin')
            fail(403, 'Chỉ quản trị viên có quyền này');
        if (actionName === 'saveAccount') {
            const e = email(b.email);
            if (e === user.email && (!b.active || b.role !== 'admin'))
                fail(400, 'Không thể tự khóa hoặc hạ quyền quản trị của mình');
            const owner = await db.select().from(t.settings).where(eq(t.settings.key, 'owner')).get();
            if (e === owner?.value && (b.role !== 'admin' || !b.active))
                fail(400, 'Không thể hạ quyền tài khoản chủ sở hữu');
            if (!['admin', 'teacher', 'student'].includes(b.role))
                fail(400, 'Vai trò không hợp lệ');
            await db.insert(t.users).values({ email: e, name: str(b.name, 100), role: b.role, active: b.active ? 1 : 0 }).onConflictDoUpdate({ target: t.users.email, set: { name: str(b.name, 100), role: b.role, active: b.active ? 1 : 0 } });
        }
        else {
            const e = email(b.teacherEmail);
            const teacher = await db.select().from(t.users).where(eq(t.users.email, e)).get();
            if (!teacher?.active || !['admin', 'teacher'].includes(teacher.role))
                fail(400, 'Hãy cấp tài khoản giáo viên trước');
            const id = uid();
            const values = [{ id, name: str(b.name, 50), year: str(b.year, 30), teacherEmail: e, config: JSON.stringify(defaultConfig), createdAt: now() }];
            await db.batch([db.insert(t.classes).values(values), db.insert(t.groups).values(Array.from({ length: amount(b.groupCount || 4, 1, 12) }, (_, i) => ({ id: uid(), classId: id, name: 'Tổ ' + (i + 1) })))]);
        }
        await log(db, user, null, actionName, { email: b.email || '', name: b.name });
        return { ok: true };
    }
    const c = await context(str(b.classId, 100));
    const { db, user, cls, teacher, own, roles, config } = c;
    const classId = cls.id;
    const needTeacher = () => { if (!teacher)
        fail(403, 'Chỉ giáo viên phụ trách hoặc admin có quyền này'); };
    const student = async (id: any) => { const s = await db.select().from(t.students).where(and(eq(t.students.id, str(id, 100)), eq(t.students.classId, classId), eq(t.students.active, 1))).get(); if (!s)
        fail(400, 'Học sinh không thuộc lớp hoặc đã lưu trữ'); return s; };
    const reportPermission = (gid: string) => { if (!teacher && !canReport(roles, own?.groupId || '', gid))
        fail(403, 'Bạn chỉ được báo cáo trong phạm vi được phân công'); };
    const openWeek = async (w: string) => { const p = await db.select().from(t.periods).where(and(eq(t.periods.classId, classId), eq(t.periods.week, w))).get(); if (p?.status === 'locked')
        fail(409, 'Tuần đã chốt. Dữ liệu không thể chỉnh sửa'); };
    const commands: any[] = [];
    const add = (query: any) => commands.push(query);
    const allStudents = () => db.select().from(t.students).where(eq(t.students.classId, classId));
    const allGroups = () => db.select().from(t.groups).where(eq(t.groups.classId, classId));
    switch (actionName) {
        case 'updateClass': {
            needTeacher();
            const update: Row = { name: str(b.name, 50), year: str(b.year, 30) };
            if (user.role === 'admin' && b.teacherEmail) {
                const e = email(b.teacherEmail);
                const u = await db.select().from(t.users).where(eq(t.users.email, e)).get();
                if (!u?.active || !['admin', 'teacher'].includes(u.role))
                    fail(400, 'Tài khoản giáo viên chưa hợp lệ');
                update.teacherEmail = e;
            }
            add(db.update(t.classes).set(update).where(eq(t.classes.id, classId)));
            break;
        }
        case 'addGroup': {
            needTeacher();
            const gs = await allGroups();
            if (gs.length >= 12)
                fail(400, 'Tối đa 12 tổ');
            const name = str(b.name, 50);
            if (gs.some(g => g.name === name))
                fail(400, 'Tên tổ đã tồn tại');
            add(db.insert(t.groups).values({ id: uid(), classId, name }));
            break;
        }
        case 'saveConfig':
            needTeacher();
            add(db.update(t.classes).set({ config: JSON.stringify(validateConfig(b.config)) }).where(eq(t.classes.id, classId)));
            break;
        case 'saveStudent': {
            needTeacher();
            const gs = await allGroups();
            if (!gs.some(g => g.id === b.groupId))
                fail(400, 'Tổ không thuộc lớp');
            const e = email(b.email);
            const name = str(b.name, 100);
            const r = b.roles || [];
            if (!Array.isArray(r) || r.some(x => !['leader', 'study', 'discipline', 'movement', 'group', 'treasurer'].includes(x)))
                fail(400, 'Chức vụ không hợp lệ');
            const rows = await allStudents();
            if (rows.some(s => s.email === e && s.id !== b.id))
                fail(400, 'Email đã có trong lớp');
            if (r.includes('leader') && rows.some(s => s.active && s.id !== b.id && parse<string[]>(s.roles, []).includes('leader')))
                fail(400, 'Hãy miễn nhiệm lớp trưởng hiện tại trước');
            if (r.includes('group') && rows.some(s => s.active && s.id !== b.id && s.groupId === b.groupId && parse<string[]>(s.roles, []).includes('group')))
                fail(400, 'Tổ này đã có tổ trưởng');
            const v = { name, email: e, groupId: b.groupId, gender: ['male', 'female', 'other'].includes(b.gender) ? b.gender : 'other', roles: JSON.stringify(r) };
            if (b.id) {
                await student(b.id);
                add(db.update(t.students).set(v).where(eq(t.students.id, b.id)));
            }
            else
                add(db.insert(t.students).values({ id: uid(), classId, ...v }));
            add(db.insert(t.users).values({ email: e, name, role: 'student', active: 1 }).onConflictDoNothing());
            break;
        }
        case 'importStudents': {
            needTeacher();
            if (!Array.isArray(b.rows) || !b.rows.length || b.rows.length > 200)
                fail(400, 'Nhập từ 1–200 học sinh mỗi lần');
            const gs = await allGroups();
            const existing = await allStudents();
            const seen = new Set(existing.map(s => s.email));
            for (const row of b.rows) {
                const e = email(row.email);
                if (seen.has(e))
                    fail(400, 'Email bị trùng: ' + e);
                seen.add(e);
                const g = gs.find(g => g.name === row.group || g.id === row.group);
                if (!g)
                    fail(400, 'Không tìm thấy tổ: ' + row.group);
                const name = str(row.name, 100);
                add(db.insert(t.students).values({ id: uid(), classId, name, email: e, groupId: g.id, gender: row.gender === 'male' ? 'male' : row.gender === 'female' ? 'female' : 'other', roles: '[]' }));
                add(db.insert(t.users).values({ email: e, name, role: 'student', active: 1 }).onConflictDoNothing());
            }
            break;
        }
        case 'archiveStudent': {
            needTeacher();
            await student(b.id);
            add(db.update(t.students).set({ active: 0, roles: '[]', seat: '' }).where(eq(t.students.id, b.id)));
            break;
        }
        case 'saveSeats': {
            needTeacher();
            if (!Array.isArray(b.seats))
                fail(400, 'Sơ đồ chưa hợp lệ');
            const seen = new Set();
            const ids = new Set();
            for (const item of b.seats) {
                await student(item.id);
                if (ids.has(item.id))
                    fail(400, 'Học sinh bị lặp');
                ids.add(item.id);
                const n = amount(item.seat, 1, config.rows * config.cols);
                if (seen.has(n))
                    fail(400, 'Một chỗ chỉ có một học sinh');
                seen.add(n);
            }
            add(db.update(t.students).set({ seat: '' }).where(eq(t.students.classId, classId)));
            for (const item of b.seats)
                add(db.update(t.students).set({ seat: String(item.seat) }).where(eq(t.students.id, item.id)));
            break;
        }
        case 'addEntry': {
            const s = await student(b.studentId);
            reportPermission(s.groupId);
            const w = week(b.week);
            await openWeek(w);
            const r = config.rules.find(r => r.id === b.ruleId);
            if (!r)
                fail(400, 'Không tìm thấy quy tắc');
            const count = amount(b.count || 1, 1, 100);
            const rep = await db.select().from(t.reports).where(and(eq(t.reports.classId, classId), eq(t.reports.week, w), eq(t.reports.groupId, s.groupId))).get();
            if (rep && rep.status !== 'returned')
                fail(409, 'Báo cáo tổ đã gửi; giáo viên cần trả lại trước khi bổ sung');
            const old = await db.select().from(t.entries).where(and(eq(t.entries.classId, classId), eq(t.entries.week, w), eq(t.entries.studentId, s.id)));
            const valid = old.filter(e => e.status !== 'rejected');
            if (r.limit && valid.filter(e => e.ruleId === r.id).reduce((n, e) => n + e.count, 0) + count > r.limit)
                fail(400, 'Vượt giới hạn quy tắc trong tuần');
            if (r.category === 'speaking' && valid.some(e => e.category === 'speaking'))
                fail(400, 'Mỗi học sinh chỉ áp dụng một mốc phát biểu mỗi tuần');
            if (r.id.startsWith('grade') && count !== 1)
                fail(400, 'Mỗi điểm kiểm tra cần một ghi nhận riêng');
            const grade = b.grade ? String(Number(b.grade)) : r.id === 'grade8' ? '8' : r.id === 'grade9' ? '9' : r.id === 'grade10' ? '10' : '';
            if (['grade8', 'grade9', 'grade10'].includes(r.id) && grade !== r.id.slice(5))
                fail(400, 'Điểm kiểm tra phải khớp quy tắc đã chọn');
            if (grade && (!Number.isFinite(Number(grade)) || Number(grade) < 0 || Number(grade) > 10))
                fail(400, 'Điểm phải từ 0 đến 10');
            add(db.insert(t.entries).values({ id: uid(), classId, week: w, studentId: s.id, groupId: s.groupId, ruleId: r.id, ruleName: r.name, category: r.category, delta: r.points * count, count, status: 'pending', note: String(b.note || '').slice(0, 2000), proof: safeUrl(b.proof), grade, subject: String(b.subject || '').slice(0, 100), createdBy: user.email, createdAt: now() }));
            break;
        }
        case 'submitReport': {
            const w = week(b.week);
            await openWeek(w);
            reportPermission(str(b.groupId, 100));
            if (!(await allGroups()).some(g => g.id === b.groupId))
                fail(400, 'Tổ không thuộc lớp');
            const rep = await db.select().from(t.reports).where(and(eq(t.reports.classId, classId), eq(t.reports.week, w), eq(t.reports.groupId, b.groupId))).get();
            if (rep && rep.status !== 'returned')
                fail(409, 'Báo cáo đã gửi');
            add(db.insert(t.reports).values({ id: uid(), classId, week: w, groupId: b.groupId, status: 'submitted', note: String(b.note || '').slice(0, 2000), createdBy: user.email }).onConflictDoUpdate({ target: [t.reports.classId, t.reports.week, t.reports.groupId], set: { status: 'submitted', note: String(b.note || '').slice(0, 2000), createdBy: user.email } }));
            break;
        }
        case 'reviewReport': {
            needTeacher();
            const rep = await db.select().from(t.reports).where(and(eq(t.reports.id, b.id), eq(t.reports.classId, classId))).get();
            if (!rep)
                fail(404, 'Không có báo cáo');
            await openWeek(rep.week);
            if (!['approved', 'returned'].includes(b.status))
                fail(400, 'Trạng thái không hợp lệ');
            const note = b.status === 'returned' ? str(b.note, 2000) : String(b.note || '').slice(0, 2000);
            add(db.update(t.reports).set({ status: b.status, note }).where(eq(t.reports.id, rep.id)));
            add(db.update(t.entries).set({ status: b.status === 'approved' ? 'approved' : 'pending', reviewNote: note }).where(and(eq(t.entries.classId, classId), eq(t.entries.week, rep.week), eq(t.entries.groupId, rep.groupId), sql `${t.entries.status} != 'rejected'`)));
            break;
        }
        case 'rejectEntry': {
            needTeacher();
            const e = await db.select().from(t.entries).where(and(eq(t.entries.id, b.id), eq(t.entries.classId, classId))).get();
            if (!e)
                fail(404, 'Không có ghi nhận');
            await openWeek(e.week);
            add(db.update(t.entries).set({ status: 'rejected', reviewNote: str(b.note, 2000) }).where(eq(t.entries.id, e.id)));
            break;
        }
        case 'lockWeek': {
            needTeacher();
            const w = week(b.week);
            await openWeek(w);
            const gs = await allGroups();
            const sts = await allStudents();
            if (!sts.some(s => s.active))
                fail(400, 'Lớp chưa có học sinh');
            const rs = await db.select().from(t.reports).where(and(eq(t.reports.classId, classId), eq(t.reports.week, w)));
            if (gs.some(g => sts.some(s => s.groupId === g.id && s.active) && !rs.some(r => r.groupId === g.id && r.status === 'approved')))
                fail(400, 'Cần duyệt báo cáo của tất cả tổ có học sinh trước khi chốt');
            const es = await db.select().from(t.entries).where(and(eq(t.entries.classId, classId), eq(t.entries.week, w)));
            if (es.some(e => e.status === 'pending'))
                fail(400, 'Vẫn còn ghi nhận chưa được duyệt');
            const sn = snapshot(gs, sts, es, config);
            add(db.insert(t.periods).values({ id: uid(), classId, week: w, status: 'locked', snapshot: JSON.stringify(sn), createdAt: now() }));
            for (const d of dutyPlan(sn, w, config))
                add(db.insert(t.duties).values({ id: uid(), classId, ...d } as any).onConflictDoNothing());
            break;
        }
        case 'addGrade': {
            const s = await student(b.studentId);
            if (!teacher && s.id !== own?.id)
                fail(403, 'Chỉ được tự ghi điểm của mình');
            const v = Number(b.value);
            if (!Number.isFinite(v) || v < 0 || v > 10)
                fail(400, 'Điểm phải từ 0 đến 10');
            add(db.insert(t.grades).values({ id: uid(), classId, studentId: s.id, subject: str(b.subject, 100), value: String(v), date: date(b.date), note: String(b.note || '').slice(0, 1000), createdBy: user.email, confirmed: teacher ? 1 : 0 }));
            break;
        }
        case 'deleteGrade': {
            const g = await db.select().from(t.grades).where(and(eq(t.grades.id, b.id), eq(t.grades.classId, classId))).get();
            if (!g)
                fail(404, 'Không tìm thấy điểm');
            if (!teacher && (g.createdBy !== user.email || g.confirmed))
                fail(403, 'Không thể xóa điểm đã xác nhận');
            add(db.delete(t.grades).where(eq(t.grades.id, g.id)));
            break;
        }
        case 'addConduct': {
            needTeacher();
            const s = await student(b.studentId);
            if (!['Tốt', 'Khá', 'Đạt', 'Chưa đạt', 'Nhắc nhở', 'Phê bình'].includes(b.level))
                fail(400, 'Mức đánh giá không hợp lệ');
            add(db.insert(t.conduct).values({ id: uid(), classId, studentId: s.id, period: str(b.period, 50), level: b.level, reason: str(b.reason, 2000), createdBy: user.email, createdAt: now() }));
            break;
        }
        case 'addFeedback': {
            const s = await student(b.studentId);
            if (!teacher && s.id !== own?.id && !canReport(roles, own?.groupId || '', s.groupId))
                fail(403, 'Không được nhận xét học sinh ngoài phạm vi');
            if (b.entryId) {
                const e = await db.select().from(t.entries).where(and(eq(t.entries.id, b.entryId), eq(t.entries.classId, classId))).get();
                if (!e || e.studentId !== s.id)
                    fail(400, 'Ghi nhận không thuộc học sinh này');
            }
            add(db.insert(t.feedback).values({ id: uid(), classId, studentId: s.id, entryId: b.entryId || null, message: str(b.message, 2000), createdBy: user.email, createdAt: now() }));
            break;
        }
        case 'resolveFeedback': {
            needTeacher();
            const f = await db.select().from(t.feedback).where(and(eq(t.feedback.id, b.id), eq(t.feedback.classId, classId))).get();
            if (!f)
                fail(404, 'Không có phản hồi');
            add(db.update(t.feedback).set({ response: str(b.response, 2000), status: 'resolved' }).where(eq(t.feedback.id, f.id)));
            break;
        }
        case 'addFund': {
            if (!teacher && !roles.includes('treasurer'))
                fail(403, 'Chỉ thủ quỹ hoặc giáo viên được ghi thu chi');
            if (!['income', 'expense'].includes(b.type))
                fail(400, 'Loại giao dịch không hợp lệ');
            if (b.studentId)
                await student(b.studentId);
            add(db.insert(t.funds).values({ id: uid(), classId, type: b.type, amount: amount(b.amount, 1), studentId: b.studentId || null, description: str(b.description, 500), date: date(b.date), proof: safeUrl(b.proof), status: teacher ? 'approved' : 'pending', createdBy: user.email }));
            break;
        }
        case 'reviewFund': {
            needTeacher();
            const f = await db.select().from(t.funds).where(and(eq(t.funds.id, b.id), eq(t.funds.classId, classId))).get();
            if (!f || f.status !== 'pending')
                fail(400, 'Chỉ duyệt giao dịch đang chờ');
            if (!['approved', 'rejected'].includes(b.status))
                fail(400, 'Trạng thái không hợp lệ');
            add(db.update(t.funds).set({ status: b.status }).where(eq(t.funds.id, f.id)));
            break;
        }
        case 'reverseFund': {
            needTeacher();
            const f = await db.select().from(t.funds).where(and(eq(t.funds.id, b.id), eq(t.funds.classId, classId))).get();
            if (!f || f.status !== 'approved')
                fail(400, 'Giao dịch không thể đảo');
            const prior = await db.select().from(t.funds).where(and(eq(t.funds.classId, classId), eq(t.funds.id, 'reverse-' + f.id))).get();
            if (prior)
                fail(409, 'Đã có giao dịch điều chỉnh');
            add(db.insert(t.funds).values({ id: 'reverse-' + f.id, classId, type: f.type === 'income' ? 'expense' : 'income', amount: f.amount, studentId: f.studentId, description: 'Điều chỉnh ' + f.description + ': ' + str(b.reason, 500), date: new Date().toISOString().slice(0, 10), proof: '', status: 'approved', createdBy: user.email }));
            break;
        }
        case 'addActivity': {
            if (!teacher && !roles.includes('movement') && !roles.includes('leader'))
                fail(403, 'Chỉ cán sự phụ trách hoặc giáo viên được tạo hoạt động');
            add(db.insert(t.activities).values({ id: uid(), classId, title: str(b.title, 150), description: String(b.description || '').slice(0, 2000), date: date(b.date), points: amount(b.points, 0, 1000), participants: '[]', status: 'open' }));
            break;
        }
        case 'joinActivity': {
            const a = await db.select().from(t.activities).where(and(eq(t.activities.id, b.id), eq(t.activities.classId, classId))).get();
            if (!a || a.status !== 'open')
                fail(400, 'Hoạt động đã kết thúc');
            const s = await student(b.studentId || own?.id);
            if (!teacher && s.id !== own?.id)
                fail(403, 'Chỉ được đăng kí cho mình');
            const ids = parse<string[]>(a.participants, []);
            const next = ids.includes(s.id) ? ids.filter(i => i !== s.id) : [...ids, s.id];
            add(db.update(t.activities).set({ participants: JSON.stringify(next) }).where(eq(t.activities.id, a.id)));
            break;
        }
        case 'completeActivity': {
            needTeacher();
            const a = await db.select().from(t.activities).where(and(eq(t.activities.id, b.id), eq(t.activities.classId, classId))).get();
            if (!a || a.status !== 'open')
                fail(400, 'Hoạt động đã kết thúc');
            const w = monday(new Date(a.date));
            await openWeek(w);
            const participants = parse<string[]>(a.participants, []);
            if (!participants.length)
                fail(400, 'Chưa có người tham gia');
            for (const id of participants) {
                const s = await student(id);
                add(db.insert(t.entries).values({ id: uid(), classId, week: w, studentId: s.id, groupId: s.groupId, ruleId: 'activity-' + a.id, ruleName: a.title, category: 'movement', delta: a.points, count: 1, status: 'approved', note: 'Thành tích phong trào được giáo viên xác nhận', createdBy: user.email, createdAt: now() }));
            }
            add(db.update(t.activities).set({ status: 'completed' }).where(eq(t.activities.id, a.id)));
            break;
        }
        case 'addDuty': {
            needTeacher();
            const s = await student(b.studentId);
            add(db.insert(t.duties).values({ id: uid(), classId, studentId: s.id, date: date(b.date), task: str(b.task, 100), source: str(b.source || 'Giáo viên phân công', 300), sourceKey: uid(), status: 'assigned' }));
            break;
        }
        case 'updateDuty': {
            const d = await db.select().from(t.duties).where(and(eq(t.duties.id, b.id), eq(t.duties.classId, classId))).get();
            if (!d)
                fail(404, 'Không có lịch trực');
            const reviewer = teacher || roles.includes('leader') || roles.includes('discipline');
            if (!reviewer && d.studentId !== own?.id)
                fail(403, 'Không thể cập nhật lịch trực của người khác');
            if (!reviewer && b.status !== 'submitted')
                fail(403, 'Học sinh chỉ được báo đã làm');
            if (!['assigned', 'submitted', 'completed', 'redo'].includes(b.status))
                fail(400, 'Trạng thái không hợp lệ');
            add(db.update(t.duties).set({ status: b.status }).where(eq(t.duties.id, d.id)));
            break;
        }
        case 'addNotice': {
            if (!teacher && !roles.includes('leader'))
                fail(403, 'Chỉ giáo viên hoặc lớp trưởng được đăng thông báo');
            add(db.insert(t.notices).values({ id: uid(), classId, title: str(b.title, 150), body: str(b.body, 3000), createdBy: user.email, createdAt: now() }));
            break;
        }
        case 'sampleClass': {
            needTeacher();
            if ((await allStudents()).length)
                fail(400, 'Chỉ tạo dữ liệu mẫu cho lớp trống');
            const gs = await allGroups();
            const names = ['Nguyễn Minh Anh', 'Trần Quốc Bảo', 'Lê Ngọc Chi', 'Phạm Anh Dũng', 'Hoàng Khánh Linh', 'Vũ Đức Huy', 'Đặng Phương Thảo', 'Bùi Gia Khang', 'Đỗ Hà My', 'Ngô Tuấn Kiệt', 'Dương Thanh Mai', 'Lý Nhật Nam', 'Nguyễn Bảo Ngọc', 'Trần Minh Quân', 'Lê Tú Uyên', 'Phạm Hoàng Sơn'];
            names.forEach((name, i) => { const id = uid(); add(db.insert(t.students).values({ id, classId, name, email: `hocsinh${i + 1}@example.invalid`, groupId: gs[i % gs.length].id, gender: i % 2 ? 'male' : 'female', roles: JSON.stringify(i === 0 ? ['leader'] : i < gs.length ? ['group'] : i === 4 ? ['treasurer'] : []), seat: String(i + 1) })); });
            add(db.insert(t.notices).values({ id: uid(), classId, title: 'Chào lớp mình 👋', body: 'Đây là dữ liệu minh họa. Hãy tạo lớp riêng và nhập danh sách thật khi bắt đầu sử dụng.', createdBy: user.email, createdAt: now() }));
            break;
        }
        default: fail(400, 'Thao tác không được hỗ trợ');
    }
    if (!commands.length)
        fail(400, 'Không có thay đổi');
    const guardId = uid();
    // D1 batch rolls back on a failed CHECK. A class revision protects read/compute/write
    // operations, so a concurrent approval cannot silently invalidate a weekly snapshot.
    const guarded = [db.insert(t.guards).values({ id: guardId, ok: sql `CASE WHEN (SELECT revision FROM classes WHERE id = ${classId}) = ${cls.revision} THEN 1 ELSE 0 END` }), ...commands, db.update(t.classes).set({ revision: cls.revision + 1 }).where(eq(t.classes.id, classId)), db.insert(t.audit).values({ id: uid(), classId, actor: user.email, action: actionName, details: JSON.stringify({ ...b, action: undefined }).slice(0, 30000), createdAt: now() }), db.delete(t.guards).where(eq(t.guards.id, guardId))];
    try {
        await db.batch(guarded as any);
    }
    catch (e) {
        if (String(e).includes('guard_ok'))
            fail(409, 'Dữ liệu vừa được cập nhật. Tải lại rồi thử lại.');
        throw e;
    }
    return { ok: true };
}
