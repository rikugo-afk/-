import { attachColumnResize } from './column-resize.js';
import { configuredDevelopmentFields, hiddenDevelopmentFields, developmentOptions, developmentValue, parseDevelopmentInput, formatDevelopmentValue } from './development-domain.js';
const $=id=>document.getElementById(id);
const editable=field=>!['linked','computed','separator'].includes(field[2]);
const collator=new Intl.Collator('ja',{numeric:true,sensitivity:'base'});
export function createDevelopmentGrid({getRows,getEntry,getData,isEditing,setValue,commitActive,setActive,onDetails,onColumnChange}){
  let sortKey=null,direction=1,fields=[],stickyKeys=[];
  const resizer=attachColumnResize($('development-table'),{onWidths:widths=>stickyKeys.forEach((key,i)=>$('development-scroll').style.setProperty(`--dev-sticky-${i+1}`,(widths.get(key)||135)+'px'))});
  const addOption=(select,value,label=value)=>{const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);};
  function stickyClass(key){const i=stickyKeys.indexOf(key);return i<0?'':`development-sticky-${i+1}`;}
  function rename(th,field){
    if(!isEditing()||!commitActive())return;
    const input=document.createElement('input'),error=document.createElement('span');input.type='text';input.maxLength=80;input.value=field[1];input.className='development-header-input';input.setAttribute('aria-label','項目名を入力');error.className='cell-error';error.setAttribute('role','alert');
    let done=false;
    const cancel=()=>{done=true;setActive(null);render();};
    const commit=()=>{if(done)return true;try{if(!input.value.trim())throw new Error('項目名を入力してください。');done=true;setActive(null);onColumnChange('rename',{key:field[0],label:input.value});return true;}catch(e){done=false;setActive({input,commit});error.textContent=e.message;return false;}};
    th.replaceChildren(input,error);setActive({input,commit});input.focus();input.select();
    input.addEventListener('blur',()=>setTimeout(()=>{if(!done)commit();},0));
    input.addEventListener('keydown',event=>{if(event.isComposing)return;if(event.key==='Enter'){event.preventDefault();commit();}if(event.key==='Escape'){event.preventDefault();cancel();}});
  }
  function buildColumns(){
    fields=configuredDevelopmentFields(getData());stickyKeys=fields.filter(field=>field[2]!=='separator').slice(0,2).map(field=>field[0]);
    const width=key=>key==='brk'?85:key==='status'?110:160;
    stickyKeys.forEach((key,i)=>$('development-scroll').style.setProperty(`--dev-sticky-${i+1}`,width(key)+'px'));
    const selected=$('development-jump').value;$('development-columns').replaceChildren();$('development-jump').replaceChildren();addOption($('development-jump'),'','項目を選択');
    for(const field of fields){
      const [key,label,type]=field,th=document.createElement('th');th.dataset.key=key;th.scope='col';th.className=stickyClass(key);
      if(type==='separator'){th.classList.add('development-separator');th.setAttribute('aria-label','区切り');}
      else{
        const button=document.createElement('button');button.type='button';button.className='sort-column';button.textContent=label+' ↕';button.addEventListener('click',()=>{if(!commitActive())return;direction=sortKey===key?-direction:1;sortKey=key;render();});th.append(button);addOption($('development-jump'),key,label);
        if(isEditing()){const name=document.createElement('button');name.type='button';name.className='development-rename';name.textContent='✎';name.setAttribute('aria-label',label+'の項目名を変更');name.addEventListener('click',()=>rename(th,field));th.append(name);}
      }
      if(isEditing()){
        const remove=document.createElement('button');remove.type='button';remove.className='development-remove';remove.textContent='×';remove.setAttribute('aria-label',(label||'区切り')+'の項目を削除');remove.addEventListener('click',()=>{if(commitActive()&&confirm(`「${label||'区切り'}」の項目を一覧から削除しますか？入力済みデータは保持します。`))onColumnChange('remove',{key});});th.append(remove);
      }
      if(['money','signedMoney','integer','decimal','computed'].includes(type))th.classList.add('numeric');$('development-columns').append(th);
    }
    const actions=document.createElement('th');actions.textContent='操作';actions.scope='col';$('development-columns').append(actions);
    if(fields.some(field=>field[0]===selected))$('development-jump').value=selected;
    $('development-field-controls').hidden=!isEditing();
    const restore=$('development-restore-field');restore.replaceChildren();for(const field of hiddenDevelopmentFields(getData()))addOption(restore,field[0],field[1]||'区切り');
    restore.disabled=!restore.options.length;$('development-restore-button').disabled=restore.disabled;
  }
  $('development-field-form').addEventListener('submit',event=>{event.preventDefault();if(!isEditing()||!commitActive())return;try{onColumnChange('add',{label:$('development-field-name').value,type:$('development-field-type').value});$('development-field-name').value='';$('development-field-error').textContent='';}catch(e){$('development-field-error').textContent=e.message;}});
  $('development-restore-button').addEventListener('click',()=>{if(!isEditing()||!commitActive())return;try{onColumnChange('restore',{key:$('development-restore-field').value});$('development-field-error').textContent='';}catch(e){$('development-field-error').textContent=e.message;}});
  $('development-jump').addEventListener('change',()=>{
    if(!commitActive())return;
    const th=$('development-columns').querySelector(`[data-key="${$('development-jump').value}"]`);if(!th)return;
    const region=$('development-scroll');region.scrollLeft=Math.max(0,th.offsetLeft-210);
  });
  function fieldValue(row,field){return developmentValue(getEntry(row.id),row,field[0]);}
  function draw(td,row,field){
    const [key,label,type]=field;td.replaceChildren();td.dataset.key=key;td.className='development-cell '+stickyClass(key);
    if(type==='separator'){td.classList.add('development-separator');return;}
    const value=fieldValue(row,field),canEdit=isEditing()&&editable(field);
    if(canEdit)td.classList.add('editable-cell');
    if(['money','signedMoney','integer','decimal','computed'].includes(type))td.classList.add('numeric');
    if(type==='computed')td.classList.add('development-computed');
    const element=document.createElement(canEdit?'button':'span');element.className='cell-value';element.textContent=formatDevelopmentValue(field,value)||'—';
    if(canEdit){
      element.type='button';element.setAttribute('aria-label',`BRK ${row.brk||row.number} ${label}を編集`);
      element.addEventListener('click',()=>edit(td,row,field));
      element.addEventListener('keydown',event=>{if(event.key.startsWith('Arrow')&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey){event.preventDefault();navigate(td,event.key);}});
    }
    td.append(element);
    if(typeof value==='string'&&/^https?:\/\//i.test(value)){
      try{const url=new URL(value);if(['http:','https:'].includes(url.protocol)){const a=document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.className='cell-link';a.textContent='↗';a.setAttribute('aria-label',label+'を開く');td.append(a);}}catch{/* Non-URL notes remain plain text. */}
    }
  }
  function navigate(td,key,shift=false){
    const all=[...$('development-rows').querySelectorAll('.editable-cell')],rowCells=[...td.parentElement.querySelectorAll('.editable-cell')];
    let target;
    if(key==='Enter'||key==='Tab')target=all[all.indexOf(td)+(shift?-1:1)];
    else if(key==='ArrowLeft'||key==='ArrowRight')target=rowCells[rowCells.indexOf(td)+(key==='ArrowLeft'?-1:1)];
    else{const row=key==='ArrowUp'?td.parentElement.previousElementSibling:td.parentElement.nextElementSibling;target=row?.querySelector(`[data-key="${td.dataset.key}"]`);}
    if(target){const row=getRows().find(row=>row.id===target.parentElement.dataset.id),field=fields.find(field=>field[0]===target.dataset.key);edit(target,row,field);target.scrollIntoView({block:'nearest',inline:'nearest'});}
    else $('edit-development').focus();
  }
  function refreshComputed(tr,row){for(const field of fields.filter(field=>field[2]==='computed')){const td=tr.querySelector(`[data-key="${field[0]}"]`);if(td)draw(td,row,field);}}
  function edit(td,row,field){
    if(!isEditing()||!editable(field)||!commitActive())return;
    const [key,label,type]=field,choices=developmentOptions[type];
    const input=document.createElement(choices?'select':type==='textarea'?'textarea':'input');
    if(choices){if(type!=='status')addOption(input,'','未選択');choices.forEach(choice=>addOption(input,choice));}
    else if(type!=='textarea'){input.type='text';if(['money','signedMoney','integer','decimal'].includes(type))input.inputMode=type==='integer'?'numeric':'decimal';}
    const current=fieldValue(row,field);
    if(choices&&current&&!choices.includes(current))addOption(input,current,String(current)+'（既存）');
    input.value=current==null?'':String(current);input.className='cell-input';input.setAttribute('aria-label',`${label}を入力`);
    if(type==='date'){input.placeholder='例：20261105';input.value=String(current||'').replaceAll('-','');input.maxLength=12;}
    else if(!choices)input.maxLength=10000;
    const initialInput=input.value;
    const error=document.createElement('span');error.className='cell-error';error.setAttribute('role','alert');
    const errorId=`development-error-${row.id}-${key}`;error.id=errorId;input.setAttribute('aria-describedby',errorId);
    let finished=false;
    function close(){finished=true;setActive(null);draw(td,row,field);}
    function commit(){
      if(finished)return true;
      try{
        if(input.value===initialInput){close();return true;}
        const value=parseDevelopmentInput(field,input.value);
        if(value!==fieldValue(row,field))setValue(row.id,key,value);
        close();refreshComputed(td.parentElement,row);return true;
      }catch(e){error.textContent=e.message;input.setAttribute('aria-invalid','true');return false;}
    }
    td.replaceChildren(input,error);td.classList.add('cell-editing');
    setActive({input,commit});input.focus();if(input.select)input.select();
    input.addEventListener('blur',()=>setTimeout(()=>{if(!finished)commit();},0));
    input.addEventListener('keydown',event=>{
      if(event.isComposing||event.keyCode===229)return;
      if(event.key==='Escape'){event.preventDefault();close();td.querySelector('button')?.focus();return;}
      if((event.key==='Enter'&&type==='textarea'&&event.shiftKey)||(event.shiftKey&&event.key.startsWith('Arrow'))||event.ctrlKey||event.metaKey||event.altKey)return;
      if(['Enter','Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
        event.preventDefault();if(commit())navigate(td,event.key,event.shiftKey);
      }
    });
  }
  function render(){
    buildColumns();
    const projects=getRows().map((row,index)=>({row,index}));
    if(sortKey)projects.sort((a,b)=>{
      const av=developmentValue(getEntry(a.row.id),a.row,sortKey),bv=developmentValue(getEntry(b.row.id),b.row,sortKey),empty=v=>v==null||v==='';
      if(empty(av)||empty(bv))return empty(av)===empty(bv)?a.index-b.index:empty(av)?1:-1;
      return (typeof av==='number'&&typeof bv==='number'?av-bv:collator.compare(String(av),String(bv)))*direction||a.index-b.index;
    });
    for(const field of fields){const th=$('development-columns').querySelector(`[data-key="${field[0]}"]`),button=th.querySelector('button');if(button){button.textContent=field[1]+' '+(sortKey===field[0]?(direction===1?'↑':'↓'):'↕');th.setAttribute('aria-sort',sortKey===field[0]?(direction===1?'ascending':'descending'):'none');}}
    $('development-rows').replaceChildren();$('development-empty').hidden=projects.length>0;
    for(const {row} of projects){
      const tr=document.createElement('tr');tr.dataset.id=row.id;
      for(const field of fields){const td=document.createElement('td');draw(td,row,field);tr.append(td);}
      const td=document.createElement('td'),button=document.createElement('button');button.type='button';button.className='row-details';button.textContent=row.sourceOnly?'開発データ':'案件詳細';button.disabled=!!row.sourceOnly;button.addEventListener('click',()=>{if(commitActive())onDetails(row);});td.append(button);tr.append(td);$('development-rows').append(tr);
    }
    resizer.refresh();
  }
  return {render};
}
