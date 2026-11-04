import test from 'node:test';
import assert from 'node:assert/strict';
import { profit, totals, filterRows, validateRows, csv } from '../domain.js';
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
test('復元データの正規化と不正・重複データの拒否', () => {
  assert.equal(validateRows([a])[0].folder, '');
  assert.throws(() => validateRows([a, { ...b, number: a.number }]), /営業No/);
  assert.throws(() => validateRows([a, { ...b, id: a.id }]), /ID/);
  for (const patch of [{ sales: -1 }, { cost: 1.5 }, { sales: Infinity }, { folder: 'javascript:alert(1)' }, { map: 'file:///tmp/a' }, { created: '2026-02-30' }, { paid: 'false' }, { name: '' }, { status: 'unknown' }]) assert.throws(() => validateRows([{ ...a, ...patch }]));
  assert.equal(validateRows([{...a, folder: 'https://example.com', contract: '2026-11-04'}])[0].contract, '2026-11-04');
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
