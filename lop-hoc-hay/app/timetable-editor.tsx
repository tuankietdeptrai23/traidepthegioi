'use client';
import {useState} from 'react';
import {CalendarDays,Save,BookOpen,CalendarCheck,ShieldCheck,Users} from 'lucide-react';
import {defaultTimetable,dutyTasks,classSubjects,type Row,type Config} from '@/lib/domain';
const labels=['','Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy'];
export default function TimetableEditor({config,canEdit,busy,save}:{config:Config;canEdit:boolean;busy:boolean;save:(next:Config)=>Promise<any>}){
 const initial=(config.timetable||defaultTimetable);
 const [rows,setRows]=useState<{weekday:number;subjects:string[]}[]>(initial.map(x=>({weekday:x.weekday,subjects:[...x.subjects]})));
 const [editing,setEditing]=useState(false);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const row=(weekday:number)=>rows.find(x=>x.weekday===weekday);
 const move=(weekday:number,subjects:string[])=>setRows(prev=>prev.some(x=>x.weekday===weekday)?prev.map(x=>x.weekday===weekday?{weekday,subjects}:x):[...prev,{weekday,subjects}].sort((a,b)=>a.weekday-b.weekday));
 async function commit(){setSaving(true);setError('');try{await save({...config,timetable:rows.filter(x=>x.subjects.length||initial.some(i=>i.weekday===x.weekday)).sort((a,b)=>a.weekday-b.weekday)});setEditing(false)}catch(e){setError((e as Error).message)}finally{setSaving(false)}}
 return <section className="card section timetable-section"><div className="section-head"><div><h3><BookOpen size={19}/>Thời khóa biểu & lịch học</h3><p>Chỉ xếp lịch trực vào những ngày có học. Chỉnh môn học ở từng tiết để bảng lịch rõ ràng hơn.</p></div>{canEdit&&<button className="btn secondary" disabled={busy||saving} onClick={()=>editing?void commit():setEditing(true)}><Save size={15}/>{editing?'Lưu TKB':'Chỉnh TKB'}</button>}</div>{error&&<div className="error">{error}</div>}<div className="timetable-grid">{Array.from({length:6},(_,i)=>i+1).map(weekday=>{const d=row(weekday);return <article className={'timetable-day'+(d?' active':'')} key={weekday}><div className="timetable-day-head"><b>{labels[weekday]}</b>{editing&&<label><input type="checkbox" checked={!!d} onChange={e=>setRows(prev=>e.target.checked?[...prev,{weekday,subjects:[]}].sort((a,b)=>a.weekday-b.weekday):prev.filter(x=>x.weekday!==weekday))}/>Có học</label>}</div>{d?<div className="timetable-subjects">{editing?Array.from({length:Math.max(1,d.subjects.length+1)},(_,i)=><select key={i} value={d.subjects[i]||''} aria-label={labels[weekday]+' tiết '+(i+1)} onChange={e=>{const list=[...d.subjects];list[i]=e.target.value;move(weekday,list.filter(Boolean))}}><option value="">+ Thêm tiết học</option>{classSubjects.map(name=><option key={name} value={name}>{name}</option>)}</select>):d.subjects.length?d.subjects.map((name,i)=><span key={i}><small>Tiết {i+1}</small>{name}</span>):<p className="muted">Ngày có học · Chưa nhập môn</p>}</div>:<p className="muted">Không học</p>}</article>})}</div><div className="timetable-guide"><span><CalendarCheck size={15}/>Lịch trực xếp cho tuần kế tiếp theo ngày học</span><span><Users size={15}/>Trực lớp 4 bạn · Đổ rác 1 · Lau bảng 1</span><span><ShieldCheck size={15}/>Ban cán sự được miễn, mỗi người tối đa 1 việc/ngày</span></div></section>;
}
