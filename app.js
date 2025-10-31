// ===== Storage =====
const STORAGE_KEY = 'todo-stylish-v1';
/** @typedef {{id:string,title:string,date:string,time:string,notes?:string,done:boolean,notified:boolean,created:number}} Task */
/** @type {Task[]} */
let tasks = load();
function load(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'); } catch { return []; } }
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }

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
  const out=[];
  for(let i=0;i<w.length;i+=n) out.push(w.slice(i,i+n).join(' '));
  return out.join("\n");
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

// ===== Render tasks =====
function render(){
  listEl.innerHTML = "";

  const sorted = [...tasks].sort((a,b)=>{
    const A = sortScore(a), B = sortScore(b);
    return A[0]-B[0] || A[1]-B[1] || A[2]-B[2];
  });

  sorted.forEach(t => listEl.appendChild(taskRow(t)));
}

function sortScore(t){
  const d = dueMs(t);
  if (t.done) return [1, Infinity, -t.created]; // bottom
  if (d === undefined) return [0, Infinity, -t.created];
  const diff = d - Date.now();
  const overdue = diff < 0 ? -1 : 0;
  return [0, overdue, d];
}

function taskRow(t){
  const li=document.createElement("li");
  li.className="task"+(t.done?" done":"");

  const id=`cd-${t.id}`;
  const due=dueMs(t);
  const wrapped=wrapEveryNWords(t.title,100);

  li.innerHTML=`
    <input type="checkbox" ${t.done?'checked':''} />
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
  if(li.querySelector("[data-del]")) li.querySelector("[data-del]").onclick=()=>removeTask(t.id);
  if(li.querySelector("[data-edit]")) li.querySelector("[data-edit]").onclick=()=>editTask(t.id);

  const chip=li.querySelector(`[data-id="${t.id}"]`);
  if(chip) chip.onclick=()=>{
    document.getElementById(`note-${t.id}`).classList.toggle("collapsed");
  };

  updateBadge(t,id);

  return li;
}

function updateBadge(t,id){
  const el=document.getElementById(id);
  const due = dueMs(t);

  if(!el) return;
  if(t.done){
    el.textContent="✔ Completed";
    el.className="badge";
    return;
  }
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
  const nd=prompt("Edit date",t.date)??t.date;
  const nh=prompt("Edit time",t.time)??t.time;
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
form.onsubmit=e=>{
  e.preventDefault();
  addTask(titleEl.value.trim(), dateEl.value, timeEl.value, notesEl.value.trim());
  form.reset();
};

// ===== Timer & Reminder =====
setInterval(()=>{
  const now=Date.now();
  tasks.forEach(t=>{
    const id=`cd-${t.id}`;
    if(t.done){ updateBadge(t,id); return; }
    updateBadge(t,id);
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

// ===== First run sample =====
if(tasks.length===0){
  const d=new Date(Date.now()+5*60000);
  addTask("Welcome! Add tasks and tap 📝 Notes to expand.", d.toISOString().slice(0,10), d.toTimeString().slice(0,5), "This will remind in 5 minutes.");
}
render();
