import type {Row} from './domain';
export const gradeKinds:Record<string,string>={regular:'Kiểm tra thường xuyên',oral:'Trả bài / kiểm tra miệng',midterm:'Giữa kì',final:'Cuối kì',bonus:'Điểm cộng để nhớ'};
export function notebookAverage(rows:Row[]){const included=rows.filter(r=>r.kind!=='bonus'&&r.inAverage!==0);const weight=included.reduce((n,r)=>n+(r.weight||1),0);return weight?included.reduce((n,r)=>n+Math.min(10,Number(r.value)+Number(r.bonus||0))*(r.weight||1),0)/weight:null}
