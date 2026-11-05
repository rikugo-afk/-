export function readPublicConfig(env) {
  const mode=env.ORDER_DESK_MODE||'local';
  if(!['local','shared'].includes(mode))throw new Error('ORDER_DESK_MODE must be local or shared');
  if(mode==='local')return {mode};
  const url=env.SUPABASE_URL,key=env.SUPABASE_ANON_KEY;
  if(!url||!key)throw new Error('Shared mode requires SUPABASE_URL and SUPABASE_ANON_KEY');
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/')throw new Error('SUPABASE_URL must be an HTTPS project origin');
  if(!key.startsWith('sb_publishable_')) {
    let payload;try{payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString());}catch{throw new Error('Use the public publishable/anon key, never a secret key');}
    if(payload.role!=='anon')throw new Error('Only the public anon key may be embedded in the website');
  }
  return {mode,url:parsed.origin,key};
}
