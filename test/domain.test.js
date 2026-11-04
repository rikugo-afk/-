import test from 'node:test';
import assert from 'node:assert/strict';
import { profit, totals, monthlyReport, parseMonthInput, filterRows, validateRows, csv } from '../domain.js';
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
  for (const value of ['2026/1','2026-01','2026年1月','２０２６／０１',' 2026/01 ']) assert.equal(parseMonthInput(value),'2026-01');
  for (const value of ['2026/00','2026/13','26/10','','2026/1/1','2026/1abc']) assert.throws(()=>parseMonthInput(value));
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
