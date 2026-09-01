// TEST-only UI tweaks requested after the polished forms.
// Loaded last so it can safely refine the browser preview without touching the live CRM.

// --- Sidebar icons / spacing -------------------------------------------------
(function refineSidebar(){
  const dashboardBtn=document.querySelector('#nav button[data-page="dashboard"] .navIcon svg');
  if(dashboardBtn){
    dashboardBtn.innerHTML='<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>';
  }
  const settingsBtn=document.querySelector('#nav button[data-page="settings"] .navIcon svg');
  if(settingsBtn){
    settingsBtn.innerHTML='<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.1M12 19.1v2.1M21.2 12h-2.1M4.9 12H2.8M18.5 5.5 17 7M7 17l-1.5 1.5M18.5 18.5 17 17M7 7 5.5 5.5"/><circle cx="12" cy="12" r="7"/>';
  }
})();

// --- Dropdown choice ordering + defaults ------------------------------------
window.defaultChoices=window.defaultChoices||{};

function choiceLabel(key){
  const found=(typeof choiceSections!=='undefined'?choiceSections:[]).find(x=>x[0]===key);
  return found?found[1]:key;
}

function moveChoice(key,index,dir){
  const arr=formChoices[key]||[];
  const next=index+dir;
  if(next<0||next>=arr.length)return;
  [arr[index],arr[next]]=[arr[next],arr[index]];
  jobChoicesSettings('choices');
}
function makeChoiceFirst(key,index){
  const arr=formChoices[key]||[];
  if(index<=0||index>=arr.length)return;
  const [item]=arr.splice(index,1);arr.unshift(item);
  jobChoicesSettings('choices');
}
function setChoiceDefault(key,value){
  if(defaultChoices[key]===value) delete defaultChoices[key];
  else defaultChoices[key]=value;
  jobChoicesSettings('choices');
}
function removeChoiceBetter(key,index){
  const arr=formChoices[key]||[];
  const removed=arr[index];
  arr.splice(index,1);
  if(defaultChoices[key]===removed) delete defaultChoices[key];
  jobChoicesSettings('choices');
}
function addChoiceBetter(key){
  const input=document.getElementById(`add_${key}`);
  const value=(input?.value||'').trim();
  if(!value)return;
  if(!formChoices[key].includes(value))formChoices[key].push(value);
  jobChoicesSettings('choices');
}

jobChoicesSettings=function(tab='choices'){
  const keys=(typeof choiceSections!=='undefined'?choiceSections:Object.keys(formChoices).map(k=>[k,k]));
  if(tab==='products'){
    const fieldEntries=Object.entries(fieldCatalog);
    $('#view').innerHTML=`<div class="panel"><div class="panelHead"><div><h2>Job Form Choices</h2><div class="miniTabs"><button onclick="jobChoicesSettings('choices')">Dropdown Choices</button><button class="active" onclick="jobChoicesSettings('products')">Product Type Fields</button></div></div><button class="btn small" onclick="settingsBack()">← Settings</button></div><div class="panelBody"><div class="productConfigList">${Object.keys(productFields).map(type=>`<div class="productConfig"><div class="productConfigHead"><strong>${html(type)}</strong><span class="muted">Choose the fields shown for this product</span></div><div class="fieldChecks">${fieldEntries.map(([field,info])=>`<label><input type="checkbox" ${productFields[type].includes(field)?'checked':''} onchange="toggleProductField('${escJs(type)}','${field}',this.checked)"> ${html(info.label)}</label>`).join('')}</div></div>`).join('')}</div></div></div>`;
    return;
  }
  $('#view').innerHTML=`<div class="panel"><div class="panelHead"><div><h2>Job Form Choices</h2><div class="miniTabs"><button class="active" onclick="jobChoicesSettings('choices')">Dropdown Choices</button><button onclick="jobChoicesSettings('products')">Product Type Fields</button></div></div><button class="btn small" onclick="settingsBack()">← Settings</button></div><div class="panelBody"><p class="choiceHelp">Move the choices you use most to the top. Mark one as <b>Default</b> if you want it selected automatically on a new job.</p><div class="choiceGrid choiceGridBetter">${keys.map(([key,title])=>`<div class="choiceCard choiceCardBetter"><div class="choiceCardHead"><strong>${html(title)}</strong><span class="muted">${formChoices[key]?.length||0} choices</span></div><div class="choiceRows">${(formChoices[key]||[]).map((v,i)=>`<div class="choiceManageRow"><div class="choiceName"><strong>${html(v)}</strong>${defaultChoices[key]===v?'<span class="defaultTag">DEFAULT</span>':''}</div><div class="choiceActions"><button class="miniAction" title="Move up" onclick="moveChoice('${key}',${i},-1)" ${i===0?'disabled':''}>↑</button><button class="miniAction" title="Move down" onclick="moveChoice('${key}',${i},1)" ${i===(formChoices[key].length-1)?'disabled':''}>↓</button><button class="miniAction" onclick="makeChoiceFirst('${key}',${i})" ${i===0?'disabled':''}>First</button><button class="miniAction ${defaultChoices[key]===v?'active':''}" onclick="setChoiceDefault('${key}','${escJs(v)}')">${defaultChoices[key]===v?'Default ✓':'Default'}</button><button class="miniAction dangerText" onclick="removeChoiceBetter('${key}',${i})">×</button></div></div>`).join('')}</div><div class="addChoiceRow"><input id="add_${key}" placeholder="Add another choice" onkeydown="if(event.key==='Enter')addChoiceBetter('${key}')"><button class="btn small" onclick="addChoiceBetter('${key}')">Add</button></div></div>`).join('')}</div></div></div>`;
};

if(typeof toggleProductField!=='function'){
  window.toggleProductField=function(type,field,checked){
    const arr=productFields[type]||(productFields[type]=[]);
    const i=arr.indexOf(field);
    if(checked&&i<0)arr.push(field);
    if(!checked&&i>=0)arr.splice(i,1);
  };
}

// Use the configured default whenever a NEW field has no current value.
selectMarkup=function(id,labelText,choiceKey,current='',extra=''){
  const items=formChoices[choiceKey]||[];
  const chosen=(current!==undefined&&current!==null&&String(current)!=='')?String(current):(defaultChoices[choiceKey]||'');
  const options=[...items];if(chosen&&!options.includes(chosen))options.unshift(chosen);
  return `<label>${labelText}<select id="${id}" ${extra}><option value="">Choose…</option>${options.map(v=>`<option value="${html(v)}" ${String(chosen)===String(v)?'selected':''}>${html(v)}</option>`).join('')}<option value="__custom__">+ Add custom…</option></select></label>`;
};

// --- Customer address: one field, not several boxes -------------------------
customers.forEach(c=>{ if(!c.fullAddress)c.fullAddress=[c.address,c.city,[c.state,c.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '); });
customerAddress=function(c){ return c.fullAddress||[c.address,c.city,[c.state,c.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')||'—'; };

function simpleCustomerFormBody(c={}){
  return `<div class="formSection polishedFormSection"><div class="formSectionTitle"><span>1</span><div><h3>Name & Contact</h3><p>Main customer information.</p></div></div><div class="formGrid"><label>Customer Name<input id="custName" value="${html(c.name||'')}" placeholder="Customer name"></label><label>Company<input id="custCompany" value="${html(c.company||'')}"></label><label>Contact Person<input id="custContact" value="${html(c.contact||'')}"></label><label>Phone<input id="custPhone" value="${html(c.phone||'')}"></label><label class="span2">Email<input id="custEmail" value="${html(c.email||'')}"></label></div></div><div class="formSection polishedFormSection"><div class="formSectionTitle"><span>2</span><div><h3>Address</h3><p>Write the complete address in one place.</p></div></div><div class="formGrid"><label class="span2">Full Address<textarea id="custFullAddress" rows="2" placeholder="Street, city, state, ZIP">${html(customerAddress(c)==='—'?'':customerAddress(c))}</textarea></label></div></div><div class="formSection polishedFormSection"><div class="formSectionTitle"><span>3</span><div><h3>Account Details</h3><p>Payment terms and notes.</p></div></div><div class="formGrid"><label>Payment Terms<input id="custTerms" value="${html(c.terms||'')}" placeholder="Example: Due on receipt"></label><label class="span2">Notes<textarea id="custNotes" rows="3">${html(c.notes||'')}</textarea></label></div></div>`;
}

openCustomerForm=function(){
  modal('New Customer',simpleCustomerFormBody(),`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary saveBig" onclick="alert('TEST preview saved — no real data changed');closeModal()">Add Customer</button>`,{lock:true});
};
editCustomerForm=function(id){
  const c=customers.find(x=>x.id===id);
  modal(`Edit Customer — ${html(c.name)}`,simpleCustomerFormBody(c),`<button class="btn" onclick="openCustomer(${id})">Cancel</button><button class="btn primary saveBig" onclick="saveTestCustomer(${id})">Save Changes</button>`,{lock:true});
};
saveTestCustomer=function(id){
  const c=customers.find(x=>x.id===id);
  c.name=$('#custName').value.trim()||c.name;c.company=$('#custCompany').value.trim();c.contact=$('#custContact').value.trim();c.phone=$('#custPhone').value.trim();c.email=$('#custEmail').value.trim();c.fullAddress=$('#custFullAddress').value.trim();c.terms=$('#custTerms').value.trim();c.notes=$('#custNotes').value.trim();openCustomer(id);
};

// Customer detail: one address card rather than Street/City/State/ZIP boxes.
openCustomer=function(id){
  const c=customers.find(x=>x.id===id),js=jobs.filter(j=>j.cid===id),ps=payments.filter(p=>js.some(j=>j.id===p.jid));
  const paid=ps.reduce((s,p)=>s+p.amount,0),out=js.reduce((s,j)=>s+balance(j),0),open=js.filter(j=>j.status!=='paid').length;
  modal(c.name,`<div class="detailHero customerHero"><div class="detailHeroIcon">${html((c.name||'?').slice(0,1).toUpperCase())}</div><div class="detailHeroMain"><div class="eyebrow">CUSTOMER</div><h2>${html(c.name)}</h2><p>${html(c.company||c.name)}${c.contact?` · Contact: ${html(c.contact)}`:''}</p></div><div class="detailHeroActions"><button class="btn" onclick="editCustomerForm(${id})">Edit Customer</button><button class="btn primary" onclick="closeModal();openJobForm(null,${id})">+ New Job</button></div></div><div class="customerSummaryGrid"><div class="summaryCard alertCard"><span>Outstanding</span><strong>${money(out)}</strong><small>${open} open job${open===1?'':'s'}</small></div><div class="summaryCard goodCard"><span>Paid All Time</span><strong>${money(paid)}</strong><small>${ps.length} payment entr${ps.length===1?'y':'ies'}</small></div><div class="summaryCard"><span>Total Jobs</span><strong>${js.length}</strong><small>Since ${html(c.created||'—')}</small></div><div class="summaryCard"><span>Payment Terms</span><strong class="smallValue">${html(c.terms||'—')}</strong><small>Customer account</small></div></div><div class="detailSection"><div class="sectionBar"><div><span class="sectionKicker">CONTACT</span><h3>Customer Information</h3></div><button class="btn small" onclick="editCustomerForm(${id})">Edit Details</button></div><div class="detailGrid customerInfoGrid">${detailItem('Company',c.company||c.name)}${detailItem('Contact Person',c.contact||'—')}${detailItem('Phone',c.phone||'—')}${detailItem('Email',c.email||'—')}${detailItem('Address',customerAddress(c),'wide2')}${detailItem('Notes',c.notes||'—','wide2')}</div></div><div class="detailTwoCol"><div class="detailSection"><div class="sectionBar"><div><span class="sectionKicker">WORK</span><h3>Jobs</h3></div><span class="countBadge">${js.length}</span></div><div class="sectionList">${js.slice().sort((a,b)=>(b.created||'').localeCompare(a.created||'')).map(j=>customerJobLine(j,id)).join('')||'<div class="empty">No jobs yet.</div>'}</div></div><div class="detailSection"><div class="sectionBar"><div><span class="sectionKicker">MONEY</span><h3>Payment History</h3></div><span class="countBadge">${ps.length}</span></div><div class="sectionList">${ps.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(p=>{const j=jobs.find(x=>x.id===p.jid);return `<div class="payRow clickRow paymentHistoryRow" onclick="openJob(${p.jid},${id})"><div><strong>${p.date}</strong><span class="muted">#${j.num} · ${html(j.title)}</span></div><strong class="money">${money(p.amount)}</strong></div>`}).join('')||'<div class="empty">No payments yet.</div>'}</div></div></div>`,`<button class="btn danger" onclick="alert('TEST only: Admin Delete Customer with typed confirmation')">Delete Customer</button><button class="btn" onclick="closeModal()">Close</button>`);
};

// --- Cleaner Job form: keep sections, remove the large blue top box ----------
openJobForm=function(id=null,presetCustomerId=null){
  const j=id?jobs.find(x=>x.id===id):null;
  const cid=j?.cid||presetCustomerId||customers[0]?.id||'';
  const productValue=j?.product||defaultChoices.productTypes||'';
  const statusSelect=j?`<label>Status<select id="fstatus">${workflow.map(s=>`<option value="${s.key}" ${j.status===s.key?'selected':''}>${html(s.label)}</option>`).join('')}</select></label>`:'';
  modal(j?`Edit Job #${j.num}`:'New Job',`
    <div class="formSection polishedFormSection"><div class="formSectionTitle"><span>1</span><div><h3>Customer & Price</h3><p>Who the job is for and the customer price.</p></div></div><div class="formGrid"><label>Customer<select id="fc">${customers.map(c=>`<option value="${c.id}" ${Number(cid)===c.id?'selected':''}>${html(c.name)}</option>`).join('')}</select></label><label>Job Name<input id="ft" value="${html(j?.title||'')}" placeholder="Example: 5,000 #10 Envelopes"></label><label>Customer Price<input id="fp" inputmode="decimal" value="${j?.price??''}" placeholder="0.00"></label>${statusSelect}</div></div>
    <div class="formSection polishedFormSection"><div class="formSectionTitle"><span>2</span><div><h3>Product & Specifications</h3><p>Choose a product type. Only the fields needed for that product appear.</p></div></div><div class="formGrid"><label class="span2">Product Type<select id="fprod" onchange="productChanged(this)"><option value="">Choose…</option>${formChoices.productTypes.map(v=>`<option value="${html(v)}" ${productValue===v?'selected':''}>${html(v)}</option>`).join('')}<option value="__custom__">+ Add custom…</option></select></label></div><div class="formGrid dynamicFields" id="dynamicFields"></div></div>
    <div class="formSection polishedFormSection"><div class="formSectionTitle"><span>3</span><div><h3>Schedule & Shop</h3><p>Dates, assignment and delivery.</p></div></div><div class="formGrid"><label>Order Date<input type="date" id="fcreated" value="${html(j?.created||d(0))}"></label><label>Needed By<input type="date" id="fd" value="${html(j?.due||'')}"></label>${selectMarkup('fworker','Assigned To','workers',j?.worker||'','onchange="addCustomFromSelect(this,\'workers\')"')}${selectMarkup('fdelivery','Delivery','delivery',j?.delivery||'','onchange="addCustomFromSelect(this,\'delivery\')"')}</div></div>
    <div class="formSection polishedFormSection"><div class="formSectionTitle"><span>4</span><div><h3>Production Notes</h3><p>Anything the shop should remember.</p></div></div><div class="formGrid"><label class="span2">Job Notes<textarea id="fnotes" rows="3" placeholder="Special instructions, customer requests, production notes…">${html(j?.notes||'')}</textarea></label></div></div>
    <div class="formSection polishedFormSection"><div class="formSectionTitle"><span>5</span><div><h3>Job Files</h3><p>Artwork, proofs and production files stay with the job.</p></div></div>${j?.files?.length?`<div class="files polishedFiles">${j.files.map(f=>`<div class="file"><div class="fileMain"><strong>📄 ${html(f)}</strong><span class="muted">Server file</span></div><div class="fileBtns"><button class="btn small" type="button" onclick="viewFile('${escJs(f)}',${j.id})">View File</button><button class="btn small primary" type="button" onclick="openFile('${escJs(f)}',${j.id})">Open File</button><button class="btn small danger" type="button" onclick="this.closest('.file').remove()">Delete</button></div></div>`).join('')}</div>`:'<div class="empty compact">No files attached yet.</div>'}<button class="btn chooseFilesBtn" type="button" onclick="alert('TEST: normal Windows file picker will open in LIVE')">Choose Files…</button></div>`,
    `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary saveBig" onclick="closeModal();alert('TEST preview saved — no real data changed')">${j?'Save Changes':'Create Job'}</button>`,{lock:true});
  renderDynamicFields(productValue,j||{});
};
