import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
const files=readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort();
for(const file of files.filter(f=>!f.startsWith('0007_')))db.exec(readFileSync('drizzle/'+file,'utf8'));
db.prepare('INSERT INTO users(email,name,role,login_id,password_hash,password_salt) VALUES(?,?,?,?,?,?)').run('keep-id','Keep teacher','teacher','keep-login','existing-hash','existing-salt');
db.prepare('INSERT INTO classes(id,name,year,teacher_email,config,created_at) VALUES(?,?,?,?,?,?)').run('keep-class','Keep class','2026','keep-id','{}','2026-10-31');
db.exec("INSERT INTO groups(id,class_id,name) VALUES('keep-group','keep-class','Tổ 1'); INSERT INTO students(id,class_id,name,email,group_id,gender) VALUES('keep-student','keep-class','Keep pupil','keep-id','keep-group','female'); INSERT INTO reports(id,class_id,week,group_id,status,created_by,report_date) VALUES('keep-report','keep-class','2026-10-26','keep-group','approved','keep-id','2026-10-30'); INSERT INTO funds(id,class_id,type,amount,description,date,created_by,status) VALUES('keep-fund','keep-class','income',12345,'Original receipt','2026-10-31','keep-id','approved'); INSERT INTO grades(id,class_id,student_id,subject,value,date,created_by,kind,term,weight,bonus) VALUES('keep-grade','keep-class','keep-student','Toán','8','2026-10-31','keep-id','midterm','2',2,'0.5');");
const tables=['users','classes','groups','students','reports','grades','funds'];
const before=Object.fromEntries(tables.map(t=>[t,db.prepare('SELECT * FROM '+t).all()]));
db.exec(readFileSync('drizzle/0007_fund_collections.sql','utf8'));
for(const table of tables){const after=db.prepare('SELECT * FROM '+table).all();for(const row of after)if(table==='funds'){assert.equal(row.collection_id,null);delete row.collection_id}assert.deepEqual(after,before[table],table+' must survive unchanged')}
assert.equal(db.prepare('SELECT count(*) n FROM fund_collections').get().n,0);
assert.ok(db.prepare('PRAGMA foreign_key_check').all().length===0);
console.log('✓ Migration 0007 preserves all existing account, class, report, grade and fund fields; creates an empty collection table.');db.close();
