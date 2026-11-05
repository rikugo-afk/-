import { owners, permits, parseDateInput, formatDate } from './domain.js';
export const developmentStatuses=['未着手','進行中','確認待ち','完了'];
// Keep the supplied order. Repeated headings have been consolidated into one field.
export const developmentFields=[
  ['status','進捗','status'],['brk','BRK','linked'],['contractDocument','契約書','text'],['payment','入金','payment'],
  ['startDate','着手日','date'],['targetOpenDate','公開目標','date'],['leadTime','リードタイム','computed'],['assignee','開発担当','text'],['salesOwner','営業担当','linked'],
  ['facilityName','施設名','text'],['area','エリア','text'],['address','住所','text'],['map','Googleマップ','url'],['layout','間取','text'],
  ['bedCount','ベッド数','integer'],['kingBeds','K','integer'],['queenBeds','Q','integer'],['doubleBeds','D','integer'],['semiDoubleBeds','SD','integer'],['singleBeds','S','integer'],['sofaBeds','ソ','integer'],['parking','駐車場','text'],
  ['separator','','separator'],['contractHolder','契約名義','text'],['entryMethod','入室方法','text'],['permit','許可証種類','permit'],['renovationType','Reno・New','text'],['renovationCompany','リフォ会社','text'],['bedLayout','ベッド配置','text'],['folderCreated','フォルダ作成','text'],['neighborGreeting','近隣挨拶','text'],['fireDepartment','消防','text'],['lodgingAcceptanceWaiting','民泊受理待','text'],['license','許可','text'],['interiorCoordinator','インテリア（コーディネーター）','text'],['suideco','スイデコ','text'],['supplies','備品','text'],['manual','マニュアル','text'],['infrastructure','インフラ','text'],['keyReceipt','鍵受領書','text'],['cleaning','清掃','text'],['listingCheck','リスティチェック','text'],['photography','撮影','text'],['shootingDate','撮影日','date'],['floorArea','平米数','decimal'],['createdBy','作成担当','text'],['reviewAverage','レビュ平均','decimal'],
  ['developmentSales','開発売上','money'],['purchaseAmount','仕入金額','money'],['linen','リネン','money'],['grossProfit','粗利','computed'],['grossMargin','粗利率','computed'],
  ['firstCleaningRequestedDate','初回清掃希望日','date'],['setupExpectedDate','セッティング完了予想日','date'],['cleaningCoordinator','清掃会社調整担当','text'],['situation','状況','text'],['cleaningCompany','依頼先清掃会社','text'],['cleaningFee','清掃料金（税込）','money'],['initialCleaningFee','初回清掃料金（税込）','money'],['firstCleaningDate','初回清掃日','date'],['kintoneFacilityMap','キントーン/施設マップ','text'],['minpakuLineShared','民泊ライン共有','text'],['specification','仕様書','text'],['dishwasher','食洗機','text'],['bbq','BBQ','text'],['note','備考','textarea'],['watering','散水','text'],['vent','通気口','text'],['snowRemovalTools','除雪道具','text'],['needs2026snowShovel','2026年除雪スコップ購入必要物件（購入10月頃）','text'],['freezeProtection','凍結対策','text'],['schedule','工程表','text'],['osAssignee','OS担当','text'],['bedroomNumber','寝室番号','text'],['diningHanging','ダイニングハンキング','text'],['dryer','乾燥機','text'],['fireCapacity','消防人数','integer'],['estimatedProfit','見積もり粗利','signedMoney'],['managementDeclaration','経営申告書','text'],['salesReport','売上報告','text']
];
export const developmentOptions={status:developmentStatuses,owner:owners,permit:permits,payment:['未入金','入金済']};
const byKey=new Map(developmentFields.map(field=>[field[0],field]));
export const developmentSettingsKey='__order_desk_development_settings__';
export const customDevelopmentTypes=['text','textarea','date','money','integer','decimal'];
const validLabel=label=>typeof label==='string'&&label.trim()!==''&&label.length<=80;
export function developmentColumnConfig(data){
  const stored=data[developmentSettingsKey];
  let config=stored?stored.columnConfig:{columns:developmentFields.filter(field=>!['contractDocument','payment'].includes(field[0])).map(field=>field[0]),labels:{},customFields:[],schemaVersion:3};
  // Upgrade existing column layouts in memory; keep saved entries and custom columns intact.
  if(config&&Array.isArray(config.columns)&&config.labels&&config.schemaVersion!==3){
    config=structuredClone(config);config.schemaVersion=3;
    if(!config.columns.includes('assignee')){const index=config.columns.indexOf('facilityName');config.columns.splice(index<0?config.columns.length:index,0,'assignee');}
    if(!config.columns.includes('salesOwner'))config.columns.splice(config.columns.indexOf('assignee')+1,0,'salesOwner');
    if(config.labels.assignee==='担当')delete config.labels.assignee;
    config.columns=config.columns.filter(key=>!['contractDocument','payment'].includes(key));
  }
  if(!config||!Array.isArray(config.columns)||!Array.isArray(config.customFields)||config.columns.length>500||config.customFields.length>500||!config.labels||typeof config.labels!=='object'||Array.isArray(config.labels))throw new Error('開発項目の設定が正しくありません。');
  const known=new Set(byKey.keys());
  for(const field of config.customFields){
    if(!field||typeof field.key!=='string'||!/^custom_[a-f0-9-]{36}$/.test(field.key)||known.has(field.key)||!validLabel(field.label)||!customDevelopmentTypes.includes(field.type))throw new Error('追加項目の設定が正しくありません。');
    known.add(field.key);
  }
  if(new Set(config.columns).size!==config.columns.length||config.columns.some(key=>!known.has(key)))throw new Error('開発項目が不正または重複しています。');
  for(const [key,label] of Object.entries(config.labels))if(!known.has(key)||!validLabel(label))throw new Error('項目名は1〜80文字で入力してください。');
  const names=config.columns.map(key=>config.labels[key]??byKey.get(key)?.[1]??config.customFields.find(field=>field.key===key)?.label).filter(Boolean);
  if(new Set(names).size!==names.length)throw new Error('同じ名前の項目があります。');
  return config;
}
export function configuredDevelopmentFields(data){
  const config=developmentColumnConfig(data),custom=new Map(config.customFields.map(field=>[field.key,[field.key,field.label,field.type]]));
  return config.columns.map(key=>{const field=byKey.get(key)||custom.get(key);return [key,config.labels[key]??field[1],field[2]];});
}
export function hiddenDevelopmentFields(data){
  const config=developmentColumnConfig(data);
  return [...developmentFields,...config.customFields.map(field=>[field.key,field.label,field.type])].filter(field=>!config.columns.includes(field[0])).map(field=>[field[0],config.labels[field[0]]??field[1],field[2]]);
}
export function changeDevelopmentColumn(data,action,details={}){
  const config=structuredClone(developmentColumnConfig(data));
  if(action==='add'){
    const key='custom_'+crypto.randomUUID();
    config.customFields.push({key,label:String(details.label||'').trim(),type:details.type||'text'});config.columns.push(key);
  }else if(action==='rename'){
    if(!config.columns.includes(details.key)||details.key==='separator')throw new Error('変更する項目が見つかりません。');
    config.labels[details.key]=String(details.label||'').trim();
  }else if(action==='remove')config.columns=config.columns.filter(key=>key!==details.key);
  else if(action==='restore'){
    if(config.columns.includes(details.key))throw new Error('項目はすでに表示されています。');
    config.columns.push(details.key);
  }else throw new Error('項目の変更方法が不明です。');
  const next={...data,[developmentSettingsKey]:{status:'未着手',note:'',columnConfig:config}};
  developmentColumnConfig(next);return next;
}
export function developmentProjects(orders,data,isSigned=row=>row.status==='契約済'){
  const result=orders.filter(row=>isSigned(row)||data[row.id]?.project),ids=new Set(result.map(row=>row.id));
  for(const [id,entry] of Object.entries(data))if(entry.project&&!ids.has(id)){
    result.push({number:'',created:'',contract:'',paymentDate:'',sales:'',cost:'',paid:'',...entry.project,id,sourceOnly:true});ids.add(id);
  }
  return result;
}
export function developmentValue(entry,row,key){
  if(key==='status')return entry.status;
  if(key==='note')return entry.note;
  if(key==='brk')return row.brk||'';
  if(key==='salesOwner')return row.sourceOnly?'':row.owner||'';
  if(key==='leadTime'){
    const start=developmentValue(entry,row,'startDate'),end=developmentValue(entry,row,'targetOpenDate');
    return /^\d{4}-\d{2}-\d{2}$/.test(start)&&/^\d{4}-\d{2}-\d{2}$/.test(end)?(Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000:null;
  }
  if(key==='grossProfit'){
    const sales=developmentValue(entry,row,'developmentSales'),cost=developmentValue(entry,row,'purchaseAmount');
    return sales!==''&&cost!==''&&Number.isFinite(Number(sales))&&Number.isFinite(Number(cost))?Number(sales)-Number(cost):null;
  }
  if(key==='grossMargin'){
    const sales=developmentValue(entry,row,'developmentSales'),profit=developmentValue(entry,row,'grossProfit');
    return Number(sales)>0&&profit!==null?profit/Number(sales)*100:null;
  }
  if(Object.hasOwn(entry.values||{},key))return entry.values[key];
  if(Object.hasOwn(entry.importedText||{},key))return entry.importedText[key];
  const fallback={facilityName:row.name,address:row.address,map:row.map,permit:row.permit,payment:typeof row.paid==='boolean'?(row.paid?'入金済':'未入金'):''};
  return fallback[key]??'';
}
export function parseDevelopmentInput(field,value){
  const [key,,type]=field,text=String(value??'').trim();
  if(['linked','computed','separator'].includes(type))throw new Error('この項目は直接編集できません。');
  if(!text)return '';
  if(type==='date')return parseDateInput(text);
  if(['integer','money','signedMoney','decimal'].includes(type)){
    const n=Number(text.normalize('NFKC').replaceAll(',',''));
    if(!Number.isFinite(n)||Math.abs(n)>Number.MAX_SAFE_INTEGER||(type!=='decimal'&&!Number.isSafeInteger(n))||(type!=='signedMoney'&&n<0))throw new Error(type==='signedMoney'?'整数で入力してください。':'0以上の数値を入力してください。');
    return n;
  }
  if(text.length>10000)throw new Error('入力は10000文字以内にしてください。');
  if(type==='url'){try{if(!['http:','https:'].includes(new URL(text).protocol))throw new Error();}catch{throw new Error('http または https のURLを入力してください。');}}
  if(key==='status'&&!developmentStatuses.includes(text))throw new Error('進捗の選択が正しくありません。');
  return text;
}
export function validateDevelopment(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('開発進捗の形式が不正です。');
  const config=developmentColumnConfig(value),known=new Map([...developmentFields,...config.customFields.map(field=>[field.key,field.label,field.type])].map(field=>[field[0],field]));
  for(const [id,item] of Object.entries(value)){
    if(!item||!developmentStatuses.includes(item.status)||typeof item.note!=='string'||item.note.length>10000)throw new Error('開発進捗の形式が不正です。');
    if(id===developmentSettingsKey)continue;
    if(item.project!==undefined){
      if(!item.project||typeof item.project!=='object'||Array.isArray(item.project)||Object.values(item.project).some(input=>typeof input!=='string'||input.length>10000))throw new Error('開発案件情報の形式が不正です。');
    }
    if(item.importedText!==undefined){if(!item.importedText||typeof item.importedText!=='object'||Array.isArray(item.importedText)||Object.values(item.importedText).some(text=>typeof text!=='string'||text.length>10000))throw new Error('元シートの文字データが不正です。');}
    if(item.values!==undefined){
      if(!item.values||typeof item.values!=='object'||Array.isArray(item.values))throw new Error('開発項目の形式が不正です。');
      for(const [key,input] of Object.entries(item.values)){
        if(input!==''&&typeof input!=='string'&&typeof input!=='number')throw new Error('開発項目の形式が不正です。');
        const field=known.get(key);
        if(field){if(['computed','linked','separator'].includes(field[2]))throw new Error('自動計算・連動項目は保存できません。');const parsed=parseDevelopmentInput(field,input);if(field[2]==='date'&&parsed!==input)throw new Error('保存する日付はYYYY-MM-DD形式にしてください。');}
        else if(String(input).length>10000)throw new Error('開発項目の入力が長すぎます。');
      }
    }
  }
  return value;
}
export function formatDevelopmentValue(field,value){
  if(value==null||value==='')return '';
  const [key,,type]=field;
  if(typeof value==='string'&&value!==''&&['money','signedMoney','integer','decimal','date'].includes(type)&&!(type==='date'?/^\d{4}-\d{2}-\d{2}$/.test(value):Number.isFinite(Number(value))))return value;
  if(type==='date')return formatDate(value);
  if(['money','signedMoney'].includes(type)||key==='grossProfit')return '¥'+Number(value).toLocaleString('ja-JP');
  if(key==='grossMargin')return Number(value).toLocaleString('ja-JP',{maximumFractionDigits:2})+'%';
  if(key==='leadTime')return String(value)+'日';
  return String(value);
}
