// Validate the public connection key only. Case data is accessed in the user's
// browser, never downloaded by GitHub Actions or stored in deployment logs.
import { readFile } from 'node:fs/promises';
import { readPublicConfig } from '../build-config.js';
process.on('uncaughtException',error=>{console.error(`::error::${String(error.message).replaceAll('\n',' ')}`);process.exitCode=1;});
const defaults=JSON.parse(await readFile(new URL('../public-config.json',import.meta.url),'utf8'));
const config=readPublicConfig(process.env,defaults);
if(config.mode==='shared') {
  let response;
  for(let attempt=0;attempt<3;attempt++){
    try{
      response=await fetch(config.url+'/auth/v1/settings',{headers:{apikey:config.key},signal:AbortSignal.timeout(30000)});
      if(![408,429,502,503,504].includes(response.status)||attempt===2)break;
    }catch(error){if(attempt===2)throw new Error(`Supabase public connection could not be reached (${error.name}: ${error.message})`);}
    await new Promise(resolve=>setTimeout(resolve,5000));
  }
  if(!response?.ok)throw new Error(`Supabase public connection unavailable (HTTP ${response?.status||'unknown'})`);
  await response.body?.cancel();
  console.log('PASS: configured Supabase public key accepted');
  console.log('PASS: deployment check did not read or change any case data');
}else console.log('Local mode: Supabase public connection check skipped');
