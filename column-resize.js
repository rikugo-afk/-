// Display preferences stay in each browser. Resizing never writes business data.
const controllers=new Map();
let active=null,frame=null;
function finish(){
  if(!active)return;
  if(frame!==null){cancelAnimationFrame(frame);frame=null;}
  active.controller.apply(active.key,active.width);
  active.controller.persist();active=null;document.body.classList.remove('resizing-column');
}
document.addEventListener('pointerdown',event=>{
  const handle=event.target.closest?.('.column-resize-handle');if(!handle||event.button!==0)return;
  const controller=controllers.get(handle.dataset.resizeTable);if(!controller)return;
  event.preventDefault();event.stopPropagation();
  const width=controller.width(handle.dataset.resizeKey);active={controller,key:handle.dataset.resizeKey,start:event.clientX,original:width,width};document.body.classList.add('resizing-column');
},true);
document.addEventListener('pointermove',event=>{
  if(!active)return;event.preventDefault();active.width=Math.max(40,Math.round(active.original+event.clientX-active.start));
  if(frame===null)frame=requestAnimationFrame(()=>{frame=null;if(active)active.controller.apply(active.key,active.width);});
},{passive:false});
document.addEventListener('pointerup',finish);
document.addEventListener('pointercancel',finish);
window.addEventListener('blur',finish);
document.addEventListener('click',event=>{if(event.target.closest?.('.column-resize-handle')){event.preventDefault();event.stopPropagation();}},true);
document.addEventListener('keydown',event=>{
  const handle=event.target.closest?.('.column-resize-handle');if(!handle||!['ArrowLeft','ArrowRight'].includes(event.key))return;
  const controller=controllers.get(handle.dataset.resizeTable);if(!controller)return;
  event.preventDefault();event.stopPropagation();controller.apply(handle.dataset.resizeKey,Math.max(40,controller.width(handle.dataset.resizeKey)+(event.key==='ArrowRight'?1:-1)*(event.shiftKey?50:10)));controller.persist();
},true);
export function attachColumnResize(table,{key='order-desk:column-widths:'+table.id,onWidths=()=>{}}={}){
  if(controllers.has(table.id))return controllers.get(table.id);
  let saved={},headers=[],group,keys=[];const widths=new Map();
  try{const value=JSON.parse(localStorage.getItem(key)||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))saved=value;}catch{/* Defaults remain usable. */}
  function applyWidths(){
    let total=0;
    headers.forEach((th,index)=>{const width=widths.get(keys[index])||135;group.children[index].style.width=width+'px';th.style.width=width+'px';total+=width;const handle=th.querySelector('.column-resize-handle');if(handle)handle.setAttribute('aria-valuenow',String(width));});
    table.style.width=total+'px';table.style.minWidth='0';onWidths(widths);
  }
  const controller={
    width:key=>widths.get(key)||135,
    apply(key,value){widths.set(key,value);saved[key]=value;applyWidths();},
    persist(){try{localStorage.setItem(key,JSON.stringify(saved));}catch{/* Keep current widths in memory. */}},
    refresh(){
      headers=[...table.tHead.rows[0].cells];keys=headers.map((th,i)=>th.dataset.key||th.dataset.sortKey||'actions-'+i);
      headers.forEach((th,i)=>{const remembered=Number(saved[keys[i]]);if(!widths.has(keys[i]))widths.set(keys[i],Number.isFinite(remembered)&&remembered>=40&&remembered<=100000?remembered:Math.max(40,Math.ceil(th.getBoundingClientRect().width)||135));});
      group=table.querySelector('colgroup');if(!group){group=document.createElement('colgroup');table.prepend(group);}group.replaceChildren(...headers.map(()=>document.createElement('col')));
      table.classList.add('resizable-table');table.style.tableLayout='fixed';
      headers.forEach((th,i)=>{
        if(getComputedStyle(th).position==='static')th.style.position='relative';
        if(th.querySelector('.column-resize-handle'))return;
        const handle=document.createElement('span');handle.className='column-resize-handle';handle.dataset.resizeTable=table.id;handle.dataset.resizeKey=keys[i];handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-valuemin','40');handle.setAttribute('aria-label',(th.querySelector('.sort-column')?.textContent.replace(/[↕↑↓]/g,'').trim()||th.textContent||'操作')+'の列幅を変更');handle.title='ドラッグで横幅を変更（編集は不要）';th.append(handle);
      });applyWidths();
    }
  };
  controllers.set(table.id,controller);return controller;
}
