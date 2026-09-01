function openCustomer(id){
  const c=customers.find(x=>x.id===id),js=jobs.filter(j=>j.cid===id),ps=payments.filter(p=>js.some(j=>j.id===p.jid)),paid=ps.reduce((s,p)=>s+p.amount,0),out=js.reduce((s,j)=>s+balance(j),0);
  modal(c.name,`<div class="stats"><div class="stat"><span>Outstanding</span><strong>${money(out)}</strong></div><div class="stat"><span>Paid all time</span><strong class="money">${money(paid)}</strong></div><div class="stat"><span>Total jobs</span><strong>${js.length}</strong></div><div class="stat"><span>Open jobs</span><strong>${js.filter(j=>j.status!=='paid').length}</strong></div></div><div class="grid2"><div class="panel"><div class="panelHead"><h2>Jobs</h2></div><div class="panelBody">${js.map(jobLine).join('')}</div></div><div class="panel"><div class="panelHead"><h2>Full Payment History</h2></div><div class="panelBody">${ps.sort((a,b)=>b.date.localeCompare(a.date)).map(p=>`<div class="payRow clickRow" onclick="openJob(${p.jid})"><span>${p.date} · #${jobs.find(j=>j.id===p.jid).num}</span><strong class="money">${money(p.amount)}</strong></div>`).join('')||'<div class="empty">No payments yet</div>'}</div></div></div>`,`<button class="btn danger" onclick="alert('TEST only: Admin Delete Customer with typed confirmation')">Delete Customer</button><button class="btn" onclick="closeModal()">Close</button>`);
}

function openJob(id){
  const j=jobs.find(x=>x.id===id);
  modal(`Job #${j.num}`,`<div class="infoGrid"><div class="info"><small>Customer</small><strong>${cname(j)}</strong></div><div class="info"><small>Product</small><strong>${j.product}</strong></div><div class="info"><small>Status</small><strong>${label(j.status)}</strong></div><div class="info"><small>Needed by</small><strong>${j.due}</strong></div><div class="info"><small>Quantity</small><strong>${j.qty||'—'}</strong></div><div class="info"><small>Size</small><strong>${j.size||'—'}</strong></div><div class="info"><small>Material</small><strong>${j.paper||'—'}</strong></div><div class="info"><small>Balance</small><strong>${money(balance(j))}</strong></div></div><h3 class="sectionTitle">Job Files</h3><div class="files">${j.files.length?j.files.map(f=>fileRow(f,j)).join(''):'<div class="empty">No files yet.</div>'}</div><h3 class="sectionTitle">Payment</h3><div class="infoGrid"><div class="info"><small>Price</small><strong>${money(j.price)}</strong></div><div class="info"><small>Paid</small><strong class="money">${money(j.paid)}</strong></div><div class="info"><small>Balance</small><strong>${money(balance(j))}</strong></div></div>`,`<button class="btn" onclick="openJobForm(${j.id})">Edit Job</button><button class="btn primary" onclick="alert('TEST payment entry screen')">Record Payment</button><button class="btn" onclick="closeModal()">Close</button>`);
}
function fileRow(name,j){return `<div class="file"><div><strong>📄 ${name}</strong><span class="muted">Server file</span></div><div class="fileBtns"><button class="btn small" onclick="viewFile('${escJs(name)}',${j.id})">View File</button><button class="btn small primary" onclick="openFile('${escJs(name)}',${j.id})">Open File</button></div></div>`}

function viewFile(name,jobId){
  const path=`Z:\\GrossPrintingCRM\\Jobs\\${jobId}\\${name}`;
  alert(`TEST preview only.\n\nIn the LIVE CRM, View File will open Windows File Explorer and select this file:\n\n${path}\n\nIt will NOT open a CRM preview.`);
}
function openFile(name,jobId){
  const ext=name.split('.').pop().toLowerCase();
  const app=ext==='pdf'?'Adobe Acrobat':(['doc','docx'].includes(ext)?'Microsoft Word':(['xls','xlsx'].includes(ext)?'Microsoft Excel':'the normal Windows app'));
  alert(`TEST preview only.\n\nIn the LIVE CRM, Open File will open “${name}” directly in ${app}.`);
}

function selectMarkup(id,labelText,choiceKey,current='',extra=''){
  const items=formChoices[choiceKey]||[];
  const has=current&&items.includes(String(current));
  const options=[...items];if(current&&!has)options.unshift(String(current));
  return `<label>${labelText}<select id="${id}" ${extra}><option value="">Choose…</option>${options.map(v=>`<option value="${html(v)}" ${String(current)===String(v)?'selected':''}>${html(v)}</option>`).join('')}<option value="__custom__">+ Add custom…</option></select></label>`;
}
function html(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function addCustomFromSelect(el,choiceKey){
  if(el.value!=='__custom__')return;
  const v=prompt('Type the custom value:');
  if(!v||!v.trim()){el.value='';return}
  const clean=v.trim();if(!formChoices[choiceKey].includes(clean))formChoices[choiceKey].push(clean);
  const opt=document.createElement('option');opt.value=clean;opt.textContent=clean;el.insertBefore(opt,el.lastElementChild);el.value=clean;
}

function openJobForm(id){
  const j=id?jobs.find(x=>x.id===id):null;
  modal(j?`Edit Job #${j.num}`:'New Job',`<div class="formSection"><h3>1. Customer & price</h3><div class="formGrid"><label>Customer<select id="fc">${customers.map(c=>`<option value="${c.id}" ${j&&j.cid===c.id?'selected':''}>${html(c.name)}</option>`).join('')}</select></label><label>Job name<input id="ft" value="${html(j?.title||'')}" placeholder="Example: 5,000 #10 Envelopes"></label><label>Customer price<input id="fp" inputmode="decimal" value="${j?.price||''}" placeholder="0.00"></label><label>Needed by<input type="date" id="fd" value="${j?.due||''}"></label></div></div><div class="formSection"><h3>2. Product & printing</h3><div class="formGrid"><label class="span2">Product type<select id="fprod" onchange="productChanged(this)"><option value="">Choose…</option>${formChoices.productTypes.map(v=>`<option value="${html(v)}" ${j?.product===v?'selected':''}>${html(v)}</option>`).join('')}<option value="__custom__">+ Add custom…</option></select></label></div><div class="formGrid dynamicFields" id="dynamicFields"></div></div><div class="formSection"><h3>3. Shop</h3><div class="formGrid">${selectMarkup('fworker','Assigned to','workers',j?.worker||'','onchange="addCustomFromSelect(this,\'workers\')"')}${selectMarkup('fdelivery','Delivery','delivery',j?.delivery||'','onchange="addCustomFromSelect(this,\'delivery\')"')}</div></div><div class="formSection"><h3>4. Job Files</h3>${j?.files?.length?`<div class="files">${j.files.map(f=>`<div class="file"><strong>📄 ${html(f)}</strong><div class="fileBtns"><button class="btn small" type="button" onclick="viewFile('${escJs(f)}',${j.id})">View File</button><button class="btn small primary" type="button" onclick="openFile('${escJs(f)}',${j.id})">Open File</button><button class="btn small danger" type="button" onclick="this.closest('.file').remove()">Delete</button></div></div>`).join('')}</div>`:''}<button class="btn" type="button" style="margin-top:8px" onclick="alert('TEST: normal Windows file picker will open in LIVE')">Choose Files…</button></div>`,`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="closeModal();alert('TEST preview saved — no real data changed')">${j?'Save Changes':'Create Job'}</button>`,{lock:true});
  renderDynamicFields(j?.product||'',j||{});
}

function productChanged(sel){
  if(sel.value==='__custom__'){
    const v=prompt('Type the new Product Type:');if(!v||!v.trim()){sel.value='';renderDynamicFields('',{});return}
    const clean=v.trim();if(!formChoices.productTypes.includes(clean))formChoices.productTypes.push(clean);if(!productFields[clean])productFields[clean]=['qty','size','paper','color','finish'];
    const opt=document.createElement('option');opt.value=clean;opt.textContent=clean;sel.insertBefore(opt,sel.lastElementChild);sel.value=clean;
  }
  renderDynamicFields(sel.value,{});
}
function renderDynamicFields(type,vals={}){
  const box=$('#dynamicFields');if(!box)return;
  if(!type){box.innerHTML='<div class="span2 empty compact">Choose a Product Type to show the fields needed for that job.</div>';return}
  const keys=productFields[type]||productFields.Custom||[];
  box.innerHTML=keys.map(key=>{const info=fieldCatalog[key];if(!info)return'';return selectMarkup(`f_${key}`,info.label,info.choice,vals[key]||'',`onchange="addCustomFromSelect(this,'${info.choice}')"`)}).join('');
}

function openCustomerForm(){
  modal('New Customer',`<div class="formGrid"><label>Name<input placeholder="Customer name"></label><label>Company<input></label><label>Phone<input></label><label>Email<input></label></div>`,`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="closeModal();alert('TEST preview saved — no real data changed')">Add Customer</button>`,{lock:true});
}
function modal(title,body,foot='',opts={}){
  $('#modal').innerHTML=`<div class="modal ${opts.lock?'modalLocked':''}"><div class="modalCard"><div class="modalHead"><h2>${title}</h2><button class="x" onclick="closeModal()">×</button></div><div class="modalBody">${body}</div>${foot?`<div class="modalFoot">${foot}</div>`:''}</div></div>`;
}
function closeModal(){$('#modal').innerHTML=''}
render();
