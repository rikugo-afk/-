import { validateDevelopment, developmentSettingsKey } from './development-domain.js';
import { validateRows, normalizeSalesNumbers, allocateBrkNumbers } from './domain.js';
export const sharedKeys = { orders:'order-desk:v1', drafts:'order-desk:draft:v1', development:'order-desk:development:v1', salesSerial:'order-desk:last-number', brkSerial:'order-desk:last-brk' };
export function validateSharedPayload(payload) {
  if(!payload || !Array.isArray(payload.orders) || !Array.isArray(payload.drafts) || payload.drafts.length>1000)throw new Error('共有データの形式が正しくありません。');
  const orders=validateRows(payload.orders), ids=new Set(),numbers=new Set(),brks=new Set();
  const drafts=payload.drafts.map(row=>{
    if(!row||typeof row!=='object')throw new Error('下書きの形式が正しくありません。');
    const clean=validateRows([{...row,name:row.name||'下書き',status:row.status||'面談取り付け'}])[0];
    return {...clean,name:row.name?clean.name:'',status:row.status?clean.status:''};
  });
  for(const row of [...orders,...drafts]){
    if(row.id===developmentSettingsKey)throw new Error('案件IDに内部設定の名前は使用できません。');
    if(row.id.length>200 || ids.has(row.id) || !/^[1-9]\d*$/.test(row.number) || !Number.isSafeInteger(Number(row.number)) || numbers.has(row.number))throw new Error('共有データの行IDまたは営業No.が不正です。');
    if(/^\d+$/.test(row.brk)){if(!Number.isSafeInteger(Number(row.brk))||brks.has(row.brk))throw new Error('BRKが不正または重複しています。');brks.add(row.brk);}
    ids.add(row.id);numbers.add(row.number);
  }
  validateDevelopment(payload.development);
  if(!Number.isSafeInteger(payload.salesSerial)||payload.salesSerial<0||!Number.isSafeInteger(payload.brkSerial)||payload.brkSerial<799)throw new Error('採番履歴が正しくありません。');
  return {orders,drafts,development:payload.development,salesSerial:payload.salesSerial,brkSerial:payload.brkSerial};
}
export function storageFromPayload(payload, preferences) {
  const memory=new Map(Object.entries(sharedKeys).map(([field,key])=>[key,JSON.stringify(payload[field])]));
  return { getItem:key=>memory.has(key)?memory.get(key):preferences.getItem(key),setItem:(key,value)=>{if(memory.has(key))memory.set(key,String(value));else preferences.setItem(key,String(value));},removeItem:key=>{if(memory.has(key))memory.set(key,null);else preferences.removeItem(key);}};
}
export function legacyPayload(storage) {
  const read=(key,fallback)=>JSON.parse(storage.getItem(key)||JSON.stringify(fallback));
  const orders=validateRows(read(sharedKeys.orders,[])),raw=read(sharedKeys.drafts,[]);
  const drafts=(Array.isArray(raw)?raw:raw?[raw]:[]).filter(row=>!orders.some(order=>order.id===row?.id));
  const previousSerial=Number(read(sharedKeys.salesSerial,0))||0;
  const normalized=normalizeSalesNumbers([...orders,...drafts],previousSerial);
  const allocation=allocateBrkNumbers(normalized,Number(read(sharedKeys.brkSerial,799))||799);
  const payload={orders:allocation.rows.slice(0,orders.length),drafts:allocation.rows.slice(orders.length),development:read(sharedKeys.development,{}),salesSerial:Math.max(previousSerial,...allocation.rows.map(r=>Number(r.number))),brkSerial:allocation.last};
  return validateSharedPayload(payload);
}
