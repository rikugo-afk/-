import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const output = new URL('./dist/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const hashName = (name, content) => name.replace(/\.(js|css)$/, `.${createHash('sha256').update(content).digest('hex').slice(0,12)}.$1`);
const names = {};
for (const name of ['domain.js', 'app.js', 'style.css']) {
  let content = await readFile(new URL(name, import.meta.url), 'utf8');
  if (name === 'app.js') content = content.replace("'./domain.js'", `'./${names['domain.js']}'`);
  names[name] = hashName(name, content);
  await writeFile(new URL(names[name], output), content);
}
let html = await readFile(new URL('index.html', import.meta.url), 'utf8');
for (const name of ['app.js','style.css']) html = html.replace(`./${name}`, `./${names[name]}`);
await writeFile(new URL('index.html', output), html);
await writeFile(new URL('.nojekyll', output), '');
console.log('Static website built in dist/ with content-hashed assets.');
