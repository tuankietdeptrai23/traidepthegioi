import {academicPeriod,periodFromKey} from './academic-calendar';
import type {Config,Row} from './domain';

export type LearningPolicy={initial:number;penalties:Record<string,number>};
export const entryDate=(e:Row)=>e.reportDate||e.week||String(e.createdAt||'').slice(0,10);
export const unlearnedEntry=(e:Row)=>e.ruleId==='unlearned'||/không thuộc bài/i.test(e.ruleName||'');
export function learningPolicy(config:Config):LearningPolicy{return config.learningPoints||{initial:100,penalties:{}}}
/** Count occurrences, never multiply a weekly speaking total by its penalty. */
export function learningDeduction(e:Row,config:Config):number{
 const policy=learningPolicy(config),key=unlearnedEntry(e)?'unlearned':e.ruleId;
 const configured=Object.prototype.hasOwnProperty.call(policy.penalties,key)?policy.penalties[key]:undefined;
 if(configured!==undefined){const rule=config.rules.find(r=>r.id===e.ruleId);return configured*(rule?.kind==='speaking-total'?1:Math.max(1,Number(e.count)||1))}
 return Math.max(0,-(Number(e.delta)||0));
}
export function learningSummary(entries:Row[],config:Config,studentId:string,month:string,approvedOnly=false):Row{
 const initial=learningPolicy(config).initial;
 const rows=entries.filter(e=>e.studentId===studentId&&academicPeriod(entryDate(e),config).key===month&&e.status!=='rejected'&&(!approvedOnly||e.status==='approved'));
 const evidence:Row[]=rows.filter(e=>learningDeduction(e,config)>0).map(e=>({...e,deduction:learningDeduction(e,config)}));
 const deducted=evidence.reduce((n,e)=>n+e.deduction,0),approvedDeducted=evidence.filter(e=>e.status==='approved').reduce((n,e)=>n+e.deduction,0);
 const remaining=Math.max(0,initial-deducted),approvedRemaining=Math.max(0,initial-approvedDeducted);
 const failed=rows.filter(unlearnedEntry),unlearned=failed.reduce((n,e)=>n+Math.max(1,Number(e.count)||1),0);
 return {studentId,month,periodInfo:periodFromKey(month,config),initial,deducted,remaining,approvedRemaining,pendingDeduction:deducted-approvedDeducted,threshold:initial*2/3,warning:remaining*3<=initial*2,status:remaining===0?'empty':remaining*3<=initial*2?'warning':'good',unlearned,evidence,unlearnedEvidence:failed};
}
