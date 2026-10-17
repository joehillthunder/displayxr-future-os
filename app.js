// Future OS Lab: layout list, details, builder. The preview is the 3D stage (stage3d.js), which
// weaves through DisplayXR on a Leia display and falls back to a drag-to-look 3D view elsewhere.

import { DEVICES, PAL_KEYS, FONTS, INPUTS, ARCH, LIB, PRESETS } from './data.js';
import { createStage } from './stage3d.js';

const $ = s => document.querySelector(s);
const esc = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp = (v,a,b) => Math.min(b, Math.max(a, v));

const stage = createStage({
  canvas: $('#os3d'),
  cover: $('#cover'),
  host: $('#stage'),
  onMode: (mode) => {
    document.body.classList.toggle('woven', mode === 'woven');
    $('#mode').textContent = mode === 'woven'
      ? 'Glasses-free 3D · DisplayXR on this display. Click a device to go full screen, drag to rotate, click a module to open it.'
      : 'Click a device to go full screen · drag to rotate · click a module to open it. On a Leia display, open this in the DisplayXR Browser for glasses-free 3D.';
  },
  onPick: (hit) => handlePick(hit),
  onImmersive: (on) => {
    $('#hud').hidden = !on;
    $('#hudHint').hidden = !on;
    if (!on) { stage.resetView(); if (state.detail) { state.detail = null; renderStage(); } }
    renderHud();
  },
});

// Stage colours follow the page theme.
function themeColors(){
  const cs = getComputedStyle(document.documentElement);
  stage.setColors({ background: cs.getPropertyValue('--stage').trim() || '#d5d8df', caption: cs.getPropertyValue('--mute').trim() || '#566072' });
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeColors);
new MutationObserver(themeColors).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

const depthInput = $('#depth');
depthInput.value = stage.depth;
depthInput.addEventListener('input', () => stage.setDepth(Number(depthInput.value)));

/* ---------- data helpers ---------- */
const HEX=/^#[0-9a-f]{6}$/i;
function normalize(s){
  s=s||{}; const base=PRESETS[0], p=s.palette||{}, palette={}, modules={};
  PAL_KEYS.forEach(([k])=>palette[k]=HEX.test(p[k])?p[k].toLowerCase():base.palette[k]);
  for(const d of Object.keys(DEVICES)){
    let m=[...new Set((s.modules?.[d]||[]).filter(k=>LIB[d][k]))];
    for(const k of Object.keys(LIB[d])){ if(m.length>=3) break; if(!m.includes(k)) m.push(k); }
    modules[d]=m;
  }
  return {
    id:typeof s.id==='string'?s.id:null, custom:true,
    name:String(s.name||'Untitled layout').trim().slice(0,40)||'Untitled layout',
    tagline:String(s.tagline||'').slice(0,120),
    archetype:ARCH[s.archetype]?s.archetype:'tiling',
    font:FONTS[s.font]?s.font:'sans',
    radius:clamp(Math.round(+s.radius)||0,0,6),
    density:['calm','balanced','dense'].includes(s.density)?s.density:'balanced',
    motion:!!s.motion,
    inputs:(Array.isArray(s.inputs)?s.inputs:[]).filter(i=>INPUTS[i]),
    sources:(Array.isArray(s.sources)?s.sources:[]).slice(0,6).map(x=>({t:String(x?.t||'Note').slice(0,20),n:String(x?.n||'').slice(0,160)})),
    principles:(Array.isArray(s.principles)?s.principles:[]).map(String).map(x=>x.trim()).filter(Boolean).slice(0,6),
    palette, modules
  };
}
const KEY='future-os-lab.layouts';
function load(){ try{ const r=JSON.parse(localStorage.getItem(KEY)||'[]'); return Array.isArray(r)?r.map(x=>{const n=normalize(x); n.id=n.id||newId(); return n;}):[]; }catch(e){ return []; } }
function persist(){ try{ localStorage.setItem(KEY,JSON.stringify(custom)); }catch(e){ toast('Saved for this visit only. Your browser blocked storage.'); } }
const newId=()=>'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const clone=o=>JSON.parse(JSON.stringify(o));

let custom=load();
const state={sel:PRESETS[0].id, dev:'it', tab:'details', draft:null, focus:{}, detail:null};
function syncHash(){ try { history.replaceState(null, '', '#' + state.sel + (state.dev === 'it' ? '' : '.' + state.dev)); } catch {} }
const all=()=>[...PRESETS,...custom];
const cur=()=>all().find(s=>s.id===state.sel)||PRESETS[0];
// Deep links: #rocinante or #rocinante.auto opens that layout on that device.
{
  const [id, dev] = decodeURIComponent(location.hash.slice(1)).split('.');
  if (id && all().some(s => s.id === id)) state.sel = id;
  if (['it','auto','mobile','all'].includes(dev)) state.dev = dev;
}

/* ---------- UI ---------- */
function renderList(){
  const card=s=>`<button type="button" class="li ${s.id===state.sel?'on':''}" data-id="${esc(s.id)}"><span class="sw" aria-hidden="true">${['bg','surface','accent','accent2','muted'].map(k=>`<i style="background:${s.palette[k]}"></i>`).join('')}</span><span class="li-n">${esc(s.name)}</span><span class="li-a">${esc(ARCH[s.archetype].label)}</span></button>`;
  $('#list').innerHTML=`<h2 class="eyebrow">Presets · ${PRESETS.length}</h2>${PRESETS.map(card).join('')}
    <h2 class="eyebrow">Your layouts · ${custom.length}</h2>${custom.length?custom.map(card).join(''):'<p class="empty">Layouts you save from Build show up here.</p>'}
    <p class="fine">Sources name the communities and works whose recurring ideas shaped each layout. No posts are quoted.</p>`;
}
function renderDevs(){
  $('#devs').innerHTML=[['it','IT'],['auto','Auto'],['mobile','Mobile'],['all','All three']].map(([k,l])=>`<button type="button" role="tab" data-dev="${k}" aria-selected="${state.dev===k}">${l}</button>`).join('');
}
let lastKey='';
let pending=0;
function renderStage(){
  const building=state.tab==='build'&&state.draft, spec=building?state.draft:cur();
  // Fly the panels in when the layout, its engine or the device changes; not on every colour tweak.
  const key=(building?'draft':spec.id)+'|'+spec.archetype+'|'+state.dev;
  const intro=key!==lastKey; lastKey=key;
  syncHash();
  cancelAnimationFrame(pending);
  pending=requestAnimationFrame(()=>stage.show(spec,state.dev,{intro,focus:state.focus,detail:state.detail}));
  $('#stageMeta').textContent=(building?'Draft · ':'')+spec.name+' · '+ARCH[spec.archetype].label;
  renderHud();
}
function renderDetails(confirmDel){
  const s=cur();
  const mods=Object.keys(DEVICES).map(d=>`<div><dt>${d==='it'?'IT':d==='auto'?'Auto':'Mobile'}</dt><dd>${s.modules[d].map(k=>esc(LIB[d][k].l)).join(', ')}</dd></div>`).join('');
  $('#details').innerHTML=`
    <div class="d-head"><p class="eyebrow">${esc(ARCH[s.archetype].label)}${s.custom?' · your layout':''}</p><h2>${esc(s.name)}</h2>${s.tagline?`<p class="d-tag">${esc(s.tagline)}</p>`:''}</div>
    <section><h3>Drawn from</h3><ul class="src">${s.sources.length?s.sources.map(x=>`<li><span class="badge">${esc(x.t)}</span><span>${esc(x.n)}</span></li>`).join(''):'<li><span class="badge">Original</span><span>Your own design</span></li>'}</ul></section>
    ${s.principles.length?`<section><h3>Design rules</h3><ul class="rules">${s.principles.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>`:''}
    <section><h3>Input</h3><div class="chips">${s.inputs.length?s.inputs.map(i=>`<span class="chip">${INPUTS[i]}</span>`).join(''):'<span class="chip">Touch</span>'}</div></section>
    <section><h3>Modules by device</h3><dl class="permods">${mods}</dl></section>
    <section><h3>Palette</h3><div class="pal">${PAL_KEYS.map(([k,l])=>`<div><i style="background:${s.palette[k]}"></i>${l}<br>${s.palette[k]}</div>`).join('')}</div></section>
    ${confirmDel?`<div class="confirm"><p>Delete “${esc(s.name)}”? This removes it from this browser.</p><div class="actions" style="border:0;padding:0"><button type="button" class="btn pri" data-act="del-yes">Delete</button><button type="button" class="btn" data-act="del-no">Keep it</button></div></div>`
    :`<div class="actions"><button type="button" class="btn pri" data-act="remix">Remix in Build</button>${s.custom?'<button type="button" class="btn" data-act="edit">Edit</button><button type="button" class="btn danger" data-act="del">Delete</button>':''}</div>`}`;
}
function renderTabs(){
  document.querySelectorAll('#tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===state.tab));
  $('#details').hidden=state.tab!=='details';
  $('#build').hidden=state.tab!=='build';
}

/* builder */
function buildFormSkeleton(){
  $('#f-arch').innerHTML=Object.entries(ARCH).map(([k,a])=>`<option value="${k}">${a.label}</option>`).join('');
  $('#f-font').innerHTML=Object.entries(FONTS).map(([k,f])=>`<option value="${k}">${f[0]}</option>`).join('');
  $('#f-colors').innerHTML=PAL_KEYS.map(([k,l])=>`<label class="col"><input type="color" id="c-${k}"><span>${l}</span></label>`).join('');
  $('#f-density').innerHTML=['calm','balanced','dense'].map(v=>`<label><input type="radio" name="density" id="d-${v}" value="${v}">${v[0].toUpperCase()+v.slice(1)}</label>`).join('');
  $('#f-inputs').innerHTML=Object.entries(INPUTS).map(([k,l])=>`<label><input type="checkbox" id="i-${k}" value="${k}">${l}</label>`).join('');
  $('#f-mods').innerHTML=Object.keys(DEVICES).map(d=>`<div class="modgrp"><b>${DEVICES[d]}</b><div class="checks">${Object.entries(LIB[d]).map(([k,m])=>`<label><input type="checkbox" id="m-${d}-${k}" data-dev="${d}" value="${k}">${m.l}</label>`).join('')}</div><p class="order" id="ord-${d}"></p></div>`).join('');
}
function fillBase(){
  $('#f-base').innerHTML=`<option value="">Current draft</option>`+all().map(s=>`<option value="${esc(s.id)}">${esc(s.name)}${s.custom?' (yours)':''}</option>`).join('');
}
function fillForm(d){
  $('#f-name').value=d.name; $('#f-tag').value=d.tagline; $('#f-arch').value=d.archetype; $('#f-arch-hint').textContent=ARCH[d.archetype].hint;
  PAL_KEYS.forEach(([k])=>$('#c-'+k).value=d.palette[k]);
  $('#f-font').value=d.font; $('#f-rad').value=d.radius; $('#o-rad').textContent=d.radius;
  $('#d-'+d.density).checked=true; $('#f-motion').checked=d.motion;
  Object.keys(INPUTS).forEach(k=>$('#i-'+k).checked=d.inputs.includes(k));
  Object.keys(DEVICES).forEach(dev=>Object.keys(LIB[dev]).forEach(k=>$(`#m-${dev}-${k}`).checked=d.modules[dev].includes(k)));
  $('#f-rules').value=d.principles.join('\n');
  renderOrder();
}
function renderOrder(){
  Object.keys(DEVICES).forEach(dev=>{
    const m=state.draft.modules[dev];
    $('#ord-'+dev).textContent=(m.length<3?'Pick at least 3. ':'')+'Order: '+(m.map(k=>LIB[dev][k].l).join(' → ')||'none');
  });
}
function readForm(){
  const d=state.draft;
  d.name=$('#f-name').value.trim()||'Untitled layout';
  d.tagline=$('#f-tag').value.trim();
  d.archetype=$('#f-arch').value; $('#f-arch-hint').textContent=ARCH[d.archetype].hint;
  PAL_KEYS.forEach(([k])=>d.palette[k]=$('#c-'+k).value);
  d.font=$('#f-font').value; d.radius=+$('#f-rad').value; $('#o-rad').textContent=d.radius;
  d.density=(document.querySelector('input[name=density]:checked')||{}).value||'balanced';
  d.motion=$('#f-motion').checked;
  d.inputs=Object.keys(INPUTS).filter(k=>$('#i-'+k).checked);
  d.principles=$('#f-rules').value.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,6);
}
function startDraft(base, editing){
  const d=clone(base);
  if(editing){ d.custom=true; }
  else{
    d.id=null; d.custom=true;
    if(!base.custom){ d.name=(base.name+' Remix').slice(0,40); d.sources=[{t:'Remix',n:'Based on '+base.name},...base.sources]; }
    else{ d.name=(base.name+' copy').slice(0,40); }
  }
  state.draft=d; state.tab='build';
  fillBase(); $('#f-base').value=''; fillForm(d); $('#io-msg').textContent='';
  renderTabs(); renderStage();
}

const pick=a=>a[Math.floor(Math.random()*a.length)];
function hsl(h,s,l){ s/=100; l/=100; const f=n=>{const k=(n+h/30)%12, c=l-s*Math.min(l,1-l)*Math.max(-1,Math.min(k-3,9-k,1)); return Math.round(c*255).toString(16).padStart(2,'0');}; return '#'+f(0)+f(8)+f(4); }
function randomDraft(){
  const h=Math.floor(Math.random()*360), h2=(h+pick([30,150,180,200]))%360, dark=Math.random()<.75;
  const shuffle=a=>a.map(v=>[Math.random(),v]).sort((x,y)=>x[0]-y[0]).map(x=>x[1]);
  const modules={}; Object.keys(DEVICES).forEach(d=>modules[d]=shuffle(Object.keys(LIB[d])).slice(0,6));
  return normalize({
    name:pick(['Halo','Drift','Lattice','Vesper','Quorum','Ember','Tessera','Nimbus','Parallax','Kestrel','Meridian','Cinder'])+' '+pick(['Deck','Shell','Field','Glass','Loop','Array','Veil','Frame']),
    tagline:'A randomized starting point. Tune it, then save.',
    archetype:pick(Object.keys(ARCH)), font:pick(Object.keys(FONTS)), radius:Math.floor(Math.random()*7),
    density:pick(['calm','balanced','dense']), motion:Math.random()<.6,
    inputs:shuffle(Object.keys(INPUTS)).slice(0,2+Math.floor(Math.random()*2)),
    sources:[{t:'Generated',n:'Randomized in Future OS Lab'}], principles:[],
    palette:dark
      ? {bg:hsl(h,35,7),surface:hsl(h,30,14),fg:hsl(h,25,92),accent:hsl(h2,90,62),accent2:hsl((h2+60)%360,85,65),muted:hsl(h,15,58)}
      : {bg:hsl(h,25,94),surface:hsl(h,30,99),fg:hsl(h,30,12),accent:hsl(h2,75,44),accent2:hsl((h2+60)%360,70,45),muted:hsl(h,12,44)},
    modules
  });
}

let toastT;
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>t.hidden=true,2600); }
function renderAll(){ renderList(); renderDevs(); renderTabs(); renderDetails(); renderStage(); }

/* events */
$('#list').addEventListener('click',e=>{
  const b=e.target.closest('.li'); if(!b) return;
  state.sel=b.dataset.id;
  state.focus={}; state.detail=null;
  if(state.tab==='build') state.tab='details';
  renderAll();
});
function setDev(dev){ state.dev=dev; state.detail=null; renderDevs(); renderStage(); }
$('#devs').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; setDev(b.dataset.dev); });

/* interaction: full screen, picking modules, keyboard */
const curSpec=()=>(state.tab==='build'&&state.draft)?state.draft:cur();
// The modules a device actually shows, in the layout's own order (density caps the count).
function visibleKeys(dev){
  const spec=curSpec(), max={calm:4,balanced:6,dense:8}[spec.density]||6;
  return (spec.modules[dev]||[]).filter(k=>LIB[dev][k]).slice(0,max);
}
function openModule(dev,key){ state.focus[dev]=key; state.detail={dev,key}; renderStage(); }
function handlePick({dev,key}){
  if(!stage.immersive) stage.enterImmersive();
  // In the three-device view, a click picks the device and opens it on its own.
  if(state.dev==='all'&&dev){ setDev(dev); return; }
  if(!key||key==='__close'){ if(state.detail){ state.detail=null; renderStage(); } return; }
  if(state.detail&&state.detail.key===key){ state.detail=null; renderStage(); return; }
  openModule(dev,key);
}
function stepModule(dir){
  if(state.dev==='all') return;
  const keys=visibleKeys(state.dev); if(!keys.length) return;
  const at=keys.indexOf(state.detail?.key ?? state.focus[state.dev]);
  openModule(state.dev, keys[(at+dir+keys.length)%keys.length]);
}
function renderHud(){
  const spec=curSpec();
  $('#hudName').textContent=spec.name+' · '+ARCH[spec.archetype].label;
  $('#hudDevs').innerHTML=[['it','IT'],['auto','Auto'],['mobile','Mobile'],['all','All']].map(([k,l])=>`<button type="button" data-dev="${k}" aria-selected="${state.dev===k}">${l}</button>`).join('');
}
$('#fsBtn').addEventListener('click',()=>stage.enterImmersive());
$('#hud').addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return;
  if(b.dataset.dev) setDev(b.dataset.dev);
  if(b.dataset.hud==='reset') stage.resetView();
  if(b.dataset.hud==='exit') stage.exitImmersive();
});
$('#os3d').addEventListener('keydown',e=>{ if((e.key==='Enter'||e.key===' ')&&!stage.immersive){ e.preventDefault(); stage.enterImmersive(); } });
document.addEventListener('keydown',e=>{
  if(!stage.immersive||e.target.closest('input,textarea,select')) return;
  const k=e.key;
  if(k==='Escape'){ if(state.detail){ state.detail=null; renderStage(); } else stage.exitImmersive(); }
  else if(k==='ArrowRight'&&!e.shiftKey) stepModule(1);
  else if(k==='ArrowLeft'&&!e.shiftKey) stepModule(-1);
  else if(k.startsWith('Arrow')&&e.shiftKey) stage.nudge(k==='ArrowLeft'?-0.15:k==='ArrowRight'?0.15:0, k==='ArrowUp'?-0.1:k==='ArrowDown'?0.1:0);
  else if(k==='r'||k==='R') stage.resetView();
  else if(k==='+'||k==='=') stage.zoomBy(1.15);
  else if(k==='-'||k==='_') stage.zoomBy(1/1.15);
  else if(['1','2','3','4'].includes(k)) setDev(['it','auto','mobile','all'][+k-1]);
  else return;
  e.preventDefault();
});
$('#tabs').addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return;
  if(b.dataset.tab==='build'){ if(!state.draft) startDraft(cur(),false); else { state.tab='build'; fillBase(); renderTabs(); renderStage(); } }
  else { state.tab='details'; renderTabs(); renderDetails(); renderStage(); }
});
$('#details').addEventListener('click',e=>{
  const a=e.target.closest('[data-act]')?.dataset.act; if(!a) return;
  const s=cur();
  if(a==='remix') startDraft(s,false);
  if(a==='edit') startDraft(s,true);
  if(a==='del') renderDetails(true);
  if(a==='del-no') renderDetails(false);
  if(a==='del-yes'){
    custom=custom.filter(x=>x.id!==s.id); persist();
    if(state.draft?.id===s.id) state.draft=null;
    state.sel=PRESETS[0].id; renderAll(); toast('Deleted “'+s.name+'”');
  }
});
const form=$('#build');
form.addEventListener('input',e=>{
  if(e.target.id==='f-base'||e.target.id==='f-json') return;
  if(e.target.dataset.dev){
    const d=e.target.dataset.dev, k=e.target.value, arr=state.draft.modules[d];
    state.draft.modules[d]=e.target.checked?[...arr.filter(x=>x!==k),k]:arr.filter(x=>x!==k);
    renderOrder();
  } else readForm();
  renderStage();
});
$('#f-base').addEventListener('change',e=>{
  const s=all().find(x=>x.id===e.target.value); if(!s) return;
  startDraft(s,false);
});
form.addEventListener('submit',e=>{
  e.preventDefault(); readForm();
  const short=Object.keys(DEVICES).find(d=>state.draft.modules[d].length<3);
  if(short){ toast(DEVICES[short]+' needs at least 3 modules.'); return; }
  const n=normalize(state.draft);
  const i=n.id?custom.findIndex(x=>x.id===n.id):-1;
  if(i>=0) custom[i]=n; else { n.id=newId(); custom.push(n); }
  persist();
  state.sel=n.id; state.draft=null; state.tab='details';
  renderAll(); toast('Saved “'+n.name+'”');
});
form.addEventListener('click',e=>{
  const a=e.target.closest('[data-act]')?.dataset.act; if(!a) return;
  const msg=$('#io-msg'); msg.className='msg';
  if(a==='random'){ state.draft=randomDraft(); fillForm(state.draft); renderStage(); }
  if(a==='export'){
    readForm(); const out=normalize(state.draft); delete out.id; delete out.custom;
    const txt=JSON.stringify(out,null,2), ta=$('#f-json'); ta.value=txt;
    const done=()=>{ msg.textContent='Draft JSON copied. Paste it anywhere to share.'; };
    const fail=()=>{ ta.focus(); ta.select(); msg.textContent='Copy blocked here. The JSON is selected; press Ctrl+C or Cmd+C.'; };
    try{ navigator.clipboard.writeText(txt).then(done,fail); }catch(err){ fail(); }
  }
  if(a==='import'){
    let data;
    try{ data=JSON.parse($('#f-json').value); }
    catch(err){ msg.className='msg err'; msg.textContent='That is not valid JSON. Check for a missing comma or bracket.'; return; }
    const arr=(Array.isArray(data)?data:[data]).filter(x=>x&&typeof x==='object');
    if(!arr.length){ msg.className='msg err'; msg.textContent='No layouts found. Paste one layout object or a list of them.'; return; }
    const added=arr.slice(0,50).map(x=>{const n=normalize(x); n.id=newId(); return n;});
    custom.push(...added); persist();
    state.sel=added[added.length-1].id; state.draft=null; state.tab='details';
    renderAll(); toast('Imported '+added.length+' layout'+(added.length>1?'s':''));
  }
});



buildFormSkeleton();
// Canvas text needs the faces loaded before the first draw, or it bakes in the fallback font.
const faces = ["600 40px Antonio", "400 40px Fraunces", "500 40px 'IBM Plex Mono'", "500 40px 'IBM Plex Sans'", "600 40px Unbounded"];
Promise.race([Promise.all(faces.map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 2500))])
  .catch(() => {})
  .then(() => { themeColors(); renderAll(); });
