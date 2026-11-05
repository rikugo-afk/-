import { createClient } from '@supabase/supabase-js';
import { validateSharedPayload, storageFromPayload, legacyPayload } from './shared-state.js';
const config=typeof __ORDER_DESK_CONFIG__==='undefined'?{mode:'local'}:__ORDER_DESK_CONFIG__;
const $=id=>document.getElementById(id);
function downloadBackup(payload){const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='order-desk-local-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export async function openWorkspace(){
  if(config.mode!=='shared')return {shared:false,storage:window.localStorage};
  $('application').hidden=true;$('connection-screen').hidden=false;
  const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  let saving=false,revision=null,ready=false,accessBusy=false,changeHandler=()=>{};
  const errorText=error=>String(error?.message||'接続できませんでした。');
  const message=text=>$('connection-message').textContent=text;
  let resolveWorkspace;const workspaceReady=new Promise(resolve=>resolveWorkspace=resolve);
  const workspace={shared:true,storage:null,
    onRemoteChange(handler){changeHandler=handler;},
    async commit(payload){
      if(saving)throw new Error('保存処理中です。');saving=true;$('shared-state').textContent='共有データを保存中…';
      try{
        validateSharedPayload(payload);
        const conflict=()=>{changeHandler('conflict');return new Error('ほかの利用者が更新しました。未保存の内容を退避し、最新データを読み込んでください。');};
        const fresh=await client.rpc('order_desk_read').abortSignal(AbortSignal.timeout(20000));
        if(fresh.error)throw fresh.error;
        if(fresh.data.revision!==revision)throw conflict();
        const {data,error}=await client.rpc('order_desk_save',{expected_revision:revision,next_payload:payload}).abortSignal(AbortSignal.timeout(20000));
        if(error&&!error.message?.includes('VERSION_CONFLICT')){
          const latest=await client.rpc('order_desk_read').abortSignal(AbortSignal.timeout(8000));
          if(!latest.error&&latest.data.revision!==revision)throw conflict();
        }
        if(error){if(error.message?.includes('VERSION_CONFLICT')){changeHandler('conflict');throw new Error('ほかの利用者が更新しました。未保存の内容を退避し、最新データを読み込んでください。');}throw error;}
        const clean=validateSharedPayload(data.payload);revision=data.revision;
        $('shared-state').textContent='共有データに保存済み';return clean;
      }catch(error){$('shared-state').textContent='保存できませんでした。変更は画面に保持しています';throw error;}finally{saving=false;}
    }
  };
  function showLegacyImport(latest){
    try {
      const legacy=legacyPayload(window.localStorage);
      const hasLegacy=legacy.orders.length||Object.keys(legacy.development).length||legacy.drafts.some(row=>Object.entries(row).some(([key,value])=>!['id','number','brk'].includes(key)&&value!==''&&value!=null));
      if(!hasLegacy)return;
      $('legacy-data-notice').hidden=false;
      $('import-local-data').disabled=latest.orders.length>0||latest.drafts.length>0||Object.keys(latest.development).length>0;
      $('local-data-backup').onclick=()=>downloadBackup(legacy);
      $('import-local-data').onclick=async()=>{
        if($('edit-table').getAttribute('aria-pressed')==='true'){$('shared-state').textContent='編集中です。先に保存してから移行してください。';return;}
        if(!confirm('このブラウザーの以前の案件・下書き・開発進捗を共有DBへ移行しますか？元のデータは削除しません。'))return;
        $('import-local-data').disabled=true;
        try{await workspace.commit(legacy);location.reload();}
        catch(error){$('shared-state').textContent=errorText(error);$('import-local-data').disabled=false;}
      };
    }catch{$('shared-state').textContent='ローカルデータを読み込めません。元のデータは変更していません。';}
  }
  async function connect(){
    if(accessBusy||ready)return;
    if(workspace.storage){location.reload();return;}
    accessBusy=true;$('retry-connection').disabled=true;message('共有データに接続しています…');
    try{
      const {data,error}=await client.rpc('order_desk_read');if(error)throw error;
      const latest=validateSharedPayload(data.payload);revision=data.revision;workspace.storage=storageFromPayload(latest,window.localStorage);
      $('account-bar').hidden=false;$('connection-screen').hidden=true;$('application').hidden=false;
      $('storage-mode').textContent='URL共有モード';$('storage-description').textContent='URLを開いた人が同じ案件を閲覧・編集・削除できます。保存した内容を共有し、ほかの利用者の更新を定期的に確認します。';
      $('shared-state').textContent='共有データに接続済み';ready=true;
      showLegacyImport(latest);resolveWorkspace(workspace);
    }catch(error){message(error.code==='42501'?'共有データのアクセス設定がまだ完了していません。設定担当者に確認してください。':'共有データに接続できませんでした。通信を確認して、もう一度接続してください。');}
    finally{accessBusy=false;$('retry-connection').disabled=false;}
  }
  $('retry-connection').addEventListener('click',connect);
  async function pollRemote(){
    if(!ready||saving||document.hidden)return;
    try{
      const {data,error}=await client.rpc('order_desk_read');
      if(error){
        if(error.code==='42501'){ready=false;$('application').hidden=true;$('connection-screen').hidden=false;message('共有データのアクセス設定が変更されました。設定担当者に確認してください。');}
        else $('shared-state').textContent='共有データに接続できません。通信を確認してください';
        return;
      }
      if(data.revision!==revision)changeHandler('changed');
    }catch{$('shared-state').textContent='共有データに接続できません。通信を確認してください';}
  }
  setInterval(pollRemote,15000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)pollRemote();});
  await connect();
  return workspaceReady;
}
