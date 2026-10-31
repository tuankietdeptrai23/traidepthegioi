'use client';
import {useEffect,useState} from 'react';
import {Table2,SquarePen,Save,LockKeyhole,CheckCircle2,Info} from 'lucide-react';
import {canReport,ruleScore,speakingKpiLabel,classSubjects,needsLearningSubject,type Row,type Rule} from '@/lib/domain';

export default function CompetitionSheet({d,week,save,reorderRules,busy}:any){
 const roles:string[]=d.roles||[];
 const own=d.students.find((s:Row)=>s.id===d.ownId);
 const editor=d.teacher||roles.length>0;
 const allowed:Row[]=d.groups.filter((g:Row)=>d.teacher||canReport(roles,own?.groupId||'',g.id));
 const [mode,setMode]=useState<'edit'|'view'>(editor?'edit':'view');
 const [groupId,setGroupId]=useState(allowed.find(g=>g.id===own?.groupId)?.id||allowed[0]?.id||'');
 const [selectedRuleId,setSelectedRuleId]=useState('');
 const [draft,setDraft]=useState<Row>({});
 const [subject,setSubject]=useState('');
 const [saving,setSaving]=useState(false);
 const [moving,setMoving]=useState(false);
 const [dragRule,setDragRule]=useState('');
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 useEffect(()=>{setDraft({});setError('');setMessage('')},[week]);
 const sheet=d.sheets?.[week]||{rules:d.config.rules,base:d.config.base,rows:d.students.filter((s:Row)=>s.active).map((s:Row)=>({...s,counts:{},subjectCounts:{},recorded:{},score:d.config.base}))};
 const locked=d.periods.some((p:Row)=>p.week===week&&p.status==='locked');
 const rules:Rule[]=sheet.rules;
 const selected=rules.find(r=>r.id===selectedRuleId)||rules[0];
 const groups:Row[]=mode==='edit'?allowed.filter(g=>g.id===groupId):d.groups;
 const report=d.reports.find((r:Row)=>r.week===week&&r.groupId===groupId);
 const editable=editor&&mode==='edit'&&!locked&&(!report||report.status==='returned');
 const key=(id:string,rid:string,chosen=subject)=>id+'|'+rid+(needsLearningSubject(rules.find(r=>r.id===rid)!)?'|'+chosen:'');
 const inputValue=(s:Row,r:Rule):number|string=>{
   const override=draft[key(s.id,r.id)];
   if(override!==undefined)return override;
   if(r.kind==='speaking-total')return s.recorded?.[r.id] ? (s.counts[r.id]??0) : '';
   if(needsLearningSubject(r))return subject ? (s.subjectCounts?.[r.id+'|'+subject]||'') : '';
   return s.counts[r.id]||'';
 };
 const hasKpi=(s:Row,r:Rule)=>r.kind==='speaking-total'&&inputValue(s,r)!=='';
 const preview=(s:Row)=>{
   const baseline=sheet.base+rules.reduce((n,r)=>r.kind==='speaking-total'?
     n+(s.recorded?.[r.id]?ruleScore(r,s.counts[r.id]||0):0):n+(s.counts[r.id]||0)*r.points,0);
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
 const cell=(s:Row,r:Rule)=>mode==='edit'?
  <input aria-label={s.name+' - '+r.name+(needsLearningSubject(r)?' - '+(subject||'chưa chọn môn'):'')} type="number" inputMode="numeric" min="0" max={r.limit||100}
      disabled={!editable||saving||busy||(needsLearningSubject(r)&&!subject)} value={inputValue(s,r)} placeholder={r.kind==='speaking-total'?'Chưa nhập':'—'}
      onChange={e=>update(s,r,e.target.value)}/>:
  <span>{r.kind==='speaking-total'?(s.recorded?.[r.id]?(s.counts[r.id]??0):'—'):(needsLearningSubject(r)?(subject?s.subjectCounts?.[r.id+'|'+subject]||'—':'Chọn môn'):(s.counts[r.id]||'—'))}</span>;
 async function commit(){
   setSaving(true);setError('');setMessage('');
   try{
     for(let i=0;i<changes.length;i+=80){
       await save({week,groupId,cells:changes.slice(i,i+80).map(({row,rule,...x})=>x)});
     }
     setDraft({});setMessage('Đã lưu bảng. Gửi báo cáo tổ để giáo viên duyệt.');
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
  <div className="section-head"><div><h3><Table2 size={18}/>Bảng thi đua tổ</h3><p>Nhập số lần theo từng quy tắc. Trên điện thoại, chọn một quy tắc để nhập cho cả tổ, không phải kéo bảng ngang.</p></div>
   <div className="sheet-tabs"><button className={mode==='view'?'selected':''} onClick={()=>setMode('view')}><Table2 size={15}/>Xem {d.groups.length} tổ</button>{editor&&<button className={mode==='edit'?'selected':''} onClick={()=>setMode('edit')}><SquarePen size={15}/>Nhập điểm</button>}</div>
  </div>
  <div className="sheet-toolbar">{mode==='edit'?<>
    <select aria-label="Tổ nhập thi đua" value={groupId} onChange={e=>{if(Object.keys(draft).length&&!window.confirm('Chuyển tổ sẽ bỏ các ô chưa lưu. Tiếp tục?'))return;setDraft({});setGroupId(e.target.value);setError('')}}>{allowed.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select>
    <select className="subject-picker" aria-label="Chọn môn học để nhập và xem điểm thuộc bài" value={subject} onChange={e=>setSubject(e.target.value)}><option value="">Chọn môn học…</option>{classSubjects.map(name=><option value={name} key={name}>{name}</option>)}</select>
    <button className="btn primary" disabled={!editable||!changes.length||saving||busy} onClick={commit}><Save size={15}/>{saving?'Đang lưu…': 'Lưu '+changes.length+' ô'}</button>
   </>:<><span><LockKeyhole size={15}/>Chế độ xem · Học sinh thường không được sửa bảng</span><select className="subject-picker" aria-label="Chọn môn để xem điểm thuộc bài" value={subject} onChange={e=>setSubject(e.target.value)}><option value="">Chọn môn học…</option>{classSubjects.map(name=><option key={name} value={name}>{name}</option>)}</select></>}</div>
  {mode==='edit'&&!editable&&<div className="sheet-hint"><Info size={16}/>{locked?'Tuần đã chốt, bảng chỉ được xem.':'Tổ đã gửi báo cáo. Giáo viên cần trả lại báo cáo trước khi sửa.'}</div>}
  {error&&<div className="error sheet-message">{error}</div>}
  {message&&<div className="info sheet-message"><CheckCircle2 size={16}/>{message}</div>}
  {d.teacher&&!locked&&<div className="excel-order-bar"><span><Table2 size={15}/>Sắp xếp cột theo ý muốn: kéo tiêu đề trên máy tính, hoặc chọn quy tắc và vị trí bất kỳ.</span><label>Quy tắc<select aria-label="Quy tắc cần di chuyển" value={selected?.id||''} onChange={e=>setSelectedRuleId(e.target.value)}>{rules.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label>Chuyển tới<select aria-label="Chuyển quy tắc đến vị trí" disabled={moving||busy} value={selected?rules.findIndex(r=>r.id===selected.id):0} onChange={e=>{if(selected)void moveRule(selected.id,Number(e.target.value))}}>{rules.map((r,i)=><option key={r.id} value={i}>Cột {i+1}</option>)}</select></label></div>}
  {selected&&<div className="mobile-sheet-filter"><label htmlFor="mobile-rule-select">Chọn quy tắc đang nhập</label><select id="mobile-rule-select" value={selected.id} onChange={e=>setSelectedRuleId(e.target.value)}>{rules.map((r:Rule)=><option value={r.id} key={r.id}>{r.name}</option>)}</select><small>{needsLearningSubject(selected)&&!subject?'Chọn môn học ở phía trên trước khi nhập điểm thuộc bài / không thuộc bài.':selected.kind==='speaking-total'?'Nhập tổng số lần phát biểu trong cả tuần. Để trống nếu chưa ghi nhận; nhập 0 nếu thực sự không phát biểu.':'Chỉ hiện một cột để dễ thao tác. Đổi quy tắc không làm mất ô chưa lưu.'}</small></div>}
  {groups.map((g,gi)=>{
   const rows:Row[]=sheet.rows.filter((s:Row)=>s.groupId===g.id);
   return <div className="excel-group" key={g.id}>
    <div className={'excel-group-title zone-'+gi%4}><b>{g.name}</b><span>{rows.length} thành viên</span><small>{mode==='edit'?'Ô chưa nhập không phát sinh điểm':'Chỉ hiển thị số lần đã được duyệt'}</small></div>
    <div className="excel-scroll" role="region" aria-label={'Bảng thi đua '+g.name} tabIndex={0}>
     <table className="excel-table">
      <thead><tr className="excel-letters"><th>№</th><th>A</th>{rules.map((r:Rule,i:number)=><th key={r.id}>{i+2}</th>)}<th>Σ</th><th>✓</th></tr>
       <tr><th>STT</th><th className="student-column">Học sinh</th>{rules.map(r=><th key={r.id} draggable={!!d.teacher&&!locked&&!moving} onDragStart={e=>{setDragRule(r.id);e.dataTransfer.setData('text/plain',r.id);e.dataTransfer.effectAllowed='move'}} onDragEnd={()=>setDragRule('')} onDragOver={e=>{if(d.teacher)e.preventDefault()}} onDrop={e=>{e.preventDefault();const source=e.dataTransfer.getData('text/plain')||dragRule;void moveRule(source,rules.findIndex(x=>x.id===r.id))}} className={(r.kind==='speaking-total'?'kpi-col':r.points>=0?'plus-col':'minus-col')+(dragRule===r.id?' rule-being-dragged':'')} title={d.teacher?'Kéo để di chuyển: '+r.name:r.name}><span>{r.name}</span><small>{r.kind==='speaking-total'?'Theo mốc KPI':(r.points>0?'+':'')+r.points+' đ/lần'}</small></th>)}<th className="total-column">Tạm tính</th><th className="total-column">Đã duyệt</th></tr>
      </thead><tbody>{rows.map((s,i)=><tr key={s.id}><td>{i+1}</td><td className="student-column"><b>{s.name}</b></td>{rules.map(r=>{
       const v=inputValue(s,r), delta=r.kind==='speaking-total'&&v!==''?ruleScore(r,Number(v)):Number(v||0)*r.points;
       return <td key={r.id} className={(delta>0?'has-plus':delta<0?'has-minus':'')+(draft[key(s.id,r.id)]!==undefined?' changed':'')}>{cell(s,r)}</td>
      })}<td className="total-column"><b>{renderScore(s)}</b></td><td className="total-column approved-score">{s.score}</td></tr>)}{!rows.length&&<tr><td colSpan={rules.length+4} className="sheet-empty">Tổ chưa có thành viên. Giáo viên xếp chỗ để chia tổ.</td></tr>}</tbody>
      <tfoot><tr><td/><td className="student-column">Tổng</td>{rules.map(r=><td key={r.id}>{rows.reduce((n,s)=>n+(Number(inputValue(s,r))||0),0)||'—'}</td>)}<td className="total-column">{rows.reduce((n,s)=>n+renderScore(s),0)}</td><td className="total-column">{rows.reduce((n,s)=>n+s.score,0)}</td></tr></tfoot>
     </table>
    </div>
    {selected&&<div className="mobile-sheet-cards">{rows.map((s,i)=>{
      const v=inputValue(s,selected),delta=selected.kind==='speaking-total'&&v!==''?ruleScore(selected,Number(v)):Number(v||0)*selected.points;
      return <div className="mobile-sheet-row" key={s.id}>
       <div className="mobile-student"><small>{i+1}</small><b>{s.name}</b><span>Điểm: {renderScore(s)}</span></div>
       <div className="mobile-entry">{cell(s,selected)}</div>
       {selected.kind==='speaking-total'&&<div className={'mobile-kpi-status '+(delta<0?'is-violation':delta>0?'is-reward':'')}>{hasKpi(s,selected)?speakingKpiLabel(selected,Number(v)):'Chưa ghi nhận số lần phát biểu'}</div>}
      </div>;
    })}{!rows.length&&<p className="sheet-empty">Chưa có học sinh trong tổ này.</p>}</div>}
   </div>;
  })}
  <div className="sheet-legend"><span><i className="legend-plus"/>Điểm cộng</span><span><i className="legend-minus"/>Điểm trừ</span><span>Chọn môn học để lọc và tra cứu điểm thuộc bài / không thuộc bài</span></div>
 </section>;
}
