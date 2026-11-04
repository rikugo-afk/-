import test from 'node:test';
import assert from 'node:assert/strict';
import { profit, totals, monthlyReport, parseMonthInput, parseDateInput, formatDate, filterRows, validateRows, csv, isOrderComplete, fields, sortRows, normalizeSalesNumbers, allocateBrkNumbers, missingSignedFields } from '../domain.js';
import { server } from '../server.js';
const a = { id: '1', number: 'S-001', name: '青葉商事', status: '契約済', owner: '佐藤', sales: 240000, cost: 45000, paid: true };
const b = { ...a, id: '2', number: 'S-002', name: 'カフェ', status: '商談中', sales: 150000, cost: 25000, paid: false };
test('粗利と入金状況別の集計', () => {
  assert.equal(profit(a), 195000);
  assert.deepEqual(totals([a,b]), { sales: 390000, profit: 320000, unpaid: 150000 });
  assert.deepEqual(totals([]), { sales: 0, profit: 0, unpaid: 0 });
  assert.equal(profit({ sales: 100, cost: 200 }), -100);
});
test('検索・ステータス・入金条件を同時に適用', () => {
  assert.deepEqual(filterRows([a,b], '佐藤', '商談中', 'unpaid'), [b]);
  assert.deepEqual(filterRows([a,b], '青葉', '', 'paid'), [a]);
  assert.deepEqual(filterRows([a,b], '存在しない'), []);
});
test('2026年10月〜2027年9月の月別売上と粗利・範囲境界・日付基準', () => {
  const rows = [
    {...a, contract:'2026-10-01', paymentDate:'2026-11-01'},
    {...b, contract:'2027-09-30', paymentDate:'2027-10-01'},
    {...a, contract:'2026-09-30'}, {...b, contract:'2027-10-01'}, {...a, contract:''}
  ];
  const r = monthlyReport(rows);
  assert.equal(r.months.length,12); assert.equal(r.months[0].month,'2026-10'); assert.equal(r.months[11].month,'2027-09');
  assert.equal(r.months[0].sales,240000); assert.equal(r.months[0].profit,195000);
  assert.equal(r.months[11].sales,150000); assert.equal(r.months[11].profit,125000);
  assert.equal(r.months[1].sales,0); assert.equal(r.excluded,3);
  assert.equal(r.sales,390000); assert.equal(r.profit,320000); assert.equal(r.unpaid,150000);
  const paid = monthlyReport(rows,'paymentDate'); assert.equal(paid.months[1].sales,240000); assert.equal(paid.sales,240000); assert.equal(paid.excluded,4);
  assert.equal(monthlyReport([]).months.length,12);
  assert.equal(monthlyReport([{...b, contract:'2027-01-01',sales:100,cost:200}]).months[3].profit,-100);
});
test('復元データの正規化と不正・重複データの拒否', () => {
  assert.equal(validateRows([a])[0].folder, '');
  assert.throws(() => validateRows([a, { ...b, number: a.number }]), /営業No/);
  assert.throws(() => validateRows([a, { ...b, id: a.id }]), /ID/);
  for (const patch of [{ sales: -1 }, { cost: 1.5 }, { sales: Infinity }, { folder: 'javascript:alert(1)' }, { map: 'file:///tmp/a' }, { created: '2026-02-30' }, { paid: 'false' }, { name: '' }, { status: 'unknown' }]) assert.throws(() => validateRows([{ ...a, ...patch }]));
  assert.equal(validateRows([{...a, folder: 'https://example.com', contract: '2026-11-04'}])[0].contract, '2026-11-04');
});
test('指定月の範囲集計・単月・年またぎ・うるう年・不正な期間', () => {
  const rows = [{...a,contract:'2027-01-01'}, {...b,contract:'2027-03-31'}, {...a,contract:'2026-12-31'}, {...b,contract:'2027-04-01'}];
  const r = monthlyReport(rows,'contract','2027-01','2027-03');
  assert.equal(r.months.length,3); assert.equal(r.sales,390000); assert.equal(r.included.length,2);
  assert.equal(monthlyReport(rows,'contract','2027-03','2027-03').sales,150000);
  assert.deepEqual(monthlyReport([],'contract','2026-12','2027-01').months.map(m=>m.month),['2026-12','2027-01']);
  assert.equal(monthlyReport([{...a,contract:'2028-02-29'}],'contract','2028-02','2028-02').sales,240000);
  for (const [start,end] of [['','2027-01'],['2027-13','2027-14'],['2027-03','2027-01'],['2026-01','2036-01']]) assert.throws(()=>monthlyReport([], 'contract', start, end));
});
test('手入力の年月を正規化し不正な月を拒否', () => {
  for (const value of ['202601','２０２６０１','2026/1','2026-01','2026年1月','２０２６／０１',' 2026/01 ']) assert.equal(parseMonthInput(value),'2026-01');
  for (const value of ['2026/00','2026/13','26/10','','2026/1/1','2026/1abc']) assert.throws(()=>parseMonthInput(value));
});
test('8桁の日付を正規化して日本語で表示し、存在しない日付を拒否',()=>{
  for(const value of ['20261105','２０２６１１０５','2026年11月5日','2026-11-05','2026/11/5'])assert.equal(parseDateInput(value),'2026-11-05');
  assert.equal(formatDate('2026-11-05'),'2026年11月5日');assert.equal(parseDateInput('20280229'),'2028-02-29');assert.equal(parseDateInput(''),'');
  for(const value of ['20260229','20261301','20261100','20261131','2026115'])assert.throws(()=>parseDateInput(value));
});
test('備考以外の入力が揃った案件のみ受注完了とする', () => {
  const complete = { ...a, brk:'800', created:'2026-10-01', contract:'2026-10-01',folder:'https://example.com',permit:'飲食店営業',address:'東京都',map:'https://maps.google.com',source:'紹介',paymentDate:'2026-10-31',note:'' };
  assert.equal(isOrderComplete(complete),true);
  assert.equal(isOrderComplete({...complete, sales:0,cost:0,paid:false}),false);
  assert.equal(isOrderComplete({...complete, sales:0,cost:0,paid:true}),true);
  assert.equal(isOrderComplete({...complete,paid:''}),false);
  assert.equal(isOrderComplete({...complete,status:'契約締結予定'}),false);
  assert.equal(isOrderComplete({...complete,status:'破談'}),false);
  for (const [key,,type] of fields) if (key !== 'note' && type !== 'computed') assert.equal(isOrderComplete({...complete,[key]:''}),false,key);
  assert.equal(isOrderComplete({...complete, owner:'  '}),false);
});
test('未入力の金額・入金確認は空欄のまま保持し、0円と区別する',()=>{
  const row=validateRows([{...a,sales:'',cost:'',paid:''}])[0];
  assert.equal(row.sales,'');assert.equal(row.cost,'');assert.equal(row.paid,'');assert.equal(profit(row),null);assert.equal(isOrderComplete(row),false);
  const missing=validateRows([{...a,sales:undefined,cost:undefined,paid:undefined}])[0];assert.equal(missing.sales,'');assert.equal(missing.paid,'');
  const zero=validateRows([{...a,sales:0,cost:0}])[0];assert.equal(zero.sales,0);assert.equal(profit(zero),0);
  const partial=monthlyReport([{...a,contract:'2026-10-01',sales:100,cost:''}]);assert.equal(partial.cost,0);assert.equal(partial.profit,0);
});
test('営業No.は数字のみへ揃え、重複を避けて案件IDを保持',()=>{
  const data=[{id:'a',number:'S-001'},{id:'b',number:'S-010'},{id:'c',number:'1'},{id:'d',number:'OLD-A'}];
  const result=normalizeSalesNumbers(data,12);
  assert.deepEqual(result.map(r=>r.number),['1','10','13','14']);assert.equal(new Set(result.map(r=>r.number)).size,4);
  assert.deepEqual(result.map(r=>r.id),data.map(r=>r.id));assert.equal(data[0].number,'S-001');
});
test('BRKは契約済と契約締結予定の両方に採番し、既存番号と他ステータスを保持',()=>{
  const data=[{status:'契約済',brk:''},{status:'契約締結予定',brk:''},{status:'契約交渉中',brk:''}];
  assert.deepEqual(allocateBrkNumbers(data).rows.map(r=>r.brk),['800','801','']);
  const next=allocateBrkNumbers([{status:'契約済',brk:'850'},{status:'契約締結予定',brk:''},{status:'破談',brk:'820'}],830);
  assert.deepEqual(next.rows.map(r=>r.brk),['850','851','820']);assert.equal(next.last,851);assert.equal(data[0].brk,'');
});
test('契約済の選択には先頭11項目の入力が必要で、売上等は対象外',()=>{
  const row=Object.fromEntries(fields.slice(0,11).map(([key])=>[key,'入力済']));
  assert.deepEqual(missingSignedFields(row),[]);
  for(const [key,label] of fields.slice(0,11))if(key!=='status')assert.deepEqual(missingSignedFields({...row,[key]:''}),[label]);
  assert.deepEqual(missingSignedFields({...row,status:'',sales:'',source:'',note:''}),[]);
});
test('各項目の並び替えは金額・番号・空欄・粗利・同値を正しく扱う',()=>{
  const rows=[{...a,number:'S-010',sales:100,cost:200,created:'2027-03-01',brk:''},{...b,number:'S-002',sales:20,cost:0,created:'2026-12-01',brk:'801'},{...b,id:'3',number:'S-001',sales:20,cost:0,created:'',brk:'800'}];
  assert.deepEqual(sortRows(rows,'number').map(r=>r.number),['S-001','S-002','S-010']);
  assert.deepEqual(sortRows(rows,'sales').map(r=>r.sales),[20,20,100]);
  assert.equal(sortRows(rows,'profit')[0].number,'S-010');
  assert.equal(sortRows(rows,'brk','desc').at(-1).brk,'');
  assert.equal(sortRows(rows,'created','desc')[0].number,'S-010');
  assert.equal(sortRows(rows,'created','desc').at(-1).created,'');
  assert.equal(sortRows(rows,'sales')[0].number,'S-002');assert.equal(rows[0].number,'S-010');
});
test('CSVの18列、引用符、数式の無効化と入金表示', () => {
  const output = csv([{ ...a, name: '=HYPERLINK("x")', note: '複数\n行,備考' }]);
  assert.ok(output.startsWith('\ufeff"営業No."'));
  assert.ok(output.includes('"\'=HYPERLINK(""x"")"'));
  assert.ok(output.includes('"195000"'));
  assert.ok(output.includes('"入金済"'));
  assert.ok(output.includes('"複数\n行,備考"'));
  assert.equal(output.split('\r\n')[0].split(',').length, 18);
});
test('サーバーから画面・モジュールを取得でき未知のパスは404', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /受注管理/);
    for (const path of ['/app.js','/domain.js','/style.css']) assert.equal((await fetch(base + path)).status, 200);
    assert.equal((await fetch(base + '/package.json')).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
