import test from 'node:test';
import assert from 'node:assert/strict';
import { developmentFields,developmentValue,parseDevelopmentInput,validateDevelopment,formatDevelopmentValue } from '../development-domain.js';
import {validateSharedPayload} from '../shared-state.js';
const field=key=>developmentFields.find(f=>f[0]===key);
const row={id:'signed',number:'1',brk:'800',status:'契約済',name:'施設A',owner:'藤田',address:'札幌市',map:'https://maps.google.com/',permit:'民泊',sales:100,cost:10,paid:false};
test('指定順で重複列をまとめ、空欄の区切りを保持する',()=>{
  assert.equal(developmentFields.length,79);
  const labels=developmentFields.map(f=>f[1]);for(const key of ['ベッド数','ベッド配置','入金','平米数'])assert.equal(labels.filter(v=>v===key).length,1);
  assert.deepEqual(labels.slice(0,8),['進捗','BRK','契約書','入金','着手日','公開目標','リードタイム','担当']);
  assert.deepEqual(labels.slice(-3),['見積もり粗利','経営申告書','売上報告']);
  assert.equal(new Set(developmentFields.map(f=>f[0])).size,developmentFields.length);
});
test('既存の進捗・備考を保持し、案件情報を初期表示して個別の空欄上書きも保存',()=>{
  const old={status:'進行中',note:'以前のメモ'};assert.deepEqual(validateDevelopment({signed:old}),{signed:old});
  for(const [key,value] of [['brk','800'],['facilityName','施設A'],['assignee','藤田'],['permit','民泊'],['payment','未入金']])assert.equal(developmentValue(old,row,key),value);
  assert.equal(developmentValue({...old,values:{facilityName:'別の施設名',address:''}},row,'facilityName'),'別の施設名');
  assert.equal(developmentValue({...old,values:{address:''}},row,'address'),'');assert.equal(row.name,'施設A');
});
test('粗利は売上−仕入のみ、リネンを二重に引かず、粗利率は売上0・空欄を区別する',()=>{
  const entry={status:'未着手',note:'',values:{developmentSales:1000000,purchaseAmount:600000,linen:50000}};
  assert.equal(developmentValue(entry,row,'grossProfit'),400000);assert.equal(developmentValue(entry,row,'grossMargin'),40);
  assert.equal(developmentValue({...entry,values:{developmentSales:0,purchaseAmount:100}},row,'grossProfit'),-100);
  assert.equal(developmentValue({...entry,values:{developmentSales:0,purchaseAmount:100}},row,'grossMargin'),null);
  assert.equal(developmentValue({...entry,values:{developmentSales:100,purchaseAmount:''}},row,'grossProfit'),null);
  assert.equal(developmentValue({...entry,values:{developmentSales:100,purchaseAmount:0}},row,'grossProfit'),100);
});
test('リードタイムは着手日から公開目標までの暦日差、日付は8桁で入力',()=>{
  const entry={status:'未着手',note:'',values:{startDate:'2026-11-05',targetOpenDate:'2026-11-15'}};
  assert.equal(developmentValue(entry,row,'leadTime'),10);assert.equal(developmentValue({...entry,values:{startDate:'2026-11-05'}},row,'leadTime'),null);
  assert.equal(parseDevelopmentInput(field('startDate'),'20261105'),'2026-11-05');assert.equal(formatDevelopmentValue(field('startDate'),'2026-11-05'),'2026年11月5日');
  assert.throws(()=>parseDevelopmentInput(field('shootingDate'),'20260230'));
});
test('金額・面積・件数の空欄と0を保持し、不正な値やリンクを拒否',()=>{
  assert.equal(parseDevelopmentInput(field('developmentSales'),''),'');assert.equal(parseDevelopmentInput(field('developmentSales'),'0'),0);
  assert.equal(parseDevelopmentInput(field('developmentSales'),'１,０００'),1000);assert.equal(parseDevelopmentInput(field('floorArea'),'34.5'),34.5);
  assert.equal(parseDevelopmentInput(field('estimatedProfit'),'-100'),-100);
  for(const [key,value] of [['bedCount','1.5'],['purchaseAmount','-1'],['map','javascript:alert(1)'],['grossProfit','100']])assert.throws(()=>parseDevelopmentInput(field(key),value));
  assert.throws(()=>validateDevelopment({a:{status:'未着手',note:'',values:{bedCount:2.5}}}));
});
test('全入力項目は共有スナップショットとJSON復元を通って保持される',()=>{
  const values={};for(const f of developmentFields)if(!['status','note','linked','computed','separator'].includes(f[0])&&!['linked','computed','separator'].includes(f[2]))values[f[0]]=f[2]==='date'?'2026-11-05':f[2]==='url'?'https://example.com':(['money','signedMoney','integer','decimal'].includes(f[2])?0:'入力済み');
  const entry={status:'完了',note:'元の備考',values};
  const payload={orders:[row],drafts:[],development:{signed:entry},salesSerial:1,brkSerial:800};
  assert.deepEqual(validateSharedPayload(JSON.parse(JSON.stringify(payload))).development.signed,entry);
});

test('項目の追加・手入力の名前変更・削除・復元を全員で共有し、値を失わない',async()=>{
  const {changeDevelopmentColumn,configuredDevelopmentFields,hiddenDevelopmentFields,developmentSettingsKey}=await import('../development-domain.js');
  let data=changeDevelopmentColumn({},'add',{label:'追加の確認日',type:'date'});
  const custom=configuredDevelopmentFields(data).at(-1);assert.equal(custom[1],'追加の確認日');
  data.signed={status:'未着手',note:'',values:{[custom[0]]:'2026-11-05',facilityName:'保持する施設名'}};
  data=changeDevelopmentColumn(data,'rename',{key:custom[0],label:'確認日'});
  assert.equal(configuredDevelopmentFields(data).at(-1)[1],'確認日');
  data=changeDevelopmentColumn(data,'remove',{key:custom[0]});assert.ok(hiddenDevelopmentFields(data).some(f=>f[0]===custom[0]));assert.equal(data.signed.values[custom[0]],'2026-11-05');
  data=changeDevelopmentColumn(data,'restore',{key:custom[0]});assert.equal(configuredDevelopmentFields(data).at(-1)[1],'確認日');assert.equal(data.signed.values[custom[0]],'2026-11-05');
  assert.ok(validateDevelopment(JSON.parse(JSON.stringify(data)))[developmentSettingsKey]);
  assert.throws(()=>changeDevelopmentColumn(data,'add',{label:'確認日',type:'text'}));assert.throws(()=>changeDevelopmentColumn(data,'rename',{key:custom[0],label:''}));
});
