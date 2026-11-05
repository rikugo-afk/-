import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { readPublicConfig } from './build-config.js';
const config=readPublicConfig(process.env);
const output = new URL('./dist/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const hashName = (name, content) => name.replace(/\.(js|css)$/, `.${createHash('sha256').update(content).digest('hex').slice(0,12)}.$1`);
const names = {};
const bundled=await build({entryPoints:[new URL('app.js',import.meta.url).pathname],bundle:true,format:'esm',platform:'browser',target:'es2022',write:false,define:{__ORDER_DESK_CONFIG__:JSON.stringify(config),'process.env.NODE_ENV':'"production"'}});
for (const name of ['app.js', 'style.css']) {
  const content=name==='app.js'?bundled.outputFiles[0].text:await readFile(new URL(name, import.meta.url), 'utf8');
  names[name] = hashName(name, content);
  await writeFile(new URL(names[name], output), content);
}
let html = await readFile(new URL('index.html', import.meta.url), 'utf8');
if(config.mode==='shared')html=html.replace('id="application"','id="application" hidden').replace('id="auth-screen" class="auth-screen" hidden','id="auth-screen" class="auth-screen"');
for (const name of ['app.js','style.css']) html = html.replace(`./${name}`, `./${names[name]}`);
await writeFile(new URL('index.html', output), html);
await writeFile(new URL('.nojekyll', output), '');
console.log('Static website built in dist/ with content-hashed assets.');
