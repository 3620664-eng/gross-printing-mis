// TEST-only refinements layered after the main preview scripts.
// Keeps the live Synology CRM untouched.

// Richer fake customer details for the browser TEST.
Object.assign(customers.find(c=>c.id===1),{contact:'David Berkowitz',address:'25 Main Street',city:'Monsey',state:'NY',zip:'10952',terms:'Due on receipt',notes:'Main bakery account. Call before large deliveries.'});
Object.assign(customers.find(c=>c.id===2),{contact:'School Office',address:'120 School Road',city:'Spring Valley',state:'NY',zip:'10977',terms:'Net 30',notes:'School office. Purchase order usually required.'});
Object.assign(customers.find(c=>c.id===3),{contact:'Sam Greenbaum',address:'18 Route 59',city:'Airmont',state:'NY',zip:'10952',terms:'Due on receipt',notes:'Realty office. Pickup unless noted otherwise.'});

Object.assign(jobs.find(j=>j.id===1),{notes:'Freezer-safe adhesive. Keep the red border exactly as approved.'});
Object.assign(jobs.find(j=>j.id===2),{notes:'24 pages plus cover. Fold and saddle stitch.'});
Object.assign(jobs.find(j=>j.id===3),{notes:'Outdoor signs. Grommets in four corners.'});

// Preserve a stable “latest moved to this stage” order.
jobs.forEach((j,i)=>{ if(!j._stageOrder) j._stageOrder=Date.parse(j.created||j.due||'2000-01-01')+(jobs.length-i); });
function stageJobs(stageKey){ return jobs.filter(j=>j.status===stageKey).slice().sort((a,b)=>(b._stageOrder||0)-(a._stageOrder||0)); }

// Every moved card lands at the TOP of the destination column.
board=function(){
  $('#view').innerHTML=`<div class="boardWrap"><div class="board">${workflow.filter(x=>x.show).map(s=>`<div class="col"><div class="colHead"><span>${s.label}</span><span class="pill">${jobs.filter(j=>j.status===s.key).length}</span></div><div class="colJobs" data-status="${s.key}" ondragover="dragOver(event)" ondragleave="dragLeave(event)" ondrop="dropJob(event,'${s.key}')">${stageJobs(s.key).map(j=>`<div class="card" draggable="true" data-job="${j.id}" ondragstart="dragStart(event,${j.id})" ondragend="dragEnd(event)" onclick="if(!window.justDragged)openJob(${j.id})"><div class="dragGrip" aria-hidden="true">⋮⋮</div><span class="num">#${j.num}</span><h3>${j.title}</h3><div class="meta">${cname(j)}</div><div class="meta">Needed ${j.due}</div></div>`).join('')}</div></div>`).join('')}</div></div>`;
};

dropJob=function(e,status){
  e.preventDefault();e.currentTarget.classList.remove('dragover');
  const id=draggedJobId||Number(e.dataTransfer?.getData('text/plain'));const j=jobs.find(x=>x.id===id);
  if(j){j.status=status;j._stageOrder=Date.now();board()}
  setTimeout(()=>window.justDragged=false,160);
};

function customerAddress(c){ return [c.address,c.city,[c.state,c.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')||'—'; }
function detailItem(labelText,value,extra=''){ if(value===undefined||value===null||value==='')return'';return `<div class="detailItem ${extra}"><span>${labelText}</span><strong>${html(value)}</strong></div>`; }
function customerJobLine(j,customerId){
  return `<div class="jobRow clickRow customerJobRow" onclick="openJob(${j.id},${customerId})"><div><strong>#${j.num} · ${html(j.title)}</strong><span class="muted">${html(j.product||'')} · Needed ${j.due}</span></div><div><span class="status ${j.status}">${label(j.status)}</span><button class="btn small" onclick="event.stopPropagation();openJob(${j.id},${customerId})">Open</button></div></div>`;
}

openCustomer=function(id){
  const c=customers.find(x=>x.id===id),js=jobs.filter(j=>j.cid===id),ps=payments.filter(p=>js.some(j=>j.id===p.jid));
  const paid=ps.reduce((s,p)=>s+p.amount,0),out=js.reduce((s,j)=>s+balance(j),0),open=js.filter(j=>j.status!=='paid').length;
  modal(c.name,`
    <div class="detailHero customerHero">
      <div class="detailHeroIcon">${html((c.name||'?').slice(0,1).toUpperCase())}</div>
      <div class="detailHeroMain"><div class="eyebrow">CUSTOMER</div><h2>${html(c.name)}</h2><p>${html(c.company||c.name)}${c.contact?` · Contact: ${html(c.contact)}`:''}</p></div>
      <div class="detailHeroActions"><button class="btn" onclick="editCustomerForm(${id})">Edit Customer</button><button class="btn primary" onclick="closeModal();openJobForm(null,${id})">+ New Job</button></div>
    </div>
    <div class="customerSummaryGrid">
      <div class="summaryCard alertCard"><span>Outstanding</span><strong>${money(out)}</strong><small>${open} open job${open===1?'':'s'}</small></div>
      <div class="summaryCard goodCard"><span>Paid All Time</span><strong>${money(paid)}</strong><small>${ps.length} payment entr${ps.length===1?'y':'ies'}</small></div>
      <div class="summaryCard"><span>Total Jobs</span><strong>${js.length}</strong><small>Since ${html(c.created||'—')}</small></div>
      <div class="summaryCard"><span>Payment Terms</span><strong class="smallValue">${html(c.terms||'—')}</strong><small>Customer account</small></div>
    </div>
    <div class="detailSection">
      <div class="sectionBar"><div><span class="sectionKicker">CONTACT</span><h3>Customer Information</h3></div><button class="btn small" onclick="editCustomerForm(${id})">Edit Details</button></div>
      <div class="detailGrid customerInfoGrid">
        ${detailItem('Company',c.company||c.name)}${detailItem('Contact Person',c.contact||'—')}${detailItem('Phone',c.phone||'—')}${detailItem('Email',c.email||'—')}
        ${detailItem('Street Address',c.address||'—','wide')}${detailItem('City',c.city||'—')}${detailItem('State',c.state||'—')}${detailItem('ZIP',c.zip||'—')}
        ${detailItem('Notes',c.notes||'—','wide2')}
      </div>
    </div>
    <div class="detailTwoCol">
      <div class="detailSection"><div class="sectionBar"><div><span class="sectionKicker">WORK</span><h3>Jobs</h3></div><span class="countBadge">${js.length}</span></div><div class="sectionList">${js.slice().sort((a,b)=>(b.created||'').localeCompare(a.created||'')).map(j=>customerJobLine(j,id)).join('')||'<div class="empty">No jobs yet.</div>'}</div></div>
      <div class="detailSection"><div class="sectionBar"><div><span class="sectionKicker">MONEY</span><h3>Payment History</h3></div><span class="countBadge">${ps.length}</span></div><div class="sectionList">${ps.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(p=>{const j=jobs.find(x=>x.id===p.jid);return `<div class="payRow clickRow paymentHistoryRow" onclick="openJob(${p.jid},${id})"><div><strong>${p.date}</strong><span class="muted">#${j.num} · ${html(j.title)}</span></div><strong class="money">${money(p.amount)}</strong></div>`}).join('')||'<div class="empty">No payments yet.</div>'}</div></div>
    </div>`,
    `<button class="btn danger" onclick="alert('TEST only: Admin Delete Customer with typed confirmation')">Delete Customer</button><button class="btn" onclick="closeModal()">Close</button>`
  );
};

function jobSpecItems(j){
  const items=[['Quantity',j.qty],['Finished Size',j.size],['Paper / Material',j.paper],['Color',j.color],['Sides',j.sides],['Bleed',j.bleed],['Finishing',j.finish],['Pages',j.pages],['Binding',j.binding],['Shape / Cut',j.shape],['Lamination',j.lamination],['Mounting / Grommets',j.mounting]];
  return items.filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>detailItem(k,v)).join('');
}

openJob=function(id,fromCustomerId=null){
  const j=jobs.find(x=>x.id===id),c=customers.find(x=>x.id===j.cid);
  const back=fromCustomerId?`<button class="btn backButton" onclick="openCustomer(${fromCustomerId})">← Back to Customer</button>`:'';
  modal(`Job #${j.num}`,`
    ${back?`<div class="backRow">${back}</div>`:''}
    <div class="detailHero jobHero">
      <div class="detailHeroMain"><div class="eyebrow">JOB #${j.num}</div><h2>${html(j.title)}</h2><p>${html(c?.name||'—')} · ${html(j.product||'—')}</p></div>
      <div class="jobHeroRight"><span class="status heroStatus ${j.status}">${label(j.status)}</span><div class="dueBox"><span>Needed By</span><strong>${html(j.due||'—')}</strong></div></div>
    </div>
    <div class="jobQuickGrid">
      <div class="quickCard"><span>Customer</span><strong>${html(cname(j))}</strong><small>${html(c?.phone||'')}</small></div>
      <div class="quickCard"><span>Created</span><strong>${html(j.created||'—')}</strong><small>Order date</small></div>
      <div class="quickCard"><span>Assigned To</span><strong>${html(j.worker||'—')}</strong><small>${html(j.delivery||'')}</small></div>
      <div class="quickCard"><span>Balance</span><strong class="${balance(j)>0?'balanceDue':'money'}">${money(balance(j))}</strong><small>${money(j.paid)} paid</small></div>
    </div>
    <div class="detailSection">
      <div class="sectionBar"><div><span class="sectionKicker">PRODUCTION</span><h3>Job Specifications</h3></div><button class="btn small" onclick="openJobForm(${j.id})">Edit Job</button></div>
      <div class="detailGrid specsGrid">${jobSpecItems(j)}</div>
    </div>
    ${j.notes?`<div class="detailSection"><div class="sectionBar"><div><span class="sectionKicker">NOTES</span><h3>Job Notes</h3></div></div><div class="jobNotes">${html(j.notes)}</div></div>`:''}
    <div class="detailSection">
      <div class="sectionBar"><div><span class="sectionKicker">FILES</span><h3>Job Files</h3></div><span class="countBadge">${j.files.length}</span></div>
      <div class="files polishedFiles">${j.files.length?j.files.map(f=>fileRow(f,j)).join(''):'<div class="empty">No files yet.</div>'}</div>
    </div>
    <div class="detailSection financeSection">
      <div class="sectionBar"><div><span class="sectionKicker">FINANCIAL</span><h3>Price & Payment</h3></div></div>
      <div class="financeGrid"><div><span>Customer Price</span><strong>${money(j.price)}</strong></div><div><span>Paid</span><strong class="money">${money(j.paid)}</strong></div><div><span>Outstanding</span><strong class="${balance(j)>0?'balanceDue':'money'}">${money(balance(j))}</strong></div></div>
    </div>`,
    `${fromCustomerId?`<button class="btn" onclick="openCustomer(${fromCustomerId})">← Back to Customer</button>`:''}<button class="btn" onclick="openJobForm(${j.id})">Edit Job</button><button class="btn primary" onclick="alert('TEST payment entry screen')">Record Payment</button><button class="btn" onclick="closeModal()">Close</button>`
  );
};

function regularSelect(id,labelText,options,current='',extra=''){
  return `<label>${labelText}<select id="${id}" ${extra}><option value="">Choose…</option>${options.map(v=>`<option value="${html(v)}" ${String(v)===String(current)?'selected':''}>${html(v)}</option>`).join('')}</select></label>`;
}

openJobForm=function(id=null,presetCustomerId=null){
  const j=id?jobs.find(x=>x.id===id):null;const cid=j?.cid||presetCustomerId||customers[0]?.id||'';
  modal(j?`Edit Job #${j.num}`:'New Job',`
    <div class="formHero"><div><span class="sectionKicker">${j?'EDIT JOB':'NEW JOB'}</span><h2>${j?html(j.title):'Create a New Job'}</h2><p>Keep the important details together so production can understand the job at a glance.</p></div><div class="formHeroBadge">${j?`#${j.num}`:'NEW'}</div></div>
    <div class="formSection polishedFormSection"><div class="formSectionTitle"><span>1</span><div><h3>Customer & Price</h3><p>Who the job is for and what the customer is paying.</p></div></div><div class="formGrid">
      <label>Customer<select id="fc">${customers.map(c=>`<option value="${c.id}" ${Number(cid)===c.id?'selected':''}>${html(c.name)}</option>`).join('')}</select></label>
      <label>Job Name<input id="ft" value="${html(j?.title||'')}" placeholder="Example: 5,000 #10 Envelopes"></label>
      <label>Customer Price<input id="fp" inputmode="decimal" value="${j?.price??''}" placeholder="0.00"></label>
      ${j?regularSelect('fstatus','Status',workflow.map(s=>s.key),j.status,''):''}
    </div></div>
    <div class="formSection polishedFormSection"><div class="formSectionTitle"><span>2</span><div><h3>Product & Specifications</h3><p>Choose the product first. The fields below change automatically for that product type.</p></div></div><div class="formGrid"><label class="span2">Product Type<select id="fprod" onchange="productChanged(this)"><option value="">Choose…</option>${formChoices.productTypes.map(v=>`<option value="${html(v)}" ${j?.product===v?'selected':''}>${html(v)}</option>`).join('')}<option value="__custom__">+ Add custom…</option></select></label></div><div class="formGrid dynamicFields" id="dynamicFields"></div></div>
    <div class="formSection polishedFormSection"><div class="formSectionTitle"><span>3</span><div><h3>Schedule & Shop</h3><p>Dates, assignment and delivery.</p></div></div><div class="formGrid">
      <label>Order Date<input type="date" id="fcreated" value="${html(j?.created||d(0))}"></label>
      <label>Needed By<input type="date" id="fd" value="${html(j?.due||'')}"></label>
      ${selectMarkup('fworker','Assigned To','workers',j?.worker||'','onchange="addCustomFromSelect(this,\'workers\')"')}
      ${selectMarkup('fdelivery','Delivery','delivery',j?.delivery||'','onchange="addCustomFromSelect(this,\'delivery\')"')}
    </div></div>
    <div class="formSection polishedFormSection"><div class="formSectionTitle"><span>4</span><div><h3>Production Notes</h3><p>Anything the shop should remember about this job.</p></div></div><div class="formGrid"><label class="span2">Job Notes<textarea id="fnotes" rows="4" placeholder="Special instructions, customer requests, production notes…">${html(j?.notes||'')}</textarea></label></div></div>
    <div class="formSection polishedFormSection"><div class="formSectionTitle"><span>5</span><div><h3>Job Files</h3><p>Artwork, proofs and production files stay with the job.</p></div></div>${j?.files?.length?`<div class="files polishedFiles">${j.files.map(f=>`<div class="file"><div class="fileMain"><strong>📄 ${html(f)}</strong><span class="muted">Server file</span></div><div class="fileBtns"><button class="btn small" type="button" onclick="viewFile('${escJs(f)}',${j.id})">View File</button><button class="btn small primary" type="button" onclick="openFile('${escJs(f)}',${j.id})">Open File</button><button class="btn small danger" type="button" onclick="this.closest('.file').remove()">Delete</button></div></div>`).join('')}</div>`:'<div class="empty compact">No files attached yet.</div>'}<button class="btn chooseFilesBtn" type="button" onclick="alert('TEST: normal Windows file picker will open in LIVE')">+ Choose Files…</button></div>`,
    `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary saveBig" onclick="closeModal();alert('TEST preview saved — no real data changed')">${j?'Save Changes':'Create Job'}</button>`,{lock:true});
  renderDynamicFields(j?.product||'',j||{});
  if(j&&$('#fstatus')){ const statusSelect=$('#fstatus');statusSelect.innerHTML=workflow.map(s=>`<option value="${s.key}" ${s.key===j.status?'selected':''}>${html(s.label)}</option>`).join(''); }
};

function customerFormBody(c={}){
  return `<div class="formHero customerFormHero"><div><span class="sectionKicker">CUSTOMER</span><h2>${c.id?'Edit Customer':'Add a New Customer'}</h2><p>Keep the contact, address and account information in one place.</p></div><div class="formHeroBadge">${c.id?'EDIT':'NEW'}</div></div>
    <div class="formSection polishedFormSection"><div class="formSectionTitle"><span>1</span><div><h3>Name & Contact</h3><p>Main customer and contact information.</p></div></div><div class="formGrid">
      <label>Customer Name<input id="custName" value="${html(c.name||'')}" placeholder="Customer name"></label>
      <label>Company<input id="custCompany" value="${html(c.company||'')}" placeholder="Company or organization"></label>
      <label>Contact Person<input id="custContact" value="${html(c.contact||'')}" placeholder="Main contact"></label>
      <label>Phone<input id="custPhone" value="${html(c.phone||'')}" placeholder="Phone number"></label>
      <label class="span2">Email<input id="custEmail" value="${html(c.email||'')}" placeholder="Email address"></label>
    </div></div>
    <div class="formSection polishedFormSection"><div class="formSectionTitle"><span>2</span><div><h3>Address</h3><p>Billing, pickup or delivery address.</p></div></div><div class="formGrid">
      <label class="span2">Street Address<input id="custAddress" value="${html(c.address||'')}"></label>
      <label>City<input id="custCity" value="${html(c.city||'')}"></label><label>State<input id="custState" value="${html(c.state||'NY')}"></label><label>ZIP<input id="custZip" value="${html(c.zip||'')}"></label>
    </div></div>
    <div class="formSection polishedFormSection"><div class="formSectionTitle"><span>3</span><div><h3>Account Details</h3><p>Useful information for billing and future jobs.</p></div></div><div class="formGrid">
      <label>Payment Terms<select id="custTerms"><option ${c.terms==='Due on receipt'?'selected':''}>Due on receipt</option><option ${c.terms==='Net 15'?'selected':''}>Net 15</option><option ${c.terms==='Net 30'?'selected':''}>Net 30</option><option ${c.terms==='Prepaid'?'selected':''}>Prepaid</option></select></label>
      <label class="span2">Notes<textarea id="custNotes" rows="4" placeholder="Anything useful to remember about this customer…">${html(c.notes||'')}</textarea></label>
    </div></div>`;
}

openCustomerForm=function(){
  modal('New Customer',customerFormBody(),`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary saveBig" onclick="alert('TEST preview saved — no real data changed');closeModal()">Add Customer</button>`,{lock:true});
};
function editCustomerForm(id){
  const c=customers.find(x=>x.id===id);const clone={...c,id:c.id};
  modal(`Edit Customer — ${html(c.name)}`,customerFormBody(clone),`<button class="btn" onclick="openCustomer(${id})">Cancel</button><button class="btn primary saveBig" onclick="saveTestCustomer(${id})">Save Changes</button>`,{lock:true});
}
function saveTestCustomer(id){
  const c=customers.find(x=>x.id===id);
  c.name=$('#custName').value.trim()||c.name;c.company=$('#custCompany').value.trim();c.contact=$('#custContact').value.trim();c.phone=$('#custPhone').value.trim();c.email=$('#custEmail').value.trim();c.address=$('#custAddress').value.trim();c.city=$('#custCity').value.trim();c.state=$('#custState').value.trim();c.zip=$('#custZip').value.trim();c.terms=$('#custTerms').value;c.notes=$('#custNotes').value.trim();openCustomer(id);
}
