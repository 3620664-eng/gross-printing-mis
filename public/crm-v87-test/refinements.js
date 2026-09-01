// Small TEST-only refinements layered after the main preview scripts.
// Keeps the live Synology CRM untouched.

// Richer fake customer details for the browser TEST.
Object.assign(customers.find(c=>c.id===1),{address:'25 Main Street',city:'Monsey',state:'NY',zip:'10952',notes:'Main bakery account'});
Object.assign(customers.find(c=>c.id===2),{address:'120 School Road',city:'Spring Valley',state:'NY',zip:'10977',notes:'School office'});
Object.assign(customers.find(c=>c.id===3),{address:'18 Route 59',city:'Airmont',state:'NY',zip:'10952',notes:'Realty office'});

// Preserve a stable “latest moved to this stage” order.
jobs.forEach((j,i)=>{ if(!j._stageOrder) j._stageOrder=Date.parse(j.created||j.due||'2000-01-01')+(jobs.length-i); });

function stageJobs(stageKey){
  return jobs.filter(j=>j.status===stageKey).slice().sort((a,b)=>(b._stageOrder||0)-(a._stageOrder||0));
}

// Override the TEST board so every newly moved card lands at the TOP of its new column.
board=function(){
  $('#view').innerHTML=`<div class="boardWrap"><div class="board">${workflow.filter(x=>x.show).map(s=>`<div class="col"><div class="colHead"><span>${s.label}</span><span class="pill">${jobs.filter(j=>j.status===s.key).length}</span></div><div class="colJobs" data-status="${s.key}" ondragover="dragOver(event)" ondragleave="dragLeave(event)" ondrop="dropJob(event,'${s.key}')">${stageJobs(s.key).map(j=>`<div class="card" draggable="true" data-job="${j.id}" ondragstart="dragStart(event,${j.id})" ondragend="dragEnd(event)" onclick="if(!window.justDragged)openJob(${j.id})"><div class="dragGrip" aria-hidden="true">⋮⋮</div><span class="num">#${j.num}</span><h3>${j.title}</h3><div class="meta">${cname(j)}</div><div class="meta">Needed ${j.due}</div></div>`).join('')}</div></div>`).join('')}</div></div>`;
};

dropJob=function(e,status){
  e.preventDefault();
  e.currentTarget.classList.remove('dragover');
  const id=draggedJobId||Number(e.dataTransfer?.getData('text/plain'));
  const j=jobs.find(x=>x.id===id);
  if(j){
    j.status=status;
    j._stageOrder=Date.now();
    board();
  }
  setTimeout(()=>window.justDragged=false,160);
};

function customerAddress(c){
  return [c.address,c.city,[c.state,c.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')||'—';
}

function customerJobLine(j,customerId){
  return `<div class="jobRow clickRow" onclick="openJob(${j.id},${customerId})"><div><strong>#${j.num} · ${html(j.title)}</strong><span class="muted">${j.due} · ${label(j.status)}</span></div><div><span class="status ${j.status}">${label(j.status)}</span><button class="btn small" onclick="event.stopPropagation();openJob(${j.id},${customerId})">Open</button></div></div>`;
}

openCustomer=function(id){
  const c=customers.find(x=>x.id===id);
  const js=jobs.filter(j=>j.cid===id);
  const ps=payments.filter(p=>js.some(j=>j.id===p.jid));
  const paid=ps.reduce((s,p)=>s+p.amount,0);
  const out=js.reduce((s,j)=>s+balance(j),0);
  modal(c.name,`
    <div class="panel" style="margin-bottom:12px">
      <div class="panelHead"><h2>Customer Information</h2><button class="btn small" onclick="editCustomerForm(${id})">Edit Customer</button></div>
      <div class="panelBody"><div class="infoGrid">
        <div class="info"><small>Customer / Company</small><strong>${html(c.company||c.name||'—')}</strong></div>
        <div class="info"><small>Phone</small><strong>${html(c.phone||'—')}</strong></div>
        <div class="info"><small>Email</small><strong>${html(c.email||'—')}</strong></div>
        <div class="info"><small>Customer Since</small><strong>${html(c.created||'—')}</strong></div>
        <div class="info span2"><small>Address</small><strong>${html(customerAddress(c))}</strong></div>
        <div class="info span2"><small>Notes</small><strong>${html(c.notes||'—')}</strong></div>
      </div></div>
    </div>
    <div class="stats">
      <div class="stat"><span>Outstanding</span><strong>${money(out)}</strong></div>
      <div class="stat"><span>Paid all time</span><strong class="money">${money(paid)}</strong></div>
      <div class="stat"><span>Total jobs</span><strong>${js.length}</strong></div>
      <div class="stat"><span>Open jobs</span><strong>${js.filter(j=>j.status!=='paid').length}</strong></div>
    </div>
    <div class="grid2">
      <div class="panel"><div class="panelHead"><h2>Jobs</h2></div><div class="panelBody">${js.map(j=>customerJobLine(j,id)).join('')||'<div class="empty">No jobs yet.</div>'}</div></div>
      <div class="panel"><div class="panelHead"><h2>Full Payment History</h2></div><div class="panelBody">${ps.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(p=>`<div class="payRow clickRow" onclick="openJob(${p.jid},${id})"><span>${p.date} · #${jobs.find(j=>j.id===p.jid).num}</span><strong class="money">${money(p.amount)}</strong></div>`).join('')||'<div class="empty">No payments yet</div>'}</div></div>
    </div>`,
    `<button class="btn danger" onclick="alert('TEST only: Admin Delete Customer with typed confirmation')">Delete Customer</button><button class="btn" onclick="closeModal()">Close</button>`
  );
};

openJob=function(id,fromCustomerId=null){
  const j=jobs.find(x=>x.id===id);
  const back=fromCustomerId?`<div style="margin-bottom:12px"><button class="btn" onclick="openCustomer(${fromCustomerId})">← Back to Customer</button></div>`:'';
  const backFoot=fromCustomerId?`<button class="btn" onclick="openCustomer(${fromCustomerId})">← Back to Customer</button>`:'';
  modal(`Job #${j.num}`,`${back}<div class="infoGrid"><div class="info"><small>Customer</small><strong>${cname(j)}</strong></div><div class="info"><small>Product</small><strong>${j.product}</strong></div><div class="info"><small>Status</small><strong>${label(j.status)}</strong></div><div class="info"><small>Needed by</small><strong>${j.due}</strong></div><div class="info"><small>Quantity</small><strong>${j.qty||'—'}</strong></div><div class="info"><small>Size</small><strong>${j.size||'—'}</strong></div><div class="info"><small>Material</small><strong>${j.paper||'—'}</strong></div><div class="info"><small>Balance</small><strong>${money(balance(j))}</strong></div></div><h3 class="sectionTitle">Job Files</h3><div class="files">${j.files.length?j.files.map(f=>fileRow(f,j)).join(''):'<div class="empty">No files yet.</div>'}</div><h3 class="sectionTitle">Payment</h3><div class="infoGrid"><div class="info"><small>Price</small><strong>${money(j.price)}</strong></div><div class="info"><small>Paid</small><strong class="money">${money(j.paid)}</strong></div><div class="info"><small>Balance</small><strong>${money(balance(j))}</strong></div></div>`,`${backFoot}<button class="btn" onclick="openJobForm(${j.id})">Edit Job</button><button class="btn primary" onclick="alert('TEST payment entry screen')">Record Payment</button><button class="btn" onclick="closeModal()">Close</button>`);
};

function customerFormBody(c={}){
  return `<div class="formGrid">
    <label>Name<input id="custName" value="${html(c.name||'')}" placeholder="Customer name"></label>
    <label>Company<input id="custCompany" value="${html(c.company||'')}"></label>
    <label>Phone<input id="custPhone" value="${html(c.phone||'')}"></label>
    <label>Email<input id="custEmail" value="${html(c.email||'')}"></label>
    <label class="span2">Street Address<input id="custAddress" value="${html(c.address||'')}"></label>
    <label>City<input id="custCity" value="${html(c.city||'')}"></label>
    <label>State<input id="custState" value="${html(c.state||'NY')}"></label>
    <label>ZIP<input id="custZip" value="${html(c.zip||'')}"></label>
    <label class="span2">Notes<textarea id="custNotes" rows="3">${html(c.notes||'')}</textarea></label>
  </div>`;
}

openCustomerForm=function(){
  modal('New Customer',customerFormBody(),`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="alert('TEST preview saved — no real data changed');closeModal()">Add Customer</button>`,{lock:true});
};

function editCustomerForm(id){
  const c=customers.find(x=>x.id===id);
  modal(`Edit Customer — ${html(c.name)}`,customerFormBody(c),`<button class="btn" onclick="openCustomer(${id})">Cancel</button><button class="btn primary" onclick="saveTestCustomer(${id})">Save Changes</button>`,{lock:true});
}

function saveTestCustomer(id){
  const c=customers.find(x=>x.id===id);
  c.name=$('#custName').value.trim()||c.name;
  c.company=$('#custCompany').value.trim();
  c.phone=$('#custPhone').value.trim();
  c.email=$('#custEmail').value.trim();
  c.address=$('#custAddress').value.trim();
  c.city=$('#custCity').value.trim();
  c.state=$('#custState').value.trim();
  c.zip=$('#custZip').value.trim();
  c.notes=$('#custNotes').value.trim();
  openCustomer(id);
}
