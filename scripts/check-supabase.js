// Read-only checks for the public connection and denial of unauthenticated access.
// The save RPC request below must be rejected before reaching any write operation.
import { readFile } from 'node:fs/promises';
import { readPublicConfig } from '../build-config.js';
const defaults=JSON.parse(await readFile(new URL('../public-config.json',import.meta.url),'utf8'));
const config=readPublicConfig(process.env,defaults);
if(config.mode==='shared') {
  const headers={apikey:config.key,'Content-Type':'application/json'};
  async function request(path,options={}) {
    const response=await fetch(config.url+path,{...options,headers,signal:AbortSignal.timeout(20000)});
    const data=await response.json().catch(()=>({}));
    return {response,data};
  }
  const {response:settings}=await request('/auth/v1/settings');
  if(!settings.ok)throw new Error(`Supabase Auth connection failed (HTTP ${settings.status})`);
  console.log('PASS: public project URL and publishable key accepted by Supabase Auth');
  for(const [path,options] of [
    ['/rest/v1/rpc/order_desk_read',{method:'POST',body:'{}'}],
    ['/rest/v1/rpc/order_desk_save',{method:'POST',body:JSON.stringify({expected_revision:0,next_payload:{}})}],
    ['/rest/v1/order_desk_workspace?select=id&limit=1',{}],
    ['/rest/v1/order_desk_employees?select=user_id&limit=1',{}]
  ]) {
    const {response,data}=await request(path,options);
    if(![401,403].includes(response.status)||data.code!=='42501')throw new Error(`Anonymous access was not denied as expected for ${path.split('?')[0]} (HTTP ${response.status}, code ${String(data.code||'unknown')})`);
    console.log(`PASS: anonymous access denied for ${path.split('?')[0]}`);
  }
} else console.log('Local mode: Supabase connection check skipped');
