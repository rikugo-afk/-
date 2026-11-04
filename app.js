import { statuses, fields, profit, totals, filterRows, validateRows, csv } from './domain.js';
const $ = id => document.getElementById(id), storageKey = 'order-desk:v1';
let rows = [], editing = null, storageBroken = false, toastTimer;
const yen = value => '¥' + Number(value).toLocaleString('ja-JP');
const localDate = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 5000); }
try { const saved = localStorage.getItem(storageKey); if (saved) rows = validateRows(JSON.parse(saved)); }
catch { storageBroken = true; toast('保存データを読み込めません。バックアップ読込で復元してください。既存データは上書きしていません。'); }
function save(next, restoring = false) {
  if (storageBroken && !restoring) throw new Error('保存データを読み込めないため保存を停止しています。バックアップから復元してください。');
  const clean = validateRows(next);
  try { localStorage.setItem(storageKey, JSON.stringify(clean)); } catch { throw new Error('保存できません。ブラウザーの保存容量・設定を確認してください。'); }
  rows = clean; storageBroken = false; render();
}
function option(select, value, label = value) { const o = document.createElement('option'); o.value = value; o.textContent = label; select.append(o); }
statuses.forEach(s => option($('status-filter'), s));
$('today').textContent = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());
for (const [key, label, type] of fields) {
  const th = document.createElement('th'); th.textContent = label; if (type === 'number' || type === 'computed') th.className = 'numeric'; $('columns').append(th);
  const wrapper = document.createElement('label'); wrapper.className = 'form-field' + (['note','address','name'].includes(key) ? ' wide' : '');
  const caption = document.createElement('span'); caption.textContent = label + (['number', 'name', 'status'].includes(key) ? ' *' : ''); wrapper.append(caption);
  let input;
  if (type === 'status' || type === 'paid') {
    input = document.createElement('select');
    if (type === 'status') statuses.forEach(s => option(input, s)); else { option(input, 'false', '未入金'); option(input, 'true', '入金済'); }
  } else if (type === 'textarea') { input = document.createElement('textarea'); input.rows = 3; }
  else { input = document.createElement('input'); input.type = type === 'computed' ? 'text' : type; }
  input.name = key; input.id = 'field-' + key;
  if (['number', 'name', 'status'].includes(key)) input.required = true;
  if (type === 'computed') { input.readOnly = true; input.tabIndex = -1; }
  if (type === 'number') { input.min = '0'; input.step = '1'; input.placeholder = '0'; }
  if (type === 'url') input.placeholder = 'https://…';
  wrapper.append(input); $('form-fields').append(wrapper);
}
function updateProfit() { $('field-profit').value = yen(Number($('field-sales').value || 0) - Number($('field-cost').value || 0)); }
['sales','cost'].forEach(k => $('field-' + k).addEventListener('input', updateProfit));
function visible() { return filterRows(rows, $('search').value, $('status-filter').value, $('payment-filter').value); }
function render() {
  const t = totals(rows); $('count').textContent = rows.length; for (const k of ['sales', 'profit', 'unpaid']) $(k).textContent = yen(t[k]);
  const filtered = visible(); $('visible-count').textContent = filtered.length; $('result-count').textContent = `${rows.length}件中 ${filtered.length}件を表示`; $('rows').replaceChildren();
  for (const row of filtered) {
    const tr = document.createElement('tr');
    for (const [key, , type] of fields) {
      const td = document.createElement('td');
      if (key === 'name') { const b = document.createElement('button'); b.className = 'name-button'; b.textContent = row.name; b.addEventListener('click', () => openEditor(row)); td.append(b); }
      else if (type === 'status' || type === 'paid') { const badge = document.createElement('span'); badge.className = 'badge ' + (type === 'paid' ? (row.paid ? 'green' : 'amber') : ['契約済','完了'].includes(row.status) ? 'green' : row.status === '失注' ? 'gray' : 'blue'); badge.textContent = type === 'paid' ? row.paid ? '入金済' : '未入金' : row.status; td.append(badge); }
      else if (type === 'url' && row[key]) { const a = document.createElement('a'); a.href = row[key]; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = key === 'map' ? 'マップを開く ↗' : 'フォルダを開く ↗'; td.append(a); }
      else if (type === 'number' || type === 'computed') { td.textContent = yen(type === 'computed' ? profit(row) : row[key]); td.className = 'numeric' + (type === 'computed' ? ' profit-cell' : ''); }
      else { td.textContent = row[key] || '—'; td.title = row[key] || ''; if (key === 'note' || key === 'address') td.className = 'truncate'; }
      tr.append(td);
    }
    $('rows').append(tr);
  }
  $('empty').hidden = filtered.length > 0;
  $('empty').querySelector('h3').textContent = rows.length ? '条件に一致する案件がありません' : '最初の案件を登録しましょう';
  $('empty').querySelector('p').textContent = rows.length ? '検索条件やフィルターを変更してください。' : '案件情報をまとめて、営業の進捗を見える化。';
  $('empty-sample').hidden = rows.length > 0;
}
function openEditor(row = null) {
  editing = row?.id ?? null; $('order-form').reset(); $('form-error').textContent = '';
  $('dialog-title').textContent = row ? '案件を編集' : '案件を登録'; $('delete').hidden = !row;
  for (const [key, , type] of fields) {
    if (type === 'computed') continue;
    $('field-' + key).value = row ? String(row[key] ?? '') : type === 'paid' ? 'false' : type === 'status' ? statuses[0] : key === 'created' ? localDate() : '';
  }
  updateProfit(); $('editor').showModal();
}
['add','empty-add'].forEach(id => $(id).addEventListener('click', () => openEditor()));
['close','cancel'].forEach(id => $(id).addEventListener('click', () => $('editor').close()));
$('order-form').addEventListener('submit', e => {
  e.preventDefault();
  const row = { id: editing || crypto.randomUUID() };
  for (const [key, , type] of fields) { if (type !== 'computed') { const v = $('field-' + key).value; row[key] = type === 'number' ? Number(v) : type === 'paid' ? v === 'true' : v.trim(); } }
  try { save(editing ? rows.map(r => r.id === editing ? row : r) : [row, ...rows]); $('editor').close(); toast('案件を保存しました'); }
  catch (error) { $('form-error').textContent = error.message; }
});
$('delete').addEventListener('click', () => { if (confirm('この案件を削除しますか？この操作は取り消せません。')) { try { save(rows.filter(r => r.id !== editing)); $('editor').close(); toast('案件を削除しました'); } catch (error) { $('form-error').textContent = error.message; } } });
for (const id of ['search','status-filter','payment-filter']) $(id).addEventListener('input', render);
$('reset').addEventListener('click', () => { for (const id of ['search','status-filter','payment-filter']) $(id).value = ''; render(); });
function download(content, filename, type) { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
$('export').addEventListener('click', () => download(csv(visible()), `受注一覧_${localDate()}.csv`, 'text/csv;charset=utf-8'));
$('backup').addEventListener('click', () => { if (storageBroken) { toast('保存データを読み込めないためバックアップを作成できません。'); return; } download(JSON.stringify(rows, null, 2), `order-desk_${localDate()}.json`, 'application/json'); });
$('restore').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async e => {
  const file = e.target.files[0]; if (!file) return;
  try { if (file.size > 10000000) throw new Error('ファイルは10MB以下にしてください。'); const next = validateRows(JSON.parse(await file.text())); if (confirm(`${next.length}件の案件で現在のデータを置き換えますか？`)) { save(next, true); toast('バックアップを復元しました'); } }
  catch (error) { toast('読込に失敗しました：' + error.message); } finally { e.target.value = ''; }
});
function sample() {
  if (rows.length) { toast('サンプルは案件が未登録のときに追加できます。'); return; }
  const examples = [
    ['S-001','株式会社 青葉商事 / 飲食店営業許可','佐藤','契約済','飲食店営業','東京都渋谷区神宮前','Webサイト',240000,45000,true],
    ['S-002','ひかり建設 / 建設業許可更新','田中','見積提出','建設業','神奈川県横浜市中区','ご紹介',180000,30000,false],
    ['S-003','カフェ こもれび / 新規開業サポート','鈴木','商談中','飲食店営業','東京都世田谷区三軒茶屋','お問い合わせ',150000,25000,false]
  ].map(([number,name,owner,status,permit,address,source,sales,cost,paid]) => ({ id: crypto.randomUUID(), number, name, owner, status, permit, address, source, sales, cost, paid, created: localDate(), note: 'サンプル案件（架空のデータ）' }));
  try { save(examples); toast('サンプル案件を3件追加しました'); } catch (error) { toast(error.message); }
}
['sample','empty-sample'].forEach(id => $(id).addEventListener('click', sample));
window.addEventListener('storage', e => { if (e.key === storageKey) location.reload(); });
render();
