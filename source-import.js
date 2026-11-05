import { validateRows, allocateBrkNumbers } from './domain.js';
import { validateDevelopment, developmentSettingsKey } from './development-domain.js';
export const sourceImportKind='order-desk-source-import-v1';
const copy=value=>JSON.parse(JSON.stringify(value));
const nonempty=value=>value!==''&&value!==null&&value!==undefined;
export function mergeSourceImport(current,bundle){
  if(bundle?.kind!==sourceImportKind||!bundle.payload)throw new Error('元データ取り込みファイルの形式が正しくありません。');
  const source=copy(bundle.payload);validateRows(source.orders);validateDevelopment(source.development);
  const result=copy(current);
  if(!result.orders.length&&result.salesSerial<=1&&result.drafts.every(row=>Object.entries(row).every(([key,value])=>['id','number','brk'].includes(key)||!nonempty(value))))result.drafts=[];
  const ids=new Set([...result.orders,...result.drafts].map(row=>row.id)),numbers=new Set([...result.orders,...result.drafts].map(row=>row.number));
  const idMap=new Map(),report={addedOrders:0,updatedOrders:0,addedDrafts:0,addedDevelopment:0,updatedDevelopment:0};
  let serial=Math.max(result.salesSerial||0,source.salesSerial||0,...[...result.orders,...result.drafts].map(row=>Number(row.number)||0));
  const brkMatches=brk=>brk?result.orders.filter(row=>row.brk===brk):[];
  for(const incoming of source.orders){
    const matches=brkMatches(incoming.brk);if(matches.length>1)throw new Error('既存データのBRKが重複しています。取り込みを停止しました。');
    const existing=matches[0]||result.orders.find(row=>row.id===incoming.id);
    if(existing){
      const update={...existing};for(const [key,value] of Object.entries(incoming))if(!['id','number'].includes(key)&&nonempty(value))update[key]=value;
      result.orders=result.orders.map(row=>row.id===existing.id?update:row);idMap.set(incoming.id,existing.id);report.updatedOrders++;
    }else{
      const row={...incoming};if(ids.has(row.id))throw new Error('取り込む案件IDが重複しています。');
      if(!/^[1-9]\d*$/.test(row.number)||numbers.has(row.number)){serial++;row.number=String(serial);}
      numbers.add(row.number);ids.add(row.id);result.orders.push(row);idMap.set(incoming.id,row.id);report.addedOrders++;
    }
  }
  for(const incoming of source.drafts||[]){
    const existingOrder=result.orders.find(row=>row.id===incoming.id);
    if(existingOrder){idMap.set(incoming.id,existingOrder.id);continue;}
    const old=result.drafts.find(row=>row.id===incoming.id);
    if(old){result.drafts=result.drafts.map(row=>row.id===old.id?{...row,...Object.fromEntries(Object.entries(incoming).filter(([key,value])=>!['number','id'].includes(key)&&nonempty(value)))}:row);idMap.set(incoming.id,old.id);continue;}
    const row={...incoming};if(ids.has(row.id))throw new Error('下書きのIDが重複しています。');
    if(!/^[1-9]\d*$/.test(row.number)||numbers.has(row.number)){serial++;row.number=String(serial);}
    numbers.add(row.number);ids.add(row.id);result.drafts.push(row);idMap.set(incoming.id,row.id);report.addedDrafts++;
  }
  for(const [sourceId,item] of Object.entries(source.development)){
    if(sourceId===developmentSettingsKey)continue;
    let targetId=idMap.get(sourceId)||sourceId;
    if(item.project?.brk){
      const matches=brkMatches(item.project.brk);if(matches.length>1)throw new Error('BRKの対応が複数あるため、開発案件を取り込めません。');
      if(matches.length)targetId=matches[0].id;
      else{const old=Object.entries(result.development).filter(([,entry])=>entry.project?.brk===item.project.brk);if(old.length>1)throw new Error('開発案件のBRKが重複しています。');if(old.length)targetId=old[0][0];}
    }
    const previous=result.development[targetId],next={...(previous||{status:'未着手',note:''}),...item};
    next.status=item.developmentSource?.cells?.[0]?.trim()?item.status:(previous?.status||item.status);
    next.note=item.note||previous?.note||'';
    next.values={...previous?.values,...Object.fromEntries(Object.entries(item.values||{}).filter(([,value])=>nonempty(value)))};
    next.importedText={...previous?.importedText,...item.importedText};
    result.development[targetId]=next;
    if(item.project){if(previous?.project)report.updatedDevelopment++;else report.addedDevelopment++;}
  }
  result.salesSerial=Math.max(serial,...result.orders.map(row=>Number(row.number)||0));
  result.brkSerial=Math.max(result.brkSerial||799,source.brkSerial||799,...Object.values(result.development).map(entry=>/^\d+$/.test(entry.project?.brk||'')?Number(entry.project.brk):0));
  const allocation=allocateBrkNumbers([...result.orders,...result.drafts],result.brkSerial);
  result.orders=allocation.rows.slice(0,result.orders.length);result.drafts=allocation.rows.slice(result.orders.length);result.brkSerial=allocation.last;
  validateRows(result.orders);validateDevelopment(result.development);
  return {payload:result,report};
}
