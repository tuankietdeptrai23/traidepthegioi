/** Zero-dependency OpenXML spreadsheet writer. All user strings are inline XML text, never formulas. */
export type ReportSheet = {name:string; rows:(string|number|null|undefined)[][]; widths?:number[]; headerRow?:number; titleRows?:number[]};
const encoder=new TextEncoder();
const xml=(s:unknown)=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
const q=(s:string)=>'&quot;'+xml(s)+'&quot;';
const name=(i:number)=>{let n=i+1,out='';while(n){n--;out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26)}return out};
const doc=(body:string)=>'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+body;
function sheetXml(sheet:ReportSheet){
 const max=Math.max(1,...sheet.rows.map(r=>r.length));
 const cols=(sheet.widths||Array(max).fill(18)).map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+Math.max(8,Math.min(55,Math.floor(w)))+'" customWidth="1"/>').join('');
 const titles=new Set(sheet.titleRows||[0,1]);
 const rows=sheet.rows.map((values,i)=>'<row r="'+(i+1)+'" ht="'+(titles.has(i)?(i===0?34:23):22)+'" customHeight="1">'+values.map((v,j)=>{
   if(v===null||v===undefined||v==='')return '';
   const ref=name(j)+(i+1),style=titles.has(i)?(i===0?1:3):i===(sheet.headerRow??3)?2:0;
   if(typeof v==='number'&&Number.isFinite(v))return '<c r="'+ref+'" s="'+style+'"><v>'+v+'</v></c>';
   return '<c r="'+ref+'" t="inlineStr" s="'+style+'"><is><t xml:space="preserve">'+xml(v)+'</t></is></c>';
 }).join('')+'</row>').join('');
 const merge=sheet.rows.length?'<mergeCells count="1"><mergeCell ref="A1:'+name(max-1)+'1"/></mergeCells>':'';
 return doc('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:'+name(max-1)+Math.max(1,sheet.rows.length)+'"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="'+Math.min(sheet.headerRow??3,sheet.rows.length)+'" topLeftCell="A'+((sheet.headerRow??3)+1)+'" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>'+cols+'</cols><sheetData>'+rows+'</sheetData>'+merge+'<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>');
}
function crc32(data:Uint8Array){let crc=0xffffffff;for(const b of data){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return (crc^0xffffffff)>>>0}
function put16(a:number[],v:number){a.push(v&255,(v>>>8)&255)}
function put32(a:number[],v:number){put16(a,v&65535);put16(a,(v>>>16)&65535)}
/** ZIP STORE packets are valid .xlsx and do not require CompressionStream support. */
function zip(files:{path:string;content:string}[]):Uint8Array{
 const parts:number[]=[],directory:number[]=[];
 for(const file of files){
   const offset=parts.length,filename=encoder.encode(file.path),content=encoder.encode(file.content),crc=crc32(content);
   put32(parts,0x04034b50);put16(parts,20);put16(parts,0);put16(parts,0);put16(parts,0);put16(parts,0);put32(parts,crc);put32(parts,content.length);put32(parts,content.length);put16(parts,filename.length);put16(parts,0);for(const byte of filename)parts.push(byte);for(const byte of content)parts.push(byte);
   put32(directory,0x02014b50);put16(directory,20);put16(directory,20);put16(directory,0);put16(directory,0);put16(directory,0);put16(directory,0);put32(directory,crc);put32(directory,content.length);put32(directory,content.length);put16(directory,filename.length);put16(directory,0);put16(directory,0);put16(directory,0);put16(directory,0);put32(directory,0);put32(directory,offset);for(const byte of filename)directory.push(byte);
 }
 const offset=parts.length;parts.push(...directory);put32(parts,0x06054b50);put16(parts,0);put16(parts,0);put16(parts,files.length);put16(parts,files.length);put32(parts,directory.length);put32(parts,offset);put16(parts,0);
 return new Uint8Array(parts);
}
export function buildReportWorkbook(input:ReportSheet[]):Uint8Array{
 if(!input.length||input.length>20)throw Error('Số trang báo cáo không hợp lệ');
 const sheets=input.map((s,i)=>({...s,name:(s.name||'Trang '+(i+1)).replace(/[\[\]:*?\/\\]/g,' ').slice(0,31)}));
 const types=sheets.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('');
 const content=doc('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+types+'</Types>');
 const wb=doc('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map((s,i)=>'<sheet name="'+xml(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>');
 const relations=doc('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="rId'+(sheets.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
 const styles=doc('<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font><font><b/><color rgb="FF143C36"/><sz val="11"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF176B60"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDFF1EA"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
 return zip([
  {path:'[Content_Types].xml',content},{path:'_rels/.rels',content:doc('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')},
  {path:'xl/workbook.xml',content:wb},{path:'xl/_rels/workbook.xml.rels',content:relations},{path:'xl/styles.xml',content:styles},
  ...sheets.map((s,i)=>({path:'xl/worksheets/sheet'+(i+1)+'.xml',content:sheetXml(s)}))
 ]);
}
export function downloadReportWorkbook(filename:string,sheets:ReportSheet[]){
 const bytes=buildReportWorkbook(sheets);
 const blob=new Blob([new Uint8Array(bytes)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename.replace(/[\\/:*?"<>|]/g,'-')+'.xlsx';a.click();URL.revokeObjectURL(url);
}
