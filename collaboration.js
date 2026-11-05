import { createClient } from '@supabase/supabase-js';
import { validateSharedPayload, storageFromPayload, legacyPayload } from './shared-state.js';
const config=typeof __ORDER_DESK_CONFIG__==='undefined'?{mode:'local'}:__ORDER_DESK_CONFIG__;
const $=id=>document.getElementById(id);
function downloadBackup(payload){const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='order-desk-local-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export async function openWorkspace(){
  if(config.mode!=='shared')return {shared:false,storage:window.localStorage};
  $('application').hidden=true;$('auth-screen').hidden=false;$('auth-message').textContent='ログイン状態を確認しています…';
  const linkType=new URLSearchParams(location.hash.slice(1)).get('type');
  const client=createClient(config.url,config.key,{auth:{storage:window.sessionStorage,storageKey:'order-desk:employee-session',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  let saving=false,revision=null,ready=false,recovery=['recovery','invite'].includes(linkType),accessBusy=false,changeHandler=()=>{},latest=null;
  const errorText=error=>String(error?.message||'接続できませんでした。');
  const message=text=>$('auth-message').textContent=text;
  let resolveWorkspace;const workspaceReady=new Promise(resolve=>resolveWorkspace=resolve);
  const workspace={shared:true,storage:null,user:null,
    onRemoteChange(handler){changeHandler=handler;},
    async commit(payload){
      if(saving)throw new Error('保存処理中です。');saving=true;$('shared-state').textContent='共有DBへ保存中…';
      try{
        validateSharedPayload(payload);
        const {data,error}=await client.rpc('order_desk_save',{expected_revision:revision,next_payload:payload});
        if(error){if(error.message?.includes('VERSION_CONFLICT')){changeHandler('conflict');throw new Error('他の社員が更新しました。未保存の内容を退避し、最新データを読み込んでください。');}throw error;}
        const clean=validateSharedPayload(data.payload);revision=data.revision;latest=clean;
        $('shared-state').textContent='共有DBに保存済み';return clean;
      }catch(error){$('shared-state').textContent='保存できませんでした。変更は画面に保持しています';throw error;}finally{saving=false;}
    }
  };
  async function authorize(){
    if(accessBusy||ready||recovery)return;accessBusy=true;
    // After access was revoked, reload before reopening a workspace already in memory.
    if(workspace.storage){location.reload();return;}
    try{
      const {data:{session}}=await client.auth.getSession();
      if(!session){message('社員用メールアドレスとパスワードでログインしてください。');return;}
      const {data:{user},error:userError}=await client.auth.getUser();if(userError)throw userError;
      const {data,error}=await client.rpc('order_desk_read');
      if(error){if(error.code==='42501'||error.message?.includes('EMPLOYEE_ACCESS_REQUIRED'))throw new Error('社員登録がないか、利用が停止されています。管理者に確認してください。');throw error;}
      if(recovery)return;
      latest=validateSharedPayload(data.payload);revision=data.revision;workspace.user=user;workspace.storage=storageFromPayload(latest,window.localStorage);
      $('employee-email').textContent=user.email||'社員';$('account-bar').hidden=false;$('auth-screen').hidden=true;$('application').hidden=false;
      $('storage-mode').textContent='社員共有モード';$('storage-description').textContent='案件・下書き・開発進捗は社員共有DBに保存します。他の社員の更新は定期的に確認します。';
      $('shared-state').textContent='共有DBに接続済み';ready=true;
      try {
        const legacy=legacyPayload(window.localStorage);
        const hasLegacy=legacy.orders.length||Object.keys(legacy.development).length||legacy.drafts.some(row=>Object.entries(row).some(([key,value])=>!['id','number','brk'].includes(key)&&value!==''&&value!=null));
        if(hasLegacy){
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
        }
      }
      catch{$('shared-state').textContent='ローカルデータを読み込めません。元のデータは変更していません。';}
      resolveWorkspace(workspace);
    }catch(error){message(errorText(error));}finally{accessBusy=false;}
  }
  client.auth.onAuthStateChange((event)=>{
    if(event==='PASSWORD_RECOVERY'){recovery=true;$('auth-screen').hidden=false;$('application').hidden=true;$('password-setup').hidden=false;$('login-form').hidden=true;message('新しいパスワードを設定してください。');}
    else if(event==='SIGNED_OUT'&&ready){$('application').hidden=true;location.reload();}
    else queueMicrotask(authorize);
  });
  $('login-form').addEventListener('submit',async event=>{
    event.preventDefault();$('login-submit').disabled=true;message('ログインしています…');
    try{const {error}=await client.auth.signInWithPassword({email:$('login-email').value.trim(),password:$('login-password').value});if(error)throw new Error('ログインできません。メールアドレスとパスワードを確認してください。');$('login-password').value='';await authorize();}catch(error){message(errorText(error));}finally{$('login-submit').disabled=false;}
  });
  $('reset-password').addEventListener('click',async()=>{
    const email=$('login-email').value.trim();if(!email){message('メールアドレスを入力してください。');$('login-email').focus();return;}
    $('reset-password').disabled=true;try{const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});if(error)throw error;message('登録されている場合は、パスワード設定用メールが届きます。');}catch{message('メールを送信できませんでした。管理者に確認してください。');}finally{$('reset-password').disabled=false;}
  });
  $('password-setup').addEventListener('submit',async event=>{event.preventDefault();$('password-submit').disabled=true;try{const {error}=await client.auth.updateUser({password:$('new-password').value});if(error)throw error;$('new-password').value='';recovery=false;$('password-setup').hidden=true;$('login-form').hidden=false;if(ready){$('auth-screen').hidden=true;$('application').hidden=false;}else await authorize();}catch(error){message(errorText(error));}finally{$('password-submit').disabled=false;}});
  $('sign-out').addEventListener('click',async()=>{if(!confirm('ログアウトしますか？未保存の変更がある場合は先に保存してください。'))return;try{const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;location.reload();}catch{$('shared-state').textContent='ログアウトできませんでした。通信を確認して再度お試しください。';}});
  $('change-password').addEventListener('click',()=>{recovery=true;$('application').hidden=true;$('auth-screen').hidden=false;$('login-form').hidden=true;$('password-setup').hidden=false;message('新しいパスワードを設定してください。');});
  $('cancel-password').addEventListener('click',()=>{recovery=false;$('new-password').value='';$('password-setup').hidden=true;$('login-form').hidden=false;if(ready){$('auth-screen').hidden=true;$('application').hidden=false;}else authorize();});
  $('retry-access').addEventListener('click',authorize);
  if(recovery){$('password-setup').hidden=false;$('login-form').hidden=true;message('新しいパスワードを設定してください。');}else await authorize();
  async function pollRemote(){
    if(!ready||saving||document.hidden)return;
    try{const {data,error}=await client.rpc('order_desk_read');if(error){if(error.code==='42501'){ready=false;$('application').hidden=true;$('auth-screen').hidden=false;message('アクセス権限を確認できません。管理者に確認してください。');}else $('shared-state').textContent='共有DBに接続できません。通信を確認してください';return;}
      if(data.revision!==revision)changeHandler('changed');
    }catch{$('shared-state').textContent='共有DBに接続できません。通信を確認してください';}
  }
  setInterval(pollRemote,15000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)pollRemote();});
  return workspaceReady;
}
