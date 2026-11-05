import csv,json,re,unicodedata,datetime,hashlib,os,collections
import argparse,pathlib,subprocess
parser=argparse.ArgumentParser(description='受注管理・開発進捗CSVを、既存データへ追加入力できるJSONに変換します。外部へ送信しません。')
parser.add_argument('--orders',required=True);parser.add_argument('--development',required=True);parser.add_argument('--output',required=True)
args=parser.parse_args();output_dir=pathlib.Path(args.output).resolve();output_dir.mkdir(parents=True,exist_ok=True)
files={}
for kind,path in [('orders',args.orders),('development',args.development)]:
 with open(path,encoding='utf-8-sig',newline='') as handle:table=list(csv.reader(handle))
 if not table or 'BRK' not in table[0] or (kind=='orders' and len(table[0])<28) or (kind=='development' and len(table[0])<83):raise ValueError('指定された元シートの列構成ではありません。')
 files[kind]=(path,table)
fields=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import {developmentFields} from './development-domain.js';console.log(JSON.stringify(developmentFields));"],cwd=pathlib.Path(__file__).resolve().parent.parent,text=True))
normalize=lambda value:re.sub(r'\s+','',unicodedata.normalize('NFKC',str(value))).strip()
issues=[]
def issue(kind,row,brk,field,reason,raw):issues.append([kind,row,brk,field,reason,raw])
def numeric(raw,integer=True):
 text=unicodedata.normalize('NFKC',str(raw)).strip().replace(',','').replace('¥','').replace('￥','').replace('円','').replace(' ','')
 if not re.fullmatch(r'-?\d+(?:\.\d+)?',text):return None
 value=float(text)
 if not (-9007199254740991<=value<=9007199254740991) or (integer and not value.is_integer()):return None
 return int(value) if value.is_integer() else value

def brk_number(raw):
 text=normalize(raw)
 match=re.fullmatch(r'(?:BRK[-_:]?)?(\d+)',text,re.I)
 return str(int(match[1])) if match and int(match[1])>0 else ''

def date_value(raw):
 text=unicodedata.normalize('NFKC',str(raw)).strip()
 if not text:return ''
 full=re.fullmatch(r'(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?(?:完了|済)?',text)
 compact=re.fullmatch(r'(\d{4})(\d{2})(\d{2})',text)
 partial=re.fullmatch(r'(\d{1,2})[/月](\d{1,2})日?(?:完了|済)?',text)
 try:
  if full or compact:match=full or compact;return datetime.date(int(match[1]),int(match[2]),int(match[3])).isoformat()
  if partial:
   month,day=int(partial[1]),int(partial[2]);return datetime.date(2026 if month>=10 else 2027,month,day).isoformat()
 except ValueError:pass
 return None

def permit(raw):return {'民泊新法':'民泊','民泊':'民泊','旅館':'旅館業','旅館業':'旅館業'}.get(normalize(raw),'')
def url(raw):
 text=str(raw).strip()
 return text if re.fullmatch(r'https?://[^\s]+',text) else ''

def flag(raw):return {'TRUE':'済','FALSE':'未'}.get(str(raw).strip().upper(),str(raw).strip())

o_path,o_table=files['orders'];d_path,d_table=files['development']
d_rows=[(i,row) for i,row in enumerate(d_table[1:],2) if row[8].strip() or row[1].strip()]
d_by_brk={brk_number(row[1]):(i,row) for i,row in d_rows if brk_number(row[1])}
orders=[];drafts=[];development={};o_by_brk={}
for line,row in enumerate(o_table[1:],2):
 if not(row[10].strip() or row[12].strip()):
  if row[1].strip() and row[2].strip():
   number=str(int(row[0])) if row[0].strip().isdigit() else '';identity='source-order-draft:'+number
   drafts.append({'id':identity,'number':number,'brk':brk_number(row[9]),'name':'','status':'','owner':row[2].strip(),'created':date_value(row[1]) or '', 'sales':'','cost':'','paid':''})
   development[identity]={'status':'未着手','note':'','orderSource':{'fileName':os.path.basename(o_path),'row':line,'headers':o_table[0],'cells':row}}
  continue
 number=str(int(row[0])) if row[0].strip().isdigit() else ''
 identity='source-order:'+number if number else 'source-order-row:'+str(line)
 brk=brk_number(row[9]);matched=d_by_brk.get(brk) if brk else None
 original_status=row[3].strip();status={'契約済み':'契約済','初回面談済み':'初回面談済'}.get(original_status,original_status) or '面談取り付け'
 sale=numeric(row[16]);legal=numeric(row[17]);camera=numeric(row[18]);gross=numeric(row[19])
 cost=(legal or 0)+(camera or 0) if legal is not None or camera is not None else (sale-gross if sale is not None and gross is not None and sale>=gross else '')
 item={'id':identity,'number':number,'brk':brk,'status':status,'owner':row[2].strip(),'created':date_value(row[1]) or '', 'contract':date_value(row[5]) or '', 'name':row[10].strip() or '名称未入力（元シート'+str(line)+'行目）','folder':url(row[7]),'permit':permit(row[22]),'address':row[12].strip(),'map':url(matched[1][11]) if matched else '','source':row[4].strip(),'sales':sale if sale is not None and sale>=0 else '', 'cost':cost if cost=='' or cost>=0 else '', 'paymentDate':date_value(row[15]) or '', 'paid':(True if matched[1][3].strip()=='済' else False if matched[1][3].strip()=='未' else '') if matched else '', 'note':'\n'.join(text for text in [row[24].strip(),row[25].strip()] if text)[:10000]}
 orders.append(item)
 if brk:o_by_brk[brk]=identity
 development[identity]={'status':'未着手','note':'','values':{'contractHolder':row[10].strip()},'orderSource':{'fileName':os.path.basename(o_path),'row':line,'headers':o_table[0],'cells':row}}
 for index,key in [(1,'created'),(5,'contract'),(15,'paymentDate')]:
  if row[index].strip() and date_value(row[index]) is None:issue('受注管理',line,brk,key,'単一の日付にできないため空欄。元データは保持',row[index])
 if original_status=='':issue('受注管理',line,brk,'ステータス','空欄を面談取り付けとして取り込み',original_status)
 if row[22].strip() and not permit(row[22]):issue('受注管理',line,brk,'許可種類','選択値に変換できないため空欄。元データは保持',row[22])
 if row[7].strip() and not item['folder']:issue('受注管理',line,brk,'フォルダ','CSVにリンク先URLがないため空欄。元の表示文字は保持',row[7])
 if row[16].strip() and sale is None:issue('受注管理',line,brk,'営業売上','金額を確定できないため空欄。元データは保持',row[16])

headers={}
for i,label in enumerate(d_table[0]):headers.setdefault(normalize(label),[]).append(i)
header_alias={'公開目標':'公開目標','リードタイム':'リードタイム','リフォ会社':'リフォ会社','リスティチェック':'リスティチェック','初回清掃希望日':'初回清掃希望日','セッティング完了予想日':'セッティング完了予想日','清掃会社調整担当':'清掃会社調整担当','依頼先清掃会社':'依頼先清掃会社','清掃料金(税込)':'清掃料金(税込)','初回清掃料金(税込)':'初回清掃料金(税込)','2026年除雪スコップ購入必要物件(購入10月頃)':'2026年除雪スコップ購入必要物件(購入10月頃)'}
for line,row in d_rows:
 brk=brk_number(row[1]);identity=o_by_brk.get(brk) or ('source-development:'+brk if brk else 'source-development-row:'+str(line))
 entry=development.get(identity,{'status':'未着手','note':'','values':{}})
 entry['status']={'未':'未着手','進':'進行中','完':'完了'}.get(row[0].strip(),'未着手')
 entry['project']={'brk':brk,'name':row[8].strip(),'owner':row[7].strip(),'address':row[10].strip(),'map':url(row[11]),'permit':permit(row[25])}
 entry['developmentSource']={'fileName':os.path.basename(d_path),'row':line,'headers':d_table[0],'cells':row}
 values=entry.get('values',{});legacy={}
 for key,label,kind in fields:
  if key in ('status','brk','separator') or kind=='computed':continue
  indices=headers.get(normalize(label),[])
  if not indices:continue
  raw_values=[row[i].strip() for i in indices]
  if key=='bedCount':
   raw=raw_values[-1]
   for original in raw_values[:-1]:
    if original and not re.search(r'入力不可|記入',original):issue('開発進捗',line,brk,label,'説明のある元列を保持。件数は数値の列を使用',original)
  elif key=='payment':raw=raw_values[0]
  else:
   distinct=list(dict.fromkeys(flag(v) for v in raw_values if v))
   raw=(distinct[0] if distinct else '') if len(distinct)<=1 else ' / '.join('元列'+str(i+1)+':'+flag(v) for i,v in enumerate(raw_values) if v)
   if len(distinct)>1:issue('開発進捗',line,brk,label,'重複列の値が異なるため両方を表示し、元データも保持',raw)
  if key=='note':entry['note']=raw[:10000];continue
  if not raw:continue
  if kind=='date':
   value=date_value(raw)
   if value is None:legacy[key]=raw;issue('開発進捗',line,brk,label,'幅・予定・注記を含む日付を文字のまま保持',raw)
   else:values[key]=value
  elif kind in ('integer','money','signedMoney','decimal'):
   value=numeric(raw,kind!='decimal')
   if value is None or (kind!='signedMoney' and value<0):legacy[key]=flag(raw);issue('開発進捗',line,brk,label,'数値ではなくチェック・文字のため、そのまま表示',raw)
   else:values[key]=value
  elif kind=='url':
   value=url(raw)
   if value:values[key]=value
   else:legacy[key]=raw;issue('開発進捗',line,brk,label,'URLとして確定できない表示文字を保持',raw)
  elif kind=='permit':values[key]=permit(raw) or raw
  elif kind=='payment':values[key]={'済':'入金済','未':'未入金'}.get(raw,flag(raw))
  else:values[key]=flag(raw)
 entry['values']=values
 if legacy:entry['importedText']=legacy
 development[identity]=entry
 if isinstance(values.get('developmentSales'),(int,float)) and isinstance(values.get('purchaseAmount'),(int,float)):
  original_gross=numeric(row[50]);calculated=values['developmentSales']-values['purchaseAmount']
  if original_gross is not None and original_gross!=calculated:issue('開発進捗',line,brk,'粗利','元シートの表示値と指定された計算式（売上−仕入）の値が異なります。元値を保管',row[50])
archive_files=[]
for kind,(path,table) in files.items():
 included={item.get('orderSource',{}).get('row') for item in development.values()} if kind=='orders' else {line for line,_ in d_rows}
 archive_files.append({'fileName':os.path.basename(path),'headers':table[0],'remainingRows':[{'row':i,'cells':row} for i,row in enumerate(table[1:],2) if i not in included]})
development['__order_desk_source_archive__']={'status':'未着手','note':'','sourceArchive':archive_files}
max_brk=max([799]+[int(item['brk']) for item in orders if item['brk']]+[int(item['project']['brk']) for item in development.values() if item.get('project',{}).get('brk')])
package={'kind':'order-desk-source-import-v1','payload':{'orders':orders,'drafts':drafts,'development':development,'salesSerial':max(int(item['number']) for item in orders+drafts if item['number']),'brkSerial':max_brk},'summary':{'orders':len(orders),'development':len(d_rows),'drafts':len(drafts),'matchedBRK':len(o_by_brk.keys()&d_by_brk.keys()),'standaloneDevelopment':sum(1 for item in development.values() if item.get('project') and not item.get('orderSource')),'issues':len(issues),'sourceFiles':[os.path.basename(o_path),os.path.basename(d_path)]},'sourceHashes':{kind:hashlib.sha256(open(path,'rb').read()).hexdigest() for kind,(path,_) in files.items()}}
with open(str(output_dir/'受注管理・開発進捗_取り込み用.json'),'w',encoding='utf-8') as f:json.dump(package,f,ensure_ascii=False,indent=2)
with open(str(output_dir/'元データ_変換記録.csv'),'w',encoding='utf-8-sig',newline='') as f:
 writer=csv.writer(f);writer.writerow(['元シート','行','BRK','項目','確認事項','元の値']);writer.writerows([["'"+str(value) if re.match(r'^\s*[=+@-]',str(value)) else value for value in row] for row in issues])
print(json.dumps(package['summary'],ensure_ascii=False))
print('Package bytes:',os.path.getsize(str(output_dir/'受注管理・開発進捗_取り込み用.json')))
