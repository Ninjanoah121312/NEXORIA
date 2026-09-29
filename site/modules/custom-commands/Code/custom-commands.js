// custom-commands.js
(function () {
    const state = { commands: [], categories: [], meta: null };
    function esc(s) { return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
    function loading(msg) { return `<div class="loading-wrap"><div class="spinner"></div><div>${msg || "Loading…"}</div></div>`; }
    async function ensureMeta(ctx) {
        if (state.meta)
            return state.meta;
        try {
            state.meta = await ctx.api(`/guilds/${ctx.guildId}/custom-commands-meta`);
        }
        catch {
            state.meta = { roles: [], members: [] };
        }
        return state.meta;
    }
    async function loadCommands(ctx) {
        try {
            const d = await ctx.api(`/guilds/${ctx.guildId}/custom-commands`);
            state.commands = d.commands || [];
        }
        catch {
            state.commands = [];
        }
        return state.commands;
    }
    const ACTION_TYPES = [
        { value: "message", label: "Send a message" },
        { value: "addRole", label: "Add a role" },
        { value: "removeRole", label: "Remove a role" },
        { value: "comment", label: "Comment / note" },
        { value: "delay", label: "Wait" },
    ];
    let BUILTIN_VARS = [
        { key: "user.mention", label: "Mentions the user who ran the command" },
        { key: "user.name", label: "Username of whoever ran the command" },
        { key: "server.name", label: "This server's name" },
        { key: "server.memberCount", label: "Total member count" },
    ];
    let variablesLoaded = false;
    async function ensureVariables(ctx) {
        if (variablesLoaded)
            return BUILTIN_VARS;
        try {
            const d = await ctx.api("/variables");
            BUILTIN_VARS = (d.variables || []).filter(v => !v.moduleId).map(v => ({ key: v.key, label: v.description }));
            variablesLoaded = true;
        }
        catch { }
        return BUILTIN_VARS;
    }
    function renderShell(root) {
        root.innerHTML = `
      <div class="dash-header">
        <div><h1>Custom Commands</h1><p>Build your own prefix or slash commands — messages, pings, and role actions.</p></div>
      </div>
      <div id="cc-body">${loading()}</div>`;
        return document.getElementById("cc-body");
    }
    async function renderList(root, ctx) {
        const body = renderShell(root);
        await ensureMeta(ctx);
        await ensureVariables(ctx);
        await loadCommands(ctx);
        paintList(body, ctx);
    }
    function paintList(body, ctx) {
        body.innerHTML = `
      <div class="dash-header" style="margin-bottom:14px">
        <div><h3 style="font-size:14px;font-weight:700">Commands</h3><p style="font-size:12.5px;color:var(--text-dim);margin-top:2px">Drag the handle to reorder. Toggle, edit, duplicate, or delete each command.</p></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-small" id="cc-disable-all">${DC.icon("toggle-left")} Disable all</button>
          <button class="btn btn-ghost btn-small" id="cc-enable-all">${DC.icon("toggle-right")} Enable all</button>
          <button class="btn btn-ghost btn-small" id="cc-category-new">${DC.icon("plus")} Category</button>
          <button class="btn btn-ghost btn-small" id="cc-export">${DC.icon("download")} Export</button>
          <button class="btn btn-ghost btn-small" id="cc-import">${DC.icon("upload")} Import</button>
          <button class="btn btn-primary btn-small" id="cc-new">${DC.icon("plus")} New command</button>
        </div>
      </div>
      <div class="ticket-toolbar" style="margin-bottom:12px">
        <div class="ticket-filters">
          <span class="filter-chip active" data-cf="all">All</span>
          <span class="filter-chip" data-cf="enabled">Enabled</span>
          <span class="filter-chip" data-cf="disabled">Disabled</span>
        </div>
        <input type="text" class="search-input" id="cc-search" placeholder="Search commands…">
      </div>
      <div class="settings-section-block" style="margin-bottom:12px"><div class="config-row-label">Categories</div><div id="cc-categories" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"></div></div>
      <div id="cc-list"></div>`;
        body.querySelector("#cc-new")?.addEventListener("click",()=>{
          const r=ctx.modal.custom(`<div class="dc-modal-header"><h3>Create command</h3></div><div class="dc-modal-body"><p>Choose how you want to build the command.</p><div class="command-create-choice-grid"><button type="button" class="command-create-choice" id="cc-create-basic">${DC.icon("bolt",22)}<strong>Basic</strong><span>Simple trigger, response, and permissions.</span></button><button type="button" class="command-create-choice" id="cc-create-advanced">${DC.icon("settings",22)}<strong>Advanced</strong><span>Actions, variables, comments, embeds, cooldowns, roles, and more.</span></button></div></div>`,{maxWidth:"620px"});
          r.querySelector("#cc-create-basic")?.addEventListener("click",()=>{ctx.modal.close();setTimeout(()=>openCommandEditor(ctx,null,"basic"),0)});
          r.querySelector("#cc-create-advanced")?.addEventListener("click",()=>{ctx.modal.close();setTimeout(()=>openAdvancedCommandBuilder(ctx,null),0)});
        });
        body.querySelector("#cc-category-new")?.addEventListener("click", async () => { const name = await ctx.modal.prompt("Category name", { title: "Create category" }); if (!name)
            return; try {
            await ctx.api(`/guilds/${ctx.guildId}/custom-commands/categories`, { method: "POST", body: JSON.stringify({ name }) });
            await loadCommands(ctx);
            paintCommandList(ctx, "all", "");
        }
        catch (e) {
            ctx.modal.alert(e.message);
        } });
        body.querySelector("#cc-export")?.addEventListener("click", async () => { try {
            const d = await ctx.api(`/guilds/${ctx.guildId}/custom-commands/export`);
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }));
            a.download = `custom-commands-${ctx.guildId}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
        }
        catch (e) {
            ctx.modal.alert(e.message);
        } });
        body.querySelector("#cc-import")?.addEventListener("click", () => { const input = document.createElement("input"); input.type = "file"; input.accept = "application/json"; input.onchange = async () => { try {
            const d = JSON.parse(await input.files[0].text());
            await ctx.api(`/guilds/${ctx.guildId}/custom-commands/import`, { method: "POST", body: JSON.stringify(d) });
            await loadCommands(ctx);
            paintCommandList(ctx, "all", "");
        }
        catch (e) {
            ctx.modal.alert(`Import failed: ${e.message}`);
        } }; input.click(); });
        body.querySelector("#cc-enable-all")?.addEventListener("click", () => bulkSetEnabled(ctx, true));
        body.querySelector("#cc-disable-all")?.addEventListener("click", () => bulkSetEnabled(ctx, false));
        let filter = "all", query = "";
        body.querySelectorAll("[data-cf]").forEach(chip => chip.addEventListener("click", () => {
            filter = chip.dataset.cf;
            body.querySelectorAll("[data-cf]").forEach(c => c.classList.toggle("active", c === chip));
            paintCommandList(ctx, filter, query);
        }));
        body.querySelector("#cc-search")?.addEventListener("input", (e) => { query = e.target.value; paintCommandList(ctx, filter, query); });
        paintCommandList(ctx, filter, query);
        paintCategories(ctx);
    }
    function paintCategories(ctx) { const wrap = document.getElementById("cc-categories"); if (!wrap)
        return; wrap.innerHTML = state.categories.map(c => `<button class="filter-chip ${c.enabled === false ? "" : "active"}" data-cc-cat="${esc(c.id)}">${esc(c.name)} ${c.enabled === false ? "(off)" : ""}</button>`).join(""); wrap.querySelectorAll("[data-cc-cat]").forEach(b => b.addEventListener("click", async () => { const c = state.categories.find(x => x.id === b.dataset.ccCat); if (!c)
        return; try {
        await ctx.api(`/guilds/${ctx.guildId}/custom-commands/categories/${c.id}`, { method: "PUT", body: JSON.stringify({ enabled: c.enabled === false }) });
        c.enabled = c.enabled === false;
        paintCategories(ctx);
        paintCommandList(ctx, "all", "");
    }
    catch (e) {
        ctx.modal.alert(e.message);
    } })); }
    async function bulkSetEnabled(ctx, enabled) {
        const ok = await ctx.modal.confirm(`${enabled ? "Enable" : "Disable"} every command in this server?`, { title: enabled ? "Enable all" : "Disable all", confirmLabel: enabled ? "Enable all" : "Disable all" });
        if (!ok)
            return;
        try {
            await ctx.api(`/guilds/${ctx.guildId}/custom-commands-bulk`, { method: "PUT", body: JSON.stringify({ enabled }) });
            await loadCommands(ctx);
            paintCommandList(ctx, "all", "");
            document.querySelectorAll("[data-cf]").forEach(c => c.classList.toggle("active", c.dataset.cf === "all"));
        }
        catch (e) {
            await ctx.modal.alert(`Couldn't update commands: ${e.message}`);
        }
    }
    function triggerLabel(c) {
        if (c.scope === "both")
            return `${esc(c.trigger)} · prefix + slash`;
        return c.triggerType === "slash" ? `/${esc(c.trigger)}` : esc(c.trigger);
    }
    function paintCommandList(ctx, filter = "all", query = "") {
        const list = document.getElementById("cc-list");
        if (!list) return;
        let rows = state.commands.slice();
        if (filter === "enabled") rows = rows.filter(c => c.enabled);
        if (filter === "disabled") rows = rows.filter(c => !c.enabled);
        if (query) {
            const q = query.toLowerCase();
            rows = rows.filter(c => `${c.name||""} ${c.trigger||""} ${c.description||""}`.toLowerCase().includes(q));
        }
        if (!state.commands.length) { list.innerHTML = `<div class="empty-state">${DC.icon("terminal-2",28)}No commands yet. Create one to get started.</div>`; return; }
        if (!rows.length) { list.innerHTML = `<div class="empty-state">${DC.icon("search-off",28)}No commands match.</div>`; return; }
        const grouped = new Map();
        rows.forEach(c => { const cat = state.categories.find(x => x.id === c.categoryId); const key = c.builtin ? "__builtin__" : (cat?.id || c.categoryId || "general"); const label = c.builtin ? "NEXORIA Built-in Commands" : (cat?.name || "General"); if(!grouped.has(key)) grouped.set(key,{key,label,commands:[]}); grouped.get(key).commands.push(c); });
        const collapsed = JSON.parse(localStorage.getItem("nexoria_cc_collapsed") || "{}");
        const card = c => `
          <div class="subject-card cc-command-card ${c.enabled === false ? "cc-disabled" : ""}" data-cc-id="${esc(c.id)}" draggable="${c.builtin ? "false" : "true"}">
            <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1">
              ${c.builtin ? `<span class="cc-builtin-mark">N</span>` : `<span class="cc-drag-handle" title="Drag to reorder">${DC.icon("grip-vertical")}</span>`}
              <div class="subject-card-main"><div class="subject-card-name"><code class="cc-command-trigger-chip">${triggerLabel(c)}</code> ${esc(c.name)} ${c.builtin ? `<span class="tier-badge tier-premium cc-built-in-badge">Built-in</span>` : ""}</div><div class="subject-card-desc">${esc(c.description || "No description")}</div></div>
            </div>
            <div class="subject-card-actions"><button class="toggle ${c.enabled ? "on" : ""}" data-cc-toggle="${esc(c.id)}" aria-label="Toggle enabled"></button><button class="icon-btn" data-cc-history="${esc(c.id)}" title="History" aria-label="History">${DC.icon("history")}</button>${c.builtin ? "" : `<button class="icon-btn" data-cc-dup="${esc(c.id)}" title="Duplicate" aria-label="Duplicate">${DC.icon("copy")}</button><button class="icon-btn" data-cc-edit="${esc(c.id)}" title="Edit" aria-label="Edit">${DC.icon("edit")}</button><button class="icon-btn danger" data-cc-del="${esc(c.id)}" title="Delete" aria-label="Delete">${DC.icon("trash")}</button>`}</div>
          </div>`;
        list.innerHTML = [...grouped.values()].map(g => `<section class="cc-category-group" data-cc-group="${esc(g.key)}"><button type="button" class="cc-category-header" data-cc-collapse="${esc(g.key)}"><span><span class="cc-category-chevron">${DC.icon("chevron-down",15)}</span>${esc(g.label)} <small>${g.commands.length}</small></span><span class="field-hint">Expand / minimize</span></button><div class="cc-category-items" ${collapsed[g.key] ? `style="display:none"` : ""}>${g.commands.map(card).join("")}</div></section>`).join("");
        list.querySelectorAll("[data-cc-collapse]").forEach(btn=>btn.addEventListener("click",()=>{const k=btn.dataset.ccCollapse; const items=btn.parentElement.querySelector(".cc-category-items"); const hidden=items.style.display==="none"; items.style.display=hidden?"":"none"; const c=JSON.parse(localStorage.getItem("nexoria_cc_collapsed")||"{}"); c[k]=!hidden; localStorage.setItem("nexoria_cc_collapsed",JSON.stringify(c));}));
        list.querySelectorAll("[data-cc-toggle]").forEach(btn => btn.addEventListener("click", async () => { const c=state.commands.find(x=>x.id===btn.dataset.ccToggle); if(!c)return; const next=!c.enabled; c.enabled=next; btn.classList.toggle("on",next); btn.closest(".cc-command-card")?.classList.toggle("cc-disabled",!next); try{await ctx.api(`/guilds/${ctx.guildId}/custom-commands/${c.id}`,{method:"PUT",body:JSON.stringify({enabled:next,userId:getSession()?.user?.id})});}catch{c.enabled=!next;btn.classList.toggle("on",c.enabled);btn.closest(".cc-command-card")?.classList.toggle("cc-disabled",!c.enabled);}}));
        list.querySelectorAll("[data-cc-edit]").forEach(btn=>btn.addEventListener("click",()=>openCommandEditor(ctx,state.commands.find(x=>x.id===btn.dataset.ccEdit))));
        list.querySelectorAll("[data-cc-history]").forEach(btn=>btn.addEventListener("click",()=>openHistoryModal(ctx,state.commands.find(x=>x.id===btn.dataset.ccHistory))));
        list.querySelectorAll("[data-cc-dup]").forEach(btn=>btn.addEventListener("click",async()=>{try{await ctx.api(`/guilds/${ctx.guildId}/custom-commands/${btn.dataset.ccDup}/duplicate`,{method:"POST"});await loadCommands(ctx);paintCommandList(ctx,filter,query);}catch(e){await ctx.modal.alert(`Couldn't duplicate: ${e.message}`);}}));
        list.querySelectorAll("[data-cc-del]").forEach(btn=>btn.addEventListener("click",async()=>{if(!await ctx.modal.confirm("This can't be undone.",{title:"Delete this command?",confirmLabel:"Delete",danger:true}))return;try{await ctx.api(`/guilds/${ctx.guildId}/custom-commands/${btn.dataset.ccDel}`,{method:"DELETE"});await loadCommands(ctx);paintCommandList(ctx,filter,query);}catch(e){await ctx.modal.alert(`Couldn't delete: ${e.message}`);}}));
        wireDragReorder(list,ctx);
    }
    function wireDragReorder(list, ctx) {
        let dragEl = null;
        list.querySelectorAll(".cc-command-card[draggable='true']").forEach(card => {
            card.addEventListener("dragstart", () => { dragEl = card; card.classList.add("cc-dragging"); });
            card.addEventListener("dragend", async () => {
                card.classList.remove("cc-dragging");
                const orderedIds = [...list.querySelectorAll(".cc-command-card")].map(el => el.dataset.ccId);
                try {
                    await ctx.api(`/guilds/${ctx.guildId}/custom-commands-order`, { method: "PUT", body: JSON.stringify({ orderedIds }) });
                    await loadCommands(ctx);
                }
                catch { }
            });
            card.addEventListener("dragover", (e) => {
                e.preventDefault();
                if (!dragEl || dragEl === card)
                    return;
                const rect = card.getBoundingClientRect();
                const before = (e.clientY - rect.top) < rect.height / 2;
                card.parentNode.insertBefore(dragEl, before ? card : card.nextSibling);
            });
        });
    }
    function openHistoryModal(ctx, command) {
        if (!command)
            return;
        const bodyHtml = `
      <div class="dc-modal-header"><h3>Usage history · ${esc(command.name)}</h3></div>
      <div style="padding:14px 20px 0"><input type="text" class="search-input" id="cc-history-search" placeholder="Search by user…" style="width:100%"></div>
      <div id="cc-history-list" style="padding:14px 20px;max-height:50vh;overflow-y:auto"></div>
      <div class="dc-modal-footer"><button class="btn btn-ghost btn-small" id="cc-history-close">Close</button></div>`;
        const r = ctx.modal.custom(bodyHtml, { maxWidth: "640px" });
        r.querySelector("#cc-history-close").addEventListener("click", ctx.modal.close);
        function paint(query) {
            const list = r.querySelector("#cc-history-list");
            let rows = command.history || [];
            if (query) {
                const q = query.toLowerCase();
                rows = rows.filter(h => (h.userName || "").toLowerCase().includes(q));
            }
            if (rows.length === 0) {
                list.innerHTML = `<div class="empty-state">${DC.icon("history-off", 28)}${(command.history || []).length === 0 ? "This command hasn't been used yet." : "No matching uses."}</div>`;
                return;
            }
            list.innerHTML = `
        <div class="ticket-table">
          <div class="ticket-row head" style="grid-template-columns:1fr 1fr 140px"><span>User</span><span>Channel</span><span>When</span></div>
          ${rows.map(h => `
            <div class="ticket-row" style="grid-template-columns:1fr 1fr 140px">
              <span>${esc(h.userName || h.userId || "Unknown")}</span>
              <span>${esc(h.channelName ? `#${h.channelName}` : "—")}</span>
              <span>${h.usedAt ? new Date(h.usedAt).toLocaleString() : "—"}</span>
            </div>`).join("")}
        </div>`;
        }
        paint("");
        r.querySelector("#cc-history-search").addEventListener("input", (e) => paint(e.target.value));
    }
    function openAdvancedCommandBuilder(ctx, command) {
        const makeId = () => `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
        const oldActions = command?.actions ? JSON.parse(JSON.stringify(command.actions)) : [{ type:"message", content:"" }];
        const oldGraph = command?.graph || {};
        const nodes = oldActions.map((a,i)=>({
            id:String(a.nodeId || oldGraph.nodes?.[i]?.id || makeId()),
            type:a.type || "message", content:a.content || "", roleId:a.roleId || "", ms:Number(a.ms)||1000,
            x:Number(oldGraph.nodes?.find(n=>String(n.id)===String(a.nodeId))?.x ?? a.position?.x ?? (140+(i%4)*300)),
            y:Number(oldGraph.nodes?.find(n=>String(n.id)===String(a.nodeId))?.y ?? a.position?.y ?? (140+Math.floor(i/4)*220))
        }));
        const connections = Array.isArray(oldGraph.connections) ? oldGraph.connections.filter(c=>nodes.some(n=>n.id===String(c.from))&&nodes.some(n=>n.id===String(c.to))).map(c=>({from:String(c.from),to:String(c.to)})) : nodes.slice(0,-1).map((n,i)=>({from:n.id,to:nodes[i+1].id}));
        const draft = {
            name:command?.name||"", trigger:command?.trigger||"", triggerType:command?.triggerType||"prefix", scope:command?.scope||"prefix",
            description:command?.description||"", allowedRoles:command?.allowedRoles?[...command.allowedRoles]:[], cooldownSeconds:command?.cooldownSeconds??0,
            cooldownPerUser:command?.cooldownPerUser??true, embedEnabled:command?.embedEnabled??false, embedColor:command?.embedColor||"#8b5cf6",
            variables:command?.variables?{...command.variables}:{}, categoryId:command?.categoryId||"general", permissionMode:command?.permissionMode||"everyone",
            nodes, connections, zoom:Number(oldGraph.zoom)||1, pan:{x:Number(oldGraph.pan?.x)||0,y:Number(oldGraph.pan?.y)||0}
        };
        let dirty=false, selected=null, connecting=null, undoStack=[], redoStack=[];
        const nodeMeta={
            message:{label:"Send Message",group:"Discord",color:"violet",icon:"message",help:"Send a Discord message."},
            addRole:{label:"Add Role",group:"Discord",color:"cyan",icon:"shield-plus",help:"Add a role to the command user."},
            removeRole:{label:"Remove Role",group:"Discord",color:"red",icon:"shield-x",help:"Remove a role from the command user."},
            delay:{label:"Wait",group:"Flow",color:"yellow",icon:"clock",help:"Pause execution for a number of milliseconds."},
            comment:{label:"Comment",group:"Logic",color:"gray",icon:"note",help:"Builder-only note; not sent to Discord."}
        };
        function snapshot(){return JSON.stringify({nodes:draft.nodes,connections:draft.connections,zoom:draft.zoom,pan:draft.pan});}
        let lastSnap=snapshot();
        function mark(){dirty=true; r?.querySelectorAll?.("[data-save-advanced]").forEach(b=>{b.disabled=false;b.textContent=command?"Save changes":"Save command";});}
        function checkpoint(){const now=snapshot(); if(now===lastSnap)return; undoStack.push(lastSnap); if(undoStack.length>80)undoStack.shift(); redoStack=[]; lastSnap=now; mark();}
        function restore(serialized){const d=JSON.parse(serialized); draft.nodes=d.nodes; draft.connections=d.connections; draft.zoom=d.zoom; draft.pan=d.pan; paint();}
        function undo(){if(!undoStack.length)return; redoStack.push(snapshot());restore(undoStack.pop());lastSnap=snapshot();mark();}
        function redo(){if(!redoStack.length)return;undoStack.push(snapshot());restore(redoStack.pop());lastSnap=snapshot();mark();}
        function nodeTitle(n){return nodeMeta[n.type]?.label||"Node";}
        function nodeBody(n,i){
            if(n.type==="message") return `<textarea data-node-content="${i}" placeholder="Message content…">${esc(n.content)}</textarea>`;
            if(n.type==="delay") return `<label class="cc-node-label">Wait time</label><div class="cc-node-input-row"><input type="number" min="0" max="120000" step="10" data-node-ms="${i}" value="${n.ms}"><span>ms</span></div>`;
            if(n.type==="addRole"||n.type==="removeRole") return `<label class="cc-node-label">Role ID</label><input type="text" data-node-role="${i}" value="${esc(n.roleId)}" placeholder="Discord role ID">`;
            return `<textarea data-node-content="${i}" placeholder="Explain this step…">${esc(n.content)}</textarea><div class="cc-node-help">Builder-only note.</div>`;
        }
        function nodeHtml(n,i){
            const meta=nodeMeta[n.type]||nodeMeta.message;
            return `<div class="cc-vs-node cc-vs-${meta.color}" data-node="${i}" data-node-id="${esc(n.id)}" style="left:${n.x}px;top:${n.y}px">
                <div class="cc-vs-node-head"><span class="cc-vs-node-icon">${DC.icon(meta.icon,15)}</span><strong>${esc(meta.label)}</strong><span class="cc-vs-node-number">${i+1}</span><button class="cc-vs-node-menu" type="button" data-node-menu="${i}">⋮</button></div>
                <div class="cc-vs-port cc-vs-input" data-port-in="${i}" title="Input"></div><div class="cc-vs-port cc-vs-output" data-port-out="${i}" title="Output"></div>
                <div class="cc-vs-node-body">${nodeBody(n,i)}</div>
            </div>`;
        }
        const r=ctx.modal.custom(`
        <div class="cc-vs-editor">
          <header class="cc-vs-header"><div><div class="cc-vs-title">Advanced Command Builder</div><div class="cc-vs-sub">Unity-style visual scripting for NEXORIA commands · connect ports to define execution flow.</div></div><div class="cc-vs-head-actions"><button class="btn btn-ghost btn-small" data-action="undo">↶ Undo</button><button class="btn btn-ghost btn-small" data-action="redo">↷ Redo</button><button class="btn btn-ghost btn-small" data-action="fit">Fit</button><button class="btn btn-ghost btn-small" data-action="exit">Exit</button><button class="btn btn-primary btn-small" data-save-advanced>Save command</button></div></header>
          <div class="cc-vs-layout">
            <aside class="cc-vs-palette"><div class="cc-vs-palette-title">Block Palette</div><input class="search-input" id="cc-vs-search" placeholder="Search nodes…"><div id="cc-vs-palette-list"></div><div class="cc-vs-help"><strong>How to use</strong><span>Drag a node by its header.</span><span>Drag from an output port to an input port to connect.</span><span>Right-click a node to delete it.</span><span>Right-click a wire to remove it.</span><span>Mouse wheel zooms · drag empty space pans.</span><span>Delete removes the selected node or wire.</span></div></aside>
            <main class="cc-vs-workspace" id="cc-vs-workspace"><div class="cc-vs-grid"></div><div class="cc-vs-canvas" id="cc-vs-canvas"><svg id="cc-vs-links"><defs><marker id="cc-vs-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0,0 L0,8 L9,4 z" fill="currentColor"/></marker></defs></svg><div id="cc-vs-nodes"></div></div><div class="cc-vs-zoom">100%</div><div class="cc-vs-status" id="cc-vs-status">Saved</div></main>
          </div>
          <footer class="cc-vs-footer"><div><strong id="cc-vs-command-label">${esc(draft.name||draft.trigger||"New command")}</strong><span id="cc-vs-dirty" class="cc-vs-dirty">Saved</span></div><div><button class="btn btn-ghost btn-small" data-action="cancel">Cancel</button><button class="btn btn-primary btn-small" data-save-advanced>Save command</button></div></footer>
        </div>`,{maxWidth:"100vw",panelClass:"dc-modal-panel-fullscreen"});
        const canvas=r.querySelector("#cc-vs-canvas"), workspace=r.querySelector("#cc-vs-workspace"), links=r.querySelector("#cc-vs-links"), nodeWrap=r.querySelector("#cc-vs-nodes"), palette=r.querySelector("#cc-vs-palette-list");
        function fit(){
            if(!draft.nodes.length)return;
            const minX=Math.min(...draft.nodes.map(n=>n.x)), minY=Math.min(...draft.nodes.map(n=>n.y)), maxX=Math.max(...draft.nodes.map(n=>n.x+260)), maxY=Math.max(...draft.nodes.map(n=>n.y+180));
            const sx=Math.max(.55,Math.min(1.1,(workspace.clientWidth-80)/(maxX-minX+120),(workspace.clientHeight-80)/(maxY-minY+120)));
            draft.zoom=sx; draft.pan={x:40-minX*sx,y:40-minY*sx}; paintTransform();
        }
        function screenPoint(e){const rect=canvas.getBoundingClientRect(); return {x:(e.clientX-rect.left-draft.pan.x)/draft.zoom,y:(e.clientY-rect.top-draft.pan.y)/draft.zoom};}
        function portPoint(el){const rect=canvas.getBoundingClientRect(), pr=el.getBoundingClientRect();return {x:(pr.left+pr.width/2-rect.left-draft.pan.x)/draft.zoom,y:(pr.top+pr.height/2-rect.top-draft.pan.y)/draft.zoom};}
        function paintTransform(){canvas.style.transform=`translate(${draft.pan.x}px,${draft.pan.y}px) scale(${draft.zoom})`; r.querySelector(".cc-vs-zoom").textContent=`${Math.round(draft.zoom*100)}%`;}
        function wirePath(a,b){const dx=Math.max(70,Math.abs(b.x-a.x)*.45);return `M ${a.x} ${a.y} C ${a.x+dx} ${a.y}, ${b.x-dx} ${b.y}, ${b.x} ${b.y}`;}
        function paintLinks(){
            const svg=links, rect=canvas.getBoundingClientRect(); svg.setAttribute("viewBox",`0 0 ${Math.max(1,rect.width/draft.zoom)} ${Math.max(1,rect.height/draft.zoom)}`); svg.innerHTML='<defs><marker id="cc-vs-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0,0 L0,8 L9,4 z" fill="currentColor"/></marker></defs>';
            draft.connections.forEach((c,idx)=>{const fi=draft.nodes.findIndex(n=>n.id===c.from),ti=draft.nodes.findIndex(n=>n.id===c.to);if(fi<0||ti<0)return;const fo=nodeWrap.querySelector(`[data-port-out="${fi}"]`),tiEl=nodeWrap.querySelector(`[data-port-in="${ti}"]`);if(!fo||!tiEl)return;const a=portPoint(fo),b=portPoint(tiEl);const path=document.createElementNS("http://www.w3.org/2000/svg","path");path.dataset.connection=String(idx);path.setAttribute("d",wirePath(a,b));path.setAttribute("class","cc-vs-wire");path.setAttribute("marker-end","url(#cc-vs-arrow)");path.addEventListener("contextmenu",e=>{e.preventDefault();checkpoint();draft.connections.splice(idx,1);paint();});svg.appendChild(path);});
            if(connecting){const p=portPoint(connecting.el);const q=screenPoint(connecting.event);const path=document.createElementNS("http://www.w3.org/2000/svg","path");path.setAttribute("d",wirePath(p,q));path.setAttribute("class","cc-vs-wire-temp");svg.appendChild(path);}
        }
        function paint(){
            nodeWrap.innerHTML=draft.nodes.map(nodeHtml).join("");
            draft.nodes.forEach((n,i)=>{const el=nodeWrap.querySelector(`[data-node="${i}"]`);if(!el)return; if(selected===n.id)el.classList.add("selected");});
            wireNodes(); paintTransform(); requestAnimationFrame(paintLinks);
            r.querySelector("#cc-vs-dirty").textContent=dirty?"Unsaved changes":"Saved";
            r.querySelector("#cc-vs-status").textContent=dirty?`${draft.nodes.length} nodes · unsaved`: `${draft.nodes.length} nodes · saved`;
        }
        function wireNodes(){
            nodeWrap.querySelectorAll("[data-node-content]").forEach(el=>el.addEventListener("input",()=>{draft.nodes[+el.dataset.nodeContent].content=el.value;checkpoint();}));
            nodeWrap.querySelectorAll("[data-node-ms]").forEach(el=>el.addEventListener("input",()=>{draft.nodes[+el.dataset.nodeMs].ms=Math.max(0,Math.min(120000,Number(el.value)||0));checkpoint();}));
            nodeWrap.querySelectorAll("[data-node-role]").forEach(el=>el.addEventListener("input",()=>{draft.nodes[+el.dataset.nodeRole].roleId=el.value.trim();checkpoint();}));
            nodeWrap.querySelectorAll("[data-node-menu]").forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();selected=draft.nodes[+b.dataset.nodeMenu].id;paint();}));
            nodeWrap.querySelectorAll(".cc-vs-node").forEach(el=>{
                const i=+el.dataset.node, head=el.querySelector(".cc-vs-node-head");
                el.addEventListener("click",()=>{selected=draft.nodes[i].id;nodeWrap.querySelectorAll(".cc-vs-node").forEach(x=>x.classList.remove("selected"));el.classList.add("selected");});
                el.addEventListener("contextmenu",e=>{e.preventDefault();if(e.target.closest("textarea,input,button"))return;selected=draft.nodes[i].id;deleteSelected();});
                let dragging=false,sx=0,sy=0,ox=0,oy=0;
                head.addEventListener("pointerdown",e=>{if(e.target.closest("button"))return;dragging=true;selected=draft.nodes[i].id;head.setPointerCapture(e.pointerId);sx=e.clientX;sy=e.clientY;ox=draft.nodes[i].x;oy=draft.nodes[i].y;});
                head.addEventListener("pointermove",e=>{if(!dragging)return;draft.nodes[i].x=Math.max(0,ox+(e.clientX-sx)/draft.zoom);draft.nodes[i].y=Math.max(0,oy+(e.clientY-sy)/draft.zoom);el.style.left=`${draft.nodes[i].x}px`;el.style.top=`${draft.nodes[i].y}px`;paintLinks();});
                head.addEventListener("pointerup",()=>{if(dragging){dragging=false;checkpoint();}});
            });
            nodeWrap.querySelectorAll("[data-port-out]").forEach(port=>port.addEventListener("pointerdown",e=>{e.stopPropagation();connecting={from:+port.dataset.portOut,el:port,event:e};canvas.setPointerCapture?.(e.pointerId);paintLinks();}));
            nodeWrap.querySelectorAll("[data-port-in]").forEach(port=>port.addEventListener("pointerup",e=>{if(!connecting)return;const from=draft.nodes[connecting.from]?.id,to=draft.nodes[+port.dataset.portIn]?.id; if(from&&to&&from!==to&&!draft.connections.some(c=>c.from===from&&c.to===to)){checkpoint();draft.connections.push({from,to});}connecting=null;paint();}));
        }
        function deleteSelected(){if(!selected)return;const i=draft.nodes.findIndex(n=>n.id===selected);if(i<0)return;checkpoint();const id=draft.nodes[i].id;draft.nodes.splice(i,1);draft.connections=draft.connections.filter(c=>c.from!==id&&c.to!==id);selected=null;paint();}
        function addNode(type){checkpoint();const n={id:makeId(),type,content:type==="comment"?"Explain this step…":"",roleId:"",ms:1000,x:80+(draft.nodes.length%3)*300,y:80+Math.floor(draft.nodes.length/3)*210};draft.nodes.push(n);selected=n.id;paint();}
        function paintPalette(query=""){
            const q=query.toLowerCase().trim(); const groups={}; Object.entries(nodeMeta).forEach(([type,m])=>{if(q&&!(`${m.label} ${m.group} ${m.help}`).toLowerCase().includes(q))return;(groups[m.group]??=[]).push([type,m]);});
            palette.innerHTML=Object.entries(groups).map(([g,items])=>`<section><div class="cc-vs-palette-group">${esc(g)}</div>${items.map(([type,m])=>`<button class="cc-vs-palette-item cc-vs-${m.color}" type="button" data-add-node="${type}"><span>${DC.icon(m.icon,16)}</span><span><strong>${esc(m.label)}</strong><small>${esc(m.help)}</small></span><b>+</b></button>`).join("")}</section>`).join("")||`<div class="empty-state" style="padding:15px">No matching nodes.</div>`;
            palette.querySelectorAll("[data-add-node]").forEach(b=>b.addEventListener("click",()=>addNode(b.dataset.addNode)));
        }
        let panning=false,px=0,py=0,panX=0,panY=0;
        workspace.addEventListener("pointerdown",e=>{if(e.target.closest(".cc-vs-node,.cc-vs-palette"))return;panning=true;px=e.clientX;py=e.clientY;panX=draft.pan.x;panY=draft.pan.y;workspace.setPointerCapture(e.pointerId);});
        workspace.addEventListener("pointermove",e=>{if(panning){draft.pan.x=panX+e.clientX-px;draft.pan.y=panY+e.clientY-py;paintTransform();paintLinks();}if(connecting){connecting.event=e;paintLinks();}});
        workspace.addEventListener("pointerup",()=>{if(panning){panning=false;checkpoint();}if(connecting){connecting=null;paintLinks();}});
        workspace.addEventListener("wheel",e=>{e.preventDefault();const before=screenPoint(e);const factor=e.deltaY<0?1.08:.92;draft.zoom=Math.max(.35,Math.min(2.5,draft.zoom*factor));const after=screenPoint(e);draft.pan.x+=(after.x-before.x)*draft.zoom;draft.pan.y+=(after.y-before.y)*draft.zoom;paintTransform();paintLinks();},{passive:false});
        r.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();e.shiftKey?redo():undo();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="y"){e.preventDefault();redo();}else if(e.key==="Delete"&&!e.target.matches("input,textarea")){e.preventDefault();deleteSelected();}else if(e.key==="Escape"&&connecting){connecting=null;paintLinks();}});
        async function save(){
            if(!draft.name.trim()||!draft.trigger.trim()) return ctx.modal.alert("Command name and trigger are required.",{title:"Can't save command"});
            const order=[]; const byId=new Map(draft.nodes.map(n=>[n.id,n])); const indeg=new Map(draft.nodes.map(n=>[n.id,0])); const next=new Map(draft.nodes.map(n=>[n.id,[]]));
            draft.connections.forEach(c=>{if(byId.has(c.from)&&byId.has(c.to)){next.get(c.from).push(c.to);indeg.set(c.to,(indeg.get(c.to)||0)+1);}}); const q=[...indeg.entries()].filter(([,d])=>d===0).map(([id])=>id); while(q.length){const id=q.shift();order.push(id);for(const to of next.get(id)||[]){const d=indeg.get(to)-1;indeg.set(to,d);if(d===0)q.push(to);}}
            const orderedIds=order.length===draft.nodes.length?order:draft.nodes.map(n=>n.id);
            const actions=orderedIds.map(id=>{const n=byId.get(id);return {nodeId:n.id,type:n.type,content:n.content||"",roleId:n.roleId||"",ms:Number(n.ms)||0,position:{x:Math.round(n.x),y:Math.round(n.y)}}});
            const payload={name:draft.name.trim()||draft.trigger.trim(),trigger:draft.trigger.trim(),triggerType:draft.triggerType,scope:draft.scope,description:draft.description,allowedRoles:draft.allowedRoles,cooldownSeconds:draft.cooldownSeconds,cooldownPerUser:draft.cooldownPerUser,embedEnabled:draft.embedEnabled,embedColor:draft.embedColor,variables:draft.variables,categoryId:draft.categoryId,permissionMode:draft.permissionMode,actions,graph:{nodes:draft.nodes.map(n=>({id:n.id,x:Math.round(n.x),y:Math.round(n.y)})),connections:draft.connections,zoom:draft.zoom,pan:draft.pan},userId:getSession()?.user?.id};
            try{r.querySelectorAll("[data-save-advanced]").forEach(b=>{b.disabled=true;b.textContent="Saving…";});if(command)await ctx.api(`/guilds/${ctx.guildId}/custom-commands/${command.id}`,{method:"PUT",body:JSON.stringify(payload)});else await ctx.api(`/guilds/${ctx.guildId}/custom-commands`,{method:"POST",body:JSON.stringify(payload)});dirty=false;await loadCommands(ctx);ctx.modal.close();paintCommandList(ctx,"all","");}catch(e){r.querySelectorAll("[data-save-advanced]").forEach(b=>{b.disabled=false;b.textContent="Save changes"});await ctx.modal.alert(`Couldn't save command: ${e.message}`,{title:"Command save failed"});}
        }
        async function exit(){if(dirty){const ok=await ctx.modal.confirm("You have unsaved visual command changes. Save before exiting?",{title:"Unsaved changes",confirmLabel:"Save",cancelLabel:"Exit without saving",danger:false});if(ok){await save();return;}}ctx.modal.close();}
        r.querySelectorAll("[data-save-advanced]").forEach(b=>b.addEventListener("click",save));
        r.querySelector('[data-action="undo"]').addEventListener("click",undo); r.querySelector('[data-action="redo"]').addEventListener("click",redo); r.querySelector('[data-action="fit"]').addEventListener("click",fit); r.querySelector('[data-action="exit"]').addEventListener("click",exit); r.querySelector('[data-action="cancel"]').addEventListener("click",exit);
        r.querySelector("#cc-vs-search").addEventListener("input",e=>paintPalette(e.target.value));
        r.querySelector(".cc-vs-editor").addEventListener("click",e=>{if(e.target.closest("button"))return;});
        paintPalette(); paint(); requestAnimationFrame(fit);
    }
    function openCommandEditor(ctx, command, creationMode="advanced") {
        const isBasicCreation = creationMode === "basic";
        const isBuiltin = Boolean(command?.builtin);
        const isBuiltinOwner = isBuiltin && state.meta?.viewerRole === "owner";
        const draft = {
            name: command?.name || "",
            trigger: command?.trigger || "",
            triggerType: command?.triggerType || "prefix",
            scope: command?.scope || "prefix",
            description: command?.description || "",
            allowedRoles: command?.allowedRoles ? [...command.allowedRoles] : [],
            cooldownSeconds: command?.cooldownSeconds ?? 0,
            cooldownPerUser: command?.cooldownPerUser ?? true,
            embedEnabled: command?.embedEnabled ?? false,
            embedColor: command?.embedColor || "#8b5cf6",
            actions: command?.actions ? JSON.parse(JSON.stringify(command.actions)) : [{ type: "message", content: "" }],
            variables: command?.variables ? { ...command.variables } : {},
            categoryId: command?.categoryId || "general",
            permissionMode: command?.permissionMode || "everyone",
        };
        let dirty = false;
        let modalRoot = null;
        function markDirty() { if (!dirty) {
            dirty = true;
            const s = modalRoot?.querySelector("#cc-ed-save");
            if (s)
                s.innerHTML = `${command ? "Save changes" : "Create command"} <span class="unsaved-dot"></span>`;
        } }
        function render() {
            const bodyHtml = `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--panel-border)">
          <h3 style="font-size:15px;font-weight:700">${isBuiltin ? `View "${esc(command.name)}"` : command ? `Edit "${esc(command.name)}"` : "New command"}</h3>
          <div style="display:flex;align-items:center;gap:10px">
            <span class="field-hint" id="cc-ed-feedback" style="margin:0"></span>
            ${isBuiltinOwner ? `<button class="btn btn-primary btn-small" id="cc-ed-save">Save permissions</button>` : (!isBuiltin ? `<button class="btn btn-primary btn-small" id="cc-ed-save">${command ? "Save changes" : "Create command"}</button>` : "")}
            <button class="btn btn-ghost btn-small" id="cc-ed-cancel">${isBuiltin ? "Close" : "Cancel"}</button>
          </div>
        </div>
        <div style="padding:20px">
          ${creationMode === "advanced" && window.NEXORIAAdvancedCommandEditor ? `<div class="cc-advanced-plan-note"><strong>Advanced builder</strong><span>${esc(window.NEXORIAAdvancedCommandEditor.getHelp())}</span></div>` : ""}
          ${isBuiltin ? `<div class="field-hint" style="margin-bottom:14px">${DC.icon("lock")} ${isBuiltinOwner ? "Only the server owner can change built-in command permissions and categories." : "Built-in command permission settings are visible only to the server owner."}</div>` : ""}
          <div class="settings-section-block">
            <h4>${DC.icon("info-circle")} Basics</h4>
            <div class="settings-section-hint">Name, trigger, and where it can be used.</div>
            <div class="field"><label>Command Name</label><input type="text" id="cc-name" value="${esc(draft.name)}" maxlength="80" placeholder="e.g. Welcome Ping" ${isBuiltin ? "disabled" : ""}></div>
            <div class="field-row-inline" style="gap:12px;margin-top:14px;align-items:flex-end">
              <div class="field" style="flex:1;margin-bottom:0">
                <label>Trigger type</label>
                <div id="cc-triggertype"></div>
              </div>
              <div class="field" style="flex:1;margin-bottom:0">
                <label>Trigger${draft.triggerType === "prefix" ? " (e.g. ?, !, as!)" : " (slash command name)"}</label>
                <input type="text" id="cc-trigger" value="${esc(draft.trigger)}" maxlength="32" ${isBuiltin ? "disabled" : ""} placeholder="${draft.triggerType === "prefix" ? "?greet" : "greet"}">
                ${draft.triggerType === "slash" && !isBuiltin ? `<div class="field-hint">Lowercase letters, numbers, and hyphens only.</div>` : ""}
              </div>
              <div class="field" style="flex:1;margin-bottom:0">
                <label>Scope</label>
                <div id="cc-scope"></div>
              </div>
            </div>
            <div class="field" style="margin-top:14px"><label>Category</label><div id="cc-category">${isBuiltin && !isBuiltinOwner ? `<span class="field-hint">Owner-only setting</span>` : ""}</div></div>
            <div class="field" style="margin-top:14px"><label>Description</label><textarea id="cc-desc" placeholder="What this command does" style="min-height:44px" ${isBuiltin ? "disabled" : ""}>${esc(draft.description)}</textarea></div>
          </div>

          <div class="settings-section-block">
            <h4>${DC.icon("shield-lock")} Permissions & Cooldown</h4>
            <div class="settings-section-hint">Who can run this command, and how often.</div>
            <label style="font-size:12px;font-weight:600;color:var(--text-dim);display:block;margin-bottom:6px">Who can use this command</label><div id="cc-permission-mode">${isBuiltin && !isBuiltinOwner ? `<span class="field-hint">Owner-only setting</span>` : ""}</div><label style="font-size:12px;font-weight:600;color:var(--text-dim);display:block;margin:12px 0 6px">Allowed roles</label>
            <div id="cc-roles"></div>
            <div class="field-row-inline" style="gap:12px;margin-top:14px;align-items:flex-end">
              <div class="field" style="width:140px;margin-bottom:0"><label>Cooldown (seconds)</label><input type="number" id="cc-cooldown" min="0" value="${draft.cooldownSeconds}" ${isBuiltin ? "disabled" : ""}></div>
              <div class="field-row-inline" style="flex:1;margin-bottom:0">
                <div><div class="config-row-label">Per-user cooldown</div><div class="field-hint" style="margin-top:0">Off applies the cooldown server-wide instead</div></div>
                <button class="toggle ${draft.cooldownPerUser ? "on" : ""}" id="cc-cooldown-peruser" aria-label="Toggle per-user cooldown"></button>
              </div>
            </div>
          </div>

          <div class="settings-section-block" style="${isBasicCreation ? "display:none" : ""}">
            <h4>${DC.icon("layout-board")} Reply Format</h4>
            <div class="settings-section-hint">Whether the message action replies as an embed.</div>
            <div class="field-row-inline">
              <div><div class="config-row-label">Reply as embed</div><div class="field-hint" style="margin-top:0">Off sends plain text instead</div></div>
              <button class="toggle ${draft.embedEnabled ? "on" : ""}" id="cc-embed-toggle" aria-label="Toggle embed reply"></button>
            </div>
            <div class="field" style="margin-top:12px;max-width:220px"><label>Embed color</label><div id="cc-embed-color"></div></div>
          </div>

          <div class="settings-section-block">
            <div class="field-row-inline" style="align-items:flex-start">
              <div><h4>${DC.icon("bolt")} Actions</h4><div class="settings-section-hint" style="margin-top:2px">What happens when the command is triggered — runs in order.</div></div>
              ${isBuiltin ? "" : `<button class="btn btn-ghost btn-small" id="cc-add-action">${DC.icon("plus")} Add action</button>`}
            </div>
            <div id="cc-actions-list"></div>
          </div>

          <div class="settings-section-block" style="${isBasicCreation ? "display:none" : ""}">
            <div class="field-row-inline" style="align-items:flex-start">
              <div><h4>${DC.icon("variable")} Variables</h4><div class="settings-section-hint" style="margin-top:2px">Reference a variable inside a message action's text. Insert one from the picker, or type it manually.</div></div>
              ${isBuiltin ? "" : `<button class="btn btn-ghost btn-small" id="cc-add-variable">${DC.icon("plus")} Add custom variable</button>`}
            </div>
            <div class="settings-section-hint" style="margin-bottom:10px">Built-in: ${BUILTIN_VARS.map(v => `<code class="cc-command-trigger-chip" title="${esc(v.label)}">{${v.key}}</code>`).join(" ")}</div>
            <div id="cc-variables-list"></div>
          </div>
        </div>`;
            modalRoot = ctx.modal.custom(bodyHtml, { maxWidth: "760px" });
            modalRoot.querySelector("#cc-ed-cancel").addEventListener("click", async () => {
                if (dirty && !(await ctx.modal.confirm("Discard unsaved changes?", { title: "Discard changes?", confirmLabel: "Discard", danger: true })))
                    return;
                ctx.modal.close();
            });
            modalRoot.querySelector("#cc-ed-save")?.addEventListener("click", saveCommand);
            if (!isBuiltin) {
                modalRoot.querySelector("#cc-name").addEventListener("input", (e) => { draft.name = e.target.value; markDirty(); });
                modalRoot.querySelector("#cc-trigger").addEventListener("input", (e) => { draft.trigger = e.target.value; markDirty(); });
                modalRoot.querySelector("#cc-desc").addEventListener("input", (e) => { draft.description = e.target.value; markDirty(); });
                modalRoot.querySelector("#cc-cooldown").addEventListener("input", (e) => { draft.cooldownSeconds = Number(e.target.value) || 0; markDirty(); });
                modalRoot.querySelector("#cc-cooldown-peruser").addEventListener("click", (e) => { draft.cooldownPerUser = !draft.cooldownPerUser; e.target.classList.toggle("on"); markDirty(); });
                modalRoot.querySelector("#cc-embed-toggle").addEventListener("click", (e) => { draft.embedEnabled = !draft.embedEnabled; e.target.classList.toggle("on"); markDirty(); });
            }
            const triggerTypeDrop = window.DC.createDropdown(modalRoot.querySelector("#cc-triggertype"), {
                options: [{ value: "prefix", label: "Prefix (chat message)" }, { value: "slash", label: "Slash command" }],
                value: draft.triggerType,
            });
            if (!isBuiltin)
                triggerTypeDrop.onChange(val => { draft.triggerType = val; if (draft.scope !== "both")
                    draft.scope = val; markDirty(); render(); });
            const scopeDrop = window.DC.createDropdown(modalRoot.querySelector("#cc-scope"), {
                options: [
                    { value: draft.triggerType, label: draft.triggerType === "prefix" ? "Prefix only" : "Slash only" },
                    { value: "both", label: "Both (needs both triggers set up)" },
                ],
                value: draft.scope,
            });
            if (!isBuiltin)
                scopeDrop.onChange(val => { draft.scope = val; markDirty(); });
            if (!isBuiltin || isBuiltinOwner) {
                window.DC.createDropdown(modalRoot.querySelector("#cc-category"), { options: state.categories.map(c => ({ value: c.id, label: c.name + (c.enabled === false ? " (disabled)" : "") })), value: draft.categoryId, onChange: vals => { draft.categoryId = vals; markDirty(); } });
                window.DC.createDropdown(modalRoot.querySelector("#cc-permission-mode"), { options: [{ value: "everyone", label: "Everyone" }, { value: "administrators", label: "Administrators only" }, { value: "roles", label: "Selected roles" }], value: draft.permissionMode, onChange: vals => { draft.permissionMode = vals; markDirty(); } });
            }
            const roleOptions = () => (state.meta?.roles || []).map(r => ({ value: r.id, label: r.name, icon: `<span class="role-dot" style="background:${r.color || "#99aab5"}"></span>` }));
            window.DC.createDropdown(modalRoot.querySelector("#cc-roles"), {
                options: roleOptions(), values: draft.allowedRoles, multi: true, searchable: true, placeholder: "Everyone (no restriction)",
                onChange: (vals) => { draft.allowedRoles = vals; markDirty(); },
            });
            const embedColorDrop = window.DC.createDropdown(modalRoot.querySelector("#cc-embed-color"), {
                options: [
                    { value: "#8b5cf6", label: "Violet", icon: `<span class="role-dot" style="background:#8b5cf6"></span>` },
                    { value: "#6ee7b7", label: "Green", icon: `<span class="role-dot" style="background:#6ee7b7"></span>` },
                    { value: "#fbbf24", label: "Amber", icon: `<span class="role-dot" style="background:#fbbf24"></span>` },
                    { value: "#e94560", label: "Red", icon: `<span class="role-dot" style="background:#e94560"></span>` },
                    { value: "#7dd3fc", label: "Sky", icon: `<span class="role-dot" style="background:#7dd3fc"></span>` },
                    { value: "#f5b942", label: "Gold", icon: `<span class="role-dot" style="background:#f5b942"></span>` },
                ],
                value: draft.embedColor,
            });
            if (!isBuiltin)
                embedColorDrop.onChange(val => { draft.embedColor = val; markDirty(); });
            if (!isBuiltin) {
                modalRoot.querySelector("#cc-add-action").addEventListener("click", () => { draft.actions.push({ type: "message", content: "" }); markDirty(); renderActions(); });
                modalRoot.querySelector("#cc-add-variable").addEventListener("click", async () => {
                    const key = await ctx.modal.prompt("Variable key (letters, numbers, underscore only):", { title: "Add variable" });
                    if (!key)
                        return;
                    const clean = key.replace(/[^a-zA-Z0-9_]/g, "");
                    if (!clean)
                        return;
                    draft.variables[clean] = "";
                    markDirty();
                    renderVariables();
                });
            }
            renderActions();
            renderVariables();
        }
        function openVariablePicker(ctx2, textarea) {
            const roles = state.meta?.roles || [];
            const members = state.meta?.members || [];
            const bodyHtml = `
        <div class="dc-modal-header"><h3>Insert a variable</h3></div>
        <div style="padding:14px 20px">
          <div class="field" style="margin-bottom:14px">
            <label>Built-in</label>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${BUILTIN_VARS.map(v => `<button class="btn btn-ghost btn-small" data-insert-builtin="${esc(v.key)}" title="${esc(v.label)}">{${esc(v.key)}}</button>`).join("")}
            </div>
          </div>
          <div class="field" style="margin-bottom:14px">
            <label>Ping a role</label>
            <input type="text" class="dropdown-panel-search" id="cc-var-role-search" placeholder="Search roles…" style="margin-bottom:6px">
            <div id="cc-var-role-list" style="max-height:160px;overflow-y:auto"></div>
          </div>
          <div class="field" style="margin-bottom:0">
            <label>Ping a user</label>
            <input type="text" class="dropdown-panel-search" id="cc-var-user-search" placeholder="Search members…" style="margin-bottom:6px">
            <div id="cc-var-user-list" style="max-height:160px;overflow-y:auto"></div>
          </div>
        </div>
        <div class="dc-modal-footer"><button class="btn btn-ghost btn-small" id="cc-var-close">Close</button></div>`;
            const r = ctx2.modal.custom(bodyHtml, { maxWidth: "420px" });
            r.querySelector("#cc-var-close").addEventListener("click", ctx2.modal.close);
            function insertAndClose(token) {
                const start = textarea.selectionStart ?? textarea.value.length;
                const end = textarea.selectionEnd ?? textarea.value.length;
                textarea.value = textarea.value.slice(0, start) + token + textarea.value.slice(end);
                textarea.dispatchEvent(new Event("input", { bubbles: true }));
                ctx2.modal.close();
                textarea.focus();
            }
            r.querySelectorAll("[data-insert-builtin]").forEach(btn => btn.addEventListener("click", () => insertAndClose(`{${btn.dataset.insertBuiltin}}`)));
            function paintRoles(query) {
                const q = (query || "").toLowerCase();
                const filtered = roles.filter(role => role.name.toLowerCase().includes(q));
                r.querySelector("#cc-var-role-list").innerHTML = filtered.map(role => `<div class="dropdown-panel-item" data-role-id="${role.id}"><span class="role-dot" style="background:${role.color}"></span> ${esc(role.name)}</div>`).join("") || `<div class="dropdown-panel-empty">No matches</div>`;
                r.querySelectorAll("[data-role-id]").forEach(item => item.addEventListener("click", () => insertAndClose(`{@role:${item.dataset.roleId}}`)));
            }
            function paintMembers(query) {
                const q = (query || "").toLowerCase();
                const filtered = members.filter(m => m.displayName.toLowerCase().includes(q) || m.name.toLowerCase().includes(q));
                r.querySelector("#cc-var-user-list").innerHTML = filtered.slice(0, 50).map(m => `<div class="dropdown-panel-item" data-user-id="${m.id}" style="display:flex;align-items:center;gap:8px"><img src="${m.avatarUrl || ""}" style="width:20px;height:20px;border-radius:50%" alt=""> ${esc(m.displayName)}</div>`).join("") || `<div class="dropdown-panel-empty">No matches</div>`;
                r.querySelectorAll("[data-user-id]").forEach(item => item.addEventListener("click", () => insertAndClose(`{@user:${item.dataset.userId}}`)));
            }
            paintRoles("");
            paintMembers("");
            r.querySelector("#cc-var-role-search").addEventListener("input", (e) => paintRoles(e.target.value));
            r.querySelector("#cc-var-user-search").addEventListener("input", (e) => paintMembers(e.target.value));
        }
        function renderActions() {
            const wrap = modalRoot.querySelector("#cc-actions-list");
            if (draft.actions.length === 0) {
                wrap.innerHTML = `<div class="empty-state" style="padding:16px">No actions yet.</div>`;
                return;
            }
            wrap.innerHTML = draft.actions.map((a, i) => `
        <div class="settings-section-block ${a.type === "comment" ? "cc-comment-node" : ""}" style="background:var(--panel);margin-top:10px">
          <div class="field-row-inline" style="align-items:flex-start;margin-bottom:10px">
            <div style="flex:1"><div id="cc-action-type-${i}"></div></div>
            ${isBuiltin ? "" : `<button class="icon-btn icon-btn-emoji danger" data-remove-action="${i}" title="Remove action" style="margin-left:10px"></button>`}
          </div>
          ${a.type === "message"
                ? `<div class="field" style="margin-bottom:0">
                 <div class="field-row-inline" style="margin-bottom:6px">
                   <label style="margin-bottom:0">Message content</label>
                   ${isBuiltin ? "" : `<button class="btn btn-ghost btn-small" data-insert-var="${i}" type="button">${DC.icon("variable")} Insert variable</button>`}
                 </div>
                 <textarea data-action-content="${i}" placeholder="e.g. {user.mention} welcome!" style="min-height:70px" ${isBuiltin ? "disabled" : ""}>${esc(a.content || "")}</textarea>
                 <div class="field-hint">Use the picker to insert {@role}, {@user}, or a built-in variable — or type &lt;@user id&gt; / &lt;@&amp;role id&gt; directly.</div>
               </div>`
                : a.type === "comment"
                ? `<div class="field" style="margin-bottom:0"><label>Comment / note</label><textarea data-action-comment="${i}" placeholder="Explain what this part of the command does…" style="min-height:70px">${esc(a.content || "")}</textarea><div class="field-hint">Notes are shown only in the visual command builder and are not sent to Discord.</div></div>`
                : a.type === "delay"
                ? `<div class="field" style="margin-bottom:0"><label>Wait (milliseconds)</label><input type="number" min="0" step="50" data-action-ms="${i}" value="${Number(a.ms || 0)}"><div class="field-hint">Pauses execution before the next action.</div></div>`
                : `<div class="field" style="margin-bottom:0"><label>Role</label><div id="cc-action-role-${i}"></div></div>`}
        </div>`).join("");
            draft.actions.forEach((a, i) => {
                const typeDrop = window.DC.createDropdown(modalRoot.querySelector(`#cc-action-type-${i}`), { options: ACTION_TYPES, value: a.type });
                if (!isBuiltin)
                    typeDrop.onChange(val => { draft.actions[i].type = val; markDirty(); renderActions(); });
                if (a.type === "message") {
                    const textarea = modalRoot.querySelector(`[data-action-content="${i}"]`);
                    textarea.addEventListener("input", (e) => { draft.actions[i].content = e.target.value; markDirty(); });
                    if (!isBuiltin && window.DC.attachVariableEditor)
                        window.DC.attachVariableEditor(textarea);
                    const insertBtn = modalRoot.querySelector(`[data-insert-var="${i}"]`);
                    if (insertBtn)
                        insertBtn.addEventListener("click", () => openVariablePicker(ctx, textarea));
                }
                else if(a.type === "comment"){
                    const ta=modalRoot.querySelector(`[data-action-comment="${i}"]`);
                    ta?.addEventListener("input",e=>{draft.actions[i].content=e.target.value;markDirty();});
                } else if(a.type === "delay"){
                    const ms=modalRoot.querySelector(`[data-action-ms="${i}"]`);
                    ms?.addEventListener("input",e=>{draft.actions[i].ms=Math.max(0,Number(e.target.value)||0);markDirty();});
                } else {
                    const roleOpts = (state.meta?.roles || []).map(r => ({ value: r.id, label: r.name, icon: `<span class="role-dot" style="background:${r.color || "#99aab5"}"></span>` }));
                    const roleDrop = window.DC.createDropdown(modalRoot.querySelector(`#cc-action-role-${i}`), { options: roleOpts, value: a.roleId || "", placeholder: "Select a role…" });
                    if (!isBuiltin)
                        roleDrop.onChange(val => { draft.actions[i].roleId = val; markDirty(); });
                }
            });
            if (!isBuiltin)
                wrap.querySelectorAll("[data-remove-action]").forEach(btn => btn.addEventListener("click", () => { draft.actions.splice(Number(btn.dataset.removeAction), 1); markDirty(); renderActions(); }));
        }
        function renderVariables() {
            const wrap = modalRoot.querySelector("#cc-variables-list");
            const keys = Object.keys(draft.variables);
            if (keys.length === 0) {
                wrap.innerHTML = `<div class="empty-state" style="padding:16px">No custom variables yet.</div>`;
                return;
            }
            wrap.innerHTML = keys.map(k => `
        <div class="field-row-inline" style="margin-top:10px;align-items:center">
          <code class="cc-command-trigger-chip" style="flex-shrink:0">{var.${esc(k)}}</code>
          <input type="text" data-var-key="${esc(k)}" value="${esc(draft.variables[k])}" placeholder="Value" style="flex:1" ${isBuiltin ? "disabled" : ""}>
          ${isBuiltin ? "" : `<button class="icon-btn danger" data-remove-var="${esc(k)}" title="Remove variable">${DC.icon("trash")}</button>`}
        </div>`).join("");
            if (!isBuiltin) {
                wrap.querySelectorAll("[data-var-key]").forEach(inp => inp.addEventListener("input", (e) => { draft.variables[e.target.dataset.varKey] = e.target.value; markDirty(); }));
                wrap.querySelectorAll("[data-remove-var]").forEach(btn => btn.addEventListener("click", () => { delete draft.variables[btn.dataset.removeVar]; markDirty(); renderVariables(); }));
            }
        }
        async function saveCommand() {
            const btn = modalRoot.querySelector("#cc-ed-save");
            const feedback = modalRoot.querySelector("#cc-ed-feedback");
            if (!draft.trigger.trim()) {
                feedback.textContent = "Trigger is required.";
                feedback.style.color = "var(--red)";
                return;
            }
            const needsSlashName = draft.triggerType === "slash" || draft.scope === "both";
            if (needsSlashName && !/^[-_a-z0-9]{1,32}$/.test(draft.trigger)) {
                feedback.textContent = "Slash triggers can only use lowercase letters, numbers, hyphens, and underscores.";
                feedback.style.color = "var(--red)";
                return;
            }
            btn.textContent = "Saving…";
            const payload = { ...draft, name: draft.name || draft.trigger, userId: getSession()?.user?.id };
            try {
                if (command)
                    await ctx.api(`/guilds/${ctx.guildId}/custom-commands/${command.id}`, { method: "PUT", body: JSON.stringify(payload) });
                else
                    await ctx.api(`/guilds/${ctx.guildId}/custom-commands`, { method: "POST", body: JSON.stringify(payload) });
                await loadCommands(ctx);
                ctx.modal.close();
                paintCommandList(ctx, "all", "");
                document.querySelectorAll("[data-cf]").forEach(c => c.classList.toggle("active", c.dataset.cf === "all"));
            }
            catch (e) {
                feedback.textContent = `Failed: ${e.message}`;
                feedback.style.color = "var(--red)";
                btn.innerHTML = command ? "Save changes" : "Create command";
            }
        }
        render();
    }
    window.DC.registerModule({
        id: "custom-commands",
        label: "Custom Commands",
        render(root, ctx) {
            state.commands = [];
            state.meta = null;
            renderList(root, ctx);
        },
    });
})();
