// Inspect the public API schema and grants only. Never download or submit case data.
import { readFile } from 'node:fs/promises';
import { readPublicConfig } from '../build-config.js';
process.on('uncaughtException',error=>{console.error(`::error::${String(error.message).replaceAll('\n',' ')}`);process.exitCode=1;});
const defaults=JSON.parse(await readFile(new URL('../public-config.json',import.meta.url),'utf8'));
const config=readPublicConfig(process.env,defaults);
if(config.mode==='shared') {
  let response;
  for(let attempt=0;attempt<3;attempt++){
    try{
      response=await fetch(config.url+'/rest/v1/',{headers:{apikey:config.key,Accept:'application/openapi+json'},signal:AbortSignal.timeout(30000)});
      if(![408,429,502,503,504].includes(response.status)||attempt===2)break;
    }catch(error){if(attempt===2)throw new Error(`Supabase API schema could not be reached (${error.name}: ${error.message})`);}
    await new Promise(resolve=>setTimeout(resolve,5000));
  }
  if(!response?.ok)throw new Error(`Supabase API schema unavailable (HTTP ${response?.status||'unknown'})`);
  const schema=await response.json();
  for(const name of ['order_desk_read','order_desk_save']){
    if(!schema.paths?.['/rpc/'+name]?.post)throw new Error(`Public RPC ${name} is not available to the anonymous role. Run supabase/enable-public-access.sql.`);
  }
  for(const name of ['order_desk_workspace','order_desk_employees']){
    if(schema.paths?.['/'+name])throw new Error(`Direct table access is unexpectedly exposed for ${name}`);
  }
  console.log('PASS: public API metadata exposes both sharing RPCs and keeps direct table access private');
  console.log('PASS: no case data was downloaded or changed by the deployment check');
}else console.log('Local mode: Supabase API schema check skipped');
