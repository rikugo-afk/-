import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('公開ファイルは内容のハッシュで参照し、登録ボタンのない空行入力版を配信', async () => {
  await promisify(execFile)(process.execPath, ['build.js'], { cwd: new URL('..', import.meta.url) });
  const root = new URL('../dist/', import.meta.url);
  const html = await readFile(new URL('index.html', root), 'utf8');
  assert.ok(!html.includes('案件を登録'));
  assert.match(html, /空行入力版/);
  const files = await readdir(root);
  assert.equal(files.length, 5);
  for (const stem of ['app','domain','style']) {
    const name = files.find(f => f.startsWith(stem + '.'));
    assert.match(name, new RegExp(`^${stem}\\.[a-f0-9]{12}\\.(js|css)$`));
    const content = await readFile(new URL(name, root), 'utf8');
    assert.ok(name.includes(createHash('sha256').update(content).digest('hex').slice(0,12)));
    if (stem !== 'domain') assert.ok(html.includes('./' + name));
    if (stem === 'app') {
      const domain = content.match(/from '(\.\/domain\.[a-f0-9]{12}\.js)'/)[1];
      assert.ok(files.includes(domain.slice(2)));
    }
  }
});
