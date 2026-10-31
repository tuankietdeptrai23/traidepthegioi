'use client';
import {useEffect,useRef,useState} from 'react';
import {Video,Plus,Link,Mic,MicOff,VideoOff,MonitorUp,Hand,PhoneOff,Copy,Lock,Unlock,RefreshCw,MessageCircle,PenLine,Calculator,Clock,Users,BookOpen,Send,Maximize2,Minimize2,ZoomIn,ZoomOut,PanelRightClose,PanelRightOpen,LayoutGrid,Presentation,Focus} from 'lucide-react';
import type {Row} from '@/lib/domain';
import {useStudyCall,studyRequest} from './use-study-call';
import StudyWhiteboard from './study-whiteboard';
import StudyCalculator from './study-calculator';
import AvatarPicker,{StudyAvatar} from './study-avatar';
const duration=(n:number)=>[Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(x=>String(x).padStart(2,'0')).join(':');
function Media({stream,video=false,muted=false,label}:{stream?:MediaStream|null;video?:boolean;muted?:boolean;label:string}){const ref=useRef<HTMLVideoElement&HTMLAudioElement>(null);const [blocked,setBlocked]=useState(false);useEffect(()=>{const el=ref.current;if(el){el.srcObject=stream||null;if(stream)el.play().then(()=>setBlocked(false)).catch(()=>setBlocked(true))}return()=>{if(el)el.srcObject=null}},[stream]);return <>{video?<video ref={ref} autoPlay playsInline muted={muted} aria-label={label}/>:<audio ref={ref} autoPlay muted={muted} aria-label={label}/ >}{blocked&&<button className="btn secondary play-audio" onClick={()=>ref.current?.play().then(()=>setBlocked(false)).catch(()=>{})}>Bật phát {video?'hình':'âm thanh'}</button>}</>}
function StudyTimer(){const [seconds,setSeconds]=useState(25*60);const [running,setRunning]=useState(false);const [rest,setRest]=useState(false);useEffect(()=>{if(!running)return;const t=setInterval(()=>setSeconds(n=>{if(n<=1){setRunning(false);return 0}return n-1}),1000);return()=>clearInterval(t)},[running]);return <div className="study-timer"><Clock size={36}/><h3>Một nhịp học tập trung</h3><p>Đồng hồ riêng của bạn, không ngắt phòng học.</p><strong role="timer">{duration(seconds).slice(3)}</strong><div><button className="btn primary" onClick={()=>setRunning(!running)}>{running?'Tạm dừng':'Bắt đầu'}</button><button className="btn secondary" onClick={()=>{setRunning(false);setSeconds((rest?25:5)*60);setRest(!rest)}}>{rest?'Học 25 phút':'Nghỉ 5 phút'}</button></div>{seconds===0&&<p role="status">Hết nhịp rồi, nghỉ mắt một chút nhé!</p>}</div>}
export function StudyMeeting({session,user,onLeave}:{session:Row;user:Row;onLeave:()=>void}){
 const c=useStudyCall(session.room,session.peerId,user);
 const shell=useRef<HTMLDivElement>(null);
 const chat=useRef<HTMLDivElement>(null);
 const drag=useRef<{x:number;y:number;px:number;py:number}|null>(null);
 const [tool,setTool]=useState<'chat'|'board'|'calc'|'timer'>('chat');
 const [panelOpen,setPanelOpen]=useState(false);
 const [shareAudio,setShareAudio]=useState(true);
 const [message,setMessage]=useState('');
 const [notice,setNotice]=useState('');
 const [elapsed,setElapsed]=useState(0);
 const [presenterId,setPresenterId]=useState('');
 const [pinnedId,setPinnedId]=useState('');
 const [layout,setLayout]=useState<'speaker'|'gallery'>('speaker');
 const [zoom,setZoom]=useState(1);
 const [pan,setPan]=useState({x:0,y:0});
 const [fullscreen,setFullscreen]=useState(false);
 const messages=c.events.filter(e=>e.kind==='chat');
 const sharing=c.members.filter(p=>p.sharing);
 const presenter=sharing.find(p=>p.id===presenterId)||sharing[0];
 const pinned=c.members.find(p=>p.id===pinnedId)||c.members.find(p=>p.camera)||c.members[0];
 const invite=typeof window!=='undefined'?window.location.origin+'/?study='+c.room.id+'&invite='+c.room.inviteCode:'';
 useEffect(()=>{
   const prev=document.body.style.overflow;
   document.body.style.overflow='hidden';
   const t=window.setInterval(()=>setElapsed(v=>v+1),1000);
   const changed=()=>setFullscreen(document.fullscreenElement===shell.current);
   document.addEventListener('fullscreenchange',changed);
   return()=>{window.clearInterval(t);document.body.style.overflow=prev;document.removeEventListener('fullscreenchange',changed);if(document.fullscreenElement===shell.current)document.exitFullscreen().catch(()=>{})};
 },[]);
 useEffect(()=>{if(chat.current)chat.current.scrollTop=chat.current.scrollHeight},[messages.length,tool,panelOpen]);
 useEffect(()=>{setZoom(1);setPan({x:0,y:0})},[presenter?.id,pinned?.id,layout]);
 async function host(action:string,body:Row={}){try{await c.api(action,body);setNotice('Đã cập nhật phòng.')}catch(e){c.setError((e as Error).message)}}
 async function copyInvite(){try{await navigator.clipboard.writeText(invite);setNotice('Đã sao chép liên kết mời.')}catch{setNotice('Không sao chép được. Hãy chọn liên kết trong ô mời.')}}
 async function toggleFullscreen(){try{
   if(document.fullscreenElement===shell.current)await document.exitFullscreen();
   else if(shell.current?.requestFullscreen)await shell.current.requestFullscreen();
   else setNotice('Trình duyệt không hỗ trợ toàn màn hình riêng. Phòng vẫn chiếm toàn bộ cửa sổ.');
 }catch{setNotice('Không bật được toàn màn hình trên thiết bị này. Phòng vẫn phủ toàn bộ cửa sổ.')}}
 async function leave(){await c.leave();onLeave()}
 const focused=!!presenter||layout==='speaker';
 const stagePeer=presenter||pinned;
 const stageStream=presenter?(presenter.id===session.peerId?c.localScreen:c.streams[presenter.id]?.[2]):(pinned?.id===session.peerId?c.localCam:c.streams[pinned?.id]?.[1]);
 const adjust=(value:number)=>{setZoom(Math.min(3,Math.max(1,Math.round(value*4)/4)));setPan({x:0,y:0})};
 const tabs=[['chat','Trò chuyện',MessageCircle],['board','Bảng trắng',PenLine],['calc','Máy tính',Calculator],['timer','Tập trung',Clock]] as const;
 return <div ref={shell} className={'meeting-shell'+(panelOpen?' has-panel':'')} role="region" aria-label={'Phòng học trực tuyến '+c.room.title}>
   <header className="meeting-header">
    <div className="meeting-heading"><div className="meeting-icon"><Video size={20}/></div><div><span className="meeting-kicker">LỚP HỌC TRỰC TUYẾN <i/> ĐANG DIỄN RA</span><h2>{c.room.title}</h2><small>{c.room.topic||'Cùng học tập và trao đổi trực tiếp'}</small></div></div>
    <div className="meeting-header-actions"><span className="meeting-duration"><Clock size={15}/>{duration(elapsed)}</span><span className="meeting-count"><Users size={16}/>{c.members.length}/8</span><button className="meeting-icon-button" title="Sao chép liên kết mời" aria-label="Sao chép liên kết mời" onClick={copyInvite}><Link size={18}/></button><button className="meeting-icon-button" title={fullscreen?'Thoát toàn màn hình':'Toàn màn hình'} aria-label={fullscreen?'Thoát toàn màn hình':'Toàn màn hình'} onClick={toggleFullscreen}>{fullscreen?<Minimize2 size={19}/>:<Maximize2 size={19}/>}</button><button className="meeting-header-leave" onClick={leave}><PhoneOff size={17}/>Rời phòng</button></div>
   </header>
   <div className="meeting-body">
    <main className="meeting-main">
     {(notice||c.error)&&<div className={'meeting-toast'+(c.error?' error':'')} role="status">{c.error||notice}<button aria-label="Đóng thông báo" onClick={()=>{setNotice('');c.setError('')}}>×</button></div>}
     <div className="meeting-viewbar">
      <div className="meeting-layout-switch"><button className={layout==='speaker'?'active':''} onClick={()=>setLayout('speaker')}><Presentation size={16}/>Tập trung</button><button className={layout==='gallery'?'active':''} onClick={()=>setLayout('gallery')} disabled={!!presenter}><LayoutGrid size={16}/>Thư viện</button></div>
      {presenter&&<label className="meeting-presenter"><MonitorUp size={16}/><span>Đang xem:</span><select aria-label="Chọn người đang chia sẻ màn hình" value={presenter.id} onChange={e=>setPresenterId(e.target.value)}>{sharing.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
      {focused&&<div className="meeting-zoom"><button title="Thu nhỏ" aria-label="Thu nhỏ màn hình" disabled={zoom<=1} onClick={()=>adjust(zoom-.25)}><ZoomOut size={17}/></button><input type="range" aria-label="Mức phóng to màn hình" min="1" max="3" step=".25" value={zoom} onChange={e=>adjust(Number(e.target.value))}/><strong>{Math.round(zoom*100)}%</strong><button title="Phóng to" aria-label="Phóng to màn hình" disabled={zoom>=3} onClick={()=>adjust(zoom+.25)}><ZoomIn size={17}/></button><button title="Vừa màn hình" aria-label="Đưa hình về vừa màn hình" onClick={()=>adjust(1)}><Focus size={17}/></button></div>}
     </div>
     {focused?<div className={'meeting-stage'+(zoom>1?' zoomed':'')}
       onPointerDown={e=>{if(zoom<=1||e.button!==0)return;drag.current={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y};e.currentTarget.setPointerCapture(e.pointerId)}}
       onPointerMove={e=>{if(!drag.current)return;const d=drag.current;setPan({x:d.px+e.clientX-d.x,y:d.py+e.clientY-d.y})}}
       onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}}>
       {stagePeer&&(presenter||stagePeer.camera)?<div className="meeting-stage-media" style={{transform:'translate('+pan.x+'px,'+pan.y+'px) scale('+zoom+')'}}><Media video muted={stagePeer.id===session.peerId} stream={stageStream} label={(presenter?'Màn hình ':'Camera ')+stagePeer.name}/></div>:
        <div className="meeting-empty"><span><MonitorUp size={44}/></span><h3>Sẵn sàng học cùng nhau</h3><p>Khi có người chia sẻ màn hình, nội dung sẽ tự chuyển lên khung lớn. Bạn cũng có thể bật camera hoặc chọn người muốn xem.</p></div>}
       {stagePeer&&<div className="meeting-stage-caption">{presenter?<MonitorUp size={15}/>:<Video size={15}/>}<b>{stagePeer.name}</b>{presenter?' đang chia sẻ màn hình':''}</div>}
       {zoom>1&&<div className="meeting-pan-hint">Kéo để di chuyển vùng phóng to</div>}
      </div>:
      <div className="meeting-gallery">{c.members.map(p=><div className="meeting-gallery-person" key={p.id}><div className="meeting-gallery-video">{p.camera?<Media video muted={p.id===session.peerId} stream={p.id===session.peerId?c.localCam:c.streams[p.id]?.[1]} label={'Camera '+p.name}/>:<StudyAvatar name={p.name} avatar={p.avatar}/>}</div><div className="meeting-gallery-label">{p.name}{p.id===session.peerId?' (bạn)':''}</div><button aria-label={'Ghim '+p.name} title="Xem lớn" onClick={()=>{setPinnedId(p.id);setLayout('speaker')}}><Maximize2 size={15}/></button></div>)}</div>}
     <div className="meeting-participants-bar" aria-label="Người tham gia cuộc gọi">{c.members.map(p=><div className={'meeting-participant'+((!presenter&&pinned?.id===p.id)?' selected':'')} key={p.id}>
       <div className="meeting-participant-media">{p.camera?<Media video muted={p.id===session.peerId} stream={p.id===session.peerId?c.localCam:c.streams[p.id]?.[1]} label={'Camera '+p.name}/>:<StudyAvatar name={p.name} avatar={p.avatar}/>}
        {p.id!==session.peerId&&<><Media stream={c.streams[p.id]?.[0]} label={'Âm thanh của '+p.name}/><Media stream={c.streams[p.id]?.[3]} label={'Âm thanh chia sẻ của '+p.name}/></>}
        {!!p.hand&&<span className="meeting-hand">✋</span>}
        <button className="meeting-pin" aria-label={'Xem lớn '+p.name} title={'Ghim '+p.name} onClick={()=>{setPinnedId(p.id);setLayout('speaker')}}><Maximize2 size={14}/></button>
       </div><div className="meeting-participant-caption"><b>{p.name}{p.id===session.peerId?' (bạn)':''}</b>{p.mic?<Mic size={13}/>:<MicOff size={13}/>}</div></div>)}
       {!c.members.length&&<span className="meeting-waiting">Đang kết nối với các thành viên…</span>}
     </div>
    </main>
    <aside className={'meeting-sidebar'+(panelOpen?' open':'')} aria-label="Công cụ học tập">
     <div className="meeting-sidebar-head"><div><b>Công cụ học tập</b><small>Sẵn sàng ngay trong cuộc gọi</small></div><button title="Đóng bảng công cụ" aria-label="Đóng bảng công cụ" onClick={()=>setPanelOpen(false)}><PanelRightClose size={19}/></button></div>
     <div className="meeting-sidebar-tabs">{tabs.map(([id,label,Icon])=><button key={id} className={tool===id?'active':''} onClick={()=>setTool(id)} title={label}><Icon size={19}/><span>{label}</span>{id==='chat'&&messages.length>0&&<small>{messages.length}</small>}</button>)}</div>
     <div className="meeting-sidebar-content">
      <div className={tool==='chat'?'study-chat meeting-chat':'study-hidden'}><div className="study-chat-messages" ref={chat}>{messages.slice(-100).map(m=><article key={m.id} className={m.userKey===user.email?'mine':''}><StudyAvatar name={m.name} avatar={m.avatar}/><div><b>{m.name}<time>{new Date(m.createdAt).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</time></b><p>{m.payload.text}</p></div></article>)}{!messages.length&&<p className="muted">Hỏi bài và trao đổi cùng nhóm ngay tại đây.</p>}</div>
       <form onSubmit={async e=>{e.preventDefault();if(!message.trim())return;try{await c.sendEvent('chat',{text:message});setMessage('')}catch(e){c.setError((e as Error).message)}}}><input aria-label="Tin nhắn phòng học" maxLength={1500} placeholder="Nhắn với nhóm..." value={message} onChange={e=>setMessage(e.target.value)} disabled={c.fatal}/><button className="btn primary" disabled={c.fatal||!message.trim()} aria-label="Gửi tin nhắn"><Send size={16}/></button></form></div>
      <div className={tool==='board'?'meeting-tool-area':'study-hidden'}><StudyWhiteboard events={c.events as any} userKey={user.email} owner={!!c.room.isOwner} send={c.sendEvent} disabled={c.fatal}/></div>
      <div className={tool==='calc'?'meeting-tool-area':'study-hidden'}><StudyCalculator/></div>
      <div className={tool==='timer'?'meeting-tool-area':'study-hidden'}><StudyTimer/></div>
     </div>
    </aside>
   </div>
   <footer className="meeting-footer">
    <div className="meeting-controls">
     <button className={c.mic?'enabled':'muted'} disabled={c.fatal} onClick={c.toggleMic}>{c.mic?<Mic size={23}/>:<MicOff size={23}/>}<span>{c.mic?'Tắt mic':'Bật mic'}</span></button>
     <button className={c.camera?'enabled':'muted'} disabled={c.fatal} onClick={c.toggleCamera}>{c.camera?<Video size={23}/>:<VideoOff size={23}/>}<span>{c.camera?'Tắt camera':'Bật camera'}</span></button>
     <button className={c.sharing?'sharing':''} disabled={c.fatal} onClick={()=>c.toggleShare(shareAudio)}><MonitorUp size={23}/><span>{c.sharing?'Dừng chia sẻ':'Chia sẻ màn hình'}</span></button>
     <button className={c.hand?'enabled':''} disabled={c.fatal} onClick={c.raiseHand}><Hand size={23}/><span>Giơ tay</span></button>
     <button className={panelOpen?'enabled':''} onClick={()=>setPanelOpen(!panelOpen)}>{panelOpen?<PanelRightClose size={23}/>:<PanelRightOpen size={23}/>}<span>{panelOpen?'Ẩn công cụ':'Chat / Bảng trắng'}</span></button>
     <button disabled={c.fatal} onClick={c.reconnect}><RefreshCw size={22}/><span>Kết nối lại</span></button>
    </div>
    <div className="meeting-footer-options"><label><input type="checkbox" checked={shareAudio} disabled={c.sharing} onChange={e=>setShareAudio(e.target.checked)}/>Chia sẻ kèm âm thanh nếu trình duyệt cho phép</label><span>{c.relay?'TURN khả dụng':'Kết nối WebRTC trực tiếp'}</span>{c.room.isOwner&&<button className="meeting-end" onClick={async()=>{if(window.confirm('Kết thúc phòng cho mọi người?')){await host('end');await leave()}}}>Kết thúc phòng</button>}</div>
   </footer>
 </div>;
}
export default function OnlineStudy({user,onAvatarChange}:{user:Row;onAvatarChange:()=>void}){const [rooms,setRooms]=useState<Row[]>([]);const [session,setSession]=useState<Row|null>(null);const [title,setTitle]=useState('');const [topic,setTopic]=useState('');const [link,setLink]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [avatar,setAvatar]=useState(false);async function load(){try{const r=await fetch('/api/study',{cache:'no-store'});const j:any=await r.json();if(!r.ok)throw Error(j.error);setRooms(j.rooms)}catch(e){setError((e as Error).message)}}useEffect(()=>{load();const q=new URLSearchParams(window.location.search);if(q.get('study'))setLink(window.location.href)},[]);async function join(roomId:string,inviteCode=''){setBusy(true);setError('');try{const s=await studyRequest({action:'join',roomId,inviteCode});setSession(s)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}return session?<StudyMeeting session={session} user={user} onLeave={()=>{setSession(null);load()}}/>:<div className="online-study"><div className="study-hero"><div><span className="eyebrow">CÙNG HỌC, CÙNG HIỂU</span><h2>Mở một phòng.<br/>Kết nối cả nhóm<span> ✦</span></h2><p>Gọi nhóm, chia sẻ bài và giải nháp cùng nhau.<br/>Học theo nhịp của bạn, không tự ngắt theo giờ.</p><div className="study-feature-chips"><span><Video size={15}/>Gọi nhóm</span><span><PenLine size={15}/>Bảng chung</span><span><Calculator size={15}/>Máy tính</span></div></div><div className="study-hero-art" aria-hidden="true"><div>📚</div><span>✦</span><i>HỌC CÙNG NHAU</i></div></div><div className="study-lobby-grid"><form className="card study-create" onSubmit={async e=>{e.preventDefault();setBusy(true);try{const r=await studyRequest({action:'create',title,topic});await join(r.room.id);setTitle('');setTopic('')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}><div className="study-section-icon"><Plus size={21}/></div><h3>Tạo góc học mới</h3><p>Mời tối đa 8 người có tài khoản trên web.</p><label>Tên phòng<input required maxLength={100} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ví dụ: Ôn Toán cùng tổ 1"/></label><label>Hôm nay học gì?<input maxLength={500} value={topic} onChange={e=>setTopic(e.target.value)} placeholder="Hàm số, bài tập chương 2…"/></label><button className="btn primary" disabled={busy}><Video size={17}/>{busy?'Đang mở…':'Tạo và vào phòng'}</button></form><div className="card study-join"><div className="study-section-icon blue"><Link size={21}/></div><h3>Đã có lời mời?</h3><p>Dán link bạn nhận được để vào học cùng nhóm.</p><form onSubmit={e=>{e.preventDefault();try{const url=new URL(link,window.location.origin);const id=url.searchParams.get('study');if(!id)throw Error('Link cần có mã phòng học.');join(id,url.searchParams.get('invite')||'')}catch(e){setError((e as Error).message)}}}><label>Liên kết phòng<input required value={link} onChange={e=>setLink(e.target.value)} placeholder="https://…/?study=…&invite=…"/></label><button className="btn secondary" disabled={busy}>Vào phòng bằng link</button></form><div className="study-my-avatar"><StudyAvatar name={user.name} avatar={user.avatar}/><div><b>{user.name}</b><button className="text-btn" onClick={()=>setAvatar(true)}>Đổi ảnh đại diện</button></div></div></div></div>{error&&<div className="study-error" role="alert">{error}</div>}<div className="section-head"><div><h3>Phòng học của bạn</h3><p>Các phòng bạn đã tạo hoặc tham gia.</p></div><button className="icon-btn" aria-label="Tải lại danh sách phòng" onClick={load}><RefreshCw size={17}/></button></div><div className="study-room-list">{rooms.map(r=><article className="card study-room-card" key={r.id}><div className="study-section-icon"><Users size={21}/></div><span className={'badge '+(r.closed?'locked':'approved')}>{r.closed?'Đã kết thúc':r.locked?'Đã khóa lời mời':'Đang mở'}</span><h3>{r.title}</h3><p>{r.topic||'Một góc học cùng bạn bè.'}</p><small>{r.isOwner?'Bạn là chủ phòng':'Phòng bạn đã tham gia'}</small><button className="btn secondary" disabled={busy||!!r.closed} onClick={()=>join(r.id)}>{r.closed?'Buổi học đã kết thúc':'Vào học'}<Video size={16}/></button></article>)}{!rooms.length&&<div className="study-list-empty"><BookOpen size={30}/><h3>Góc học đang chờ bạn</h3><p>Tạo phòng đầu tiên hoặc tham gia từ lời mời của bạn bè.</p></div>}</div><p className="study-network">Chỉ tài khoản do admin / giáo viên cấp mới tham gia được. Link mời không cấp quyền xem hồ sơ lớp. Gọi nhóm trực tiếp phù hợp tối đa 8 người; chất lượng phụ thuộc thiết bị và mạng.</p>{avatar&&<AvatarPicker user={user} close={()=>setAvatar(false)} done={onAvatarChange}/>}</div>}
