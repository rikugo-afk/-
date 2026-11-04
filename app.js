import { statuses, fields, profit, monthlyReport, filterRows, validateRows, csv } from './domain.js';
const $ = id => document.getElementById(id), storageKey = 'order-desk:v1';
let rows = [], editing = null, storageBroken = false, toastTimer, activeCell = null, tableEditing = false;
const yen = value => '¥' + Number(value).toLocaleString('ja-JP');
const localDate = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const draftKey = 'order-desk:draft:v1';
const emptyDraft = () => Object.fromEntries([['id', crypto.randomUUID()], ...fields.filter(([, , t]) => t !== 'computed').map(([k]) => [k, ''])]);
let drafts = [emptyDraft()];
const isDraftRow = id => drafts.some(r => r.id === id);
function nextNumber() { let n = 1; while (rows.some(r => r.number === `S-${String(n).padStart(3,'0')}`)) n++; return `S-${String(n).padStart(3,'0')}`; }
function completeDraft(value) { return { ...value, number: value.number || nextNumber(), name: value.name || '下書き', status: value.status || statuses[0], created: value.created || localDate(), sales: Number(value.sales || 0), cost: Number(value.cost || 0), paid: value.paid === true }; }
function findRow(id) { return rows.find(r => r.id === id) || drafts.find(r => r.id === id); }
function persistDrafts(next) {
  if (storageBroken) throw new Error('保存データを読み込めないため保存を停止しています。');
  try { localStorage.setItem(draftKey, JSON.stringify(next)); } catch { throw new Error('下書きを保存できません。ブラウザーの保存容量・設定を確認してください。'); }
  drafts = next;
}
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 5000); }
try { const saved = localStorage.getItem(storageKey); if (saved) rows = validateRows(JSON.parse(saved)); }
catch { storageBroken = true; toast('保存データを読み込めません。バックアップ読込で復元してください。既存データは上書きしていません。'); }
try {
  const savedDraft = localStorage.getItem(draftKey);
  if (savedDraft) {
    const value = JSON.parse(savedDraft), list = Array.isArray(value) ? value : [value];
    if (list.length > 1000) throw new Error('下書きの行数が多すぎます。');
    const pending = list.filter(r => !rows.some(saved => saved.id === r?.id));
    const ids = new Set();
    for (const r of pending) { validateRows([completeDraft(r)]); if (ids.has(r.id)) throw new Error('下書きIDが重複しています。'); ids.add(r.id); }
    drafts = pending.length ? pending.map(r => ({ ...emptyDraft(), ...r })) : [emptyDraft()];
  }
} catch { storageBroken = true; toast('下書きデータを読み込めません。データ保護のため保存を停止しています。'); }
function save(next, restoring = false, redraw = true) {
  if (storageBroken && !restoring) throw new Error('保存データを読み込めないため保存を停止しています。バックアップから復元してください。');
  const clean = validateRows(next);
  try { localStorage.setItem(storageKey, JSON.stringify(clean)); } catch { throw new Error('保存できません。ブラウザーの保存容量・設定を確認してください。'); }
  rows = clean; storageBroken = false; if (redraw) render(); else refreshTotals();
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
const actionsHeading = document.createElement('th'); actionsHeading.textContent = '操作'; $('columns').append(actionsHeading);
function updateProfit() { $('field-profit').value = yen(Number($('field-sales').value || 0) - Number($('field-cost').value || 0)); }
['sales','cost'].forEach(k => $('field-' + k).addEventListener('input', updateProfit));
function visible() { return filterRows(rows, $('search').value, $('status-filter').value, $('payment-filter').value); }
function refreshTotals() {
  const report = monthlyReport(rows, $('date-basis').value);
  $('count').textContent = rows.length; for (const k of ['sales', 'profit', 'unpaid']) $(k).textContent = yen(report[k]);
  const max = Math.max(1, ...report.months.flatMap(m => [m.sales, Math.abs(m.profit)]));
  $('monthly-rows').replaceChildren();
  for (const m of report.months) {
    const tr = document.createElement('tr'); tr.dataset.month = m.month;
    const label = document.createElement('th'); label.scope = 'row'; label.textContent = `${m.month.slice(0,4)}年${Number(m.month.slice(5))}月`; tr.append(label);
    const count = document.createElement('td'); count.className = 'numeric'; count.textContent = `${m.count}件`; tr.append(count);
    for (const key of ['sales','cost','profit']) {
      const td = document.createElement('td'); td.className = 'numeric monthly-' + key;
      const amount = document.createElement('span'); amount.textContent = yen(m[key]); td.append(amount);
      if (key !== 'cost') { const track = document.createElement('span'); track.className = 'month-track'; const bar = document.createElement('span'); bar.className = 'month-bar ' + key + (m[key] < 0 ? ' negative' : ''); bar.style.width = `${Math.abs(m[key]) / max * 100}%`; track.append(bar); td.append(track); }
      tr.append(td);
    }
    $('monthly-rows').append(tr);
  }
  $('monthly-total-count').textContent = `${report.included.length}件`;
  $('monthly-total-sales').textContent = yen(report.sales); $('monthly-total-cost').textContent = yen(report.sales - report.profit); $('monthly-total-profit').textContent = yen(report.profit);
  $('monthly-note').textContent = `対象：2026年10月1日〜2027年9月30日 ／ ${$('date-basis').selectedOptions[0].textContent}基準。日付未入力・期間外の${report.excluded}件は集計対象外です。ステータスにかかわらず登録金額を集計します。`;
}
$('date-basis').addEventListener('change', refreshTotals);
function drawCell(td, row, field) {
  const [key, label, type] = field;
  const isDraft = isDraftRow(row.id);
  td.replaceChildren(); td.className = ['number','computed'].includes(type) ? 'numeric' : '';
  if (type === 'computed') { td.textContent = isDraft && row.sales === '' && row.cost === '' ? '' : yen(profit(row)); td.classList.add('profit-cell'); td.title = '営業売上 − コスト（自動計算）'; return; }
  td.dataset.key = key;
  if (tableEditing) td.classList.add('editable-cell');
  const button = document.createElement(tableEditing ? 'button' : 'span'); button.className = 'cell-value';
  if (tableEditing) { button.type = 'button'; button.setAttribute('aria-label', `${isDraft ? '空行' : row.number} ${label}を編集`); button.title = `${label}を直接編集`; }
  button.textContent = isDraft && row[key] === '' ? '' : type === 'number' ? yen(row[key]) : type === 'paid' ? (row.paid ? '入金済' : '未入金') : row[key] || '—';
  if (isDraft && row[key] === '') { button.classList.add('blank-cell'); if (key === 'name') button.dataset.placeholder = '案件名を入力'; }
  if ((type === 'status' || type === 'paid') && !(isDraft && row[key] === '')) button.classList.add('badge', type === 'paid' ? (row.paid ? 'green' : 'amber') : ['契約済','完了'].includes(row.status) ? 'green' : row.status === '失注' ? 'gray' : 'blue');
  if (key === 'name') button.classList.add('name-button');
  if (tableEditing) {
    button.addEventListener('click', () => editCell(td, row.id, field));
    button.addEventListener('keydown', e => { if (e.key.startsWith('Arrow') && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); navigateCell(td, e.key); } });
  }
  td.append(button);
  if (type === 'url' && row[key]) { const a = document.createElement('a'); a.href = row[key]; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.className = 'cell-link'; a.textContent = '↗'; a.setAttribute('aria-label', `${label}を開く`); td.append(a); }
}
function navigateCell(td, key, shift = false, commit = () => true) {
  if (!commit()) { activeCell?.input.focus(); return; }
  const all = [...$('rows').querySelectorAll('.editable-cell')], cells = [...td.parentElement.querySelectorAll('.editable-cell')];
  let target;
  if (key === 'Enter' || key === 'Tab') target = all[all.indexOf(td) + (shift ? -1 : 1)];
  else if (key === 'ArrowLeft' || key === 'ArrowRight') target = cells[cells.indexOf(td) + (key === 'ArrowLeft' ? -1 : 1)];
  else {
    const tr = key === 'ArrowUp' ? td.parentElement.previousElementSibling : td.parentElement.nextElementSibling;
    target = tr?.querySelector(`[data-key="${td.dataset.key}"]`);
  }
  if (target) { editCell(target, target.parentElement.dataset.id, fields.find(([k]) => k === target.dataset.key)); target.scrollIntoView({ block:'nearest', inline:'nearest' }); }
  else if (key === 'Enter' || key === 'Tab') $('add-row').focus();
  else { editCell(td, td.parentElement.dataset.id, fields.find(([k]) => k === td.dataset.key)); }
}
function editCell(td, rowId, field) {
  if (!tableEditing) return;
  if (activeCell && !activeCell.commit()) { activeCell.input.focus(); return; }
  const row = findRow(rowId); if (!row) return;
  const isDraft = isDraftRow(rowId);
  const [key, label, type] = field;
  const input = document.createElement(type === 'textarea' ? 'textarea' : ['status','paid'].includes(type) ? 'select' : 'input');
  if (isDraft && ['status','paid'].includes(type)) option(input, '', '未入力');
  if (type === 'status') statuses.forEach(s => option(input, s));
  else if (type === 'paid') { option(input, 'false', '未入金'); option(input, 'true', '入金済'); }
  else if (type !== 'textarea') input.type = type;
  input.value = String(row[key] ?? ''); input.className = 'cell-input'; input.setAttribute('aria-label', `${label}を入力`);
  if (!isDraft && ['number','name','status'].includes(key)) input.required = true;
  if (type === 'number') { input.min = '0'; input.step = '1'; }
  const error = document.createElement('span'); error.className = 'cell-error'; error.setAttribute('role','alert');
  const errorId = `cell-error-${rowId}-${key}`; error.id = errorId; input.setAttribute('aria-describedby', errorId);
  let finished = false;
  function close() { finished = true; activeCell = null; td.classList.remove('cell-editing'); drawCell(td, findRow(rowId), field); }
  function commit() {
    if (finished) return true;
    try {
      if (!input.checkValidity()) throw new Error(input.validationMessage);
      const value = isDraft && input.value === '' ? '' : type === 'number' ? Number(input.value) : type === 'paid' ? input.value === 'true' : input.value.trim();
      const current = findRow(rowId);
      if (current[key] !== value) {
        if (isDraft) {
          if (storageBroken) throw new Error('保存データを読み込めないため保存を停止しています。');
          const next = { ...current, [key]: value }, candidate = completeDraft(next);
          validateRows([...rows, candidate]);
          if (next.name) {
            save([...rows, candidate], false, false);
            // The completed row ID also identifies any stale draft after an interrupted cleanup.
            const remaining = drafts.filter(r => r.id !== rowId), extra = remaining.length ? null : emptyDraft();
            drafts = extra ? [extra] : remaining;
            try { localStorage.setItem(draftKey, JSON.stringify(drafts)); } catch { /* saved row remains authoritative; stale IDs are filtered on reload */ }
            close();
            const tr = td.parentElement; tr.classList.remove('draft-row');
            fields.forEach((f, i) => drawCell(tr.children[i], rows.find(r => r.id === rowId), f));
            drawActions(tr.lastElementChild, rows.find(r => r.id === rowId)); if (extra) appendDraftRow(extra); updateResultCount(); $('empty').hidden = true;
            toast('案件を保存しました。次の空行にも続けて入力できます'); return true;
          }
          persistDrafts(drafts.map(r => r.id === rowId ? next : r)); toast('下書きを保存しました。案件名を入力すると案件として保存されます');
        } else {
          save(rows.map(r => r.id === rowId ? { ...r, [key]: value } : r), false, false); toast('変更を保存しました');
        }
        const profitCell = td.parentElement.querySelector('.profit-cell'); const changed = findRow(rowId);
        if (profitCell) profitCell.textContent = isDraftRow(changed.id) && changed.sales === '' && changed.cost === '' ? '' : yen(profit(changed));
      }
      close(); return true;
    } catch (e) { error.textContent = e.message; input.setAttribute('aria-invalid', 'true'); return false; }
  }
  activeCell = { input, commit, cancel: close };
  td.replaceChildren(input, error); td.classList.add('cell-editing');
  input.addEventListener('input', () => { error.textContent = ''; input.removeAttribute('aria-invalid'); });
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.isComposing || e.keyCode === 229 || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); td.querySelector('button').focus(); }
    if ((e.key === 'Enter' && !(type === 'textarea' && e.shiftKey)) || e.key === 'Tab' || (e.key.startsWith('Arrow') && !e.shiftKey)) { e.preventDefault(); navigateCell(td, e.key, e.shiftKey, commit); }
  });
  input.focus(); if (['text','url','textarea'].includes(type)) input.select();
}
function drawActions(td, row) {
  td.replaceChildren();
  if (isDraftRow(row.id)) { const hint = document.createElement('span'); hint.className = 'draft-hint'; hint.textContent = '新規入力行'; td.append(hint); return; }
  const details = document.createElement('button'); details.className = 'row-details'; details.textContent = '詳細'; details.setAttribute('aria-label', `${row.number}の詳細を開く`); details.addEventListener('click', () => { if (!activeCell || activeCell.commit()) openEditor(rows.find(r => r.id === row.id)); }); td.append(details);
}
function appendDraftRow(draft) {
  const tr = document.createElement('tr'); tr.dataset.id = draft.id; tr.className = 'draft-row';
  for (const field of fields) { const td = document.createElement('td'); drawCell(td, draft, field); tr.append(td); }
  const actions = document.createElement('td'); drawActions(actions, draft); tr.append(actions); $('rows').append(tr); return tr;
}
function updateResultCount() { const count = visible().length; $('visible-count').textContent = count; $('result-count').textContent = `${rows.length}件中 ${count}件を表示（空行・下書きは件数に含みません）`; }
function render() {
  if (activeCell && !activeCell.commit()) { activeCell.input.focus(); return; }
  refreshTotals();
  $('edit-table').textContent = tableEditing ? '✓ 編集を終了' : '✎ 編集'; $('edit-table').setAttribute('aria-pressed', String(tableEditing));
  $('add-row').disabled = !tableEditing;
  $('edit-hint').textContent = tableEditing ? 'Enter / Tabで次の項目 ・ 矢印で上下左右に移動 ・ Shift+Enterで備考を改行 ・ Escで取消 ・ ＋で空行を追加' : '「編集」を押すと空行や既存案件に直接入力できます ・ 下の＋ボタンで行を追加';
  $('rows').classList.toggle('editing-enabled', tableEditing);
  const filtered = visible(); updateResultCount(); $('rows').replaceChildren();
  for (const row of filtered) {
    const tr = document.createElement('tr'); tr.dataset.id = row.id;
    for (const field of fields) { const td = document.createElement('td'); drawCell(td, row, field); tr.append(td); }
    const actions = document.createElement('td'); drawActions(actions, row); tr.append(actions);
    $('rows').append(tr);
  }
  drafts.forEach(appendDraftRow);
  $('empty').hidden = filtered.length > 0 || tableEditing;
  $('empty').querySelector('h3').textContent = rows.length ? '条件に一致する案件がありません' : '上の空行から入力できます';
  $('empty').querySelector('p').textContent = rows.length ? '検索条件を変更するか、空行に新しい案件を入力できます。' : '「編集」を押して空行に入力してください。案件名を入力すると保存され、次の空行が表示されます。';
  $('empty-sample').hidden = rows.length > 0;
}
function openEditor(row) {
  if (!row) return;
  editing = row.id; $('order-form').reset(); $('form-error').textContent = '';
  $('dialog-title').textContent = '案件を編集'; $('delete').hidden = false;
  for (const [key, , type] of fields) {
    if (type === 'computed') continue;
    $('field-' + key).value = row ? String(row[key] ?? '') : type === 'paid' ? 'false' : type === 'status' ? statuses[0] : key === 'created' ? localDate() : '';
  }
  updateProfit(); $('editor').showModal();
}
$('edit-table').addEventListener('click', () => {
  if (activeCell && !activeCell.commit()) { activeCell.input.focus(); return; }
  tableEditing = !tableEditing; render();
  toast(tableEditing ? '編集モード：セルをクリックして入力できます。変更は自動保存されます' : '編集を終了しました');
});
$('add-row').addEventListener('click', () => {
  if (!tableEditing) return;
  if (activeCell && !activeCell.commit()) { activeCell.input.focus(); return; }
  try {
    if (drafts.length >= 1000) throw new Error('空行は1000行まで追加できます。');
    const row = emptyDraft(); persistDrafts([...drafts, row]); const tr = appendDraftRow(row);
    const td = tr.querySelector('[data-key="number"]'); editCell(td, row.id, fields[0]); td.scrollIntoView({ block:'nearest', inline:'nearest' });
  } catch (e) { toast(e.message); }
});
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
window.addEventListener('storage', e => { if (e.key === storageKey || e.key === draftKey) location.reload(); });
render();
