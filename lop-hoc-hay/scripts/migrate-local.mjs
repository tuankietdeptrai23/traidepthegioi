import {readdirSync,readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';import {join} from 'node:path';
const base=['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state'];
const run=(args,json=false)=>{const r=spawnSync(process.execPath,[...base,...args],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||r.stdout);return r.stdout};
run(['--command','CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY NOT NULL)']);
const output=run(['--command','SELECT name FROM local_migrations','--json']);let data;try{data=JSON.parse(output)}catch{throw Error('Cannot read migration history: '+output)}
const done=new Set(data.flatMap(x=>x.results||[]).map(x=>x.name));
for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()){
 if(done.has(f)){console.log('Already applied:',f);continue}
 const dir=mkdtempSync(join(tmpdir(),'lop-migrate-'));const target=join(dir,'migration.sql');
 writeFileSync(target,readFileSync('drizzle/'+f,'utf8')+`\nINSERT INTO local_migrations(name) VALUES('${f.replaceAll("'","''")}');\n`);
 try{run(['--file',target]);console.log('Applied:',f)}finally{rmSync(dir,{recursive:true,force:true})}
}
