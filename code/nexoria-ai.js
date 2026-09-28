/* NEXORIA Documentation AI
 * Standalone, zero-API-key assistant. It searches the static documentation only.
 * Conversation storage:
 *   - bot online + logged-in user: encrypted on the local NEXORIA bot PC, never in the site bundle
 *   - bot offline: encrypted in this browser's IndexedDB using a non-extractable CryptoKey
 * The site never writes conversation plaintext to a JSON file.
 */
(() => {
  const BASE = (window.NEXORIA_CONFIG?.BASE_PATH || "/NEXORIA/").replace(/\/$/, "") + "/";
  const state = { visible:false, open:false, scope:"general", data:null, messages:[], loading:false, online:false, loadedIdentity:null };
  const STOP = new Set("the a an and or to of in on for is are was were be this that with from how what why when where can does do i you your my about into as it its than then there here all only every much more less show tell explain please me we they them these those is it find get where do does can could would should".split(/\s+/));
  const esc = s => String(s ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const normalize = s => String(s||"").toLowerCase().replace(/[^a-z0-9.{}_-]+/g," ").trim();
  const terms = s => normalize(s).split(/\s+/).filter(x=>x && !STOP.has(x) && x.length>1);
  const nowIso = () => new Date().toISOString();
  const session = () => { try { return JSON.parse(localStorage.getItem("tk_user")||"null"); } catch { return null; } };
  function identity(){
    const u=session(); if(u?.id) return String(u.id);
    let id=localStorage.getItem("nexoria_ai_device_id");
    if(!id){ id=crypto.randomUUID(); localStorage.setItem("nexoria_ai_device_id",id); }
    return `device:${id}`;
  }
  function userAvatar(){
    const u=session();
    if(!u?.id || !u?.avatar) return "";
    return `https://cdn.discordapp.com/avatars/${encodeURIComponent(u.id)}/${encodeURIComponent(u.avatar)}.png?size=64`;
  }
  function userLabel(){ const u=session(); return u?.global_name || u?.username || "You"; }
  function initials(name){ return String(name||"?").slice(0,2).toUpperCase(); }
  function formatTime(iso){ try { return new Intl.DateTimeFormat(undefined,{hour:"2-digit",minute:"2-digit"}).format(new Date(iso)); } catch { return ""; } }

  async function loadData(){
    if(state.data) return state.data;
    const r=await fetch(`${BASE}data/documentation.json?ai=${encodeURIComponent(Date.now())}`,{cache:"no-store"});
    if(!r.ok) throw new Error("Documentation is temporarily unavailable.");
    state.data=await r.json(); return state.data;
  }
  function makeChunks(data){
    const chunks=[];
    for(const d of [...(data.general||[]),...(data.site||[]),...(data.modules||[])])
      for(const s of (d.sections||[])) chunks.push({id:d.moduleId||d.id||d.category||"general",title:d.title,heading:s.heading,text:`${d.title} ${d.summary||""} ${s.heading} ${s.body}`,body:s.body,links:s.links||[]});
    for(const v of (data.variables||[])) chunks.push({id:v.moduleId||"general",title:"Variables",heading:`{${v.key}}`,text:`${v.key} ${v.group} ${v.description}`,body:`{${v.key}} — ${v.description}`});
    return chunks;
  }
  function linkify(text, links=[]){
    let html=esc(text).replace(/\n/g,"<br>");
    const all=[...links];
    const cfg=window.NEXORIA_CONFIG||{};
    if(/support|discord server|discord link/i.test(text) && cfg.DISCORD_SUPPORT_URL) all.push({label:"Open the NEXORIA Support Server",url:cfg.DISCORD_SUPPORT_URL});
    if(/documentation|docs/i.test(text)) all.push({label:"Open Documentation",url:`${BASE}docs`});
    if(/leaderboard/i.test(text)) all.push({label:"Open Leaderboards",url:`${BASE}leaderboards`});
    if(/general settings/i.test(text)) all.push({label:"Open Dashboard",url:`${BASE}dashboard`});
    const unique=[]; const seen=new Set(); for(const l of all){ if(!l?.url||seen.has(l.url)) continue; seen.add(l.url); unique.push(l); }
    if(unique.length) html += `<div class="nexoria-ai-links">${unique.map(l=>`<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label||l.url)} ${window.DC?.icon?window.DC.icon("link",14):"↗"}</a>`).join("")}</div>`;
    return html;
  }
  function answer(question){
    const q=terms(question); if(!q.length) return {text:"Ask me something about NEXORIA's documentation and I’ll search the documented information."};
    const chunks=makeChunks(state.data||{});
    const scoped=state.scope&&state.scope!=="general"?chunks.filter(c=>c.id===state.scope||c.id==="general"):chunks;
    const nq=normalize(question);
    const ranked=scoped.map(c=>{
      const t=terms(c.text); let score=0;
      for(const term of q){ if(t.includes(term)) score+=4; else if(t.some(x=>x.includes(term)||term.includes(x))) score+=1.5; }
      if(normalize(c.heading).includes(nq)||nq.includes(normalize(c.heading))) score+=5;
      return {c,score};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,3);
    if(!ranked.length) return {text:"I couldn’t find that in the NEXORIA documentation. Try asking about the dashboard, Discord server, General Settings, modules, leaderboards, status/refreshing, announcements, or variables."};
    const top=ranked[0].c; let text=top.body;
    if(ranked.length>1 && ranked[1].score>=ranked[0].score*.55) text += `\n\nRelated: ${ranked[1].c.title} — ${ranked[1].c.heading}: ${ranked[1].c.body}`;
    return {text,links:top.links||[],source:`${top.title} → ${top.heading}`};
  }

  // IndexedDB stores a non-extractable AES-GCM key and ciphertext only.
  const DB="nexoria_ai_private";
  function idb(){ return new Promise((resolve,reject)=>{ const r=indexedDB.open(DB,1); r.onupgradeneeded=()=>r.result.createObjectStore("vault"); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); }); }
  async function getKey(){
    const db=await idb();
    const existing=await new Promise((resolve,reject)=>{const t=db.transaction("vault","readonly"); const r=t.objectStore("vault").get("key"); r.onsuccess=()=>resolve(r.result||null); r.onerror=()=>reject(r.error);});
    if(existing) return existing;
    const key=await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
    await new Promise((resolve,reject)=>{const t=db.transaction("vault","readwrite"); t.objectStore("vault").put(key,"key"); t.oncomplete=resolve; t.onerror=()=>reject(t.error);});
    return key;
  }
  function b64(buf){ return btoa(String.fromCharCode(...new Uint8Array(buf))); }
  function unb64(s){ return Uint8Array.from(atob(s),c=>c.charCodeAt(0)); }
  async function localSave(id, payload){
    const key=await getKey(), iv=crypto.getRandomValues(new Uint8Array(12));
    const plain=new TextEncoder().encode(JSON.stringify(payload));
    const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,plain);
    const db=await idb(); await new Promise((resolve,reject)=>{const t=db.transaction("vault","readwrite"); t.objectStore("vault").put({iv:b64(iv),data:b64(cipher),savedAt:Date.now()},`conversation:${id}`); t.oncomplete=resolve; t.onerror=()=>reject(t.error);});
  }
  async function localLoad(id){
    try{
      const db=await idb(); const row=await new Promise((resolve,reject)=>{const t=db.transaction("vault","readonly"); const r=t.objectStore("vault").get(`conversation:${id}`); r.onsuccess=()=>resolve(r.result||null); r.onerror=()=>reject(r.error);});
      if(!row) return null; const key=await getKey(); const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(row.iv)},key,unb64(row.data)); return JSON.parse(new TextDecoder().decode(plain));
    }catch{return null;}
  }
  async function localDelete(id){ try{const db=await idb(); await new Promise((resolve,reject)=>{const t=db.transaction("vault","readwrite");t.objectStore("vault").delete(`conversation:${id}`);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}catch{} }
  function authHeaders(){ const token=localStorage.getItem("tk_access_token"); return token?{"Authorization":`Bearer ${token}`}:{}; }
  async function remoteGet(){
    const token=localStorage.getItem("tk_access_token"); if(!token || !window.NEXORIA_CONFIG?.LOCAL_BOT_URL) throw new Error("offline");
    const r=await fetch(`${window.NEXORIA_CONFIG.LOCAL_BOT_URL}/ai/conversation`,{headers:{...authHeaders(),Accept:"application/json","X-NEXORIA-SITE":"1"},cache:"no-store",signal:AbortSignal.timeout(3000)});
    if(!r.ok) throw new Error("offline"); return r.json();
  }
  async function remoteSave(messages){
    const token=localStorage.getItem("tk_access_token"); if(!token || !window.NEXORIA_CONFIG?.LOCAL_BOT_URL) throw new Error("offline");
    const r=await fetch(`${window.NEXORIA_CONFIG.LOCAL_BOT_URL}/ai/conversation`,{method:"PUT",headers:{...authHeaders(),"Content-Type":"application/json","X-NEXORIA-SITE":"1"},body:JSON.stringify({messages}),cache:"no-store",signal:AbortSignal.timeout(4000)});
    if(!r.ok) throw new Error("offline"); return r.json();
  }
  function mergeMessages(a,b){ const map=new Map(); for(const m of [...(a||[]),...(b||[])]) if(m?.id) map.set(m.id,m); return [...map.values()].sort((x,y)=>new Date(x.createdAt)-new Date(y.createdAt)).slice(-200); }
  async function loadConversation(){
    const id=identity(); state.loadedIdentity=id;
    let local=await localLoad(id);
    try{
      const remote=await remoteGet(); state.online=true;
      const merged=mergeMessages(remote.messages||[],local?.messages||[]);
      state.messages=merged;
      if((local?.messages||[]).length && merged.length) await remoteSave(merged).catch(()=>{});
      await localDelete(id); // online => no conversation copy remains in the website
    }catch{
      state.online=false; state.messages=local?.messages||[];
    }
    paint();
  }
  async function persistConversation(){
    const id=state.loadedIdentity||identity();
    const payload={identity:id,updatedAt:nowIso(),messages:state.messages};
    try{
      if(state.online){ await remoteSave(state.messages); await localDelete(id); }
      else await localSave(id,payload);
    }catch{ state.online=false; await localSave(id,payload); }
  }
  function msgHtml(m){
    const mine=m.role==="user"; const avatar=mine?userAvatar():`${BASE}images/logo.png`; const name=mine?userLabel():"NEXORIA AI";
    const av=avatar?`<img src="${esc(avatar)}" alt="">`:`<span>${esc(initials(name))}</span>`;
    return `<article class="nexoria-ai-message-row ${mine?"user":"ai"}"><div class="nexoria-ai-avatar">${av}</div><div class="nexoria-ai-bubble-wrap"><div class="nexoria-ai-meta"><strong>${esc(name)}</strong><time>${esc(formatTime(m.createdAt))}</time></div><div class="nexoria-ai-msg ${mine?"user":"ai"}">${m.html?m.html:linkify(m.text,m.links)}</div></div></article>`;
  }
  function ensureUI(){
    if(document.getElementById("nexoria-ai-root")) return;
    const root=document.createElement("div"); root.id="nexoria-ai-root";
    root.innerHTML=`<button id="nexoria-ai-fab" class="nexoria-ai-fab" aria-label="Open NEXORIA Documentation AI"><img src="${BASE}images/logo.png" alt=""></button>
      <section id="nexoria-ai-panel" class="nexoria-ai-panel" aria-label="NEXORIA Documentation AI">
        <header class="nexoria-ai-head"><div class="nexoria-ai-brand"><img src="${BASE}images/logo.png" alt=""><div><strong>NEXORIA AI</strong><small>Documentation assistant</small></div></div><div class="nexoria-ai-head-actions"><span id="nexoria-ai-store-state" class="nexoria-ai-store-state">Offline-safe</span><button id="nexoria-ai-close" class="icon-btn" aria-label="Close">×</button></div></header>
        <div id="nexoria-ai-messages" class="nexoria-ai-messages"></div>
        <form id="nexoria-ai-form" class="nexoria-ai-form"><input id="nexoria-ai-input" autocomplete="off" placeholder="Ask about NEXORIA…"><button class="btn btn-primary btn-small" type="submit">Send</button></form>
      </section>`;
    document.body.appendChild(root);
    root.querySelector("#nexoria-ai-fab").onclick=async()=>{state.open=true;paint();if(!state.loadedIdentity)await loadConversation();root.querySelector("#nexoria-ai-input")?.focus();};
    root.querySelector("#nexoria-ai-close").onclick=()=>{state.open=false;paint();};
    root.querySelector("#nexoria-ai-form").onsubmit=async e=>{e.preventDefault();const input=root.querySelector("#nexoria-ai-input");const q=input.value.trim();if(!q||state.loading)return;input.value="";if(!state.loadedIdentity)await loadConversation();const createdAt=nowIso();state.messages.push({id:crypto.randomUUID(),role:"user",text:q,createdAt});paint();state.loading=true;paint();try{await loadData();const a=answer(q);state.messages.push({id:crypto.randomUUID(),role:"ai",text:a.text,links:a.links||[],createdAt:nowIso(),source:a.source||""});}catch(err){state.messages.push({id:crypto.randomUUID(),role:"ai",text:err.message||"Documentation unavailable.",createdAt:nowIso()});}state.loading=false;await persistConversation();paint();};
  }
  function paint(){
    ensureUI(); const root=document.getElementById("nexoria-ai-root");if(!root)return;root.classList.toggle("visible",state.visible);root.classList.toggle("open",state.open);
    const box=root.querySelector("#nexoria-ai-messages"); const store=root.querySelector("#nexoria-ai-store-state");
    if(store) store.textContent=state.online?"Stored on bot PC":"Stored securely in this browser";
    if(box){
      const welcome=`<div class="nexoria-ai-welcome"><div class="nexoria-ai-avatar"><img src="${BASE}images/logo.png" alt=""></div><div><strong>NEXORIA AI</strong><p>Ask where something is, how a feature works, or anything covered by the documentation. I can also provide direct links to documented pages and the support server.</p></div></div>`;
      box.innerHTML=welcome+state.messages.map(msgHtml).join("")+(state.loading?`<article class="nexoria-ai-message-row ai"><div class="nexoria-ai-avatar"><img src="${BASE}images/logo.png" alt=""></div><div class="nexoria-ai-bubble-wrap"><div class="nexoria-ai-meta"><strong>NEXORIA AI</strong><time>now</time></div><div class="nexoria-ai-msg ai nexoria-ai-typing"><i></i><i></i><i></i></div></div></article>`:"");
      box.scrollTop=box.scrollHeight;
    }
  }
  window.NexoriaAI={
    setVisible(v){state.visible=Boolean(v);if(!state.visible)state.open=false;paint();},
    setScope(scope){state.scope=scope||"general";paint();},
    async ask(q){if(!state.loadedIdentity)await loadConversation();state.messages.push({id:crypto.randomUUID(),role:"user",text:q,createdAt:nowIso()});paint();try{await loadData();const a=answer(q);state.messages.push({id:crypto.randomUUID(),role:"ai",text:a.text,links:a.links||[],createdAt:nowIso()});}catch(e){state.messages.push({id:crypto.randomUUID(),role:"ai",text:e.message,createdAt:nowIso()});}await persistConversation();paint();},
    async sync(){try{await loadConversation();}catch{}}
  };
  document.addEventListener("DOMContentLoaded",()=>{ensureUI();paint();});
})();
