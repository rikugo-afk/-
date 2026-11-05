import test from 'node:test';import assert from 'node:assert/strict';
import {mergeSourceImport,sourceImportKind} from '../source-import.js';
import {changeDevelopmentColumn,configuredDevelopmentFields,developmentProjects,developmentValue} from '../development-domain.js';
import {validateSharedPayload} from '../shared-state.js';
const order=(id,number,brk,name)=>({id,number,brk,name,status:'契約済',owner:'藤田',sales:'',cost:'',paid:''});
const empty=()=>({orders:[],drafts:[],development:{},salesSerial:0,brkSerial:799});
const source=()=>({kind:sourceImportKind,payload:{orders:[order('source-a','1','800','元シートの案件'),order('source-b','2','801','新しい案件')],drafts:[],development:{'source-a':{status:'進行中',note:'元のメモ',values:{facilityName:'施設A'},project:{brk:'800',name:'施設A'},developmentSource:{cells:['進']}},'source-only':{status:'未着手',note:'',values:{facilityName:'旧年度の施設'},project:{brk:'700',name:'旧年度の施設'},developmentSource:{cells:['未']}}},salesSerial:2,brkSerial:801}});
test('BRKで既存案件を更新し、別案件・下書き・番号・追加列を保持する',()=>{
 const current={...empty(),orders:[order('existing','5','800','既存名'),{...order('unrelated','2','802','残す案件'),status:'面談取り付け'}],drafts:[{id:'draft',number:'6',name:'',status:'',sales:'',cost:'',paid:''}],development:changeDevelopmentColumn({existing:{status:'確認待ち',note:'残す備考',values:{area:'残すエリア'}}},'add',{label:'社内の追加項目',type:'text'}),salesSerial:6,brkSerial:802};
 const {payload,report}=mergeSourceImport(current,source());validateSharedPayload(payload);
 assert.equal(report.addedOrders,1);assert.equal(report.updatedOrders,1);assert.equal(payload.orders.find(row=>row.brk==='800').id,'existing');assert.equal(payload.orders.find(row=>row.brk==='800').number,'5');assert.equal(payload.orders.find(row=>row.brk==='801').number,'7');assert.ok(payload.orders.some(row=>row.id==='unrelated'));assert.equal(payload.drafts[0].number,'6');assert.equal(payload.development.existing.values.area,'残すエリア');assert.equal(payload.development.existing.values.facilityName,'施設A');assert.equal(configuredDevelopmentFields(payload.development).at(-1)[1],'社内の追加項目');
 const repeated=mergeSourceImport(payload,source());assert.equal(repeated.report.addedOrders,0);assert.equal(repeated.report.addedDevelopment,0);assert.equal(repeated.payload.orders.length,payload.orders.length);
});
test('元シートだけの開発施設を、受注案件を捏造せずに表示できる',()=>{
 const {payload}=mergeSourceImport(empty(),source());const projects=developmentProjects(payload.orders,payload.development);
 assert.equal(payload.orders.length,2);assert.equal(projects.length,3);assert.ok(projects.find(row=>row.brk==='700').sourceOnly);assert.equal(projects.find(row=>row.brk==='800').sourceOnly,undefined);
});
test('元データの曖昧な日付・チェック値は文字で保持して計算対象から除外する',()=>{
 const row=order('a','1','800','施設'),entry={status:'未着手',note:'',importedText:{startDate:'10月初旬',developmentSales:'未確認',bedCount:'確認中'},values:{targetOpenDate:'2026-11-01',purchaseAmount:100}};
 validateSharedPayload({...empty(),orders:[row],development:{a:entry},salesSerial:1,brkSerial:800});assert.equal(developmentValue(entry,row,'startDate'),'10月初旬');assert.equal(developmentValue(entry,row,'leadTime'),null);assert.equal(developmentValue(entry,row,'grossProfit'),null);
});
test('最初の未入力テンプレート行は取り込み営業No.を不必要にずらさない',()=>{
 const result=mergeSourceImport({...empty(),drafts:[{id:'initial',number:'1',name:'',status:'',sales:'',cost:'',paid:''}],salesSerial:1},source());assert.equal(result.payload.orders[0].number,'1');
});
test('元シートで入力途中の行は下書きとして保持し、案件化後の再取り込みで戻さない',()=>{
 const packet=source();packet.payload.drafts=[{id:'source-draft',number:'3',name:'',status:'',owner:'藤田',created:'2026-11-05',sales:'',cost:'',paid:''}];packet.payload.salesSerial=3;
 const first=mergeSourceImport(empty(),packet);assert.equal(first.report.addedDrafts,1);assert.equal(first.payload.drafts[0].owner,'藤田');
 const repeated=mergeSourceImport(first.payload,packet);assert.equal(repeated.report.addedDrafts,0);assert.equal(repeated.payload.drafts.length,1);
 const current={...first.payload,orders:[...first.payload.orders,{...order('source-draft','3','','入力して案件化'),status:'面談取り付け'}],drafts:[]};
 const after=mergeSourceImport(current,packet);assert.equal(after.payload.drafts.length,0);assert.equal(after.payload.orders.find(row=>row.id==='source-draft').name,'入力して案件化');
});
