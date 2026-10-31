/** Read a class roster locally. No file contents are uploaded until the user confirms import. */
export type RosterStudent = { name: string; gender: 'male' | 'female' | 'other' };
export type RosterFileResult = { rows: RosterStudent[]; sheet: string; sheetCount: number };

const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const clean = (s: unknown) => String(s ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
const isFullName = (s: string) => {
  const n = normalize(s);
  return s.length >= 4 && s.length <= 100 && /^[\p{L} .'\-’]+$/u.test(s) &&
    s.trim().split(/\s+/).length >= 2 && s.trim().split(/\s+/).length <= 8 &&
    !/^(ho va ten|ho ten|ten hoc sinh|danh sach|tong so|giao vien|ngay thang|lop |truong |hoc sinh|stt)/.test(n);
};
const asGender = (s: string): RosterStudent['gender'] => {
  const n = normalize(s);
  if (['nam', 'male', 'm'].includes(n)) return 'male';
  if (['nu', 'female', 'f'].includes(n)) return 'female';
  return 'other';
};
const marked = (s: string) => ['x', '1', 'yes', 'co', 'v', '✓', '✔'].includes(normalize(s)) || s.trim() === '✓' || s.trim() === '✔';
const nameHeading = (n: string) => ['ho va ten', 'ho ten', 'ho va ten hoc sinh', 'ten hoc sinh', 'ho ten hoc sinh', 'ho ten hs', 'ho va ten hs', 'hoten'].includes(n);

/** Works with tab-delimited clipboard data and Excel CSV exports (including quoted cells). */
export function parseDelimited(input: string): string[][] {
  const raw = input.replace(/^\uFEFF/, '');
  const preview = raw.split(/\r?\n/).slice(0, 12).join('\n');
  const candidates = ['\t', ',', ';'];
  const delimiter = candidates.map(d => ({d, count: preview.split(d).length - 1})).sort((a,b) => b.count - a.count)[0];
  const sep = delimiter && delimiter.count > 0 ? delimiter.d : '\t';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (char === '"') {
      if (quoted && raw[i+1] === '"') { cell += '"'; i++; }
      else if (!cell || quoted) quoted = !quoted;
      else cell += char;
    } else if (char === sep && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && raw[i+1] === '\n') i++;
      row.push(cell); if (row.some(x => x.trim())) rows.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  row.push(cell); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}

export function rosterFromGrid(grid: string[][]): RosterStudent[] {
  const rows = grid.map(r => r.slice(0, 50).map(clean)).filter(r => r.some(Boolean)).slice(0, 1200);
  let headerRow = -1, nameCol = -1, surnameCol = -1, givenCol = -1;
  let genderCol = -1, maleCol = -1, femaleCol = -1;
  for (let i = 0; i < Math.min(rows.length, 45); i++) {
    const h = rows[i].map(normalize);
    const direct = h.findIndex(nameHeading);
    const family = h.findIndex(v => v === 'ho' || v === 'ho dem');
    const given = h.findIndex(v => v === 'ten' || v === 'ten hoc sinh');
    if (direct === -1 && (family < 0 || given < 0 || family === given)) continue;
    headerRow = i; nameCol = direct;
    surnameCol = family; givenCol = given;
    genderCol = h.findIndex(v => v === 'gioi tinh' || v === 'phai');
    maleCol = h.findIndex(v => v === 'nam');
    femaleCol = h.findIndex(v => v === 'nu');
    break;
  }
  if (headerRow < 0) {
    // Prefer the column containing the most plausible names, not dates/places.
    const score = Array.from({length: 20}, (_, col) =>
      rows.slice(0, 100).filter(row => isFullName(row[col] || '')).length);
    nameCol = score.indexOf(Math.max(...score));
    if (!score[nameCol]) nameCol = rows[0] && /^\d+[.)]?$/.test(rows[0][0]) ? 1 : 0;
  }
  const out: RosterStudent[] = [];
  for (const cells of rows.slice(headerRow + 1)) {
    const name = clean(nameCol >= 0 ? cells[nameCol] : (cells[surnameCol] || '') + ' ' + (cells[givenCol] || ''));
    if (!isFullName(name)) continue;
    let gender = asGender(genderCol < 0 ? '' : (cells[genderCol] || ''));
    if (gender === 'other' && maleCol >= 0 && femaleCol >= 0) {
      if (marked(cells[femaleCol] || '')) gender = 'female';
      else if (marked(cells[maleCol] || '')) gender = 'male';
    }
    if (gender === 'other' && headerRow < 0) {
      gender = cells.map(asGender).find(g => g !== 'other') || 'other';
    }
    out.push({name, gender});
  }
  return out;
}
export const rosterFromText = (text: string): RosterStudent[] => rosterFromGrid(parseDelimited(text));

type ZipEntry = { start: number; compressed: number; uncompressed: number; method: number };
async function zipTexts(file: File): Promise<Map<string, () => Promise<string>>> {
  if (file.size > 8 * 1024 * 1024) throw Error('File quá lớn (tối đa 8 MB).');
  const data = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(data.buffer);
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw Error('File Excel không phải định dạng .xlsx hợp lệ.');
  const count = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > data.length || view.getUint32(cursor, true) !== 0x02014b50) throw Error('Cấu trúc file Excel bị lỗi.');
    const method = view.getUint16(cursor + 10, true);
    const compressed = view.getUint32(cursor + 20, true);
    const uncompressed = view.getUint32(cursor + 24, true);
    const nameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const offset = view.getUint32(cursor + 42, true);
    if (cursor + 46 + nameLen > data.length) throw Error('Cấu trúc file Excel bị lỗi.');
    const name = decoder.decode(data.subarray(cursor + 46, cursor + 46 + nameLen));
    if (name.startsWith('xl/') && name.endsWith('.xml')) {
      if (uncompressed > 6 * 1024 * 1024 || compressed > 8 * 1024 * 1024) throw Error('Trang tính quá lớn để nhập.');
      if (offset + 30 > data.length || view.getUint32(offset, true) !== 0x04034b50) throw Error('File Excel bị hỏng.');
      const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
      if (start + compressed > data.length) throw Error('File Excel bị hỏng.');
      entries.set(name, {start, compressed, uncompressed, method});
    }
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  const result = new Map<string, () => Promise<string>>();
  for (const [name, entry] of entries) {
    result.set(name, async () => {
      const slice = data.subarray(entry.start, entry.start + entry.compressed);
      if (entry.method === 0) return decoder.decode(slice);
      if (entry.method !== 8) throw Error('Định dạng nén Excel chưa được hỗ trợ.');
      if (typeof DecompressionStream === 'undefined') throw Error('Trình duyệt chưa hỗ trợ đọc .xlsx. Hãy dùng Chrome/Edge mới hoặc xuất CSV.');
      try {
        const stream = new Blob([Uint8Array.from(slice)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        const buffer = await new Response(stream).arrayBuffer();
        if (buffer.byteLength > 6 * 1024 * 1024) throw Error('Trang tính quá lớn để nhập.');
        return decoder.decode(buffer);
      } catch { throw Error('Không đọc được dữ liệu nén Excel. Hãy thử xuất CSV.'); }
    });
  }
  return result;
}
function xml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw Error('Dữ liệu XML trong Excel bị lỗi.');
  return doc;
}
function normalizedSheetPath(target: string): string {
  const parts: string[] = [];
  const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
  for (const p of path.split('/')) {
    if (p === '..') parts.pop();
    else if (p && p !== '.') parts.push(p);
  }
  return parts.join('/');
}
function colIndex(address: string): number {
  const letters = address.match(/^[A-Z]+/i)?.[0].toUpperCase() || '';
  let n = 0;
  for (const c of letters) n = n * 26 + c.charCodeAt(0) - 64;
  return n - 1;
}
function sheetGrid(doc: Document, shared: string[]): string[][] {
  const result: string[][] = [];
  const lines = Array.from(doc.getElementsByTagName('row')).slice(0, 1200);
  for (const line of lines) {
    const out: string[] = [];
    let next = 0;
    for (const c of Array.from(line.getElementsByTagName('c'))) {
      const explicit = colIndex(c.getAttribute('r') || '');
      const index = explicit >= 0 ? explicit : next;
      next = index + 1;
      if (index >= 50) continue;
      const type = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent || '';
      if (type === 's') out[index] = shared[Number(v)] || '';
      else if (type === 'inlineStr') out[index] = Array.from(c.getElementsByTagName('t')).map(t => t.textContent || '').join('');
      else if (type === 'e') out[index] = '';
      else out[index] = v;
    }
    if (out.some(Boolean)) result.push(out);
  }
  return result;
}
export async function rosterFromFile(file: File): Promise<RosterFileResult> {
  const ext = file.name.toLowerCase();
  if (ext.endsWith('.csv') || ext.endsWith('.tsv') || ext.endsWith('.txt')) {
    const rows = rosterFromText(await file.text());
    return {rows, sheet: 'Danh sách từ ' + file.name, sheetCount: 1};
  }
  if (!ext.endsWith('.xlsx')) throw Error('Chỉ hỗ trợ Excel .xlsx, CSV hoặc TSV. File .xls cần lưu lại thành .xlsx.');
  const parts = await zipTexts(file);
  const read = async (path: string) => {
    const get = parts.get(path);
    if (!get) throw Error('Không tìm thấy ' + path + ' trong file Excel.');
    return xml(await get());
  };
  const book = await read('xl/workbook.xml');
  const rels = await read('xl/_rels/workbook.xml.rels');
  let strings: string[] = [];
  if (parts.has('xl/sharedStrings.xml')) {
    const sst = await read('xl/sharedStrings.xml');
    strings = Array.from(sst.getElementsByTagName('si')).map(si =>
      Array.from(si.getElementsByTagName('t')).map(t => t.textContent || '').join(''));
  }
  const targets = new Map(Array.from(rels.getElementsByTagName('Relationship')).map(r =>
    [r.getAttribute('Id') || '', r.getAttribute('Target') || '']));
  const sheets = Array.from(book.getElementsByTagName('sheet')).slice(0, 12);
  if (!sheets.length) throw Error('File Excel không có trang tính.');
  let best: RosterFileResult = {rows: [], sheet: '', sheetCount: sheets.length};
  for (const [i, sheet] of sheets.entries()) {
    const rel = sheet.getAttribute('r:id') || sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id') || '';
    const target = targets.get(rel) || 'worksheets/sheet' + (i+1) + '.xml';
    const path = normalizedSheetPath(target);
    if (!parts.has(path)) continue;
    const students = rosterFromGrid(sheetGrid(await read(path), strings));
    if (students.length > best.rows.length) best = {rows:students, sheet:sheet.getAttribute('name') || 'Sheet ' + (i+1), sheetCount:sheets.length};
  }
  return best;
}
