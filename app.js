// ===== Strong, Reliable Storage (with backups) =====
const STORAGE_KEY = 'todo-stylish-v1';
const BACKUP_KEY  = 'todo-stylish-backups-v1'; // array of {ts, data}

/** @typedef {{id:string,title:string,date:string,time:string,notes?:string,done:boolean,notified:boolean,created:number}} Task */
/** @type {Task[]} */
let tasks = load();

function load(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && raw !== '[]') return JSON.parse(raw);

    // Fallback: latest backup if main is empty
    const backups = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
    if (Array.isArray(backups) && backups.length) {
      const latest = backups.sort((a,b)=>b.ts - a.ts)[0];
      if (latest && latest.data && latest.data.length) {
        console.warn('Restored from backup:', new Date(latest.ts).toLocaleString());
        return latest.data;
      }
    }
  } catch {}
  return [];
}

function save(){
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    // Keep rolling backups (max 3)
    const backups = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]');
    backups.push({ ts: Date.now(), data: tasks });
    while (backups.length > 3) backups.shift();
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backups));
  } catch (e) {
    console.error('Save failed', e);
  }
}

// Ask browser to keep storage persistent (reduces auto-clear on mobile)
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then(g => {
    console.log('Persistent storage', g ? 'GRANTED' : 'not granted');
  });
}

// ===== Elements =====
const form = document.getElementById('taskForm');
const titleEl = document.getElementById('title');
const dateEl  = document.getElementById('date');
const timeEl  = document.getElementById('time');
const notesEl = document.getElementById('notes');
const listEl  = document.getElementById('taskList');
const notifyBtn = document.getElementById('notifyBtn');

// ===== Notifications =====
notifyBtn.addEventListener('click', async () => {
  if (!('Notification' in window)) return alert('Notifications not supported');
  const perm = await Notification.requestPermission();
  alert(perm === 'granted' ? '✅ Notifications enabled' : '❌ Blocked — using alert instead');
});

// ===== Helpers =====
function uid(){ return crypto.randomUUID ? crypto.randomUUID() : Date.now()+Math.random(); }
function dueMs(t){
  if(!t.date || !t.time) return;
  const ms = new Date(`${t.date}T${t.time}`).getTime();
  return isFinite(ms) ? ms : undefined;
}
function fmtCountdown(ms){
  const sign = ms < 0 ? -1 : 1;
  const a = Math.abs(ms);
  const s = Math.floor(a/1000)%60, m = Math.floor(a/60000)%60, h = Math.floor(a/3600000)%24, d = Math.floor(a/86400000);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}h`);
  if (m || h || d) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return sign < 0 ? `overdue ${parts.join(' ')}` : `in ${parts.join(' ')}`;
}
function statusClass(ms){
  if (ms < 0) return 'late';
  if (ms <= 60*60*1000) return 'soon';
  return '';
}
function escapeHtml(s){
  return (s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function wrapEveryNWords(text, n=100){
  const w = (text||'').split(/\s+/).filter(Boolean);
  if(!w.length) return '';
  const out=[]; for(let i=0;i<w.length;i+=n) out.push(w.slice(i,i+n).join(' '));
  return out.join("\n"); // respected via CSS white-space: pre-wrap
}

// ===== CRUD =====
function addTask(title, date, time, notes){
  tasks.push({ id: uid(), title, date, time, notes, done:false, notified:false, created: Date.now() });
  save(); render();
}
function removeTask(id){
  tasks = tasks.filter(t => t.id !== id);
  save(); render();
}
function toggleDone(id){
  tasks = tasks.map(t =>
    t.id === id ? { ...t, done:!t.done, notified: !(!t.done) } : t
  );
  save(); render();
}

// ===== Sorting (live on top, overdue first, soonest due next; completed at bottom) =====
function sortScore(t){
  const d = dueMs(t);
  if (t.done) return [1, Infinity, -t.created];      // completed → bottom
  if (d === undefined) return [0, Infinity, -t.created]; // no due → after timed
  const diff = d - Date.now();
  const overdue = diff < 0 ? -1 : 0;                 // overdue float to very top
  return [0, overdue, d];
}

// ===== Render =====
function render(){
  listEl.innerHTML = "";
  const sorted = [...tasks].sort((a,b)=>{
    const A = sortScore(a), B = sortScore(b);
    return A[0]-B[0] || A[1]-B[1] || A[2]-B[2];
  });
  sorted.forEach(t => listEl.appendChild(taskRow(t)));
}

function taskRow(t){
  const li=document.createElement("li");
  li.className="task"+(t.done?" done":"");

  const id=`cd-${t.id}`;
  const wrapped=wrapEveryNWords(t.title,100);

  li.innerHTML=`
    <input type="checkbox" ${t.done?'checked':''} aria-label="mark done"/>
    <div>
      <div class="title">${escapeHtml(wrapped)}</div>
      <div class="meta">
        <span class="badge" id="${id}"></span>
        ${t.notes?`<span class="badge note-chip" data-id="${t.id}">📝 Notes</span>`:""}
      </div>
      ${t.notes?`<div class="note-body collapsed" id="note-${t.id}">${escapeHtml(t.notes)}</div>`:""}
    </div>
    <div class="row-actions">
      <button class="ghost" data-edit="${t.id}">Edit</button>
      <button class="danger" data-del="${t.id}">Delete</button>
    </div>
  `;

  li.querySelector("input").onclick=()=>toggleDone(t.id);
  const delBtn = li.querySelector("[data-del]");
  const editBtn = li.querySelector("[data-edit]");
  if(delBtn) delBtn.onclick=()=>removeTask(t.id);
  if(editBtn) editBtn.onclick=()=>editTask(t.id);

  const chip=li.querySelector(`[data-id="${t.id}"]`);
  if(chip) chip.onclick=()=>{
    const el = document.getElementById(`note-${t.id}`);
    if (el) el.classList.toggle("collapsed");
  };

  updateBadge(t,id);
  return li;
}

function updateBadge(t,id){
  const el=document.getElementById(id);
  if(!el) return;

  if(t.done){
    el.textContent="✔ Completed";
    el.className="badge";
    return;
  }
  const due = dueMs(t);
  if(!due){
    el.textContent="⏳ —";
    el.className="badge";
    return;
  }
  const diff = due - Date.now();
  el.textContent=`⏳ ${t.date} ${t.time} • ${fmtCountdown(diff)}`;
  el.className=`badge ${statusClass(diff)}`;
}

// ===== Edit =====
function editTask(id){
  const t=tasks.find(x=>x.id===id); if(!t) return;
  const nt=prompt("Edit task",t.title); if(nt===null) return;
  const nd=prompt("Edit date (YYYY-MM-DD)",t.date)??t.date;
  const nh=prompt("Edit time (HH:mm)",t.time)??t.time;
  const nn=prompt("Edit notes",t.notes||"")??t.notes;

  Object.assign(t,{
    title:nt.trim()||t.title,
    date:nd.trim()||t.date,
    time:nh.trim()||t.time,
    notes:nn.trim(),
    notified:false
  });
  save(); render();
}

// ===== Form submit =====
form.addEventListener('submit',(e)=>{
  e.preventDefault();
  addTask(titleEl.value.trim(), dateEl.value, timeEl.value, notesEl.value.trim());
  form.reset();
});

// ===== Countdown + Reminder Engine =====
setInterval(()=>{
  const now=Date.now();
  tasks.forEach(t=>{
    const id=`cd-${t.id}`;
    if(t.done){ updateBadge(t,id); return; } // timer stopped for done
    updateBadge(t,id);                        // update countdown label
    const due=dueMs(t);
    if(due && now>=due && !t.notified){
      notify(t);
      t.notified=true; save(); render();
    }
  });
},1000);

function notify(t){
  if("Notification" in window && Notification.permission==="granted"){
    new Notification("Reminder: "+t.title,{body:`${t.date} ${t.time}`});
  } else {
    alert(`Reminder:\n${t.title}\n${t.date} ${t.time}`);
  }
}

// ===== Extra reliability: save on hide/close + autosave =====
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save();
});
window.addEventListener('pagehide', save);
setInterval(() => save(), 10000);

// ===== First run sample =====
if(tasks.length===0){
  const d=new Date(Date.now()+5*60000);
  addTask("Welcome! Add tasks. Tick to stop timer & push to bottom. Tap 📝 Notes to expand.", d.toISOString().slice(0,10), d.toTimeString().slice(0,5), "This reminds in 5 minutes.");
}

// Initial render
render();
