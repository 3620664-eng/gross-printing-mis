function dashboard(){
  const out=jobs.reduce((s,j)=>s+balance(j),0);
  $('#view').innerHTML=`<div class="stats">
    <div class="stat"><span>Open jobs</span><strong>${jobs.filter(j=>j.status!=='paid').length}</strong></div>
    <div class="stat"><span>Due today</span><strong>${jobs.filter(j=>j.due===d(0)&&j.status!=='paid').length}</strong></div>
    <div class="stat"><span>Needs price</span><strong>${jobs.filter(j=>j.status==='price').length}</strong></div>
    <div class="stat"><span>Outstanding</span><strong class="money">${money(out)}</strong></div>
  </div>
  <div class="grid2">
    <div class="panel"><div class="panelHead"><h2>Needs attention</h2><button class="btn small" onclick="setPage('board')">Open Board</button></div><div class="panelBody">${jobs.filter(j=>j.status!=='paid').slice(0,4).map(jobLine).join('')}</div></div>
    <div class="panel"><div class="panelHead"><h2>Recent payments</h2><button class="btn small" onclick="setPage('payments')">Payments</button></div><div class="panelBody">${payments.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(p=>{const j=jobs.find(x=>x.id===p.jid);return `<div class="payRow clickRow" onclick="openJob(${j.id})"><div><strong>${cname(j)}</strong><span class="muted"> #${j.num} · ${p.date}</span></div><strong class="money">${money(p.amount)}</strong></div>`}).join('')}</div></div>
  </div>`;
}

function jobLine(j){
  return `<div class="jobRow clickRow" onclick="openJob(${j.id})"><div><strong>#${j.num} · ${j.title}</strong><span class="muted">${cname(j)} · ${j.due}</span></div><div><span class="status ${j.status}">${label(j.status)}</span><button class="btn small" onclick="event.stopPropagation();openJob(${j.id})">Open</button></div></div>`;
}

let draggedJobId=null;window.justDragged=false;
function board(){
  $('#view').innerHTML=`<div class="boardWrap"><div class="board">${workflow.filter(x=>x.show).map(s=>`<div class="col"><div class="colHead"><span>${s.label}</span><span class="pill">${jobs.filter(j=>j.status===s.key).length}</span></div><div class="colJobs" data-status="${s.key}" ondragover="dragOver(event)" ondragleave="dragLeave(event)" ondrop="dropJob(event,'${s.key}')">${jobs.filter(j=>j.status===s.key).map(j=>`<div class="card" draggable="true" data-job="${j.id}" ondragstart="dragStart(event,${j.id})" ondragend="dragEnd(event)" onclick="if(!window.justDragged)openJob(${j.id})"><div class="dragGrip" aria-hidden="true">⋮⋮</div><span class="num">#${j.num}</span><h3>${j.title}</h3><div class="meta">${cname(j)}</div><div class="meta">Needed ${j.due}</div></div>`).join('')}</div></div>`).join('')}</div></div>`;
}
function dragStart(e,id){draggedJobId=id;window.justDragged=true;e.currentTarget.classList.add('dragging');if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(id))}}
function dragOver(e){e.preventDefault();e.currentTarget.classList.add('dragover');if(e.dataTransfer)e.dataTransfer.dropEffect='move'}
function dragLeave(e){e.currentTarget.classList.remove('dragover')}
function dropJob(e,status){e.preventDefault();e.currentTarget.classList.remove('dragover');const id=draggedJobId||Number(e.dataTransfer?.getData('text/plain'));const j=jobs.find(x=>x.id===id);if(j){j.status=status;board()}setTimeout(()=>window.justDragged=false,160)}
function dragEnd(e){e.currentTarget.classList.remove('dragging');document.querySelectorAll('.colJobs').forEach(x=>x.classList.remove('dragover'));setTimeout(()=>window.justDragged=false,160)}

function customerPage(){
  $('#view').innerHTML=`<div class="searchbar"><input id="cq" placeholder="Search customers…" oninput="drawCustomers()"><select id="csort" onchange="customerSort=this.value;drawCustomers()"><option value="name_asc">Name A–Z</option><option value="name_desc">Name Z–A</option><option value="date_desc">Newest customer</option><option value="date_asc">Oldest customer</option><option value="out_desc">Most outstanding</option></select></div><div class="panel"><div class="panelBody" id="customerList"></div></div>`;
  $('#csort').value=customerSort;drawCustomers();
}
function drawCustomers(){
  const q=($('#cq')?.value||'').toLowerCase();let list=customers.filter(c=>[c.name,c.company,c.phone,c.email].join(' ').toLowerCase().includes(q));
  list.sort((a,b)=>customerSort==='name_desc'?b.name.localeCompare(a.name):customerSort==='date_desc'?b.created.localeCompare(a.created):customerSort==='date_asc'?a.created.localeCompare(b.created):customerSort==='out_desc'?customerOutstanding(b.id)-customerOutstanding(a.id):a.name.localeCompare(b.name));
  $('#customerList').innerHTML=list.map(c=>{const js=jobs.filter(j=>j.cid===c.id);return `<div class="customerRow clickRow" onclick="openCustomer(${c.id})"><div><strong>${c.name}</strong><span class="muted">${c.phone} · ${c.email} · Added ${c.created}</span></div><div><span class="pill">${js.filter(j=>j.status!=='paid').length} open · ${js.length} total</span><span class="pill">Owes ${money(customerOutstanding(c.id))}</span><button class="btn small" onclick="event.stopPropagation();openCustomer(${c.id})">Open</button></div></div>`}).join('')||'<div class="empty">No customers found.</div>';
}

function jobsPage(){
  $('#view').innerHTML=`<div class="searchbar"><input id="jq" placeholder="Search job #, customer, description…" oninput="drawJobs()"><select id="js" onchange="drawJobs()"><option value="">All statuses</option>${workflow.map(s=>`<option value="${s.key}">${s.label}</option>`).join('')}</select></div><div class="tableWrap"><table class="table"><thead><tr><th>Job</th><th>Customer</th><th>Status</th><th>Created</th><th>Needed by</th><th>Worker</th><th>Price</th><th></th></tr></thead><tbody id="jbody"></tbody></table></div>`;drawJobs();
}
function drawJobs(){
  const q=($('#jq')?.value||'').toLowerCase(),s=$('#js')?.value||'';
  $('#jbody').innerHTML=jobs.filter(j=>(!s||j.status===s)&&[j.num,j.title,cname(j),j.product,j.paper].join(' ').toLowerCase().includes(q)).map(j=>`<tr class="clickRow" onclick="openJob(${j.id})"><td><strong>#${j.num}</strong><br>${j.title}</td><td>${cname(j)}</td><td><span class="status ${j.status}">${label(j.status)}</span></td><td>${j.created||'—'}</td><td>${j.due}</td><td>${j.worker}</td><td><strong>${money(j.price)}</strong></td><td><button class="btn small primary" onclick="event.stopPropagation();openJob(${j.id})">Open</button></td></tr>`).join('');
}

function paymentsPage(){
  $('#view').innerHTML=`<div class="toolbar"><strong>Payments</strong><label>Range <select id="pr" onchange="setPaymentRange(this.value)"><option value="today">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="365">Last year</option><option value="all">All time</option><option value="custom">Custom dates</option></select></label><span id="customDates" class="hidden"><input type="date" id="pf"> to <input type="date" id="pt"><button class="btn small" onclick="applyCustomPayments()">Apply</button></span><label>Sort <select id="psort" onchange="paymentSort=this.value;drawPaymentArea()"><option value="date_desc">Date — newest first</option><option value="date_asc">Date — oldest first</option><option value="amount_desc">Payment — highest first</option><option value="amount_asc">Payment — lowest first</option><option value="oldest_unpaid">Oldest unpaid first</option></select></label></div><div id="payarea"></div>`;
  $('#pr').value=paymentRange;$('#psort').value=paymentSort;$('#customDates').classList.toggle('hidden',paymentRange!=='custom');drawPaymentArea();
}
function setPaymentRange(r){paymentRange=r;$('#customDates').classList.toggle('hidden',r!=='custom');if(r!=='custom')drawPaymentArea()}
function applyCustomPayments(){paymentRange='custom';drawPaymentArea()}
function paymentWindow(){let from='0000-00-00',to='9999-12-31';if(paymentRange!=='all'&&paymentRange!=='custom'){const days=paymentRange==='today'?0:Number(paymentRange)-1;const x=new Date(Date.now()-days*864e5);from=x.toISOString().slice(0,10);to=d(0)}if(paymentRange==='custom'){from=$('#pf')?.value||'0000-00-00';to=$('#pt')?.value||'9999-12-31'}return [from,to]}
function drawPaymentArea(){
  const [from,to]=paymentWindow(),ps=payments.filter(p=>p.date>=from&&p.date<=to),received=ps.reduce((s,p)=>s+p.amount,0),out=jobs.reduce((s,j)=>s+balance(j),0);let body='';
  if(paymentSort==='oldest_unpaid'){
    const unpaid=jobs.filter(j=>balance(j)>0).sort((a,b)=>(a.created||a.due).localeCompare(b.created||b.due));
    body=`<div class="tableWrap"><table class="table"><thead><tr><th>Created</th><th>Customer</th><th>Job</th><th>Needed</th><th>Original price</th><th>Paid</th><th>Outstanding</th></tr></thead><tbody>${unpaid.map(j=>`<tr class="clickRow" onclick="openJob(${j.id})"><td>${j.created||'—'}</td><td>${cname(j)}</td><td>#${j.num} · ${j.title}</td><td>${j.due}</td><td>${money(j.price)}</td><td>${money(j.paid)}</td><td><strong>${money(balance(j))}</strong></td></tr>`).join('')}</tbody></table></div>`;
  }else{
    ps.sort((a,b)=>paymentSort==='date_asc'?a.date.localeCompare(b.date):paymentSort==='amount_desc'?b.amount-a.amount:paymentSort==='amount_asc'?a.amount-b.amount:b.date.localeCompare(a.date));
    body=`<div class="tableWrap"><table class="table"><thead><tr><th>Date</th><th>Customer</th><th>Job</th><th>Note</th><th>Amount</th></tr></thead><tbody>${ps.map(p=>{const j=jobs.find(x=>x.id===p.jid);return `<tr class="clickRow" onclick="openJob(${j.id})"><td>${p.date}</td><td>${cname(j)}</td><td>#${j.num} · ${j.title}</td><td>${p.note}</td><td class="money"><strong>${money(p.amount)}</strong></td></tr>`}).join('')}</tbody></table></div>`;
  }
  $('#payarea').innerHTML=`<div class="stats"><div class="stat"><span>Payments received</span><strong class="money">${money(received)}</strong></div><div class="stat"><span>Payment entries</span><strong>${ps.length}</strong></div><div class="stat"><span>Outstanding now</span><strong>${money(out)}</strong></div><div class="stat"><span>Customers owing</span><strong>${new Set(jobs.filter(j=>balance(j)>0).map(j=>j.cid)).size}</strong></div></div>${body}`;
}

function searchPage(){
  $('#view').innerHTML=`<div class="searchbar"><input id="sq" autofocus placeholder="Search customer, job #, product…" oninput="doSearch()"></div><div class="panel"><div class="panelBody" id="sres"></div></div>`;
}
function doSearch(){
  const q=$('#sq').value.toLowerCase().trim();if(!q){$('#sres').innerHTML='';return}
  const js=jobs.filter(j=>[j.num,j.title,cname(j),j.product,j.paper].join(' ').toLowerCase().includes(q));const cs=customers.filter(c=>[c.name,c.company,c.phone,c.email].join(' ').toLowerCase().includes(q));
  $('#sres').innerHTML=cs.map(c=>`<div class="customerRow clickRow" onclick="openCustomer(${c.id})"><strong>${c.name}</strong><button class="btn small" onclick="event.stopPropagation();openCustomer(${c.id})">Open</button></div>`).join('')+js.map(jobLine).join('');
}

function settingsPage(){
  $('#view').innerHTML=`<div class="settingsGrid">
    <div class="settingCard" onclick="workflowSettings()"><div class="settingIcon">▦</div><strong>Job Board Workflow</strong><p>Rename, reorder, hide stages, and choose the default.</p><span class="openSetting">Open →</span></div>
    <div class="settingCard" onclick="jobChoicesSettings()"><div class="settingIcon">⌄</div><strong>Job Form Choices</strong><p>Manage dropdown choices and product-specific fields.</p><span class="openSetting">Open →</span></div>
    <div class="settingCard" onclick="userSettings()"><div class="settingIcon">♙</div><strong>Users & Permissions</strong><p>Admin controls for worker access.</p><span class="openSetting">Open →</span></div>
    <div class="settingCard" onclick="backupSettings()"><div class="settingIcon">◫</div><strong>Backup & Safety</strong><p>Backup controls and safety information.</p><span class="openSetting">Open →</span></div>
  </div>`;
}
function settingsBack(){setPage('settings')}
function workflowSettings(){
  $('#view').innerHTML=`<div class="panel"><div class="panelHead"><h2>Job Board Workflow</h2><button class="btn small" onclick="settingsBack()">← Settings</button></div><div class="panelBody"><div class="workflow" id="wf">${workflow.map((s,i)=>`<div class="workflowRow"><strong>${i+1}</strong><input type="text" value="${s.label}" oninput="workflow[${i}].label=this.value"><span class="extra"><button class="btn small" onclick="moveStage(${i},-1)">↑</button><button class="btn small" onclick="moveStage(${i},1)">↓</button></span><label class="extra"><input type="checkbox" ${s.show?'checked':''} onchange="workflow[${i}].show=this.checked"> Show</label><label class="extra"><input type="radio" name="def" ${defaultStatus===s.key?'checked':''} onchange="defaultStatus='${s.key}'"> Default</label></div>`).join('')}</div><div class="settingActions"><button class="btn primary" onclick="setPage('board')">Save & Open Board</button></div></div></div>`;
}
function moveStage(i,dir){const n=i+dir;if(n<0||n>=workflow.length)return;[workflow[i],workflow[n]]=[workflow[n],workflow[i]];workflowSettings()}

const choiceSections=[
  ['productTypes','Product Types'],['quantities','Quantities'],['sizes','Sizes'],['materials','Paper / Materials'],['colors','Colors'],['sides','Sides'],['bleeds','Bleed'],['finishing','Finishing'],['workers','Workers'],['delivery','Delivery'],['pages','Pages'],['binding','Binding'],['shapes','Shape / Cut'],['lamination','Lamination'],['mounting','Mounting / Grommets']
];
function jobChoicesSettings(tab='choices'){
  $('#view').innerHTML=`<div class="panel"><div class="panelHead"><div><h2>Job Form Choices</h2><div class="miniTabs"><button class="${tab==='choices'?'active':''}" onclick="jobChoicesSettings('choices')">Dropdown Choices</button><button class="${tab==='products'?'active':''}" onclick="jobChoicesSettings('products')">Product Type Fields</button></div></div><button class="btn small" onclick="settingsBack()">← Settings</button></div><div class="panelBody">${tab==='choices'?choicesEditor():productFieldsEditor()}</div></div>`;
}
function choicesEditor(){
  return `<div class="choiceGrid">${choiceSections.map(([key,title])=>`<div class="choiceCard"><div class="choiceCardHead"><strong>${title}</strong><button class="btn small" onclick="addChoice('${key}')">+ Add</button></div><div class="choiceChips">${formChoices[key].map((v,i)=>`<span class="choiceChip">${v}<button title="Remove" onclick="removeChoice('${key}',${i})">×</button></span>`).join('')}</div></div>`).join('')}</div><div class="settingActions"><button class="btn primary" onclick="openJobForm()">Preview New Job Form</button></div>`;
}
function addChoice(key){const v=prompt(`Add ${key.replace(/([A-Z])/g,' $1').toLowerCase()} choice:`);if(!v||!v.trim())return;formChoices[key].push(v.trim());if(key==='productTypes'&&!productFields[v.trim()])productFields[v.trim()]=['qty','size','paper','color','finish'];jobChoicesSettings('choices')}
function removeChoice(key,i){const value=formChoices[key][i];if(!confirm(`Remove “${value}”?`))return;formChoices[key].splice(i,1);if(key==='productTypes')delete productFields[value];jobChoicesSettings('choices')}
function productFieldsEditor(){
  const fields=Object.entries(fieldCatalog);
  return `<div class="productConfigList">${formChoices.productTypes.map(type=>`<div class="productConfig"><div class="productConfigHead"><strong>${type}</strong><span class="muted">Choose what appears when this product is selected.</span></div><div class="fieldChecks">${fields.map(([key,info])=>`<label><input type="checkbox" ${productFields[type]?.includes(key)?'checked':''} onchange="toggleProductField('${escJs(type)}','${key}',this.checked)"> ${info.label}</label>`).join('')}</div></div>`).join('')}</div><div class="settingActions"><button class="btn primary" onclick="openJobForm()">Preview New Job Form</button></div>`;
}
function toggleProductField(type,key,on){productFields[type]=productFields[type]||[];if(on&&!productFields[type].includes(key))productFields[type].push(key);if(!on)productFields[type]=productFields[type].filter(x=>x!==key)}
function escJs(s){return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'")}

function userSettings(){
  $('#view').innerHTML=`<div class="panel"><div class="panelHead"><h2>Users & Permissions</h2><button class="btn small" onclick="settingsBack()">← Settings</button></div><div class="panelBody"><div class="choiceRow"><div><strong>Owner / Admin</strong><span class="muted">Full access including delete, settings and payments.</span></div><span class="pill">Admin</span></div><div class="choiceRow"><div><strong>Production Worker</strong><span class="muted">Jobs and production only.</span></div><button class="btn small" onclick="alert('TEST: permission editor')">Manage</button></div></div></div>`;
}
function backupSettings(){
  $('#view').innerHTML=`<div class="panel"><div class="panelHead"><h2>Backup & Safety</h2><button class="btn small" onclick="settingsBack()">← Settings</button></div><div class="panelBody"><div class="stats"><div class="stat"><span>TEST data</span><strong>Separate</strong></div><div class="stat"><span>Live data</span><strong>Untouched</strong></div></div><div class="choiceRow"><div><strong>Backup Now</strong><span class="muted">In LIVE this creates a timestamped CRM backup.</span></div><button class="btn primary" onclick="alert('TEST only — no real backup created')">Backup Now</button></div><div class="choiceRow"><div><strong>Safety</strong><span class="muted">Customer/job deletes require admin confirmation in LIVE.</span></div><span class="pill">Protected</span></div></div></div>`;
}
