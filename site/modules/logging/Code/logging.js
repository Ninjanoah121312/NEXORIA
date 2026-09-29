// logging.js
(function () {
    const state = { types: null, settings: null, ignore: null, meta: null, botUserId: null };
    function esc(s) { return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
    function loading(msg) { return `<div class="loading-wrap"><div class="spinner"></div><div>${msg || "Loading…"}</div></div>`; }
    const CATEGORIES = [
        { id: "bot", label: "Bot", icon: "server", types: [
                { key: "botStartup", label: "Bot Started" },
                { key: "botShutdown", label: "Bot Shutdown" },
                { key: "guildAdded", label: "Bot Added to Server" },
                { key: "guildRemoved", label: "Bot Removed from Server" },
                { key: "downtime", label: "Bot Downtime" },
            ] },
        { id: "custom-commands", label: "Custom Commands", icon: "terminal-2", types: [
                { key: "customCommandUsed", label: "Custom Command Used" },
            ] },
        { id: "applications", label: "Applications", icon: "apps", types: [
                { key: "applicationCommandPermissionsUpdate", label: "Command Permissions Update" },
            ] },
        { id: "boosts", label: "Boosts", icon: "rocket", types: [
                { key: "boostAdded", label: "Server Boost Added" },
                { key: "boostRemoved", label: "Server Boost Removed" },
                { key: "boostLevelUp", label: "Boost Level Up" },
                { key: "boostLevelDown", label: "Boost Level Down" },
            ] },
        { id: "channels", label: "Channels", icon: "hash", types: [
                { key: "channelCreate", label: "Channel Create" },
                { key: "channelDelete", label: "Channel Delete" },
                { key: "channelUpdate", label: "Channel Update" },
                { key: "channelOverwriteCreate", label: "Channel Permission Overwrite Create" },
                { key: "channelOverwriteDelete", label: "Channel Permission Overwrite Delete" },
                { key: "channelOverwriteUpdate", label: "Channel Permission Overwrite Update" },
            ] },
        { id: "automod", label: "Discord AutoMod", icon: "shield-check", types: [
                { key: "automodRuleCreate", label: "AutoMod Rule Create" },
                { key: "automodRuleDelete", label: "AutoMod Rule Delete" },
                { key: "automodRuleUpdate", label: "AutoMod Rule Update" },
                { key: "automodBlockedMessage", label: "AutoMod Blocked Message" },
            ] },
        { id: "emojis", label: "Emojis", icon: "mood-smile", types: [
                { key: "emojiCreate", label: "Emoji Create" },
                { key: "emojiDelete", label: "Emoji Delete" },
                { key: "emojiUpdate", label: "Emoji Update" },
            ] },
        { id: "events", label: "Events", icon: "calendar-event", types: [
                { key: "scheduledEventCreate", label: "Scheduled Event Create" },
                { key: "scheduledEventDelete", label: "Scheduled Event Delete" },
                { key: "scheduledEventUpdate", label: "Scheduled Event Update" },
            ] },
        { id: "invites", label: "Invites", icon: "link", types: [
                { key: "inviteCreate", label: "Invite Create" },
                { key: "inviteDelete", label: "Invite Delete" },
            ] },
        { id: "messages", label: "Messages", icon: "message", types: [
                { key: "messageDelete", label: "Message Delete" },
                { key: "messageDeleteBulk", label: "Message Bulk Delete" },
                { key: "messageUpdate", label: "Message Update" },
            ] },
        { id: "polls", label: "Polls", icon: "chart-bar", types: [
                { key: "pollCreate", label: "Poll Create" },
                { key: "pollDelete", label: "Poll Delete" },
                { key: "pollVoteAdd", label: "Poll Vote Add" },
                { key: "pollVoteRemove", label: "Poll Vote Remove" },
            ] },
        { id: "roles", label: "Roles", icon: "shield", types: [
                { key: "roleCreate", label: "Role Create" },
                { key: "roleDelete", label: "Role Delete" },
                { key: "roleUpdate", label: "Role Update" },
            ] },
        { id: "stage", label: "Stage", icon: "microphone-2", types: [
                { key: "stageInstanceCreate", label: "Stage Instance Create" },
                { key: "stageInstanceDelete", label: "Stage Instance Delete" },
                { key: "stageInstanceUpdate", label: "Stage Instance Update" },
            ] },
        { id: "server", label: "Server", icon: "server-2", types: [
                { key: "guildUpdate", label: "Server Update" },
            ] },
        { id: "stickers", label: "Stickers", icon: "sticker", types: [
                { key: "stickerCreate", label: "Sticker Create" },
                { key: "stickerDelete", label: "Sticker Delete" },
                { key: "stickerUpdate", label: "Sticker Update" },
            ] },
        { id: "soundboard", label: "Soundboard", icon: "volume", types: [
                { key: "soundboardSoundCreate", label: "Soundboard Sound Create" },
                { key: "soundboardSoundDelete", label: "Soundboard Sound Delete" },
                { key: "soundboardSoundUpdate", label: "Soundboard Sound Update" },
            ] },
        { id: "threads", label: "Threads", icon: "messages", types: [
                { key: "threadCreate", label: "Thread Create" },
                { key: "threadDelete", label: "Thread Delete" },
                { key: "threadUpdate", label: "Thread Update" },
            ] },
        { id: "users", label: "Users", icon: "user", types: [
                { key: "memberJoin", label: "Member Join" },
                { key: "memberLeave", label: "Member Leave" },
                { key: "memberNicknameUpdate", label: "Nickname Update" },
                { key: "memberRolesUpdate", label: "Member Roles Update" },
                { key: "memberTimeout", label: "Member Timeout" },
                { key: "userAvatarUpdate", label: "User Avatar Update" },
                { key: "userUsernameUpdate", label: "Username Update" },
            ] },
        { id: "voice", label: "Voice", icon: "headphones", types: [
                { key: "voiceChannelJoin", label: "Voice Channel Join" },
                { key: "voiceChannelLeave", label: "Voice Channel Leave" },
                { key: "voiceChannelMove", label: "Voice Channel Move" },
                { key: "voiceStateUpdate", label: "Voice State Update (mute/deafen)" },
            ] },
        { id: "webhooks", label: "Webhooks", icon: "webhook", types: [
                { key: "webhookCreate", label: "Webhook Create" },
                { key: "webhookDelete", label: "Webhook Delete" },
                { key: "webhookUpdate", label: "Webhook Update" },
            ] },
        { id: "moderation", label: "Moderation", icon: "gavel", types: [
                { key: "memberBanAdd", label: "Member Ban" },
                { key: "memberBanRemove", label: "Member Unban" },
                { key: "memberKick", label: "Member Kick" },
                { key: "memberWarn", label: "Member Warn" },
            ] },
    ];
    const ALL_TYPES = CATEGORIES.flatMap(c => c.types.map(t => ({ ...t, categoryId: c.id, categoryLabel: c.label })));
    function findType(key) { return ALL_TYPES.find(t => t.key === key); }
    async function ensureMeta(ctx) {
        if (state.meta)
            return state.meta;
        try {
            state.meta = await ctx.api(`/guilds/${ctx.guildId}/meta`);
        }
        catch {
            state.meta = { channels: [], categories: [], roles: [] };
        }
        return state.meta;
    }
    async function loadLogging(ctx) {
        try {
            const d = await ctx.api(`/guilds/${ctx.guildId}/logging`);
            state.types = d.types || {};
            state.settings = d.settings || {};
            state.ignore = d.ignore || { channels: [], roles: [], users: [] };
            state.botUserId = d.botUserId || null;
        }
        catch {
            state.types = {};
            state.settings = {};
            state.ignore = { channels: [], roles: [], users: [] };
            state.botUserId = null;
        }
    }
    function renderShell(root, ctx, activeTab) {
        root.innerHTML = `
      <div class="dash-header">
        <div><h1>${DC.icon("notebook")} Logging</h1><p>Send a log message to a channel whenever something happens in your server.</p></div>
      </div>
      <div class="lg-tabbar">
        <button class="lg-tab ${activeTab === "types" ? "active" : ""}" data-lg-tab="types">${DC.icon("category-2", 15)} Types</button>
        <button class="lg-tab ${activeTab === "settings" ? "active" : ""}" data-lg-tab="settings">${DC.icon("settings", 15)} Settings</button>
      </div>
      <div id="lg-body">${loading()}</div>`;
        root.querySelectorAll("[data-lg-tab]").forEach(el => el.addEventListener("click", () => {
            ctx.navigateToTab?.(el.dataset.lgTab);
            renderTab(root, ctx, el.dataset.lgTab);
        }));
        return document.getElementById("lg-body");
    }
    function renderTab(root, ctx, tabId) {
        const body = renderShell(root, ctx, tabId);
        if (tabId === "settings")
            renderSettingsTab(body, ctx);
        else
            renderTypesTab(body, ctx);
    }
    async function renderTypesTab(body, ctx) {
        body.innerHTML = loading();
        await ensureMeta(ctx);
        await loadLogging(ctx);
        paintTypesTab(body, ctx);
    }
    function channelLabelFor(channelId) {
        if (!channelId)
            return null;
        const ch = (state.meta?.channels || []).find(c => c.id === channelId);
        return ch ? ch.name : channelId;
    }
    function paintTypesTab(body, ctx) {
        let query = "";
        let massEdit = false;
        const selected = new Set();
        const openCats = new Set();
        function renderShell() {
            body.innerHTML = `
        <div class="lg-toolbar">
          <input type="text" class="search-input" id="lg-search" placeholder="Search for types" value="${esc(query)}" style="flex:1;max-width:360px">
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-small" id="lg-set-all">${DC.icon("channel")} Set channel for all types</button>
            <button class="btn btn-ghost btn-small" id="lg-remove-all">${DC.icon("x")} Remove channel for all types</button>
            <button class="btn btn-ghost btn-small" id="lg-mass-toggle">${DC.icon("category-2", 14)} Mass edit</button>
          </div>
        </div>
        <div id="lg-mass-bar-slot"></div>
        <div id="lg-categories"></div>`;
            const searchInput = document.getElementById("lg-search");
            searchInput.addEventListener("input", (e) => { query = e.target.value; renderList(); });
            document.getElementById("lg-set-all")?.addEventListener("click", () => openChannelPicker(ctx, {
                title: "Set channel for all types",
                onPick: (channelId) => bulkSetChannel(ctx, ALL_TYPES.map(t => t.key), channelId).then(renderList),
            }));
            document.getElementById("lg-remove-all")?.addEventListener("click", async () => {
                const ok = await ctx.modal.confirm("This removes the log channel from every type in every category.", { title: "Remove channel for all types", confirmLabel: "Remove all", danger: true });
                if (!ok)
                    return;
                await bulkSetChannel(ctx, ALL_TYPES.map(t => t.key), null);
                renderList();
            });
            document.getElementById("lg-mass-toggle")?.addEventListener("click", () => { massEdit = !massEdit; if (!massEdit)
                selected.clear(); renderMassBar(); renderList(); });
            renderMassBar();
            renderList();
        }
        function renderMassBar() {
            const toggleBtn = document.getElementById("lg-mass-toggle");
            if (toggleBtn) {
                toggleBtn.innerHTML = `${DC.icon(massEdit ? "check" : "category-2", 14)} ${massEdit ? "Done" : "Mass edit"}`;
                toggleBtn.className = `btn ${massEdit ? "btn-primary" : "btn-ghost"} btn-small`;
            }
            const slot = document.getElementById("lg-mass-bar-slot");
            if (!slot)
                return;
            slot.innerHTML = massEdit ? `
          <div class="lg-mass-bar">
            <span id="lg-mass-count">${selected.size} type${selected.size === 1 ? "" : "s"} selected</span>
            <span class="lg-mass-bar-actions">
              <button class="btn btn-ghost btn-small" id="lg-mass-set">${DC.icon("channel")} Set channel</button>
              <button class="btn btn-ghost btn-small" id="lg-mass-remove">${DC.icon("x")} Remove channel</button>
            </span>
          </div>` : "";
            if (massEdit) {
                document.getElementById("lg-mass-set")?.addEventListener("click", () => {
                    if (selected.size === 0)
                        return;
                    openChannelPicker(ctx, {
                        title: `Set channel for ${selected.size} type${selected.size === 1 ? "" : "s"}`,
                        onPick: (channelId) => bulkSetChannel(ctx, [...selected], channelId).then(() => { selected.clear(); renderMassBar(); renderList(); }),
                    });
                });
                document.getElementById("lg-mass-remove")?.addEventListener("click", async () => {
                    if (selected.size === 0)
                        return;
                    const ok = await ctx.modal.confirm(`Remove the log channel from ${selected.size} selected type${selected.size === 1 ? "" : "s"}?`, { title: "Remove channel", confirmLabel: "Remove", danger: true });
                    if (!ok)
                        return;
                    await bulkSetChannel(ctx, [...selected], null);
                    selected.clear();
                    renderMassBar();
                    renderList();
                });
            }
        }
        function renderList() {
            const q = query.toLowerCase();
            const visibleCategories = CATEGORIES
                .map(cat => ({ ...cat, types: cat.types.filter(t => !q || t.label.toLowerCase().includes(q) || cat.label.toLowerCase().includes(q)) }))
                .filter(cat => cat.types.length > 0);
            const catsEl = document.getElementById("lg-categories");
            catsEl.innerHTML = visibleCategories.map(cat => renderCategoryHtml(cat, massEdit, selected, q ? true : openCats.has(cat.id))).join("")
                || `<div class="empty-state">${DC.icon("search-off", 28)}No types match.</div>`;
            wireCategoryEvents(catsEl, ctx, massEdit, selected, openCats, () => { renderMassBar(); renderList(); });
        }
        renderShell();
    }
    function renderCategoryHtml(cat, massEdit, selected, open) {
        return `
      <div class="lg-category" data-lg-cat="${cat.id}">
        <div class="lg-category-head">
          <button class="lg-category-toggle" data-lg-cat-toggle="${cat.id}" type="button"><span>${DC.icon(cat.icon)} ${esc(cat.label)}</span></button>
          <div class="lg-category-actions">
            <button class="btn btn-ghost btn-small" data-lg-category-set="${cat.id}" type="button">${DC.icon("channel", 14)} Set channel</button>
            <button class="lg-category-chevron" data-lg-cat-toggle="${cat.id}" type="button" aria-label="Toggle ${esc(cat.label)}"><span class="lg-chevron" style="display:inline-flex;transform:${open ? "rotate(180deg)" : ""}">${DC.icon("chevron-down")}</span></button>
          </div>
        </div>
        <div class="lg-category-body" data-lg-cat-body="${cat.id}" style="display:${open ? "block" : "none"}">
          ${cat.types.map(t => renderTypeRowHtml(t, massEdit, selected)).join("")}
        </div>
      </div>`;
    }
    function renderTypeRowHtml(t, massEdit, selected) {
        const channelId = state.types?.[t.key]?.channelId || null;
        const label = channelLabelFor(channelId);
        return `
      <div class="lg-type-row" data-lg-type-row="${t.key}">
        <span class="lg-type-label">
          ${massEdit ? `<input type="checkbox" class="lg-checkbox" data-lg-select="${t.key}" ${selected.has(t.key) ? "checked" : ""}>` : ""}
          ${esc(t.label)}
        </span>
        <span class="lg-type-channel">
          ${label ? `<button class="lg-chan-remove" data-lg-type-remove="${t.key}" title="Remove channel" aria-label="Remove channel">${DC.icon("x")}</button>
             <span class="lg-chan-chip" data-lg-type-set="${t.key}">${DC.icon("hash")} ${esc(label)}</span>`
            : `<button class="lg-chan-chip lg-chan-chip-empty" data-lg-type-set="${t.key}">${DC.icon("plus")} Set channel</button>`}
        </span>
      </div>`;
    }
    function wireCategoryEvents(catsEl, ctx, massEdit, selected, openCats, rerender) {
        catsEl.querySelectorAll("[data-lg-cat-toggle]").forEach(btn => btn.addEventListener("click", () => {
            const catId = btn.dataset.lgCatToggle;
            const bodyEl = catsEl.querySelector(`[data-lg-cat-body="${catId}"]`);
            const open = bodyEl.style.display !== "none";
            bodyEl.style.display = open ? "none" : "block";
            btn.querySelector(".lg-chevron").style.transform = open ? "" : "rotate(180deg)";
            if (open)
                openCats.delete(catId);
            else
                openCats.add(catId);
        }));
        catsEl.querySelectorAll("[data-lg-category-set]").forEach(btn => btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const cat = CATEGORIES.find(c => c.id === btn.dataset.lgCategorySet);
            openChannelPicker(ctx, { title: `Set ${cat?.label || "category"} logging channel`, onPick: (channelId) => bulkSetChannel(ctx, cat.types.map(t => t.key), channelId).then(rerender) });
        }));
        catsEl.querySelectorAll("[data-lg-type-set]").forEach(el => el.addEventListener("click", () => {
            const key = el.dataset.lgTypeSet;
            const type = findType(key);
            openChannelPicker(ctx, {
                title: type?.label || "Select a channel",
                onPick: (channelId) => bulkSetChannel(ctx, [key], channelId).then(rerender),
            });
        }));
        catsEl.querySelectorAll("[data-lg-type-remove]").forEach(btn => btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            await bulkSetChannel(ctx, [btn.dataset.lgTypeRemove], null);
            rerender();
        }));
        if (massEdit) {
            catsEl.querySelectorAll("[data-lg-select]").forEach(cb => cb.addEventListener("change", () => {
                if (cb.checked)
                    selected.add(cb.dataset.lgSelect);
                else
                    selected.delete(cb.dataset.lgSelect);
                rerender();
            }));
        }
    }
    async function bulkSetChannel(ctx, typeKeys, channelId) {
        try {
            const d = await ctx.api(`/guilds/${ctx.guildId}/logging/types-bulk`, { method: "PUT", body: JSON.stringify({ typeKeys, channelId }) });
            state.types = d.types || state.types;
        }
        catch (e) {
            await ctx.modal.alert(`Couldn't update: ${e.message}`);
        }
    }
    function openChannelPicker(ctx, { title, onPick }) {
        const channels = state.meta?.channels || [];
        const categories = state.meta?.categories || [];
        const catNameFor = (catId) => categories.find(c => c.id === catId)?.name || null;
        const bodyHtml = `
      <div class="dc-modal-header lg-picker-header">
        <h3>${esc(title)}</h3>
        <button class="icon-btn" id="lg-picker-close" aria-label="Close">${DC.icon("x")}</button>
      </div>
      <div class="lg-picker-body">
        <div class="lg-picker-label">Select a channel</div>
        <input type="text" class="dropdown-panel-search" id="lg-picker-search" placeholder="Channel" style="width:100%;margin-bottom:8px">
        <div id="lg-picker-list" class="lg-picker-list"></div>
        <div class="lg-picker-footer">
          <span class="lg-picker-hint">Channel not found?</span>
          <button class="btn btn-ghost btn-small" id="lg-picker-other">${DC.icon("channel")} Use other channel</button>
        </div>
      </div>`;
        const r = ctx.modal.custom(bodyHtml, { maxWidth: "420px" });
        r.querySelector("#lg-picker-close").addEventListener("click", ctx.modal.close);
        function paint(query) {
            const q = (query || "").toLowerCase();
            const filtered = q ? channels.filter(c => c.name.toLowerCase().includes(q)) : channels;
            const grouped = [];
            const seenCats = new Set();
            filtered.forEach(c => {
                const catLabel = c.categoryId ? catNameFor(c.categoryId) : null;
                if (catLabel && !seenCats.has(catLabel)) {
                    seenCats.add(catLabel);
                    grouped.push({ type: "label", text: catLabel });
                }
                grouped.push({ type: "channel", channel: c });
            });
            const listEl = r.querySelector("#lg-picker-list");
            if (filtered.length === 0) {
                listEl.innerHTML = `<div class="dropdown-panel-empty">No matches</div>`;
                return;
            }
            listEl.innerHTML = grouped.map(g => g.type === "label"
                ? `<div class="lg-picker-group-label">${esc(g.text)}</div>`
                : `<div class="lg-picker-item" data-lg-pick="${g.channel.id}"><span class="lg-picker-item-hash"># ${esc(g.channel.name)}</span></div>`).join("");
            listEl.querySelectorAll("[data-lg-pick]").forEach(el => el.addEventListener("click", () => {
                ctx.modal.close();
                onPick(el.dataset.lgPick);
            }));
        }
        paint("");
        r.querySelector("#lg-picker-search").addEventListener("input", (e) => paint(e.target.value));
        r.querySelector("#lg-picker-other").addEventListener("click", () => openChannelListenFlow(ctx, { title, onPick }));
    }
    async function openChannelListenFlow(ctx, { title, onPick }) {
        const bodyHtml = `
      <div class="dc-modal-header lg-picker-header">
        <h3>${esc(title)}</h3>
        <button class="icon-btn" id="lg-listen-close" aria-label="Close">${DC.icon("x")}</button>
      </div>
      <div class="lg-picker-body" style="text-align:center">
        <div class="lg-picker-label" style="margin-bottom:10px">Send the following message into the channel you want to use</div>
        <div id="lg-listen-code" style="margin-bottom:16px"></div>
        <div id="lg-listen-status" class="lg-listen-status"><div class="spinner" style="width:16px;height:16px;margin:0 8px 0 0"></div>Waiting for you to send the message</div>
      </div>`;
        const r = ctx.modal.custom(bodyHtml, { maxWidth: "420px" });
        let stopped = false;
        r.querySelector("#lg-listen-close").addEventListener("click", () => { stopped = true; ctx.modal.close(); });
        let session;
        try {
            session = await ctx.api(`/guilds/${ctx.guildId}/logging/listen-start`, { method: "POST", body: JSON.stringify({ userId: ctx.userId || null }) });
        }
        catch (e) {
            r.querySelector("#lg-listen-status").innerHTML = `<span style="color:var(--red)">Couldn't start listening: ${esc(e.message)}</span>`;
            return;
        }
        const mentionCode = `<@${session.botUserId}> ${session.code}`;
        r.querySelector("#lg-listen-code").innerHTML = `
      <div class="lg-listen-code-box">
        <code>${esc(mentionCode)}</code>
        <button class="icon-btn" id="lg-listen-copy" title="Copy" aria-label="Copy">${DC.icon("copy")}</button>
      </div>`;
        r.querySelector("#lg-listen-copy").addEventListener("click", () => {
            navigator.clipboard?.writeText(mentionCode).catch(() => { });
            const btn = r.querySelector("#lg-listen-copy");
            btn.innerHTML = `${DC.icon("check")}`;
            setTimeout(() => { if (btn.isConnected)
                btn.innerHTML = `${DC.icon("copy")}`; }, 1200);
        });
        const startedAt = Date.now();
        const TIMEOUT_MS = 5 * 60_000;
        async function poll() {
            if (stopped)
                return;
            if (Date.now() - startedAt > TIMEOUT_MS) {
                r.querySelector("#lg-listen-status").innerHTML = `<span style="color:var(--text-dim)">Timed out waiting — reopen to try again.</span>`;
                return;
            }
            try {
                const d = await ctx.api(`/guilds/${ctx.guildId}/logging/listen-status/${session.code}`);
                if (d.resolvedChannelId) {
                    r.querySelector("#lg-listen-status").innerHTML = `<span style="color:var(--green)">${DC.icon("check")} Found #${esc(d.resolvedChannelName || d.resolvedChannelId)}</span>`;
                    setTimeout(() => { if (!stopped) {
                        ctx.modal.close();
                        onPick(d.resolvedChannelId);
                    } }, 600);
                    return;
                }
            }
            catch { }
            setTimeout(poll, 1800);
        }
        poll();
    }
    async function renderSettingsTab(body, ctx) {
        body.innerHTML = loading();
        await ensureMeta(ctx);
        await loadLogging(ctx);
        paintSettingsTab(body, ctx);
    }
    const TOGGLE_SETTINGS = [
        { key: "useWebhooks", title: "Use webhooks", hint: "If enabled, the bot creates a webhook per channel to send log messages. This can be a security risk if a webhook URL is exposed.", def: false },
        { key: "ignoreEmbeds", title: "Ignore embeds", hint: "If enabled, messages including embeds are ignored from Logging.", def: false },
        { key: "applyIgnoreToVoice", title: "Apply ignore to users in voice", hint: "If enabled, voice log messages are not sent when the user in the voice channel is ignored from Logging.", def: false },
        { key: "logDeletedPollsWithMessageDelete", title: "Log deleted polls with Message Delete", hint: "Poll deletions are logged by two types: Poll Delete and Message Delete. If disabled, only logs deleted polls with Poll Delete.", def: true },
        { key: "logDeletedStickyMessages", title: "Log deleted sticky messages", hint: "Sticky messages are frequently deleted and sent again. Disable this option to disable delete logging for sticky messages.", def: true },
        { key: "logDeletedForwardedMessages", title: "Log deleted forwarded messages", hint: "If disabled, forwarded messages are not logged by Message Delete.", def: true },
        { key: "logUnrecognizableMessageDeletions", title: "Log unrecognizable message deletions", hint: "If enabled, the bot will log deleted messages that are more than a year old and don't have a known executor. These logs are usually not very useful as they contain no real data and can be very noisy.", def: false },
    ];
    function paintSettingsTab(body, ctx) {
        body.innerHTML = `
      <div id="lg-settings-toggles"></div>
      <div class="settings-section-block">
        <h4>${DC.icon("send")} Test logging</h4>
        <div class="settings-section-hint">Send a test message to the selected log channels.</div>
        <div class="field-row-inline" style="margin-top:10px"><input id="lg-test-message" value="NEXORIA logging test" style="flex:1"><button class="btn btn-primary btn-small" id="lg-test-all">${DC.icon("terminal-2")} Send test to all</button></div>
      </div>
      <div class="settings-section-block">
        <h4>${DC.icon("hash")} Ignore channels</h4>
        <div class="settings-section-hint">All actions that involve channels listed below are ignored from Logging.</div>
        <div id="lg-ignore-channels" class="lg-ignore-chips"></div>
        <button class="btn btn-ghost btn-small" id="lg-ignore-channels-add">${DC.icon("plus")} Add channel</button>
      </div>
      <div class="settings-section-block">
        <h4>${DC.icon("shield")} Ignore roles</h4>
        <div class="settings-section-hint">All actions from users with the roles listed below are ignored from Logging.</div>
        <div id="lg-ignore-roles" class="lg-ignore-chips"></div>
        <button class="btn btn-ghost btn-small" id="lg-ignore-roles-add">${DC.icon("plus")} Add role</button>
      </div>
      <div class="settings-section-block">
        <h4>${DC.icon("user-off")} Ignore users</h4>
        <div class="settings-section-hint">All actions from users listed below are ignored from Logging.</div>
        <div id="lg-ignore-users" class="lg-ignore-chips" style="margin-bottom:10px"></div>
        <div class="field-row-inline">
          <input type="text" id="lg-ignore-user-input" placeholder="User ID" style="flex:1">
          <button class="btn btn-primary btn-small" id="lg-ignore-user-add">${DC.icon("plus")} Add</button>
        </div>
      </div>`;
        paintToggles(ctx);
        document.getElementById("lg-test-all")?.addEventListener("click", async () => {
            try {
                const r = await ctx.api(`/guilds/${ctx.guildId}/logging/test`, { method: "POST", body: JSON.stringify({ all: true, message: document.getElementById("lg-test-message")?.value || "NEXORIA logging test" }) });
                await ctx.modal.alert(`Sent ${r.sent} test message${r.sent === 1 ? "" : "s"}.`);
            }
            catch (e) {
                await ctx.modal.alert(`Couldn't send test: ${e.message}`);
            }
        });
        paintIgnoreChannels(ctx);
        paintIgnoreRoles(ctx);
        paintIgnoreUsers(ctx);
    }
    function paintToggles(ctx) {
        const wrap = document.getElementById("lg-settings-toggles");
        wrap.innerHTML = TOGGLE_SETTINGS.map(s => `
      <div class="settings-section-block">
        <div class="field-row-inline">
          <div><div class="config-row-label">${esc(s.title)}</div><div class="field-hint" style="margin-top:2px;max-width:560px">${esc(s.hint)}</div></div>
          <button class="toggle ${(state.settings?.[s.key] ?? s.def) ? "on" : ""}" data-lg-toggle="${s.key}" aria-label="Toggle ${esc(s.title)}"></button>
        </div>
      </div>`).join("");
        wrap.querySelectorAll("[data-lg-toggle]").forEach(btn => btn.addEventListener("click", async () => {
            const key = btn.dataset.lgToggle;
            const next = !btn.classList.contains("on");
            if (key === "useWebhooks" && next) {
                const ok = await ctx.modal.confirm("Using webhooks can be a security risk if a webhook URL is exposed. Anyone with a webhook URL may be able to send messages through it. Continue?", { title: "Webhook security warning", confirmLabel: "Enable webhooks", danger: true });
                if (!ok)
                    return;
            }
            btn.classList.toggle("on");
            try {
                await ctx.api(`/guilds/${ctx.guildId}/logging/settings`, { method: "PUT", body: JSON.stringify({ [key]: next }) });
                state.settings[key] = next;
            }
            catch (e) {
                btn.classList.toggle("on");
                await ctx.modal.alert(`Couldn't update: ${e.message}`);
            }
        }));
    }
    function paintIgnoreChannels(ctx) {
        const wrap = document.getElementById("lg-ignore-channels");
        const ids = state.ignore?.channels || [];
        wrap.innerHTML = ids.length === 0
            ? `<div class="lg-ignore-empty">No channels added</div>`
            : ids.map(id => `<span class="lg-ignore-chip">${DC.icon("hash")} ${esc(channelLabelFor(id) || id)} <button data-lg-ignore-ch-remove="${id}" aria-label="Remove">${DC.icon("x")}</button></span>`).join("");
        wrap.querySelectorAll("[data-lg-ignore-ch-remove]").forEach(btn => btn.addEventListener("click", async () => {
            await saveIgnoreList(ctx, "channels", ids.filter(x => x !== btn.dataset.lgIgnoreChRemove));
        }));
        document.getElementById("lg-ignore-channels-add").onclick = () => openChannelPicker(ctx, {
            title: "Ignore channel",
            onPick: async (channelId) => { if (!ids.includes(channelId))
                await saveIgnoreList(ctx, "channels", [...ids, channelId]); },
        });
    }
    function paintIgnoreRoles(ctx) {
        const wrap = document.getElementById("lg-ignore-roles");
        const ids = state.ignore?.roles || [];
        const roleLabel = (id) => (state.meta?.roles || []).find(r => r.id === id)?.name || id;
        wrap.innerHTML = ids.length === 0
            ? `<div class="lg-ignore-empty">No roles added</div>`
            : ids.map(id => `<span class="lg-ignore-chip">${DC.icon("shield")} ${esc(roleLabel(id))} <button data-lg-ignore-role-remove="${id}" aria-label="Remove">${DC.icon("x")}</button></span>`).join("");
        wrap.querySelectorAll("[data-lg-ignore-role-remove]").forEach(btn => btn.addEventListener("click", async () => {
            await saveIgnoreList(ctx, "roles", ids.filter(x => x !== btn.dataset.lgIgnoreRoleRemove));
        }));
        document.getElementById("lg-ignore-roles-add").onclick = () => {
            const roleOpts = (state.meta?.roles || []).filter(r => !ids.includes(r.id)).map(r => ({ value: r.id, label: r.name, icon: `<span class="role-dot" style="background:${r.color || "#99aab5"}"></span>` }));
            const bodyHtml = `
        <div class="dc-modal-header"><h3>Ignore role</h3></div>
        <div style="padding:14px 20px"><div id="lg-role-pick"></div></div>
        <div class="dc-modal-footer"><button class="btn btn-ghost btn-small" id="lg-role-pick-close">${DC.icon("x")} Close</button></div>`;
            const r = ctx.modal.custom(bodyHtml, { maxWidth: "360px" });
            r.querySelector("#lg-role-pick-close").addEventListener("click", ctx.modal.close);
            const drop = window.DC.createDropdown(r.querySelector("#lg-role-pick"), { options: roleOpts, placeholder: "Select a role…", searchable: true });
            drop.onChange(async (val) => { ctx.modal.close(); if (val && !ids.includes(val))
                await saveIgnoreList(ctx, "roles", [...ids, val]); });
        };
    }
    function paintIgnoreUsers(ctx) {
        const wrap = document.getElementById("lg-ignore-users");
        const ids = state.ignore?.users || [];
        wrap.innerHTML = ids.length === 0
            ? `<div class="lg-ignore-empty">No users added</div>`
            : ids.map(id => `<span class="lg-ignore-chip">${DC.icon("user")} ${esc(id)} <button data-lg-ignore-user-remove="${id}" aria-label="Remove">${DC.icon("x")}</button></span>`).join("");
        wrap.querySelectorAll("[data-lg-ignore-user-remove]").forEach(btn => btn.addEventListener("click", async () => {
            await saveIgnoreList(ctx, "users", ids.filter(x => x !== btn.dataset.lgIgnoreUserRemove));
        }));
        document.getElementById("lg-ignore-user-add")?.addEventListener("click", async () => {
            const input = document.getElementById("lg-ignore-user-input");
            const id = input.value.trim();
            if (!/^\d{5,25}$/.test(id)) {
                input.focus();
                return;
            }
            if (!ids.includes(id))
                await saveIgnoreList(ctx, "users", [...ids, id]);
            input.value = "";
        });
    }
    async function saveIgnoreList(ctx, listKey, values) {
        try {
            const d = await ctx.api(`/guilds/${ctx.guildId}/logging/ignore`, { method: "PUT", body: JSON.stringify({ [listKey]: values }) });
            state.ignore = d.ignore || state.ignore;
            if (listKey === "channels")
                paintIgnoreChannels(ctx);
            if (listKey === "roles")
                paintIgnoreRoles(ctx);
            if (listKey === "users")
                paintIgnoreUsers(ctx);
        }
        catch (e) {
            await ctx.modal.alert(`Couldn't update: ${e.message}`);
        }
    }
    window.DC.registerModule({
        id: "logging",
        label: "Logging",
        render(root, ctx, tab) {
            state.types = null;
            state.settings = null;
            state.ignore = null;
            state.meta = null;
            renderTab(root, ctx, tab || "types");
        },
    });
})();
