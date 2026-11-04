import { copyFile, mkdir, writeFile } from 'node:fs/promises';
const output = new URL('./dist/', import.meta.url);
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'app.js', 'domain.js', 'style.css']) {
  await copyFile(new URL(name, import.meta.url), new URL(name, output));
}
await writeFile(new URL('.nojekyll', output), '');
console.log('Static website built in dist/ (no server or credentials required).');
