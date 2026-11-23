/* ============ DATA ============ */
const NAV = [
  {id:'dashboard',label:'Dashboard',ic:'▦'},
  {id:'orders',label:'Orders',ic:'🛍️'},
  {id:'analytics',label:'Analytics & Reports',ic:'📊'},
  {id:'notifications',label:'Notifications',ic:'🔔'},
  {title:'REGISTRATION'},
  {id:'seller-reg',label:'Seller Registration',ic:'🏪'},
  {id:'rider-reg',label:'Rider Registration',ic:'🚴'},
  {title:'MANAGEMENT'},
  {id:'customers',label:'Customers',ic:'👥'},
  {id:'sellers',label:'Sellers',ic:'🏬'},
  {id:'riders',label:'Riders',ic:'🚲'},
  {id:'offers',label:'Offers & Discounts',ic:'🏷️'},
  {id:'reviews',label:'Reviews & Ratings',ic:'⭐'},
  {sep:true},
  {id:'settings',label:'Settings',ic:'⚙️'},
  {id:'logout',label:'Logout',ic:'🚪'}
];

/* ============ LIVE DATA ============
   Everything below is filled from the Flask API (GET /api/admin/bootstrap) by loadData().
   Registrations, orders and ratings made in the customer / seller / rider panels show up here. */
const ORDERS = [];            // every order, newest first
const PEOPLE = {customers:[],sellers:[],riders:[]};
const CUST_STATUSES=['Active','Inactive'];
const normStatus=v=>/^active$/i.test(String(v??'').trim())?'Active':'Inactive';
const REG = {sellers:[],riders:[]};   // rows: [name, owner|vehicle, phone, city, status, reason, id]
const RESTAURANTS = [];
const OFFERS = [];
const REVIEWS = [];
const DAY_MS=864e5;
const dayOffset=n=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-n);return d};   // n days ago, midnight
const TODAY=dayOffset(0), TOMORROW=dayOffset(-1);
const HIST_START=new Date(TODAY.getFullYear(),TODAY.getMonth()-5,1);   // reports cover six calendar months back
const HIST_DAYS=Math.round((TODAY-HIST_START)/DAY_MS);
const SELLER_LIFE={}, RIDER_LIFE={};   // name -> {from: days since joined, end: null}
let ALL_ORDERS=[];
const BY={seller:{},rider:{}};   // orders per seller / per rider, newest first
const timeStr=d=>{const h=d.getHours();return (h%12||12)+':'+String(d.getMinutes()).padStart(2,'0')+' '+(h<12?'AM':'PM')};

/* ---- API client ---- */
const TOKEN_KEY='foodie.admin.token';
const getToken=()=>{try{return sessionStorage.getItem(TOKEN_KEY)||localStorage.getItem(TOKEN_KEY)||''}catch(e){return ''}};
function setToken(t,remember){try{sessionStorage.removeItem(TOKEN_KEY);localStorage.removeItem(TOKEN_KEY);if(t)(remember?localStorage:sessionStorage).setItem(TOKEN_KEY,t)}catch(e){}}
async function api(method,path,body){
  const res=await fetch(path,{method,headers:{'Content-Type':'application/json',...(getToken()?{Authorization:'Bearer '+getToken()}:{})},body:body?JSON.stringify(body):undefined});
  const data=await res.json().catch(()=>({}));
  if(res.status===401&&getToken()){setToken('');showLogin('Your session expired. Please sign in again.')}
  if(!res.ok)throw new Error(data.error||'Request failed');
  return data;
}
const ago=iso=>{const m=Math.max(0,Math.round((Date.now()-new Date(iso))/6e4));return m<1?'just now':m<60?m+' min ago':m<1440?Math.round(m/60)+' hr ago':m<2880?'Yesterday':Math.round(m/1440)+' days ago'};
const daysSince=iso=>Math.max(0,Math.round((TODAY-new Date(new Date(iso).setHours(0,0,0,0)))/DAY_MS));

function loadData(d){
  PEOPLE.customers=d.customers.map(c=>[c.name,c.email,c.phone||'—',c.city||'—',normStatus(c.status),'',c.id]);
  const approved=l=>l.filter(x=>x.status==='Approved');
  PEOPLE.sellers=approved(d.sellers).map(s=>[s.restaurant,s.owner,s.phone,s.city||'—',s.active?'Active':'Inactive',s.id]);
  PEOPLE.riders=approved(d.riders).map(r=>[r.name,r.vehicle,r.phone,r.city||'—',r.active?'Active':'Inactive',r.id]);
  REG.sellers=d.sellers.map(s=>[s.restaurant,s.owner,s.phone,s.city||'—',s.status,s.reason||undefined,s.id]);
  REG.riders=d.riders.map(r=>[r.name,r.vehicle,r.phone,r.city||'—',r.status,r.reason||undefined,r.id]);
  RESTAURANTS.length=0;
  d.sellers.filter(s=>s.status!=='Rejected').forEach(s=>RESTAURANTS.push({n:s.restaurant,e:s.emoji||'🍽️',cu:s.cuisine,city:s.city||'—',r:s.rating||0,o:s.orders,s:s.status}));
  OFFERS.length=0;d.offers.forEach(o=>OFFERS.push([o.code,o.description,'₹'+o.max,o.expiry,o.status]));
  REVIEWS.length=0;d.reviews.forEach(r=>REVIEWS.push([r.customer,r.dish,r.rating,r.comment||'(no comment)',r.restaurant]));
  Object.keys(SELLER_LIFE).forEach(k=>delete SELLER_LIFE[k]);Object.keys(RIDER_LIFE).forEach(k=>delete RIDER_LIFE[k]);
  d.sellers.filter(s=>s.status==='Approved').forEach(s=>SELLER_LIFE[s.restaurant]={from:daysSince(s.created_at),end:null});
  d.riders.filter(r=>r.status==='Approved').forEach(r=>RIDER_LIFE[r.name]={from:daysSince(r.created_at),end:null});
  ORDERS.length=0;
  d.orders.forEach(o=>{const ts=new Date(o.created_at),first=o.items[0]||{name:'—',emoji:'🍽️'},qty=o.items.reduce((t,i)=>t+i.qty,0);
    ORDERS.push({id:'#FO'+o.id,item:first.name+(o.items.length>1?` +${o.items.length-1} more`:''),e:first.emoji,s:o.status,t:timeStr(ts),cust:o.customer,amt:o.total,qty,
      seller:o.seller,rider:o.rider,riderId:o.rider_id,km:o.km,mins:o.mins,pay:o.pay,ts,dishes:o.items})});
  ALL_ORDERS=[...ORDERS].sort((a,b)=>a.ts-b.ts);
  BY.seller={};BY.rider={};
  [...ALL_ORDERS].reverse().forEach(o=>{(BY.seller[o.seller]??=[]).push(o);if(o.riderId)(BY.rider[o.riderId]??=[]).push(o)});
  NOTIFS.length=0;d.notifications.forEach(n=>NOTIFS.push({id:n.id,type:n.type,title:n.title,text:n.text,time:ago(n.created_at),page:n.page,params:n.params}));
  if(d.admin){S.profile.name=d.admin.name||S.profile.name;S.profile.email=d.admin.email||S.profile.email}
  if(d.links)LINKS=d.links;
  // newest sign-ups from every device, mixed together
  SIGNUPS.length=0;
  d.customers.forEach(c=>SIGNUPS.push({k:'c'+c.id,role:'Customer',ic:'👥',name:c.name,sub:[c.email,c.phone,c.city].filter(Boolean).join(' · '),status:c.status==='Active'?'Active':'Inactive',at:c.created_at,page:'customers',params:{q:c.name,hl:c.name}}));
  d.sellers.forEach(x=>SIGNUPS.push({k:'s'+x.id,role:'Seller',ic:'🏪',name:x.restaurant,sub:[x.owner,x.phone,x.city].filter(Boolean).join(' · '),status:x.status,at:x.created_at,page:'seller-reg',params:{hl:x.restaurant}}));
  d.riders.forEach(x=>SIGNUPS.push({k:'r'+x.id,role:'Rider',ic:'🚴',name:x.name,sub:[x.vehicle,x.phone,x.city].filter(Boolean).join(' · '),status:x.status,at:x.created_at,page:'rider-reg',params:{hl:x.name}}));
  SIGNUPS.sort((a,b)=>new Date(b.at)-new Date(a.at));
  announceNew();
}
let LINKS=null;const SIGNUPS=[];let SEEN=null;
function announceNew(){
  const keys=new Set(SIGNUPS.map(x=>x.k));
  if(SEEN){
    const fresh=SIGNUPS.filter(x=>!SEEN.has(x.k));
    if(fresh.length){
      const f=fresh[0];
      toast(`${f.ic} New ${f.role.toLowerCase()} registered: ${f.name}`+(fresh.length>1?` (+${fresh.length-1} more)`:''),6000);
      beep();
    }
  }
  SEEN=keys;
}
function beep(){try{const a=new(window.AudioContext||window.webkitAudioContext)(),o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.frequency.value=880;g.gain.value=.05;o.start();o.stop(a.currentTime+.18)}catch(e){}}
const pendingCount=k=>(k==='seller-reg'?REG.sellers:REG.riders).filter(r=>r[4]==='Pending').length;

/* ---- small helpers for numbers computed from the log ---- */
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const dShort=d=>d.getDate()+' '+MON[d.getMonth()];
const dLong=d=>dShort(d)+' '+d.getFullYear();
const stamp=o=>dShort(o.ts)+(o.ts.getFullYear()!==TODAY.getFullYear()?' '+o.ts.getFullYear():'')+', '+o.t;
const hr12=h=>((h%12)||12)+' '+(h%24<12?'AM':'PM');
const revenue=list=>list.reduce((t,o)=>t+(o.s==='Delivered'?o.amt:0),0);
const between=(a,b)=>ALL_ORDERS.filter(o=>o.ts>=a&&o.ts<b);
const pctChange=(cur,prev)=>prev?Math.round((cur-prev)/prev*1000)/10:null;
const groupBy=(list,fn)=>{const m=new Map();list.forEach(o=>{const k=fn(o);if(k==null)return;(m.get(k)||m.set(k,[]).get(k)).push(o)});return m};
const avgOf=(arr)=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:null;
const avgRating=()=>REVIEWS.length?Math.round(avgOf(REVIEWS.map(r=>r[2]))*10)/10:null;
const activeCount=k=>PEOPLE[k].filter(r=>r[4]==='Active').length;
function growth30(){   // last 30 days vs the 30 days before
  const cur=between(dayOffset(29),TOMORROW), prev=between(dayOffset(59),dayOffset(29));
  return {rev:pctChange(revenue(cur),revenue(prev)),orders:pctChange(cur.length,prev.length)};
}
function peakWindow(list){const c=Array(24).fill(0);list.forEach(o=>c[o.ts.getHours()]++);let best=-1,at=19;for(let h=0;h<23;h++)if(c[h]+c[h+1]>best){best=c[h]+c[h+1];at=h}return hr12(at)+' – '+hr12(at+2)}
function topDishes(list){const m=new Map();list.filter(o=>o.s==='Delivered').forEach(o=>(o.dishes||[]).forEach(d=>{const x=m.get(d.name)||{item:d.name,e:d.emoji,orders:0,units:0,rev:0};x.orders++;x.units+=d.qty;x.rev+=d.price*d.qty;m.set(d.name,x)}));return [...m.values()].sort((a,b)=>b.orders-a.orders)}
/* revenue buckets: kind = day | week | month, count = number of buckets ending today */
function revSeries(kind,count){
  const labels=[],data=[];
  for(let k=count-1;k>=0;k--){
    let a,b,l;
    if(kind==='day'){a=dayOffset(k);b=dayOffset(k-1);l=dShort(a)}
    else if(kind==='week'){a=dayOffset(k*7+6);b=dayOffset(k*7-1);l=dShort(a)}
    else{a=new Date(TODAY.getFullYear(),TODAY.getMonth()-k,1);b=new Date(TODAY.getFullYear(),TODAY.getMonth()-k+1,1);l=MON[a.getMonth()]+(k===0?' (so far)':'')}
    labels.push(l);data.push(revenue(between(a,b)));
  }
  return {labels,data,kind};
}
const DASH_SERIES={Daily:['day',7],Weekly:['week',5],Monthly:['month',6]};

/* ============ NOTIFICATIONS DATA ============ */
// type -> icon / label. "order" notifications can be switched off in Settings → Notifications.
const N_TYPES={order:['🛍️','Orders'],seller:['🏪','Sellers'],rider:['🚴','Riders'],review:['⭐','Reviews'],offer:['🏷️','Offers'],customer:['👥','Customers']};
const NOTIFS=[];   // filled from the server by loadData()

/* ============ HELPERS ============ */
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const badge=s=>`<span class="badge b-${esc(s).split(' ')[0]}">${esc(s)}</span>`;
const toast=(m,ms=2400)=>{const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove('show'),ms)};
const fmt=n=>n>=1000?(n/1000).toFixed(n%1000?1:0)+'k':n;
const head=(t,p,extra='')=>`<div class="page-head"><div><h2>${t}</h2><p>${p}</p></div>${extra}</div>`;
const BADGE_RE=/^(Active|Rejected|Approved|Pending|Inactive|Cancelled|Preparing|Accepted|Delivered|Out for Delivery)$/;
const table=(cols,rows,actions,cell)=>`<div class="card tbl-wrap"><table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}${actions?'<th>Actions</th>':''}</tr></thead><tbody>${rows.map(r=>`<tr data-k="${esc(r[0])}">${r.map((c,j)=>{const x=cell&&cell(c,j,r);return `<td>${x!=null?x:BADGE_RE.test(c)?badge(c):esc(c)}</td>`}).join('')}${actions?`<td class="act">${typeof actions==='function'?actions(r):actions}</td>`:''}</tr>`).join('')}</tbody></table></div>`;

const pageSearch=(id,ph,v)=>`<input id="${id}" class="page-search" type="search" autocomplete="off" aria-label="${esc(ph)}" placeholder="${esc(ph)}" value="${esc(v||'')}">`;
/* search matching: every word must appear (phone numbers match with or without spaces) */
const tokens=q=>String(q||'').toLowerCase().split(/\s+/).filter(Boolean);
const hit=(hay,tk)=>{hay=String(hay).toLowerCase();const flat=hay.replace(/[\s-]/g,'');return tk.every(t=>hay.includes(t)||flat.includes(t))};
const mark=(s,tk)=>{s=String(s);if(!tk.length)return esc(s);const re=new RegExp('('+tk.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')','gi');return s.split(re).map((x,i)=>i%2?`<mark>${esc(x)}</mark>`:esc(x)).join('')};

/* ---- hash routing with query params: #orders?q=%23FO4721 ---- */
const link=(page,params={})=>{const u=new URLSearchParams();Object.entries(params).forEach(([k,v])=>v!==''&&v!=null&&u.set(k,v));const q=u.toString();return '#'+page+(q?'?'+q:'')};
function parseHash(){const raw=location.hash.slice(1),i=raw.indexOf('?');let id='';try{id=decodeURIComponent(i<0?raw:raw.slice(0,i))}catch(e){}return{id:id||'dashboard',p:new URLSearchParams(i<0?'':raw.slice(i+1))}}
function go(h){h=h.replace(/^#/,'');const before=location.href;location.hash=h;if(location.href===before)route()}

/* ============ STORAGE + STATE (localStorage is optional: everything works without it) ============ */
const store={
  get(k,d){try{const v=localStorage.getItem('foodie.'+k);return v?JSON.parse(v):d}catch(e){return d}},
  set(k,v){try{localStorage.setItem('foodie.'+k,JSON.stringify(v));return true}catch(e){return false}}
};
// Demo only: there is no backend, so the password is kept as a non-reversible hash in the browser.
const hashPw=s=>{let h=5381;for(const c of s)h=((h<<5)+h+c.charCodeAt(0))>>>0;return 'd'+h};
const DEF={
  profile:{name:'Admin',email:'admin@foodie.com',phone:'98480 00000',city:'Vijayawada',bio:'',avatar:'👩'},
  theme:{mode:'light',accent:'orange'},
  prefs:{email:true,orderAlerts:true,autoApprove:false,maintenance:false},
  account:{pw:hashPw('admin123'),twofa:false,loginAlerts:true,
    sessions:[{id:1,device:'This device',loc:'Current browser',when:'Active now',cur:true},{id:2,device:'Safari on iPhone',loc:'Guntur, IN',when:'2 hours ago'},{id:3,device:'Edge on Windows',loc:'Hyderabad, IN',when:'Yesterday'}]}
};
/* ---- sign-in session: sessionStorage (until tab closes) or localStorage when "Keep me signed in" is ticked ---- */
const isAuthed=()=>!!getToken();
const S={};
for(const k in DEF)S[k]={...DEF[k],...store.get(k,{})};
const save=k=>store.set(k,S[k]);
const NS=store.get('notifs',{read:[],gone:[]});            // read / dismissed notification ids
const saveN=()=>store.set('notifs',NS);
const ACCENTS={orange:['#ff7a1a','Orange'],red:['#e53935','Red'],green:['#22a35a','Green'],blue:['#2f6fed','Blue'],purple:['#7c4dde','Purple']};
const EMOJIS=['👩','👨','🧑‍🍳','👩‍💼','👨‍💼','🦸','🐯','🦊'];
const isImg=a=>/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(a||'');
const avatarHTML=a=>isImg(a)?`<img src="${a}" alt="">`:esc(a||'👩');

/* ---- theme ---- */
if(!['light','dark'].includes(S.theme.mode))S.theme.mode='light';   // old saved "system" choice falls back to Light
function applyTheme(){
  const dark=S.theme.mode==='dark';
  document.documentElement.dataset.theme=dark?'dark':'light';
  document.documentElement.style.setProperty('--orange',(ACCENTS[S.theme.accent]||ACCENTS.orange)[0]);
}
applyTheme();

/* ---- notifications state ---- */
const visibleNotifs=()=>NOTIFS.filter(n=>!NS.gone.includes(n.id)&&(n.type!=='order'||S.prefs.orderAlerts));
const isRead=n=>NS.read.includes(n.id);
const unreadCount=()=>visibleNotifs().filter(n=>!isRead(n)).length;
const nHref=n=>link(n.page,n.params);

function notifItem(n,full){
  const [ic]=N_TYPES[n.type];
  return `<div class="nitem ${isRead(n)?'':'unread'}"><button class="nmain" data-nopen="${n.id}"><span class="nic" aria-hidden="true">${ic}</span><span class="ntx"><b>${esc(n.title)}</b><span>${esc(n.text)}</span><small>${esc(n.time)}</small></span></button>${full?`<div class="nact"><button data-ntoggle="${n.id}">${isRead(n)?'Mark unread':'Mark read'}</button><button data-ndel="${n.id}" aria-label="Dismiss notification">✕ Dismiss</button></div>`:''}</div>`;
}
function renderPanel(){
  const list=visibleNotifs(), u=unreadCount();
  $('#notifPanel').innerHTML=`<div class="panel-h"><h3>Notifications<small>${u} unread</small></h3><button class="linkbtn" id="markAll" ${u?'':'disabled'}>Mark all read</button></div>
  <div class="panel-list">${list.length?list.slice(0,6).map(n=>notifItem(n,false)).join(''):'<div class="sr-none">🎉 You\'re all caught up</div>'}</div>
  <a class="panel-f" href="#notifications" id="viewAllN">View all notifications</a>`;
}
function updateBadges(){
  const u=unreadCount(),b=$('#bellCount');
  b.hidden=!u;b.textContent=u>9?'9+':u;
  $('#bell').setAttribute('aria-label',u?`Notifications, ${u} unread`:'Notifications');
  const nb=$('#navNotif');if(nb){nb.hidden=!u;nb.textContent=u}
  ['seller-reg','rider-reg'].forEach(k=>{const e=$('#nav-'+k);if(e){const c=pendingCount(k);e.hidden=!c;e.textContent=c;e.title=c+' waiting for approval'}});
  const pend=pendingCount('seller-reg')+pendingCount('rider-reg');
  document.title=(pend?`(${pend}) `:'')+document.title.replace(/^\(\d+\)\s*/,'');
  if(!$('#notifPanel').hidden)renderPanel();
}
function markRead(id,v=true){const has=NS.read.includes(id);if(v&&!has)NS.read.push(id);if(!v&&has)NS.read=NS.read.filter(x=>x!==id);saveN();updateBadges()}
function openNotif(id){const n=NOTIFS.find(x=>x.id===id);if(!n)return;markRead(id);closePanels();go(nHref(n))}

/* ============ VIEWS ============ */
const V={};
function dashData(){
  const g=growth30(), r=avgRating(), arrow=v=>v==null?'':(v>=0?'↑ ':'↓ ')+Math.abs(v)+'%';
  return {cust:PEOPLE.customers.length,custA:activeCount('customers'),sell:PEOPLE.sellers.length,sellA:activeCount('sellers'),
    ride:PEOPLE.riders.length,rideA:activeCount('riders'),orders:ALL_ORDERS.length,ordChg:arrow(g.orders),
    top:topDishes(ALL_ORDERS).slice(0,3),peak:peakWindow(between(dayOffset(29),TOMORROW)),
    growth:g.rev,growthTxt:g.rev==null?'—':(g.rev>=0?'+':'−')+Math.abs(g.rev)+'%',rating:r};
}

V.dashboard=()=>{const D=dashData();return `
${head('Welcome back, '+esc(S.profile.name)+'! 👋',"Here's what's happening with your Foodie platform today.",`<label class="range">📅 <select id="range"><option>Last 30 Days</option><option>Last 7 Days</option><option>Today</option></select></label>`)}
<section class="stats">
  <a class="stat s1" href="#customers"><div class="bubble">👥</div><div><h3 data-count="${D.cust}">0</h3><p>Total Customers</p></div><span class="up">${D.custA} active</span></a>
  <a class="stat s2" href="#sellers"><div class="bubble">🏪</div><div><h3 data-count="${D.sell}">0</h3><p>Total Sellers</p></div><span class="up">${D.sellA} active</span></a>
  <a class="stat s3" href="#riders"><div class="bubble">🚴</div><div><h3 data-count="${D.ride}">0</h3><p>Total Riders</p></div><span class="up">${D.rideA} active</span></a>
  <a class="stat s4" href="#orders"><div class="bubble">🛍️</div><div><h3 data-count="${D.orders}">0</h3><p>Total Orders</p></div><span class="up" title="Last 30 days vs the 30 days before">${D.ordChg}</span></a>
</section>
<section class="row2" id="regRow">
  <div class="card"><div class="card-h"><h3>🆕 Live Registrations <small style="font-weight:400;color:var(--muted)">· from every device, updates automatically</small></h3><span class="badge b-Pending">${pendingCount('seller-reg')+pendingCount('rider-reg')} awaiting approval</span></div>
    <ul class="orders">${SIGNUPS.slice(0,8).map(x=>`<li><div class="food">${x.ic}</div><div class="info"><b>${esc(x.name)} <small style="font-weight:400">(${x.role})</small></b><span>${esc(x.sub||'—')}</span></div>${badge(x.status)}<span class="time">${ago(x.at)}</span><a class="link" href="${link(x.page,x.params)}">View</a></li>`).join('')||'<li class="empty" style="padding:14px">No registrations yet. Share the links on the right with sellers, riders and customers.</li>'}</ul></div>
  <div class="card"><div class="card-h"><h3>🔗 Registration Links</h3></div>
    <p class="sub" style="margin:0 0 10px;font-size:13px">Open these on a phone or another computer on the same Wi-Fi. Anything they register appears here.</p>
    ${LINKS?[['🏪','Seller',LINKS.seller],['🚴','Rider',LINKS.rider],['👥','Customer',LINKS.customer]].map(([i,n,u])=>`<div class="linkrow"><span>${i} <b>${n}</b></span><code>${esc(u)}</code><button class="btn ghost" data-copy="${esc(u)}">Copy</button></div>`).join(''):''}
  </div>
</section>
<section class="row2">
  <div class="card"><div class="card-h"><h3>📶 Sales Overview</h3><div class="seg" id="seg"><button class="on">Daily</button><button>Weekly</button><button>Monthly</button></div></div><div class="chart" id="chart"></div></div>
  <div class="card"><div class="card-h"><h3>🛍️ Recent Orders</h3><a class="link" href="#orders">View All →</a></div><ul class="orders">${ORDERS.slice(0,5).map(o=>`<li><div class="food">${o.e}</div><div class="info"><b>${o.id}</b><span>${o.item}</span></div>${badge(o.s)}<span class="time">${o.t}</span></li>`).join('')}</ul></div>
</section>
<section class="row3">
  <div class="card"><div class="card-h"><h3>👑 Top Selling Dishes</h3><a class="link" href="#analytics">View All →</a></div>
    ${D.top.map((d,i)=>`<div class="dish"><span>${i+1}</span><div class="food">${d.e}</div><div><div class="meta"><b>${esc(d.item)}</b><span>${d.orders.toLocaleString('en-IN')} orders</span></div><div class="bar"><i data-w="${d.orders/D.top[0].orders*100}"></i></div></div></div>`).join('')}</div>
  <div class="card"><div class="card-h"><h3>💡 Platform Insights</h3></div><div class="mini-grid">
    <div class="mini m1"><span class="mi">⏰</span><div>Peak Hour<b>${D.peak}</b></div></div>
    <div class="mini m2"><span class="mi">📈</span><div>Growth Rate<b style="color:${D.growth!=null&&D.growth<0?'#e53935':'var(--green)'}" title="Revenue, last 30 days vs the 30 days before">${D.growthTxt}</b></div></div>
    <div class="mini m3"><span class="mi">⭐</span><div>Avg Rating<b>${D.rating!=null?D.rating+' / 5':'—'}</b></div></div>
    <div class="mini m4"><span class="mi">👛</span><div>Total Orders<b>${D.orders.toLocaleString('en-IN')}</b></div></div></div></div>
  <div class="card"><div class="card-h"><h3>⚡ Quick Actions</h3></div><div class="quick">
    <a class="q" href="#restaurants"><span>🏪</span>Restaurants List</a>
    <a class="q" href="${link('seller-reg',{f:'Pending'})}"><span>🏪</span>Approve Seller</a>
    <a class="q" href="${link('rider-reg',{f:'Pending'})}"><span>🚴</span>Approve Rider</a>
    <a class="q" href="#offers"><span>🏷️</span>Create Offer</a>
    <a class="q" href="#analytics"><span>📊</span>View Reports</a>
    <a class="q" href="#customers"><span>👥</span>Manage Users</a></div></div>
</section>`};

V.orders=p=>head('Orders',`Live from the customer app · ${ALL_ORDERS.length.toLocaleString('en-IN')} orders placed in total. This page refreshes automatically.`)+
`<div class="toolbar">${pageSearch('q','Search by order ID, dish or customer…',p.get('q'))}<select id="st"><option value="">All statuses</option>${['Pending','Accepted','Preparing','Out for Delivery','Delivered','Cancelled'].map(x=>`<option ${p.get('s')===x?'selected':''}>${x}</option>`).join('')}</select></div><div id="tblHost"></div>`;

V.restaurants=p=>head('Restaurants List','All restaurants registered on Foodie.','<button class="btn ghost" id="addRest">How restaurants join</button>')+
`<div class="toolbar">${pageSearch('rq','Search restaurants by name, cuisine or city…',p.get('q'))}<select id="rs"><option value="">All statuses</option><option>Approved</option><option>Pending</option></select></div><div class="menu-grid" id="restGrid"></div>`;

/* ---- Analytics & Reports: everything here is computed from ALL_ORDERS (+ people / reviews), nothing is typed in ---- */
const AN_RANGES={'7':{days:7,label:'Last 7 days',kind:'day',n:7,unit:'Daily'},'30':{days:30,label:'Last 30 days',kind:'day',n:30,unit:'Daily'},'84':{days:84,label:'Last 12 weeks',kind:'week',n:12,unit:'Weekly'},'all':{days:0,label:'All time (6 months)',kind:'month',n:6,unit:'Monthly'}};
const AN={range:'30'};
const pct=v=>v==null?'—':(v>=0?'+':'−')+Math.abs(v)+'%';
const kpi=(cls,ic,val,label,sub,up)=>`<div class="stat static ${cls}"><div class="bubble">${ic}</div><div><h3>${val}</h3><p>${label}</p>${sub?`<small>${sub}</small>`:''}</div>${up?`<span class="up">${up}</span>`:''}</div>`;
function anData(){
  const c=AN_RANGES[AN.range], from=c.days?dayOffset(c.days-1):HIST_START, list=between(from,TOMORROW);
  const pFrom=c.days?dayOffset(2*c.days-1):null, prev=c.days&&pFrom>=HIST_START?between(pFrom,from):null;   // previous period only if the log reaches back that far
  const g=growth30();
  return {c,from,list,growth:c.days?(prev?pctChange(revenue(list),revenue(prev)):null):g.rev,
    ordChg:prev?pctChange(list.length,prev.length):null,growthLabel:c.days?`vs previous ${c.days} days`:'last 30 days vs the 30 before'};
}
const restaurantStats=list=>[...groupBy(list,o=>o.seller)].map(([n,g])=>({n,orders:g.length,rev:revenue(g)})).sort((a,b)=>b.rev-a.rev);
const riderStats=del=>[...groupBy(del.filter(o=>o.rider),o=>o.rider)].map(([n,g])=>({n,deliveries:g.length,mins:avgOf(g.filter(o=>o.mins).map(o=>o.mins)),km:g.reduce((t,o)=>t+(o.km||0),0),pay:g.reduce((t,o)=>t+(o.pay||0),0)})).sort((a,b)=>b.deliveries-a.deliveries);
const customerStats=del=>[...groupBy(del,o=>o.cust)].map(([n,g])=>({n,orders:g.length,spent:revenue(g)})).sort((a,b)=>b.spent-a.spent);
const nameLink=(kind,n)=>hasHistory(kind,n)?`<a class="name-link" href="${link(kind+'-history',{n})}">${esc(n)}</a>`:esc(n);
V.analytics=()=>head('Analytics & Reports',`Calculated from ${ALL_ORDERS.length.toLocaleString('en-IN')} orders across ${PEOPLE.sellers.length} sellers, ${PEOPLE.riders.length} riders and ${PEOPLE.customers.length} customers.`,
  `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><label class="range">📅 <select id="anRange" aria-label="Report period">${Object.entries(AN_RANGES).map(([k,v])=>`<option value="${k}" ${AN.range===k?'selected':''}>${v.label}</option>`).join('')}</select></label><button class="btn" id="exportBtn">Export report</button></div>`)+`<div id="anBody"></div>`;
function analyticsBody(d){
  const {c,list}=d;
  if(!list.length)return '<div class="card empty">No orders in this period.</div>';
  const del=list.filter(o=>o.s==='Delivered'), canc=list.filter(o=>o.s==='Cancelled'), live=list.length-del.length-canc.length;
  const rev=revenue(list), done=del.length+canc.length, mins=avgOf(del.filter(o=>o.mins).map(o=>o.mins)), rt=avgRating();
  const custN=new Set(list.map(o=>o.cust)).size;
  const rs=restaurantStats(list), ds=topDishes(list).slice(0,6), rd=riderStats(del), cs=customerStats(del).slice(0,5);
  const hrs=[...Array(15)].map((_,i)=>i+9).map(h=>({h,n:list.filter(o=>o.ts.getHours()===h).length})), hmax=Math.max(...hrs.map(x=>x.n),1);
  const statusRows=[['Delivered',del.length,'var(--green)'],['Cancelled',canc.length,'#e53935'],['In progress',live,'var(--orange)']];
  const th=(...c)=>`<tr>${c.map(x=>`<th>${x}</th>`).join('')}</tr>`;
  const rest=n=>RESTAURANTS.find(r=>r.n===n)||{};
  return `<section class="stats">
    ${kpi('s1','💰',inr(rev),'Revenue',`from ${del.length.toLocaleString('en-IN')} delivered orders`)}
    ${kpi('s2','📦',list.length.toLocaleString('en-IN'),'Orders placed',live?`${live} in progress`:'all completed',d.ordChg==null?'':(d.ordChg>=0?'↑ ':'↓ ')+Math.abs(d.ordChg)+'%')}
    ${kpi('s3','🧾',del.length?inr(rev/del.length):'—','Avg order value','per delivered order')}
    ${kpi('s4','📈',pct(d.growth),'Revenue growth',d.growthLabel)}
  </section>
  <section class="stats">
    ${kpi('s3','✅',done?Math.round(del.length/done*1000)/10+'%':'—','Completion rate',`${canc.length} cancelled`)}
    ${kpi('s4','⏱️',mins?Math.round(mins)+' min':'—','Avg delivery time',`${del.filter(o=>o.mins).length} deliveries timed`)}
    ${kpi('s1','⭐',rt!=null?rt+' / 5':'—','Avg review rating',`${REVIEWS.length} reviews`)}
    ${kpi('s2','👥',custN,'Customers ordering',`of ${PEOPLE.customers.length} customers`)}
  </section>
  <div class="card" style="margin-bottom:20px"><div class="card-h"><h3>📶 Revenue trend</h3><span class="sub-note">${c.unit} revenue · ${c.label}${c.kind==='month'?' (current month so far)':''}</span></div><div class="chart" id="chart"></div></div>
  <section class="row-eq">
    <div class="card"><div class="card-h"><h3>🏪 Restaurants by revenue</h3></div><div class="tbl-wrap"><table class="mini-tbl"><thead>${th('#','Restaurant','Orders','Revenue','Share')}</thead><tbody>${rs.map((r,i)=>`<tr><td>${i+1}</td><td><b>${rest(r.n).e||'🍽️'} ${nameLink('seller',r.n)}</b><small class="cell-sub">${esc(rest(r.n).city||'')}</small></td><td>${r.orders.toLocaleString('en-IN')}</td><td>${inr(r.rev)}</td><td class="share"><div class="bar"><i data-w="${rev?r.rev/rev*100:0}"></i></div><small>${rev?Math.round(r.rev/rev*100):0}%</small></td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><div class="card-h"><h3>👑 Top selling dishes</h3></div><div class="tbl-wrap"><table class="mini-tbl"><thead>${th('#','Dish','Orders','Units','Revenue')}</thead><tbody>${ds.map((x,i)=>`<tr><td>${i+1}</td><td><b>${x.e} ${esc(x.item)}</b></td><td>${x.orders.toLocaleString('en-IN')}</td><td>${x.units.toLocaleString('en-IN')}</td><td>${inr(x.rev)}</td></tr>`).join('')}</tbody></table></div></div>
  </section>
  <section class="row-eq">
    <div class="card"><div class="card-h"><h3>⏰ Orders by hour</h3><span class="sub-note">Peak: ${peakWindow(list)}</span></div><div class="hours">${hrs.map(x=>`<div class="hr${x.n===hmax?' peak':''}" title="${hr12(x.h)}: ${x.n} orders"><div class="col"><i style="height:${x.n/hmax*100}%"></i></div><span>${(x.h%12||12)+(x.h<12?'a':'p')}</span></div>`).join('')}</div></div>
    <div class="card"><div class="card-h"><h3>🧾 Order outcomes</h3></div>${statusRows.map(([l,n,col])=>`<div class="outcome"><div class="meta"><b>${l}</b><span>${n.toLocaleString('en-IN')} · ${Math.round(n/list.length*1000)/10}%</span></div><div class="bar"><i style="background:${col}" data-w="${n/list.length*100}"></i></div></div>`).join('')}</div>
  </section>
  <section class="row-eq">
    <div class="card"><div class="card-h"><h3>🚴 Rider performance</h3></div>${rd.length?`<div class="tbl-wrap"><table class="mini-tbl"><thead>${th('Rider','Deliveries','Avg time','Distance','Earnings')}</thead><tbody>${rd.map(r=>`<tr><td><b>${nameLink('rider',r.n)}</b></td><td>${r.deliveries.toLocaleString('en-IN')}</td><td>${r.mins?Math.round(r.mins)+' min':'—'}</td><td>${Math.round(r.km).toLocaleString('en-IN')} km</td><td>${inr(r.pay)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="sub-note">No deliveries in this period.</p>'}</div>
    <div class="card"><div class="card-h"><h3>🏅 Top customers</h3></div><div class="tbl-wrap"><table class="mini-tbl"><thead>${th('#','Customer','Orders','Spent')}</thead><tbody>${cs.map((x,i)=>`<tr><td>${i+1}</td><td><b>${esc(x.n)}</b></td><td>${x.orders.toLocaleString('en-IN')}</td><td>${inr(x.spent)}</td></tr>`).join('')}</tbody></table></div></div>
  </section>`;
}
function paintAnalytics(){
  const host=$('#anBody'); if(!host)return;
  const d=anData();host.innerHTML=analyticsBody(d);
  if(d.list.length)drawChart(revSeries(d.c.kind,d.c.n));
  requestAnimationFrame(()=>$$('.bar i',host).forEach(i=>i.style.width=i.dataset.w+'%'));
}
function exportCSV(){
  const d=anData(), {c,list}=d, del=list.filter(o=>o.s==='Delivered'), sr=revSeries(c.kind,c.n), rev=revenue(list);
  const rows=[['Foodie analytics report'],['Period',c.label],['Generated',dLong(new Date())],[],
    ['Summary'],['Orders placed',list.length],['Delivered',del.length],['Cancelled',list.filter(o=>o.s==='Cancelled').length],['Revenue (INR)',rev],['Average order value (INR)',del.length?Math.round(rev/del.length):0],[],
    [c.unit+' revenue'],['Period','Revenue (INR)'],...sr.labels.map((l,i)=>[l,sr.data[i]]),[],
    ['Restaurants'],['Restaurant','Orders','Revenue (INR)'],...restaurantStats(list).map(r=>[r.n,r.orders,r.rev]),[],
    ['Top dishes'],['Dish','Orders','Units','Revenue (INR)'],...topDishes(list).map(x=>[x.item,x.orders,x.units,x.rev]),[],
    ['Riders'],['Rider','Deliveries','Avg minutes','Distance (km)','Earnings (INR)'],...riderStats(del).map(r=>[r.n,r.deliveries,r.mins?Math.round(r.mins):'',Math.round(r.km),r.pay]),[],
    ['Top customers'],['Customer','Orders','Spent (INR)'],...customerStats(del).map(x=>[x.n,x.orders,x.spent]),[],
    ['Orders'],['Order','Date','Time','Restaurant','Dish','Qty','Customer','Rider','Amount (INR)','Status'],...[...list].reverse().map(o=>[o.id,dLong(o.ts),o.t,o.seller,o.item,o.qty,o.cust,o.rider||'',o.amt,o.s])];
  const csv=rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='foodie-report-'+AN.range+'.csv';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);toast('Report downloaded ('+c.label.toLowerCase()+')');
}

/* ---- Registration pages: approve / reject ---- */
const REG_FILTER={'seller-reg':'All','rider-reg':'All'};
const REG_Q={'seller-reg':'','rider-reg':''};
const REG_COLS={'seller-reg':['Restaurant','Owner','Phone','City','Status'],'rider-reg':['Name','Vehicle','Phone','City','Status']};
/* Rejected rows keep their reason in r[5]; once rejected there is no Approve/Reject button, only the reason. */
const docLink=(r,key)=>`<a class="name-link" data-review-kind="${key==='seller-reg'?'seller':'rider'}" data-review-id="${r[6]}" href="#" style="margin-right:8px">Details</a>`;
const regActions=r=>r[4]==='Rejected'
  ?`<span class="rej-reason" title="${esc(r[5]||'')}"><b>Reason:</b> ${esc(r[5]||'No reason recorded')}</span>`
  :`<button class="approve" data-act="Approved" ${r[4]==='Approved'?'disabled':''} aria-label="Approve ${esc(r[0])}">Approve</button>`+
   `<button class="reject" data-act="Rejected" aria-label="Reject ${esc(r[0])}">Reject</button>`;
function regBody(key){
  const [src,k]=DATA[key], rows=src[k], f=REG_FILTER[key], tk=tokens(REG_Q[key]);
  const shown=rows.map((r,i)=>({r,i})).filter(x=>(f==='All'||x.r[4]===f)&&hit(x.r.join(' '),tk));
  return shown.length?`<div class="card tbl-wrap"><table><thead><tr>${REG_COLS[key].map(c=>`<th>${c}</th>`).join('')}<th>Actions</th></tr></thead><tbody>${
    shown.map(({r,i})=>`<tr data-idx="${i}" data-k="${esc(r[0])}">${r.slice(0,5).map((c,j)=>`<td>${j===4?badge(c):esc(c)}</td>`).join('')}<td class="act">${docLink(r,key)}${regActions(r)}</td></tr>`).join('')
  }</tbody></table></div>`:`<div class="card empty">${tk.length?'No registrations match your search. Clear it to see everyone.':`No ${f.toLowerCase()} registrations right now.`}</div>`;
}
function regPage(key){
  const [src,k]=DATA[key], rows=src[k], f=REG_FILTER[key];
  const count=s=>s==='All'?rows.length:rows.filter(r=>r[4]===s).length;
  const tabs=['All','Pending','Approved','Rejected'].map(s=>`<button class="${s===f?'on':''}" data-filter="${s}">${s}<b>${count(s)}</b></button>`).join('');
  const label=key==='seller-reg'?'Seller Registration':'Rider Registration';
  const ph=key==='seller-reg'?'Search by restaurant, owner, phone or city…':'Search by name, vehicle, phone or city…';
  return head(label,`${count('Pending')} pending · ${count('Approved')} approved · ${count('Rejected')} rejected`)+
    `<div class="toolbar">${pageSearch('regQ',ph,REG_Q[key])}</div><div class="reg-tabs" id="regTabs">${tabs}</div><div id="regBody">${regBody(key)}</div>`;
}


/* ---- approve / reject through the API, then reload everything ---- */
async function setReg(key,row,status,reason){
  const kind=key==='seller-reg'?'sellers':'riders';
  try{await api('PATCH',`/api/admin/${kind}/${row[6]}/status`,{status,reason});toast(row[0]+' '+status.toLowerCase());await refresh()}
  catch(e){toast(e.message)}
}
async function refresh(){loadData(await api('GET','/api/admin/bootstrap'));route(true)}

/* ---- Reject dialog (reason is required) ---- */
let rejCtx=null;
function openReject(row,key){
  rejCtx={row,key,opener:document.activeElement};
  $('#rejName').textContent=row[0];$('#rejText').value='';$('#rejErr').textContent='';$('#rejText').removeAttribute('aria-invalid');$('#rejCount').textContent='0/200';
  $('#rejModal').hidden=false;$('#rejText').focus();
}
function closeReject(){const o=rejCtx&&rejCtx.opener;$('#rejModal').hidden=true;rejCtx=null;if(o&&o.focus&&document.contains(o))o.focus()}
function confirmReject(){
  const v=$('#rejText').value.trim();
  if(v.length<5){$('#rejErr').textContent='Please give a reason (at least 5 characters).';$('#rejText').setAttribute('aria-invalid','true');$('#rejText').focus();return}
  const {row,key}=rejCtx;closeReject();setReg(key,row,'Rejected',v);
}
$('#rejText').addEventListener('input',e=>{$('#rejCount').textContent=e.target.value.length+'/200';$('#rejErr').textContent='';e.target.removeAttribute('aria-invalid')});
$('#rejOk').onclick=confirmReject;$('#rejCancel').onclick=closeReject;
$('#rejModal').addEventListener('click',e=>{if(e.target.id==='rejModal')closeReject()});
$('#rejModal').addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.stopPropagation();closeReject()}
  if(e.key==='Tab'){const f=$$('textarea,button',$('#rejModal')),a=f[0],z=f[f.length-1];
    if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}}
});

/* ---- Customers / Sellers / Riders: search + status filter (read-only lists, no "Add new") ---- */
const PEOPLE_COLS={customers:['Name','Email','Phone','City','Status'],sellers:['Restaurant','Owner','Phone','City','Status'],riders:['Name','Vehicle','Phone','City','Status']};
const PEOPLE_HINT={sellers:'Click a seller name to open their order history. Inactive sellers keep their past history; a name that is not clickable has no history yet.',riders:'Click a rider name to open their delivery history. Inactive riders keep their past history; a name that is not clickable has no history yet.'};
const peoplePage=(k,title,ph)=>p=>head(title,'<span id="pCount"></span>')+
  `<div class="toolbar">${pageSearch('pq',ph,p.get('q'))}<select id="ps"><option value="">All statuses</option>${(k==='customers'?CUST_STATUSES:[...new Set(PEOPLE[k].map(r=>r[4]))]).map(x=>`<option>${x}</option>`).join('')}</select></div>${PEOPLE_HINT[k]?`<p class="tbl-hint">${PEOPLE_HINT[k]}</p>`:''}<div id="pHost"></div>`;
function renderPeople(key){
  const tk=tokens($('#pq').value), st=$('#ps').value;
  const rows=PEOPLE[key].filter(r=>(!st||r[4]===st)&&hit(r.slice(0,5).join(' '),tk));
  $('#pCount').textContent=`${rows.length} of ${PEOPLE[key].length} records`;
  $('#pHost').innerHTML=rows.length?table(PEOPLE_COLS[key],rows.map(r=>r.slice(0,5)),null,key==='customers'?null:(c,j,r)=>j===0?nameCell(key,r):undefined):'<div class="card empty">No records match your search. Clear the filters to see everyone.</div>';
}
V.customers=peoplePage('customers','Customers','Search customers by name, email, phone or city…');
V.sellers=peoplePage('sellers','Sellers','Search sellers by restaurant, owner, phone or city…');
V.riders=peoplePage('riders','Riders','Search riders by name, vehicle, phone or city…');

/* ---- Seller history / Rider history (opened from the name in Sellers / Riders) ---- */
const HK={seller:{list:'sellers',plural:'Sellers',icon:'🏬',life:SELLER_LIFE},rider:{list:'riders',plural:'Riders',icon:'🚲',life:RIDER_LIFE}};
const personRow=(kind,name,id)=>PEOPLE[HK[kind].list].find(r=>kind==='rider'&&id?String(r[5])===String(id):r[0]===name);
const historyOf=(kind,name,id)=>BY[kind][kind==='rider'&&id?id:name]||[];
const hasHistory=(kind,row)=>historyOf(kind,row[0],kind==='rider'?row[5]:undefined).length>0;
/* clickable when currently Active, or when inactive but with past history; no history + not active = plain text */
const canOpenHistory=(kind,row)=>row[4]==='Active'||hasHistory(kind,row);
const nameCell=(key,r)=>{const kind=key==='sellers'?'seller':'rider';
  return canOpenHistory(kind,r)?`<a class="name-link" href="${link(kind+'-history',{n:r[0],...(kind==='rider'?{id:r[5]}:{})})}" title="View ${kind} history">${esc(r[0])}</a>`
    :`<span class="name-none" title="No history yet – this ${kind} has not started">${esc(r[0])}</span>`};
let HUI={q:'',s:'',n:25};
function historyPage(kind,p){
  const id=p.get('id')||'', hk=HK[kind], row=personRow(kind,p.get('n')||'',id), name=row?row[0]:(p.get('n')||''), seller=kind==='seller';
  const back=`<a class="back" href="#${hk.list}">← Back to ${hk.plural}</a>`;
  if(!row)return back+`<div class="card empty"><div style="font-size:44px">🔎</div><h3>${seller?'Seller':'Rider'} not found</h3><p style="margin-top:6px">There is no ${kind} called “${esc(name)}”.</p></div>`;
  const list=historyOf(kind,name,id), life=hk.life[name], inactive=row[4]!=='Active';
  if(!list.length&&inactive)return back+`<div class="card empty"><div style="font-size:44px">🗂️</div><h3>No history yet</h3><p style="margin-top:6px">${esc(name)} is ${esc(row[4].toLowerCase())} and has no ${seller?'orders':'deliveries'} on record.</p></div>`;
  const del=list.filter(o=>o.s==='Delivered'), canc=list.filter(o=>o.s==='Cancelled'), rev=revenue(list), rest=RESTAURANTS.find(r=>r.n===name);
  const earn=del.reduce((t,o)=>t+(o.pay||0),0), mins=avgOf(del.filter(o=>o.mins).map(o=>o.mins)), km=del.reduce((t,o)=>t+(o.km||0),0);
  const cards=seller?[
      kpi('s1','📦',list.length.toLocaleString('en-IN'),'Total orders',`${del.length.toLocaleString('en-IN')} delivered · ${canc.length} cancelled`),
      kpi('s2','💰',inr(rev),'Revenue','from delivered orders'),
      kpi('s3','🧾',del.length?inr(rev/del.length):'—','Avg order value'),
      kpi('s4','⭐',rest&&rest.r?rest.r+' / 5':'—','Restaurant rating',rest?esc(rest.cu+' · '+rest.city):'')
    ]:[
      kpi('s1','📦',del.length.toLocaleString('en-IN'),'Deliveries',list.length>del.length?`${list.length-del.length} in progress`:'completed'),
      kpi('s2','💰',inr(earn),'Total earnings',del.length?`avg ${inr(earn/del.length)} per delivery`:''),
      kpi('s3','⏱️',mins?Math.round(mins)+' min':'—','Avg delivery time'),
      kpi('s4','🛣️',Math.round(km).toLocaleString('en-IN')+' km','Distance covered')
    ];
  const ev=[];
  if(life)ev.push([dayOffset(life.from),'Joined Foodie',(seller?'Seller':'Rider')+' registration approved']);
  if(list.length){const f=list[list.length-1],l=list[0];
    ev.push([f.ts,seller?'First order':'First delivery',`${f.id} · ${f.item}`]);
    if(l!==f)ev.push([l.ts,seller?'Latest order':'Latest delivery',`${l.id} · ${l.item}`])}
  if(life&&life.end!=null)ev.push([dayOffset(life.end),'Marked inactive',`No new ${seller?'orders':'deliveries'} after this date`]);
  ev.sort((a,b)=>b[0]-a[0]);
  const months=[...groupBy(list,o=>o.ts.getFullYear()*12+o.ts.getMonth())].sort((a,b)=>b[0]-a[0]);
  const monthRows=months.map(([k,g])=>{const lab=MON[k%12]+' '+Math.floor(k/12), gd=g.filter(o=>o.s==='Delivered');
    return seller?`<tr><td>${lab}</td><td>${g.length}</td><td>${inr(revenue(g))}</td></tr>`
      :`<tr><td>${lab}</td><td>${gd.length}</td><td>${gd.filter(o=>o.mins).length?Math.round(avgOf(gd.filter(o=>o.mins).map(o=>o.mins)))+' min':'—'}</td><td>${inr(gd.reduce((t,o)=>t+(o.pay||0),0))}</td></tr>`}).join('');
  const sub=seller?`Owner: ${esc(row[1])} · ${esc(row[3])} · ${esc(row[2])}`:`${esc(row[1])} · ${esc(row[3])} · ${esc(row[2])}`;
  const statuses=[...new Set(list.map(o=>o.s))];
  return back+head(`${hk.icon} ${esc(name)}`,`${seller?'Seller':'Rider'} history · ${sub}`,`<span>${badge(row[4])}</span>`)+
   (inactive?`<div class="note warn"><b>Currently ${esc(row[4].toLowerCase())}.</b> ${life&&life.end!=null?`No new ${seller?'orders':'deliveries'} since ${dLong(dayOffset(life.end))}. `:''}Their past activity is shown below.</div>`:'')+
   `<section class="stats">${cards.join('')}</section>
   <section class="row-eq">
     <div class="card"><div class="card-h"><h3>🕒 Activity timeline</h3></div><ul class="tl">${ev.map(([d,t,s])=>`<li><b>${esc(t)}</b><small>${dLong(d)}${s?' · '+esc(s):''}</small></li>`).join('')}</ul></div>
     <div class="card"><div class="card-h"><h3>📅 Monthly summary</h3></div>${months.length?`<div class="tbl-wrap"><table class="mini-tbl"><thead><tr>${(seller?['Month','Orders','Revenue']:['Month','Deliveries','Avg time','Earnings']).map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${monthRows}</tbody></table></div>`:'<p class="sub-note">No activity yet.</p>'}</div>
   </section>
   <div class="card"><div class="card-h"><h3>🧾 ${seller?'Order':'Delivery'} history</h3></div>
     ${list.length?`<div class="toolbar">${pageSearch('hq',seller?'Search by order ID, dish, customer or date…':'Search by order ID, restaurant, customer or date…','')}<select id="hs"><option value="">All statuses</option>${statuses.map(s=>`<option>${s}</option>`).join('')}</select></div><div id="hHost"></div>`:'<p class="sub-note">No orders yet.</p>'}</div>`;
}
function historyTable(kind,name,id){
  const seller=kind==='seller', tk=tokens(HUI.q);
  const rows=historyOf(kind,name,id).filter(o=>(!HUI.s||o.s===HUI.s)&&hit([o.id,o.item,o.cust,o.seller,o.rider||'',o.s,dShort(o.ts)].join(' '),tk)), shown=rows.slice(0,HUI.n);
  if(!rows.length)return '<div class="empty">No records match your search. Clear the filters to see everything.</div>';
  const cols=seller?['Order','Date & time','Dish','Customer','Rider','Amount','Status']:['Order','Date & time','Restaurant','Customer','Distance','Time taken','Earning','Status'];
  const cells=o=>seller?[o.id,stamp(o),o.e+' '+o.item+(o.qty>1?' × '+o.qty:''),o.cust,o.rider||'—',inr(o.amt),o.s]
    :[o.id,stamp(o),o.seller,o.cust,o.km!=null?o.km.toFixed(1)+' km':'—',o.mins?o.mins+' min':'—',o.pay?inr(o.pay):'—',o.s];
  return `<div class="tbl-wrap"><table><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${shown.map(o=>`<tr data-k="${esc(o.id)}">${cells(o).map((c,j,a)=>`<td>${j===a.length-1?badge(c):esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="hist-foot"><span>Showing ${shown.length.toLocaleString('en-IN')} of ${rows.length.toLocaleString('en-IN')}</span>${rows.length>shown.length?'<button class="btn ghost small" id="hMore">Show more</button>':''}</div>`;
}
function bindHistory(kind,name,id){
  const host=$('#hHost'); if(!host)return;
  const paint=()=>{host.innerHTML=historyTable(kind,name,id)};
  $('#hq').oninput=e=>{HUI.q=e.target.value;HUI.n=25;paint()};
  $('#hs').onchange=e=>{HUI.s=e.target.value;HUI.n=25;paint()};
  host.onclick=e=>{if(e.target.closest('#hMore')){HUI.n+=25;paint()}};
  paint();
}
V['seller-history']=p=>{HUI={q:'',s:'',n:25};return historyPage('seller',p)};
V['rider-history']=p=>{HUI={q:'',s:'',n:25};return historyPage('rider',p)};
const DATA={'seller-reg':[REG,'sellers'],'rider-reg':[REG,'riders']};
V['seller-reg']=()=>regPage('seller-reg');
V['rider-reg']=()=>regPage('rider-reg');

let OFFER_Q='', REVIEW_Q='';
const OFFER_COLS=['Code','Description','Max','Expiry','Status'];
function offersHTML(){
  const rows=OFFERS.filter(r=>hit(r.join(' '),tokens(OFFER_Q)));
  return rows.length?table(OFFER_COLS,rows):'<div class="card empty">No offers match your search. Clear it to see all offers.</div>';
}
V.offers=()=>head('Offers & Discounts','Create promo codes for your customers.')+
`<form class="card form" id="offerForm" style="margin-bottom:18px"><label>Code<input name=c required maxlength=20 placeholder="DIWALI30"></label><label>Description<input name=d required placeholder="30% off on all orders"></label><label>Max discount (₹)<input name=m type=number min=1 required></label><label>Expiry<input name=e type=date min="${new Date().toISOString().slice(0,10)}" required></label><div class="full"><button class="btn">Create offer</button></div></form>
<div class="toolbar">${pageSearch('oq','Search offers by code, description or status…',OFFER_Q)}</div><div id="offerTbl">${offersHTML()}</div>`;

function reviewsHTML(){
  const list=REVIEWS.filter(r=>hit(r.join(' '),tokens(REVIEW_Q)));
  return list.length?`<div class="card">${list.map(r=>`<div class="rev" data-k="${esc(r[0])}"><div class="avatar" style="width:40px;height:40px;font-size:18px">${esc(r[0][0])}</div><div><b>${esc(r[0])}</b> <span style="color:var(--mute)">on ${esc(r[1])}${r[4]?' · '+esc(r[4]):''}</span><div class="stars">${'★'.repeat(r[2])}${'☆'.repeat(5-r[2])}</div><p>${esc(r[3])}</p></div></div>`).join('')}</div>`
    :'<div class="card empty">No reviews match your search. Clear it to see all reviews.</div>';
}
V.reviews=p=>{REVIEW_Q=p.get('q')||'';return head('Reviews & Ratings',`Average rating ${avgRating()??'—'} / 5 · ${REVIEWS.length} reviews`)+
`<div class="toolbar">${pageSearch('vq','Search reviews by customer, dish or comment…',REVIEW_Q)}</div><div id="revHost">${reviewsHTML()}</div>`};

/* ---- Notifications page ---- */
const NF={f:'All',t:'',q:''};
function nListHTML(){
  const all=visibleNotifs(), tk=tokens(NF.q);
  const list=all.filter(n=>(NF.f==='All'||!isRead(n))&&(!NF.t||n.type===NF.t)&&hit(n.title+' '+n.text+' '+N_TYPES[n.type][1],tk));
  if(list.length)return `<div class="card nlist">${list.map(n=>notifItem(n,true)).join('')}</div>`;
  if(!all.length)return `<div class="card empty"><div style="font-size:44px">🎉</div><h3>You're all caught up</h3><p style="margin:6px 0 14px">No notifications right now.</p><button class="btn" id="nRestore">Restore sample notifications</button></div>`;
  return `<div class="card empty">${tk.length?'No notifications match your search.':NF.f==='Unread'?'No unread notifications.':'No notifications of this type.'}</div>`;
}
function notifPageHTML(){
  const all=visibleNotifs(), u=unreadCount();
  return head('Notifications',`${u} unread · ${all.length} total`,`<div style="display:flex;gap:14px;align-items:center"><button class="linkbtn" id="nMarkAll" ${u?'':'disabled'}>Mark all read</button><button class="linkbtn" id="nClear" ${all.length?'':'disabled'}>Clear all</button></div>`)+
  `<div class="toolbar">${pageSearch('nq','Search notifications…',NF.q)}<div class="reg-tabs" style="margin:0" id="nTabs">${['All','Unread'].map(f=>`<button class="${NF.f===f?'on':''}" data-nf="${f}">${f}<b>${f==='All'?all.length:u}</b></button>`).join('')}</div>
   <select id="nType"><option value="">All types</option>${Object.entries(N_TYPES).map(([k,v])=>`<option value="${k}" ${NF.t===k?'selected':''}>${v[0]} ${v[1]}</option>`).join('')}</select></div><div id="nListHost">${nListHTML()}</div>`;
}
V.notifications=()=>`<div id="nPage">${notifPageHTML()}</div>`;
const refreshNPage=()=>{const h=$('#nPage');if(h)h.innerHTML=notifPageHTML();updateBadges()};

/* ---- Settings: Profile / Theme / Account / Notifications ---- */
const TABS=[['profile','👤 Profile'],['theme','🎨 Theme'],['account','🔐 Account'],['notifications','🔔 Notifications']];
let draftAvatar=null;
const toggleRow=(attr,key,label,desc,on)=>`<div class="toggle"><span>${label}<small>${desc}</small></span><button class="sw ${on?'on':''}" ${attr}="${key}" role="switch" aria-checked="${!!on}" aria-label="${label}"></button></div>`;

function settingsBody(tab){
  const P=S.profile;
  if(tab==='theme')return `<div class="card set-sec"><h3>Appearance</h3><p class="sub">Choose how the admin panel looks. Changes apply instantly and are remembered on this device.</p>
    <div class="mode-grid" role="group" aria-label="Colour mode">${[['light','Light','l'],['dark','Dark','d']].map(([m,l,c])=>`<button class="mode ${S.theme.mode===m?'on':''}" data-mode="${m}" aria-pressed="${S.theme.mode===m}"><div class="pv ${c}"><i></i><i></i></div>${l}</button>`).join('')}</div>
    <h3>Accent colour</h3><p class="sub">Used for buttons, highlights and the active menu item.</p>
    <div class="swatches" role="group" aria-label="Accent colour">${Object.entries(ACCENTS).map(([k,[hex,l]])=>`<button class="swatch ${S.theme.accent===k?'on':''}" data-accent="${k}" aria-pressed="${S.theme.accent===k}" aria-label="${l}"><span style="background:${hex}">${S.theme.accent===k?'✓':''}</span>${l}</button>`).join('')}</div>
    <div style="margin-top:18px"><button class="btn ghost" id="themeReset">Reset to default</button></div></div>`;
  if(tab==='account')return `
    <div class="card set-sec"><h3>Account details</h3><p class="sub">Your sign-in information.</p>
      <dl class="kv"><dt>Login email</dt><dd>${esc(P.email)}</dd><dt>Role</dt><dd>Super Admin</dd><dt>Member since</dt><dd>January 2025</dd></dl></div>
    <form class="card form set-sec" id="pwForm" novalidate><div class="full"><h3>Change password</h3><p class="sub" style="margin:0">Use at least 8 characters with a letter and a number.</p></div>
      <label class="full">Current password<input type="password" name="cur" autocomplete="current-password"><small class="err" data-for="cur"></small></label>
      <label>New password<input type="password" name="new" id="newPw" autocomplete="new-password"><div class="meter"><i id="pwMeter"></i></div><small class="err" data-for="new"></small></label>
      <label>Confirm new password<input type="password" name="con" autocomplete="new-password"><small class="err" data-for="con"></small></label>
      <label class="full" style="flex-direction:row;align-items:center;gap:8px;font-weight:400"><input type="checkbox" id="showPw" style="width:auto"> Show passwords</label>
      <div class="full row-actions"><button class="btn">Update password</button></div></form>
    <div class="card set-sec"><h3>Security</h3><p class="sub">Extra protection for your account.</p>
      ${toggleRow('data-sec','twofa','Two-factor authentication','Ask for a verification code when signing in',S.account.twofa)}
      ${toggleRow('data-sec','loginAlerts','Login alerts','Email me when a new device signs in',S.account.loginAlerts)}</div>
    <div class="card set-sec"><div class="card-h"><div><h3>Active sessions</h3><p class="sub" style="margin:0">Devices currently signed in to this account.</p></div><button class="linkbtn" id="signoutAll" ${S.account.sessions.length>1?'':'disabled'}>Sign out other devices</button></div>
      ${S.account.sessions.map(s=>`<div class="sess"><span class="nic" aria-hidden="true">${s.cur?'💻':'📱'}</span><div><b>${esc(s.device)}</b> ${s.cur?'<span class="tag">This device</span>':''}<small>${esc(s.loc)} · ${esc(s.when)}</small></div>${s.cur?'':`<button class="linkbtn" data-signout="${s.id}">Sign out</button>`}</div>`).join('')}</div>
    <div class="set-sec"><a class="btn ghost" href="#logout" style="display:inline-block">🚪 Log out</a></div>`;
  if(tab==='notifications')return `<div class="card set-sec"><h3>Notification preferences</h3><p class="sub">Control which alerts you see.</p>
    ${toggleRow('data-pref','email','Email notifications','Send a daily summary to '+esc(P.email),S.prefs.email)}
    ${toggleRow('data-pref','orderAlerts','New order alerts','Show order updates in the bell and Notifications page',S.prefs.orderAlerts)}
    ${toggleRow('data-pref','autoApprove','Auto-approve sellers','Skip manual review for new seller registrations',S.prefs.autoApprove)}
    ${toggleRow('data-pref','maintenance','Maintenance mode','Show a maintenance banner across the admin panel',S.prefs.maintenance)}</div>`;
  // profile
  const av=draftAvatar??P.avatar;
  return `<form class="card form set-sec" id="profileForm" novalidate>
    <div class="full"><h3>Profile</h3><p class="sub" style="margin:0">This information appears in the top bar and across the admin panel.</p></div>
    <div class="full avatar-row"><div class="avatar big" id="pvAvatar">${avatarHTML(av)}</div><div>
      <div class="av-pick" role="group" aria-label="Choose an avatar">${EMOJIS.map(e=>`<button type="button" class="${av===e?'on':''}" data-av="${e}" aria-label="Avatar ${e}">${e}</button>`).join('')}</div>
      <label class="btn ghost small">Upload photo<input type="file" id="avFile" accept="image/*" hidden></label> <button type="button" class="btn ghost small" id="avRemove">Remove photo</button></div></div>
    <label>Full name<input name="name" maxlength="40" value="${esc(P.name)}" autocomplete="name"><small class="err" data-for="name"></small></label>
    <label>Email<input name="email" type="email" value="${esc(P.email)}" autocomplete="email"><small class="err" data-for="email"></small></label>
    <label>Phone<input name="phone" type="tel" value="${esc(P.phone)}" autocomplete="tel"><small class="err" data-for="phone"></small></label>
    <label>City<input name="city" maxlength="40" value="${esc(P.city)}"></label>
    <label>Role<input value="Super Admin" readonly></label><span></span>
    <label class="full">Bio<textarea name="bio" maxlength="160" placeholder="A line about you (optional)">${esc(P.bio)}</textarea></label>
    <div class="full row-actions"><button class="btn">Save changes</button><button type="button" class="btn ghost" id="pReset">Discard changes</button></div></form>`;
}
V.settings=p=>{const tab=TABS.some(t=>t[0]===p.get('tab'))?p.get('tab'):'profile';
  return head('Settings','Manage your profile, appearance, account and alerts.')+
  `<nav class="set-tabs" aria-label="Settings sections">${TABS.map(([k,l])=>`<a href="#settings?tab=${k}" class="${k===tab?'on':''}" ${k===tab?'aria-current="page"':''}>${l}</a>`).join('')}</nav><div id="setBody" data-tab="${tab}">${settingsBody(tab)}</div>`};
const repaintSettings=()=>{const b=$('#setBody');if(b){const y=scrollY;b.innerHTML=settingsBody(b.dataset.tab);scrollTo(0,y)}};


/* ---- Search results page + dropdown ---- */
const EXTRA_PAGES=[['Profile settings','settings?tab=profile','👤','name email phone avatar photo'],['Theme settings','settings?tab=theme','🎨','dark light mode accent colour color appearance'],['Account settings','settings?tab=account','🔐','password security two-factor 2fa sessions'],['Notification settings','settings?tab=notifications','🔔','alerts email preferences maintenance']];
function searchGroups(q){
  const tk=tokens(q); if(!tk.length)return [];
  const G=[];
  const add=(name,items)=>{const r=items.filter(i=>hit(i.hay,tk));if(r.length)G.push({name,items:r})};
  add('Pages',[...NAV.filter(n=>n.id&&n.id!=='logout').map(n=>({ic:n.ic,title:n.label,sub:'Go to page',hay:n.label,href:'#'+n.id})),...EXTRA_PAGES.map(([t,h,ic,kw])=>({ic,title:t,sub:'Settings',hay:t+' '+kw,href:'#'+h}))]);
  add('Orders',ORDERS.map(o=>({ic:o.e,title:o.id+' · '+o.item,sub:`${o.cust} · ₹${o.amt} · ${o.s}`,hay:[o.id,o.item,o.cust,o.s,'₹'+o.amt,o.t].join(' '),href:link('orders',{q:o.id})})));
  add('Customers',PEOPLE.customers.map(r=>({ic:'👤',title:r[0],sub:`${r[1]} · ${r[3]} · ${r[4]}`,hay:r.slice(0,5).join(' '),href:link('customers',{q:r[0],hl:r[0]})})));
  add('Sellers',PEOPLE.sellers.map(r=>({ic:'🏬',title:r[0],sub:`${r[1]} · ${r[3]} · ${r[4]}`,hay:r.slice(0,5).join(' '),href:link('sellers',{q:r[0],hl:r[0]})})));
  add('Riders',PEOPLE.riders.map(r=>({ic:'🚲',title:r[0],sub:`${r[1]} · ${r[3]} · ${r[4]}`,hay:r.slice(0,5).join(' '),href:link('riders',{q:r[0],hl:r[0]})})));
  add('Restaurants',RESTAURANTS.map(r=>({ic:r.e,title:r.n,sub:`${r.cu} · ${r.city} · ★ ${r.r}`,hay:[r.n,r.cu,r.city,r.s].join(' '),href:link('restaurants',{q:r.n})})));
  add('Reviews',REVIEWS.map(r=>({ic:'⭐',title:r[0]+' on '+r[1],sub:r[3],hay:r.join(' '),href:link('reviews',{hl:r[0]})})));
  return G;
}
V.search=p=>{
  const q=(p.get('q')||'').trim(), G=searchGroups(q), tk=tokens(q), total=G.reduce((a,g)=>a+g.items.length,0);
  if(!q)return head('Search','Type in the search bar above to find orders, customers, sellers, riders, restaurants and pages.');
  return head('Search results',`${total} result${total===1?'':'s'} for “${esc(q)}”`)+
   (G.length?G.map(g=>`<div class="card" style="margin-bottom:16px"><div class="card-h"><h3>${g.name}</h3><span class="sr-count">${g.items.length}</span></div>${g.items.map(i=>`<a class="sr-row" href="${i.href}"><span class="sr-ic">${i.ic}</span><span class="sr-tx"><b>${mark(i.title,tk)}</b><small>${mark(i.sub,tk)}</small></span></a>`).join('')}</div>`).join(''):`<div class="card empty"><div style="font-size:44px">🔎</div><h3>No results for “${esc(q)}”</h3><p style="margin-top:6px">Check the spelling or try a shorter word, a phone number or an order ID.</p></div>`);
};
let srActive=-1;
function renderSearch(){
  const inp=$('#globalSearch'), q=inp.value.trim(), panel=$('#srPanel');
  if(!q){closeSearch();return}
  const G=searchGroups(q), tk=tokens(q), total=G.reduce((a,g)=>a+g.items.length,0);
  srActive=-1;
  panel.innerHTML=G.length?G.map(g=>`<div class="sr-group">${g.name}</div>${g.items.slice(0,3).map(i=>`<a class="sr-item" role="option" href="${i.href}"><span class="sr-ic">${i.ic}</span><span class="sr-tx"><b>${mark(i.title,tk)}</b><small>${mark(i.sub,tk)}</small></span></a>`).join('')}`).join('')+`<a class="sr-foot" href="${link('search',{q})}">See all ${total} result${total===1?'':'s'}</a>`
    :`<div class="sr-none">No results for “${esc(q)}”</div>`;
  panel.hidden=false;inp.setAttribute('aria-expanded','true');
}
function closeSearch(){const p=$('#srPanel');p.hidden=true;srActive=-1;$('#globalSearch').setAttribute('aria-expanded','false')}
function moveSearch(d){const items=$$('.sr-item',$('#srPanel'));if(!items.length)return;items.forEach(i=>i.classList.remove('act'));srActive=(srActive+d+items.length)%items.length;items[srActive].classList.add('act');items[srActive].scrollIntoView({block:'nearest'})}

/* ============ CHART ============ */
function niceMax(v){const p=10**Math.floor(Math.log10(Math.max(v,1)));for(const k of [1,1.5,2,2.5,3,4,5,6,8,10])if(k*p>=v)return k*p;return 10*p}
function drawChart(series){
  const host=$('#chart'); if(!host)return;
  const {labels,data}=series, W=760,H=270,P={l:48,r:20,t:20,b:34};
  const max=niceMax(Math.max(...data)), iw=W-P.l-P.r, ih=H-P.t-P.b, step=Math.ceil(labels.length/8);
  const X=i=>data.length>1?P.l+iw*i/(data.length-1):P.l+iw/2, Y=v=>P.t+ih-(v/max)*ih;
  const pts=data.map((v,i)=>[X(i),Y(v)]);
  let d=`M${pts[0][0]},${pts[0][1]}`;
  for(let i=1;i<pts.length;i++){const[a,b]=[pts[i-1],pts[i]],cx=(a[0]+b[0])/2;d+=` C${cx},${a[1]} ${cx},${b[1]} ${b[0]},${b[1]}`}
  const peak=data.indexOf(Math.max(...data));
  const grid=[0,.25,.5,.75,1].map(f=>{const y=P.t+ih*(1-f);return `<line x1="${P.l}" x2="${W-P.r}" y1="${y}" y2="${y}" style="stroke:var(--line)"/><text x="${P.l-10}" y="${y+4}" text-anchor="end" font-size="12" style="fill:var(--mute)">${fmt(Math.round(max*f))}</text>`}).join('');
  host.innerHTML=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Revenue chart">
   <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--orange);stop-opacity:.25"/><stop offset="1" style="stop-color:var(--orange);stop-opacity:0"/></linearGradient></defs>
   ${grid}<path d="${d} L${X(data.length-1)},${P.t+ih} L${X(0)},${P.t+ih}Z" fill="url(#g)"/>
   <path id="line" d="${d}" fill="none" style="stroke:var(--orange)" stroke-width="2.5"/>
   ${labels.map((l,i)=>i%step?'':`<text x="${X(i)}" y="${H-8}" text-anchor="middle" font-size="12" style="fill:var(--mute)">${l}</text>`).join('')}
   <line id="vl" x1="${X(peak)}" x2="${X(peak)}" y1="${Y(data[peak])}" y2="${P.t+ih}" style="stroke:var(--orange)" stroke-dasharray="4"/>
   ${pts.map((p,i)=>`<circle class="dot" data-i="${i}" cx="${p[0]}" cy="${p[1]}" r="${i===peak?6:data.length>14?3:4.5}" style="fill:var(--orange);stroke:var(--card);cursor:pointer" stroke-width="2"/>`).join('')}</svg><div class="tip" id="tip"></div>`;
  const tip=$('#tip',host);
  const show=i=>{tip.textContent=labels[i]+' · '+inr(data[i]);tip.style.left=Math.min(88,Math.max(12,pts[i][0]/W*100))+'%';tip.style.top=(pts[i][1]/H*100)+'%';
    const v=$('#vl',host);v.setAttribute('x1',pts[i][0]);v.setAttribute('x2',pts[i][0]);v.setAttribute('y1',pts[i][1])};
  $$('.dot',host).forEach(c=>{c.onmouseenter=c.onclick=()=>show(+c.dataset.i)});
  show(peak);
  const L=$('#line',host).getTotalLength?.();
  if(L&&!matchMedia('(prefers-reduced-motion:reduce)').matches){const p=$('#line',host);p.style.strokeDasharray=L;p.style.strokeDashoffset=L;p.getBoundingClientRect();p.style.transition='stroke-dashoffset 1s ease';p.style.strokeDashoffset=0}
}

/* ============ LIST RENDERERS ============ */
function renderRestaurants(){
  const tk=tokens($('#rq').value), st=$('#rs').value;
  const list=RESTAURANTS.filter(r=>(!st||r.s===st)&&hit(r.n+' '+r.cu+' '+r.city,tk));
  $('#restGrid').innerHTML=list.length?list.map(r=>`<div class="menu-item" data-k="${esc(r.n)}"><div class="big">${r.e}</div><h4>${esc(r.n)}</h4><p>${esc(r.cu)} · ${esc(r.city)}</p><p><span class="stars">★</span> <b>${r.r||'New'}</b> · ${(BY.seller[r.n]||[]).length?(BY.seller[r.n].length.toLocaleString('en-IN')+' orders'):'No orders yet'}</p><div style="margin-top:10px">${badge(r.s)}</div></div>`).join(''):'<div class="card empty" style="grid-column:1/-1">No restaurants match your search.</div>';
}
function renderOrders(){
  const tk=tokens($('#q').value), s=$('#st').value;
  const rows=ORDERS.filter(o=>(!s||o.s===s)&&hit([o.id,o.item,o.cust].join(' '),tk));
  $('#tblHost').innerHTML=rows.length?table(['Order','Dish','Customer','Amount','Status','Time'],rows.map(o=>[o.id,o.e+' '+o.item,o.cust,'₹'+o.amt,o.s,stamp(o)])):'<div class="card empty">No orders match your filters. Clear the search to see all orders.</div>';
}

/* ============ ROUTER ============ */
function buildNav(){
  $('#nav').innerHTML=NAV.map(n=>n.title?`<div class="nav-title">${n.title}</div>`:n.sep?'<div class="nav-sep"></div>':`<a href="#${n.id}" data-id="${n.id}"><span class="ic">${n.ic}</span>${n.label}${n.id==='notifications'?'<span class="nbadge" id="navNotif" hidden></span>':''}${n.id==='seller-reg'||n.id==='rider-reg'?`<span class="nbadge" id="nav-${n.id}" hidden></span>`:''}</a>`).join('');
}
const GLOBAL_SEARCH_PAGES=['dashboard','search'];   // the common search bar lives only here; every other page has its own single bar
const TITLES={search:'Search',settings:'Settings',notifications:'Notifications','seller-history':'Seller history','rider-history':'Rider history'};
const NAV_OF={'seller-history':'sellers','rider-history':'riders'};   // which sidebar item stays highlighted
function route(keep){
  if(!isAuthed())return showLogin();
  const {id,p}=parseHash(); if(id==='logout')return logout();
  const key=V[id]?id:'dashboard';
  const y=scrollY;
  if(!keep&&REG_FILTER[key]&&['All','Pending','Approved','Rejected'].includes(p.get('f')))REG_FILTER[key]=p.get('f');
  if(!keep){if(REG_Q[key]!==undefined)REG_Q[key]=p.get('q')||'';if(key==='notifications')NF.q=p.get('q')||''}
  const showGlobal=GLOBAL_SEARCH_PAGES.includes(key);
  $('.search-wrap').hidden=!showGlobal;
  if(!showGlobal)gs.value='';
  $('#view').innerHTML=V[key](p);
  $$('#nav a').forEach(a=>a.classList.toggle('active',a.dataset.id===(NAV_OF[key]||key)));
  document.title='Foodie – '+(NAV.find(n=>n.id===key)?.label||TITLES[key]||'Admin');
  if(!keep){closeSide();closePanels();closeSearch();window.scrollTo(0,0)}else scrollTo(0,y);
  updateBadges();
  if(key==='search'){gs.value=p.get('q')||''}
  if(key==='dashboard'){
    drawChart(revSeries(...DASH_SERIES.Daily));
    $$('#seg button').forEach(b=>b.onclick=()=>{$$('#seg button').forEach(x=>x.classList.remove('on'));b.classList.add('on');drawChart(revSeries(...DASH_SERIES[b.textContent]))});
    $$('[data-count]').forEach(el=>{const end=+el.dataset.count,t0=performance.now();(function f(t){const p=Math.min((t-t0)/900,1);el.textContent=Math.round(end*p).toLocaleString('en-IN');if(p<1)requestAnimationFrame(f)})(t0)});
    requestAnimationFrame(()=>$$('.bar i').forEach(i=>i.style.width=i.dataset.w+'%'));
    $('#range').onchange=e=>toast('Showing '+e.target.value);
  }
  if(PEOPLE[key]){renderPeople(key);$('#pq').oninput=()=>renderPeople(key);$('#ps').onchange=()=>renderPeople(key)}
  if(REG_FILTER[key])$('#regQ').oninput=e=>{REG_Q[key]=e.target.value;$('#regBody').innerHTML=regBody(key)};
  if(key==='offers')$('#oq').oninput=e=>{OFFER_Q=e.target.value;$('#offerTbl').innerHTML=offersHTML()};
  if(key==='reviews')$('#vq').oninput=e=>{REVIEW_Q=e.target.value;$('#revHost').innerHTML=reviewsHTML()};
  if(key==='notifications')$('#nq').oninput=e=>{NF.q=e.target.value;$('#nListHost').innerHTML=nListHTML()};
  if(key==='orders'){renderOrders();$('#q').oninput=renderOrders;$('#st').onchange=renderOrders}
  if(key==='analytics'){paintAnalytics();$('#anRange').onchange=e=>{AN.range=e.target.value;paintAnalytics()};$('#exportBtn').onclick=exportCSV}
  if(key==='seller-history'||key==='rider-history')bindHistory(key==='seller-history'?'seller':'rider',p.get('n')||'',p.get('id')||'');
  if(key==='restaurants'){$('#addRest').onclick=()=>toast('Restaurants join through the Seller panel registration');renderRestaurants();$('#rq').oninput=renderRestaurants;$('#rs').onchange=renderRestaurants}
  const of=$('#offerForm'); if(of)of.onsubmit=async e=>{e.preventDefault();const f=new FormData(of);
    try{await api('POST','/api/admin/offers',{code:f.get('c'),description:f.get('d'),max:f.get('m'),expiry:f.get('e')});
      toast('Offer '+f.get('c').trim().toUpperCase()+' created');OFFER_Q='';await refresh()}catch(er){toast(er.message)}};
  const hl=p.get('hl');
  if(hl&&!keep){const el=$$('[data-k]',$('#view')).find(e=>e.dataset.k===hl);if(el){el.classList.add('hl');el.scrollIntoView({block:'center',behavior:'smooth'});setTimeout(()=>el.classList.remove('hl'),2600)}}
}

/* ============ EVENTS ============ */
/* approve / reject + status filter (Registration pages) + notifications page */
$('#view').addEventListener('click',async e=>{
  const review=e.target.closest('[data-review-kind]');
  if(review){e.preventDefault();try{const result=await api('POST',`/api/admin/review-link/${review.dataset.reviewKind}/${review.dataset.reviewId}`);window.open(result.url,'_blank','noopener');}catch(err){toast(err.message)}return;}
  const key=parseHash().id, t=e.target;
  if(REG_FILTER[key]){
    const tab=t.closest('[data-filter]');
    if(tab){REG_FILTER[key]=tab.dataset.filter;route(true);return}
    const b=t.closest('[data-act]'); if(b&&!b.disabled){
      const [src,k]=DATA[key], row=src[k][+b.closest('tr').dataset.idx];
      if(b.dataset.act==='Rejected')return openReject(row,key);
      setReg(key,row,'Approved');
    }return;
  }
  if(key==='notifications'){
    let b;
    if(b=t.closest('[data-nopen]'))return openNotif(+b.dataset.nopen);
    if(b=t.closest('[data-ntoggle]')){const id=+b.dataset.ntoggle,n=NOTIFS.find(x=>x.id===id);markRead(id,!isRead(n));return refreshNPage()}
    if(b=t.closest('[data-ndel]')){NS.gone.push(+b.dataset.ndel);saveN();toast('Notification dismissed');return refreshNPage()}
    if(b=t.closest('[data-nf]')){NF.f=b.dataset.nf;return refreshNPage()}
    if(t.closest('#nMarkAll')){visibleNotifs().forEach(n=>!isRead(n)&&NS.read.push(n.id));saveN();toast('All notifications marked as read');return refreshNPage()}
    if(t.closest('#nClear')){visibleNotifs().forEach(n=>NS.gone.push(n.id));saveN();toast('Notifications cleared');return refreshNPage()}
    if(t.closest('#nRestore')){NS.gone=[];NS.read=[];saveN();return refreshNPage()}
    return;
  }
  if(key==='settings')settingsClick(e);
});
$('#view').addEventListener('change',e=>{
  if(e.target.id==='nType'){NF.t=e.target.value;refreshNPage()}
  if(e.target.id==='avFile')readAvatar(e.target.files[0]);
  if(e.target.id==='showPw')$$('#pwForm input[type=password],#pwForm input[data-pw]').forEach(i=>{i.type=e.target.checked?'text':'password';i.dataset.pw=1});
});
$('#view').addEventListener('input',e=>{
  if(e.target.id==='newPw'){const v=e.target.value,sc=[v.length>=8,/[a-z]/.test(v)&&/[A-Z]/.test(v),/\d/.test(v),/[^A-Za-z0-9]/.test(v)].filter(Boolean).length,m=$('#pwMeter');m.style.width=(v?sc*25:0)+'%';m.style.background=['#e53935','#e53935','#ffb400','#22a35a','#22a35a'][sc]}
  if(e.target.closest('.form'))setErr(e.target.closest('form'),e.target.name,'');
});
$('#view').addEventListener('submit',e=>{
  if(e.target.id==='profileForm'){e.preventDefault();saveProfile(e.target)}
  if(e.target.id==='pwForm'){e.preventDefault();savePassword(e.target)}
});
function setErr(f,name,msg){const el=$(`[data-for="${name}"]`,f),inp=f.elements[name];if(el)el.textContent=msg;if(inp)inp.setAttribute('aria-invalid',!!msg)}
function saveProfile(f){
  const v=n=>f.elements[n].value.trim(); let ok=true;
  const bad=(n,m)=>{setErr(f,n,m);if(ok)f.elements[n].focus();ok=false};
  ['name','email','phone'].forEach(n=>setErr(f,n,''));
  if(v('name').length<2)bad('name','Enter your name (at least 2 characters).');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('email')))bad('email','Enter a valid email address.');
  if(v('phone')&&!/^\+?\d[\d\s-]{8,14}\d$/.test(v('phone')))bad('phone','Enter a valid phone number (9–15 digits).');
  if(!ok)return;
  Object.assign(S.profile,{name:v('name'),email:v('email'),phone:v('phone'),city:v('city'),bio:v('bio'),avatar:draftAvatar??S.profile.avatar});
  draftAvatar=null;save('profile');applyProfile();toast('Profile saved');
}
async function savePassword(f){
  const g=n=>f.elements[n].value; let ok=true;
  const bad=(n,m)=>{setErr(f,n,m);if(ok)f.elements[n].focus();ok=false};
  ['cur','new','con'].forEach(n=>setErr(f,n,''));
  if(!g('cur'))bad('cur','Enter your current password.');
  if(g('new').length<8||!/[A-Za-z]/.test(g('new'))||!/\d/.test(g('new')))bad('new','Use at least 8 characters with a letter and a number.');
  else if(g('new')===g('cur'))bad('new','New password must be different from the current one.');
  if(g('con')!==g('new'))bad('con','Passwords do not match.');
  if(!ok)return;
  try{await api('POST','/api/admin/password',{current:g('cur'),new:g('new')});f.reset();$('#pwMeter').style.width='0';toast('Password updated – use it the next time you sign in')}
  catch(e){bad('cur',e.message)}
}
function readAvatar(file){
  if(!file)return;
  if(!file.type.startsWith('image/'))return toast('Please choose an image file');
  const img=new Image(),url=URL.createObjectURL(file);
  img.onload=()=>{const c=document.createElement('canvas');c.width=c.height=128;const s=Math.min(img.width,img.height);
    c.getContext('2d').drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,128,128);
    draftAvatar=c.toDataURL('image/jpeg',.85);URL.revokeObjectURL(url);repaintAvatarDraft()};
  img.onerror=()=>{URL.revokeObjectURL(url);toast('Could not read that image')};
  img.src=url;
}
function repaintAvatarDraft(){
  const a=draftAvatar??S.profile.avatar;$('#pvAvatar').innerHTML=avatarHTML(a);
  $$('[data-av]').forEach(b=>b.classList.toggle('on',b.dataset.av===a));
}
function settingsClick(e){
  const t=e.target; let b;
  if(b=t.closest('[data-mode]')){S.theme.mode=b.dataset.mode;save('theme');applyTheme();repaintSettings();return}
  if(b=t.closest('[data-accent]')){S.theme.accent=b.dataset.accent;save('theme');applyTheme();repaintSettings();toast(ACCENTS[b.dataset.accent][1]+' accent applied');return}
  if(t.closest('#themeReset')){S.theme={...DEF.theme};save('theme');applyTheme();repaintSettings();toast('Theme reset');return}
  if(b=t.closest('[data-av]')){draftAvatar=b.dataset.av;repaintAvatarDraft();return}
  if(t.closest('#avRemove')){draftAvatar=DEF.profile.avatar;repaintAvatarDraft();return}
  if(t.closest('#pReset')){draftAvatar=null;repaintSettings();toast('Changes discarded');return}
  if(b=t.closest('[data-pref]')){const k=b.dataset.pref;S.prefs[k]=!S.prefs[k];save('prefs');applyPrefs();updateBadges();repaintSettings();
    toast({email:'Email notifications',orderAlerts:'New order alerts',autoApprove:'Auto-approve sellers',maintenance:'Maintenance mode'}[k]+(S.prefs[k]?' turned on':' turned off'));return}
  if(b=t.closest('[data-sec]')){const k=b.dataset.sec;S.account[k]=!S.account[k];save('account');repaintSettings();toast((k==='twofa'?'Two-factor authentication':'Login alerts')+(S.account[k]?' turned on':' turned off'));return}
  if(b=t.closest('[data-signout]')){S.account.sessions=S.account.sessions.filter(s=>s.id!==+b.dataset.signout);save('account');repaintSettings();toast('Device signed out');return}
  if(t.closest('#signoutAll')){S.account.sessions=S.account.sessions.filter(s=>s.cur);save('account');repaintSettings();toast('Signed out of all other devices')}
}
function applyPrefs(){$('#banner').hidden=!S.prefs.maintenance}
function applyProfile(){
  const P=S.profile;
  $('#topAvatar').innerHTML=avatarHTML(P.avatar);$('#topName').textContent=P.name;
  $('#ddName').textContent=P.name;$('#ddEmail').textContent=P.email;
  $('#profileBtn').setAttribute('aria-label','Account menu for '+P.name);
}

/* sidebar + header behaviour */
const side=$('#sidebar'),scrim=$('#scrim');
function closeSide(){side.classList.remove('open');scrim.classList.remove('open')}
$('#menuBtn').onclick=()=>{side.classList.add('open');scrim.classList.add('open')};
scrim.onclick=closeSide;

function closeDrop(){$('#dropdown').classList.remove('open');$('#profileBtn').setAttribute('aria-expanded','false')}
function closePanel(){$('#notifPanel').hidden=true;$('#bell').setAttribute('aria-expanded','false')}
function closePanels(){closeDrop();closePanel()}
$('#profileBtn').onclick=()=>{const o=!$('#dropdown').classList.contains('open');closePanels();closeSearch();if(o){$('#dropdown').classList.add('open');$('#profileBtn').setAttribute('aria-expanded','true')}};
$('#dropdown').addEventListener('click',closeDrop);
$('#bell').onclick=()=>{const open=$('#notifPanel').hidden;closePanels();closeSearch();if(open){renderPanel();$('#notifPanel').hidden=false;$('#bell').setAttribute('aria-expanded','true')}};
$('#notifPanel').addEventListener('click',e=>{
  const b=e.target.closest('[data-nopen]');if(b)return openNotif(+b.dataset.nopen);
  if(e.target.closest('#markAll')){visibleNotifs().forEach(n=>!isRead(n)&&NS.read.push(n.id));saveN();updateBadges();if(parseHash().id==='notifications')refreshNPage();return}
  if(e.target.closest('#viewAllN'))closePanel();
});
document.addEventListener('click',e=>{
  if(!e.target.closest('#profile'))closeDrop();
  if(!e.target.closest('.bell-wrap'))closePanel();
  if(!e.target.closest('.search-wrap'))closeSearch();
});
$('#logout2').onclick=()=>{closeDrop()};

/* search box: live dropdown, arrow keys, Enter = full results page, Esc = close */
const gs=$('#globalSearch');
gs.addEventListener('input',renderSearch);
gs.addEventListener('focus',()=>{closePanels();if(gs.value.trim())renderSearch()});
gs.addEventListener('keydown',e=>{
  if(e.key==='ArrowDown'){e.preventDefault();if($('#srPanel').hidden)renderSearch();moveSearch(1)}
  else if(e.key==='ArrowUp'){e.preventDefault();moveSearch(-1)}
  else if(e.key==='Escape'){if(!$('#srPanel').hidden)closeSearch();else gs.blur()}
  else if(e.key==='Enter'){
    e.preventDefault();const q=gs.value.trim();if(!q)return;
    const act=$$('.sr-item',$('#srPanel'))[srActive];
    closeSearch();go(act?act.getAttribute('href'):link('search',{q}));
  }
});
$('#srPanel').addEventListener('click',()=>{closeSearch()});
document.addEventListener('keydown',e=>{
  if(!isAuthed())return;
  const typing=/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  if((e.key==='/'&&!typing&&!e.metaKey&&!e.ctrlKey)||((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k')){e.preventDefault();const box=gs.closest('.search-wrap').hidden?$('.page-search'):gs;if(box){box.focus();box.select()}}
  if(e.key==='Escape'){closePanels()}
});

/* ============ LOGIN ============ */
function showLogin(msg){
  document.body.classList.add('locked');$('#login').hidden=false;
  $('#loginHint').hidden=true;
  $('#loginMsg').textContent=msg||'';$('#loginMsg').className='login-msg'+(msg?' ok':'');
  $('#loginErr').textContent='';$('#lpw').value='';$('#lpw').type='password';$('#lpwShow').textContent='Show';
  $('#lemail').value=$('#lemail').value||S.profile.email;($('#lemail').value?$('#lpw'):$('#lemail')).focus();
}
function showApp(){
  document.body.classList.remove('locked');$('#login').hidden=true;
  applyPrefs();applyProfile();updateBadges();
}
function logout(){
  closePanels();closeSearch();closeSide();if(!$('#rejModal').hidden)closeReject();
  setToken('');stopPolling();history.replaceState(null,'',location.pathname+location.search+'#dashboard');showLogin("You've been signed out.");
}
$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const em=$('#lemail').value.trim().toLowerCase(),pw=$('#lpw').value,err=$('#loginErr');
  if(!em||!pw){err.textContent='Enter your email and password.';return}
  try{
    const r=await api('POST','/api/auth/login',{role:'admin',identifier:em,password:pw});
    setToken(r.token,$('#lremember').checked);
    loadData(await api('GET','/api/admin/bootstrap'));showApp();
    if(parseHash().id==='logout')history.replaceState(null,'',location.pathname+location.search+'#dashboard');
    route();startPolling();
  }catch(ex){err.textContent=/Incorrect login/.test(ex.message)?'Incorrect email or password.':ex.message;$('#lpw').value='';$('#lpw').focus()}
});
$('#lpwShow').onclick=()=>{const p=$('#lpw'),show=p.type==='password';p.type=show?'text':'password';$('#lpwShow').textContent=show?'Hide':'Show';p.focus()};
$('#loginForm').addEventListener('input',()=>{$('#loginErr').textContent=''});

/* ---- live refresh: new registrations, orders and ratings appear without reloading ---- */
let pollTimer=null;
async function poll(){
  const a=document.activeElement, busy=a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)&&a.id!=='';
  if(document.hidden||busy||!$('#rejModal').hidden||!isAuthed())return;
  try{await refresh()}catch(e){}
}
const startPolling=()=>{stopPolling();pollTimer=setInterval(poll,5000)};
document.addEventListener('click',async e=>{const b=e.target.closest('[data-copy]');if(!b)return;const t=b.dataset.copy;
  try{await navigator.clipboard.writeText(t)}catch(_){const i=document.createElement('input');i.value=t;document.body.append(i);i.select();document.execCommand('copy');i.remove()}
  toast('Link copied')});
const stopPolling=()=>{clearInterval(pollTimer);pollTimer=null};

buildNav();
addEventListener('hashchange',()=>{if(isAuthed())route()});
(async()=>{
  if(!isAuthed())return showLogin();
  try{loadData(await api('GET','/api/admin/bootstrap'));showApp();route();startPolling()}
  catch(e){setToken('');showLogin(e.message)}
})();
