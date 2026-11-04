export const statuses = ['面談取り付け', '初回面談済', '継続面談中', '収支シミュ提出', '契約交渉中', '契約締結予定', '契約済', '破談'];
const legacyStatuses = ['商談中', '見積提出', '契約予定', '契約済み', '初回面談済み', '完了', '失注'];
export const owners = ['藤田', '本間', '高橋', '鈴木', '郷', '菅原', 'OS'];
export const sources = ['問い合わせ（HP）', '問い合わせ（電話）', '既存オーナー', 'OS交渉による既存オーナー', '新規アプローチ', '紹介'];
export const permits = ['民泊', '旅館業'];
export const fields = [
  ['number', '営業No.', 'auto'], ['brk', 'BRK', 'auto'], ['status', 'ステータス', 'status'], ['owner', '担当者', 'owner'],
  ['created', '記入日', 'date'], ['contract', '契約予定日（締結日）', 'date'], ['name', '案件名', 'text'], ['folder', 'フォルダ', 'url'],
  ['permit', '許可証種類', 'permit'], ['address', '住所', 'text'], ['map', 'Googleマップ', 'url'], ['source', '流入経路', 'source'],
  ['sales', '営業売上', 'number'], ['cost', 'コスト', 'number'], ['profit', '営業粗利', 'computed'], ['paymentDate', '(契)入金日', 'date'],
  ['paid', '入金確認', 'paid'], ['note', '備考', 'textarea']
];
export function profit(row) { return Number(row.sales || 0) - Number(row.cost || 0); }
export function isOrderComplete(row) {
  return fields.every(([key,,type]) => {
    if (key === 'note') return true;
    if (type === 'computed') return Number.isFinite(profit(row));
    if (type === 'number') return typeof row[key] === 'number' && Number.isFinite(row[key]) && row[key] >= 0;
    if (type === 'paid') return typeof row[key] === 'boolean';
    return typeof row[key] === 'string' && row[key].trim() !== '';
  });
}
export function totals(rows) { return rows.reduce((t, r) => ({ sales: t.sales + Number(r.sales || 0), profit: t.profit + profit(r), unpaid: t.unpaid + (r.paid ? 0 : Number(r.sales || 0)) }), { sales: 0, profit: 0, unpaid: 0 }); }
export function parseMonthInput(value) {
  const match = String(value ?? '').normalize('NFKC').trim().match(/^([1-9]\d{3})(?:\/|-|年)(\d{1,2})月?$/);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) throw new Error('年月は「2026/10」のように入力してください。');
  return `${match[1]}-${match[2].padStart(2,'0')}`;
}
export function parseDateInput(value) {
  const text=String(value??'').normalize('NFKC').trim(); if(!text)return '';
  const match=text.match(/^([1-9]\d{3})(\d{2})(\d{2})$/) || text.match(/^([1-9]\d{3})(?:-|\/|年)(\d{1,2})(?:-|\/|月)(\d{1,2})日?$/);
  if(!match)throw new Error('日付は「20261105」のように8桁で入力してください。');
  const iso=`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
  const date=new Date(iso+'T00:00:00Z');
  if(!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==iso)throw new Error('存在する日付を入力してください。');
  return iso;
}
export function formatDate(value) { return value ? `${value.slice(0,4)}年${Number(value.slice(5,7))}月${Number(value.slice(8,10))}日` : ''; }
export function monthlyReport(rows, dateKey = 'contract', start = '2026-10', end = '2027-09') {
  const monthIndex = value => {
    if (typeof value !== 'string' || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value)) throw new Error('開始月と終了月を入力してください。');
    return Number(value.slice(0,4)) * 12 + Number(value.slice(5)) - 1;
  };
  const first = monthIndex(start), last = monthIndex(end);
  if (last < first) throw new Error('終了月は開始月以降にしてください。');
  if (last - first >= 120) throw new Error('集計期間は10年以内にしてください。');
  const months = Array.from({ length: last - first + 1 }, (_, i) => {
    const index = first + i;
    const month = `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
    return { month, rows: [], count: 0, sales: 0, cost: 0, profit: 0, unpaid: 0 };
  });
  const byMonth = new Map(months.map(m => [m.month, m]));
  for (const row of rows) {
    const bucket = byMonth.get(String(row[dateKey] || '').slice(0, 7));
    if (!bucket) continue;
    bucket.rows.push(row); bucket.count++; bucket.sales += Number(row.sales || 0); bucket.cost += Number(row.cost || 0); bucket.profit += profit(row); bucket.unpaid += row.paid ? 0 : Number(row.sales || 0);
  }
  const included = months.flatMap(m => m.rows);
  return { months, included, excluded: rows.length - included.length, ...totals(included) };
}
export function filterRows(rows, query = '', status = '', payment = '') {
  const q = query.trim().toLocaleLowerCase();
  return rows.filter(r => (!status || r.status === status) && (!payment || (payment === 'paid' ? r.paid : !r.paid)) && (!q || fields.some(([k]) => String(r[k] ?? '').toLocaleLowerCase().includes(q))));
}
const orderCollator = new Intl.Collator('ja', {numeric:true, sensitivity:'base'});
export function sortRows(rows, key, direction = 'asc') {
  if (!fields.some(([k]) => k === key)) return [...rows];
  const value = row => key === 'profit' ? profit(row) : row[key];
  return rows.map((row,index) => ({row,index})).sort((a,b) => {
    const av = value(a.row), bv = value(b.row), empty = v => v == null || v === '';
    if (empty(av) || empty(bv)) return empty(av) === empty(bv) ? a.index - b.index : empty(av) ? 1 : -1;
    const n = typeof av === 'number' && typeof bv === 'number' ? av - bv : typeof av === 'boolean' && typeof bv === 'boolean' ? Number(av)-Number(bv) : orderCollator.compare(String(av),String(bv));
    return (direction === 'desc' ? -n : n) || a.index-b.index;
  }).map(x=>x.row);
}
export function validateRows(rows) {
  if (!Array.isArray(rows) || rows.length > 10000) throw new Error('バックアップの形式が正しくありません。');
  const ids = new Set(), numbers = new Set();
  return rows.map(r => {
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id || ids.has(r.id)) throw new Error('案件IDが不正または重複しています。');
    ids.add(r.id);
    const row = { id: r.id };
    for (const [key, , type] of fields) {
      if (type === 'computed') continue;
      if (type === 'number') {
        row[key] = Number(r[key] ?? 0);
        if (!Number.isSafeInteger(row[key]) || row[key] < 0) throw new Error('金額には0以上の整数を指定してください。');
      } else if (type === 'paid') {
        if (typeof r[key] !== 'boolean') throw new Error('入金確認の形式が不正です。');
        row[key] = r[key];
      } else {
        row[key] = String(r[key] ?? '').trim();
        if (row[key].length > 10000) throw new Error('入力が長すぎます。');
        if (type === 'url' && row[key]) {
          try { if (!['http:', 'https:'].includes(new URL(row[key]).protocol)) throw new Error(); }
          catch { throw new Error('リンクには http または https のURLを指定してください。'); }
        }
        if (type === 'date' && row[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(row[key]) || !Number.isFinite(Date.parse(row[key])) || new Date(row[key]).toISOString().slice(0,10) !== row[key])) throw new Error('日付の形式が正しくありません。');
      }
    }
    if (!row.number || !row.name || ![...statuses, ...legacyStatuses].includes(row.status)) throw new Error('営業No.・案件名・ステータスは必須です。');
    if (numbers.has(row.number)) throw new Error('営業No.が重複しています。');
    numbers.add(row.number);
    return row;
  });
}
export function csv(rows) {
  const cell = value => '"' + String(value).replace(/^[\s]*[=+@-]/, "'$&").replaceAll('"', '""') + '"';
  return '\ufeff' + [fields.map(([, label]) => cell(label)).join(','), ...rows.map(r => fields.map(([k, , type]) => cell(type === 'computed' ? profit(r) : type === 'paid' ? (r.paid ? '入金済' : '未入金') : (r[k] ?? ''))).join(','))].join('\r\n');
}
