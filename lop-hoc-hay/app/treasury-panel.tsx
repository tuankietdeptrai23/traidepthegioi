'use client';
import {useMemo,useState} from 'react';
import {Wallet,Plus,ReceiptText,Check,Download,Search,CalendarDays,Filter,ArrowDownRight,ArrowUpRight,History,Users,AlertCircle,X,LockKeyhole} from 'lucide-react';
import type {Row} from '@/lib/domain';
const money=(n:number)=>Math.round(n||0).toLocaleString('vi-VN')+' ₫';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
const fmtDate=(value:string)=>value?value.split('-').reverse().join('/'):'—';
type FormState={title:string;description:string;amount:string;dueDate:string};
const initial=():FormState=>({title:'',description:'',amount:'',dueDate:today()});
export default function TreasuryPanel({d,canManage,busy,act}:{
 d:Row;canManage:boolean;busy:boolean;act:(action:string,values?:Row)=>Promise<any>;
}){
 const [tab,setTab]=useState<'campaigns'|'ledger'>('campaigns');
 const [campaign,setCampaign]=useState('');
 const [showCreate,setShowCreate]=useState(false);
 const [showTransaction,setShowTransaction]=useState(false);
 const [form,setForm]=useState<FormState>(initial);
 const [transaction,setTransaction]=useState({type:'expense',amount:'',description:'',date:today(),studentId:'',proof:''});
 const [payDate,setPayDate]=useState(today());
 const [filter,setFilter]=useState('');
 const [kind,setKind]=useState('all');
 const [marked,setMarked]=useState<Record<string,boolean>>({});
 const [amounts,setAmounts]=useState<Record<string,string>>({});
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const [working,setWorking]=useState(false);
 const students:Row[]=(d.students||[]).filter((s:Row)=>s.active);
 const ownId=d.ownId;
 const funds:Row[]=d.funds||[];
 const campaigns:Row[]=d.fundCollections||[];
 const selected=campaigns.find(c=>c.id===campaign)||campaigns.find(c=>c.status==='open')||campaigns[0];
 const incomes=d.fundSummary?.income||0,expenses=d.fundSummary?.expense||0;
 const balance=incomes-expenses;
 const paid=(c:Row,id:string)=>(c.payments||[]).filter((f:Row)=>f.studentId===id).reduce((n:number,f:Row)=>n+(f.type==='income'?f.amount:-f.amount),0);
 const roster=useMemo(()=>students.filter(s=>(canManage||s.id===ownId)&&(!filter||s.name.toLocaleLowerCase('vi').includes(filter.toLocaleLowerCase('vi')))).sort((a,b)=>a.name.localeCompare(b.name,'vi')),[d.students,filter,canManage,ownId]);
 const eligible=roster.filter(s=>selected&&Math.max(0,selected.amount-paid(selected,s.id))>0);
 const countMarked=eligible.filter(s=>marked[s.id]);
 const totalMarked=countMarked.reduce((n,s)=>n+Math.min(Math.max(0,Number(amounts[s.id]||selected?.amount-paid(selected,s.id))),selected?.amount-paid(selected,s.id)||0),0);
 async function perform(action:string,payload:Row){setWorking(true);setError('');setNotice('');try{await act(action,payload);setNotice('Đã lưu thành công và cập nhật sổ quỹ.');return true}catch(e){setError((e as Error).message);return false}finally{setWorking(false)}}
 async function saveMarked(){
   if(!selected||!countMarked.length)return;
   const payments=countMarked.map(s=>({studentId:s.id,amount:Math.round(Number(amounts[s.id]||Math.max(0,selected.amount-paid(selected,s.id))))}));
   if(payments.some(x=>!Number.isSafeInteger(x.amount)||x.amount<=0||x.amount>selected.amount-paid(selected,x.studentId))){setError('Khoản đóng không được nhỏ hơn 1 hoặc vượt số còn thiếu.');return}
   if(await perform('recordFundCollections',{collectionId:selected.id,date:payDate,payments})){setMarked({});setAmounts({})}
 }
 async function saveCampaign(e:React.FormEvent){e.preventDefault();if(await perform('createFundCollection',{...form,amount:Number(form.amount)})){setShowCreate(false);setForm(initial())}}
 async function saveExpense(e:React.FormEvent){e.preventDefault();if(await perform('addFund',{...transaction,amount:Number(transaction.amount),studentId:transaction.studentId||null})){setShowTransaction(false);setTransaction({type:'expense',amount:'',description:'',date:today(),studentId:'',proof:''})}}
 function csv(){
   const rows=[['Ngày','Loại','Đợt thu','Học sinh','Nội dung','Số tiền (VND)','Trạng thái','Người ghi']];
   for(const f of funds.filter(f=>kind==='all'||f.type===kind).filter(f=>(!filter||f.description.toLocaleLowerCase('vi').includes(filter.toLocaleLowerCase('vi')))))rows.push([f.date,f.type==='income'?'Thu':'Chi',campaigns.find(c=>c.id===f.collectionId)?.title||'',students.find(s=>s.id===f.studentId)?.name||'Quỹ chung',f.description,String(f.amount),f.status==='approved'?'Đã ghi sổ':f.status==='pending'?'Chờ duyệt':'Từ chối',f.createdBy]);
   const escape=(s:any)=>'"'+String(s??'').replace(/^[=+\-@\t\r]/,"' $&").replaceAll('"','""')+'"';
   const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(escape).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='so-quy-'+d.name+'.csv';a.click();URL.revokeObjectURL(url);
 }
 const disabled=busy||working;
 return <div className="treasury-page">
   <div className="treasury-hero"><div><span>SỔ QUỸ LỚP · MINH BẠCH</span><h2>Thu chi rõ ràng, theo dõi từng khoản.</h2><p>Thủ quỹ quản lý các đợt thu, tick người đã đóng và ghi lại giao dịch có lịch sử điều chỉnh.</p></div><Wallet size={46}/></div>
   <div className="treasury-stats">
     <article><span>Tổng thu</span><b>{money(incomes)}</b><small>Đã ghi sổ</small><ArrowDownRight/></article>
     <article><span>Tổng chi</span><b>{money(expenses)}</b><small>Đã ghi sổ</small><ArrowUpRight/></article>
     <article className={balance<0?'negative':''}><span>Số dư thực tế</span><b>{money(balance)}</b><small>Không tính giao dịch chờ duyệt</small><Wallet/></article>
     <article><span>Đợt thu đang mở</span><b>{campaigns.filter(c=>c.status==='open').length}</b><small>Đợt thu đã tạo: {campaigns.length}</small><ReceiptText/></article>
   </div>
   <div className="treasury-nav">
     <div className="treasury-tabs"><button className={tab==='campaigns'?'active':''} onClick={()=>setTab('campaigns')}><Users size={17}/>Đợt thu / danh sách</button><button className={tab==='ledger'?'active':''} onClick={()=>setTab('ledger')}><History size={17}/>Sổ thu chi</button></div>
     {canManage&&<div className="treasury-actions"><button className="btn secondary" onClick={()=>setShowTransaction(true)}><Plus size={15}/>Ghi thu / chi</button><button className="btn primary" onClick={()=>setShowCreate(true)}><Plus size={16}/>Tạo yêu cầu thu</button></div>}
   </div>
   {error&&<div className="study-error" role="alert"><AlertCircle size={17}/> {error}</div>}{notice&&<div className="info" role="status"><Check size={16}/>{notice}</div>}
   {showCreate&&canManage&&<form className="treasury-form card" onSubmit={saveCampaign}><div className="treasury-form-head"><h3>Yêu cầu thu quỹ mới</h3><button type="button" aria-label="Đóng" onClick={()=>setShowCreate(false)}><X size={19}/></button></div><div className="treasury-fields"><label>Tên đợt thu<input value={form.title} required maxLength={160} placeholder="Ví dụ: Quỹ lớp tháng 11" onChange={e=>setForm({...form,title:e.target.value})}/></label><label>Số tiền mỗi học sinh (₫)<input type="number" min="1" max="100000000" required value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label><label>Hạn thu<input type="date" value={form.dueDate} required onChange={e=>setForm({...form,dueDate:e.target.value})}/></label><label>Ghi chú / mục đích<input value={form.description} maxLength={1200} placeholder="Mua đồ dùng, liên hoan..." onChange={e=>setForm({...form,description:e.target.value})}/></label></div><div className="treasury-form-actions"><button disabled={disabled} className="btn primary">Gửi yêu cầu thu</button><small>Yêu cầu sẽ hiện cho cả lớp. Khoản tiền chỉ ghi vào số dư khi thủ quỹ xác nhận đã nhận.</small></div></form>}
   {showTransaction&&canManage&&<form className="treasury-form card" onSubmit={saveExpense}><div className="treasury-form-head"><h3>Ghi một giao dịch thu / chi</h3><button type="button" aria-label="Đóng" onClick={()=>setShowTransaction(false)}><X size={19}/></button></div><div className="treasury-fields"><label>Loại<select value={transaction.type} onChange={e=>setTransaction({...transaction,type:e.target.value})}><option value="expense">Chi quỹ</option><option value="income">Thu khác</option></select></label><label>Số tiền (₫)<input type="number" required min="1" value={transaction.amount} onChange={e=>setTransaction({...transaction,amount:e.target.value})}/></label><label>Ngày<input type="date" required value={transaction.date} onChange={e=>setTransaction({...transaction,date:e.target.value})}/></label><label>Học sinh liên quan (nếu có)<select value={transaction.studentId} onChange={e=>setTransaction({...transaction,studentId:e.target.value})}><option value="">Quỹ chung</option>{students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="treasury-field-wide">Nội dung<input required value={transaction.description} maxLength={500} onChange={e=>setTransaction({...transaction,description:e.target.value})}/></label><label className="treasury-field-wide">Link chứng từ HTTPS (nếu có)<input type="url" value={transaction.proof} onChange={e=>setTransaction({...transaction,proof:e.target.value})}/></label></div><button className="btn primary" disabled={disabled}>Ghi sổ</button></form>}
   {tab==='campaigns'? <div className="treasury-campaign-layout">
      <aside className="treasury-campaign-list"><h3>Các đợt thu</h3>{campaigns.slice().reverse().map(c=><button key={c.id} className={selected?.id===c.id?'chosen':''} onClick={()=>{setCampaign(c.id);setMarked({});setAmounts({});setFilter('')}}><strong>{c.title}</strong><small>{money(c.amount)} / học sinh · Hạn {fmtDate(c.dueDate)}</small><span>{c.status==='open'?'Đang thu':'Đã khóa'} · Đã ghi nhận {money(c.paid)}</span></button>)}{!campaigns.length&&<p className="muted">Chưa có đợt thu. Tạo yêu cầu đầu tiên để bắt đầu tick người đã đóng.</p>}</aside>
      <section className="treasury-campaign-detail card">{selected?<><div className="treasury-section-heading"><div><span className={'badge '+(selected.status==='open'?'approved':'locked')}>{selected.status==='open'?'Đang thu':'Đã khóa'}</span><h3>{selected.title}</h3><p>{selected.description||'Khoản đóng góp cho hoạt động của lớp.'}</p></div>{canManage&&<button className="btn secondary" disabled={disabled} onClick={()=>perform('closeFundCollection',{id:selected.id,status:selected.status==='open'?'closed':'open'})}>{selected.status==='open'?'Khóa đợt thu':'Mở lại'}</button>}</div>
      <div className="treasury-campaign-metrics"><div><small>Định mức / học sinh</small><b>{money(selected.amount)}</b></div><div><small>Hạn thu</small><b>{fmtDate(selected.dueDate)}</b></div><div><small>Tổng đã thu</small><b>{money(selected.paid||0)}</b></div><div><small>Tiến độ</small><b>{students.length?Math.round((selected.paid||0)/(selected.amount*students.length)*100):0}%</b></div></div>
      {canManage&&<div className="treasury-list-toolbar"><label><Search size={16}/><input aria-label="Tìm học sinh" value={filter} placeholder="Tìm tên học sinh..." onChange={e=>setFilter(e.target.value)}/></label><label className="treasury-select-all"><input type="checkbox" disabled={selected.status!=='open'} checked={eligible.length>0&&eligible.every(s=>marked[s.id])} onChange={e=>setMarked(Object.fromEntries(eligible.map(s=>[s.id,e.target.checked])))}/> Chọn tất cả chưa đóng đủ</label></div>}
      <div className="treasury-roster-wrap"><table className="treasury-roster"><thead><tr>{canManage&&<th>✓</th>}<th>Học sinh</th><th>Cần thu</th><th>Đã đóng</th><th>Còn thiếu</th>{canManage&&<th>Ghi nhận lần này</th>}<th>Tình trạng</th></tr></thead><tbody>{roster.map(s=>{const done=paid(selected,s.id),remaining=Math.max(0,selected.amount-done);return <tr key={s.id} className={remaining===0?'treasury-complete':''}>{canManage&&<td><input aria-label={'Chọn '+s.name} type="checkbox" disabled={disabled||selected.status!=='open'||remaining===0} checked={!!marked[s.id]} onChange={e=>setMarked({...marked,[s.id]:e.target.checked})}/></td>}<td><b>{s.name}</b><small>{d.groups.find((g:Row)=>g.id===s.groupId)?.name||''}</small></td><td>{money(selected.amount)}</td><td className="positive">{money(done)}</td><td>{money(remaining)}</td>{canManage&&<td><input aria-label={'Số tiền thu '+s.name} type="number" min="1" max={remaining} disabled={!marked[s.id]||disabled} value={amounts[s.id]??(remaining||'')} onChange={e=>setAmounts({...amounts,[s.id]:e.target.value})}/></td>}<td>{remaining===0?<span className="treasury-paid"><Check size={13}/>Đã đủ</span>:done>0?<span className="treasury-partial">Đóng một phần</span>:<span className="treasury-due">Chưa đóng</span>}</td></tr>})}{!roster.length&&<tr><td colSpan={7}>Chưa có dữ liệu học sinh.</td></tr>}</tbody></table></div>
      {canManage&&<div className="treasury-bulk"><label>Ngày nhận tiền<input type="date" value={payDate} onChange={e=>setPayDate(e.target.value)}/></label><div><small>{countMarked.length} học sinh · {money(totalMarked)}</small><button className="btn primary" disabled={disabled||!countMarked.length||selected.status!=='open'} onClick={saveMarked}><Check size={16}/>Xác nhận đã thu</button></div></div>}</>:<div className="treasury-empty"><ReceiptText size={35}/><h3>Chưa có đợt thu</h3><p>Tạo yêu cầu thu và chọn từng học sinh đã nộp.</p></div>}</section>
     </div>:<section className="treasury-ledger card"><div className="treasury-ledger-head"><div><h3>Sổ giao dịch</h3><p>Lưu từng khoản thu, chi và bút toán điều chỉnh. Không xóa lịch sử đã ghi sổ.</p></div><button className="btn secondary" onClick={csv}><Download size={16}/>Xuất CSV</button></div><div className="treasury-ledger-filter"><label><Filter size={16}/><select value={kind} onChange={e=>setKind(e.target.value)}><option value="all">Tất cả giao dịch</option><option value="income">Chỉ khoản thu</option><option value="expense">Chỉ khoản chi</option></select></label><label><Search size={16}/><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Tìm nội dung..."/></label></div><div className="treasury-roster-wrap"><table className="treasury-roster"><thead><tr><th>Ngày</th><th>Nội dung</th><th>Học sinh</th><th>Thu / Chi</th><th>Trạng thái</th>{canManage&&<th>Điều chỉnh</th>}</tr></thead><tbody>{funds.filter(f=>(kind==='all'||f.type===kind)&&(!filter||f.description.toLocaleLowerCase('vi').includes(filter.toLocaleLowerCase('vi')))).slice().reverse().map(f=><tr key={f.id}><td>{fmtDate(f.date)}</td><td><b>{f.description}</b>{f.proof&&<small><a href={f.proof} rel="noreferrer" target="_blank">Xem chứng từ</a></small>}</td><td>{students.find(s=>s.id===f.studentId)?.name||'Quỹ chung'}</td><td className={f.type==='income'?'positive':'negative'}>{f.type==='income'?'+':'−'}{money(f.amount)}</td><td>{f.status==='approved'?'Đã ghi sổ':f.status==='pending'?'Chờ duyệt':'Từ chối'}</td>{canManage&&<td>{f.status==='pending'?<button className="text-btn" onClick={()=>perform('reviewFund',{id:f.id,status:'approved'})}>Duyệt</button>:f.status==='approved'&&!f.id.startsWith('reverse-')&&!funds.some(x=>x.id==='reverse-'+f.id)?<button className="text-btn" disabled={disabled} onClick={()=>{const reason=window.prompt('Lý do điều chỉnh / hoàn tiền:');if(reason)void perform('reverseFund',{id:f.id,reason})}}>Điều chỉnh</button>:null}</td>}</tr>)}{!funds.length&&<tr><td colSpan={6}>Chưa có giao dịch nào.</td></tr>}</tbody></table></div></section>}
   <p className="treasury-footnote"><LockKeyhole size={15}/>Chỉ giáo viên và thủ quỹ được ghi nhận tiền. Việc thu tiền ngoài đời thực vẫn cần chứng từ và đối soát với tiền đang giữ.</p>
 </div>;
}
