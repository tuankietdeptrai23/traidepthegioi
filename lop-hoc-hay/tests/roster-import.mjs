import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import ts from 'typescript';
const dir=new URL('../work/tests/',import.meta.url);
mkdirSync(dir,{recursive:true});
const source=readFileSync(new URL('../lib/roster-file.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
writeFileSync(new URL('roster-file.mjs',dir),compiled);
const {rosterFromText,rosterFromGrid,parseDelimited}=await import(new URL('roster-file.mjs',dir));
let passed=0;
function check(title,fn){fn();passed++;console.log('✓ '+title)}
check('Tab-separated Excel clipboard with genders',()=>{
  assert.deepEqual(rosterFromText('STT\tHọ và tên\tGiới tính\n1\tNguyễn Văn An\tNam\n2\tTrần Ngọc Mai\tNữ'),[
    {name:'Nguyễn Văn An',gender:'male'},{name:'Trần Ngọc Mai',gender:'female'}
  ]);
});
check('CSV with BOM and quoted names',()=>{
  assert.deepEqual(rosterFromText('\uFEFFSTT,Họ và tên,Giới tính\r\n1,"Lê Minh Anh",Nữ\r\n2,"Phạm Gia Bảo",Nam'),[
    {name:'Lê Minh Anh',gender:'female'},{name:'Phạm Gia Bảo',gender:'male'}
  ]);
});
check('CSV parser handles embedded quoted newline',()=>{
  assert.deepEqual(parseDelimited('A,B\n"x\ny",z'),[['A','B'],['x\ny','z']]);
});
check('Separate family name and given name columns',()=>{
  assert.deepEqual(rosterFromGrid([['STT','Họ','Tên','Giới tính'],['1','Nguyễn Văn','An','Nam'],['2','Trần Ngọc','Mai','Nữ']]),[
    {name:'Nguyễn Văn An',gender:'male'},{name:'Trần Ngọc Mai',gender:'female'}
  ]);
});
check('Multi-row headings and separate checkboxes',()=>{
  assert.deepEqual(rosterFromGrid([
    ['DANH SÁCH HỌC SINH KHỐI 12'],['Năm học 2026–2027'],['STT','Họ và tên','Nam','Nữ'],
    ['1','Hoàng Minh Đức','x',''],['2','Đỗ Khánh Linh','','✓']
  ]),[{name:'Hoàng Minh Đức',gender:'male'},{name:'Đỗ Khánh Linh',gender:'female'}]);
});
check('Plain full names without headers',()=>{
  assert.deepEqual(rosterFromText('Nguyễn Văn An\nTrần Ngọc Mai'),[
    {name:'Nguyễn Văn An',gender:'other'},{name:'Trần Ngọc Mai',gender:'other'}
  ]);
});
check('Skip formulas and non-student captions',()=>{
  assert.deepEqual(rosterFromGrid([
    ['Họ và tên','Giới tính'],['=HYPERLINK("https://example.com")','Nam'],
    ['Tổng số học sinh',''],['Nguyễn Văn An','Nam']
  ]),[{name:'Nguyễn Văn An',gender:'male'}]);
});
console.log('Roster import:',passed,'checks passed.');
