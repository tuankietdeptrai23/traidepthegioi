import {academicGrade,academicBand,academicPrefix} from './academic-grid';
import { eq, and, or, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import * as t from '@/db/schema';
import { currentUser, safeUser, normalizeLogin, passwordRecord } from './auth';
import { defaultConfig, parse, canReport, monday, snapshot, dutyPlan, validateConfig, ruleScore, needsLearningSubject, cleanSubject, studentLoginBase, seatGroupIndex, type Row, type Config } from './domain';
export class HttpError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
function fail(s: number, m: string): never { throw new HttpError(s, m); }
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const str = (v: any, max = 300) => typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : fail(400, 'Thông tin còn thiếu hoặc quá dài');
const email = (v:any) => {const value=str(v,200).toLowerCase(); if(!/^[a-z0-9][a-z0-9_.@-]{1,199}$/.test(value))fail(400,'ID tài khoản không hợp lệ');return value};
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
    const user=await currentUser();
    if(!user)fail(401,'Đăng nhập bằng ID và mật khẩu do admin cấp.');
    return {db:getDb(),user};
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
    const common: Row = { user:safeUser(user), classes: allowed.map(c => ({ ...c, config: parse(c.config, defaultConfig) })), users: user.role === 'admin' ? (await db.select().from(t.users)).map(safeUser) : [], placementGroups:user.role==='admin'?await db.select().from(t.groups):[], accountMemberships:user.role==='admin'?await db.select({account:t.students.email,classId:t.students.classId,groupId:t.students.groupId}).from(t.students).where(eq(t.students.active,1)):[] };
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
    const sheets=Object.fromEntries(weekly.map(w=>{const locked=periods.find(p=>p.week===w&&p.status==='locked');const snap=locked?parse<Row>(locked.snapshot,{}):null;const rules=(snap?.config||c.config).rules;const roster=(snap?.students||students).filter((s:Row)=>s.active);const records=(snap?.entries||entries.filter(e=>e.week===w));return [w,{rules,base:(snap?.config||c.config).base,rows:roster.map((s:Row)=>{const editable=teacher||canReport(roles,own?.groupId||'',s.groupId);const seen=records.filter((e:Row)=>e.studentId===s.id&&e.groupId===s.groupId&&(e.status==='approved'||(editable&&e.status==='pending')));return {id:s.id,name:s.name,groupId:s.groupId,previewScore:(snap?s.score:c.config.base+seen.reduce((n:number,e:Row)=>n+e.delta,0)),subjectCounts:Object.fromEntries(seen.filter((e:Row)=>e.subject&&rules.some((r:Row)=>r.id===e.ruleId&&needsLearningSubject(r))).map((e:Row)=>[e.ruleId+'|'+e.subject,seen.filter((x:Row)=>x.ruleId===e.ruleId&&x.subject===e.subject).reduce((n:number,x:Row)=>n+x.count,0)])),counts:Object.fromEntries(rules.map((r:Row)=>[r.id,r.kind==='speaking-total'?(seen.find((e:Row)=>e.ruleId===r.id)?.count??0):seen.filter((e:Row)=>e.ruleId===r.id).reduce((n:number,e:Row)=>n+e.count,0)])),recorded:Object.fromEntries(rules.filter((r:Row)=>r.kind==='speaking-total').map((r:Row)=>[r.id,seen.some((e:Row)=>e.ruleId===r.id)])),score:snap?s.score:c.config.base+records.filter((e:Row)=>e.studentId===s.id&&e.status==='approved').reduce((n:number,e:Row)=>n+e.delta,0)}})}]}));
    common.detail = { ...c.cls, config: c.config, teacher, ownId: own?.id, roles, groups, students: students.map(s => teacher ? s : ({ ...s, email: s.id === own?.id ? s.email : '', roles: s.roles })), periods: periods.map(p => ({ ...p, snapshot: undefined })), entries: entries.filter(e => ids.has(e.studentId)), reports: reports.map(r => teacher || canReport(roles, own?.groupId || '', r.groupId) ? r : { ...r, note: '', createdBy: '' }), grades: grades.filter(g => (teacher || g.studentId === own?.id) && (g.confirmed || g.createdBy === user.email)), conduct: conduct.filter(x => teacher || x.studentId === own?.id), fundSummary: {income: funds.filter(f=>f.status==='approved'&&f.type==='income').reduce((n,f)=>n+f.amount,0),expense:funds.filter(f=>f.status==='approved'&&f.type==='expense').reduce((n,f)=>n+f.amount,0)}, funds: funds.filter(f => teacher || roles.includes('treasurer') || (f.status === 'approved' && (!f.studentId || f.studentId === own?.id))).map(f => teacher || roles.includes('treasurer') ? f : { ...f, proof: '', createdBy: '' }), activities, duties, notices, feedback: feedback.filter(f => teacher || f.createdBy === user.email), audit, ranks, historyScores, sheets };
    return common;
}
export async function action(b: Row) {
    const actionName = str(b.action, 50);
    if (['createClass', 'saveAccount'].includes(actionName)) {
        const { db, user } = await identity();
        if (user.role !== 'admin')
            fail(403, 'Chỉ quản trị viên có quyền này');
        if (actionName === 'saveAccount') {
            const loginId=normalizeLogin(b.loginId);
            const e=b.email?email(b.email):loginId;
            const previous=await db.select().from(t.users).where(eq(t.users.email,e)).get();
            const used=await db.select().from(t.users).where(eq(t.users.loginId,loginId)).get();
            if(used&&used.email!==e)fail(409,'ID đã tồn tại. Hãy chọn ID khác.');
            if (e === user.email && (!b.active || b.role !== 'admin'))fail(400,'Không thể tự khóa hoặc hạ quyền quản trị của mình');
            const owner=await db.select().from(t.settings).where(eq(t.settings.key,'owner')).get();
            if(e===owner?.value&&(b.role!=='admin'||!b.active))fail(400,'Không thể hạ quyền tài khoản chủ sở hữu');
            if(!['admin','teacher','student'].includes(b.role))fail(400,'Vai trò không hợp lệ');
            if(!previous&&!b.password)fail(400,'Cần đặt mật khẩu cho tài khoản mới.');
            const creds=b.password?await passwordRecord(b.password):{};
            const value={email:e,name:str(b.name,100),role:b.role,active:b.active?1:0,loginId,...creds,credentialVersion:(previous?.credentialVersion||0)+(b.password?1:0),mustChangePassword:b.password?(b.password==='12345678'?1:0):(previous?.mustChangePassword||0)};
            const ops:any[]=[db.insert(t.users).values(value).onConflictDoUpdate({target:t.users.email,set:value}),db.update(t.students).set({name:value.name}).where(eq(t.students.email,e))];
            if(b.password||!b.active)ops.push(db.delete(t.sessions).where(eq(t.sessions.userKey,e)));
            if(b.groupId){
                if(b.role!=='student')fail(400,'Chỉ xếp học sinh vào tổ. Giáo viên được phân công ở phần lớp học.');
                const group=await db.select().from(t.groups).where(eq(t.groups.id,str(b.groupId,100))).get();
                if(!group)fail(400,'Không tìm thấy tổ.');
                const member=await db.select().from(t.students).where(and(eq(t.students.classId,group.classId),eq(t.students.email,e))).get();
                if(member)ops.push(db.update(t.students).set({name:value.name,groupId:group.id,active:1,roles:member.groupId===group.id?member.roles:JSON.stringify(parse<string[]>(member.roles,[]).filter(r=>r!=='group'))}).where(eq(t.students.id,member.id)));
                else ops.push(db.insert(t.students).values({id:uid(),classId:group.classId,name:value.name,email:e,groupId:group.id,gender:b.gender==='male'?'male':b.gender==='female'?'female':'other',roles:'[]'}));
                ops.push(db.update(t.classes).set({revision:sql`${t.classes.revision}+1`}).where(eq(t.classes.id,group.classId)));
            }
            ops.push(db.insert(t.audit).values({id:uid(),classId:null,actor:user.email,action:'saveAccount',details:JSON.stringify({account:e,loginId,role:b.role,active:!!b.active,passwordReset:!!b.password,groupId:b.groupId||null}),createdAt:now()}));
            await db.batch(ops as any);return {ok:true};
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
        case 'reorderRules': {
            needTeacher();const ids=b.ruleIds;if(!Array.isArray(ids)||ids.length!==config.rules.length||new Set(ids).size!==ids.length||ids.some((id:any)=>typeof id!=='string'||!config.rules.some(r=>r.id===id)))fail(400,'Thứ tự phải chứa đủ các quy tắc hiện tại, không trùng hoặc thêm quy tắc.');
            const rules=ids.map((id:string)=>config.rules.find(r=>r.id===id)!);add(db.update(t.classes).set({config:JSON.stringify({...config,rules})}).where(eq(t.classes.id,classId)));break;
        }
        case 'saveConfig': {
            needTeacher();
            let checked: Config;
            try { checked=validateConfig(b.config); }
            catch (e) { fail(400, e instanceof Error ? e.message : 'Cấu hình chưa hợp lệ'); }
            add(db.update(t.classes).set({ config: JSON.stringify(checked) }).where(eq(t.classes.id, classId)));
            break;
        }
        case 'saveStudent': {
            needTeacher();
            const gs = await allGroups();
            if (!gs.some(g => g.id === b.groupId))
                fail(400, 'Tổ không thuộc lớp');
            const provided=email(b.email);
            const found=await db.select().from(t.users).where(or(eq(t.users.email,provided),eq(t.users.loginId,provided))).get();
            const e=found?.email||provided;
            const linked=await db.select().from(t.users).where(eq(t.users.email,e)).get();
            if(!linked||linked.role!=='student')fail(400,'ID chưa được admin cấp tài khoản học sinh.');
            const name = str(b.name, 100);
            const r = b.roles || [];
            if (!Array.isArray(r) || r.some(x => !['leader', 'study', 'discipline', 'movement', 'group', 'treasurer'].includes(x)))
                fail(400, 'Chức vụ không hợp lệ');
            const rows = await allStudents();
            if (rows.some(s => s.email === e && s.id !== b.id))
                fail(400, 'ID đã có trong lớp');
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
            
            break;
        }
        case 'importStudents': {
            needTeacher();
            if(!Array.isArray(b.rows)||!b.rows.length||b.rows.length>20)fail(400,'Mỗi lượt nhập tối đa 20 học sinh. Giao diện sẽ tự chia danh sách dài.');
            const gs=(await allGroups()).sort((a,b)=>a.name.localeCompare(b.name,'vi',{numeric:true}));
            if(!gs.length)fail(400,'Lớp chưa có tổ.');
            const existing=await allStudents();const seen=new Set(existing.map(x=>x.email));
            const accounts=await db.select().from(t.users);const taken=new Set(accounts.flatMap(x=>[x.email,x.loginId||'']));
            const created:Row[]=[];
            for(const row of b.rows){
                const name=str(row.name,100);let e:string;
                if(row.email){const provided=email(row.email);const found=accounts.find(x=>x.email===provided||x.loginId===provided);e=found?.email||provided;
                    if(!found||found.role!=='student')fail(400,'ID chưa được cấp: '+provided);
                }else{const base=studentLoginBase(name);let id=base;let suffix=2;while(taken.has(id)){id=base+suffix++;}taken.add(id);e=id;const creds=await passwordRecord('12345678');
                    add(db.insert(t.users).values({email:id,loginId:id,name,role:'student',active:1,...creds,credentialVersion:1,mustChangePassword:1}));
                    created.push({name,loginId:id});
                }
                if(seen.has(e))fail(400,'ID bị trùng trong lớp: '+e);seen.add(e);
                const g=row.group?gs.find(x=>x.name===row.group||x.id===row.group):gs[0];if(!g)fail(400,'Không tìm thấy tổ: '+row.group);
                add(db.insert(t.students).values({id:uid(),classId,name,email:e,groupId:g.id,gender:row.gender==='male'?'male':row.gender==='female'?'female':'other',roles:'[]'}));
            }
            b._createdAccounts=created;
            break;
        }
        case 'archiveStudent': {
            needTeacher();
            await student(b.id);
            add(db.update(t.students).set({ active: 0, roles: '[]', seat: '' }).where(eq(t.students.id, b.id)));
            break;
        }
        case 'saveSeats': {
            needTeacher();if(!Array.isArray(b.seats)||b.seats.length>200)fail(400,'Sơ đồ chưa hợp lệ');
            const members=await allStudents();const gs=(await allGroups()).sort((a,b)=>a.name.localeCompare(b.name,'vi',{numeric:true}));
            if(gs.length>config.cols)fail(400,'Số chỗ mỗi hàng phải ít nhất bằng số tổ. Hãy tăng số cột trong cài đặt.');
            const seen=new Set();const ids=new Set();
            for(const item of b.seats){if(!members.some(x=>x.id===item.id&&x.active))fail(400,'Học sinh không thuộc lớp');if(ids.has(item.id))fail(400,'Học sinh bị lặp');ids.add(item.id);const n=amount(item.seat,1,config.rows*config.cols);if(seen.has(n))fail(400,'Một chỗ chỉ có một học sinh');seen.add(n);}
            add(db.update(t.students).set({seat:''}).where(eq(t.students.classId,classId)));
            for(const item of b.seats){const member=members.find(x=>x.id===item.id)!;const group=gs[seatGroupIndex(Number(item.seat),config.cols,gs.length)];
                add(db.update(t.students).set({seat:String(item.seat),groupId:group.id,roles:member.groupId===group.id?member.roles:JSON.stringify(parse<string[]>(member.roles,[]).filter(r=>r!=='group'))}).where(eq(t.students.id,item.id)));
            }break;
        }
        case 'saveAcademicSheet': {
            const w=week(b.week);await openWeek(w);const groupId=str(b.groupId,100);reportPermission(groupId);
            if(!(await allGroups()).some(g=>g.id===groupId))fail(403,'Tổ không thuộc lớp.');
            const subject=cleanSubject(b.subject);if(!subject)fail(400,'Chọn môn trước khi nhập bảng điểm.');const attempt=amount(b.attempt,1,5),prefix=academicPrefix(attempt);
            const report=await db.select().from(t.reports).where(and(eq(t.reports.classId,classId),eq(t.reports.week,w),eq(t.reports.groupId,groupId))).get();if(report&&report.status!=='returned')fail(409,'Báo cáo đã gửi. Cần trả lại trước khi sửa bảng.');
            if(!Array.isArray(b.cells)||!b.cells.length||b.cells.length>40)fail(400,'Mỗi lượt lưu tối đa 40 học sinh.');
            const members=await allStudents(),seen=new Set<string>(),changes:Row[]=[];
            for(const cell of b.cells){const member=members.find(s=>s.id===cell.studentId&&s.groupId===groupId&&s.active);if(!member)fail(403,'Chỉ được nhập học sinh thuộc tổ được giao.');if(seen.has(member.id))fail(400,'Học sinh bị lặp trong bảng.');seen.add(member.id);let grade:number|null=null,rule;try{grade=academicGrade(cell.grade);rule=grade===null?undefined:academicBand(config,grade)}catch(e){fail(400,(e as Error).message)}if(cell.note!==undefined&&(typeof cell.note!=='string'||cell.note.length>500))fail(400,'Ghi chú tối đa 500 ký tự.');changes.push({member,grade,rule,note:String(cell.note||'').trim()})}
            const old=await db.select().from(t.entries).where(and(eq(t.entries.classId,classId),eq(t.entries.week,w),eq(t.entries.groupId,groupId),eq(t.entries.subject,subject)));
            for(const change of changes){const prior=old.filter(e=>e.studentId===change.member.id&&e.ruleId.startsWith(prefix)&&e.status!=='rejected');for(const e of prior)add(db.update(t.entries).set({status:'rejected',reviewNote:'Thay thế bởi bảng điểm theo môn'}).where(eq(t.entries.id,e.id)))}
            const values=changes.filter(c=>c.grade!==null).map(c=>({id:uid(),classId,week:w,studentId:c.member.id,groupId,ruleId:prefix+'band-'+c.rule.min,ruleName:(c.rule.kind==='learned'?'Thuộc bài':'Không thuộc bài')+' · mốc từ '+c.rule.min+' điểm',category:'learning',delta:c.rule.points,count:1,status:'pending',note:c.note,proof:'',grade:String(c.grade),subject,createdBy:user.email,createdAt:now(),reviewNote:''}));for(let i=0;i<values.length;i+=4)add(db.insert(t.entries).values(values.slice(i,i+4)));break;
        }
        case 'saveSheet': {
            const w=week(b.week);await openWeek(w);const groupId=str(b.groupId,100);reportPermission(groupId);
            const rep=await db.select().from(t.reports).where(and(eq(t.reports.classId,classId),eq(t.reports.week,w),eq(t.reports.groupId,groupId))).get();
            if(rep&&rep.status!=='returned')fail(409,'Báo cáo đã gửi. Giáo viên cần trả lại trước khi sửa bảng.');
            if(!Array.isArray(b.cells)||!b.cells.length||b.cells.length>80)fail(400,'Mỗi lần lưu tối đa 80 ô đã thay đổi.');
            const members=await allStudents();const old=await db.select().from(t.entries).where(and(eq(t.entries.classId,classId),eq(t.entries.week,w),eq(t.entries.groupId,groupId)));
            const changes:Row[]=[];const keys=new Set();
            for(const cell of b.cells){const member=members.find(x=>x.id===cell.studentId&&x.groupId===groupId&&x.active);if(!member)fail(403,'Chỉ được nhập học sinh trong tổ được giao');const rule=config.rules.find(x=>x.id===cell.ruleId);if(!rule)fail(400,'Quy tắc đã thay đổi. Hãy tải lại bảng.');const count=cell.count===null&&rule.kind==='speaking-total'?null:amount(cell.count,0,100);if(rule.limit&&count!==null&&count>rule.limit)fail(400,'Vượt giới hạn quy tắc: '+rule.name);const subject=needsLearningSubject(rule)?cleanSubject(cell.subject):'';if(needsLearningSubject(rule)&&!subject)fail(400,'Chọn môn học trước khi ghi điểm thuộc bài / không thuộc bài.');const key=member.id+':'+rule.id+':'+subject;if(keys.has(key))fail(400,'Ô bị lặp');keys.add(key);changes.push({member,rule,count,subject});}
            for(const member of members.filter(x=>x.groupId===groupId)){const speaking=config.rules.filter(r=>r.category==='speaking').filter(r=>{const change=changes.find(x=>x.member.id===member.id&&x.rule.id===r.id);return change?(r.kind==='speaking-total'?change.count!==null:change.count>0):old.some(e=>e.studentId===member.id&&e.ruleId===r.id&&e.status!=='rejected')});if(speaking.length>1)fail(400,'Mỗi học sinh chỉ áp dụng một mốc phát biểu/tuần.');}
            for(let i=0;i<changes.length;i+=20){const chunk=changes.slice(i,i+20);add(db.update(t.entries).set({status:'rejected',reviewNote:'Thay thế bởi bảng nhập thi đua'}).where(and(eq(t.entries.classId,classId),eq(t.entries.week,w),eq(t.entries.groupId,groupId),or(...chunk.map(x=>and(eq(t.entries.studentId,x.member.id),eq(t.entries.ruleId,x.rule.id),...(needsLearningSubject(x.rule)?[eq(t.entries.subject,x.subject)]:[])))))))}
            const values=changes.filter(x=>x.rule.kind==='speaking-total'?x.count!==null:x.count>0).map(x=>({id:uid(),classId,week:w,studentId:x.member.id,groupId,ruleId:x.rule.id,ruleName:x.rule.name,category:x.rule.category,delta:ruleScore(x.rule,x.count),count:x.count,status:'pending',note:x.rule.kind==='speaking-total'&&x.count<x.rule.kpi.minRequired?'Không đủ KPI phát biểu':'Nhập qua bảng thi đua tổ',proof:'',grade:['grade8','grade9','grade10'].includes(x.rule.id)?x.rule.id.slice(5):'',subject:x.subject||'',createdBy:user.email,createdAt:now(),reviewNote:''}));
            for(let i=0;i<values.length;i+=4)add(db.insert(t.entries).values(values.slice(i,i+4)));
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
            const count = r.kind === 'speaking-total' ? amount(b.count,0,100) : amount(b.count || 1, 1, 100);
            const subject=needsLearningSubject(r)?cleanSubject(b.subject):'';
            if(needsLearningSubject(r)&&!subject)fail(400,'Phải chọn môn học khi ghi nhận điểm học tập.');
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
            const hasGrade=b.grade!==null&&b.grade!==undefined&&String(b.grade).trim()!=='';if(hasGrade&&(!needsLearningSubject(r)||!['string','number'].includes(typeof b.grade)))fail(400,'Chọn quy tắc học tập khi nhập điểm kiểm tra.');
            const grade = hasGrade ? String(Number(b.grade)) : r.id === 'grade8' ? '8' : r.id === 'grade9' ? '9' : r.id === 'grade10' ? '10' : '';
            if (['grade8', 'grade9', 'grade10'].includes(r.id) && grade !== r.id.slice(5))
                fail(400, 'Điểm kiểm tra phải khớp quy tắc đã chọn');
            if (grade && (!Number.isFinite(Number(grade)) || Number(grade) < 0 || Number(grade) > 10))
                fail(400, 'Điểm phải từ 0 đến 10');
            add(db.insert(t.entries).values({ id: uid(), classId, week: w, studentId: s.id, groupId: s.groupId, ruleId: r.id, ruleName: r.name, category: r.category, delta: ruleScore(r,count), count, status: 'pending', note: r.kind==='speaking-total'&&count<r.kpi!.minRequired?'Không đủ KPI phát biểu':String(b.note || '').slice(0, 2000), proof: safeUrl(b.proof), grade, subject, createdBy: user.email, createdAt: now() }));
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
            if(!teacher&&!roles.some(r=>r==='leader'||r==='study'))fail(403,'Chỉ giáo viên, lớp trưởng hoặc lớp phó học tập được duyệt báo cáo tổ.');
            const rep = await db.select().from(t.reports).where(and(eq(t.reports.id, b.id), eq(t.reports.classId, classId))).get();
            if (!rep)
                fail(404, 'Không có báo cáo');
            if(!teacher&&rep.status!=='submitted')fail(409,'Cán sự chỉ được duyệt hoặc trả lại báo cáo đang chờ duyệt.');
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
    const guarded = [db.insert(t.guards).values({ id: guardId, ok: sql `CASE WHEN (SELECT revision FROM classes WHERE id = ${classId}) = ${cls.revision} THEN 1 ELSE 0 END` }), ...commands, db.update(t.classes).set({ revision: cls.revision + 1 }).where(eq(t.classes.id, classId)), db.insert(t.audit).values({ id: uid(), classId, actor: user.email, action: actionName, details: JSON.stringify({ ...b, action: undefined, password:undefined,oldPassword:undefined,_createdAccounts:undefined }).slice(0, 30000), createdAt: now() }), db.delete(t.guards).where(eq(t.guards.id, guardId))];
    try {
        await db.batch(guarded as any);
    }
    catch (e) {
        if (String(e).includes('guard_ok'))
            fail(409, 'Dữ liệu vừa được cập nhật. Tải lại rồi thử lại.');
        throw e;
    }
    return { ok: true,createdAccounts:b._createdAccounts||[] };
}
