import { statuses, owners, sources, fields, profit, monthlyReport, parseMonthInput, filterRows, validateRows, csv, isOrderComplete, sortRows } from './domain.js';
const $ = id => document.getElementById(id), storageKey = 'order-desk:v1';
let rows = [], editing = null, storageBroken = false, toastTimer, activeCell = null, tableEditing = false;
const developmentKey = 'order-desk:development:v1', developmentStatuses = ['未着手','進行中','確認待ち','完了'];
let development = {}, developmentBroken = false;
function validateDevelopment(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('開発進捗の形式が不正です。');
  for (const item of Object.values(value)) if (!item || !developmentStatuses.includes(item.status) || typeof item.note !== 'string' || item.note.length > 10000) throw new Error('開発進捗の形式が不正です。');
  return value;
}
try { const saved = localStorage.getItem(developmentKey); if (saved) development = validateDevelopment(JSON.parse(saved)); } catch { developmentBroken = true; }
const undoHistory = [];
let historyReady = false;
let sortKey = null, sortDirection = 'asc';
let currentView = ['#completed','#development'].includes(location.hash) ? location.hash.slice(1) : 'orders';
function workspaceRows() { return rows.filter(r => isOrderComplete(r) === (currentView !== 'orders')); }
function captureState() { return JSON.stringify({ rows, drafts, development }); }
function updateUndoButton() { for (const id of ['undo','undo-development']) { $(id).disabled = undoHistory.length === 0; $(id).title = `保存済みの操作を元に戻します（履歴${undoHistory.length}件）`; } }
function recordUndo(before) {
  if (!historyReady || before === captureState()) return;
  undoHistory.push(before);
  while (undoHistory.length > 30 || (undoHistory.length > 1 && undoHistory.reduce((n,s) => n + s.length, 0) > 2500000)) undoHistory.shift();
  updateUndoButton();
}
let reportRange = { start: '2026-10', end: '2027-09', basis: 'contract' };
const reportKey = 'order-desk:report:v1';
try {
  const saved = JSON.parse(localStorage.getItem(reportKey));
  if (saved && ['contract','paymentDate'].includes(saved.basis)) { monthlyReport([], saved.basis, saved.start, saved.end); reportRange = saved; }
} catch { /* Invalid display preferences do not affect order data. */ }
const yen = value => '¥' + Number(value).toLocaleString('ja-JP');
const localDate = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const draftKey = 'order-desk:draft:v1';
const emptyDraft = () => Object.fromEntries([['id', crypto.randomUUID()], ...fields.filter(([, , t]) => t !== 'computed').map(([k]) => [k, ''])]);
let drafts = [emptyDraft()];
const isDraftRow = id => drafts.some(r => r.id === id);
const serialKey = 'order-desk:last-number';
let lastSerial = 0;
const brkKey = 'order-desk:last-brk';
let lastBrk = 799;
try { const n = Number(localStorage.getItem(brkKey)); if (Number.isSafeInteger(n) && n >= 799) lastBrk = n; } catch { /* Existing BRK values establish the sequence. */ }
function highestBrk(list) { return list.reduce((max, row) => { const n = /^\d+$/.test(row.brk || '') ? Number(row.brk) : 0; return Number.isSafeInteger(n) ? Math.max(max, n) : max; }, lastBrk); }
const needsBrk = row => ['契約締結予定','契約済'].includes(row.status) && !row.brk;
try { const n = Number(localStorage.getItem(serialKey)); if (Number.isSafeInteger(n) && n >= 0) lastSerial = n; } catch { /* Existing rows also establish the sequence. */ }
function highestSerial(list) { return list.reduce((max, row) => { const m = /^S-(\d+)$/.exec(row.number || ''), n = m ? Number(m[1]) : 0; return Number.isSafeInteger(n) ? Math.max(max, n) : max; }, lastSerial); }
function nextNumber() { const n = highestSerial(rows) + 1; if (!Number.isSafeInteger(n)) throw new Error('営業No.の採番上限に達しました。'); return `S-${String(n).padStart(3,'0')}`; }
function completeDraft(value) { return { ...value, number: nextNumber(), name: value.name || '下書き', status: value.status || statuses[0], created: value.created || localDate(), sales: Number(value.sales || 0), cost: Number(value.cost || 0), paid: value.paid === true }; }
function findRow(id) { return rows.find(r => r.id === id) || drafts.find(r => r.id === id); }
class MoveBackCancelled extends Error {}
function confirmMoveBack(next) {
  const previous = new Map(rows.map(r => [r.id,r]));
  if (next.some(r => previous.has(r.id) && isOrderComplete(previous.get(r.id)) && !isOrderComplete(r)) && !confirm('空欄があります。受注管理に戻しますか？')) throw new MoveBackCancelled('受注管理への移動をキャンセルしました');
}
function persistDrafts(next) {
  if (storageBroken) throw new Error('保存データを読み込めないため保存を停止しています。');
  try { localStorage.setItem(draftKey, JSON.stringify(next)); } catch { throw new Error('下書きを保存できません。ブラウザーの保存容量・設定を確認してください。'); }
  const before = captureState(); drafts = next; recordUndo(before);
}
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 5000); }
try { const saved = localStorage.getItem(storageKey); if (saved) rows = validateRows(JSON.parse(saved)); }
catch { storageBroken = true; toast('保存データを読み込めません。バックアップ読込で復元してください。既存データは上書きしていません。'); }
lastSerial = highestSerial(rows);
lastBrk = highestBrk(rows);
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
  let clean = validateRows(next), brkSequence = highestBrk(clean);
  clean = clean.map(row => {
    if (!needsBrk(row)) return row;
    brkSequence++;
    if (!Number.isSafeInteger(brkSequence)) throw new Error('BRKの採番上限に達しました。');
    return { ...row, brk: String(brkSequence) };
  });
  confirmMoveBack(clean);
  try {
    const serial = highestSerial(clean);
    localStorage.setItem(serialKey, String(serial)); lastSerial = serial;
    localStorage.setItem(brkKey, String(brkSequence)); lastBrk = brkSequence;
    localStorage.setItem(storageKey, JSON.stringify(clean));
  } catch { throw new Error('保存できません。ブラウザーの保存容量・設定を確認してください。'); }
  const before = captureState(); rows = clean; recordUndo(before); storageBroken = false; if (redraw) render(); else refreshTotals();
}
function option(select, value, label = value) { const o = document.createElement('option'); o.value = value; o.textContent = label; select.append(o); }
function ownerOptions(select, current = '') {
  select.replaceChildren(); option(select, '', '未選択'); owners.forEach(name => option(select, name));
  if (current && !owners.includes(current)) option(select, current, `${current}（既存の担当者）`);
}
function statusOptions(select, current = '', allowEmpty = false) {
  select.replaceChildren(); if (allowEmpty) option(select, '', '未選択'); statuses.forEach(name => option(select, name));
  if (current && !statuses.includes(current)) option(select, current, `${current}（既存のステータス）`);
}
function sourceOptions(select, current = '') {
  select.replaceChildren(); option(select, '', '未選択'); sources.forEach(name => option(select, name));
  if (current && !sources.includes(current)) option(select, current, `${current}（既存の流入経路）`);
}
statuses.forEach(s => option($('status-filter'), s));
for (const s of new Set(rows.map(r => r.status))) if (!statuses.includes(s)) option($('status-filter'), s, s + '（既存）');
$('period-start').value = reportRange.start.replace('-', '/'); $('period-end').value = reportRange.end.replace('-', '/'); $('date-basis').value = reportRange.basis;
$('today').textContent = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());
for (const [key, label, type] of fields) {
  const th = document.createElement('th'); th.dataset.sortKey = key; th.scope='col'; th.setAttribute('aria-sort','none');
  const sort = document.createElement('button'); sort.type='button'; sort.className='sort-column'; sort.textContent=label+' ↕'; sort.setAttribute('aria-label',label+'で並び替え');
  sort.addEventListener('click',()=>{
    if (activeCell && !activeCell.commit()) { activeCell.input.focus(); return; }
    sortDirection = sortKey === key && sortDirection === 'asc' ? 'desc' : 'asc'; sortKey=key; render();
  }); th.append(sort); if (type === 'number' || type === 'computed') th.className = 'numeric'; $('columns').append(th);
  const wrapper = document.createElement('label'); wrapper.className = 'form-field' + (['note','address','name'].includes(key) ? ' wide' : '');
  const caption = document.createElement('span'); caption.textContent = label + (['number', 'name', 'status'].includes(key) ? ' *' : ''); wrapper.append(caption);
  let input;
  if (type === 'status' || type === 'paid' || type === 'owner' || type === 'source') {
    input = document.createElement('select');
    if (type === 'owner') ownerOptions(input); else if (type === 'source') sourceOptions(input); else if (type === 'status') statusOptions(input); else { option(input, 'false', '未入金'); option(input, 'true', '入金済'); }
  } else if (type === 'textarea') { input = document.createElement('textarea'); input.rows = 3; }
  else { input = document.createElement('input'); input.type = type === 'computed' ? 'text' : type; }
  input.name = key; input.id = 'field-' + key;
  if (['number', 'name', 'status'].includes(key)) input.required = true;
  if (type === 'computed') { input.readOnly = true; input.tabIndex = -1; }
  if (type === 'auto') { input.readOnly = true; input.tabIndex = -1; }
  if (type === 'number') { input.min = '0'; input.step = '1'; input.placeholder = '0'; }
  if (type === 'url') input.placeholder = 'https://…';
  wrapper.append(input); $('form-fields').append(wrapper);
}
const actionsHeading = document.createElement('th'); actionsHeading.textContent = '操作'; $('columns').append(actionsHeading);
function updateProfit() { $('field-profit').value = yen(Number($('field-sales').value || 0) - Number($('field-cost').value || 0)); }
['sales','cost'].forEach(k => $('field-' + k).addEventListener('input', updateProfit));
function visible() { return sortRows(filterRows(workspaceRows(), $('search').value, $('status-filter').value, $('payment-filter').value),sortKey,sortDirection); }
function refreshTotals() {
  $('nav-orders-count').textContent = rows.filter(r => !isOrderComplete(r)).length;
  $('nav-completed-count').textContent = rows.filter(isOrderComplete).length;
  $('nav-development-count').textContent = rows.filter(isOrderComplete).length;
  const report = monthlyReport(workspaceRows(), reportRange.basis, reportRange.start, reportRange.end);
  const formatMonth = value => `${value.slice(0,4)}年${Number(value.slice(5))}月`;
  const periodText = `${formatMonth(reportRange.start)}〜${formatMonth(reportRange.end)}`;
  const basisText = reportRange.basis === 'contract' ? '契約予定日（締結日）' : '(契)入金日';
  $('period-summary').textContent = `${periodText} ／ ${basisText}基準`;
  $('monthly-period').textContent = periodText; $('monthly-description').textContent = `${report.months.length}か月の売上と利益を確認`;
  $('monthly-region').setAttribute('aria-label', periodText + 'の月別売上と粗利');
  $('count').textContent = report.included.length; for (const k of ['sales', 'profit', 'unpaid']) $(k).textContent = yen(report[k]);
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
  $('monthly-note').textContent = `対象：${periodText}（開始月の初日から終了月の末日まで） ／ ${basisText}基準。日付未入力・期間外の${report.excluded}件は集計対象外です。ステータスにかかわらず登録金額を集計します。`;
}
function applyPeriod() {
  try {
    const next = { start: parseMonthInput($('period-start').value), end: parseMonthInput($('period-end').value), basis: $('date-basis').value };
    monthlyReport([], next.basis, next.start, next.end);
    reportRange = next; $('period-error').textContent = '';
    $('period-start').value = next.start.replace('-', '/'); $('period-end').value = next.end.replace('-', '/');
    try { localStorage.setItem(reportKey, JSON.stringify(next)); } catch { /* Calculation still works when preferences cannot be persisted. */ }
    refreshTotals();
  } catch (e) { $('period-error').textContent = e.message + ' 合計は直前の有効な期間を表示しています。'; }
}
for (const id of ['period-start','period-end','date-basis']) $(id).addEventListener('change', applyPeriod);
for (const id of ['period-start','period-end']) $(id).addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); applyPeriod(); } });
$('period-reset').addEventListener('click', () => { $('period-start').value = '2026-10'; $('period-end').value = '2027-09'; applyPeriod(); });
try { $('monthly-panel').open = localStorage.getItem('order-desk:monthly-open') === 'true'; } catch { /* Defaults to collapsed. */ }
$('monthly-panel').addEventListener('toggle', () => { try { localStorage.setItem('order-desk:monthly-open', String($('monthly-panel').open)); } catch { /* Display remains usable. */ } });
try { $('orders-panel').open = localStorage.getItem('order-desk:orders-open') !== 'false'; } catch { /* Defaults to open. */ }
$('orders-panel').addEventListener('toggle', () => {
  try { localStorage.setItem('order-desk:orders-open', String($('orders-panel').open)); } catch { /* Display remains usable. */ }
  if ($('orders-panel').open) scheduleListHeight();
});
function drawCell(td, row, field) {
  const [key, label, type] = field;
  const isDraft = isDraftRow(row.id);
  td.replaceChildren(); td.className = ['number','computed'].includes(type) ? 'numeric' : '';
  if (type === 'auto') { td.dataset.key = key; td.textContent = key === 'brk' ? row.brk || '—' : isDraft ? '自動採番' : row[key]; td.classList.add('auto-number'); td.title = key === 'brk' ? '契約締結予定・契約済になると800から自動採番されます' : '案件の保存時に自動採番されます'; return; }
  if (type === 'computed') { td.textContent = isDraft && row.sales === '' && row.cost === '' ? '' : yen(profit(row)); td.classList.add('profit-cell'); td.title = '営業売上 − コスト（自動計算）'; return; }
  td.dataset.key = key;
  if (tableEditing) td.classList.add('editable-cell');
  const button = document.createElement(tableEditing ? 'button' : 'span'); button.className = 'cell-value';
  if (tableEditing) { button.type = 'button'; button.setAttribute('aria-label', `${isDraft ? '空行' : row.number} ${label}を編集`); button.title = `${label}を直接編集`; }
  button.textContent = isDraft && row[key] === '' ? '' : type === 'number' ? yen(row[key]) : type === 'paid' ? (row.paid ? '入金済' : '未入金') : row[key] || '—';
  if (isDraft && row[key] === '') { button.classList.add('blank-cell'); if (key === 'name') button.dataset.placeholder = '案件名を入力'; }
  if ((type === 'status' || type === 'paid') && !(isDraft && row[key] === '')) button.classList.add('badge', type === 'paid' ? (row.paid ? 'green' : 'amber') : ['契約済','契約済み','完了'].includes(row.status) ? 'green' : ['失注','破談'].includes(row.status) ? 'gray' : 'blue');
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
  if (!td.isConnected) return;
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
  if (!tableEditing || field[2] === 'auto' || field[2] === 'computed') return;
  if (activeCell && !activeCell.commit()) { activeCell.input.focus(); return; }
  const row = findRow(rowId); if (!row) return;
  const isDraft = isDraftRow(rowId);
  const [key, label, type] = field;
  const input = document.createElement(type === 'textarea' ? 'textarea' : ['status','paid','owner','source'].includes(type) ? 'select' : 'input');
  if (isDraft && ['status','paid'].includes(type)) option(input, '', '未入力');
  if (type === 'owner') ownerOptions(input, row[key]);
  else if (type === 'source') sourceOptions(input, row[key]);
  else if (type === 'status') statusOptions(input, row[key], isDraft);
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
            if (isOrderComplete(findRow(rowId))) { render(); toast('全項目が入力されたため「受注完了」に移動しました'); return true; }
            toast('案件を保存しました。次の空行にも続けて入力できます'); return true;
          }
          persistDrafts(drafts.map(r => r.id === rowId ? next : r)); toast('下書きを保存しました。案件名を入力すると案件として保存されます');
        } else {
          save(rows.map(r => r.id === rowId ? { ...r, [key]: value } : r), false, false);
          const brkCell = td.parentElement.querySelector('[data-key="brk"]'); if (brkCell) drawCell(brkCell, findRow(rowId), fields.find(([k]) => k === 'brk'));
          toast('変更を保存しました');
        }
        const profitCell = td.parentElement.querySelector('.profit-cell'); const changed = findRow(rowId);
        if (profitCell) profitCell.textContent = isDraftRow(changed.id) && changed.sales === '' && changed.cost === '' ? '' : yen(profit(changed));
      }
      close();
      if (!isDraftRow(rowId) && isOrderComplete(findRow(rowId)) !== (currentView !== 'orders')) { render(); toast(currentView === 'orders' ? '「受注完了」に移動しました' : '空欄ができたため「受注管理」に戻しました'); }
      else if (sortKey === key || (sortKey === 'profit' && ['sales','cost'].includes(key))) render();
      return true;
    } catch (e) {
      if (e instanceof MoveBackCancelled) { close(); toast(e.message); return true; }
      error.textContent = e.message; input.setAttribute('aria-invalid', 'true'); return false;
    }
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
  if (isDraftRow(row.id)) { const hint = document.createElement('span'); hint.className = 'draft-hint'; hint.textContent = '新規入力行'; td.append(hint); }
  else { const details = document.createElement('button'); details.className = 'row-details'; details.textContent = '詳細'; details.setAttribute('aria-label', `${row.number}の詳細を開く`); details.addEventListener('click', () => { if (!activeCell || activeCell.commit()) openEditor(rows.find(r => r.id === row.id)); }); td.append(details); }
  if (tableEditing) {
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'row-delete danger'; remove.textContent = '行を削除'; remove.setAttribute('aria-label', `${isDraftRow(row.id) ? '空行' : row.number}を削除`);
    remove.addEventListener('click', () => deleteTableRow(row.id)); td.append(remove);
  }
}
function deleteTableRow(id) {
  if (!tableEditing) return;
  if (activeCell && !activeCell.commit()) { activeCell.input.focus(); return; }
  const row = findRow(id); if (!row) return;
  const pending = isDraftRow(id);
  if (!confirm(`本当に削除しますか？\n${pending ? '空行・下書き' : row.number + '：' + row.name}`)) return;
  try {
    if (pending) { const next = drafts.filter(r => r.id !== id); persistDrafts(next.length ? next : [emptyDraft()]); render(); }
    else save(rows.filter(r => r.id !== id));
    toast('行を削除しました');
  } catch (e) { toast(e.message); }
}
function appendDraftRow(draft) {
  const tr = document.createElement('tr'); tr.dataset.id = draft.id; tr.className = 'draft-row';
  for (const field of fields) { const td = document.createElement('td'); drawCell(td, draft, field); tr.append(td); }
  const actions = document.createElement('td'); drawActions(actions, draft); tr.append(actions); $('rows').append(tr); return tr;
}
function updateResultCount() { const count = visible().length; $('visible-count').textContent = count; $('result-count').textContent = `${workspaceRows().length}件中 ${count}件を表示（空行・下書きは件数に含みません）`; }
function render() {
  if (activeCell && !activeCell.commit()) { activeCell.input.focus(); return; }
  refreshTotals();
  updateUndoButton();
  for (const [key,label] of fields) {
    const th = $('columns').querySelector(`[data-sort-key="${key}"]`);
    th.setAttribute('aria-sort',sortKey===key ? sortDirection==='asc' ? 'ascending':'descending' : 'none');
    th.querySelector('button').textContent=label+' '+(sortKey===key ? sortDirection==='asc' ? '↑':'↓' : '↕');
  }
  const completed = currentView !== 'orders', devView = currentView === 'development';
  $('page-title').textContent = devView ? '開発進捗' : completed ? '受注完了' : '受注管理'; $('breadcrumb-title').textContent = $('page-title').textContent;
  $('page-description').textContent = devView ? '受注完了した案件の開発状況を管理します。' : completed ? '備考以外の全項目が入力された案件です。' : '案件の進捗から入金まで、ひとつの場所で。';
  for (const view of ['orders','completed','development']) { $('nav-' + view).classList.toggle('active', currentView === view); $('nav-' + view).setAttribute('aria-current', currentView === view ? 'page' : 'false'); }
  $('orders-panel').hidden = devView; $('development-panel').hidden = !devView;
  if (devView) renderDevelopment();
  $('completion-note').textContent = '備考以外の全項目が入力されると受注完了に自動移動します。0円・未入金も入力済みとして扱います。';
  $('add-row-bar').hidden = completed;
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
  if (!completed) drafts.forEach(appendDraftRow);
  $('empty').hidden = filtered.length > 0 || tableEditing;
  $('empty').querySelector('h3').textContent = rows.length ? '条件に一致する案件がありません' : '上の空行から入力できます';
  $('empty').querySelector('p').textContent = rows.length ? '検索条件を変更するか、空行に新しい案件を入力できます。' : '「編集」を押して空行に入力してください。案件名を入力すると保存され、次の空行が表示されます。';
  $('empty-sample').hidden = rows.length > 0;
  if (completed) { $('empty').hidden = filtered.length > 0; $('empty').querySelector('h3').textContent = '該当する受注完了案件はありません'; $('empty').querySelector('p').textContent = '備考以外の全項目が入力された案件が、ここに自動で表示されます。'; $('empty-sample').hidden = true; }
}
function selectWorkspace(view) {
  if (activeCell && !activeCell.commit()) { activeCell.input.focus(); return; }
  currentView = view; history.replaceState(null, '', '#' + view);
  for (const id of ['search','status-filter','payment-filter']) $(id).value = '';
  render();
}
$('nav-orders').addEventListener('click', () => selectWorkspace('orders'));
$('nav-completed').addEventListener('click', () => selectWorkspace('completed'));
$('nav-development').addEventListener('click', () => selectWorkspace('development'));
function developmentEntry(id) { return Object.hasOwn(development, id) ? development[id] : { status:'未着手', note:'' }; }
function saveDevelopment(id, patch) {
  if (developmentBroken) throw new Error('開発進捗を読み込めないため、保存を停止しています。');
  const next = validateDevelopment({ ...development, [id]: { ...developmentEntry(id), ...patch } });
  const before = captureState(); localStorage.setItem(developmentKey, JSON.stringify(next)); development = next; recordUndo(before);
  toast('開発進捗を保存しました');
}
function renderDevelopment() {
  $('edit-development').textContent = tableEditing ? '✓ 編集を終了' : '✎ 編集'; $('edit-development').setAttribute('aria-pressed', String(tableEditing));
  $('development-rows').replaceChildren(); const projects = rows.filter(isOrderComplete);
  $('development-empty').hidden = projects.length > 0;
  $('development-note').textContent = developmentBroken ? '開発進捗の保存データを読み込めません。データ保護のため編集を停止しています。' : '受注完了した案件を自動表示します。「編集」を押して開発状況と備考を記録してください。';
  for (const row of projects) {
    const tr = document.createElement('tr'); tr.dataset.id = row.id;
    for (const text of [row.number, row.name, row.owner]) { const td = document.createElement('td'); td.textContent = text; tr.append(td); }
    const entry = developmentEntry(row.id), statusCell = document.createElement('td'), select = document.createElement('select');
    select.setAttribute('aria-label', `${row.number}の開発状況`); developmentStatuses.forEach(s => option(select,s)); select.value = entry.status; select.disabled = !tableEditing || developmentBroken;
    select.addEventListener('change', () => { try { saveDevelopment(row.id, {status:select.value}); } catch (e) { select.value = developmentEntry(row.id).status; toast('保存できません：' + e.message); } }); statusCell.append(select); tr.append(statusCell);
    const noteCell = document.createElement('td'), note = document.createElement('textarea'); note.rows = 2; note.maxLength = 10000; note.value = entry.note; note.setAttribute('aria-label', `${row.number}の開発備考`); note.placeholder = '作業内容・確認事項など'; note.disabled = !tableEditing || developmentBroken;
    note.addEventListener('change', () => { try { saveDevelopment(row.id,{note:note.value}); } catch(e) { toast('保存できません：' + e.message); } }); noteCell.append(note); tr.append(noteCell);
    const actionCell = document.createElement('td'), details = document.createElement('button'); details.className='row-details'; details.textContent='案件詳細'; details.addEventListener('click',()=>openEditor(rows.find(r=>r.id===row.id))); actionCell.append(details); tr.append(actionCell); $('development-rows').append(tr);
  }
}
$('edit-development').addEventListener('click',()=>{ tableEditing=!tableEditing; render(); });
function openEditor(row) {
  if (!row) return;
  editing = row.id; $('order-form').reset(); $('form-error').textContent = '';
  $('dialog-title').textContent = '案件を編集'; $('delete').hidden = false;
  for (const [key, , type] of fields) {
    if (type === 'computed') continue;
    if (type === 'owner') ownerOptions($('field-owner'), row.owner);
    if (type === 'source') sourceOptions($('field-source'), row.source);
    if (type === 'status') statusOptions($('field-status'), row.status);
    $('field-' + key).value = row ? String(row[key] ?? '') : type === 'paid' ? 'false' : type === 'status' ? statuses[0] : key === 'created' ? localDate() : '';
  }
  updateProfit(); $('editor').showModal();
}
$('edit-table').addEventListener('click', () => {
  if (activeCell && !activeCell.commit()) { activeCell.input.focus(); return; }
  tableEditing = !tableEditing; render();
  toast(tableEditing ? '編集モード：セルをクリックして入力できます。変更は自動保存されます' : '編集を終了しました');
});
function undoLastOperation() {
  if (activeCell && !activeCell.commit()) { activeCell.input.focus(); return; }
  if (!undoHistory.length) return;
  if (storageBroken) { toast('保存データを読み込めないため、元に戻す操作を停止しています。'); return; }
  const target = JSON.parse(undoHistory.at(-1));
  try {
    const restoredRows = validateRows(target.rows);
    confirmMoveBack(restoredRows);
    validateDevelopment(target.development);
    const oldRows = localStorage.getItem(storageKey), oldDrafts = localStorage.getItem(draftKey), oldDevelopment = localStorage.getItem(developmentKey);
    try {
      localStorage.setItem(storageKey, JSON.stringify(restoredRows));
      localStorage.setItem(draftKey, JSON.stringify(target.drafts));
      localStorage.setItem(developmentKey, JSON.stringify(target.development));
    } catch (error) {
      try {
        if (oldRows === null) localStorage.removeItem(storageKey); else localStorage.setItem(storageKey, oldRows);
        if (oldDrafts === null) localStorage.removeItem(draftKey); else localStorage.setItem(draftKey, oldDrafts);
        if (oldDevelopment === null) localStorage.removeItem(developmentKey); else localStorage.setItem(developmentKey, oldDevelopment);
      } catch { storageBroken = true; }
      throw error;
    }
    rows = restoredRows; drafts = target.drafts; development = target.development; undoHistory.pop();
    render(); toast('保存済みの操作を1つ元に戻しました');
  } catch (e) { toast(e instanceof MoveBackCancelled ? e.message : '元に戻せませんでした。ブラウザーの保存容量・設定を確認してください。'); }
}
$('undo').addEventListener('click',undoLastOperation); $('undo-development').addEventListener('click',undoLastOperation);
$('add-row').addEventListener('click', () => {
  if (!tableEditing) return;
  if (activeCell && !activeCell.commit()) { activeCell.input.focus(); return; }
  try {
    if (drafts.length >= 1000) throw new Error('空行は1000行まで追加できます。');
    const row = emptyDraft(); persistDrafts([...drafts, row]); const tr = appendDraftRow(row);
    const td = tr.querySelector('.editable-cell'); editCell(td, row.id, fields.find(([key]) => key === td.dataset.key)); td.scrollIntoView({ block:'nearest', inline:'nearest' });
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
$('delete').addEventListener('click', () => { if (confirm('本当に削除しますか？')) { try { save(rows.filter(r => r.id !== editing)); $('editor').close(); toast('案件を削除しました'); } catch (error) { $('form-error').textContent = error.message; } } });
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
    ['S-001','株式会社 青葉商事 / 飲食店営業許可','藤田','契約済','飲食店営業','東京都渋谷区神宮前','問い合わせ（HP）',240000,45000,true],
    ['S-002','ひかり建設 / 建設業許可更新','本間','収支シミュ提出','建設業','神奈川県横浜市中区','紹介',180000,30000,false],
    ['S-003','カフェ こもれび / 新規開業サポート','郷','面談取り付け','飲食店営業','東京都世田谷区三軒茶屋','新規アプローチ',150000,25000,false]
  ].map(([number,name,owner,status,permit,address,source,sales,cost,paid]) => ({ id: crypto.randomUUID(), number, name, owner, status, permit, address, source, sales, cost, paid, created: localDate(), note: 'サンプル案件（架空のデータ）' }));
  try { save(examples); toast('サンプル案件を3件追加しました'); } catch (error) { toast(error.message); }
}
['sample','empty-sample'].forEach(id => $(id).addEventListener('click', sample));
window.addEventListener('storage', e => { if ([storageKey,draftKey,developmentKey].includes(e.key)) location.reload(); });
// Measure actual row heights so wrapped text and validation messages also respect the 30-row limit.
let listHeightFrame = null;
function scheduleListHeight() {
  if (listHeightFrame !== null) return;
  listHeightFrame = requestAnimationFrame(() => {
    listHeightFrame = null;
    const table = $('orders-table'), viewport = $('orders-scroll'), limit = $('rows').children[29];
    if (!table.getClientRects().length) return;
    if (!limit) { viewport.style.maxHeight = 'none'; return; }
    const height = limit.getBoundingClientRect().bottom - table.getBoundingClientRect().top;
    const scrollbar = viewport.offsetHeight - viewport.clientHeight;
    viewport.style.maxHeight = `${height + scrollbar}px`;
  });
}
new ResizeObserver(scheduleListHeight).observe($('orders-table'));
new MutationObserver(scheduleListHeight).observe($('orders-table'), { childList:true, subtree:true, characterData:true });
if (!storageBroken && rows.some(needsBrk)) { try { save(rows, false, false); } catch (e) { toast(e.message); } }
historyReady = true;
render();
