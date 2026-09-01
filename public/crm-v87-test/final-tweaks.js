// Latest TEST-only refinements. Loaded last.

// --- Sidebar: simpler Settings icon that matches the other line icons -------
(function(){
  const svg=document.querySelector('#nav button[data-page="settings"] .navIcon svg');
  if(svg){
    svg.innerHTML='<path d="M4 7h6M14 7h6"/><circle cx="12" cy="7" r="2"/><path d="M4 12h10M18 12h2"/><circle cx="16" cy="12" r="2"/><path d="M4 17h3M11 17h9"/><circle cx="9" cy="17" r="2"/>';
  }
})();

// --- Much simpler Job Form Choices ordering ---------------------------------
window.choiceSelection=window.choiceSelection||{};

function selectedIndexFor(key){
  const arr=formChoices[key]||[];
  let i=Number(choiceSelection[key]);
  if(!Number.isInteger(i)||i<0||i>=arr.length)i=arr.length?0:-1;
  choiceSelection[key]=i;
  return i;
}
function selectChoiceRow(key,index){ choiceSelection[key]=index; jobChoicesSettings('choices'); }
function moveSelectedChoice(key,dir){
  const arr=formChoices[key]||[]; const i=selectedIndexFor(key); const n=i+dir;
  if(i<0||n<0||n>=arr.length)return;
  [arr[i],arr[n]]=[arr[n],arr[i]]; choiceSelection[key]=n; jobChoicesSettings('choices');
}
function defaultSelectedChoice(key){
  const arr=formChoices[key]||[]; const i=selectedIndexFor(key); if(i<0)return;
  setChoiceDefault(key,arr[i]);
}
function deleteSelectedChoice(key){
  const arr=formChoices[key]||[]; const i=selectedIndexFor(key); if(i<0)return;
  const removed=arr[i]; arr.splice(i,1); if(defaultChoices[key]===removed)delete defaultChoices[key];
  choiceSelection[key]=Math.min(i,arr.length-1); jobChoicesSettings('choices');
}
function addChoiceSimple(key){
  const el=document.getElementById(`simple_add_${key}`); const v=(el?.value||'').trim(); if(!v)return;
  if(!formChoices[key].includes(v))formChoices[key].push(v);
  choiceSelection[key]=formChoices[key].indexOf(v); jobChoicesSettings('choices');
}
function simpleChoiceCard(key,title){
  const arr=formChoices[key]||[]; const selected=selectedIndexFor(key); const selectedValue=selected>=0?arr[selected]:null;
  return `<div class="simpleChoiceCard">
    <div class="simpleChoiceHead"><div><strong>${html(title)}</strong><span>${arr.length} choices</span></div></div>
    <div class="simpleChoiceList">${arr.map((v,i)=>`<button type="button" class="simpleChoiceRow ${i===selected?'selected':''}" onclick="selectChoiceRow('${key}',${i})"><span class="choiceNumber">${i+1}</span><span class="choiceText">${html(v)}</span>${defaultChoices[key]===v?'<span class="defaultTag">DEFAULT</span>':''}</button>`).join('')||'<div class="empty compact">No choices yet.</div>'}</div>
    <div class="selectedChoiceTools">
      <span class="selectedLabel">${selectedValue?`Selected: <b>${html(selectedValue)}</b>`:'Select a choice above'}</span>
      <div class="selectedButtons"><button class="btn small" onclick="moveSelectedChoice('${key}',-1)" ${selected<=0?'disabled':''}>Move Up</button><button class="btn small" onclick="moveSelectedChoice('${key}',1)" ${selected<0||selected>=arr.length-1?'disabled':''}>Move Down</button><button class="btn small ${selectedValue&&defaultChoices[key]===selectedValue?'defaultBtnActive':''}" onclick="defaultSelectedChoice('${key}')" ${selected<0?'disabled':''}>${selectedValue&&defaultChoices[key]===selectedValue?'Default ✓':'Set Default'}</button><button class="btn small dangerText" onclick="deleteSelectedChoice('${key}')" ${selected<0?'disabled':''}>Delete</button></div>
    </div>
    <div class="addChoiceSimple"><input id="simple_add_${key}" placeholder="Add another choice" onkeydown="if(event.key==='Enter')addChoiceSimple('${key}')"><button class="btn small" onclick="addChoiceSimple('${key}')">Add</button></div>
  </div>`;
}

const previousJobChoicesSettings=jobChoicesSettings;
jobChoicesSettings=function(tab='choices'){
  if(tab==='products')return previousJobChoicesSettings('products');
  const keys=(typeof choiceSections!=='undefined'?choiceSections:Object.keys(formChoices).map(k=>[k,k]));
  $('#view').innerHTML=`<div class="panel simpleChoicesPage"><div class="panelHead"><div><h2>Job Form Choices</h2><div class="miniTabs"><button class="active" onclick="jobChoicesSettings('choices')">Dropdown Choices</button><button onclick="jobChoicesSettings('products')">Product Type Fields</button></div></div><button class="btn small" onclick="settingsBack()">← Settings</button></div><div class="panelBody"><div class="simpleChoicesIntro"><strong>Put your most-used choices first.</strong><span>Select one row, then use Move Up or Move Down. You can also set one choice as the default for new jobs.</span></div><div class="simpleChoicesGrid">${keys.map(([key,title])=>simpleChoiceCard(key,title)).join('')}</div></div></div>`;
};

// --- Customer: remove Payment Terms everywhere ------------------------------
customers.forEach(c=>{ delete c.terms; });

simpleCustomerFormBody=function(c={}){
  return `<div class="formSection polishedFormSection"><div class="formSectionTitle"><span>1</span><div><h3>Name & Contact</h3><p>Main customer information.</p></div></div><div class="formGrid"><label>Customer Name<input id="custName" value="${html(c.name||'')}" placeholder="Customer name"></label><label>Company<input id="custCompany" value="${html(c.company||'')}"></label><label>Contact Person<input id="custContact" value="${html(c.contact||'')}"></label><label>Phone<input id="custPhone" value="${html(c.phone||'')}"></label><label class="span2">Email<input id="custEmail" value="${html(c.email||'')}"></label></div></div><div class="formSection polishedFormSection"><div class="formSectionTitle"><span>2</span><div><h3>Address</h3><p>Write the complete address in one place.</p></div></div><div class="formGrid"><label class="span2">Full Address<textarea id="custFullAddress" rows="2" placeholder="Street, city, state, ZIP">${html(customerAddress(c)==='—'?'':customerAddress(c))}</textarea></label></div></div><div class="formSection polishedFormSection"><div class="formSectionTitle"><span>3</span><div><h3>Notes</h3><p>Anything the shop should remember about this customer.</p></div></div><div class="formGrid"><label class="span2">Customer Notes<textarea id="custNotes" rows="3">${html(c.notes||'')}</textarea></label></div></div>`;
};

saveTestCustomer=function(id){
  const c=customers.find(x=>x.id===id);
  c.name=$('#custName').value.trim()||c.name;
  c.company=$('#custCompany').value.trim();
  c.contact=$('#custContact').value.trim();
  c.phone=$('#custPhone').value.trim();
  c.email=$('#custEmail').value.trim();
  c.fullAddress=$('#custFullAddress').value.trim();
  c.notes=$('#custNotes').value.trim();
  openCustomer(id);
};

openCustomer=function(id){
  const c=customers.find(x=>x.id===id),js=jobs.filter(j=>j.cid===id),ps=payments.filter(p=>js.some(j=>j.id===p.jid));
  const paid=ps.reduce((s,p)=>s+p.amount,0),out=js.reduce((s,j)=>s+balance(j),0),open=js.filter(j=>j.status!=='paid').length;
  modal(c.name,`<div class="detailHero customerHero"><div class="detailHeroIcon">${html((c.name||'?').slice(0,1).toUpperCase())}</div><div class="detailHeroMain"><div class="eyebrow">CUSTOMER</div><h2>${html(c.name)}</h2><p>${html(c.company||c.name)}${c.contact?` · Contact: ${html(c.contact)}`:''}</p></div><div class="detailHeroActions"><button class="btn" onclick="editCustomerForm(${id})">Edit Customer</button><button class="btn primary" onclick="closeModal();openJobForm(null,${id})">+ New Job</button></div></div><div class="customerSummaryGrid threeSummary"><div class="summaryCard alertCard"><span>Outstanding</span><strong>${money(out)}</strong><small>${open} open job${open===1?'':'s'}</small></div><div class="summaryCard goodCard"><span>Paid All Time</span><strong>${money(paid)}</strong><small>${ps.length} payment entr${ps.length===1?'y':'ies'}</small></div><div class="summaryCard"><span>Total Jobs</span><strong>${js.length}</strong><small>Since ${html(c.created||'—')}</small></div></div><div class="detailSection"><div class="sectionBar"><div><span class="sectionKicker">CONTACT</span><h3>Customer Information</h3></div><button class="btn small" onclick="editCustomerForm(${id})">Edit Details</button></div><div class="detailGrid customerInfoGrid">${detailItem('Company',c.company||c.name)}${detailItem('Contact Person',c.contact||'—')}${detailItem('Phone',c.phone||'—')}${detailItem('Email',c.email||'—')}${detailItem('Address',customerAddress(c),'wide2')}${detailItem('Notes',c.notes||'—','wide2')}</div></div><div class="detailTwoCol"><div class="detailSection"><div class="sectionBar"><div><span class="sectionKicker">WORK</span><h3>Jobs</h3></div><span class="countBadge">${js.length}</span></div><div class="sectionList">${js.slice().sort((a,b)=>(b.created||'').localeCompare(a.created||'')).map(j=>customerJobLine(j,id)).join('')||'<div class="empty">No jobs yet.</div>'}</div></div><div class="detailSection"><div class="sectionBar"><div><span class="sectionKicker">MONEY</span><h3>Payment History</h3></div><span class="countBadge">${ps.length}</span></div><div class="sectionList">${ps.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(p=>{const j=jobs.find(x=>x.id===p.jid);return `<div class="payRow clickRow paymentHistoryRow" onclick="openJob(${p.jid},${id})"><div><strong>${p.date}</strong><span class="muted">#${j.num} · ${html(j.title)}</span></div><strong class="money">${money(p.amount)}</strong></div>`}).join('')||'<div class="empty">No payments yet.</div>'}</div></div></div>`,`<button class="btn danger" onclick="alert('TEST only: Admin Delete Customer with typed confirmation')">Delete Customer</button><button class="btn" onclick="closeModal()">Close</button>`);
};
