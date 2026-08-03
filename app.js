import { supabase } from "./supabase.js";

// Глобальная переменная для текущего пользователя
let currentUser = null;

// --- AUTH LOGIC ---
async function initAuth() {
    // Слушаем изменения авторизации (вход, выход, инициализация)
    supabase.auth.onAuthStateChange(async (event, session) => {
        if (session && session.user) {
            currentUser = session.user;
            $('#authScreen').classList.add('hidden');
            $('#appShell').classList.remove('hidden');
            
            // Отображаем email пользователя
            const emailEl = $('#userEmail');
            if (emailEl) emailEl.textContent = currentUser.email;

            // Загружаем облачные данные пользователя
            await loadCloudState();
        } else {
            currentUser = null;
            $('#authScreen').classList.remove('hidden');
            $('#appShell').classList.add('hidden');
        }
    });
}

async function loginWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin
        }
    });
    if (error) toast("Ошибка входа: " + error.message);
}

async function logout() {
    await supabase.auth.signOut();
}

// --- DATABASE LOGIC ---
async function loadCloudState() {
    if (!currentUser) return;

    const { data, error } = await supabase
        .from("planner_state")
        .select("state")
        .eq("user_id", currentUser.id)
        .maybeSingle();

    if (error) {
        console.error("Cloud state error:", error);
        state = loadLocalState();
        render();
        return;
    }

    if (!data) {
        // Если у нового пользователя еще нет записи в БД — берем defaultState и сохраняем
        console.log("Новый пользователь, создаем начальное состояние...");
        state = structuredClone(defaultState);
        await saveState();
    } else {
        state = {
            ...defaultState,
            ...data.state,
            filter: {
                ...defaultState.filter,
                ...(data.state.filter || {})
            }
        };
        console.log("✅ Загружено из Supabase для пользователя:", currentUser.email);
    }

    render();
}

async function saveState() {
    if (!currentUser) return;

    // Резервная копия локально
    localStorage.setItem(`${STORE_KEY}_${currentUser.id}`, JSON.stringify(state));

    const { error } = await supabase
        .from("planner_state")
        .upsert({
            user_id: currentUser.id,
            state: state,
            updated_at: new Date().toISOString()
        });

    if (error) {
        console.error("Supabase save error:", error);
    } else {
        console.log("✅ Сохранено в Supabase");
    }
}

async function testSupabase() {
    const { data, error } = await supabase
        .from("tasks")
        .select("*");

    console.log("DATA:", data);
    console.log("ERROR:", error);
}

testSupabase();
const STORE_KEY = 'assetline-planner-v1';
const DAY = 86400000;
const dateISO = d => new Date(d).toISOString().slice(0, 10);
const addDays = (d, days) => dateISO(new Date(new Date(d).getTime() + days * DAY));
const dayDiff = (a, b) => Math.round((new Date(b) - new Date(a)) / DAY);
const prettyDate = d => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(d));
const initials = value => value.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' })[c]);
const $ = sel => document.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const defaultState = {
  dlcs: [{ id:'dlc-nordic', name:'Nordic Horizons', lockDate:'2026-09-18' }, { id:'dlc-next', name:'Next DLC', lockDate:'2026-11-14' }],
  workers: [{ id:'me', name:'Me' }, { id:'alex', name:'Alex' }, { id:'maria', name:'Maria' }],
  tasks: [
    { id:'nd-nap-train', title:'nd_nap_train', type:'work', dlcId:'dlc-nordic', workerId:'Alex', start:'2026-08-10', end:'2026-09-05', status:'progress', color:'#577cf4', note:'', image:'' },
    { id:'tractor', title:'Tractor model', type:'work', dlcId:'dlc-nordic', workerId:'Maria', start:'2026-08-16', end:'2026-09-12', status:'todo', color:'#b46a9c', note:'', image:'' },
    { id:'feedback', title:'Write feedback', type:'personal', dlcId:'', workerId:'Me', start:'2026-08-12', end:'2026-08-18', status:'todo', color:'#3c9e8c', note:'', image:'' },
    { id:'signs', title:'Road signs', type:'work', dlcId:'dlc-next', workerId:'Alex', start:'2026-09-21', end:'2026-10-18', status:'todo', color:'#bd814e', note:'', image:'' }
  ],
  filter:{ type:'all', dlcs:[], workers:[], logic:'AND' }, zoom:1
};
let state = structuredClone(defaultState);
let activeView = 'planner';
let draftImage = '';
let activeDraggedTaskId = null;
let activeDragOrigin = '';
let activeDragStartX = 0;
let deletedByDrop = false;
const baseDate = new Date('2026-08-01T00:00:00');
const zooms = [{ name:'Months', px:14, step:14 }, { name:'Weeks', px:25, step:7 }, { name:'Days', px:46, step:1 }];

function loadLocalState(){ try { const saved = JSON.parse(localStorage.getItem(STORE_KEY)); return saved ? { ...defaultState, ...saved, filter:{...defaultState.filter,...(saved.filter||{})} } : structuredClone(defaultState); } catch { return structuredClone(defaultState); } }
async function loadCloudState() {

    const { data, error } = await supabase
        .from("planner_state")
        .select("state")
        .eq("id", "main")
        .single();

    if (error) {
        console.log("Cloud state not found. Using local backup.");

        state = loadLocalState();
        render();
        return;
    }

    state = {
        ...defaultState,
        ...data.state,
        filter: {
            ...defaultState.filter,
            ...(data.state.filter || {})
        }
    };

    console.log("✅ Loaded from Supabase");

    render();
}
async function saveState() {
    // Оставляем локальное сохранение как резервную копию
    localStorage.setItem(STORE_KEY, JSON.stringify(state));

    const { error } = await supabase
        .from("planner_state")
        .upsert({
            id: "main",
            state: state,
            updated_at: new Date().toISOString()
        });

    if (error) {
        console.error("Supabase save error:", error);
    } else {
        console.log("✅ Saved to Supabase");
    }
}
function uid(prefix){ return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`; }
function getDlc(id){ return state.dlcs.find(d => d.id === id); }
function isArchived(task){ return task.status === 'done'; }
function currentZoom(){ return zooms[state.zoom]; }
function taskMatches(task){ const f=state.filter, checks=[]; if(f.type !== 'all') checks.push(task.type === f.type); if(f.dlcs.length) checks.push(f.dlcs.includes(task.dlcId)); if(f.workers.length) checks.push(f.workers.includes(task.workerId)); return !checks.length || (f.logic === 'AND' ? checks.every(Boolean) : checks.some(Boolean)); }
function visibleTasks(){ return state.tasks.filter(t => !isArchived(t) && taskMatches(t)); }

function renderSidebar(){
  const colors=['#7597ff','#76c7ff','#d695bd','#f0ad71','#70cfac'];
  $('#dlcList').innerHTML = state.dlcs.length ? state.dlcs.map((d,i) => `<div class="dlc-item ${state.filter.dlcs.includes(d.id)?'selected':''}" data-filter-dlc="${d.id}"><i class="dlc-color" style="background:${colors[i%colors.length]}"></i><div class="dlc-name"><span>${esc(d.name)}</span><small>asset deadline · ${prettyDate(d.lockDate)}</small></div><button class="dlc-edit" data-edit-dlc="${d.id}" title="Edit DLC">&hellip;</button></div>`).join('') : '<div class="dlc-item"><span>No DLC yet</span></div>';
  $('#workerList').innerHTML = state.workers.length
? state.workers.map((w,i)=>`
<div class="worker-item ${state.filter.workers.includes(w.name)?'selected':''}"
     data-filter-worker="${esc(w.name)}">

    <i class="worker-avatar"
       style="background:${colors[i%colors.length]}">
        ${initials(w.name)}
    </i>

    <div class="dlc-name">
        <span>${esc(w.name)}</span>
    </div>

    <button class="dlc-edit"
            data-edit-worker="${w.id}"
            title="Edit Worker">
        &hellip;
    </button>

</div>
`).join('')
: '<div class="worker-item"><span>No workers yet</span></div>';
}
function timelineRange(){ const dates=visibleTasks().flatMap(t=>[t.start,t.end]); state.dlcs.forEach(d=>dates.push(d.lockDate)); const min=dates.length?Math.min(...dates.map(d=>new Date(d).getTime()),baseDate.getTime()):baseDate.getTime(); const max=dates.length?Math.max(...dates.map(d=>new Date(d).getTime()),baseDate.getTime()+90*DAY):baseDate.getTime()+90*DAY; const start=dateISO(new Date(min-8*DAY)); return { start, days:Math.max(90,dayDiff(start,dateISO(new Date(max+14*DAY)))+1) }; }
function utcDate(value){return new Date(`${value}T00:00:00Z`);}
function weekNumber(date){const copy=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));copy.setUTCDate(copy.getUTCDate()+4-(copy.getUTCDay()||7));const yearStart=new Date(Date.UTC(copy.getUTCFullYear(),0,1));return Math.ceil((((copy-yearStart)/DAY)+1)/7);}
function renderTimelineHead(range){
  const z=currentZoom(), width=range.days*z.px, start=utcDate(range.start), nodes=[];
  if(state.zoom===0){
    let offset=0;
    while(offset<range.days){const date=new Date(start.getTime()+offset*DAY),next=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1)),until=Math.min(range.days,Math.round((next-start)/DAY)),span=until-offset;if(span*z.px>=115)nodes.push(`<span class="timeline-month" style="left:${offset*z.px+8}px">${date.toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'})}</span>`);offset=Math.max(offset+1,until);}
  }else{
    let lastMonth='';
    for(let d=0;d<range.days;d+=z.step){const date=new Date(start.getTime()+d*DAY),month=date.toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'});if(month!==lastMonth){nodes.push(`<span class="timeline-month" style="left:${d*z.px+8}px">${month}</span>`);lastMonth=month;}const label=state.zoom===2?date.getUTCDate():`W${weekNumber(date)}`;nodes.push(`<span class="timeline-tick" style="left:${d*z.px}px">${label}</span>`);}
  }
  $('#timelineHead').style.width=`${width}px`;$('#timelineHead').innerHTML=nodes.join('');
}
function timelineShades(range){
  const z=currentZoom(), start=utcDate(range.start), bands=[];let offset=0,index=0;
  while(offset<range.days){let nextOffset;if(state.zoom===0){const date=new Date(start.getTime()+offset*DAY),next=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1));nextOffset=Math.round((next-start)/DAY);}else{nextOffset=offset+(state.zoom===1?7:1);}nextOffset=Math.min(range.days,Math.max(offset+1,nextOffset));if(index%2===1)bands.push(`<span class="timeline-shade" style="left:${offset*z.px}px;width:${(nextOffset-offset)*z.px}px"></span>`);offset=nextOffset;index++;}
  return bands.join('');
}
function groupTasks(tasks){ const groups=[]; state.dlcs.forEach(d=>{const set=tasks.filter(t=>t.dlcId===d.id);if(set.length)groups.push({id:d.id,name:d.name,dlc:d,tasks:set});}); const personal=tasks.filter(t=>t.type==='personal');if(personal.length)groups.push({id:'personal',name:'Personal tasks',tasks:personal}); const noDlc=tasks.filter(t=>t.type==='work'&&!t.dlcId);if(noDlc.length)groups.push({id:'no-dlc',name:'No DLC',tasks:noDlc});return groups; }
function barMarkup(task,range){ const z=currentZoom(),left=Math.max(0,dayDiff(range.start,task.start)*z.px),width=Math.max(78,(dayDiff(task.start,task.end)+1)*z.px),img=task.image?`background-image:url('${task.image.replace(/'/g,'%27')}');`:''; return `<div class="task-bar ${task.image?'has-image':''}" draggable="true" data-task-id="${task.id}" style="left:${left}px;width:${width}px;background-color:${task.color};${img}" title="Drag to move. Drag the right edge to change the deadline."><div class="task-bar-content"><span class="bar-title">${esc(task.title)}</span><span class="bar-meta">${esc(task.workerId||'Unassigned')} · due ${prettyDate(task.end)}</span></div><span class="task-resize-handle" aria-label="Resize task"></span></div>`; }
function renderPlanner(){
  const tasks=visibleTasks(),groups=groupTasks(tasks),range=timelineRange(),z=currentZoom(),width=range.days*z.px; renderTimelineHead(range);
  if(!groups.length){$('#taskRows').innerHTML='<div class="task-row"><div class="task-main"><div class="task-title">No matching items</div><div class="task-meta">Change filters or add an item</div></div></div>';$('#timelineBody').style.width=`${width}px`;$('#timelineBody').innerHTML='';return;}
  $('#taskRows').innerHTML=groups.map(g=>`<div class="task-group"><div class="group-label"><span>${esc(g.name)}</span>${g.dlc?`<span class="lock-tag">asset deadline · ${prettyDate(g.dlc.lockDate)}</span>`:''}</div>${g.tasks.map(t=>`<div class="task-row"><i class="task-status status-${t.status}"></i><div class="task-main"><div class="task-title">${esc(t.title)}</div><div class="task-meta">due ${prettyDate(t.end)}${t.note?` · ${esc(t.note).slice(0,24)}`:''}</div></div><span class="task-worker">${esc(t.workerId||'—')}</span></div>`).join('')}</div>`).join('');
  const todayLeft=dayDiff(range.start,dateISO(new Date()))*z.px;let body=timelineShades(range)+`<div class="today-line" style="left:${todayLeft}px"><span class="today-label">today</span></div>`;state.dlcs.forEach(d=>{const left=dayDiff(range.start,d.lockDate)*z.px;if(left>=0&&left<=width)body+=`<div class="asset-lock-line" style="left:${left}px"><span class="asset-lock-label">${esc(d.name)} · asset deadline</span></div>`;});body+=groups.map(g=>`<div class="timeline-group"><div class="timeline-group-label"></div>${g.tasks.map(t=>`<div class="timeline-row">${barMarkup(t,range)}</div>`).join('')}</div>`).join('');$('#timelineBody').style.width=`${width}px`;$('#timelineBody').style.backgroundImage='none';$('#timelineBody').innerHTML=body;enableTaskInteractions();
}
function renderArchive(){const completed=state.tasks.filter(isArchived);$('#archiveGrid').innerHTML=completed.length?completed.map(t=>`<article class="archive-card" style="--card-image:url('${(t.image||'').replace(/'/g,'%27')}')"><div class="archive-card-top"><span>DONE</span><span>${prettyDate(t.end)}</span></div><h3>${esc(t.title)}</h3><p>${t.type==='personal'?'Personal task':esc(getDlc(t.dlcId)?.name||'Work product')} · ${esc(t.workerId||'Unassigned')}</p><button class="ghost-button restore-button" data-restore="${t.id}">Return to work</button></article>`).join(''):'<div class="archive-intro">The archive is empty.</div>';}
function renderFilters(){ $$('.filter-pill').forEach(b=>b.classList.toggle('selected',b.dataset.value===state.filter.type));$$('.logic-button').forEach(b=>b.classList.toggle('active',b.dataset.logic===state.filter.logic));$('#dlcFilter').innerHTML=`DLC${state.filter.dlcs.length?` · ${state.filter.dlcs.length}`:''} <span>⌄</span>`;$('#workerFilter').innerHTML=`People${state.filter.workers.length?` · ${state.filter.workers.length}`:''} <span>⌄</span>`;$('#zoomLabel').textContent=currentZoom().name;}
function render(){renderSidebar();renderFilters();renderPlanner();renderArchive();$('#plannerView').classList.toggle('hidden',activeView!=='planner');$('#archiveView').classList.toggle('hidden',activeView!=='archive');$('#viewTitle').textContent=activeView==='planner'?'Planner':'Archive';$('#viewKicker').textContent=activeView==='planner'?'MASTER PLAN':'COMPLETED ITEMS';$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===activeView));}

function setDragActionsVisible(visible){['#trashDrop','#statusWip','#statusDone'].forEach(selector=>$(selector).classList.toggle('hidden',!visible));}
function enableTaskInteractions(){
  $$('.task-bar').forEach(bar=>{
    bar.addEventListener('dragstart',e=>{if(e.target.closest('.task-resize-handle')){e.preventDefault();return;}activeDraggedTaskId=bar.dataset.taskId;activeDragStartX=e.clientX;activeDragOrigin=state.tasks.find(t=>t.id===activeDraggedTaskId).start;deletedByDrop=false;bar.classList.add('dragging');setDragActionsVisible(true);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',activeDraggedTaskId);});
    bar.addEventListener('dragend',e=>{bar.classList.remove('dragging');setDragActionsVisible(false);$$('.drag-over').forEach(el=>el.classList.remove('drag-over'));if(!activeDragOrigin)return;if(!deletedByDrop){const delta=Math.round((e.clientX-activeDragStartX)/currentZoom().px);if(delta){const task=state.tasks.find(t=>t.id===activeDraggedTaskId),duration=dayDiff(task.start,task.end);task.start=addDays(activeDragOrigin,delta);task.end=addDays(task.start,duration);saveState();toast(`Deadline moved to ${prettyDate(task.end)}`);render();}}activeDraggedTaskId=null;activeDragOrigin='';});
    const handle=bar.querySelector('.task-resize-handle');handle.addEventListener('dragstart',e=>e.preventDefault());handle.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();const task=state.tasks.find(t=>t.id===bar.dataset.taskId),rect=bar.getBoundingClientRect(),px=currentZoom().px;let duration=dayDiff(task.start,task.end);const move=event=>{duration=Math.max(0,Math.round((event.clientX-rect.left)/px)-1);bar.style.width=`${Math.max(78,(duration+1)*px)}px`;};const up=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);const next=addDays(task.start,duration);if(next!==task.end){task.end=next;saveState();toast(`Deadline changed to ${prettyDate(task.end)}`);render();}};document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);});
  });
}
function openModal(id){$('#modalBackdrop').classList.remove('hidden');$$('.modal').forEach(m=>m.classList.add('hidden'));$(`#${id}`).classList.remove('hidden');}
function closeModal(){$('#modalBackdrop').classList.add('hidden');}
function fillSelects(task={}){$('#taskDlc').innerHTML=`<option value="">No DLC</option>${state.dlcs.map(d=>`<option value="${d.id}" ${task.dlcId===d.id?'selected':''}>${esc(d.name)}</option>`).join('')}`;$('#taskWorker').innerHTML=`<option value="">Unassigned</option>${state.workers.map(w=>`<option value="${esc(w.name)}" ${task.workerId===w.name?'selected':''}>${esc(w.name)}</option>`).join('')}`;}
function updateTaskFormType(){const personal=$('#taskType').value==='personal';$('#taskDlc').closest('.form-field').style.opacity=personal?'.45':'1';$('#taskDlc').disabled=personal;if(personal)$('#taskDlc').value='';}
function setPreview(value){draftImage=value||'';$('#imagePreview').src=draftImage;$('#imagePreview').classList.toggle('hidden',!draftImage);$('#imagePlaceholder').classList.toggle('hidden',!!draftImage);$('#removeImage').classList.toggle('hidden',!draftImage);}
function newTask(){const now=dateISO(new Date());$('#taskForm').reset();$('#taskId').value='';$('#taskType').value='work';$('#taskStatus').value='todo';$('#taskStart').value=now;$('#taskEnd').value=addDays(now,7);$('#taskColor').value='#577cf4';setPreview('');fillSelects();updateTaskFormType();$('#modalTitle').textContent='Add product';openModal('taskModal');}
function editTask(id){const t=state.tasks.find(x=>x.id===id);if(!t)return;$('#taskForm').reset();$('#taskId').value=t.id;$('#taskTitle').value=t.title;$('#taskType').value=t.type;$('#taskStatus').value=t.status;$('#taskStart').value=t.start;$('#taskEnd').value=t.end;$('#taskColor').value=t.color;$('#taskNote').value=t.note||'';fillSelects(t);setPreview(t.image||'');updateTaskFormType();$('#modalTitle').textContent='Edit item';openModal('taskModal');}
function openDlc(id){const d=id&&getDlc(id);$('#dlcForm').reset();$('#dlcId').value=d?.id||'';$('#dlcName').value=d?.name||'';$('#dlcLockDate').value=d?.lockDate||addDays(dateISO(new Date()),30);$('#dlcModalTitle').textContent=d?'Edit DLC':'Add DLC';$('#saveDlc').textContent=d?'Save changes':'Add DLC';$('#deleteDlc').classList.toggle('hidden',!d);openModal('dlcModal');}
function openWorker(id){

    const worker = state.workers.find(w=>w.id===id);

    $("#workerId").value = worker.id;

    $("#workerName").value = worker.name;

    $("#workerModalTitle").textContent = "Edit Worker";

    $("#saveWorker").textContent = "Save changes";

    $("#deleteWorker").classList.remove("hidden");

    openModal("workerModal");

}
function readImage(file){if(!file||!file.type.startsWith('image/'))return;const reader=new FileReader();reader.onload=()=>setPreview(reader.result);reader.readAsDataURL(file);}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.remove('hidden');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>el.classList.add('hidden'),2600);}
function showFilter(kind,anchor){const options=kind==='dlc'?state.dlcs.map(d=>({value:d.id,label:d.name})):state.workers.map(w=>({value:w.name,label:w.name}));const selected=kind==='dlc'?state.filter.dlcs:state.filter.workers,pop=$('#filterPopover'),rect=anchor.getBoundingClientRect();pop.innerHTML=options.length?options.map(o=>`<label class="popover-option"><input type="checkbox" value="${esc(o.value)}" ${selected.includes(o.value)?'checked':''}/><span>${esc(o.label)}</span></label>`).join(''):'<div class="popover-option">The list is empty</div>';pop.style.left=`${rect.left}px`;pop.style.top=`${rect.bottom+6}px`;pop.classList.remove('hidden');$$('input',pop).forEach(input=>input.addEventListener('change',()=>{const key=kind==='dlc'?'dlcs':'workers';state.filter[key]=$$('input:checked',pop).map(x=>x.value);saveState();render();showFilter(kind,anchor);}));}

$('#collapseSidebar').addEventListener('click',()=>$('#appShell').classList.toggle('collapsed'));
$('#trashDrop').addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';$('#trashDrop').classList.add('drag-over');});
$('#trashDrop').addEventListener('dragleave',()=>$('#trashDrop').classList.remove('drag-over'));
$('#trashDrop').addEventListener('drop',e=>{e.preventDefault();const id=activeDraggedTaskId||e.dataTransfer.getData('text/plain');if(!id)return;state.tasks=state.tasks.filter(t=>t.id!==id);saveState();deletedByDrop=true;setDragActionsVisible(false);$('#trashDrop').classList.remove('drag-over');render();toast('Item deleted');});
$$('[data-drop-status]').forEach(drop=>{drop.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';drop.classList.add('drag-over');});drop.addEventListener('dragleave',()=>drop.classList.remove('drag-over'));drop.addEventListener('drop',e=>{e.preventDefault();const id=activeDraggedTaskId||e.dataTransfer.getData('text/plain'),task=state.tasks.find(t=>t.id===id);if(!task)return;task.status=drop.dataset.dropStatus;saveState();deletedByDrop=true;setDragActionsVisible(false);drop.classList.remove('drag-over');render();toast(task.status==='done'?'Item moved to archive':'Item moved to work in progress');});});
$$('.nav-item').forEach(b=>b.addEventListener('click',()=>{activeView=b.dataset.view;render();}));
$('#sidebarAll').addEventListener('click',()=>{state.filter={type:'all',dlcs:[],workers:[],logic:'AND'};saveState();render();});
$('#dlcList').addEventListener('click',e=>{const edit=e.target.closest('[data-edit-dlc]');if(edit){e.stopPropagation();openDlc(edit.dataset.editDlc);return;}const item=e.target.closest('[data-filter-dlc]');if(item){state.filter={...state.filter,type:'all',dlcs:[item.dataset.filterDlc],workers:[]};saveState();render();}});
$('#workerList').addEventListener('click', e => {

    const edit = e.target.closest('[data-edit-worker]');

    if (edit) {
        e.stopPropagation();

        openWorker(edit.dataset.editWorker); // завтра заменим на меню

        return;
    }

    const item = e.target.closest('[data-filter-worker]');

    if (item) {
        state.filter = {
            ...state.filter,
            type:'all',
            dlcs:[],
            workers:[item.dataset.filterWorker]
        };

        saveState();
        render();
    }

});
$('#addTaskButton').addEventListener('click',newTask);$('#addWorkerButton').addEventListener('click',()=>{$('#workerForm').reset();$('#workerId').value = '';$('#workerModalTitle').textContent = 'Add Person';$('#saveWorker').textContent = 'Add Person';$('#deleteWorker').classList.add('hidden');openModal('workerModal');});$('#addDlcButton').addEventListener('click',()=>openDlc());$('#dataButton').addEventListener('click',()=>openModal('dataModal'));
$$('[data-close-modal]').forEach(b=>b.addEventListener('click',closeModal));$('#modalBackdrop').addEventListener('click',e=>{if(e.target===$('#modalBackdrop'))closeModal();});$('#taskType').addEventListener('change',updateTaskFormType);
$('#taskForm').addEventListener('submit',e=>{e.preventDefault();const id=$('#taskId').value,task={id:id||uid('task'),title:$('#taskTitle').value.trim(),type:$('#taskType').value,dlcId:$('#taskDlc').value,workerId:$('#taskWorker').value,start:$('#taskStart').value,end:$('#taskEnd').value,status:$('#taskStatus').value,color:$('#taskColor').value,note:$('#taskNote').value.trim(),image:draftImage};if(!task.title)return;if(new Date(task.end)<new Date(task.start)){toast('Deadline cannot be before the start date');return;}if(id)state.tasks=state.tasks.map(t=>t.id===id?task:t);else state.tasks.push(task);saveState();closeModal();render();toast(task.status==='done'?'Item moved to archive':'Item saved');});
$('#workerForm').addEventListener('submit', e => {

    e.preventDefault();

    const id = $('#workerId').value;
    const name = $('#workerName').value.trim();

    if (!name) return;

    // Проверяем дубликаты (кроме самого себя)
    const exists = state.workers.some(w =>
        w.name.toLowerCase() === name.toLowerCase() &&
        w.id !== id
    );

    if (exists) {
        toast('This person is already on the list');
        return;
    }

    if (id) {

        const worker = state.workers.find(w => w.id === id);

        const oldName = worker.name;

        worker.name = name;

        // Обновляем все задачи
        state.tasks.forEach(task => {

            if (task.workerId === oldName)
                task.workerId = name;

        });

    } else {

        state.workers.push({
            id: uid('worker'),
            name
        });

    }

    saveState();

    closeModal();

    render();

    toast(id ? 'Worker updated' : 'Person added');

});
$('#dlcForm').addEventListener('submit',e=>{e.preventDefault();const id=$('#dlcId').value,name=$('#dlcName').value.trim(),lockDate=$('#dlcLockDate').value;if(!name||!lockDate)return;if(id)state.dlcs=state.dlcs.map(d=>d.id===id?{...d,name,lockDate}:d);else state.dlcs.push({id:uid('dlc'),name,lockDate});saveState();closeModal();render();toast(id?'DLC updated':'DLC added');});
$('#deleteDlc').addEventListener('click',()=>{const id=$('#dlcId').value,d=getDlc(id);if(!d)return;if(!confirm(`Delete “${d.name}”? Its items will remain, but will no longer belong to a DLC.`))return;state.dlcs=state.dlcs.filter(x=>x.id!==id);state.tasks=state.tasks.map(t=>t.dlcId===id?{...t,dlcId:''}:t);state.filter.dlcs=state.filter.dlcs.filter(x=>x!==id);saveState();closeModal();render();toast('DLC deleted');});
$('#deleteWorker').addEventListener('click', () => {

    const id = $('#workerId').value;

    const worker = state.workers.find(w => w.id === id);

    if (!worker)
        return;

    if (!confirm(`Delete "${worker.name}"?`))
        return;

    // снимаем работника со всех задач
    state.tasks.forEach(task => {

        if (task.workerId === worker.name)
            task.workerId = '';

    });

    state.workers = state.workers.filter(w => w.id !== id);

    state.filter.workers =
        state.filter.workers.filter(x => x !== worker.name);

    saveState();

    closeModal();

    render();

    toast("Worker deleted");

});
$('#googleLoginBtn')?.addEventListener('click', loginWithGoogle);
$('#logoutButton')?.addEventListener('click', logout);
$('#taskImage').addEventListener('change',e=>readImage(e.target.files[0]));$('#imageDropzone').addEventListener('click',e=>{if(e.target.id!=='removeImage')$('#taskImage').click();});$('#imageDropzone').addEventListener('keydown',e=>{if(e.key==='Enter')$('#taskImage').click();});document.addEventListener('paste',e=>{if($('#taskModal').classList.contains('hidden'))return;const file=[...e.clipboardData.items].find(x=>x.type.startsWith('image/'))?.getAsFile();if(file){e.preventDefault();readImage(file);toast('Screenshot added');}});$('#removeImage').addEventListener('click',e=>{e.stopPropagation();setPreview('');});
$('#filterbar').addEventListener('click',e=>{const pill=e.target.closest('.filter-pill');if(pill){state.filter.type=pill.dataset.value;saveState();render();}const logic=e.target.closest('.logic-button');if(logic){state.filter.logic=logic.dataset.logic;saveState();render();}});$('#dlcFilter').addEventListener('click',e=>{e.stopPropagation();showFilter('dlc',$('#dlcFilter'));});$('#workerFilter').addEventListener('click',e=>{e.stopPropagation();showFilter('worker',$('#workerFilter'));});document.addEventListener('click',e=>{if(!e.target.closest('#filterPopover')&&!e.target.closest('.filter-select'))$('#filterPopover').classList.add('hidden');});$('#clearFilters').addEventListener('click',()=>{state.filter={type:'all',dlcs:[],workers:[],logic:'AND'};saveState();render();});
$('#zoomIn').addEventListener('click',()=>{state.zoom=Math.min(2,state.zoom+1);saveState();render();});$('#zoomOut').addEventListener('click',()=>{state.zoom=Math.max(0,state.zoom-1);saveState();render();});$('#todayButton').addEventListener('click',()=>{const range=timelineRange(),left=dayDiff(range.start,dateISO(new Date()))*currentZoom().px;$('#ganttScroll').scrollLeft=Math.max(0,left-220);});
$('#taskRows').addEventListener('dblclick',e=>{const title=e.target.closest('.task-row')?.querySelector('.task-title')?.textContent,task=state.tasks.find(t=>t.title===title&&!isArchived(t));if(task)editTask(task.id);});$('#timelineBody').addEventListener('dblclick',e=>{const bar=e.target.closest('.task-bar');if(bar)editTask(bar.dataset.taskId);});$('#archiveGrid').addEventListener('click',e=>{const btn=e.target.closest('[data-restore]');if(btn){const task=state.tasks.find(t=>t.id===btn.dataset.restore);task.status='progress';saveState();render();toast('Item returned to work');}});
$('#exportButton').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`assetline-backup-${dateISO(new Date())}.json`;a.click();URL.revokeObjectURL(a.href);toast('Backup downloaded');});$('#importInput').addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const data=JSON.parse(reader.result);if(!Array.isArray(data.tasks)||!Array.isArray(data.dlcs)||!Array.isArray(data.workers))throw new Error();state={...defaultState,...data,filter:{...defaultState.filter,...(data.filter||{})}};saveState();closeModal();render();toast('Data imported');}catch{toast('Could not read that file');}};reader.readAsText(file);});
loadCloudState();
initAuth();