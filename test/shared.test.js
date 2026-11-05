import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { readPublicConfig } from '../build-config.js';
import { validateSharedPayload,storageFromPayload,legacyPayload } from '../shared-state.js';
const payload=()=>({orders:[{id:'a',number:'1',name:'案件',status:'契約交渉中',sales:100,cost:10,paid:false}],drafts:[{id:'b',number:'2',name:'',status:'',sales:'',cost:'',paid:''}],development:{},salesSerial:2,brkSerial:799});
test('共有モードでは接続不足・管理用キーをビルドに混入させない',()=>{
  assert.deepEqual(readPublicConfig({}),{mode:'local'});
  assert.throws(()=>readPublicConfig({ORDER_DESK_MODE:'shared'}));
  for(const role of ['service_role','authenticated'])assert.throws(()=>readPublicConfig({ORDER_DESK_MODE:'shared',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'a.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.c'}));
  assert.throws(()=>readPublicConfig({ORDER_DESK_MODE:'shared',SUPABASE_URL:'http://example.com',SUPABASE_ANON_KEY:'sb_publishable_test'}));
  assert.equal(readPublicConfig({ORDER_DESK_MODE:'shared',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'sb_publishable_test'}).mode,'shared');
});
test('共有データをブラウザーの既存データに混在させず、移行は番号を正規化',()=>{
  const real=new Map([['order-desk:v1',JSON.stringify([{id:'legacy',number:'S-010',name:'旧案件',status:'契約締結予定',sales:'',cost:'',paid:''}])]]);
  const storage={getItem:k=>real.get(k)??null,setItem:(k,v)=>real.set(k,v),removeItem:k=>real.delete(k)};
  const shared=storageFromPayload(payload(),storage);shared.setItem('order-desk:v1','[]');assert.notEqual(storage.getItem('order-desk:v1'),'[]');shared.setItem('order-desk:report:v1','{}');assert.equal(storage.getItem('order-desk:report:v1'),'{}');
  const migrated=legacyPayload(storage);assert.equal(migrated.orders[0].number,'10');assert.equal(migrated.orders[0].brk,'800');assert.match(storage.getItem('order-desk:v1'),/S-010/);
  assert.throws(()=>validateSharedPayload({...payload(),drafts:[{...payload().drafts[0],number:'1'}]}));
  storage.setItem('order-desk:last-number','100');assert.equal(legacyPayload(storage).salesSerial,100);
  assert.throws(()=>validateSharedPayload({...payload(),orders:[{...payload().orders[0],number:'S-001'}]}));
  assert.throws(()=>validateSharedPayload({...payload(),drafts:[{...payload().drafts[0],number:'9007199254740992'}]}));
  assert.throws(()=>validateSharedPayload({...payload(),orders:[{...payload().orders[0],brk:'800'}],drafts:[{...payload().drafts[0],brk:'800'}]}));
});
test('実際のPostgresで社員権限・匿名拒否・同時更新防止・採番保護を検証',async t=>{
  const db=new PGlite();
  const member='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002',disabled='00000000-0000-0000-0000-000000000003';
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;insert into auth.users values('${member}'),('${other}'),('${disabled}');grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
    await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
    await db.query('insert into public.order_desk_employees(user_id,enabled) values($1,true),($2,false)',[member,disabled]);
    const actor=async(role,id='')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);};
    await t.test('匿名・未登録社員・利用停止社員には共有データを渡さない',async()=>{
      await actor('anon');await assert.rejects(db.query('select public.order_desk_read()'),/permission denied/);
      for(const id of ['',other,disabled]){await actor('authenticated',id);await assert.rejects(db.query('select public.order_desk_read()'),/EMPLOYEE_ACCESS_REQUIRED/);}
    });
    await actor('authenticated',member);
    await t.test('社員でも表へ直接アクセスできず、RPCのみ許可',async()=>{
      await assert.rejects(db.query('select * from public.order_desk_workspace'),/permission denied/);await assert.rejects(db.query('select * from public.order_desk_employees'),/permission denied/);
      const result=await db.query('select public.order_desk_read() as state');assert.equal(result.rows[0].state.revision,0);
    });
    await t.test('一括保存し、古い版と版未指定による上書きを拒否',async()=>{
      const saved=await db.query('select public.order_desk_save($1,$2::jsonb) as state',[0,JSON.stringify(payload())]);assert.equal(saved.rows[0].state.revision,1);
      await assert.rejects(db.query('select public.order_desk_save($1,$2::jsonb)',[0,JSON.stringify(payload())]),/VERSION_CONFLICT/);
      await assert.rejects(db.query('select public.order_desk_save(null,$1::jsonb)',[JSON.stringify(payload())]),/VERSION_CONFLICT/);
    });
    await t.test('不正なID・重複番号は一切反映しない',async()=>{
      for(const bad of [{...payload(),drafts:[{id:'a',number:'2'}]},{...payload(),drafts:[{id:'b',number:'1'}]},{...payload(),orders:[{...payload().orders[0],brk:'800'},{...payload().orders[0],id:'y',number:'2',brk:'800'}],drafts:[]}])await assert.rejects(db.query('select public.order_desk_save(1,$1::jsonb)',[JSON.stringify(bad)]),/DUPLICATE/);
      const unchanged=await db.query('select public.order_desk_read() as state');assert.equal(unchanged.rows[0].state.revision,1);
    });
    await t.test('APIへの直接送信でも不正な金額・日付・項目・開発進捗を保存しない',async()=>{
      for(const patch of [{sales:-1},{cost:1.2},{status:'不明'},{paid:'true'},{created:'2026-02-30'},{folder:'javascript:alert(1)'},{name:''},{note:{bad:true}}])await assert.rejects(db.query('select public.order_desk_save(1,$1::jsonb)',[JSON.stringify({...payload(),orders:[{...payload().orders[0],...patch}]})]));
      await assert.rejects(db.query('select public.order_desk_save(1,$1::jsonb)',[JSON.stringify({...payload(),development:{a:{status:'不明',note:''}}})]),/INVALID_DEVELOPMENT/);
      const unchanged=await db.query('select public.order_desk_read() as state');assert.equal(unchanged.rows[0].state.revision,1);
    });
    await t.test('番号履歴は取り消しや削除で巻き戻さない',async()=>{
      await db.query('select public.order_desk_save(1,$1::jsonb)',[JSON.stringify({...payload(),salesSerial:50,brkSerial:850})]);
      const result=await db.query('select public.order_desk_save(2,$1::jsonb) as state',[JSON.stringify(payload())]);assert.equal(result.rows[0].state.payload.salesSerial,50);assert.equal(result.rows[0].state.payload.brkSerial,850);
    });
    await t.test('利用停止は既存セッションにも適用',async()=>{
      await db.exec('reset role');await db.query('update public.order_desk_employees set enabled=false where user_id=$1',[member]);await actor('authenticated',member);await assert.rejects(db.query('select public.order_desk_read()'),/EMPLOYEE_ACCESS_REQUIRED/);await assert.rejects(db.query('select public.order_desk_save(3,$1::jsonb)',[JSON.stringify(payload())]),/EMPLOYEE_ACCESS_REQUIRED/);
    });
  }finally{await db.close();}
});
