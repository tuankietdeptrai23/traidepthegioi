import {eq,and,lt,sql} from 'drizzle-orm';
import {getDb} from '@/db';
import * as t from '@/db/schema';
import {requestHeaders} from './request-context';
import {getChatGPTUser} from '@/app/chatgpt-auth';
export const COOKIE='lhy_session';
export const SESSION_SECONDS=90*24*60*60;
export class AuthError extends Error {constructor(public status:number,message:string){super(message)}}
function deny(status:number,message:string):never{throw new AuthError(status,message)}
export function normalizeLogin(value:unknown){const s=typeof value==='string'?value.trim().toLowerCase():'';if(!/^[a-z0-9][a-z0-9_.-]{2,39}$/.test(s))deny(400,'ID gồm 3–40 ký tự: chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.');return s}
export function checkPassword(value:unknown):string{if(typeof value!=='string'||value.length<8||value.length>128)deny(400,'Mật khẩu cần từ 8 đến 128 ký tự.');return value as string}
const hex=(b:ArrayBuffer|Uint8Array)=>Array.from(new Uint8Array(b instanceof Uint8Array?b.buffer as ArrayBuffer:b)).map(x=>x.toString(16).padStart(2,'0')).join('');
export const digest=async(s:string)=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
export async function passwordRecord(password:unknown){const p=checkPassword(password);const salt=hex(crypto.getRandomValues(new Uint8Array(16)));return {passwordSalt:salt,passwordHash:await derive(p,salt)}}
async function derive(password:string,salt:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256))}
export async function verifyPassword(password:string,salt:string|null,hash:string|null){const got=await derive(password,salt||'00000000000000000000000000000000');const expected=hash||'0'.repeat(64);let diff=got.length^expected.length;for(let i=0;i<got.length;i++)diff|=got.charCodeAt(i)^(expected.charCodeAt(i)||0);return diff===0&&!!hash&&!!salt}
export function safeUser(u:any){return {email:u.email,name:u.name,role:u.role,active:u.active,loginId:u.loginId||'',hasPassword:!!u.passwordHash,mustChangePassword:!!u.mustChangePassword}}
export function cookieValue(headers:Headers|Readonly<Headers>){const list=(headers.get('cookie')||'').split(';').map(x=>x.trim());return list.find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||''}
export function sessionCookie(token:string,secure:boolean,remove=false){return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${remove?0:SESSION_SECONDS}${secure?'; Secure':''}`}
export async function currentUser(){const db=getDb();const h=await requestHeaders();const token=cookieValue(h);if(!/^[a-f0-9]{64}$/.test(token))return null;
 const row=await db.select({session:t.sessions,user:t.users}).from(t.sessions).innerJoin(t.users,eq(t.sessions.userKey,t.users.email)).where(eq(t.sessions.tokenHash,await digest(token))).get();
 if(!row||!row.user.active||row.session.expiresAt<=Date.now()||row.session.version!==row.user.credentialVersion)return null;
 return row.user;
}
export async function canSetupOwner(){const who=await getChatGPTUser();if(!who)return null;const db=getDb();const owner=await db.select().from(t.settings).where(eq(t.settings.key,'owner')).get();if(!owner||owner.value!==who.email.toLowerCase())return null;
 const user=await db.select().from(t.users).where(eq(t.users.email,owner.value)).get();if(!user||!user.active||user.role!=='admin'||user.passwordHash)return null;return user;
}
async function throttle(login:string,ip:string){const db=getDb();const at=Date.now();const keys=[await digest('account:'+login+':'+ip),await digest('ip:'+ip)];
 for(let i=0;i<keys.length;i++){const row=await db.insert(t.attempts).values({key:keys[i],windowStart:at,count:1}).onConflictDoUpdate({target:t.attempts.key,set:{count:sql`CASE WHEN ${t.attempts.windowStart} < ${at-15*60000} THEN 1 ELSE ${t.attempts.count}+1 END`,windowStart:sql`CASE WHEN ${t.attempts.windowStart} < ${at-15*60000} THEN ${at} ELSE ${t.attempts.windowStart} END`}}).returning().get();if(row.count>(i===0?10:100))deny(429,'Đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau 15 phút.');}
 return keys[0];
}
async function newSession(user:any){const token=hex(crypto.getRandomValues(new Uint8Array(32)));return {token,row:{tokenHash:await digest(token),userKey:user.email,createdAt:Date.now(),expiresAt:Date.now()+SESSION_SECONDS*1000,version:user.credentialVersion}}}
export async function login(loginValue:unknown,passwordValue:unknown,ip:string){const loginId=normalizeLogin(loginValue);const password=typeof passwordValue==='string'&&passwordValue.length<=128?passwordValue:'';const attemptKey=await throttle(loginId,ip);const db=getDb();const u=await db.select().from(t.users).where(eq(t.users.loginId,loginId)).get();const ok=await verifyPassword(password,u?.passwordSalt||null,u?.passwordHash||null);if(!u||!ok||!u.active)deny(401,'ID hoặc mật khẩu chưa đúng, hoặc tài khoản đã bị khóa.');
 const session=await newSession(u);await db.batch([db.insert(t.sessions).values(session.row),db.delete(t.attempts).where(eq(t.attempts.key,attemptKey)),db.delete(t.sessions).where(lt(t.sessions.expiresAt,Date.now()))]);return {token:session.token,user:safeUser(u)};
}
export async function setupOwner(loginValue:unknown,passwordValue:unknown){const owner=await canSetupOwner();if(!owner)deny(403,'Chỉ chủ sở hữu được thiết lập tài khoản quản trị lần đầu.');const loginId=normalizeLogin(loginValue);const creds=await passwordRecord(passwordValue);const db=getDb();const used=await db.select().from(t.users).where(eq(t.users.loginId,loginId)).get();if(used)deny(409,'ID này đã được sử dụng.');
 const next={...owner!,...creds,loginId,mustChangePassword:passwordValue==='12345678'?1:0,credentialVersion:owner!.credentialVersion+1};const session=await newSession(next);const guard=crypto.randomUUID();
 try{await db.batch([db.insert(t.guards).values({id:guard,ok:sql`CASE WHEN (SELECT password_hash FROM users WHERE email=${owner!.email}) IS NULL THEN 1 ELSE 0 END`}),db.update(t.users).set({...creds,loginId,credentialVersion:next.credentialVersion,mustChangePassword:next.mustChangePassword}).where(eq(t.users.email,owner!.email)),db.insert(t.sessions).values(session.row),db.delete(t.guards).where(eq(t.guards.id,guard))])}catch(e){if(String(e).includes('guard_ok'))deny(409,'Tài khoản quản trị đã được thiết lập. Hãy đăng nhập bằng ID.');throw e}return {token:session.token,user:safeUser(next)};
}
export async function logout(){const token=cookieValue(await requestHeaders());if(token)await getDb().delete(t.sessions).where(eq(t.sessions.tokenHash,await digest(token)))}
export async function changePassword(oldPassword:unknown,newPassword:unknown){const u=await currentUser();if(!u)deny(401,'Cần đăng nhập.');if(typeof oldPassword!=='string'||!(await verifyPassword(oldPassword,u!.passwordSalt,u!.passwordHash)))deny(400,'Mật khẩu hiện tại chưa đúng.');const creds=await passwordRecord(newPassword);await getDb().batch([getDb().update(t.users).set({...creds,credentialVersion:u!.credentialVersion+1,mustChangePassword:0}).where(eq(t.users.email,u!.email)),getDb().delete(t.sessions).where(eq(t.sessions.userKey,u!.email))]);}
