const status=[['new','New Job'],['price','Needs Price'],['approved','Approved / To Do'],['production','In Production'],['ready','Ready / Delivered'],['payment','Waiting for Payment'],['paid','Paid / Closed']];
let workflow=status.map(([key,label])=>({key,label,show:true}));
let defaultStatus='new';

const customers=[
  {id:1,name:'Berkowitz Bakery',phone:'845-555-0142',email:'orders@example.com',company:'Berkowitz Bakery',created:'2026-01-11'},
  {id:2,name:'Lakeview School',phone:'845-555-0177',email:'office@example.com',company:'Lakeview School',created:'2026-03-04'},
  {id:3,name:'Greenbaum Realty',phone:'845-555-0198',email:'sg@example.com',company:'Greenbaum Realty',created:'2026-07-18'}
];
const d=n=>{const x=new Date(Date.now()+n*864e5);return x.toISOString().slice(0,10)};
let jobs=[
  {id:1,num:2401,cid:1,title:'Cake Box Labels',product:'Label / Sticker',qty:'2,500',size:'2 × 3',paper:'Freezer adhesive label',color:'Full Color',sides:'1 side',bleed:'Full Bleed',finish:'Die Cut',shape:'Rectangle',lamination:'None',status:'production',created:d(-8),due:d(2),worker:'Production',delivery:'Pickup',price:485,paid:200,files:['Cake-Box-Labels-Proof.pdf']},
  {id:2,num:2402,cid:2,title:'School Booklets',product:'Booklet',qty:'500',size:'8.5 × 11',paper:'80 lb Text',color:'Full Color',sides:'2 sides',bleed:'Full Bleed',finish:'Saddle Stitch',pages:'24',binding:'Saddle Stitch',status:'price',created:d(-4),due:d(7),worker:'Shulem',delivery:'Delivery',price:1325,paid:0,files:['School-Booklet-Cover.pdf','Inside-Pages.pdf']},
  {id:3,num:2403,cid:3,title:'4 × 8 Coroplast Signs',product:'Sign / Board',qty:'8',size:'48 × 96',paper:'Coroplast',color:'Full Color',sides:'1 side',finish:'Grommets',mounting:'4 corner grommets',status:'new',created:d(-2),due:d(1),worker:'Production',delivery:'Pickup',price:960,paid:0,files:['Coroplast-Sign-Artwork.pdf','Install-Instructions.docx']},
  {id:4,num:2397,cid:1,title:'#10 Envelopes',product:'Envelope',qty:'10,000',size:'#10 Envelope',paper:'24 lb White',color:'B&W',sides:'1 side',finish:'None',status:'paid',created:d(-24),due:d(-14),worker:'Production',delivery:'Delivery',price:780,paid:780,files:[]}
];
let payments=[
  {id:1,jid:1,amount:200,date:d(-3),note:'Deposit'},
  {id:2,jid:4,amount:300,date:d(-18),note:'Deposit'},
  {id:3,jid:4,amount:480,date:d(-12),note:'Balance paid'}
];

const fieldCatalog={
  qty:{label:'Quantity',choice:'quantities'},
  size:{label:'Size',choice:'sizes'},
  paper:{label:'Paper / Material',choice:'materials'},
  color:{label:'Color',choice:'colors'},
  sides:{label:'Sides',choice:'sides'},
  bleed:{label:'Bleed',choice:'bleeds'},
  finish:{label:'Finishing',choice:'finishing'},
  pages:{label:'Pages',choice:'pages'},
  binding:{label:'Binding',choice:'binding'},
  shape:{label:'Shape / Cut',choice:'shapes'},
  lamination:{label:'Lamination',choice:'lamination'},
  mounting:{label:'Mounting / Grommets',choice:'mounting'}
};

let formChoices={
  productTypes:['Flyer / Sheet','Booklet','Label / Sticker','Sign / Board','Banner','Envelope','Blueprint / Plan','Custom'],
  quantities:['100','250','500','1,000','2,500','5,000','10,000'],
  sizes:['8.5 × 11','11 × 17','12 × 18','13 × 19','24 × 36','36 × 48','48 × 96','#10 Envelope'],
  materials:['60 lb Text','80 lb Text','100 lb Cover','24 lb White','Freezer adhesive label','Vinyl','Coroplast','Foam Board','20 lb Bond'],
  colors:['Full Color','B&W','1 Color','2 Color'],
  sides:['1 side','2 sides'],
  bleeds:['No Bleed / White Border','Full Bleed'],
  finishing:['None','Cut','Fold','Saddle Stitch','Die Cut','Grommets','Laminate'],
  workers:['Production','Shulem','Front Desk'],
  delivery:['Pickup','Delivery','Ship'],
  pages:['4','8','12','16','20','24','28','32','40','48'],
  binding:['Saddle Stitch','Perfect Bind','Coil','Staple'],
  shapes:['Rectangle','Square','Round','Custom Die Cut'],
  lamination:['None','Gloss','Matte'],
  mounting:['None','4 corner grommets','Grommets every 2 ft','Double-sided tape','Stakes']
};

let productFields={
  'Flyer / Sheet':['qty','size','paper','color','sides','bleed','finish'],
  'Booklet':['qty','size','paper','color','sides','pages','bleed','binding'],
  'Label / Sticker':['qty','size','paper','color','shape','lamination','finish'],
  'Sign / Board':['qty','size','paper','color','sides','mounting','finish'],
  'Banner':['qty','size','paper','color','mounting','finish'],
  'Envelope':['qty','size','paper','color','sides','finish'],
  'Blueprint / Plan':['qty','size','paper','color','sides'],
  'Custom':['qty','size','paper','color','sides','bleed','finish']
};

let page='dashboard',paymentRange='all',paymentSort='date_desc',customerSort='name_asc';
const meta={
  dashboard:['Dashboard','Everything that needs attention today.'],
  board:['Job Board',''],
  customers:['Customers',''],
  jobs:['All Jobs',''],
  payments:['Payments',''],
  search:['Search',''],
  settings:['Settings','']
};
const $=s=>document.querySelector(s);
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n||0);
const cname=j=>customers.find(c=>c.id===j.cid)?.name||'—';
const label=s=>workflow.find(x=>x.key===s)?.label||s;
const balance=j=>Math.max(0,j.price-j.paid);
const customerOutstanding=id=>jobs.filter(j=>j.cid===id).reduce((s,j)=>s+balance(j),0);

function setPage(p){
  page=p;
  $('#title').textContent=meta[p][0];
  const sub=$('#sub');sub.textContent=meta[p][1];sub.classList.toggle('hidden',!meta[p][1]);
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===p));
  render();
}
document.querySelector('#nav').onclick=e=>{const b=e.target.closest('button[data-page]');if(b)setPage(b.dataset.page)};
function render(){
  if(page==='dashboard')dashboard();
  if(page==='board')board();
  if(page==='customers')customerPage();
  if(page==='jobs')jobsPage();
  if(page==='payments')paymentsPage();
  if(page==='search')searchPage();
  if(page==='settings')settingsPage();
}
