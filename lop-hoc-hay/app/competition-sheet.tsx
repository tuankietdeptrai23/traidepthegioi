'use client';
import {useEffect,useState} from 'react';
import {Table2,SquarePen,Save,LockKeyhole,CheckCircle2,Info} from 'lucide-react';
import {countPaste} from '@/lib/sheet-input';
import {canReport,ruleScore,classSubjects,needsLearningSubject,type Row,type Rule} from '@/lib/domain';

export default function CompetitionSheet({d,week,reportDate='',save,reorderRules,busy}:any){
 const roles:string[]=d.roles||[];
 const own=d.students.find((s:Row)=>s.id===d.ownId);
 const editor=d.teacher||roles.length>0;
 const allowed:Row[]=d.groups.filter((g:Row)=>d.teacher||canReport(roles,own?.groupId||'',g.id));
 const [mode,setMode]=useState<'edit'|'view'>(editor?'edit':'view');
 const [groupId,setGroupId]=useState(allowed.find(g=>g.id===own?.groupId)?.id||allowed[0]?.id||'');
 const [selectedRuleId,setSelectedRuleId]=useState('');
 const [draft,setDraft]=useState<Row>({});
 const [subject,setSubject]=useState('');
 const [category,setCategory]=useState('all');
 const [saving,setSaving]=useState(false);
 const [moving,setMoving]=useState(false);
 const [dragRule,setDragRule]=useState('');
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 useEffect(()=>{setDraft({});setError('');setMessage('')},[week]);
 const weeklySheet=d.sheets?.[week];
 const sheet=(reportDate?(d.dailySheets?.[reportDate]||(weeklySheet?{...weeklySheet,rows:weeklySheet.rows.map((s:Row)=>({...s,counts:{},subjectCounts:{},recorded:{}}))}:null)):weeklySheet)||{rules:d.config.rules,base:d.config.base,rows:d.students.filter((s:Row)=>s.active).map((s:Row)=>({...s,counts:{},subjectCounts:{},recorded:{},score:d.config.base}))};
 const locked=d.periods.some((p:Row)=>p.week===week&&p.status==='locked');
 const rules:Rule[]=sheet.rules;
 const visibleRules=rules.filter(r=>category==='all'||r.category===category);
 const selected=rules.find(r=>r.id===selectedRuleId)||rules[0];
 const groups:Row[]=mode==='edit'?allowed.filter(g=>g.id===groupId):d.groups;
 const report=d.reports.find((r:Row)=>r.week===week&&r.groupId===groupId&&(r.reportDate||'')===reportDate);
 const editable=editor&&mode==='edit'&&!locked&&(!report||report.status==='returned');
 const key=(id:string,rid:string,chosen=subject)=>id+'|'+rid+(needsLearningSubject(rules.find(r=>r.id===rid)!)?'|'+chosen:'');
 const inputValue=(s:Row,r:Rule):number|string=>{
   const override=draft[key(s.id,r.id)];
   if(override!==undefined)return override;
   if(r.kind==='speaking-total')return s.recorded?.[r.id] ? (s.counts[r.id]??0) : '';
   if(needsLearningSubject(r))return subject ? (s.subjectCounts?.[r.id+'|'+subject]||'') : '';
   return s.counts[r.id]||'';
 };
 const preview=(s:Row)=>{
   const baseline=s.previewScore??(sheet.base+rules.reduce((n,r)=>r.kind==='speaking-total'?
     n+(s.recorded?.[r.id]?ruleScore(r,s.counts[r.id]||0):0):n+(s.counts[r.id]||0)*r.points,0));
   return baseline+Object.entries(draft).reduce((n,[k,v])=>{
     const [sid,rid,chosen='']=k.split('|');if(sid!==s.id)return n;
     const r=rules.find(rule=>rule.id===rid);if(!r)return n;
     if(r.kind==='speaking-total')return n+(v===''?0:ruleScore(r,Number(v)))-(s.recorded?.[rid]?ruleScore(r,s.counts[rid]||0):0);
     const old=needsLearningSubject(r)?s.subjectCounts?.[rid+'|'+chosen]||0:s.counts[rid]||0;
     return n+(Number(v||0)-old)*r.points;
   },0);
 };
 const changes=Object.entries(draft).map(([k,v])=>{
   const [studentId,ruleId,chosen='']=k.split('|');
   const row=sheet.rows.find((s:Row)=>s.id===studentId);
   const rule=rules.find(r=>r.id===ruleId);
   const count=rule?.kind==='speaking-total'&&v===''?null:Number(v)||0;
   return {studentId,ruleId,count,subject:chosen,row,rule};
 }).filter(c=>{
   if(!c.row||!c.rule||c.row.groupId!==groupId)return false;
   if(c.rule.kind==='speaking-total')
     return c.count!==(c.row.recorded?.[c.ruleId]?(c.row.counts[c.ruleId]??0):null);
   const previous=needsLearningSubject(c.rule)?c.row.subjectCounts?.[c.ruleId+'|'+c.subject]||0:c.row.counts[c.ruleId]||0;
   return c.count!==previous;
 });
 const update=(s:Row,r:Rule,text:string)=>{
   setDraft(current=>({...current,[key(s.id,r.id)]:text}));
   setMessage('');
 };
 function paste(e:React.ClipboardEvent<HTMLInputElement>,rows:Row[],row:number,col:number){const text=e.clipboardData.getData('text');if(!/[\r\n\t]/.test(text))return;e.preventDefault();try{const parsed=countPaste(text,visibleRules.slice(col),rows.length-row,subject);if(reportDate&&!d.speakingAvailableDates?.includes(reportDate)&&parsed.some(p=>visibleRules[col+p.col].category==='speaking'))throw Error('Cột phát biểu đang khóa. Chỉ dán các cột được mở.');setDraft(old=>{const next={...old};for(const p of parsed)next[key(rows[row+p.row].id,visibleRules[col+p.col].id)]=p.count===null?'':String(p.count);return next});setError('');setMessage('Đã dán '+parsed.length+' ô. Kiểm tra rồi lưu bảng.')}catch(err){setError((err as Error).message)}}
 function navigate(e:React.KeyboardEvent<HTMLInputElement>,row:number,col:number){if(!['Enter','ArrowDown','ArrowUp'].includes(e.key))return;e.preventDefault();const next=row+(e.key==='ArrowUp'||e.shiftKey?-1:1);const input=e.currentTarget.closest('table')?.querySelector<HTMLInputElement>(`input[data-row="${next}"][data-col="${col}"]`);if(input&&!input.disabled)input.focus()}
 const cell=(s:Row,r:Rule,rows:Row[],row:number,col:number)=>mode==='edit'?
  <input data-row={row} data-col={col} onKeyDown={e=>navigate(e,row,col)} onPaste={e=>paste(e,rows,row,col)} aria-label={s.name+' - '+r.name+(needsLearningSubject(r)?' - '+(subject||'chưa chọn môn'):'')} type="number" inputMode="numeric" min="0" max={r.limit||100}
      disabled={!editable||saving||busy||(r.category==='speaking'&&reportDate&&!d.speakingAvailableDates?.includes(reportDate))||(needsLearningSubject(r)&&!subject)} value={inputValue(s,r)} placeholder={r.kind==='speaking-total'?'Chưa nhập':'—'}
      onChange={e=>update(s,r,e.target.value)}/>:
  <span>{r.kind==='speaking-total'?(s.recorded?.[r.id]?(s.counts[r.id]??0):'—'):(needsLearningSubject(r)?(subject?s.subjectCounts?.[r.id+'|'+subject]||'—':'Chọn môn'):(s.counts[r.id]||'—'))}</span>;
 async function commit(){
   setSaving(true);setError('');setMessage('');
   try{
     for(let i=0;i<changes.length;i+=80){
       const part=changes.slice(i,i+80);await save({week,reportDate,groupId,cells:part.map(({row,rule,...x})=>x)});const keys=new Set(part.map(c=>key(c.studentId,c.ruleId,c.subject)));setDraft(old=>Object.fromEntries(Object.entries(old).filter(([k])=>!keys.has(k))));
     }
     setDraft({});setMessage('Đã lưu bảng. Gửi báo cáo để giáo viên hoặc cán sự có quyền duyệt.');
   }catch(e){setError((e as Error).message)}finally{setSaving(false)}
 }
 async function moveRule(id:string,position:number){
   if(!d.teacher||locked||busy||moving||!reorderRules)return;
   if(changes.length){setError('Hãy lưu các ô đã sửa trước khi thay đổi thứ tự cột.');return}
   const ordered=[...rules],from=ordered.findIndex(r=>r.id===id);
   if(from<0||position<0||position>=ordered.length||position===from)return;
   const [item]=ordered.splice(from,1);ordered.splice(position,0,item);
   setMoving(true);setError('');
   try{await reorderRules(ordered);setMessage('Đã lưu thứ tự cột mới cho cả lớp.')}
   catch(e){setError((e as Error).message)}finally{setMoving(false);setDragRule('')}
 }
 const renderScore=(s:Row)=>mode==='edit'?preview(s):s.score;
 return <section className="card section excel-section" id="competition-sheet">
  <div className="section-head"><div><h3><Table2 size={18}/>Bảng Excel · Toàn bộ quy tắc thi đua</h3><p>Cùng một bảng trên điện thoại và laptop. Bấm ô để nhập; vuốt ngang xem các quy tắc, tên học sinh luôn được giữ bên trái.</p></div>
   <div className="sheet-tabs"><button className={mode==='view'?'selected':''} disabled={saving||busy} onClick={()=>setMode('view')}><Table2 size={15}/>Xem {d.groups.length} tổ</button>{editor&&<button className={mode==='edit'?'selected':''} disabled={saving||busy} onClick={()=>setMode('edit')}><SquarePen size={15}/>Nhập trực tiếp</button>}</div>
  </div>
  <div className="sheet-toolbar">{mode==='edit'?<>
    <select aria-label="Tổ nhập thi đua" disabled={saving||busy} value={groupId} onChange={e=>{if(Object.keys(draft).length&&!window.confirm('Chuyển tổ sẽ bỏ các ô chưa lưu. Tiếp tục?'))return;setDraft({});setGroupId(e.target.value);setError('')}}>{allowed.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>
    {visibleRules.some(needsLearningSubject)&&<select className="subject-picker" aria-label="Chọn môn học để nhập và xem điểm thuộc bài" value={subject} disabled={saving||busy} onChange={e=>setSubject(e.target.value)}><option value="">Chọn môn học…</option>{classSubjects.map(name=><option value={name} key={name}>{name}</option>)}</select>}
    <button className="btn primary" disabled={!editable||!changes.length||saving||busy} onClick={commit}><Save size={15}/>{saving?'Đang lưu…': 'Lưu '+changes.length+' ô'}</button>
   </>:<><span><LockKeyhole size={15}/>Chế độ xem · Học sinh thường không được sửa bảng</span>{visibleRules.some(needsLearningSubject)&&<select className="subject-picker" aria-label="Chọn môn để xem điểm thuộc bài" value={subject} disabled={saving||busy} onChange={e=>setSubject(e.target.value)}><option value="">Chọn môn học…</option>{classSubjects.map(name=><option key={name} value={name}>{name}</option>)}</select>}</>}</div>
  <div className="sheet-category-filter"><label>Nhóm cột<select aria-label="Lọc nhóm quy tắc thi đua" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">Tất cả quy tắc</option>{[['attendance','Chuyên cần'],['absence','Nghỉ / bỏ tiết'],['learning','Học tập'],['speaking','Phát biểu'],['uniform','Đồng phục'],['discipline','Nề nếp'],['movement','Phong trào']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label><button className="text-btn" onClick={()=>document.getElementById('academic-sheet')?.scrollIntoView({behavior:'smooth'})}>Nhập điểm 0–10 theo môn</button><span>{visibleRules.length} cột · Enter / ↑↓ chuyển dòng · Tab chuyển ô · Dán vùng số lần từ Excel</span></div>
  {mode==='edit'&&!editable&&<div className="sheet-hint"><Info size={16}/>{locked?'Tuần đã chốt, bảng chỉ được xem.':'Tổ đã gửi báo cáo. Giáo viên cần trả lại báo cáo trước khi sửa.'}</div>}
  {error&&<div className="error sheet-message">{error}</div>}
  {message&&<div className="info sheet-message"><CheckCircle2 size={16}/>{message}</div>}
  {d.teacher&&!locked&&<details className="excel-order-disclosure"><summary>Sắp xếp vị trí cột (giáo viên)</summary><div className="excel-order-bar"><span><Table2 size={15}/>Sắp xếp cột theo ý muốn: kéo tiêu đề trên máy tính, hoặc chọn quy tắc và vị trí bất kỳ.</span><label>Quy tắc<select aria-label="Quy tắc cần di chuyển" value={selected?.id||''} onChange={e=>setSelectedRuleId(e.target.value)}>{rules.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label>Chuyển tới<select aria-label="Chuyển quy tắc đến vị trí" disabled={moving||busy} value={selected?rules.findIndex(r=>r.id===selected.id):0} onChange={e=>{if(selected)void moveRule(selected.id,Number(e.target.value))}}>{rules.map((r,i)=><option key={r.id} value={i}>Cột {i+1}</option>)}</select></label></div></details>}
  {groups.map((g,gi)=>{
   const rows:Row[]=sheet.rows.filter((s:Row)=>s.groupId===g.id);
   return <div className="excel-group" key={g.id}>
    <div className={'excel-group-title zone-'+gi%4}><b>{g.name}</b><span>{rows.length} thành viên</span><small>{mode==='edit'?'Ô chưa nhập không phát sinh điểm':'Chỉ hiển thị số lần đã được duyệt'}</small></div>
    <div className="excel-scroll" role="region" aria-label={'Bảng thi đua '+g.name} tabIndex={0}>
     <table className="excel-table">
      <thead><tr className="excel-letters"><th>№</th><th>A</th>{visibleRules.map((r:Rule,i:number)=><th key={r.id}>{i+2}</th>)}<th>Σ</th><th>✓</th></tr>
       <tr><th>STT</th><th className="student-column">Học sinh</th>{visibleRules.map(r=><th key={r.id} draggable={!!d.teacher&&!locked&&!moving} onDragStart={e=>{setDragRule(r.id);e.dataTransfer.setData('text/plain',r.id);e.dataTransfer.effectAllowed='move'}} onDragEnd={()=>setDragRule('')} onDragOver={e=>{if(d.teacher)e.preventDefault()}} onDrop={e=>{e.preventDefault();const source=e.dataTransfer.getData('text/plain')||dragRule;void moveRule(source,rules.findIndex(x=>x.id===r.id))}} className={(r.kind==='speaking-total'?'kpi-col':r.points>=0?'plus-col':'minus-col')+(dragRule===r.id?' rule-being-dragged':'')} title={d.teacher?'Kéo để di chuyển: '+r.name:r.name}><span>{r.name}</span><small>{r.kind==='speaking-total'?'Theo mốc KPI':(r.points>0?'+':'')+r.points+' đ/lần'}</small></th>)}<th className="total-column">Tạm tính<br/><small>cả tuần</small></th><th className="total-column">Đã duyệt<br/><small>cả tuần</small></th></tr>
      </thead><tbody>{rows.map((s,i)=><tr key={s.id}><td>{i+1}</td><td className="student-column"><b>{s.name}</b></td>{visibleRules.map((r,col)=>{
       const v=inputValue(s,r), delta=r.kind==='speaking-total'&&v!==''?ruleScore(r,Number(v)):Number(v||0)*r.points;
       return <td key={r.id} className={(delta>0?'has-plus':delta<0?'has-minus':'')+(draft[key(s.id,r.id)]!==undefined?' changed':'')}>{cell(s,r,rows,i,col)}</td>
      })}<td className="total-column"><b>{renderScore(s)}</b></td><td className="total-column approved-score">{s.score}</td></tr>)}{!rows.length&&<tr><td colSpan={visibleRules.length+4} className="sheet-empty">Tổ chưa có thành viên. Giáo viên xếp chỗ để chia tổ.</td></tr>}</tbody>
      <tfoot><tr><td/><td className="student-column">Tổng</td>{visibleRules.map(r=><td key={r.id}>{rows.reduce((n,s)=>n+(Number(inputValue(s,r))||0),0)||'—'}</td>)}<td className="total-column">{rows.reduce((n,s)=>n+renderScore(s),0)}</td><td className="total-column">{rows.reduce((n,s)=>n+s.score,0)}</td></tr></tfoot>
     </table>
    </div>
   </div>;
  })}
  <div className="sheet-legend"><span><i className="legend-plus"/>Điểm cộng</span><span><i className="legend-minus"/>Điểm trừ</span><span>Chọn môn học để lọc và tra cứu điểm thuộc bài / không thuộc bài</span></div>
 </section>;
}
