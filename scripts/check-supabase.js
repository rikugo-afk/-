// Check URL sharing without changing any workspace data.
// The save probe always uses revision -1, which cannot match a workspace revision.
import { readFile } from 'node:fs/promises';
import { readPublicConfig } from '../build-config.js';
process.on('uncaughtException',error=>{console.error(`::error::${String(error.message).replaceAll('\n',' ')}`);process.exitCode=1;});
const defaults=JSON.parse(await readFile(new URL('../public-config.json',import.meta.url),'utf8'));
const config=readPublicConfig(process.env,defaults);
if(config.mode==='shared') {
  const headers={apikey:config.key,'Content-Type':'application/json'};
  async function request(path,options={}) {
    for(let attempt=0;attempt<3;attempt++) {
      try {
        const response=await fetch(config.url+path,{...options,headers,signal:AbortSignal.timeout(30000)});
        if([408,429,502,503,504].includes(response.status)&&attempt<2){await new Promise(resolve=>setTimeout(resolve,5000));continue;}
        const data=await response.json().catch(()=>({}));
        return {response,data};
      } catch(error) {
        if(attempt===2)throw new Error(`Supabase ${path.split('?')[0]} could not be reached after 3 attempts (${error.name}: ${error.message})`);
        await new Promise(resolve=>setTimeout(resolve,5000));
      }
    }
  }
  const {response:read,data:state}=await request('/rest/v1/rpc/order_desk_read',{method:'POST',body:'{}'});
  if(!read.ok)throw new Error(`Public sharing is not enabled in Supabase (HTTP ${read.status}). Run supabase/enable-public-access.sql in SQL Editor.`);
  if(!Number.isSafeInteger(state.revision)||state.revision<0||!Array.isArray(state.payload?.orders))throw new Error('Invalid shared workspace response');
  console.log('PASS: shared workspace can be opened without login');
  const {response:save,data:conflict}=await request('/rest/v1/rpc/order_desk_save',{method:'POST',body:JSON.stringify({expected_revision:-1,next_payload:{}})});
  if(![409,500].includes(save.status)||conflict.code!=='40001'||!conflict.message?.includes('VERSION_CONFLICT'))throw new Error(`Public saving or conflict protection is not configured (HTTP ${save.status})`);
  console.log('PASS: public save RPC is available and rejects stale revisions without changing data');
  for(const [path,options] of [
    ['/rest/v1/order_desk_workspace?select=id&limit=1',{}],
    ['/rest/v1/order_desk_employees?select=user_id&limit=1',{}]
  ]) {
    const {response,data}=await request(path,options);
    if(![401,403].includes(response.status)||data.code!=='42501')throw new Error(`Anonymous access was not denied as expected for ${path.split('?')[0]} (HTTP ${response.status}, code ${String(data.code||'unknown')})`);
    console.log(`PASS: anonymous access denied for ${path.split('?')[0]}`);
  }
} else console.log('Local mode: Supabase connection check skipped');
