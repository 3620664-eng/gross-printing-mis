const status=[['new','New Job'],['price','Needs Price'],['approved','Approved / To Do'],['production','In Production'],['ready','Ready / Delivered'],['payment','Waiting for Payment'],['paid','Paid / Closed']];
let workflow=status.map(([key,label])=>({key,label,show:true}));let defaultStatus='new';
const customers=[
{id:1,name:'Berkowitz Bakery',phone:'845-555-0142',email:'orders@example.com',company:'Berkowitz Bakery',created:'2026-01-11'},
{id:2,name:'Lakeview School',phone:'845-555-0177',email:'office@example.com',company:'Lakeview School',created:'2026-03-04'},
{id:3,name:'Greenbaum Realty',phone:'845-555-0198',email:'sg@example.com',company:'Greenbaum Realty',created:'2026-07-18'}
];
const d=n=>{let x=new Date(Date.now()+n*864e5);return x.toISOString().slice(0,10)};
let jobs=[
{id:1,num:2401,cid:1,title:'Cake Box Labels',product:'Label / Sticker',qty:'2,500',size:'2 × 3',paper:'Freezer adhesive label',color:'Full Color',sides:'1 side',bleed:'Full Bleed',finish:'Cut',status:'production',created:d(-8),due:d(2),worker:'Production',price:485,paid:200,files:['Cake-Box-Labels-Proof.pdf']},
{id:2,num:2402,cid:2,title:'School Booklets',product:'Booklet',qty:'500',size:'8.5 × 11',paper:'80 lb Text',color:'Full Color',sides:'2 sides',bleed:'Full Bleed',finish:'Saddle Stitch',status:'price',created:d(-4),due:d(7),worker:'Shulem',price:1325,paid:0,files:['School-Booklet-Cover.pdf','Inside-Pages.pdf']},
{id:3,num:2403,cid:3,title:'4 × 8 Coroplast Signs',product:'Sign / Board',qty:'8',size:'48 × 96',paper:'Coroplast',color:'Full Color',sides:'1 side',bleed:'',finish:'Grommets',status:'new',created:d(-2),due:d(1),worker:'Production',price:960,paid:0,files:['Coroplast-Sign-Artwork.pdf','Install-Instructions.docx']},
{id:4,num:2397,cid:1,title:'#10 Envelopes',product:'Envelope',qty:'10,000',size:'#10 Envelope',paper:'24 lb White',color:'B&W',sides:'1 side',bleed:'No Bleed / White Border',finish:'None',status:'paid',created:d(-24),due:d(-14),worker:'Production',price:780,paid:780,files:[]}
];
let payments=[{id:1,jid:1,amount:200,date:d(-3),note:'Deposit'},{id:2,jid:4,amount:300,date:d(-18),note:'Deposit'},{id:3,jid:4,amount:480,date:d(-12),note:'Balance paid'}];
let page='dashboard',paymentRange='all',paymentSort='date_desc',customerSort='name_asc';
const meta={dashboard:['Dashboard','Everything that needs attention today.'],board:['Job Board','Drag the whole job card from one stage to another.'],customers:['Customers','Click anywhere on a customer row to open it.'],jobs:['All Jobs','Click anywhere on a job row to open it.'],payments:['Payments','Filter and sort payments or old outstanding balances.'],search:['Search','Find a customer, job number or job description.'],settings:['Settings','Simple setup for your shop workflow.']};
const $=s=>document.querySelector(s);const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n||0);const cname=j=>customers.find(c=>c.id===j.cid)?.name||'—';const label=s=>workflow.find(x=>x.key===s)?.label||s;const balance=j=>Math.max(0,j.price-j.paid);const customerOutstanding=id=>jobs.filter(j=>j.cid===id).reduce((s,j)=>s+balance(j),0);const lastJobDate=id=>jobs.filter(j=>j.cid===id).map(j=>j.created||j.due).sort().pop()||'0000-00-00';
function setPage(p){page=p;$('#title').textContent=meta[p][0];$('#sub').textContent=meta[p][1];document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===p));render()}
document.querySelector('#nav').onclick=e=>{const b=e.target.closest('button[data-page]');if(b)setPage(b.dataset.page)};
function render(){if(page==='dashboard')dashboard();if(page==='board')board();if(page==='customers')customerPage();if(page==='jobs')jobsPage();if(page==='payments')paymentsPage();if(page==='search')searchPage();if(page==='settings')settingsPage()}
