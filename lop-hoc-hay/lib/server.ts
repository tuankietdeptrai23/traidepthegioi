import {careKey,careVisible,nextCareRecord,careKinds} from './student-care';
import {monthlyConductSheets} from './monthly-conduct-report';
import {academicPeriod,periodFromKey,dateForSchoolWeek,termConductAlerts} from './academic-calendar';
import {learningSummary} from './learning-points';
import {teacherAlerts} from './teacher-alerts';
import {schoolSessions} from './timetable';
import {reportDate as getReportDate,speakingAllowed,requiredReportDates,vietnamToday,monthlyProfile} from './class-tools';
import {academicGrade,academicBand,academicPrefix} from './academic-grid';
import { eq, and, or, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import * as t from '@/db/schema';
import { currentUser, safeUser, normalizeLogin, passwordRecord } from './auth';
import { defaultConfig, parse, canReport, canViewCompetitionGroup, dayPlus, monday, snapshot, dutyPlan, dutyMechanism, dutyBalance, dutyScheduleWarnings, validateConfig, ruleScore, needsLearningSubject, cleanSubject, studentLoginBase, seatGroupIndex, type Row, type Config } from './domain';
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
    const config={...defaultConfig,...parse<Config>(cls.config,defaultConfig)};if(config.dutyPolicyVersion!==3)config.lastDutyDays=2;config.dutyPolicyVersion=3;
    return {db,user,cls,own,teacher,roles:parse<string[]>(own?.roles,[]),config};
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
    // One-time correction explicitly requested for class 12A2, week starting 2 Nov.
    // Runs only under the existing class teacher/admin session; never on anonymous requests.
    if(c.teacher&&classId==='f395c786-c04e-46e4-aca3-beacad94ef52'&&vietnamToday()<='2026-11-08'){
        const key='duty-repair:v5:2026-11-02:'+classId,done=await db.select().from(t.settings).where(eq(t.settings.key,key)).get();
        const period=await db.select().from(t.periods).where(and(eq(t.periods.classId,classId),eq(t.periods.week,'2026-10-26'))).get();
        if(!done&&period?.status==='locked'){await action({action:'rebuildDutyPlan',classId,week:'2026-10-26'});await db.insert(t.settings).values({key,value:now()}).onConflictDoNothing();const fresh=await context(classId);Object.assign(c,fresh);}
    }
    const { teacher, own, roles } = c;
    const classFilter = (table: any) => eq(table.classId, classId);
    const [groups, students, periods, entries, reports, grades, conduct, funds, collections, activities, duties, notices, feedback, audit, dutySwaps, badgeTypes, badgeAwards, monthlyProfiles] = await Promise.all([
        db.select().from(t.groups).where(classFilter(t.groups)), db.select().from(t.students).where(classFilter(t.students)), db.select().from(t.periods).where(classFilter(t.periods)), db.select().from(t.entries).where(classFilter(t.entries)), db.select().from(t.reports).where(classFilter(t.reports)), db.select().from(t.grades).where(classFilter(t.grades)), db.select().from(t.conduct).where(classFilter(t.conduct)), db.select().from(t.funds).where(classFilter(t.funds)), db.select().from(t.fundCollections).where(classFilter(t.fundCollections)), db.select().from(t.activities).where(classFilter(t.activities)), db.select().from(t.duties).where(classFilter(t.duties)), db.select().from(t.notices).where(classFilter(t.notices)), db.select().from(t.feedback).where(classFilter(t.feedback)), teacher ? db.select().from(t.audit).where(classFilter(t.audit)) : Promise.resolve([]), db.select().from(t.dutySwaps).where(classFilter(t.dutySwaps)), db.select().from(t.badgeTypes).where(classFilter(t.badgeTypes)), db.select().from(t.badgeAwards).where(classFilter(t.badgeAwards)), db.select().from(t.monthlyProfiles).where(classFilter(t.monthlyProfiles))
    ]);
    const visibleGroup=(groupId:string)=>canViewCompetitionGroup(teacher,roles,own?.groupId||'',groupId);
    const visibleStudent = (s: Row) => visibleGroup(s.groupId);
    const ids = new Set(students.filter(visibleStudent).map(s => s.id));
    // Aggregates are public within the class, detailed records remain scoped server-side.
    const weekly = [...new Set([monday(), ...entries.map(e => e.week), ...periods.map(p => p.week), ...reports.map(r => r.week)])];
    const ranks = Object.fromEntries(weekly.map(w => { const p = periods.find(p => p.week === w && p.status === 'locked'); return [w, p ? parse<Row>(p.snapshot, {}).standings : snapshot(groups, students, entries.filter(e => e.week === w), c.config).standings]; }));
    const publishedStandings=Object.fromEntries(periods.filter(p=>p.status==='locked'||!!p.snapshot).map(p=>[p.week,(parse<Row>(p.snapshot,{}).standings||[]).map((g:Row)=>({id:g.id,name:g.name,count:g.count,score:g.score,rank:g.rank}))]));
    const historyScores = Object.fromEntries(periods.filter(p => p.status === 'locked').map(p => { const sn = parse<Row>(p.snapshot, {}); return [p.week, (sn.students || []).filter((s: Row) => ids.has(s.id)).map((s: Row) => ({ id: s.id, name: s.name, groupId: s.groupId, score: s.score }))]; }));
    const sheets=Object.fromEntries(weekly.map(w=>{const locked=periods.find(p=>p.week===w&&p.status==='locked');const snap=locked?parse<Row>(locked.snapshot,{}):null;const rules=(snap?.config||c.config).rules;const roster=(snap?.students||students).filter((s:Row)=>s.active&&visibleStudent(s));const records=(snap?.entries||entries.filter(e=>e.week===w));return [w,{rules,base:(snap?.config||c.config).base,rows:roster.map((s:Row)=>{const editable=teacher||canReport(roles,own?.groupId||'',s.groupId);const seen=records.filter((e:Row)=>e.studentId===s.id&&e.groupId===s.groupId&&(e.status==='approved'||(editable&&e.status==='pending')));return {id:s.id,name:s.name,groupId:s.groupId,previewScore:(snap?s.score:c.config.base+seen.reduce((n:number,e:Row)=>n+e.delta,0)),subjectCounts:Object.fromEntries(seen.filter((e:Row)=>e.subject&&rules.some((r:Row)=>r.id===e.ruleId&&needsLearningSubject(r))).map((e:Row)=>[e.ruleId+'|'+e.subject,seen.filter((x:Row)=>x.ruleId===e.ruleId&&x.subject===e.subject).reduce((n:number,x:Row)=>n+x.count,0)])),counts:Object.fromEntries(rules.map((r:Row)=>[r.id,r.kind==='speaking-total'?(seen.find((e:Row)=>e.ruleId===r.id)?.count??0):seen.filter((e:Row)=>e.ruleId===r.id).reduce((n:number,e:Row)=>n+e.count,0)])),recorded:Object.fromEntries(rules.filter((r:Row)=>r.kind==='speaking-total').map((r:Row)=>[r.id,seen.some((e:Row)=>e.ruleId===r.id)])),score:snap?s.score:c.config.base+records.filter((e:Row)=>e.studentId===s.id&&e.status==='approved').reduce((n:number,e:Row)=>n+e.delta,0)}})}]}));
    const dailySheets=Object.fromEntries([...new Set([...entries.map(e=>e.reportDate),...reports.map(r=>r.reportDate)].filter(Boolean))].map(day=>{const w=monday(new Date(day));const sheet=sheets[w];if(!sheet)return [day,null];return [day,{...sheet,rows:sheet.rows.map((s:Row)=>{const records=entries.filter(e=>e.reportDate===day&&e.studentId===s.id&&e.groupId===s.groupId&&(e.status==='approved'||((teacher||canReport(roles,own?.groupId||'',s.groupId))&&e.status==='pending')));return {...s,counts:Object.fromEntries(sheet.rules.map((r:Row)=>[r.id,records.filter(e=>e.ruleId===r.id).reduce((n,e)=>n+e.count,0)])),recorded:Object.fromEntries(sheet.rules.filter((r:Row)=>r.kind==='speaking-total').map((r:Row)=>[r.id,records.some(e=>e.ruleId===r.id)])),subjectCounts:Object.fromEntries(records.filter(e=>e.subject).map(e=>[e.ruleId+'|'+e.subject,records.filter(x=>x.ruleId===e.ruleId&&x.subject===e.subject).reduce((n,x)=>n+x.count,0)]))}})}]}));
    const alertRead=teacher?await db.select().from(t.settings).where(eq(t.settings.key,'alert-read:'+classId+':'+user.email)).get():null;
    // Read class-scoped settings as text: deployed D1 runtimes can reject JSON
    // projection functions, and legacy settings need not contain JSON.
    // Use indexed ranges, never long LIKE patterns (D1 has a stricter pattern limit).
    const archivePrefix='student-care:'+classId+':week-archive:';
    const weekArchiveRows=teacher?await db.select().from(t.settings).where(sql`${t.settings.key} >= ${archivePrefix} AND ${t.settings.key} < ${archivePrefix+'\uffff'}`).limit(200):[];
    const careRecords:Row[]=[];let careCursor='';const carePrefix='student-care:'+classId+':';
    while(careRecords.length<1001){
        const rows=await db.select().from(t.settings).where(sql`${t.settings.key} >= ${carePrefix} AND ${t.settings.key} < ${carePrefix+'\uffff'} AND ${t.settings.key} > ${careCursor} AND NOT (${t.settings.key} >= ${carePrefix+'attendance:'} AND ${t.settings.key} < ${carePrefix+'attendance:\uffff'}) AND NOT (${t.settings.key} >= ${carePrefix+'month-archive:'} AND ${t.settings.key} < ${carePrefix+'month-archive:\uffff'}) AND NOT (${t.settings.key} >= ${carePrefix+'week-archive:'} AND ${t.settings.key} < ${carePrefix+'week-archive:\uffff'})`).orderBy(t.settings.key).limit(100);
        if(!rows.length)break;careCursor=rows[rows.length-1].key;
        const visible=careVisible(rows.map(r=>parse<Row>(r.value,{})).filter(r=>careKinds.includes(r.kind)),teacher,roles,own);
        for(const record of visible){const r={...record};delete r.snapshot;if(r.kind==='duty-proof'){if(typeof r.proof==='string'&&r.proof.startsWith('data:image/')){delete r.proof;r.hasImage=1;}delete r.history;}careRecords.push(r);}
        if(rows.length<100)break;
    }
    const careMore=careRecords.length>1000;careRecords.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));careRecords.splice(1000);
    const readIds=parse<string[]>(alertRead?.value,[]);
    const decisionSetting=await db.select().from(t.settings).where(eq(t.settings.key,'academic-conduct:'+classId)).get();const academicDecisions=parse<Row[]>(decisionSetting?.value,[]);
    const allAlerts=teacher?[...teacherAlerts(entries,c.config),...termConductAlerts(academicDecisions,c.config)].sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)):[];
    common.detail = { ...c.cls, config: c.config, teacher, ownId: own?.id, roles, groups, students: students.map(s => teacher ? s : ({ ...s, email: s.id === own?.id ? s.email : '', roles: s.roles })), periods: periods.map(p => ({ ...p,correctionOpen:p.status==='open'&&!!p.snapshot, snapshot: undefined })), entries: entries.filter(e => ids.has(e.studentId)&&visibleGroup(e.groupId)), reports: reports.filter(r=>visibleGroup(r.groupId)).map(r => teacher || canReport(roles, own?.groupId || '', r.groupId) ? r : { ...r, note: '', createdBy: '' }), grades: grades.filter(g => teacher || g.studentId === own?.id), conduct: conduct.filter(x => teacher || x.studentId === own?.id), fundCollections: collections.map(c=>({ ...c,paid:funds.filter(f=>f.collectionId===c.id&&f.status==='approved').reduce((n,f)=>n+(f.type==='income'?f.amount:-f.amount),0),payments: (teacher||roles.includes('treasurer')?funds.filter(f=>f.collectionId===c.id&&f.status==='approved'):funds.filter(f=>f.collectionId===c.id&&f.status==='approved'&&f.studentId===own?.id)).map(f=>({studentId:f.studentId,amount:f.amount,type:f.type,date:f.date,id:f.id}))})), fundSummary: {income: funds.filter(f=>f.status==='approved'&&f.type==='income').reduce((n,f)=>n+f.amount,0),expense:funds.filter(f=>f.status==='approved'&&f.type==='expense').reduce((n,f)=>n+f.amount,0)}, funds: funds.filter(f => teacher || roles.includes('treasurer') || (f.status === 'approved' && (!f.studentId || f.studentId === own?.id))).map(f => teacher || roles.includes('treasurer') ? f : { ...f, proof: '', createdBy: '' }), activities, dutyBalances:Object.fromEntries(periods.filter(p=>p.status==='locked').map(p=>[p.week,dutyBalance(parse<Row>(p.snapshot,{}),p.week,c.config,duties).filter((r:Row)=>teacher||r.studentId===own?.id)])),duties:duties.filter(x=>x.status!=='cancelled'), notices, feedback: feedback.filter(f => teacher || f.createdBy === user.email), audit,weekArchives:weekArchiveRows.map(r=>{const v=parse<Row>(r.value,{});delete v.snapshot;delete v.reports;return v}),publishedStandings,careRecords,careMore,academicDecisions:academicDecisions.filter(x=>teacher||x.studentId===own?.id),learningPoints:students.filter(s=>teacher||s.id===own?.id).map(s=>learningSummary(entries,c.config,s.id,academicPeriod(vietnamToday(),c.config).key)),teacherAlerts:teacher?allAlerts.map(a=>({...a,read:readIds.includes(a.id)})):[], ranks:Object.fromEntries(Object.entries(ranks).map(([w,rs]:any)=>{const bottom=Math.min(...rs.filter((g:Row)=>g.count).map((g:Row)=>g.score));return [w,rs.map((g:Row)=>({...g,isLast:!!g.count&&g.score===bottom})).filter((g:Row)=>visibleGroup(g.id))]})), historyScores, sheets, dailySheets, serverToday:vietnamToday(), speakingAvailable:speakingAllowed(c.config,vietnamToday()),speakingAvailableDates:[...new Set([...(c.config.speakingOpenDates||[]).filter(d=>d<=vietnamToday()),...(new Date(vietnamToday()+'T00:00:00Z').getUTCDay()===5?[vietnamToday()]:[])])], dutySwaps:dutySwaps.filter(x=>teacher||roles.some(r=>['leader','discipline'].includes(r))||x.fromStudentId===own?.id||x.toStudentId===own?.id),badgeTypes,badgeAwards:badgeAwards.filter(x=>teacher||x.studentId===own?.id),monthlyProfiles:monthlyProfiles.filter(x=>teacher||(x.studentId===own?.id&&x.status==='approved')) };
    return common;
}
export async function careAttendance(classId:string,when:string){
 const c=await context(classId);date(when);const prefix=careKey(classId,'attendance',when+':');const records=await c.db.select().from(t.settings).where(sql`${t.settings.key} >= ${prefix} AND ${t.settings.key} < ${prefix+'\uffff'}`).limit(5000);return careVisible(records.map(r=>parse<Row>(r.value,{})),c.teacher,c.roles,c.own);
}
export async function careProof(classId:string,id:string){const c=await context(classId),row=await c.db.select().from(t.settings).where(eq(t.settings.key,careKey(classId,'duty-proof',str(id,200)))).get();const r=row?parse<Row>(row.value,{}):undefined;if(!r||!careVisible([r],c.teacher,c.roles,c.own).length)fail(403,'Không có quyền xem minh chứng.');return r.proof as string;}
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
    const monthUnlocked=async(when:string)=>{const cycle=academicPeriod(when,config);if(cycle.academic){const row=await db.select().from(t.settings).where(eq(t.settings.key,careKey(classId,'month-close',cycle.key))).get();if(parse<Row>(row?.value,{}).status==='locked')fail(409,'Tháng học đã chốt. GV cần mở đính chính và ghi lý do trước.');}};
    const openWeek = async (w: string) => { await monthUnlocked(w);const p = await db.select().from(t.periods).where(and(eq(t.periods.classId, classId), eq(t.periods.week, w))).get(); if (p?.status === 'locked')
        fail(409, 'Tuần đã chốt. Dữ liệu không thể chỉnh sửa'); };
    const getDay=(w:string)=>{try{return getReportDate(config,w,b.reportDate)}catch(e){return fail(400,(e as Error).message)}};
    const reportFilter=(w:string,g:string,day:string)=>and(eq(t.reports.classId,classId),eq(t.reports.week,w),eq(t.reports.groupId,g),eq(t.reports.reportDate,day));
    const assertSpeaking=(day:string)=>{if(!speakingAllowed(config,day))fail(403,'Phát biểu chỉ được báo trong ngày thứ Sáu hoặc ngày giáo viên mở, theo giờ Việt Nam.');};
    const commands: any[] = [];
    const add = (query: any) => commands.push(query);
    const allStudents = () => db.select().from(t.students).where(eq(t.students.classId, classId));
    const allGroups = () => db.select().from(t.groups).where(eq(t.groups.classId, classId));
    const careGet=async(kind:string,id:string)=>{const row=await db.select().from(t.settings).where(eq(t.settings.key,careKey(classId,kind,id))).get();return row?parse<Row>(row.value,{}):undefined};
    const carePut=(kind:string,id:string,value:Row,old:Row|undefined,note='')=>{let record:Row;try{record=nextCareRecord(old,{...value,kind,id},user.email,note)}catch(e){fail(400,(e as Error).message)}const json=JSON.stringify(record);if(json.length>1500000)fail(400,'Hồ sơ quá lớn; tạo bản bổ sung để giữ lịch sử.');const key=careKey(classId,kind,id);add(db.insert(t.settings).values({key,value:json}).onConflictDoUpdate({target:t.settings.key,set:{value:json}}));return record;};
    switch (actionName) {
        case 'saveAttendance': {
            const when=date(b.date);if(when>vietnamToday())fail(400,'Không điểm danh ngày tương lai.');await monthUnlocked(when);
            const session=b.session;if(!['morning','afternoon'].includes(session))fail(400,'Chọn buổi sáng hoặc chiều.');const period=amount(b.period,1,5);
            if(!Array.isArray(b.cells)||!b.cells.length||b.cells.length>100||new Set(b.cells.map((x:Row)=>x.studentId)).size!==b.cells.length)fail(400,'Mỗi lần lưu 1–100 học sinh, không trùng.');
            for(const cell of b.cells){const s=await student(cell.studentId);reportPermission(s.groupId);if(!['present','late','permitted','absent'].includes(cell.status))fail(400,'Trạng thái điểm danh không hợp lệ.');const id=when+':'+session+':'+period+':'+s.id,old=await careGet('attendance',id);carePut('attendance',id,{studentId:s.id,groupId:s.groupId,date:when,session,period,status:cell.status,note:typeof cell.note==='string'?cell.note.slice(0,500):''},old,String(b.reason||'').slice(0,500));}break;
        }
        case 'createCareRequest': {
            const s=await student(teacher?b.studentId:own?.id);const when=date(b.date),until=date(b.endDate||when);if(until<when||Date.parse(until)-Date.parse(when)>31*86400000)fail(400,'Khoảng ngày giải trình tối đa 31 ngày, ngày kết thúc không trước ngày bắt đầu.');if(b.type!=='explanation')fail(400,'Chỉ hỗ trợ gửi giải trình.');
            let entryId='';if(b.entryId){const e=await db.select().from(t.entries).where(and(eq(t.entries.id,str(b.entryId,100)),eq(t.entries.classId,classId),eq(t.entries.studentId,s.id))).get();if(!e)fail(403,'Ghi nhận không thuộc học sinh này.');entryId=e.id;}
            const id=uid();carePut('request',id,{studentId:s.id,date:when,endDate:until,type:b.type,entryId,reason:str(b.reason,2000),status:'pending',response:''},undefined);break;
        }
        case 'saveCareGoal': {
            needTeacher();const s=await student(b.studentId),id=b.id?str(b.id,200):uid(),old=await careGet('goal',id);if(old&&old.studentId!==s.id)fail(400,'Không chuyển mục tiêu sang người khác.');const dueDate=date(b.dueDate);carePut('goal',id,{studentId:s.id,title:str(b.title,150),description:str(b.description,2000),dueDate,status:old?.status||'active',progress:old?.progress||0},old,str(b.reason||'Tạo / điều chỉnh mục tiêu',500));break;
        }
        case 'submitCareGoal': {
            const id=str(b.id,200),old=await careGet('goal',id);if(!old)fail(404,'Không có mục tiêu.');if(!teacher&&old.studentId!==own?.id)fail(403,'Chỉ cập nhật mục tiêu của mình.');if(['completed','archived'].includes(old.status))fail(409,'Mục tiêu đã kết thúc.');const progress=amount(b.progress,0,100);carePut('goal',id,{...old,progress,studentNote:str(b.note,1000),status:progress===100?'submitted':'active'},old,'Học sinh báo tiến độ');break;
        }
        case 'submitDutyProof': {
            const duty=await db.select().from(t.duties).where(and(eq(t.duties.classId,classId),eq(t.duties.id,str(b.dutyId,100)))).get();if(!duty||duty.status==='cancelled')fail(404,'Nhiệm vụ không còn hiệu lực.');if(!teacher&&duty.studentId!==own?.id)fail(403,'Chỉ nộp minh chứng cho lượt trực của mình.');if(duty.date>vietnamToday()||duty.status==='completed')fail(409,'Chưa đến ngày trực hoặc lượt đã được xác nhận.');
            const proof=str(b.proof,240000);if(!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/=]+$/.test(proof)&&!/^https:\/\//.test(proof))fail(400,'Chọn ảnh JPEG hoặc liên kết HTTPS.');if(proof.startsWith('https:'))safeUrl(proof);
            const old=await careGet('duty-proof',duty.id);carePut('duty-proof',duty.id,{studentId:duty.studentId,groupId:(await student(duty.studentId)).groupId,date:duty.date,dutyId:duty.id,task:duty.task,proof,note:str(b.note||'Đã thực hiện nhiệm vụ',1000),status:'submitted'},old,'Nộp ảnh / minh chứng trực');add(db.update(t.duties).set({status:'submitted'}).where(eq(t.duties.id,duty.id)));break;
        }
        case 'saveParentContact': {
            needTeacher();const s=await student(b.studentId),id=b.id?str(b.id,200):uid(),old=await careGet('parent-contact',id);carePut('parent-contact',id,{studentId:s.id,date:date(b.date),method:str(b.method,100),note:str(b.note,2000),followUp:b.followUp?date(b.followUp):'',status:b.status==='resolved'?'resolved':'open'},old,str(b.reason||'Ghi trao đổi phụ huynh',500));break;
        }
        case 'createHandover': {
            needTeacher();const from=await student(b.fromId),to=await student(b.toId);if(from.id===to.id)fail(400,'Chọn hai học sinh khác nhau.');if(!parse<string[]>(from.roles,[]).includes(b.role)||!['leader','study','discipline','movement','treasurer','group'].includes(b.role))fail(400,'Người bàn giao chưa giữ chức vụ này.');if(b.role==='group'&&from.groupId!==to.groupId)fail(400,'Tổ trưởng mới phải cùng tổ.');
            const id=uid();carePut('handover',id,{fromId:from.id,toId:to.id,role:b.role,description:str(b.description,2000),status:'pending',fromAccepted:false,toAccepted:false},undefined);break;
        }
        case 'ackHandover': {
            const id=str(b.id,200),old=await careGet('handover',id);if(!old||old.status!=='pending')fail(409,'Bàn giao không còn chờ xác nhận.');if(!own||![old.fromId,old.toId].includes(own.id))fail(403,'Chỉ hai người bàn giao / nhận mới xác nhận được.');carePut('handover',id,{...old,...(own.id===old.fromId?{fromAccepted:true}:{toAccepted:true})},old,str(b.note||'Đã đối chiếu việc bàn giao',1000));break;
        }
        case 'completeHandover': {
            needTeacher();const id=str(b.id,200),old=await careGet('handover',id);if(!old||old.status!=='pending'||!old.fromAccepted||!old.toAccepted)fail(409,'Cần cả người cũ và người mới xác nhận trước.');const from=await student(old.fromId),to=await student(old.toId);const fromRoles=parse<string[]>(from.roles,[]),toRoles=parse<string[]>(to.roles,[]);if(!fromRoles.includes(old.role)||old.role==='group'&&from.groupId!==to.groupId)fail(409,'Chức vụ hoặc tổ đã thay đổi, cần lập bàn giao mới.');if(old.role==='leader'&&(await allStudents()).some(s=>s.active&&s.id!==from.id&&s.id!==to.id&&parse<string[]>(s.roles,[]).includes('leader')))fail(409,'Có lớp trưởng khác, cần đối chiếu trước.');
            add(db.update(t.students).set({roles:JSON.stringify(fromRoles.filter(r=>r!==old.role))}).where(eq(t.students.id,from.id)));add(db.update(t.students).set({roles:JSON.stringify([...new Set([...toRoles,old.role])])}).where(eq(t.students.id,to.id)));carePut('handover',id,{...old,status:'completed'},old,str(b.note||'GV xác nhận bàn giao và chuyển chức vụ',1000));break;
        }
        case 'reviewCareRecord': {
            const kind=str(b.kind,50),id=str(b.id,200),old=await careGet(kind,id);if(!old)fail(404,'Không có hồ sơ.');
            if(kind==='duty-proof'&&!teacher&&(roles.some(r=>['leader','discipline'].includes(r))||roles.includes('group')&&old.groupId===own?.groupId)){if(old.status!=='submitted')fail(409,'Minh chứng không còn chờ kiểm tra.');carePut(kind,id,{...old,status:'checked',response:str(b.response,1000)},old,'Cán sự kiểm tra, chờ GV xác nhận');break;}
            needTeacher();const response=str(b.response,2000);if(kind==='request'){if(old.status!=='pending')fail(409,'Đơn đã được xử lý.');if(!['approved','rejected'].includes(b.status))fail(400,'Chọn duyệt hoặc từ chối.');carePut(kind,id,{...old,status:b.status,response},old,response);}
            else if(kind==='goal'){if(!['completed','active','archived'].includes(b.status))fail(400,'Trạng thái mục tiêu không hợp lệ.');carePut(kind,id,{...old,status:b.status,response,progress:b.status==='completed'?100:old.progress},old,response);}
            else if(kind==='duty-proof'){if(!['completed','redo'].includes(b.status))fail(400,'Chọn hoàn thành hoặc làm lại.');const duty=await db.select().from(t.duties).where(and(eq(t.duties.classId,classId),eq(t.duties.id,old.dutyId))).get();if(!duty||duty.status==='cancelled')fail(409,'Lịch trực đã thay đổi.');carePut(kind,id,{...old,status:b.status,response},old,response);add(db.update(t.duties).set({status:b.status}).where(eq(t.duties.id,duty.id)));}
            else fail(400,'Loại hồ sơ không hỗ trợ duyệt.');break;
        }
        case 'restoreCareRecord': {
            needTeacher();const kind=str(b.kind,50),id=str(b.id,200),old=await careGet(kind,id);if(!old||!['attendance','request','goal','parent-contact'].includes(kind))fail(400,'Chỉ khôi phục điểm danh, đơn, mục tiêu hoặc nhật ký phụ huynh.');const index=amount(b.version,0,79),before=old.history?.[index]?.before;if(!before)fail(400,'Không có phiên bản trước để khôi phục.');if(kind==='attendance')await monthUnlocked(old.date);carePut(kind,id,before,old,'Khôi phục phiên bản: '+str(b.reason,1000));break;
        }
        case 'closeCareMonth': {
            needTeacher();const cycle=str(b.cycleKey,80),p=periodFromKey(cycle,config);if(!p?.academic||!config.academicCalendar)fail(400,'Thiết lập tháng học trước.');if(p.end>vietnamToday())fail(400,'Chưa hết 4 tuần học của tháng này.');const old=await careGet('month-close',cycle);if(old?.status==='locked')fail(409,'Tháng đã chốt.');const periods=await db.select().from(t.periods).where(eq(t.periods.classId,classId));const weeks=Array.from({length:4},(_,i)=>dateForSchoolWeek(p.firstWeek+i,config.academicCalendar!));if(weeks.some(w=>!periods.some(x=>x.week===w&&x.status==='locked')))fail(409,'Cần chốt đủ 4 tuần học trước khi chốt tháng.');
            const d=(await state(classId)).detail,sheets=monthlyConductSheets(d,cycle);const archiveId=uid();const archiveKey=careKey(classId,'month-archive',archiveId);add(db.insert(t.settings).values({key:archiveKey,value:JSON.stringify({kind:'month-archive',id:archiveId,cycleKey:cycle,createdAt:now(),sheets})}));carePut('month-close',cycle,{cycleKey:cycle,label:p.label,status:'locked',comment:str(b.comment||'Đã đối chiếu hồ sơ tháng',2000),snapshot:{sheets},archives:[...(old?.archives||[]),archiveId]},old,'Chốt tháng, giữ bản tổng hợp bất biến');break;
        }
        case 'reopenCareMonth': {
            needTeacher();const cycle=str(b.cycleKey,80),old=await careGet('month-close',cycle);if(!old||old.status!=='locked')fail(409,'Tháng chưa chốt.');carePut('month-close',cycle,{...old,status:'reopened'},old,'Mở đính chính: '+str(b.reason,2000));break;
        }

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
        case 'saveDutyMechanism': {
            needTeacher();let checked:Config;try{checked=validateConfig({...config,dutyMechanism:b.policy,lastDutyDays:b.lastDutyDays,violationDuty:b.violationDuty,preferMaleTrash:b.preferMaleTrash})}catch(e){fail(400,(e as Error).message)}
            add(db.update(t.classes).set({config:JSON.stringify(checked)}).where(eq(t.classes.id,classId)));break;
        }
        case 'saveAcademicCalendar': {
            needTeacher();let checked:Config;try{checked=validateConfig({...config,academicCalendar:b.calendar})}catch(e){fail(400,(e as Error).message)}
            add(db.update(t.classes).set({config:JSON.stringify(checked)}).where(eq(t.classes.id,classId)));break;
        }
        case 'saveAcademicConduct': {
            needTeacher();const s=await student(b.studentId),cycleKey=str(b.cycleKey,80),period=periodFromKey(cycleKey,config);if(!period?.academic)fail(400,'Chọn tháng học theo lịch tuần đã cấu hình.');
            await monthUnlocked(period.start);if(period.start>vietnamToday())fail(400,'Chưa thể quyết định tháng học tương lai.');
            if(!['Tốt','Khá','Đạt','Chưa đạt'].includes(b.level)||typeof b.downgraded!=='boolean')fail(400,'Chọn kết quả và trạng thái hạ hạnh kiểm hợp lệ.');
            const reason=str(b.reason,2000),id=uid(),createdAt=now();const key='academic-conduct:'+classId;const old=await db.select().from(t.settings).where(eq(t.settings.key,key)).get();const history=parse<Row[]>(old?.value,[]);if(history.length>=5000)fail(400,'Lịch sử đã đầy. Liên hệ quản trị để lưu trữ, không xóa dữ liệu.');
            const decision={id,studentId:s.id,cycleKey,level:b.level,downgraded:b.downgraded,reason,createdAt,createdBy:user.email,periodLabel:period.label,term:period.term};
            add(db.insert(t.settings).values({key,value:JSON.stringify([...history,decision])}).onConflictDoUpdate({target:t.settings.key,set:{value:JSON.stringify([...history,decision])}}));
            add(db.insert(t.conduct).values({id,classId,studentId:s.id,period:period.label+' · '+period.yearStart+' · HK '+period.term,level:b.level,reason:(b.downgraded?'[Hạ hạnh kiểm tháng] ':'[Không hạ hạnh kiểm tháng] ')+reason,createdBy:user.email,createdAt}));break;
        }
        case 'saveLearningPolicy': {
            needTeacher();let checked:Config;try{checked=validateConfig({...config,learningPoints:b.policy})}catch(e){fail(400,(e as Error).message)}
            add(db.update(t.classes).set({config:JSON.stringify(checked)}).where(eq(t.classes.id,classId)));break;
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
            const w=week(b.week);await openWeek(w);const reportDate=getDay(w);const groupId=str(b.groupId,100);reportPermission(groupId);
            if(!(await allGroups()).some(g=>g.id===groupId))fail(403,'Tổ không thuộc lớp.');
            const subject=cleanSubject(b.subject);if(!subject)fail(400,'Chọn môn trước khi nhập bảng điểm.');const attempt=amount(b.attempt,1,5),prefix=academicPrefix(attempt);
            const report=await db.select().from(t.reports).where(reportFilter(w,groupId,reportDate)).get();if(report&&report.status!=='returned')fail(409,'Báo cáo đã gửi. Cần trả lại trước khi sửa bảng.');
            if(!Array.isArray(b.cells)||!b.cells.length||b.cells.length>40)fail(400,'Mỗi lượt lưu tối đa 40 học sinh.');
            const members=await allStudents(),seen=new Set<string>(),changes:Row[]=[];
            for(const cell of b.cells){const member=members.find(s=>s.id===cell.studentId&&s.groupId===groupId&&s.active);if(!member)fail(403,'Chỉ được nhập học sinh thuộc tổ được giao.');if(seen.has(member.id))fail(400,'Học sinh bị lặp trong bảng.');seen.add(member.id);let grade:number|null=null,rule;try{grade=academicGrade(cell.grade);rule=grade===null?undefined:academicBand(config,grade)}catch(e){fail(400,(e as Error).message)}if(cell.note!==undefined&&(typeof cell.note!=='string'||cell.note.length>500))fail(400,'Ghi chú tối đa 500 ký tự.');changes.push({member,grade,rule,note:String(cell.note||'').trim()})}
            const old=await db.select().from(t.entries).where(and(eq(t.entries.classId,classId),eq(t.entries.week,w),eq(t.entries.groupId,groupId),eq(t.entries.subject,subject)));
            for(const change of changes){const prior=old.filter(e=>e.studentId===change.member.id&&e.ruleId.startsWith(prefix)&&e.reportDate===reportDate&&e.status!=='rejected');for(const e of prior)add(db.update(t.entries).set({status:'rejected',reviewNote:'Thay thế bởi bảng điểm theo môn'}).where(eq(t.entries.id,e.id)))}
            const values=changes.filter(c=>c.grade!==null).map(c=>({id:uid(),classId,week:w,reportDate,studentId:c.member.id,groupId,ruleId:prefix+'band-'+c.rule.min,ruleName:(c.rule.kind==='learned'?'Thuộc bài':'Không thuộc bài')+' · mốc từ '+c.rule.min+' điểm',category:'learning',delta:c.rule.points,count:1,status:'pending',note:c.note,proof:'',grade:String(c.grade),subject,createdBy:user.email,createdAt:now(),reviewNote:''}));for(let i=0;i<values.length;i+=4)add(db.insert(t.entries).values(values.slice(i,i+4)));break;
        }
        case 'saveSheet': {
            const w=week(b.week);await openWeek(w);const reportDate=getDay(w);const groupId=str(b.groupId,100);reportPermission(groupId);
            const rep=await db.select().from(t.reports).where(reportFilter(w,groupId,reportDate)).get();
            if(rep&&rep.status!=='returned')fail(409,'Báo cáo đã gửi. Giáo viên cần trả lại trước khi sửa bảng.');
            if(!Array.isArray(b.cells)||!b.cells.length||b.cells.length>80)fail(400,'Mỗi lần lưu tối đa 80 ô đã thay đổi.');
            const members=await allStudents();const old=await db.select().from(t.entries).where(and(eq(t.entries.classId,classId),eq(t.entries.week,w),eq(t.entries.groupId,groupId)));
            const changes:Row[]=[];const keys=new Set();
            for(const cell of b.cells){const member=members.find(x=>x.id===cell.studentId&&x.groupId===groupId&&x.active);if(!member)fail(403,'Chỉ được nhập học sinh trong tổ được giao');const rule=config.rules.find(x=>x.id===cell.ruleId);if(!rule)fail(400,'Quy tắc đã thay đổi. Hãy tải lại bảng.');if(rule.category==='speaking')assertSpeaking(reportDate);const count=cell.count===null&&rule.kind==='speaking-total'?null:amount(cell.count,0,100);if(rule.limit&&count!==null&&count>rule.limit)fail(400,'Vượt giới hạn quy tắc: '+rule.name);const subject=needsLearningSubject(rule)?cleanSubject(cell.subject):'';if(needsLearningSubject(rule)&&!subject)fail(400,'Chọn môn học trước khi ghi điểm thuộc bài / không thuộc bài.');const key=member.id+':'+rule.id+':'+subject;if(keys.has(key))fail(400,'Ô bị lặp');keys.add(key);changes.push({member,rule,count,subject});}
            for(const change of changes.filter(x=>x.rule.limit)){const total=old.filter(e=>e.studentId===change.member.id&&e.ruleId===change.rule.id&&e.status!=='rejected'&&!changes.some(x=>e.reportDate===reportDate&&x.member.id===e.studentId&&x.rule.id===e.ruleId&&(!needsLearningSubject(x.rule)||x.subject===e.subject))).reduce((n,e)=>n+e.count,0)+changes.filter(x=>x.member.id===change.member.id&&x.rule.id===change.rule.id).reduce((n,x)=>n+(x.count||0),0);if(total>change.rule.limit)fail(400,'Vượt giới hạn quy tắc trong tuần: '+change.rule.name);}
            for(const change of changes.filter(x=>x.rule.category==='speaking')){if(old.some(e=>e.studentId===change.member.id&&e.category==='speaking'&&e.reportDate!==reportDate&&e.status!=='rejected'))fail(409,'Phát biểu tuần này đã được ghi vào ngày khác. Trả lại và sửa đúng ngày báo cáo cũ.');}
            for(const member of members.filter(x=>x.groupId===groupId)){const speaking=config.rules.filter(r=>r.category==='speaking').filter(r=>{const change=changes.find(x=>x.member.id===member.id&&x.rule.id===r.id);return change?(r.kind==='speaking-total'?change.count!==null:change.count>0):old.some(e=>e.studentId===member.id&&e.ruleId===r.id&&e.status!=='rejected')});if(speaking.length>1)fail(400,'Mỗi học sinh chỉ áp dụng một mốc phát biểu/tuần.');}
            for(let i=0;i<changes.length;i+=20){const chunk=changes.slice(i,i+20);add(db.update(t.entries).set({status:'rejected',reviewNote:'Thay thế bởi bảng nhập thi đua'}).where(and(eq(t.entries.classId,classId),eq(t.entries.week,w),eq(t.entries.groupId,groupId),eq(t.entries.reportDate,reportDate),or(...chunk.map(x=>and(eq(t.entries.studentId,x.member.id),eq(t.entries.ruleId,x.rule.id),...(needsLearningSubject(x.rule)?[eq(t.entries.subject,x.subject)]:[])))))))}
            const values=changes.filter(x=>x.rule.kind==='speaking-total'?x.count!==null:x.count>0).map(x=>({id:uid(),classId,week:w,reportDate,studentId:x.member.id,groupId,ruleId:x.rule.id,ruleName:x.rule.name,category:x.rule.category,delta:ruleScore(x.rule,x.count),count:x.count,status:'pending',note:x.rule.kind==='speaking-total'&&x.count<x.rule.kpi.minRequired?'Không đủ KPI phát biểu':'Nhập qua bảng thi đua tổ',proof:'',grade:['grade8','grade9','grade10'].includes(x.rule.id)?x.rule.id.slice(5):'',subject:x.subject||'',createdBy:user.email,createdAt:now(),reviewNote:''}));
            for(let i=0;i<values.length;i+=4)add(db.insert(t.entries).values(values.slice(i,i+4)));
            break;
        }
        case 'addEntry': {
            const s = await student(b.studentId);
            reportPermission(s.groupId);
            const w = week(b.week);
            await openWeek(w);
            const reportDate=getDay(w);
            const r = config.rules.find(r => r.id === b.ruleId);
            if (!r)
                fail(400, 'Không tìm thấy quy tắc');
            if(r.category==='speaking')assertSpeaking(reportDate);
            const count = r.kind === 'speaking-total' ? amount(b.count,0,100) : amount(b.count || 1, 1, 100);
            const subject=needsLearningSubject(r)?cleanSubject(b.subject):'';
            if(needsLearningSubject(r)&&!subject)fail(400,'Phải chọn môn học khi ghi nhận điểm học tập.');
            const rep = await db.select().from(t.reports).where(reportFilter(w,s.groupId,reportDate)).get();
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
            add(db.insert(t.entries).values({ id: uid(), classId, week: w, reportDate, studentId: s.id, groupId: s.groupId, ruleId: r.id, ruleName: r.name, category: r.category, delta: ruleScore(r,count), count, status: 'pending', note: r.kind==='speaking-total'&&count<r.kpi!.minRequired?'Không đủ KPI phát biểu':String(b.note || '').slice(0, 2000), proof: safeUrl(b.proof), grade, subject, createdBy: user.email, createdAt: now() }));
            break;
        }
        case 'submitReport': {
            const w = week(b.week);
            const reportDate=getDay(w);
            await openWeek(w);
            reportPermission(str(b.groupId, 100));
            if (!(await allGroups()).some(g => g.id === b.groupId))
                fail(400, 'Tổ không thuộc lớp');
            const rep = await db.select().from(t.reports).where(reportFilter(w,b.groupId,reportDate)).get();
            if (rep && rep.status !== 'returned')
                fail(409, 'Báo cáo đã gửi');
            add(db.insert(t.reports).values({ id: uid(), classId, week: w, reportDate, groupId: b.groupId, status: 'submitted', note: String(b.note || '').slice(0, 2000), createdBy: user.email }).onConflictDoUpdate({ target: [t.reports.classId, t.reports.week, t.reports.groupId,t.reports.reportDate], set: { status: 'submitted', note: String(b.note || '').slice(0, 2000), createdBy: user.email } }));
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
            add(db.update(t.entries).set({ status: b.status === 'approved' ? 'approved' : 'pending', reviewNote: note }).where(and(eq(t.entries.classId, classId), eq(t.entries.week, rep.week), eq(t.entries.groupId, rep.groupId),eq(t.entries.reportDate,rep.reportDate),sql`${t.entries.ruleId} NOT LIKE 'badge/%'`, sql `${t.entries.status} != 'rejected'`)));
            break;
        }
        case 'rejectEntry': {
            needTeacher();
            const e = await db.select().from(t.entries).where(and(eq(t.entries.id, b.id), eq(t.entries.classId, classId))).get();
            if (!e)
                fail(404, 'Không có ghi nhận');
            await openWeek(e.week);
            if(e.ruleId.startsWith('badge/'))fail(400,'Hãy thu hồi huy hiệu trong Hồ sơ & huy hiệu để cập nhật đồng bộ.');
            add(db.update(t.entries).set({ status: 'rejected', reviewNote: str(b.note, 2000) }).where(eq(t.entries.id, e.id)));
            break;
        }
        case 'rebuildDutyPlan': {
            needTeacher();const w=week(b.week);const period=await db.select().from(t.periods).where(and(eq(t.periods.classId,classId),eq(t.periods.week,w))).get();if(!period||period.status!=='locked')fail(400,'Chọn tuần đã chốt.');
            const all=(await db.select().from(t.duties).where(eq(t.duties.classId,classId))).filter(d=>d.status!=='cancelled');
            const swaps=await db.select().from(t.dutySwaps).where(eq(t.dutySwaps.classId,classId));const protectedIds=new Set(swaps.filter(s=>['requested','accepted'].includes(s.status)).flatMap(s=>[s.fromDutyId,s.toDutyId]));
            const replace=all.filter(d=>d.date>=vietnamToday()&&d.status==='assigned'&&!protectedIds.has(d.id)&&['automatic:','last:','violation:'].some(p=>d.sourceKey.startsWith(p+w+':')));const replaceIds=new Set(replace.map(d=>d.id)),keep=all.filter(d=>!replaceIds.has(d.id));
            const sn=parse<Row>(period.snapshot,{}),currentStudents=await allStudents();sn.students=(sn.students||[]).map((s:Row)=>({...s,active:currentStudents.find(x=>x.id===s.id)?.active||0,roles:currentStudents.find(x=>x.id===s.id)?.roles||s.roles}));
            const previousPolicy=dutyMechanism(config),planningConfig=b.shuffle?{...config,dutyMechanism:{...previousPolicy,shuffleSeed:((previousPolicy.shuffleSeed||0)+1)%1000000}}:config;
            const rows=dutyPlan(sn,w,planningConfig,keep,vietnamToday()),policy=dutyMechanism(planningConfig);if(b.shuffle)add(db.update(t.classes).set({config:JSON.stringify(planningConfig)}).where(eq(t.classes.id,classId)));
            for(const day of config.timetable||defaultConfig.timetable||[]){const date=dayPlus(w,7+day.weekday-1);if(date<vietnamToday()||config.academicCalendar?.excludedWeeks.includes(monday(new Date(date))))continue;for(const session of schoolSessions(day)){const needed=session==='afternoon'?policy.afternoonClassWorkers+policy.afternoonTrashWorkers+policy.afternoonBoardWorkers:policy.classWorkers+policy.trashWorkers+policy.boardWorkers;const label=session==='afternoon'?'Buổi chiều':'Buổi sáng',combined=[...rows,...keep].filter(r=>r.date===date&&(r.source.endsWith(' · '+label)||!r.source.includes(' · Buổi ')&&session===schoolSessions(day)[0]));if(new Set(combined.map(r=>r.studentId)).size<needed)fail(400,'Ngày '+date+' '+label+' chưa đủ '+needed+' người hợp lệ.');}}
            for(const d of replace)add(db.update(t.duties).set({status:'cancelled'}).where(eq(t.duties.id,d.id)));
            const scheduleIssues=dutyScheduleWarnings([...rows,...keep],w,planningConfig,vietnamToday());if(scheduleIssues.length)fail(400,scheduleIssues[0]);
            const generation=uid();for(const d of rows)add(db.insert(t.duties).values({id:uid(),classId,...d,sourceKey:d.sourceKey+':'+generation} as any));break;
        }
        case 'correctWeekEntry': {
            if(user.role!=='admin')fail(403,'Chỉ admin được đính chính ghi nhận tuần cũ.');const e=await db.select().from(t.entries).where(and(eq(t.entries.classId,classId),eq(t.entries.id,str(b.id,100)))).get();if(!e||e.status==='rejected')fail(404,'Ghi nhận không còn hiệu lực.');const period=await db.select().from(t.periods).where(and(eq(t.periods.classId,classId),eq(t.periods.week,e.week))).get();if(!period?.snapshot||period.status!=='open')fail(409,'Admin cần mở tuần đã chốt trước.');await monthUnlocked(e.reportDate||e.week);if(e.ruleId.startsWith('badge/'))fail(400,'Huy hiệu cần điều chỉnh trong Hồ sơ & huy hiệu.');
            const oldConfig=parse<Row>(period.snapshot,{}).config||config,count=amount(b.count,0,100),reason=str(b.reason,2000);let ruleId=e.ruleId,ruleName=e.ruleName,delta=e.delta,grade=e.grade,subject=e.subject;
            if(e.category==='learning'){const chosen=cleanSubject(b.subject);if(!chosen&&b.subject!==e.subject)fail(400,'Chọn môn hợp lệ.');subject=chosen||e.subject;if(!subject)fail(400,'Điểm học tập bắt buộc chọn môn.');grade=b.grade===null||b.grade===undefined||String(b.grade).trim()===''?'':String(academicGrade(b.grade));}
            if(e.ruleId.startsWith('academic-sheet/')||e.ruleId.startsWith('academic-correction/')||e.category==='learning'&&grade!==''&&['unlearned','grade8','grade9','grade10'].includes(e.ruleId)){if(count>1)fail(400,'Mỗi điểm trả bài là một ghi nhận; số lần tối đa 1.');if(grade==='')fail(400,'Điểm trả bài phải có số điểm.');const band=academicBand(oldConfig,Number(grade));ruleId=e.ruleId.startsWith('academic-sheet/')?e.ruleId.split('/').slice(0,2).join('/')+'/band-'+band.min:'academic-correction/'+e.id;ruleName=(band.kind==='learned'?'Thuộc bài':'Không thuộc bài')+' · mốc từ '+band.min+' điểm';delta=band.points;}else{const rule=oldConfig.rules.find((r:Row)=>r.id===e.ruleId);if(!rule)fail(400,'Không tìm thấy quy tắc trong bản chốt cũ.');delta=ruleScore(rule,count);if(['grade8','grade9','grade10'].includes(e.ruleId)&&grade!==e.ruleId.slice(5))fail(400,'Điểm không khớp quy tắc cũ; hãy ghi đúng loại điểm.');}
            add(db.update(t.entries).set({status:'rejected',reviewNote:'Admin đính chính: '+reason}).where(eq(t.entries.id,e.id)));if(count>0)add(db.insert(t.entries).values({...e,id:uid(),ruleId,ruleName,delta,count,grade,subject,status:'pending',note:typeof b.note==='string'?b.note.slice(0,2000):e.note,reviewNote:'Đính chính từ '+e.id+': '+reason,createdBy:user.email,createdAt:now()}));break;
        }
        case 'unlockWeekForCorrection': {
            if(user.role!=='admin')fail(403,'Chỉ admin được mở tuần đã chốt để sửa.');const w=week(b.week),reason=str(b.reason,2000);const period=await db.select().from(t.periods).where(and(eq(t.periods.classId,classId),eq(t.periods.week,w))).get();if(!period||period.status!=='locked')fail(409,'Tuần chưa chốt hoặc đã đang mở đính chính.');
            const reports=await db.select().from(t.reports).where(and(eq(t.reports.classId,classId),eq(t.reports.week,w)));const archiveId=uid();add(db.insert(t.settings).values({key:careKey(classId,'week-archive',archiveId),value:JSON.stringify({kind:'week-archive',id:archiveId,week:w,reason,createdAt:now(),actor:user.email,snapshot:parse<Row>(period.snapshot,{}),reports})}));
            add(db.update(t.periods).set({status:'open'}).where(eq(t.periods.id,period.id)));for(const r of reports)add(db.update(t.reports).set({status:'returned',note:'Admin mở đính chính: '+reason}).where(eq(t.reports.id,r.id)));
            const cycle=academicPeriod(w,config);if(cycle.academic){const closed=await careGet('month-close',cycle.key);if(closed?.status==='locked')carePut('month-close',cycle.key,{...closed,status:'reopened'},closed,'Admin mở tuần đính chính: '+reason);}break;
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
            const dates=requiredReportDates(config,w);
            if(config.reportMode==='daily'&&dates.some(d=>d>vietnamToday()))fail(400,'Chưa đến ngày báo cáo cuối tuần; chưa thể chốt.');
            if(gs.some(g=>sts.some(s=>s.groupId===g.id&&s.active)&&!(rs.some(r=>r.groupId===g.id&&!r.reportDate&&r.status==='approved')&&!rs.some(r=>r.groupId===g.id&&r.reportDate))&&dates.some(day=>!rs.some(r=>r.groupId===g.id&&r.reportDate===day&&r.status==='approved'))))fail(400,'Cần duyệt đủ báo cáo từng ngày đã chọn của tất cả tổ trước khi chốt.');
            if(rs.some(r=>r.status!=='approved'))fail(400,'Còn báo cáo chưa duyệt.');
            const es = await db.select().from(t.entries).where(and(eq(t.entries.classId, classId), eq(t.entries.week, w)));
            if (es.some(e => e.status === 'pending'))
                fail(400, 'Vẫn còn ghi nhận chưa được duyệt');
            const reopened=await db.select().from(t.periods).where(and(eq(t.periods.classId,classId),eq(t.periods.week,w))).get();
            const previousSnapshot=reopened?.snapshot?parse<Row>(reopened.snapshot,{}):null;const scoringConfig=previousSnapshot?.config?{...previousSnapshot.config,academicCalendar:config.academicCalendar}:config;
            const sn = snapshot(previousSnapshot?.standings||gs,previousSnapshot?.students||sts,es,scoringConfig);
            add(db.insert(t.periods).values({id:uid(),classId,week:w,status:'locked',snapshot:JSON.stringify(sn),createdAt:now()}).onConflictDoUpdate({target:[t.periods.classId,t.periods.week],set:{status:'locked',snapshot:JSON.stringify(sn),createdAt:now()}}));
            let previousDuties=(await db.select().from(t.duties).where(eq(t.duties.classId,classId))).filter(x=>x.status!=='cancelled');
            if(reopened?.snapshot){const swaps=await db.select().from(t.dutySwaps).where(eq(t.dutySwaps.classId,classId));const protectedIds=new Set(swaps.filter(x=>['requested','accepted'].includes(x.status)).flatMap(x=>[x.fromDutyId,x.toDutyId]));const replace=previousDuties.filter(d=>d.date>=vietnamToday()&&d.status==='assigned'&&!protectedIds.has(d.id)&&['automatic:','last:','violation:'].some(p=>d.sourceKey.startsWith(p+w+':')));for(const d of replace)add(db.update(t.duties).set({status:'cancelled'}).where(eq(t.duties.id,d.id)));const replaced=new Set(replace.map(d=>d.id));previousDuties=previousDuties.filter(d=>!replaced.has(d.id));}
            const schedulingSnapshot={...sn,students:sn.students.map((s:Row)=>({...s,active:sts.find(x=>x.id===s.id)?.active||0,roles:sts.find(x=>x.id===s.id)?.roles||s.roles}))};const automatic=dutyPlan(schedulingSnapshot,w,config,previousDuties,reopened?.snapshot?vietnamToday():'');
            const mechanism=dutyMechanism(config);
            for(const day of config.timetable||defaultConfig.timetable||[]){const when=dayPlus(w,7+day.weekday-1);if(reopened?.snapshot&&when<vietnamToday())continue;if(config.academicCalendar?.excludedWeeks.includes(monday(new Date(when))))continue;for(const session of schoolSessions(day)){const needed=session==='afternoon'?mechanism.afternoonClassWorkers+mechanism.afternoonTrashWorkers+mechanism.afternoonBoardWorkers:mechanism.classWorkers+mechanism.trashWorkers+mechanism.boardWorkers;const label=session==='afternoon'?'Buổi chiều':'Buổi sáng',assigned=[...previousDuties,...automatic].filter(x=>x.date===when&&(x.source.endsWith(' · '+label)||!x.source.includes(' · Buổi ')&&session===schoolSessions(day)[0]));if(new Set(assigned.map(x=>x.studentId)).size<needed)fail(400,'Ngày '+when+' '+label+' chưa đủ '+needed+' người hợp lệ. Kiểm tra sĩ số và miễn ban cán sự.');}}
            const scheduleIssues=dutyScheduleWarnings([...previousDuties,...automatic],w,config,reopened?.snapshot?vietnamToday():'');if(scheduleIssues.length)fail(400,scheduleIssues[0]);
            for (const d of automatic)
                add(db.insert(t.duties).values({ id: uid(), classId, ...d,sourceKey:d.sourceKey+':'+uid() } as any).onConflictDoNothing());
            break;
        }
        case 'addGrade': {
            const s = await student(b.studentId);
            if (!teacher && s.id !== own?.id)
                fail(403, 'Chỉ được tự ghi điểm của mình');
            const v = Number(b.value);
            const kind=b.kind||'regular',term=b.term||'1';if(!['regular','oral','midterm','final','bonus'].includes(kind)||!['1','2'].includes(term))fail(400,'Loại điểm hoặc học kì không hợp lệ.');
            const weight=amount(b.weight??(kind==='midterm'?2:kind==='final'?3:1),1,3),bonus=Number(b.bonus??0);if(!Number.isFinite(bonus)||bonus<0||bonus>10)fail(400,'Điểm cộng từ 0 đến 10.');
            const inAverage=kind==='bonus'?0:b.inAverage===false?0:1;
            let previous;if(b.id){previous=await db.select().from(t.grades).where(and(eq(t.grades.id,str(b.id,100)),eq(t.grades.classId,classId))).get();if(!previous)fail(404,'Không có điểm này.');if(!teacher&&(previous.createdBy!==user.email||previous.confirmed||previous.studentId!==s.id))fail(403,'Chỉ sửa điểm tự ghi của mình.');}

            if (!Number.isFinite(v) || v < 0 || v > 10)
                fail(400, 'Điểm phải từ 0 đến 10');
            const value={classId,studentId:s.id,subject:str(b.subject,100),value:String(v),kind,term,weight,bonus:String(bonus),inAverage,date:date(b.date),note:String(b.note||'').slice(0,1000),createdBy:previous?.createdBy||user.email,confirmed:teacher?1:0};
            if(previous)add(db.update(t.grades).set(value).where(eq(t.grades.id,previous.id)));else add(db.insert(t.grades).values({id:uid(),...value}));
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
        case 'createFundCollection': {
            if(!teacher&&!roles.includes('treasurer'))fail(403,'Chỉ thủ quỹ hoặc giáo viên tạo đợt thu.');
            const title=str(b.title,160),description=String(b.description||'').trim().slice(0,1200);
            const sum=amount(b.amount,1,100000000);
            const dueDate=date(b.dueDate);
            const id=uid();
            add(db.insert(t.fundCollections).values({id,classId,title,description,amount:sum,dueDate,status:'open',createdBy:user.email,createdAt:now()}));
            add(db.insert(t.notices).values({id:uid(),classId,title:'Thông báo thu quỹ: '+title,body:'Thủ quỹ thông báo thu '+sum.toLocaleString('vi-VN')+' ₫/học sinh. Hạn: '+dueDate+(description?' · '+description:''),createdBy:user.email,createdAt:now()}));
            break;
        }
        case 'closeFundCollection': {
            if(!teacher&&!roles.includes('treasurer'))fail(403,'Chỉ thủ quỹ hoặc giáo viên được chốt đợt thu.');
            const item=await db.select().from(t.fundCollections).where(and(eq(t.fundCollections.id,str(b.id,100)),eq(t.fundCollections.classId,classId))).get();
            if(!item)fail(404,'Không tìm thấy đợt thu');
            if(!['open','closed'].includes(b.status))fail(400,'Trạng thái không hợp lệ');
            add(db.update(t.fundCollections).set({status:b.status}).where(eq(t.fundCollections.id,item.id)));
            break;
        }
        case 'recordFundCollections': {
            if(!teacher&&!roles.includes('treasurer'))fail(403,'Chỉ thủ quỹ hoặc giáo viên được ghi nhận đã đóng.');
            const item=await db.select().from(t.fundCollections).where(and(eq(t.fundCollections.id,str(b.collectionId,100)),eq(t.fundCollections.classId,classId))).get();
            if(!item||item.status!=='open')fail(409,'Đợt thu đã đóng hoặc không tồn tại.');
            if(!Array.isArray(b.payments)||!b.payments.length||b.payments.length>80)fail(400,'Chỉ nhập tối đa 80 khoản đóng mỗi lượt.');
            const when=date(b.date);
            const existing=await db.select().from(t.funds).where(and(eq(t.funds.classId,classId),eq(t.funds.collectionId,item.id),eq(t.funds.status,'approved')));
            const paid=new Map<string,number>();
            for(const f of existing){if(!f.studentId)continue;paid.set(f.studentId,(paid.get(f.studentId)||0)+(f.type==='income'?f.amount:-f.amount))}
            for(const p of b.payments){
                const learner=await student(p.studentId);
                const money=amount(p.amount,1,100000000);
                if((paid.get(learner.id)||0)+money>item.amount)fail(400,'Học sinh '+learner.name+' đã đủ tiền, không thể ghi vượt khoản cần thu.');
                paid.set(learner.id,(paid.get(learner.id)||0)+money);
                add(db.insert(t.funds).values({id:uid(),classId,type:'income',amount:money,studentId:learner.id,description:'Thu '+item.title,date:when,proof:'',status:'approved',createdBy:user.email,collectionId:item.id}));
            }
            break;
        }
        case 'addFund': {
            if(!teacher&&!roles.includes('treasurer'))fail(403,'Chỉ thủ quỹ hoặc giáo viên được ghi thu chi');
            if(!['income','expense'].includes(b.type))fail(400,'Loại giao dịch không hợp lệ');
            if(b.studentId)await student(b.studentId);
            add(db.insert(t.funds).values({ id: uid(), classId, type: b.type, amount: amount(b.amount, 1), studentId: b.studentId || null, description: str(b.description, 500), date: date(b.date), proof: safeUrl(b.proof), status: 'approved', createdBy: user.email,collectionId:null }));
            break;
        }
        case 'reviewFund': {
            if(!teacher&&!roles.includes('treasurer'))fail(403,'Chỉ thủ quỹ hoặc giáo viên được duyệt giao dịch.');
            const f=await db.select().from(t.funds).where(and(eq(t.funds.id,b.id),eq(t.funds.classId,classId))).get();
            if(!f||f.status!=='pending')fail(400,'Chỉ duyệt giao dịch đang chờ');
            if(!['approved','rejected'].includes(b.status))fail(400,'Trạng thái không hợp lệ');
            add(db.update(t.funds).set({status:b.status}).where(eq(t.funds.id,f.id)));
            break;
        }
        case 'reverseFund': {
            if(!teacher&&!roles.includes('treasurer'))fail(403,'Chỉ thủ quỹ hoặc giáo viên được điều chỉnh thu chi.');
            const f=await db.select().from(t.funds).where(and(eq(t.funds.id,b.id),eq(t.funds.classId,classId))).get();
            if(!f||f.status!=='approved'||f.id.startsWith('reverse-'))fail(400,'Giao dịch không thể đảo.');
            const prior=await db.select().from(t.funds).where(and(eq(t.funds.classId,classId),eq(t.funds.id,'reverse-'+f.id))).get();
            if(prior)fail(409,'Đã có giao dịch điều chỉnh');
            add(db.insert(t.funds).values({id:'reverse-'+f.id,classId,type:f.type==='income'?'expense':'income',amount:f.amount,studentId:f.studentId,description:'Điều chỉnh '+f.description+': '+str(b.reason,500),date:new Date().toISOString().slice(0,10),proof:'',status:'approved',createdBy:user.email,collectionId:f.collectionId}));
            break;
        }
        case 'addActivity': {
            if (!teacher && !roles.includes('movement') && !roles.includes('leader'))
                fail(403, 'Chỉ cán sự phụ trách hoặc giáo viên được tạo hoạt động');
            add(db.insert(t.activities).values({ id: uid(), classId, title: str(b.title, 150), description: String(b.description || '').slice(0, 2000), date: date(b.date), points: amount(b.points, 0, 1000), participants: '[]', status: 'open' }));
            break;
        }
        case 'updateActivity': {
            if(!teacher&&!roles.includes('movement')&&!roles.includes('leader'))
                fail(403,'Chỉ cán sự phong trào hoặc giáo viên được sửa hoạt động.');
            const a=await db.select().from(t.activities).where(and(eq(t.activities.id,str(b.id,100)),eq(t.activities.classId,classId))).get();
            if(!a||a.status!=='open')fail(409,'Chỉ cập nhật được hoạt động đang mở.');
            add(db.update(t.activities).set({title:str(b.title,150),description:String(b.description||'').slice(0,2000),date:date(b.date),points:amount(b.points,0,1000)}).where(eq(t.activities.id,a.id)));
            break;
        }
        case 'cancelActivity': {
            if(!teacher&&!roles.includes('movement')&&!roles.includes('leader'))
                fail(403,'Chỉ cán sự phong trào hoặc giáo viên được hủy hoạt động.');
            const a=await db.select().from(t.activities).where(and(eq(t.activities.id,str(b.id,100)),eq(t.activities.classId,classId))).get();
            if(!a||a.status!=='open')fail(409,'Không thể hủy hoạt động đã hoàn thành.');
            add(db.update(t.activities).set({status:'cancelled'}).where(eq(t.activities.id,a.id)));
            break;
        }
        case 'setActivityParticipants': {
            if(!teacher&&!roles.includes('movement')&&!roles.includes('leader'))fail(403,'Chỉ GV, lớp trưởng hoặc lớp phó phong trào được quản lý danh sách.');
            const a=await db.select().from(t.activities).where(and(eq(t.activities.id,str(b.id,100)),eq(t.activities.classId,classId))).get();if(!a||a.status!=='open')fail(409,'Hoạt động không còn mở.');
            if(!Array.isArray(b.studentIds)||b.studentIds.length>500||new Set(b.studentIds).size!==b.studentIds.length||b.studentIds.some((id:any)=>typeof id!=='string'))fail(400,'Danh sách tham gia không hợp lệ.');
            const members=await allStudents();if(b.studentIds.some((id:string)=>!members.some(s=>s.id===id&&s.active)))fail(403,'Chỉ chọn học sinh đang hoạt động trong lớp.');
            const inactive=parse<string[]>(a.participants,[]).filter(id=>members.some(s=>s.id===id&&!s.active));
            add(db.update(t.activities).set({participants:JSON.stringify([...inactive,...b.studentIds])}).where(eq(t.activities.id,a.id)));break;
        }
        case 'joinActivity': {
            const a = await db.select().from(t.activities).where(and(eq(t.activities.id, b.id), eq(t.activities.classId, classId))).get();
            if (!a || a.status !== 'open')
                fail(400, 'Hoạt động đã kết thúc');
            const s = await student(b.studentId || own?.id);
            if (!teacher && !roles.includes('movement') && !roles.includes('leader') && s.id !== own?.id)
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
            const when=date(b.date);
            const occupied=await db.select().from(t.duties).where(and(eq(t.duties.classId,classId),eq(t.duties.studentId,s.id),eq(t.duties.date,when))).get();
            if(occupied)fail(409,'Học sinh đã có nhiệm vụ trong ngày này.');
            add(db.insert(t.duties).values({ id: uid(), classId, studentId: s.id, date: when, task: str(b.task, 100), source: str(b.source || 'Giáo viên phân công', 300), sourceKey: uid(), status: 'assigned' }));
            break;
        }
        case 'updateDuty': {
            const d = await db.select().from(t.duties).where(and(eq(t.duties.id, b.id), eq(t.duties.classId, classId))).get();
            if (!d||d.status==='cancelled')
                fail(404, 'Không có lịch trực đang hiệu lực');
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
        case 'requestDutySwap': {
            if(!own)fail(403,'Chỉ học sinh có lịch trực được đề nghị đổi.');
            const from=await db.select().from(t.duties).where(and(eq(t.duties.id,b.fromDutyId),eq(t.duties.classId,classId))).get();
            const to=await db.select().from(t.duties).where(and(eq(t.duties.id,b.toDutyId),eq(t.duties.classId,classId))).get();
            if(!from||!to||from.studentId!==own.id||from.studentId===to.studentId||from.id===to.id)fail(400,'Chọn lịch của mình và lịch của một bạn khác trong lớp.');
            await student(to.studentId);
            if([from,to].some(d=>d.status!=='assigned'||d.date<vietnamToday()))fail(409,'Chỉ đổi lịch chưa làm và chưa qua ngày trực.');
            const pending=await db.select().from(t.dutySwaps).where(eq(t.dutySwaps.classId,classId));
            if(pending.some(x=>['requested','accepted'].includes(x.status)&&[x.fromDutyId,x.toDutyId].some(id=>[from.id,to.id].includes(id))))fail(409,'Một lịch đang có đề nghị đổi chưa xử lý.');
            add(db.insert(t.dutySwaps).values({id:uid(),classId,fromDutyId:from.id,toDutyId:to.id,fromStudentId:from.studentId,toStudentId:to.studentId,reason:str(b.reason,1000),createdAt:now(),updatedAt:now()}));break;
        }
        case 'respondDutySwap':
        case 'reviewDutySwap': {
            const swap=await db.select().from(t.dutySwaps).where(and(eq(t.dutySwaps.id,b.id),eq(t.dutySwaps.classId,classId))).get();
            if(!swap)fail(404,'Không có đề nghị đổi trực.');
            let status:string;
            if(actionName==='respondDutySwap'){
                if(swap.status!=='requested')fail(409,'Đề nghị đã được xử lý.');
                if(own?.id!==swap.toStudentId)fail(403,'Chỉ bạn được đề nghị mới có thể đồng ý / từ chối.');
                if(!['accepted','rejected'].includes(b.status))fail(400,'Trạng thái không hợp lệ.');status=b.status;
            }else{
                if(!teacher&&!roles.some(r=>['leader','discipline'].includes(r)))fail(403,'Chỉ giáo viên, lớp trưởng hoặc lớp phó nề nếp được duyệt đổi trực.');
                if(swap.status!=='accepted')fail(409,'Cần bạn nhận đổi đồng ý trước.');
                if(!['approved','rejected'].includes(b.status))fail(400,'Trạng thái không hợp lệ.');status=b.status;
            }
            if(status==='approved'||status==='accepted'){
                const ds=await db.select().from(t.duties).where(and(eq(t.duties.classId,classId),inArray(t.duties.id,[swap.fromDutyId,swap.toDutyId])));
                const from=ds.find(d=>d.id===swap.fromDutyId),to=ds.find(d=>d.id===swap.toDutyId);
                if(!from||!to||from.studentId!==swap.fromStudentId||to.studentId!==swap.toStudentId||[from,to].some(d=>d.status!=='assigned'||d.date<vietnamToday()))fail(409,'Lịch trực đã thay đổi hoặc quá hạn. Hãy từ chối đề nghị cũ.');
                const sameDay=await db.select().from(t.duties).where(and(eq(t.duties.classId,classId),or(and(eq(t.duties.studentId,swap.toStudentId),eq(t.duties.date,from.date)),and(eq(t.duties.studentId,swap.fromStudentId),eq(t.duties.date,to.date)))));
                if(sameDay.some(d=>d.id!==from.id&&d.id!==to.id))fail(409,'Đổi lịch sẽ khiến một bạn nhận hai nhiệm vụ cùng ngày.');
                await student(swap.fromStudentId);await student(swap.toStudentId);
                if(status==='approved'){
                    add(db.update(t.duties).set({studentId:swap.toStudentId}).where(eq(t.duties.id,swap.fromDutyId)));
                    add(db.update(t.duties).set({studentId:swap.fromStudentId}).where(eq(t.duties.id,swap.toDutyId)));
                }
            }
            add(db.update(t.dutySwaps).set({status,reviewNote:String(b.note||'').slice(0,1000),updatedAt:now()}).where(eq(t.dutySwaps.id,swap.id)));break;
        }
        case 'addPrivateMessage': {
            if(!own)fail(403,'Hộp thư này dành cho học sinh gửi giáo viên.');
            add(db.insert(t.feedback).values({id:uid(),classId,studentId:own.id,kind:'private',message:str(b.message,2000),createdBy:user.email,createdAt:now()}));break;
        }
        case 'saveBadgeType': {
            needTeacher();const id=b.id?str(b.id,100):uid();
            if(!['star','heart','sparkles','trophy','leaf'].includes(b.icon))fail(400,'Biểu tượng không hợp lệ.');
            const old=await db.select().from(t.badgeTypes).where(eq(t.badgeTypes.id,id)).get();
            if(old&&old.classId!==classId)fail(403,'Huy hiệu không thuộc lớp.');
            const value={id,classId,name:str(b.name,100),description:str(b.description,500),icon:b.icon,points:amount(b.points,0,1000),active:b.active===false?0:1};
            add(db.insert(t.badgeTypes).values(value).onConflictDoUpdate({target:t.badgeTypes.id,set:value}));break;
        }
        case 'awardBadge': {
            needTeacher();const member=await student(b.studentId);const badge=await db.select().from(t.badgeTypes).where(and(eq(t.badgeTypes.id,b.badgeId),eq(t.badgeTypes.classId,classId))).get();
            if(!badge?.active)fail(400,'Huy hiệu đã ngừng sử dụng.');
            const d=date(b.date);if(d>vietnamToday())fail(400,'Không trao huy hiệu cho ngày tương lai.');const w=monday(new Date(d));await openWeek(w);const month=d.slice(0,7);
            const existing=await db.select().from(t.badgeAwards).where(and(eq(t.badgeAwards.classId,classId),eq(t.badgeAwards.studentId,member.id),eq(t.badgeAwards.badgeId,badge.id),eq(t.badgeAwards.month,month))).get();
            if(existing)fail(409,'Học sinh đã có huy hiệu này trong tháng (kể cả huy hiệu đã thu hồi).');
            const id=uid(),reason=str(b.reason,1000);
            add(db.insert(t.badgeAwards).values({id,classId,studentId:member.id,badgeId:badge.id,month,date:d,name:badge.name,icon:badge.icon,points:badge.points,reason,createdBy:user.email,createdAt:now()}));
            if(badge.points)add(db.insert(t.entries).values({id:uid(),classId,studentId:member.id,groupId:member.groupId,week:w,reportDate:config.reportMode==='daily'?d:'',ruleId:'badge/'+id,ruleName:'Huy hiệu: '+badge.name,category:'movement',delta:badge.points,count:1,status:'approved',note:reason,createdBy:user.email,createdAt:now()}));break;
        }
        case 'revokeBadge': {
            needTeacher();const award=await db.select().from(t.badgeAwards).where(and(eq(t.badgeAwards.id,b.id),eq(t.badgeAwards.classId,classId))).get();
            if(!award||award.status!=='active')fail(409,'Huy hiệu không tồn tại hoặc đã thu hồi.');await openWeek(monday(new Date(award.date)));
            const reason=str(b.reason,1000);add(db.update(t.badgeAwards).set({status:'revoked'}).where(eq(t.badgeAwards.id,award.id)));
            add(db.update(t.entries).set({status:'rejected',reviewNote:'Thu hồi huy hiệu: '+reason}).where(and(eq(t.entries.classId,classId),eq(t.entries.ruleId,'badge/'+award.id))));break;
        }
        case 'saveMonthlyProfile': {
            needTeacher();const member=await student(b.studentId),month=str(b.month,7);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month>vietnamToday().slice(0,7))fail(400,'Tháng không hợp lệ.');
            const old=await db.select().from(t.monthlyProfiles).where(and(eq(t.monthlyProfiles.classId,classId),eq(t.monthlyProfiles.studentId,member.id),eq(t.monthlyProfiles.month,month))).get();
            if(old?.status==='approved')fail(409,'Hồ sơ đã duyệt được giữ nguyên.');
            const [es,gs,cs,awards]=await Promise.all([db.select().from(t.entries).where(eq(t.entries.classId,classId)),db.select().from(t.grades).where(eq(t.grades.classId,classId)),db.select().from(t.conduct).where(eq(t.conduct.classId,classId)),db.select().from(t.badgeAwards).where(eq(t.badgeAwards.classId,classId))]);
            const value={id:old?.id||uid(),classId,studentId:member.id,month,snapshot:JSON.stringify(monthlyProfile(member,month,es,gs,cs,awards)),comment:String(b.comment||'').slice(0,2000),status:'draft',createdBy:user.email,updatedAt:now()};
            add(db.insert(t.monthlyProfiles).values(value).onConflictDoUpdate({target:[t.monthlyProfiles.classId,t.monthlyProfiles.studentId,t.monthlyProfiles.month],set:value}));break;
        }
        case 'approveMonthlyProfile': {
            needTeacher();const profile=await db.select().from(t.monthlyProfiles).where(and(eq(t.monthlyProfiles.id,b.id),eq(t.monthlyProfiles.classId,classId))).get();
            if(!profile||profile.status!=='draft')fail(409,'Chỉ được duyệt hồ sơ nháp.');
            const sn=parse<Row>(profile.snapshot,{});add(db.update(t.monthlyProfiles).set({status:'approved',updatedAt:now(),snapshot:JSON.stringify({...sn,approvedBy:user.name,approvedAt:now()})}).where(eq(t.monthlyProfiles.id,profile.id)));break;
        }
        case 'acknowledgeAlert': {
            needTeacher();const id=str(b.id,500);const es=await db.select().from(t.entries).where(eq(t.entries.classId,classId));const decisions=await db.select().from(t.settings).where(eq(t.settings.key,'academic-conduct:'+classId)).get();if(![...teacherAlerts(es,config),...termConductAlerts(parse<Row[]>(decisions?.value,[]),config)].some(a=>a.id===id))fail(404,'Cảnh báo không còn hiệu lực.');
            const key='alert-read:'+classId+':'+user.email;const old=await db.select().from(t.settings).where(eq(t.settings.key,key)).get();const ids=[...new Set([...parse<string[]>(old?.value,[]),id])].slice(-2000);add(db.insert(t.settings).values({key,value:JSON.stringify(ids)}).onConflictDoUpdate({target:t.settings.key,set:{value:JSON.stringify(ids)}}));break;
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
    const guarded = [db.insert(t.guards).values({ id: guardId, ok: sql `CASE WHEN (SELECT revision FROM classes WHERE id = ${classId}) = ${cls.revision} THEN 1 ELSE 0 END` }), ...commands, db.update(t.classes).set({ revision: cls.revision + 1 }).where(eq(t.classes.id, classId)), db.insert(t.audit).values({ id: uid(), classId, actor: user.email, action: actionName, details: JSON.stringify({ ...b, action: undefined, password:undefined,oldPassword:undefined,_createdAccounts:undefined,proof:typeof b.proof==='string'&&b.proof.startsWith('data:')?'[Ảnh minh chứng được lưu trong hồ sơ]':b.proof }).slice(0, 30000), createdAt: now() }), db.delete(t.guards).where(eq(t.guards.id, guardId))];
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
