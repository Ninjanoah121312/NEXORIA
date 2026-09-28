/* NEXORIA Documentation AI
 * Standalone, zero-API-key assistant. It searches the static documentation only.
 * Conversation storage:
 *   - bot online + logged-in user: encrypted on the local NEXORIA bot PC, never in the site bundle
 *   - bot offline: encrypted in this browser's IndexedDB using a non-extractable CryptoKey
 * The site never writes conversation plaintext to a JSON file.
 */
(() => {
  const ROOT = String(window.NEXORIA_SITE_BASE || window.NEXORIA_CONFIG?.BASE_PATH || "/").replace(/\/$/, "") + "/";
  const BASE = ROOT + "site/";
  const state = { visible:false, open:false, expanded:false, scope:"general", data:null, messages:[], loading:false, online:false, loadedIdentity:null, cancelled:false, typing:false };
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
  
  function siteUserId(){ try { return localStorage.getItem("nexoria_site_user_id") || ""; } catch { return ""; } }
  async function reportError(error, context="AI"){
    const msg=String(error?.stack||error?.message||error||"Unknown error");
    const u=session()||{};
    const payload={id:crypto.randomUUID(),siteUserId:siteUserId(),discordUserId:u.id||"",username:u.username||"",displayName:u.global_name||u.globalName||u.username||"",error:msg,context,createdAt:nowIso(),botOnline:state.online};
    try{
      if(state.online && window.NEXORIA_CONFIG?.LOCAL_BOT_URL && localStorage.getItem("tk_access_token")){
        const r=await fetch(`${window.NEXORIA_CONFIG.LOCAL_BOT_URL}/ai/error-report`,{method:"POST",headers:{...authHeaders(),"Content-Type":"application/json","X-NEXORIA-SITE":"1"},body:JSON.stringify(payload),signal:AbortSignal.timeout(3500)});
        if(r.ok){ const d=await r.json(); if(d.siteUserId) localStorage.setItem("nexoria_site_user_id",d.siteUserId); return; }
      }
    }catch{}
    try{
      const db=await openLocalDb(); const tx=db.transaction("errors","readwrite"); tx.objectStore("errors").put(payload); await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=rej;});
    }catch{}
  }
  async function syncLocalErrors(){
    try{
      if(!state.online || !window.NEXORIA_CONFIG?.LOCAL_BOT_URL || !localStorage.getItem("tk_access_token")) return;
      const db=await openLocalDb(); const tx=db.transaction("errors","readonly"); const req=tx.objectStore("errors").getAll();
      const rows=await new Promise((res,rej)=>{req.onsuccess=()=>res(req.result||[]);req.onerror=rej;});
      for(const p of rows){
        try{
          const r=await fetch(`${window.NEXORIA_CONFIG.LOCAL_BOT_URL}/ai/error-report`,{method:"POST",headers:{...authHeaders(),"Content-Type":"application/json","X-NEXORIA-SITE":"1"},body:JSON.stringify({...p,botOnline:false}),signal:AbortSignal.timeout(3500)});
          if(r.ok){ const d=await r.json(); if(d.siteUserId) localStorage.setItem("nexoria_site_user_id",d.siteUserId); const tx2=db.transaction("errors","readwrite"); tx2.objectStore("errors").delete(p.id); }
        }catch{}
      }
    }catch{}
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
    if(/documentation|docs/i.test(text)) all.push({label:"Open Documentation",url:`${ROOT}docs`});
    if(/leaderboard/i.test(text)) all.push({label:"Open Leaderboards",url:`${ROOT}leaderboards`});
    if(/general settings/i.test(text)) all.push({label:"Open Dashboard",url:`${ROOT}dashboard`});
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
      for(const term of q){
        if(t.includes(term)) score+=5;
        else if(t.some(x=>x.startsWith(term)||term.startsWith(x))) score+=2.5;
        else if(t.some(x=>x.includes(term)||term.includes(x))) score+=1;
      }
      if(normalize(c.heading).includes(nq)||nq.includes(normalize(c.heading))) score+=7;
      if(normalize(c.title).includes(nq)||nq.includes(normalize(c.title))) score+=4;
      return {c,score};
    }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,5);
    if(!ranked.length) return {text:"I couldn’t find that in the NEXORIA documentation. Try a module name, feature name, command, setting, variable, or describe what you are trying to do in more detail."};
    const top=ranked[0].c; let text=top.body;
    for(const r of ranked.slice(1,4)) if(r.score>=ranked[0].score*.38) text += `\n\nRelated information — ${r.c.title} → ${r.c.heading}: ${r.c.body}`;
    return {text,links:top.links||[],source:`${top.title} → ${top.heading}`};
  }

  // IndexedDB stores a non-extractable AES-GCM key and ciphertext only.
  const DB="nexoria_ai_private";
  function idb(){ return new Promise((resolve,reject)=>{ const r=indexedDB.open(DB,2); r.onupgradeneeded=()=>{ const db=r.result; if(!db.objectStoreNames.contains("vault")) db.createObjectStore("vault"); if(!db.objectStoreNames.contains("errors")) db.createObjectStore("errors",{keyPath:"id"}); }; r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); }); }
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
  async function ensureSiteIdentity(){
    const existing=siteUserId(); if(existing) return existing;
    const token=localStorage.getItem("tk_access_token"); if(!token || !window.NEXORIA_CONFIG?.LOCAL_BOT_URL) return "";
    try{ const r=await fetch(`${window.NEXORIA_CONFIG.LOCAL_BOT_URL}/ai/site-user`,{headers:{...authHeaders(),Accept:"application/json","X-NEXORIA-SITE":"1"},cache:"no-store",signal:AbortSignal.timeout(3000)}); if(r.ok){const d=await r.json();if(d.siteUserId)localStorage.setItem("nexoria_site_user_id",d.siteUserId);return d.siteUserId||"";} }catch{} return "";
  }
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
    await ensureSiteIdentity();
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
    return `<article class="nexoria-ai-message-row ${mine?"user":"ai"}" data-msg-id="${esc(m.id||"")}"><div class="nexoria-ai-avatar">${av}</div><div class="nexoria-ai-bubble-wrap"><div class="nexoria-ai-meta"><strong>${esc(name)}</strong><time>${esc(formatTime(m.createdAt))}</time></div><div class="nexoria-ai-msg ${mine?"user":"ai"}">${m.html?m.html:linkify(m.text,m.links)}</div><div class="nexoria-ai-message-footer"><a href="${esc(window.NEXORIA_CONFIG?.DISCORD_SUPPORT_URL||"#")}" target="_blank" rel="noopener">NEXORIA Discord</a> · ${esc(userLabel())}</div><div class="nexoria-ai-msg-actions"><button type="button" data-copy-ai="${esc(m.id||"")}">Copy</button>${!mine?`<button type="button" data-speak-ai="${esc(m.id||"")}">🔊</button>`:""}</div></div></article>`;
  }
  function ensureUI(){
    if(document.getElementById("nexoria-ai-root")) return;
    const root=document.createElement("div"); root.id="nexoria-ai-root";
    root.innerHTML=`<button id="nexoria-ai-fab" class="nexoria-ai-fab" aria-label="Open NEXORIA Documentation AI"><img src="${BASE}images/logo.png" alt=""></button>
      <section id="nexoria-ai-panel" class="nexoria-ai-panel" aria-label="NEXORIA Documentation AI">
        <header class="nexoria-ai-head"><div class="nexoria-ai-brand"><img src="${BASE}images/logo.png" alt=""><div><strong>NEXORIA AI</strong><small>Documentation assistant</small></div></div><div class="nexoria-ai-head-actions"><span id="nexoria-ai-store-state" class="nexoria-ai-store-state">Offline-safe</span><button id="nexoria-ai-download" class="icon-btn" title="Download transcript">⇩</button><button id="nexoria-ai-expand" class="icon-btn" title="Expand">⛶</button><button id="nexoria-ai-close" class="icon-btn" aria-label="Close">×</button></div></header>
        <div class="nexoria-ai-disclaimer">AI may say something wrong. Check the NEXORIA Discord server for further help.</div>
        <div id="nexoria-ai-messages" class="nexoria-ai-messages"></div>
        <form id="nexoria-ai-form" class="nexoria-ai-form"><button type="button" class="nexoria-ai-mic" id="nexoria-ai-mic" title="Speech to text">🎙</button><input id="nexoria-ai-input" autocomplete="off" placeholder="Ask about NEXORIA…"><button id="nexoria-ai-send" class="btn btn-primary btn-small" type="submit">Send</button></form>
      </section>`;
    document.body.appendChild(root);
    root.querySelector("#nexoria-ai-fab").onclick=async()=>{state.open=true;paint();if(!state.loadedIdentity)await loadConversation();root.querySelector("#nexoria-ai-input")?.focus();};
    root.querySelector("#nexoria-ai-close").onclick=()=>{state.open=false;paint();};
    root.querySelector("#nexoria-ai-expand").onclick=()=>{state.expanded=!state.expanded;paint();};
    root.querySelector("#nexoria-ai-download").onclick=()=>{const text=state.messages.map(m=>`[${new Date(m.createdAt).toLocaleString()}] ${m.role==="user"?"You":"NEXORIA AI"}: ${m.text}`).join("\n\n");const blob=new Blob([text],{type:"text/plain"});const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download="nexoria-ai-transcript.txt";a.click();setTimeout(()=>URL.revokeObjectURL(u),500);};
    root.querySelector("#nexoria-ai-mic").onclick=()=>{const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){reportError(new Error("Speech recognition is not supported by this browser"),"AI speech-to-text");return;}const r=new SR();r.lang=document.documentElement.lang||"en-US";r.interimResults=false;r.onresult=e=>{root.querySelector("#nexoria-ai-input").value=e.results[0][0].transcript;};r.onerror=e=>reportError(e.error||"Speech recognition failed","AI speech-to-text");root.querySelector("#nexoria-ai-mic")?.classList.add("active"); r.onend=()=>root.querySelector("#nexoria-ai-mic")?.classList.remove("active"); r.start();};
    root.querySelector("#nexoria-ai-form").onsubmit=async e=>{e.preventDefault();const input=root.querySelector("#nexoria-ai-input");const send=root.querySelector("#nexoria-ai-send");if(state.loading){state.cancelled=true;return;}const q=input.value.trim();if(!q)return;input.value="";if(!state.loadedIdentity)await loadConversation();const createdAt=nowIso();state.messages.push({id:crypto.randomUUID(),role:"user",text:q,createdAt});paint();state.loading=true;state.cancelled=false;paint();try{await loadData();const answerResult=answer(q);const id=crypto.randomUUID();state.messages.push({id,role:"ai",text:"",links:answerResult.links||[],createdAt:nowIso(),source:answerResult.source||""});for(let i=0;i<answerResult.text.length;i+=4){if(state.cancelled)break;state.messages[state.messages.length-1].text+=answerResult.text.slice(i,i+4);paint();await new Promise(r=>setTimeout(r,22));}}catch(err){await reportError(err,"AI answer generation");state.messages.push({id:crypto.randomUUID(),role:"ai",text:err.message||"Documentation unavailable.",createdAt:nowIso()});}state.loading=false;state.cancelled=false;await persistConversation();await syncLocalErrors();paint();};
    root.addEventListener("click", async e => {
      const copy = e.target.closest("[data-copy-ai]");
      if (copy) {
        const msg = state.messages.find(m => m.id === copy.dataset.copyAi);
        if (!msg) return;
        try { await navigator.clipboard.writeText(msg.text || ""); copy.textContent = "Copied"; setTimeout(() => { copy.textContent = "Copy"; }, 900); } catch { reportError(new Error("Clipboard access was blocked"), "AI copy"); }
        return;
      }
      const speak = e.target.closest("[data-speak-ai]");
      if (speak) {
        const msg = state.messages.find(m => m.id === speak.dataset.speakAi);
        if (!msg || !window.speechSynthesis) { reportError(new Error("Text-to-speech is not supported by this browser"), "AI text-to-speech"); return; }
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(msg.text || "");
        utter.rate = 1; utter.pitch = 1; window.speechSynthesis.speak(utter);
      }
    });

  }
  function paint(){
    ensureUI(); const root=document.getElementById("nexoria-ai-root");if(!root)return;root.classList.toggle("visible",state.visible);root.classList.toggle("open",state.open);root.classList.toggle("expanded",state.expanded);
    const box=root.querySelector("#nexoria-ai-messages"); const store=root.querySelector("#nexoria-ai-store-state");
    if(store) store.textContent=state.online?"Stored on bot PC":"Stored securely in this browser"; const send=root.querySelector("#nexoria-ai-send"); if(send) send.textContent=state.loading?"Stop":"Send"; const ex=root.querySelector("#nexoria-ai-expand"); if(ex) ex.textContent=state.expanded?"⛶":"⛶";
    if(box){
      const welcome=`<div class="nexoria-ai-welcome"><div class="nexoria-ai-avatar"><img src="${BASE}images/logo.png" alt=""></div><div><strong>NEXORIA AI</strong><p>Ask where something is, how a feature works, or anything covered by the documentation. I can also provide direct links to documented pages and the support server.</p></div></div>`;
      box.innerHTML=welcome+state.messages.map(msgHtml).join("")+(state.loading?`<article class="nexoria-ai-message-row ai"><div class="nexoria-ai-avatar"><img src="${BASE}images/logo.png" alt=""></div><div class="nexoria-ai-bubble-wrap"><div class="nexoria-ai-meta"><strong>NEXORIA AI</strong><time>now</time></div><div class="nexoria-ai-msg ai nexoria-ai-typing"><i></i><i></i><i></i></div></div></article>`:"");
      box.scrollTop=box.scrollHeight;
    }
  }
  window.NexoriaAI={
    setVisible(v){state.visible=Boolean(v);if(state.visible)state.open=true;else state.open=false;paint();},
    setScope(scope){state.scope=scope||"general";paint();},
    open(){state.open=true;paint();ensureSiteIdentity().then(()=>loadConversation()).catch(()=>{});},
    async ask(q){if(!state.loadedIdentity)await loadConversation();state.messages.push({id:crypto.randomUUID(),role:"user",text:q,createdAt:nowIso()});paint();try{await loadData();const a=answer(q);state.messages.push({id:crypto.randomUUID(),role:"ai",text:a.text,links:a.links||[],createdAt:nowIso()});}catch(e){state.messages.push({id:crypto.randomUUID(),role:"ai",text:e.message,createdAt:nowIso()});}await persistConversation();paint();},
    async sync(){try{await loadConversation();}catch{}}
  };
  window.addEventListener("error",e=>reportError(e.error||e.message,"Website error"));
  window.addEventListener("unhandledrejection",e=>reportError(e.reason||"Unhandled promise rejection","Website error"));
  document.addEventListener("DOMContentLoaded",()=>{ensureUI();paint();});
})();
