import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('公開ファイルは内容のハッシュで参照し、登録ボタンのない空行入力版を配信', async () => {
  const root = new URL('../dist/', import.meta.url);
  const html = await readFile(new URL('index.html', root), 'utf8');
  assert.ok(!html.includes('案件を登録'));
  assert.ok(!html.includes('社員ログイン'));
  assert.ok(!html.includes('login-form'));
  assert.match(html,/id="connection-screen"/);
  assert.match(html, /空行入力版/);
  const files = await readdir(root);
  assert.equal(files.length, 4);
  for (const stem of ['app','style']) {
    const name = files.find(f => f.startsWith(stem + '.'));
    assert.match(name, new RegExp(`^${stem}\\.[a-f0-9]{12}\\.(js|css)$`));
    const content = await readFile(new URL(name, root), 'utf8');
    assert.ok(name.includes(createHash('sha256').update(content).digest('hex').slice(0,12)));
    assert.ok(html.includes('./' + name));
    if (stem === 'app') assert.doesNotMatch(content,/^import\s.*from\s+['"]@supabase\/supabase-js['"]/m);
  }
});
