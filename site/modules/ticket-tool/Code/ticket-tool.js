// ticket-tool.js
(function () {
    const state = {
        subjects: [],
        tickets: [],
        meta: null,
        panels: [],
        wizard: null,
    };
    function esc(s) { return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
    function loading(msg) { return `<div class="loading-wrap"><div class="spinner"></div><div>${msg || "Loading…"}</div></div>`; }
    async function ensureMeta(ctx) {
        if (state.meta)
            return state.meta;
        try {
            state.meta = await ctx.api(`/guilds/${ctx.guildId}/meta?userId=${ctx.userId}`);
        }
        catch {
            state.meta = null;
        }
        return state.meta;
    }
    async function loadSubjects(ctx) {
        try {
            const d = await ctx.api(`/guilds/${ctx.guildId}/subjects`);
            state.subjects = d.subjects || [];
        }
        catch {
            state.subjects = [];
        }
        return state.subjects;
    }
    async function loadTickets(ctx) {
        try {
            const d = await ctx.api(`/guilds/${ctx.guildId}/tickets`);
            state.tickets = d.tickets || [];
            return d;
        }
        catch {
            state.tickets = [];
            return { tickets: [] };
        }
    }
    async function loadPanels(ctx) {
        try {
            const d = await ctx.api(`/guilds/${ctx.guildId}/panels`);
            state.panels = d.panels || [];
        }
        catch {
            state.panels = [];
        }
        return state.panels;
    }
    const TABS = [
        { id: "tickets", label: "Tickets", icon: "tickets" },
        { id: "insights", label: "Insights", icon: "chart-bar" },
        { id: "reviews", label: "Reviews", icon: "star" },
        { id: "leaderboard", label: "Leaderboard", icon: "trophy" },
        { id: "overview", label: "Overview", icon: "home" },
        { id: "subjects", label: "Ticket Subjects", icon: "tag" },
        { id: "panels", label: "Ticket Panel", icon: "layout-board" },
        { id: "closing-dm", label: "Closing DM", icon: "mail" },
        { id: "settings", label: "Settings", icon: "settings" },
    ];
    function renderShell(root, ctx, activeTab) {
        root.innerHTML = `
      <div class="dash-header">
        <div><h1>Ticket Tool</h1><p>Everything ticket-related for this server lives here.</p></div>
      </div>
      <div class="tt-tabbar">
        ${TABS.map(t => tab(t.id, t.icon, t.label, activeTab)).join("")}
      </div>
      <div id="tt-body">${loading()}</div>`;
        root.querySelectorAll("[data-tt-tab]").forEach(el => el.addEventListener("click", () => {
            ctx.navigateToTab(el.dataset.ttTab);
            renderTab(root, ctx, el.dataset.ttTab);
        }));
        return document.getElementById("tt-body");
    }
    function tab(id, iconName, label, active) {
        return `<button class="tt-tab ${active === id ? "active" : ""}" data-tt-tab="${id}">${DC.icon(iconName)}${label}</button>`;
    }
    function renderTab(root, ctx, tabId) {
        const body = renderShell(root, ctx, tabId);
        const renderers = { tickets: renderTickets, insights: renderInsights, reviews: renderReviews, leaderboard: renderLeaderboard, overview: renderOverviewTab, subjects: renderSubjects, panels: renderPanelsHome, "closing-dm": renderClosingDm, settings: renderSettings };
        (renderers[tabId] || renderTickets)(body, ctx);
    }
    async function renderClosingDm(body, ctx) {
        body.innerHTML = loading();
        let cfg = { enabled: true, embedColor: "#8b5cf6", message: "" };
        try {
            cfg = await ctx.api(`/guilds/${ctx.guildId}/closing-dm`);
        }
        catch { }
        body.innerHTML = `
      <div class="config-section">
        <h3>Closing DM</h3>
        <div class="hint">Sent as a DM to whoever opened a ticket once it's closed, in addition to the subject's own close message. Use {server.name}, {user.name}, {subject.name}, and {ticket.url} — the recipient's own ticket page. This always links to their normal ticket page, never a public share link, whether or not sharing is turned on in Settings.</div>
        <div class="config-row">
          <span class="config-row-label">Send this DM when a ticket closes</span>
          <button class="toggle ${cfg.enabled !== false ? "on" : ""}" id="dm-enabled" aria-label="Toggle closing DM"></button>
        </div>
        <div class="field" style="margin-top:14px;max-width:220px"><label>Embed color</label><div id="dm-color"></div></div>
        <div class="field" style="margin-top:14px"><label>Message</label><textarea id="dm-message" style="min-height:180px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px">${esc(cfg.message || "")}</textarea></div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <button class="btn btn-primary btn-small" id="dm-save">Save changes</button>
        <button class="btn btn-ghost btn-small" id="dm-preview">Preview</button>
        <span class="field-hint" id="dm-feedback"></span>
      </div>`;
        document.getElementById("dm-enabled")?.addEventListener("click", (e) => e.currentTarget.classList.toggle("on"));
        if (window.DC.attachVariableEditor)
            window.DC.attachVariableEditor(document.getElementById("dm-message"));
        const colorDropdown = window.DC.createDropdown(document.getElementById("dm-color"), {
            options: [
                { value: "#8b5cf6", label: "Violet", icon: `<span class="role-dot" style="background:#8b5cf6"></span>` },
                { value: "#6ee7b7", label: "Green", icon: `<span class="role-dot" style="background:#6ee7b7"></span>` },
                { value: "#fbbf24", label: "Amber", icon: `<span class="role-dot" style="background:#fbbf24"></span>` },
                { value: "#e94560", label: "Red", icon: `<span class="role-dot" style="background:#e94560"></span>` },
                { value: "#7dd3fc", label: "Sky", icon: `<span class="role-dot" style="background:#7dd3fc"></span>` },
                { value: "#f5b942", label: "Gold", icon: `<span class="role-dot" style="background:#f5b942"></span>` },
            ],
            value: cfg.embedColor || "#8b5cf6",
        });
        document.getElementById("dm-save")?.addEventListener("click", async () => {
            const btn = document.getElementById("dm-save");
            btn.textContent = "Saving…";
            try {
                await ctx.api(`/guilds/${ctx.guildId}/closing-dm`, {
                    method: "POST",
                    body: JSON.stringify({
                        enabled: document.getElementById("dm-enabled").classList.contains("on"),
                        embedColor: colorDropdown.getValue(),
                        message: document.getElementById("dm-message").value,
                    }),
                });
                btn.innerHTML = `${DC.icon("check")} Saved`;
            }
            catch (e) {
                btn.textContent = `Failed: ${e.message}`.slice(0, 60);
            }
            setTimeout(() => { btn.textContent = "Save changes"; }, 2200);
        });
        document.getElementById("dm-preview")?.addEventListener("click", () => {
            const sample = document.getElementById("dm-message").value
                .replace(/\{server\.name\}/g, ctx.guildId ? "This Server" : "Server")
                .replace(/\{user\.name\}/g, "SomeUser")
                .replace(/\{subject\.name\}/g, "Support")
                .replace(/\{ticket\.url\}/g, "https://example.com/my-tickets/ticket/123456789/1");
            ctx.modal.custom(`
        <div class="dc-modal-header"><h3>Preview</h3></div>
        <div class="dc-modal-body"><div class="settings-section-block" style="background:var(--panel);border-left:3px solid var(--violet)">${esc(sample).replace(/\n/g, "<br>")}</div></div>
        <div class="dc-modal-footer"><button class="btn btn-ghost btn-small" id="dm-preview-close">Close</button></div>`, {
                maxWidth: "480px",
                onMount: (r) => r.querySelector("#dm-preview-close").addEventListener("click", ctx.modal.close),
            });
        });
    }
    async function renderReviews(body, ctx) { body.innerHTML = loading("Loading reviews…"); try {
        const d = await ctx.api(`/guilds/${ctx.guildId}/ticket-tool/reviews?userId=${encodeURIComponent(ctx.userId)}`);
        const rs = d.reviews || [];
        const avg = rs.length ? rs.reduce((a, r) => a + Number(r.rating), 0) / rs.length : 0;
        const days = {};
        rs.forEach(r => { const k = new Date(r.createdAt).toISOString().slice(0, 10); (days[k] ??= []).push(r); });
        const bars = Object.keys(days).sort().slice(-30).map(k => { const a = days[k].reduce((x, r) => x + Number(r.rating), 0) / days[k].length; return `<div class="review-bar"><div>${esc(k)}</div><div class="review-bar-track"><div class="review-bar-fill" style="width:${a * 10}%"></div></div><div>${a.toFixed(1)}/10 · ${days[k].length}</div></div>`; }).join("") || `<div class="empty-state">No reviews yet.</div>`;
        body.innerHTML = `<div class="overview-grid"><div class="overview-card"><div class="num">${avg ? avg.toFixed(1) : "—"}</div><div class="lbl">Average stars</div></div><div class="overview-card"><div class="num">${rs.length}</div><div class="lbl">Reviews</div></div></div><div class="config-section"><h3>Daily reviews</h3><p class="hint">Individual reviews and reviewer identities are private.</p>${bars}</div>`;
    }
    catch (e) {
        body.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`;
    } }
    async function renderLeaderboard(body, ctx) { body.innerHTML = loading("Loading leaderboard…"); try {
        const d = await ctx.api(`/guilds/${ctx.guildId}/ticket-tool/leaderboard?userId=${encodeURIComponent(ctx.userId)}`);
        const p = [['daily', 'Today'], ['weekly', '7 days'], ['monthly', '30 days'], ['sixMonths', '6 months'], ['yearly', '1 year'], ['total', 'All time']];
        body.innerHTML = `<div class="config-section"><h3>Ticket Tool leaderboard</h3><p class="hint">Refreshes every ${d.leaderboard?.refreshMinutes || 30} minutes. Only active ratings count.</p><div class="overview-grid">${p.map(([k, l]) => `<div class="overview-card"><div class="num">${d.stats?.[k]?.average ? d.stats[k].average.toFixed(1) : "—"}/10</div><div class="lbl">${l} · ${d.stats?.[k]?.count || 0} votes</div></div>`).join("")}</div></div><div class="config-section"><h3>Best support</h3>${(d.staff || []).map((r, i) => `<div class="config-row"><span class="config-row-label">#${i + 1} ${esc(r.userId)}</span><span>${r.average.toFixed(1)}/10 · ${r.votes} votes</span></div>`).join("") || `<div class="empty-state">Coming soon — no rated tickets yet.</div>`}</div>`;
    }
    catch (e) {
        body.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`;
    } }
    async function renderOverviewTab(body, ctx) {
        body.innerHTML = loading("Loading overview…");
        let botInfo = null;
        try {
            botInfo = await ctx.api(`/status`);
        }
        catch {
            botInfo = null;
        }
        const data = await loadTickets(ctx);
        const tickets = data.tickets || [];
        const open = tickets.filter(t => t.status === "open").length;
        const pending = tickets.filter(t => t.status === "pending").length;
        const closed = tickets.filter(t => t.status === "closed").length;
        body.innerHTML = `
      <div class="overview-grid">
        <div class="overview-card"><div class="num">${open}</div><div class="lbl">Open tickets</div></div>
        <div class="overview-card"><div class="num">${pending}</div><div class="lbl">Pending reply</div></div>
        <div class="overview-card"><div class="num">${closed}</div><div class="lbl">Closed (all time)</div></div>
        <div class="overview-card"><div class="num">${data.memberCount ?? "—"}</div><div class="lbl">Server members</div></div>
      </div>
      <div class="config-section">
        <h3>Bot connection</h3>
        <div class="hint">Straight from your local bot.js instance.</div>
        <div class="config-row"><span class="config-row-label">Status</span><span class="status-pip ${botInfo?.online ? "online" : "offline"}"><span class="status-dot"></span>${botInfo?.online ? "Bot online" : "Bot Servers down"}</span></div>
        <div class="config-row"><span class="config-row-label">Bot account</span><span class="config-row-label" style="font-weight:400;color:var(--text-dim)">${esc(botInfo?.botTag || "—")}</span></div>
        <div class="config-row"><span class="config-row-label">Uptime</span><span class="config-row-label" style="font-weight:400;color:var(--text-dim)">${formatUptimeLocal(botInfo?.uptimeSeconds)}</span></div>
        <div class="config-row"><span class="config-row-label">Ticket name format</span><span class="config-row-label" style="font-weight:400;color:var(--text-dim)">{subject.name}-{user.name}</span></div>
      </div>`;
    }
    function formatUptimeLocal(sec) {
        if (sec == null)
            return "—";
        const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
        return `${h}h ${m}m`;
    }
    const insightsState = { period: "week", customFrom: null, customTo: null, staffPage: 0 };
    function periodBounds(period, customFrom, customTo) {
        const now = new Date();
        const end = new Date(now);
        end.setHours(23, 59, 59, 999);
        let start;
        if (period === "month") {
            start = new Date(now);
            start.setDate(start.getDate() - 29);
        }
        else if (period === "custom" && customFrom && customTo) {
            return { start: new Date(customFrom), end: new Date(customTo) };
        }
        else {
            start = new Date(now);
            start.setDate(start.getDate() - 6);
        }
        start.setHours(0, 0, 0, 0);
        return { start, end };
    }
    function computeInsights(tickets, start, end) {
        const spanMs = end.getTime() - start.getTime();
        const prevEnd = new Date(start.getTime() - 1);
        const prevStart = new Date(prevEnd.getTime() - spanMs);
        function inRange(iso, from, to) { if (!iso)
            return false; const t = new Date(iso).getTime(); return t >= from.getTime() && t <= to.getTime(); }
        const thisTickets = tickets.filter(t => inRange(t.createdAt, start, end));
        const prevTickets = tickets.filter(t => inRange(t.createdAt, prevStart, prevEnd));
        const thisMsgsAll = tickets.flatMap(t => (t.messages || []).filter(m => inRange(m.createdAt, start, end)));
        const prevMsgsAll = tickets.flatMap(t => (t.messages || []).filter(m => inRange(m.createdAt, prevStart, prevEnd)));
        function firstResponseMinutes(list) {
            const mins = [];
            list.forEach(t => {
                const staffMsg = (t.messages || []).find(m => m.authorIsStaff && !m.authorIsBot);
                if (staffMsg)
                    mins.push((new Date(staffMsg.createdAt) - new Date(t.createdAt)) / 60000);
            });
            return mins;
        }
        const thisResponseMins = firstResponseMinutes(thisTickets);
        const prevResponseMins = firstResponseMinutes(prevTickets);
        const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
        const activeStaffThis = new Set(thisMsgsAll.filter(m => m.authorIsStaff && !m.authorIsBot).map(m => m.authorId)).size;
        const activeStaffPrev = new Set(prevMsgsAll.filter(m => m.authorIsStaff && !m.authorIsBot).map(m => m.authorId)).size;
        const dayCount = Math.max(1, Math.round(spanMs / 86400000) + 1);
        function dailySeries(list, dateField, rangeStart) {
            const days = Array.from({ length: dayCount }, () => 0);
            list.forEach(item => {
                const d = new Date(item[dateField]);
                const offset = Math.floor((d - rangeStart) / 86400000);
                if (offset >= 0 && offset < dayCount)
                    days[offset]++;
            });
            return days;
        }
        const ticketsPerDay = dailySeries(thisTickets, "createdAt", start);
        const ticketsPerDayPrev = dailySeries(prevTickets, "createdAt", prevStart);
        const msgsPerDay = dailySeries(thisMsgsAll, "createdAt", start);
        const msgsPerDayPrev = dailySeries(prevMsgsAll, "createdAt", prevStart);
        function responsePerDay(list, rangeStart) {
            const buckets = Array.from({ length: dayCount }, () => []);
            list.forEach(t => {
                const staffMsg = (t.messages || []).find(m => m.authorIsStaff && !m.authorIsBot);
                if (!staffMsg)
                    return;
                const offset = Math.floor((new Date(t.createdAt) - rangeStart) / 86400000);
                if (offset >= 0 && offset < dayCount)
                    buckets[offset].push((new Date(staffMsg.createdAt) - new Date(t.createdAt)) / 60000);
            });
            return buckets.map(b => b.length ? Math.round(b.reduce((a, c) => a + c, 0) / b.length) : null);
        }
        const responsePerDayThis = responsePerDay(thisTickets, start);
        const responsePerDayPrev = responsePerDay(prevTickets, prevStart);
        function subjectPercents(list) {
            const counts = {};
            list.forEach(t => { const k = t.subject || "Other"; counts[k] = (counts[k] || 0) + 1; });
            const total = list.length || 1;
            return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Math.round((v / total) * 100)]));
        }
        const subjThis = subjectPercents(thisTickets);
        const subjPrev = subjectPercents(prevTickets);
        const subjectNames = [...new Set([...Object.keys(subjThis), ...Object.keys(subjPrev)])]
            .sort((a, b) => (subjThis[b] || 0) - (subjThis[a] || 0)).slice(0, 6);
        const staffCounts = {};
        thisMsgsAll.filter(m => m.authorIsStaff && !m.authorIsBot).forEach(m => {
            const key = m.authorId || m.authorName;
            if (!staffCounts[key])
                staffCounts[key] = { name: m.authorName, avatar: m.authorAvatar, count: 0 };
            staffCounts[key].count++;
        });
        const prevStaffCounts = {};
        prevMsgsAll.filter(m => m.authorIsStaff && !m.authorIsBot).forEach(m => {
            const key = m.authorId || m.authorName;
            prevStaffCounts[key] = (prevStaffCounts[key] || 0) + 1;
        });
        const totalStaffMsgs = Object.values(staffCounts).reduce((a, s) => a + s.count, 0) || 1;
        const staffRows = Object.entries(staffCounts).map(([key, s]) => ({
            key, name: s.name, avatar: s.avatar, count: s.count,
            delta: s.count - (prevStaffCounts[key] || 0),
            share: Math.round((s.count / totalStaffMsgs) * 100),
        })).sort((a, b) => b.count - a.count);
        let busiestIdx = 0, quietestIdx = 0, peakMsgIdx = 0;
        ticketsPerDay.forEach((v, i) => { if (v > ticketsPerDay[busiestIdx])
            busiestIdx = i; if (v < ticketsPerDay[quietestIdx])
            quietestIdx = i; });
        msgsPerDay.forEach((v, i) => { if (v > msgsPerDay[peakMsgIdx])
            peakMsgIdx = i; });
        const respValid = responsePerDayThis.map((v, i) => ({ v, i })).filter(x => x.v != null);
        const fastestResp = respValid.length ? respValid.reduce((a, b) => (b.v < a.v ? b : a)) : null;
        const slowestResp = respValid.length ? respValid.reduce((a, b) => (b.v > a.v ? b : a)) : null;
        function dayLabel(offset, rangeStart) { const d = new Date(rangeStart.getTime() + offset * 86400000); return d.toLocaleDateString(undefined, { weekday: "short" }); }
        function pctDelta(now, prev) { if (!prev)
            return now > 0 ? 100 : 0; return Math.round(((now - prev) / prev) * 100); }
        return {
            start, end, dayCount,
            totalTickets: thisTickets.length, totalTicketsPrev: prevTickets.length,
            totalMessages: thisMsgsAll.length, totalMessagesPrev: prevMsgsAll.length,
            avgResponse: avg(thisResponseMins), avgResponsePrev: avg(prevResponseMins),
            activeStaff: activeStaffThis, activeStaffPrev,
            ticketsPerDay, ticketsPerDayPrev, msgsPerDay, msgsPerDayPrev,
            responsePerDayThis, responsePerDayPrev,
            subjThis, subjPrev, subjectNames,
            staffRows,
            busiestDay: dayCount > 0 ? { label: dayLabel(busiestIdx, start), count: ticketsPerDay[busiestIdx] } : null,
            quietestDay: dayCount > 0 ? { label: dayLabel(quietestIdx, start), count: ticketsPerDay[quietestIdx] } : null,
            peakMsgDay: dayCount > 0 ? { label: dayLabel(peakMsgIdx, start), count: msgsPerDay[peakMsgIdx] } : null,
            fastestResp: fastestResp ? { label: dayLabel(fastestResp.i, start), mins: fastestResp.v } : null,
            slowestResp: slowestResp ? { label: dayLabel(slowestResp.i, start), mins: slowestResp.v } : null,
            pctDelta,
        };
    }
    function fmtMins(m) { if (m == null)
        return "—"; if (m < 60)
        return `${Math.round(m)}m`; return `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`; }
    function deltaChip(pct) {
        if (pct === 0)
            return `<span class="ins-delta ins-delta-flat">0%</span>`;
        const up = pct > 0;
        return `<span class="ins-delta ${up ? "ins-delta-up" : "ins-delta-down"}">${DC.icon(up ? "circle-check" : "alert-triangle", 12)} ${up ? "+" : ""}${pct}%</span>`;
    }
    function sparklineChart(seriesThis, seriesPrev, labels, { area = true, height = 160, valueFmt = (v) => v } = {}) {
        const w = 640, h = height, padL = 34, padB = 22, padT = 10, padR = 6;
        const innerW = w - padL - padR, innerH = h - padT - padB;
        const allVals = [...seriesThis, ...(seriesPrev || [])].filter(v => v != null);
        const maxV = Math.max(1, ...allVals);
        const stepX = innerW / Math.max(1, seriesThis.length - 1);
        function ptsFor(series) {
            return series.map((v, i) => v == null ? null : [padL + i * stepX, padT + innerH - (v / maxV) * innerH]).filter(Boolean);
        }
        function pathFor(pts) { return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" "); }
        const ptsThis = ptsFor(seriesThis);
        const ptsPrev = seriesPrev ? ptsFor(seriesPrev) : [];
        const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => {
            const y = padT + innerH - f * innerH;
            return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="var(--panel-border)" stroke-width="1"/><text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="var(--text-dim)">${valueFmt(Math.round(f * maxV))}</text>`;
        }).join("");
        const xLabels = labels.map((l, i) => {
            if (labels.length > 10 && i % Math.ceil(labels.length / 7) !== 0)
                return "";
            const x = padL + i * stepX;
            return `<text x="${x}" y="${h - 6}" text-anchor="middle" font-size="9" fill="var(--text-dim)">${esc(l)}</text>`;
        }).join("");
        return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:${h}px" preserveAspectRatio="none">
      ${gridLines}
      ${area ? `<path d="${pathFor(ptsThis)} L${(ptsThis[ptsThis.length - 1] || [padL, padT + innerH])[0]},${padT + innerH} L${padL},${padT + innerH} Z" fill="#6ee7b7" opacity=".18"/>` : ""}
      ${ptsPrev.length ? `<path d="${pathFor(ptsPrev)}" fill="none" stroke="#8b8da8" stroke-width="1.6" stroke-dasharray="4 3"/>` : ""}
      <path d="${pathFor(ptsThis)}" fill="none" stroke="#6ee7b7" stroke-width="2"/>
      ${xLabels}
    </svg>`;
    }
    function donutChart(entriesThis) {
        const colors = ["#6ee7b7", "#8b5cf6", "#e94560", "#22d3ee", "#8b8da8", "#fbbf24"];
        const total = entriesThis.reduce((a, [, v]) => a + v, 0) || 1;
        let angle = -90;
        const r = 60, cx = 75, cy = 75, strokeW = 26;
        const circumference = 2 * Math.PI * r;
        const segs = entriesThis.map(([, v], i) => {
            const frac = v / total;
            const dash = frac * circumference;
            const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colors[i % colors.length]}" stroke-width="${strokeW}" stroke-dasharray="${dash.toFixed(1)} ${(circumference - dash).toFixed(1)}" transform="rotate(${angle} ${cx} ${cy})"/>`;
            angle += frac * 360;
            return seg;
        }).join("");
        return `<svg viewBox="0 0 150 150" style="width:150px;height:150px;flex-shrink:0"><g>${segs}</g></svg>`;
    }
    async function renderInsights(body, ctx) {
        body.innerHTML = loading("Loading insights…");
        const data = await loadTickets(ctx);
        const tickets = data.tickets || [];
        paintInsights(body, ctx, tickets);
    }
    function paintInsights(body, ctx, tickets) {
        const { start, end } = periodBounds(insightsState.period, insightsState.customFrom, insightsState.customTo);
        const ins = computeInsights(tickets, start, end);
        const rangeLabel = `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
        const dayLabels = Array.from({ length: ins.dayCount }, (_, i) => { const d = new Date(start.getTime() + i * 86400000); return d.toLocaleDateString(undefined, { weekday: "short" }); });
        const colors = ["#6ee7b7", "#8b5cf6", "#e94560", "#22d3ee", "#8b8da8", "#fbbf24"];
        body.innerHTML = `
      <div class="ins-toolbar">
        <div class="ins-period-group">
          <button class="ins-period-btn ${insightsState.period === "week" ? "active" : ""}" data-ins-period="week">${DC.icon("calendar", 14)} Week</button>
          <button class="ins-period-btn ${insightsState.period === "month" ? "active" : ""}" data-ins-period="month">${DC.icon("calendar", 14)} Month</button>
        </div>
        <span class="field-hint" style="margin-left:auto">${esc(rangeLabel)}</span>
      </div>

      <div class="ins-chip-row">
        ${ins.busiestDay ? `<span class="ins-chip">${DC.icon("bolt", 13)} Busiest Day <b>${esc(ins.busiestDay.label)} — ${ins.busiestDay.count} ticket${ins.busiestDay.count === 1 ? "" : "s"}</b></span>` : ""}
        ${ins.peakMsgDay ? `<span class="ins-chip">${DC.icon("message", 13)} Peak Messages <b>${esc(ins.peakMsgDay.label)} — ${ins.peakMsgDay.count} messages</b></span>` : ""}
        ${ins.fastestResp ? `<span class="ins-chip ins-chip-good">${DC.icon("circle-check", 13)} Fastest Response <b>${esc(ins.fastestResp.label)} — ${fmtMins(ins.fastestResp.mins)}</b></span>` : ""}
        ${ins.quietestDay ? `<span class="ins-chip">${DC.icon("calendar", 13)} Quietest Day <b>${esc(ins.quietestDay.label)} — ${ins.quietestDay.count} ticket${ins.quietestDay.count === 1 ? "" : "s"}</b></span>` : ""}
        ${ins.slowestResp ? `<span class="ins-chip ins-chip-bad">${DC.icon("alert-triangle", 13)} Slowest Response <b>${esc(ins.slowestResp.label)} — ${fmtMins(ins.slowestResp.mins)}</b></span>` : ""}
      </div>

      <div class="ins-stat-grid">
        <div class="ins-stat-card">
          <div class="ins-stat-head"><span>Total Tickets</span>${DC.icon("tickets", 16)}</div>
          <div class="ins-stat-num">${ins.totalTickets}</div>
          ${deltaChip(ins.pctDelta(ins.totalTickets, ins.totalTicketsPrev))}
          <div class="field-hint" style="margin-top:8px">vs ${ins.totalTicketsPrev} in comparison period</div>
          <div class="field-hint">Tickets created in this period</div>
        </div>
        <div class="ins-stat-card">
          <div class="ins-stat-head"><span>Total Messages</span>${DC.icon("message", 16)}</div>
          <div class="ins-stat-num">${ins.totalMessages}</div>
          ${deltaChip(ins.pctDelta(ins.totalMessages, ins.totalMessagesPrev))}
          <div class="field-hint" style="margin-top:8px">vs ${ins.totalMessagesPrev} in comparison period</div>
          <div class="field-hint">Messages sent in this period</div>
        </div>
        <div class="ins-stat-card">
          <div class="ins-stat-head"><span>Avg Response Time</span>${DC.icon("clock", 16)}</div>
          <div class="ins-stat-num">${fmtMins(ins.avgResponse)}</div>
          ${ins.avgResponse != null && ins.avgResponsePrev != null ? deltaChip(-ins.pctDelta(ins.avgResponse, ins.avgResponsePrev)) : ""}
          <div class="field-hint" style="margin-top:8px">vs ${fmtMins(ins.avgResponsePrev)} in comparison period</div>
          <div class="field-hint">Average first response time</div>
        </div>
        <div class="ins-stat-card">
          <div class="ins-stat-head"><span>Active Staff</span>${DC.icon("users", 16)}</div>
          <div class="ins-stat-num">${ins.activeStaff}</div>
          ${deltaChip(ins.pctDelta(ins.activeStaff, ins.activeStaffPrev))}
          <div class="field-hint" style="margin-top:8px">vs ${ins.activeStaffPrev} in comparison period</div>
          <div class="field-hint">Staff members active this period</div>
        </div>
      </div>

      <div class="config-section">
        <div class="dash-header" style="margin-bottom:4px">
          <div><h3 style="margin:0">Tickets Created</h3><div class="field-hint">${ins.totalTickets} tickets in the selected period</div></div>
          <span class="field-hint">${esc(rangeLabel)}</span>
        </div>
        ${sparklineChart(ins.ticketsPerDay, ins.ticketsPerDayPrev, dayLabels)}
        <div class="ins-chart-legend"><span><i class="ins-legend-dot" style="background:#8b8da8;border-radius:0"></i>Previous Period</span><span><i class="ins-legend-dot" style="background:#6ee7b7"></i>This Period</span></div>
      </div>

      <div class="config-section">
        <h3>Subject Distribution</h3>
        <div class="field-hint" style="margin-bottom:14px">Ticket distribution across subjects</div>
        ${ins.subjectNames.length === 0 ? `<div class="empty-state">No ticket data in this period yet.</div>` : `
        <div class="ins-donut-row">
          ${donutChart(ins.subjectNames.map(n => [n, ins.subjThis[n] || 0]))}
          <div class="ins-donut-table">
            <div class="ins-donut-table-head"><span></span><span>This Period</span><span>Previous Period</span><span>Delta</span></div>
            ${ins.subjectNames.map((n, i) => {
            const t = ins.subjThis[n] || 0, p = ins.subjPrev[n] || 0, d = t - p;
            return `<div class="ins-donut-table-row"><span><i class="ins-legend-dot" style="background:${colors[i % colors.length]}"></i>${esc(n)}</span><span>${t}%</span><span>${p}%</span><span style="color:${d > 0 ? "var(--green)" : d < 0 ? "var(--red)" : "var(--text-dim)"}">${d > 0 ? "+" : ""}${d}%</span></div>`;
        }).join("")}
          </div>
        </div>`}
      </div>

      <div class="ins-two-col">
        <div class="config-section">
          <h3>Message Volume</h3>
          <div class="field-hint" style="margin-bottom:14px">${ins.totalMessages} messages · ${Math.round(ins.totalMessages / ins.dayCount)} per day average</div>
          ${sparklineChart(ins.msgsPerDay, ins.msgsPerDayPrev, dayLabels)}
          <div class="ins-chart-legend"><span><i class="ins-legend-dot" style="background:#8b8da8;border-radius:0"></i>Previous Period</span><span><i class="ins-legend-dot" style="background:#6ee7b7"></i>This Period</span></div>
        </div>
        <div class="config-section">
          <h3>Response Time</h3>
          <div class="field-hint" style="margin-bottom:14px">Average first response time: ${fmtMins(ins.avgResponse)}</div>
          ${sparklineChart(ins.responsePerDayThis, ins.responsePerDayPrev, dayLabels, { area: false, valueFmt: (v) => `${v}m` })}
          <div class="ins-chart-legend"><span><i class="ins-legend-dot" style="background:#8b8da8;border-radius:0"></i>Previous Period</span><span><i class="ins-legend-dot" style="background:#6ee7b7"></i>This Period</span></div>
        </div>
      </div>

      <div class="config-section">
        <div class="dash-header" style="margin-bottom:4px">
          <div><h3 style="margin:0">${DC.icon("users", 16)} Staff Performance</h3><div class="field-hint">Message activity by team member for the selected period</div></div>
        </div>
        ${ins.staffRows.length === 0 ? `<div class="empty-state">No staff activity in this period yet.</div>` : `
        <div class="ins-staff-table">
          <div class="ins-staff-row ins-staff-head"><span>#</span><span>Staff Member</span><span>Messages</span><span>Delta</span><span>Share</span></div>
          ${ins.staffRows.slice(0, 5).map((s, i) => `
            <div class="ins-staff-row">
              <span>${i + 1}</span>
              <span class="opener-preview"><img class="opener-preview-avatar" src="${esc(s.avatar || "https://cdn.discordapp.com/embed/avatars/0.png")}" alt=""><span class="opener-preview-name">${esc(s.name)}</span></span>
              <span>${s.count}</span>
              <span style="color:${s.delta > 0 ? "var(--green)" : s.delta < 0 ? "var(--red)" : "var(--text-dim)"}">${s.delta > 0 ? "+" : ""}${s.delta}</span>
              <span class="ins-share-cell"><span class="ins-share-bar"><span style="width:${s.share}%"></span></span>${s.share}%</span>
            </div>`).join("")}
        </div>`}
      </div>`;
        body.querySelectorAll("[data-ins-period]").forEach(btn => btn.addEventListener("click", () => {
            insightsState.period = btn.dataset.insPeriod;
            paintInsights(body, ctx, tickets);
        }));
    }
    async function renderTickets(body, ctx) {
        body.innerHTML = loading("Loading tickets…");
        const data = await loadTickets(ctx);
        paintTicketList(body, ctx, data.tickets || [], "all", "");
    }
    function paintTicketList(body, ctx, tickets, filter, query) {
        let rows = filter === "all" ? tickets : tickets.filter(t => t.status === filter);
        if (query) {
            const q = query.toLowerCase();
            rows = rows.filter(t => (t.subject || "").toLowerCase().includes(q) || (t.openedBy || "").toLowerCase().includes(q) || String(t.number ?? t.id).includes(q));
        }
        body.innerHTML = `
      <div class="ticket-toolbar">
        <div class="ticket-filters">
          <span class="filter-chip ${filter === "all" ? "active" : ""}" data-f="all">All</span>
          <span class="filter-chip ${filter === "open" ? "active" : ""}" data-f="open">Open</span>
          <span class="filter-chip ${filter === "pending" ? "active" : ""}" data-f="pending">Pending</span>
          <span class="filter-chip ${filter === "closed" ? "active" : ""}" data-f="closed">Closed</span>
        </div>
        <input type="text" class="search-input" id="tt-search" placeholder="Search by number, subject, or opener…" value="${esc(query)}">
      </div>
      <div class="ticket-table">
        <div class="ticket-row head" style="grid-template-columns:70px 1fr 220px 120px 100px"><span>#</span><span>Subject</span><span>Opened by</span><span class="col-created">Created</span><span>Status</span></div>
        ${rows.length === 0
            ? `<div class="empty-state">${DC.icon("ticket-off", 28)}No tickets match.</div>`
            : rows.map(t => `
            <div class="ticket-row ticket-row-clickable" style="grid-template-columns:70px 1fr 220px 120px 100px" data-open-ticket="${t.id}" title="View ticket">
              <span>#${esc(String(t.number ?? t.id))}</span><span>${esc(t.subject || "No subject")}${t.priority && t.priority !== "normal" ? ` <span class="priority-badge priority-${esc(t.priority)}">${esc(t.priority)}</span>` : ""}</span><span>${ctx.openerPreviewHtml(t)}</span>
              <span class="col-created">${t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "—"}</span>
              <span class="badge badge-${t.status}">${t.status}</span>
            </div>`).join("")}
      </div>`;
        body.querySelectorAll("[data-f]").forEach(chip => chip.addEventListener("click", () => paintTicketList(body, ctx, tickets, chip.dataset.f, body.querySelector("#tt-search")?.value || "")));
        body.querySelector("#tt-search")?.addEventListener("input", (e) => paintTicketList(body, ctx, tickets, filter, e.target.value));
        body.querySelectorAll("[data-open-ticket]").forEach(row => row.addEventListener("click", () => ctx.navigateToTicket(row.dataset.openTicket)));
    }
    async function renderSubjects(body, ctx) {
        body.innerHTML = loading();
        await ensureMeta(ctx);
        await loadSubjects(ctx);
        paintSubjects(body, ctx);
    }
    const PRIORITY_LABELS = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
    const PERMISSION_FIELDS = [
        { key: "manageChannels", label: "Manage Channels", hint: "Allows editing the channel name, topic, and settings" },
        { key: "addReactions", label: "Add Reactions", hint: "Allows adding new reactions to messages" },
        { key: "viewChannel", label: "View Channel", hint: "Allows viewing the ticket channel" },
        { key: "sendMessages", label: "Send Messages", hint: "Allows sending messages in the ticket" },
        { key: "sendTtsMessages", label: "Send TTS Messages", hint: "Allows sending text-to-speech messages" },
        { key: "manageMessages", label: "Manage Messages", hint: "Allows deleting and pinning messages" },
        { key: "embedLinks", label: "Embed Links", hint: "Allows links to show embeds" },
        { key: "attachFiles", label: "Attach Files", hint: "Allows uploading files and images" },
        { key: "readMessageHistory", label: "Read Message History", hint: "Allows reading previous messages in the channel" },
        { key: "mentionEveryone", label: "Mention Everyone", hint: "Allows using @everyone and @here mentions" },
        { key: "useExternalEmojis", label: "Use External Emojis", hint: "Allows using emojis from other servers" },
    ];
    function defaultUserPerms() {
        return { manageChannels: "deny", addReactions: "deny", viewChannel: "allow", sendMessages: "allow", sendTtsMessages: "deny", manageMessages: "deny", embedLinks: "deny", attachFiles: "deny", readMessageHistory: "allow", mentionEveryone: "deny", useExternalEmojis: "deny" };
    }
    function defaultStaffPerms() {
        return { manageChannels: "allow", addReactions: "allow", viewChannel: "allow", sendMessages: "allow", sendTtsMessages: "deny", manageMessages: "allow", embedLinks: "allow", attachFiles: "allow", readMessageHistory: "allow", mentionEveryone: "deny", useExternalEmojis: "allow" };
    }
    function paintSubjects(body, ctx) {
        body.innerHTML = `
      <div class="dash-header" style="margin-bottom:14px">
        <div><h3 style="font-size:14px;font-weight:700">Ticket Subjects</h3><p style="font-size:12.5px;color:var(--text-dim);margin-top:2px">Reusable subjects, messages, and defaults — connect them to buttons on your Ticket Panel.</p></div>
        <div style="display:flex;gap:8px"><button class="btn btn-ghost btn-small" id="tt-export-settings">${DC.icon("download")} Export</button><button class="btn btn-ghost btn-small" id="tt-import-settings">${DC.icon("upload")} Import</button></div>
        <button class="btn btn-primary btn-small" id="tt-new-subject">✨ New subject</button>
      </div>
      <div class="ticket-toolbar" style="margin-bottom:12px">
        <div class="ticket-filters">
          <span class="filter-chip active" data-tf="all">All</span>
          <span class="filter-chip" data-tf="active">Active</span>
          <span class="filter-chip" data-tf="disabled">Disabled</span>
        </div>
        <input type="text" class="search-input" id="tt-subject-search" placeholder="Search templates…">
      </div>
      <div id="tt-subject-list"></div>
      <div id="tt-subject-editor"></div>`;
        document.getElementById("tt-new-subject")?.addEventListener("click", () => openSubjectEditor(ctx, null));
        let filter = "all", query = "";
        body.querySelectorAll("[data-tf]").forEach(chip => chip.addEventListener("click", () => {
            filter = chip.dataset.tf;
            body.querySelectorAll("[data-tf]").forEach(c => c.classList.toggle("active", c === chip));
            paintSubjectList(ctx, filter, query);
        }));
        document.getElementById("tt-subject-search")?.addEventListener("input", (e) => { query = e.target.value; paintSubjectList(ctx, filter, query); });
        paintSubjectList(ctx, filter, query);
    }
    function paintSubjectList(ctx, filter = "all", query = "") {
        const list = document.getElementById("tt-subject-list");
        if (!list)
            return;
        let rows = state.subjects;
        if (filter === "active")
            rows = rows.filter(s => s.active);
        if (filter === "disabled")
            rows = rows.filter(s => !s.active);
        if (query) {
            const q = query.toLowerCase();
            rows = rows.filter(s => s.name.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q));
        }
        if (state.subjects.length === 0) {
            list.innerHTML = `<div class="empty-state">${DC.icon("tag-off", 28)}No ticket subjects yet. Create one to define a ticket's subject, message, and defaults.</div>`;
            return;
        }
        if (rows.length === 0) {
            list.innerHTML = `<div class="empty-state">${DC.icon("search-off", 28)}No subjects match.</div>`;
            return;
        }
        list.innerHTML = rows.map(s => `
      <div class="subject-card">
        <div class="subject-card-main">
          <div class="subject-card-name">${s.icon ? esc(s.icon) + " " : ""}${esc(s.name)} ${s.priority && s.priority !== "normal" ? `<span class="priority-badge priority-${esc(s.priority)}">${esc(PRIORITY_LABELS[s.priority] || s.priority)}</span>` : ""}</div>
          <div class="subject-card-desc">${esc(s.description || "No description")}</div>
        </div>
        <div class="subject-card-actions">
          <button class="toggle ${s.active ? "on" : ""}" data-toggle="${s.id}" aria-label="Toggle active"></button>
          <button class="icon-btn" data-dup="${s.id}" title="Duplicate" aria-label="Duplicate">${DC.icon("copy")}</button>
          <button class="icon-btn" data-edit="${s.id}" title="Edit" aria-label="Edit">${DC.icon("edit")}</button>
          <button class="icon-btn icon-btn-emoji danger" data-del="${s.id}" title="Delete" aria-label="Delete">${DC.icon("trash")}</button>
        </div>
      </div>`).join("");
        list.querySelectorAll("[data-toggle]").forEach(btn => btn.addEventListener("click", async () => {
            const s = state.subjects.find(x => x.id === btn.dataset.toggle);
            btn.classList.toggle("on");
            try {
                await ctx.api(`/guilds/${ctx.guildId}/subjects/${s.id}`, { method: "PUT", body: JSON.stringify({ active: !s.active }) });
                s.active = !s.active;
            }
            catch {
                btn.classList.toggle("on");
            }
        }));
        list.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => openSubjectEditor(ctx, state.subjects.find(x => x.id === btn.dataset.edit))));
        list.querySelectorAll("[data-dup]").forEach(btn => btn.addEventListener("click", async () => {
            const s = state.subjects.find(x => x.id === btn.dataset.dup);
            if (!s)
                return;
            try {
                await ctx.api(`/guilds/${ctx.guildId}/subjects`, { method: "POST", body: JSON.stringify({
                        name: `${s.name} (copy)`, description: s.description, category: s.category, active: false,
                        welcomeMessage: s.welcomeMessage, closeMessage: s.closeMessage, staffRoles: s.staffRoles,
                        icon: s.icon, priority: s.priority,
                    }) });
                await loadSubjects(ctx);
                paintSubjectList(ctx, filter, query);
            }
            catch (e) {
                await ctx.modal.alert(`Couldn't duplicate: ${e.message}`);
            }
        }));
        list.querySelectorAll("[data-del]").forEach(btn => btn.addEventListener("click", async () => {
            const ok = await ctx.modal.confirm("Buttons on your Ticket Panel that use it will stop working until reassigned.", { title: "Delete this subject?", confirmLabel: "Delete", danger: true });
            if (!ok)
                return;
            try {
                await ctx.api(`/guilds/${ctx.guildId}/subjects/${btn.dataset.del}`, { method: "DELETE" });
                await loadSubjects(ctx);
                paintSubjectList(ctx, filter, query);
            }
            catch { }
        }));
    }
    function openSubjectEditor(ctx, subject) {
        const slot = document.getElementById("tt-subject-editor");
        const draft = {
            name: subject?.name || "",
            description: subject?.description || "",
            category: subject?.category || "",
            active: subject ? subject.active : true,
            staffRoles: subject?.staffRoles ? [...subject.staffRoles] : [],
            welcomeMessage: subject?.welcomeMessage || "{user.mention} welcome — **{subject.name}**. Describe your issue and support will be with you shortly.",
            closeMessage: subject?.closeMessage || "This ticket has been closed. Thanks for reaching out!",
            icon: subject?.icon || "",
            priority: subject?.priority || "normal",
            ticketNameFormat: subject?.ticketNameFormat || "",
            defaultCategoryId: subject?.defaultCategoryId || "",
            autoMoveEnabled: subject?.autoMoveEnabled ?? false,
            waitingCategoryId: subject?.waitingCategoryId || "",
            roleRestrictionMode: subject?.roleRestrictionMode || "allow",
            restrictedRoles: subject?.restrictedRoles ? [...subject.restrictedRoles] : [],
            maxTicketsPerUser: subject?.maxTicketsPerUser ?? 1,
            maxTicketsPerUserEnabled: subject?.maxTicketsPerUserEnabled ?? false,
            maxTotalTickets: subject?.maxTotalTickets ?? 0,
            maxTotalTicketsEnabled: subject?.maxTotalTicketsEnabled ?? false,
            creationCooldownEnabled: subject?.creationCooldownEnabled ?? false,
            creationCooldownValue: subject?.creationCooldownValue ?? 60,
            creationCooldownUnit: subject?.creationCooldownUnit || "Seconds",
            closeRestriction: subject?.closeRestriction || "owner",
            userPermissions: subject?.userPermissions || defaultUserPerms(),
            staffPermissions: subject?.staffPermissions || defaultStaffPerms(),
            claimerPermissions: subject?.claimerPermissions || defaultStaffPerms(),
            aiEnabled: subject?.aiEnabled ?? false,
            formsEnabled: subject?.formsEnabled ?? false,
            formQuestions: subject?.formQuestions ? [...subject.formQuestions] : [],
            autoCloseEnabled: subject?.autoCloseEnabled ?? false,
            autoCloseHours: subject?.autoCloseHours ?? 24,
            storageRetentionDays: subject?.storageRetentionDays ?? 30,
            logChannelId: subject?.logChannelId || "",
            logTicketCreation: subject?.logTicketCreation ?? true,
            logTicketClaims: subject?.logTicketClaims ?? true,
            logTicketClosure: subject?.logTicketClosure ?? true,
            logMemberChanges: subject?.logMemberChanges ?? true,
            logRainbowColors: subject?.logRainbowColors ?? true,
        };
        let activeSection = "general";
        const sections = [
            { id: "general", icon: "settings", label: "General", sub: "Name, status, staff roles" },
            { id: "categories", icon: "category-2", label: "Categories", sub: "Channel organization" },
            { id: "messages", icon: "message", label: "Messages", sub: "Welcome & close messages" },
            { id: "ai", icon: "sparkles", label: "AI", sub: "AI knowledgebase & training", badge: "Premium" },
            { id: "forms", icon: "clipboard-list", label: "Forms", sub: "Pre-ticket questions", badge: "Premium" },
            { id: "automation", icon: "bolt", label: "Automation", sub: "Auto-close, notifications", badge: "Premium" },
            { id: "access", icon: "shield", label: "Access Control", sub: "Role limits & cooldowns" },
            { id: "permissions", icon: "lock", label: "Permissions", sub: "Channel permissions" },
            { id: "storage", icon: "storage", label: "Storage", sub: "File retention", badge: "Premium" },
            { id: "logging", icon: "file-text", label: "Logging", sub: "Log channels", badge: "Enterprise" },
            { id: "preview", icon: "eye", label: "Preview", sub: "How this subject will look" },
        ];
        let dirty = false;
        function markDirty() { if (!dirty) {
            dirty = true;
            const s = document.getElementById("ed-save");
            if (s)
                s.innerHTML = `${subject ? "Save changes" : "Create subject"} <span class="unsaved-dot"></span>`;
        } }
        function renderShell() {
            slot.innerHTML = `
        <div class="editor-panel" style="padding:0">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid var(--panel-border);border-radius:12px 12px 0 0">
            <h3 style="font-size:14px;font-weight:700">${subject ? esc(subject.name) : "New subject"} <span style="color:var(--text-dim);font-weight:400">· ${sections.find(s => s.id === activeSection).label}</span></h3>
            <div style="display:flex;align-items:center;gap:10px">
              <span class="field-hint" id="ed-save-feedback" style="margin:0"></span>
              <button class="btn btn-primary btn-small" id="ed-save">${subject ? "Save changes" : "Create subject"}</button>
              <button class="btn btn-ghost btn-small" id="ed-cancel">Cancel</button>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:220px 1fr">
            <div style="border-right:1px solid var(--panel-border);padding:10px">
              ${sections.map(s => `
                <div class="settings-nav-item ${s.id === activeSection ? "active" : ""}" data-section="${s.id}">
                  ${DC.icon(s.icon)}
                  <div><div class="settings-nav-label">${s.label}${s.badge ? ` <span class="tier-badge tier-${s.badge.toLowerCase()}">${s.badge}</span>` : ""}</div><div class="settings-nav-sub">${s.sub}</div></div>
                </div>`).join("")}
            </div>
            <div id="ed-section-body" style="padding:20px"></div>
          </div>
        </div>`;
            slot.querySelectorAll("[data-section]").forEach(el => el.addEventListener("click", () => {
                activeSection = el.dataset.section;
                renderShell();
            }));
            document.getElementById("ed-cancel")?.addEventListener("click", async () => {
                if (dirty && !(await ctx.modal.confirm("Discard unsaved changes?", { title: "Discard changes?", confirmLabel: "Discard", danger: true })))
                    return;
                slot.innerHTML = "";
            });
            document.getElementById("ed-save")?.addEventListener("click", saveSubject);
            const renderers = { general: renderGeneralSection, categories: renderCategoriesSection, messages: renderMessagesSection, ai: renderAiSection, forms: renderFormsSection, automation: renderAutomationSection, access: renderAccessSection, permissions: renderPermissionsSection, storage: renderStorageSection, logging: renderLoggingSection, preview: renderPreviewSection };
            renderers[activeSection]();
        }
        function renderGeneralSection() {
            const body = document.getElementById("ed-section-body");
            body.innerHTML = `
        <div class="settings-section-block">
          <h4>${DC.icon("settings")} Subject Information</h4>
          <div class="settings-section-hint">Basic details about this ticket subject</div>
          <div class="field-row-inline" style="gap:12px;align-items:flex-end">
            <div class="field" style="width:70px;margin-bottom:0"><label>Icon</label><input type="text" id="ed-icon" value="${esc(draft.icon)}" maxlength="8" placeholder="" style="text-align:center"></div>
            <div class="field" style="flex:1;margin-bottom:0"><label>Subject Name</label><input type="text" id="ed-name" value="${esc(draft.name)}" maxlength="120" placeholder="e.g. Technical Support"></div>
          </div>
          <div class="field-row-inline" style="margin-top:14px">
            <div><div class="config-row-label">Active</div><div class="field-hint" style="margin-top:0">When enabled, this subject can be connected to Ticket Panel buttons</div></div>
            <button class="toggle ${draft.active ? "on" : ""}" id="ed-active-toggle" aria-label="Toggle active"></button>
          </div>
          <div class="field" style="margin-top:14px"><label>Description</label><textarea id="ed-desc" placeholder="Shown to users when picking this option" style="min-height:44px">${esc(draft.description)}</textarea></div>
          <div class="field" style="margin-top:14px;max-width:220px"><label>Default priority</label><div id="ed-priority"></div></div>
          <div class="field" style="margin-top:14px">
            <label>Ticket Name Format</label>
            <input type="text" id="ed-name-format" value="${esc(draft.ticketNameFormat)}" placeholder="{subject.name}-{user.name}" maxlength="90">
            <div class="field-hint">Type { to insert placeholders like subject name, username, or ticket number. Leave blank to use the server default.</div>
          </div>
        </div>
        <div class="settings-section-block">
          <div class="field-row-inline" style="align-items:flex-start">
            <div>
              <h4>${DC.icon("users")} Staff Management</h4>
              <div class="settings-section-hint" style="margin-top:2px">Members with these roles can view and respond to tickets from this subject</div>
            </div>
            <button class="btn btn-ghost btn-small" id="ed-roles-refresh">${DC.icon("refresh")} Refresh</button>
          </div>
          <label style="font-size:12px;font-weight:600;color:var(--text-dim);display:block;margin:10px 0 6px">Staff Roles</label>
          <div id="ed-staff-roles"></div>
        </div>`;
            document.getElementById("ed-icon")?.addEventListener("input", (e) => { draft.icon = e.target.value; markDirty(); });
            document.getElementById("ed-name")?.addEventListener("input", (e) => { draft.name = e.target.value; markDirty(); });
            document.getElementById("ed-desc")?.addEventListener("input", (e) => { draft.description = e.target.value; markDirty(); });
            document.getElementById("ed-active-toggle")?.addEventListener("click", (e) => { draft.active = !draft.active; e.target.classList.toggle("on"); markDirty(); });
            document.getElementById("ed-name-format")?.addEventListener("input", (e) => { draft.ticketNameFormat = e.target.value; markDirty(); });
            const roleOptions = () => (state.meta?.roles || []).map(r => ({ value: r.id, label: r.name, icon: `<span class="role-dot" style="background:${r.color || "#99aab5"}"></span>` }));
            const staffDrop = window.DC.createDropdown(document.getElementById("ed-staff-roles"), {
                options: roleOptions(),
                values: draft.staffRoles,
                multi: true,
                searchable: true,
                placeholder: "Select roles…",
                onChange: (vals) => { draft.staffRoles = vals; markDirty(); },
            });
            document.getElementById("ed-roles-refresh")?.addEventListener("click", async () => {
                try {
                    state.meta = await ctx.api(`/guilds/${ctx.guildId}/meta`);
                    staffDrop.setValues(draft.staffRoles);
                }
                catch { }
            });
            const prioDrop = window.DC.createDropdown(document.getElementById("ed-priority"), {
                options: [
                    { value: "low", label: "Low" },
                    { value: "normal", label: "Normal" },
                    { value: "high", label: "High" },
                    { value: "urgent", label: "Urgent" },
                ],
                value: draft.priority,
            });
            prioDrop.onChange(val => { draft.priority = val; markDirty(); });
        }
        function renderPreviewSection() {
            const body = document.getElementById("ed-section-body");
            body.innerHTML = `
        <div class="settings-section-hint" style="margin-bottom:12px">This is what the subject looks like as a ticket-panel option, and what a new ticket's opening message will say.</div>
        <div class="subject-preview-card">
          <div class="subject-preview-row">
            <span class="subject-preview-icon">${esc(draft.icon || "")}</span>
            <div>
              <div class="subject-preview-name">${esc(draft.name || "Untitled subject")} ${draft.priority !== "normal" ? `<span class="priority-badge priority-${esc(draft.priority)}">${esc(PRIORITY_LABELS[draft.priority])}</span>` : ""}</div>
              <div class="subject-preview-desc">${esc(draft.description || "No description")}</div>
            </div>
          </div>
        </div>
        <div class="embed-msg" style="margin-top:16px">
          <div class="embed-msg-header">
            <div class="embed-msg-avatar"></div>
            <div><span class="embed-msg-author">NEXORIA<span class="embed-msg-tag">APP</span></span><span class="embed-msg-time">Today</span></div>
          </div>
          <div class="embed-msg-plain">${esc(renderTemplatePreview(draft.welcomeMessage, draft.name))}</div>
        </div>`;
        }
        function renderTemplatePreview(tpl, name) {
            return (tpl || "").replace(/\{user\.mention\}/g, "@you").replace(/\{user\.name\}/g, "you").replace(/\{subject\.name\}/g, name || "this subject").replace(/\{ticket\.id\}/g, "1");
        }
        function renderCategoriesSection() {
            const body = document.getElementById("ed-section-body");
            body.innerHTML = `
        <div class="settings-section-block">
          <h4>${DC.icon("category-2")} Ticket Category</h4>
          <div class="settings-section-hint">Choose where new tickets are created</div>
          <div class="field"><label>Default Category</label><div id="ed-category"></div></div>
        </div>
        <div class="settings-section-block">
          <div class="field-row-inline" style="align-items:flex-start">
            <div>
              <h4>${DC.icon("transfer")} Auto-Move Tickets</h4>
              <div class="settings-section-hint" style="margin-top:2px">Automatically organize tickets based on who needs to respond</div>
            </div>
          </div>
          <div class="field-row-inline" style="margin-top:10px">
            <div><div class="config-row-label">Enable Auto-Move</div><div class="field-hint" style="margin-top:0">Move tickets between categories when staff or user responds</div></div>
            <button class="toggle ${draft.autoMoveEnabled ? "on" : ""}" id="ed-automove-toggle" aria-label="Toggle auto-move"></button>
          </div>
          <div class="field" style="margin-top:14px"><label>Waiting for Staff Category</label><div id="ed-waiting-category"></div><div class="field-hint">Move tickets here when waiting for staff to respond</div></div>
        </div>`;
            const catDrop = window.DC.createDropdown(document.getElementById("ed-category"), {
                options: [{ value: "", label: "No category" }, ...(state.meta?.categories || []).map(c => ({ value: c.id, label: c.name }))],
                value: draft.category,
                placeholder: "No category",
            });
            catDrop.onChange(val => { draft.category = val; markDirty(); });
            document.getElementById("ed-automove-toggle")?.addEventListener("click", (e) => { draft.autoMoveEnabled = !draft.autoMoveEnabled; e.target.classList.toggle("on"); markDirty(); });
            const waitDrop = window.DC.createDropdown(document.getElementById("ed-waiting-category"), {
                options: [{ value: "", label: "No category" }, ...(state.meta?.categories || []).map(c => ({ value: c.id, label: c.name }))],
                value: draft.waitingCategoryId,
                placeholder: "No category",
            });
            waitDrop.onChange(val => { draft.waitingCategoryId = val; markDirty(); });
        }
        function renderMessagesSection() {
            const body = document.getElementById("ed-section-body");
            body.innerHTML = `
        <div class="settings-section-block">
          <h4>${DC.icon("message")} Welcome Message</h4>
          <div class="settings-section-hint">The first message sent when a ticket is created</div>
          <textarea id="ed-welcome" placeholder="{user.mention} welcome — describe your issue">${esc(draft.welcomeMessage)}</textarea>
          <div class="field-hint">Type { to see every available variable, or just write one out yourself.</div>
        </div>
        <div class="settings-section-block">
          <h4>${DC.icon("mail")} Close Message</h4>
          <div class="settings-section-hint">DM'd to the ticket owner when their ticket is closed</div>
          <textarea id="ed-close" placeholder="Thanks for reaching out!">${esc(draft.closeMessage)}</textarea>
          <div class="field-hint">Type { to see every available variable, or just write one out yourself.</div>
        </div>`;
            document.getElementById("ed-welcome")?.addEventListener("input", (e) => { draft.welcomeMessage = e.target.value; markDirty(); });
            document.getElementById("ed-close")?.addEventListener("input", (e) => { draft.closeMessage = e.target.value; markDirty(); });
            if (window.DC.attachVariableEditor) {
                window.DC.attachVariableEditor(document.getElementById("ed-welcome"));
                window.DC.attachVariableEditor(document.getElementById("ed-close"));
            }
        }
        function renderAiSection() {
            const body = document.getElementById("ed-section-body");
            body.innerHTML = `
        <div class="settings-section-block">
          <div class="field-row-inline">
            <div><h4>${DC.icon("sparkles")} AI Knowledgebase <span class="tier-badge tier-premium">Premium</span></h4><div class="settings-section-hint" style="margin-top:2px">Let AI answer common questions automatically before staff step in</div></div>
            <button class="toggle ${draft.aiEnabled ? "on" : ""}" id="ed-ai-toggle" aria-label="Toggle AI"></button>
          </div>
          <div class="field" style="margin-top:14px"><label>Training material</label><textarea placeholder="Paste FAQs, docs, or common answers here for the AI to learn from…" style="min-height:120px"></textarea></div>
          <div class="field-hint">The AI will only respond using what you provide here — it won't make anything up beyond this.</div>
        </div>`;
            document.getElementById("ed-ai-toggle")?.addEventListener("click", (e) => { draft.aiEnabled = !draft.aiEnabled; e.target.classList.toggle("on"); markDirty(); });
        }
        function renderFormsSection() {
            const body = document.getElementById("ed-section-body");
            body.innerHTML = `
        <div class="settings-section-block">
          <div class="field-row-inline">
            <div><h4>${DC.icon("clipboard-list")} Pre-Ticket Questions <span class="tier-badge tier-premium">Premium</span></h4><div class="settings-section-hint" style="margin-top:2px">Ask questions before the ticket channel is created, so staff have context immediately</div></div>
            <button class="toggle ${draft.formsEnabled ? "on" : ""}" id="ed-forms-toggle" aria-label="Toggle forms"></button>
          </div>
          <div id="ed-form-questions" style="margin-top:12px"></div>
          <button class="btn btn-ghost btn-small" id="ed-form-add" style="margin-top:8px">${DC.icon("plus")} Add question</button>
        </div>`;
            document.getElementById("ed-forms-toggle")?.addEventListener("click", (e) => { draft.formsEnabled = !draft.formsEnabled; e.target.classList.toggle("on"); markDirty(); });
            paintFormQuestions();
            document.getElementById("ed-form-add")?.addEventListener("click", () => { draft.formQuestions.push({ label: "", required: true }); markDirty(); paintFormQuestions(); });
            function paintFormQuestions() {
                const wrap = document.getElementById("ed-form-questions");
                wrap.innerHTML = draft.formQuestions.length === 0
                    ? `<div class="field-hint">No questions yet — users will go straight into the ticket channel.</div>`
                    : draft.formQuestions.map((q, i) => `
            <div class="field-row-inline" style="margin-bottom:8px;gap:8px">
              <input type="text" data-q-idx="${i}" value="${esc(q.label)}" placeholder="e.g. What's your issue about?" style="flex:1">
              <button class="btn btn-ghost btn-small" data-q-remove="${i}">${DC.icon("trash")}</button>
            </div>`).join("");
                wrap.querySelectorAll("[data-q-idx]").forEach(inp => inp.addEventListener("input", (e) => { draft.formQuestions[+e.target.dataset.qIdx].label = e.target.value; markDirty(); }));
                wrap.querySelectorAll("[data-q-remove]").forEach(btn => btn.addEventListener("click", () => { draft.formQuestions.splice(+btn.dataset.qRemove, 1); markDirty(); paintFormQuestions(); }));
            }
        }
        function renderAutomationSection() {
            const body = document.getElementById("ed-section-body");
            body.innerHTML = `
        <div class="settings-section-block">
          <div class="field-row-inline">
            <div><h4>${DC.icon("bolt")} Auto-Close <span class="tier-badge tier-premium">Premium</span></h4><div class="settings-section-hint" style="margin-top:2px">Automatically close tickets after a period of inactivity</div></div>
            <button class="toggle ${draft.autoCloseEnabled ? "on" : ""}" id="ed-autoclose-toggle" aria-label="Toggle auto-close"></button>
          </div>
          <div class="field-row-inline" style="margin-top:14px;max-width:220px">
            <input type="number" id="ed-autoclose-hours" value="${draft.autoCloseHours}" min="1" style="width:100%">
          </div>
          <div class="field-hint">Hours of inactivity before a ticket auto-closes</div>
        </div>`;
            document.getElementById("ed-autoclose-toggle")?.addEventListener("click", (e) => { draft.autoCloseEnabled = !draft.autoCloseEnabled; e.target.classList.toggle("on"); markDirty(); });
            document.getElementById("ed-autoclose-hours")?.addEventListener("input", (e) => { draft.autoCloseHours = +e.target.value || 24; markDirty(); });
        }
        function renderAccessSection() {
            const body = document.getElementById("ed-section-body");
            body.innerHTML = `
        <div class="settings-section-block">
          <h4>${DC.icon("lock")} Role Restrictions</h4>
          <div class="settings-section-hint">Limit which roles can create tickets in this subject</div>
          <div class="field-row-inline" style="margin:10px 0">
            <span class="field-hint" style="margin:0">
              ${draft.roleRestrictionMode === "allow" ? DC.icon("shield-check") : DC.icon("shield-x")}
              <strong style="color:${draft.roleRestrictionMode === "allow" ? "var(--green)" : "var(--red)"}">${draft.roleRestrictionMode === "allow" ? "Allow" : "Disallow"}</strong> selected roles to create tickets
            </span>
            <button class="btn-link-inline" id="ed-restrict-toggle">Change to ${draft.roleRestrictionMode === "allow" ? "Disallow" : "Allow"}</button>
          </div>
          <div id="ed-restricted-roles"></div>
        </div>
        <div class="settings-section-block">
          <h4>${DC.icon("users")} Ticket Limits</h4>
          <div class="settings-section-hint">Limit how many tickets can be open</div>
          <div class="field-row-inline" style="margin-top:10px">
            <div><div class="config-row-label">Max Tickets Per User <span class="tier-badge tier-premium">Premium</span></div><div class="field-hint" style="margin-top:0">Limit how many open tickets each user can have</div></div>
            <button class="toggle ${draft.maxTicketsPerUserEnabled ? "on" : ""}" id="ed-maxuser-toggle" aria-label="Toggle max per user"></button>
          </div>
          <div class="field-row-inline" style="margin-top:8px;max-width:150px"><input type="number" id="ed-maxuser-val" value="${draft.maxTicketsPerUser}" min="1"><span class="field-hint" style="margin:0">tickets</span></div>
          <div class="field-row-inline" style="margin-top:16px">
            <div><div class="config-row-label">Max Total Tickets <span class="tier-badge tier-premium">Premium</span></div><div class="field-hint" style="margin-top:0">Limit total open tickets for this subject</div></div>
            <button class="toggle ${draft.maxTotalTicketsEnabled ? "on" : ""}" id="ed-maxtotal-toggle" aria-label="Toggle max total"></button>
          </div>
        </div>
        <div class="settings-section-block">
          <h4>${DC.icon("clock")} Cooldowns</h4>
          <div class="settings-section-hint">Add a waiting period between ticket creation</div>
          <div class="field-row-inline" style="margin-top:10px">
            <div><div class="config-row-label">Creation Cooldown <span class="tier-badge tier-premium">Premium</span></div><div class="field-hint" style="margin-top:0">Users must wait this long before creating another ticket</div></div>
            <button class="toggle ${draft.creationCooldownEnabled ? "on" : ""}" id="ed-cooldown-toggle" aria-label="Toggle cooldown"></button>
          </div>
          <div class="field-row-inline" style="margin-top:8px;gap:8px;max-width:280px">
            <input type="number" id="ed-cooldown-val" value="${draft.creationCooldownValue}" min="1" style="flex:1">
            <div id="ed-cooldown-unit" style="flex:1"></div>
          </div>
        </div>
        <div class="settings-section-block">
          <h4>${DC.icon("door-exit")} Close Restrictions</h4>
          <div class="settings-section-hint">Control who can close tickets</div>
          <div class="field" style="margin-top:10px;max-width:280px"><label>Who Can Close</label><div id="ed-close-restriction"></div></div>
        </div>`;
            const restrictedDrop = window.DC.createDropdown(document.getElementById("ed-restricted-roles"), {
                options: (state.meta?.roles || []).map(r => ({ value: r.id, label: r.name, icon: `<span class="role-dot" style="background:${r.color || "#99aab5"}"></span>` })),
                values: draft.restrictedRoles, multi: true, searchable: true, placeholder: "Select roles…",
                onChange: (vals) => { draft.restrictedRoles = vals; markDirty(); },
            });
            document.getElementById("ed-restrict-toggle")?.addEventListener("click", () => { draft.roleRestrictionMode = draft.roleRestrictionMode === "allow" ? "disallow" : "allow"; markDirty(); renderAccessSection(); });
            document.getElementById("ed-maxuser-toggle")?.addEventListener("click", (e) => { draft.maxTicketsPerUserEnabled = !draft.maxTicketsPerUserEnabled; e.target.classList.toggle("on"); markDirty(); });
            document.getElementById("ed-maxuser-val")?.addEventListener("input", (e) => { draft.maxTicketsPerUser = +e.target.value || 1; markDirty(); });
            document.getElementById("ed-maxtotal-toggle")?.addEventListener("click", (e) => { draft.maxTotalTicketsEnabled = !draft.maxTotalTicketsEnabled; e.target.classList.toggle("on"); markDirty(); });
            document.getElementById("ed-cooldown-toggle")?.addEventListener("click", (e) => { draft.creationCooldownEnabled = !draft.creationCooldownEnabled; e.target.classList.toggle("on"); markDirty(); });
            document.getElementById("ed-cooldown-val")?.addEventListener("input", (e) => { draft.creationCooldownValue = +e.target.value || 60; markDirty(); });
            const unitDrop = window.DC.createDropdown(document.getElementById("ed-cooldown-unit"), {
                options: [{ value: "Seconds", label: "Seconds" }, { value: "Minutes", label: "Minutes" }, { value: "Hours", label: "Hours" }],
                value: draft.creationCooldownUnit,
            });
            unitDrop.onChange(val => { draft.creationCooldownUnit = val; markDirty(); });
            const closeDrop = window.DC.createDropdown(document.getElementById("ed-close-restriction"), {
                options: [
                    { value: "owner", label: "Ticket Owner", sub: "Only the ticket creator" },
                    { value: "staff", label: "Staff Only", sub: "Anyone with a staff role" },
                    { value: "admin", label: "Admins Only", sub: "Administrator permission required" },
                ],
                value: draft.closeRestriction,
            });
            closeDrop.onChange(val => { draft.closeRestriction = val; markDirty(); });
        }
        function permGroupHtml(title, hint, permsKey, badge) {
            return `
        <div class="settings-section-block">
          <div class="field-row-inline">
            <div><h4>${DC.icon("users")} ${title}${badge ? ` <span class="tier-badge tier-premium">${badge}</span>` : ""}</h4><div class="settings-section-hint" style="margin-top:2px">${hint}</div></div>
            <button class="btn btn-ghost btn-small" data-perm-edit="${permsKey}">${DC.icon("adjustments")} Edit Permissions</button>
          </div>
        </div>`;
        }
        function renderPermissionsSection() {
            const body = document.getElementById("ed-section-body");
            body.innerHTML = `
        ${permGroupHtml("User Permissions", "Permissions for ticket authors and added members", "userPermissions")}
        ${permGroupHtml("Staff Permissions", "Permissions for staff members in tickets", "staffPermissions")}
        ${permGroupHtml("Claimer Permissions", "Permissions for staff who claim tickets", "claimerPermissions", "Premium")}`;
            body.querySelectorAll("[data-perm-edit]").forEach(btn => btn.addEventListener("click", () => openPermissionsPanel(btn.dataset.permEdit)));
        }
        function openPermissionsPanel(permsKey) {
            const titles = { userPermissions: "User Permissions", staffPermissions: "Staff Permissions", claimerPermissions: "Claimer Permissions" };
            const subs = { userPermissions: "Permissions for ticket authors and added members", staffPermissions: "Permissions for staff members in tickets", claimerPermissions: "Permissions for staff who claim tickets" };
            let overlay = document.getElementById("ed-perm-overlay");
            if (overlay)
                overlay.remove();
            overlay = document.createElement("div");
            overlay.id = "ed-perm-overlay";
            overlay.className = "side-panel-overlay";
            overlay.innerHTML = `
        <div class="side-panel">
          <div class="side-panel-header">
            <div><h3 style="font-size:15px;font-weight:700">${titles[permsKey]}</h3><p class="field-hint" style="margin-top:2px">${subs[permsKey]}</p></div>
            <button class="icon-btn" id="ed-perm-close" aria-label="Close">${DC.icon("x")}</button>
          </div>
          <div class="side-panel-body">
            ${PERMISSION_FIELDS.map(f => `
              <div class="perm-row">
                <div><div class="config-row-label">${f.label}</div><div class="field-hint" style="margin-top:0">${f.hint}</div></div>
                <div class="perm-tristate" data-perm-key="${f.key}">
                  <button class="perm-tristate-btn deny ${draft[permsKey][f.key] === "deny" ? "active" : ""}" data-perm-val="deny" title="Deny">${DC.icon("x")}</button>
                  <button class="perm-tristate-btn inherit ${draft[permsKey][f.key] === "inherit" ? "active" : ""}" data-perm-val="inherit" title="Inherit">/</button>
                  <button class="perm-tristate-btn allow ${draft[permsKey][f.key] === "allow" ? "active" : ""}" data-perm-val="allow" title="Allow">${DC.icon("check")}</button>
                </div>
              </div>`).join("")}
          </div>
          <div class="side-panel-footer"><button class="btn btn-primary btn-small" id="ed-perm-done">Close</button></div>
        </div>`;
            document.body.appendChild(overlay);
            overlay.addEventListener("click", (e) => { if (e.target === overlay)
                overlay.remove(); });
            document.getElementById("ed-perm-close")?.addEventListener("click", () => overlay.remove());
            document.getElementById("ed-perm-done")?.addEventListener("click", () => overlay.remove());
            overlay.querySelectorAll("[data-perm-key]").forEach(group => {
                group.querySelectorAll("[data-perm-val]").forEach(btn => btn.addEventListener("click", () => {
                    draft[permsKey][group.dataset.permKey] = btn.dataset.permVal;
                    group.querySelectorAll("[data-perm-val]").forEach(b => b.classList.toggle("active", b === btn));
                    markDirty();
                }));
            });
        }
        function renderStorageSection() {
            const body = document.getElementById("ed-section-body");
            body.innerHTML = `
        <div class="settings-section-block">
          <h4>${DC.icon("storage")} File Retention <span class="tier-badge tier-premium">Premium</span></h4>
          <div class="settings-section-hint">How long attachments uploaded in tickets are kept before being purged</div>
          <div class="field-row-inline" style="margin-top:14px;max-width:220px">
            <input type="number" id="ed-storage-days" value="${draft.storageRetentionDays}" min="1">
            <span class="field-hint" style="margin:0">days</span>
          </div>
        </div>`;
            document.getElementById("ed-storage-days")?.addEventListener("input", (e) => { draft.storageRetentionDays = +e.target.value || 30; markDirty(); });
        }
        function renderLoggingSection() {
            const body = document.getElementById("ed-section-body");
            body.innerHTML = `
        <div class="field-hint" style="margin-bottom:14px"><a href="#" style="color:var(--violet)">Enterprise Feature</a></div>
        <div class="settings-section-block">
          <h4>${DC.icon("hash")} Log Channel</h4>
          <div class="settings-section-hint">Select a channel to receive ticket event logs</div>
          <div class="field-row-inline" style="margin-top:10px">
            <div><div class="config-row-label">Log Channel <span class="tier-badge tier-enterprise">Enterprise</span></div><div class="field-hint" style="margin-top:0">All ticket events will be logged to this channel</div></div>
          </div>
          <div class="field" style="margin-top:8px"><div id="ed-log-channel"></div></div>
        </div>
        <div class="settings-section-block">
          <h4>${DC.icon("bell")} Event Logging</h4>
          <div class="settings-section-hint">Choose which events to log</div>
          ${loggingToggleRow("Log Ticket Creation", "Log when new tickets are created", "logTicketCreation")}
          ${loggingToggleRow("Log Ticket Claims", "Log when tickets are claimed by staff", "logTicketClaims")}
          ${loggingToggleRow("Log Ticket Closure", "Log when tickets are closed or deleted", "logTicketClosure")}
          ${loggingToggleRow("Log Member Changes", "Log when members are added or removed from tickets", "logMemberChanges")}
        </div>
        <div class="settings-section-block">
          <h4>${DC.icon("palette")} Log Appearance</h4>
          <div class="settings-section-hint">Customize how log messages appear</div>
          ${loggingToggleRow("Rainbow Colors", "Use colorful embed accents for different log events", "logRainbowColors")}
        </div>`;
            const logDrop = window.DC.createDropdown(document.getElementById("ed-log-channel"), {
                options: [{ value: "", label: "No channel" }, ...(state.meta?.channels || []).map(c => ({ value: c.id, label: `#${c.name}` }))],
                value: draft.logChannelId, placeholder: "Select a channel",
            });
            logDrop.onChange(val => { draft.logChannelId = val; markDirty(); });
            body.querySelectorAll("[data-log-toggle]").forEach(btn => btn.addEventListener("click", (e) => {
                const key = btn.dataset.logToggle;
                draft[key] = !draft[key];
                e.target.closest("button").classList.toggle("on");
                markDirty();
            }));
        }
        function loggingToggleRow(title, hint, key) {
            return `
        <div class="field-row-inline" style="margin-top:12px">
          <div><div class="config-row-label">${title} <span class="tier-badge tier-enterprise">Enterprise</span></div><div class="field-hint" style="margin-top:0">${hint}</div></div>
          <button class="toggle ${draft[key] ? "on" : ""}" data-log-toggle="${key}" aria-label="Toggle ${title}"></button>
        </div>`;
        }
        async function saveSubject() {
            const payload = {
                name: draft.name.trim() || "Untitled subject",
                description: draft.description.trim(),
                category: draft.category || null,
                active: draft.active,
                welcomeMessage: draft.welcomeMessage,
                closeMessage: draft.closeMessage,
                staffRoles: draft.staffRoles,
                icon: draft.icon.trim(),
                priority: draft.priority,
                ticketNameFormat: draft.ticketNameFormat.trim(),
                defaultCategoryId: draft.defaultCategoryId || null,
                autoMoveEnabled: draft.autoMoveEnabled,
                waitingCategoryId: draft.waitingCategoryId || null,
                roleRestrictionMode: draft.roleRestrictionMode,
                restrictedRoles: draft.restrictedRoles,
                maxTicketsPerUser: draft.maxTicketsPerUser,
                maxTicketsPerUserEnabled: draft.maxTicketsPerUserEnabled,
                maxTotalTickets: draft.maxTotalTickets,
                maxTotalTicketsEnabled: draft.maxTotalTicketsEnabled,
                creationCooldownEnabled: draft.creationCooldownEnabled,
                creationCooldownValue: draft.creationCooldownValue,
                creationCooldownUnit: draft.creationCooldownUnit,
                closeRestriction: draft.closeRestriction,
                userPermissions: draft.userPermissions,
                staffPermissions: draft.staffPermissions,
                claimerPermissions: draft.claimerPermissions,
                aiEnabled: draft.aiEnabled,
                formsEnabled: draft.formsEnabled,
                formQuestions: draft.formQuestions,
                autoCloseEnabled: draft.autoCloseEnabled,
                autoCloseHours: draft.autoCloseHours,
                storageRetentionDays: draft.storageRetentionDays,
                logChannelId: draft.logChannelId || null,
                logTicketCreation: draft.logTicketCreation,
                logTicketClaims: draft.logTicketClaims,
                logTicketClosure: draft.logTicketClosure,
                logMemberChanges: draft.logMemberChanges,
                logRainbowColors: draft.logRainbowColors,
            };
            const btn = document.getElementById("ed-save");
            const feedback = document.getElementById("ed-save-feedback");
            const prevLabel = btn.innerHTML;
            btn.disabled = true;
            btn.textContent = "Saving…";
            try {
                if (subject)
                    await ctx.api(`/guilds/${ctx.guildId}/subjects/${subject.id}`, { method: "PUT", body: JSON.stringify(payload) });
                else
                    await ctx.api(`/guilds/${ctx.guildId}/subjects`, { method: "POST", body: JSON.stringify(payload) });
                dirty = false;
                await loadSubjects(ctx);
                if (feedback)
                    feedback.innerHTML = `${DC.icon("check")} Saved`;
                setTimeout(() => {
                    slot.innerHTML = "";
                    const activeChip = document.querySelector("[data-tf].active");
                    paintSubjectList(ctx, activeChip?.dataset.tf || "all", document.getElementById("tt-subject-search")?.value || "");
                }, 500);
            }
            catch (e) {
                btn.disabled = false;
                btn.innerHTML = prevLabel;
                if (feedback)
                    feedback.innerHTML = `<span style="color:var(--red)">Couldn't save: ${esc(e.message)}</span>`;
            }
        }
        renderShell();
    }
    async function renderPanelsHome(body, ctx) {
        body.innerHTML = loading();
        await ensureMeta(ctx);
        await loadSubjects(ctx);
        await loadPanels(ctx);
        paintPanelsHome(body, ctx);
    }
    function resolvePanelButtons(panelCfg, subjects) {
        if (Array.isArray(panelCfg.buttons) && panelCfg.buttons.length > 0) {
            return panelCfg.buttons
                .map(b => {
                const s = subjects.find(x => x.id === b.subjectId && x.active);
                if (!s)
                    return null;
                return { subjectId: s.id, label: b.label || s.name, icon: b.icon ?? s.icon ?? "", description: b.description ?? s.description ?? "" };
            })
                .filter(Boolean);
        }
        return subjects.filter(s => s.active).map(s => ({ subjectId: s.id, label: s.name, icon: s.icon || "", description: s.description || "" }));
    }
    function paintPanelsHome(body, ctx) {
        body.innerHTML = `
      <div class="dash-header" style="margin-bottom:14px">
        <div><h3 style="font-size:14px;font-weight:700">Ticket Panel</h3><p style="font-size:12.5px;color:var(--text-dim);margin-top:2px">The user-facing message people click to open a ticket. Each panel's buttons connect to a Ticket Subject.</p></div>
        <button class="btn btn-primary btn-small" id="tt-create-panel">${DC.icon("plus")} Create Panel</button>
      </div>
      <div id="tt-panels-list">
        ${state.panels.length === 0
            ? `<div class="empty-state">${DC.icon("layout-board", 28)}No panels yet — create one so members can open tickets.</div>`
            : state.panels.map(p => paintPanelCard(p, ctx)).join("")}
      </div>`;
        document.getElementById("tt-create-panel")?.addEventListener("click", () => startWizard(body, ctx, null));
        wirePanelCardEvents(body, ctx);
    }
    function paintPanelCard(p, ctx) {
        const buttons = resolvePanelButtons(p, state.subjects);
        const posted = !!(p.channelId && p.messageId);
        return `
      <div class="panel-card-wrap" data-panel-card="${p.id}">
        <div class="panel-preview">
          ${embedPreviewHtml(p, buttons)}
        </div>
        <div class="panel-card-footer">
          <span class="field-hint" style="margin:0">
            ${p.style === "buttons" ? DC.icon("click") : DC.icon("list")} ${p.style === "buttons" ? "Buttons" : "Dropdown"}
            ${posted ? ` · #${esc(channelNameFor(ctx, p.channelId))} · posted ${timeAgo(p.postedAt)}` : ` · <span style="color:var(--amber)">not posted yet</span>`}
          </span>
          <div style="display:flex;gap:8px;align-items:center;position:relative">
            <button class="btn btn-ghost btn-small" data-panel-edit="${p.id}">${DC.icon("edit")} Edit</button>
            <button class="icon-btn" data-panel-menu="${p.id}" aria-label="More options">${DC.icon("kebab")}</button>
            <div class="kebab-menu" id="tt-menu-${p.id}" style="display:none">
              <button class="kebab-menu-item" data-panel-resend="${p.id}">${DC.icon("refresh")} Resend to Channel</button>
              <button class="kebab-menu-item danger" data-panel-delete="${p.id}">${DC.icon("trash")} Delete Post</button>
            </div>
          </div>
        </div>
      </div>`;
    }
    function timeAgo(iso) {
        if (!iso)
            return "";
        const diffMs = Date.now() - new Date(iso).getTime();
        const days = Math.floor(diffMs / 86400000);
        if (days >= 1)
            return `${days} day${days === 1 ? "" : "s"} ago`;
        const hours = Math.floor(diffMs / 3600000);
        if (hours >= 1)
            return `${hours} hour${hours === 1 ? "" : "s"} ago`;
        const mins = Math.max(1, Math.floor(diffMs / 60000));
        return `${mins} minute${mins === 1 ? "" : "s"} ago`;
    }
    function wirePanelCardEvents(body, ctx) {
        body.querySelectorAll("[data-panel-edit]").forEach(btn => btn.addEventListener("click", () => {
            const p = state.panels.find(x => x.id === btn.dataset.panelEdit);
            startWizard(body, ctx, p);
        }));
        function closeAllKebabMenus() { body.querySelectorAll(".kebab-menu").forEach(m => m.style.display = "none"); }
        function closeKebabOnOutsideClick(e) {
            if (!e.target.closest(".kebab-menu") && !e.target.closest("[data-panel-menu]")) {
                closeAllKebabMenus();
                document.removeEventListener("click", closeKebabOnOutsideClick, true);
            }
        }
        body.querySelectorAll("[data-panel-menu]").forEach(btn => btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const menu = document.getElementById(`tt-menu-${btn.dataset.panelMenu}`);
            const isOpen = menu.style.display !== "none";
            closeAllKebabMenus();
            document.removeEventListener("click", closeKebabOnOutsideClick, true);
            if (!isOpen) {
                menu.style.display = "block";
                document.addEventListener("click", closeKebabOnOutsideClick, true);
            }
        }));
        body.querySelectorAll("[data-panel-resend]").forEach(btn => btn.addEventListener("click", async () => {
            btn.disabled = true;
            try {
                await ctx.api(`/guilds/${ctx.guildId}/panels/${btn.dataset.panelResend}/resend`, { method: "POST" });
                await renderPanelsHome(body, ctx);
            }
            catch (e) {
                await ctx.modal.alert(`Couldn't resend: ${e.message}`);
                btn.disabled = false;
            }
        }));
        body.querySelectorAll("[data-panel-delete]").forEach(btn => btn.addEventListener("click", async () => {
            const ok = await ctx.modal.confirm("Its posted message (if any) will also be removed from Discord.", { title: "Delete this panel?", confirmLabel: "Delete", danger: true });
            if (!ok)
                return;
            try {
                await ctx.api(`/guilds/${ctx.guildId}/panels/${btn.dataset.panelDelete}`, { method: "DELETE" });
                await renderPanelsHome(body, ctx);
            }
            catch (e) {
                await ctx.modal.alert(`Couldn't delete: ${e.message}`);
            }
        }));
    }
    function channelNameFor(ctx, channelId) {
        const ch = (state.meta?.channels || []).find(c => c.id === channelId);
        return ch ? ch.name : channelId;
    }
    function embedPreviewHtml(cfg, buttons) {
        const optionsHtml = buttons.length
            ? (cfg.style === "buttons"
                ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${buttons.slice(0, 5).map(b => `<span class="btn btn-primary btn-small" style="pointer-events:none">${b.icon ? esc(b.icon) + " " : ""}${esc(b.label)}</span>`).join("")}</div>`
                : `<div class="embed-options-preview">Select an option… (${buttons.length} option${buttons.length === 1 ? "" : "s"})</div>`)
            : `<div class="embed-options-preview">No active subjects connected — add one first</div>`;
        const plainHtml = cfg.plainText ? `<div class="embed-msg-plain">${esc(cfg.plainText)}</div>` : "";
        const embedHtml = cfg.embedEnabled
            ? `<div class="embed-card" style="--embed-color:${esc(cfg.color || "#8b5cf6")}">
           ${cfg.title ? `<div class="embed-card-title">${esc(cfg.title)}</div>` : ""}
           ${cfg.description ? `<div class="embed-card-desc">${esc(cfg.description)}</div>` : ""}
         </div>`
            : "";
        return `
      <div class="embed-msg">
        <div class="embed-msg-header">
          <div class="embed-msg-avatar"></div>
          <div><span class="embed-msg-author">NEXORIA<span class="embed-msg-tag">APP</span></span><span class="embed-msg-time">Today</span></div>
        </div>
        ${plainHtml}${embedHtml}
        ${optionsHtml}
      </div>`;
    }
    function startWizard(body, ctx, existingPanel) {
        const root = document.getElementById("module-root") || body;
        const base = existingPanel || { title: "Need help?", description: "Pick a subject below to open a private support ticket.", plainText: "", embedEnabled: false, color: "#8b5cf6", style: "dropdown", buttons: null };
        state.wizard = {
            step: 1,
            editingId: existingPanel ? existingPanel.id : null,
            panel: { ...base },
            options: resolvePanelButtons(base, state.subjects).map(b => ({ ...b })),
            channelId: existingPanel?.channelId || null,
        };
        renderWizard(root, ctx);
    }
    function renderWizard(root, ctx) {
        const w = state.wizard;
        const guildName = state.meta?.name || "Server";
        root.innerHTML = `
      <nav class="wiz-breadcrumb" aria-label="Breadcrumb">
        <button type="button" class="wiz-crumb" data-wiz-nav="servers">${DC.icon("crown")} <span>Servers</span></button>
        ${DC.icon("chevron-right", 13)}
        <button type="button" class="wiz-crumb" data-wiz-nav="guild">${esc(guildName.toUpperCase())}</button>
        ${DC.icon("chevron-right", 13)}
        <button type="button" class="wiz-crumb" data-wiz-nav="panels">Panels</button>
        ${DC.icon("chevron-right", 13)}
        <span class="wiz-crumb-current">Edit Panel</span>
      </nav>
      <div class="wiz-topbar">
        <button class="wiz-exit" id="wiz-cancel">${DC.icon("x")} Exit</button>
        <div class="wizard-steps">
          ${wizardStep(1, "Message", w.step)}<div class="wizard-sep"></div>
          ${wizardStep(2, "Buttons", w.step)}<div class="wizard-sep"></div>
          ${wizardStep(3, "Channel", w.step)}<div class="wizard-sep"></div>
          ${wizardStep(4, "Send", w.step)}
        </div>
        <button class="wiz-help" id="wiz-help">${DC.icon("help-circle")} Help</button>
      </div>
      <div id="wiz-body"></div>
      <div class="wizard-footer">
        <button class="btn btn-ghost btn-small" id="wiz-back" ${w.step === 1 ? "disabled" : ""}>${DC.icon("arrow-left")} Back</button>
        <span class="wizard-error" id="wiz-error"></span>
        <button class="btn btn-primary btn-small" id="wiz-next">${w.step === 4 ? (w.editingId ? "Save changes" : "Create panel") : "Continue"} ${DC.icon("arrow-right")}</button>
      </div>`;
        root.querySelectorAll("[data-wiz-nav]").forEach(btn => btn.addEventListener("click", () => {
            const target = btn.dataset.wizNav;
            state.wizard = null;
            if (target === "servers")
                return window.DC?.go ? (window.DC.go("/dashboard"), window.dispatchEvent(new PopStateEvent("popstate"))) : null;
            if (target === "guild")
                return window.DC?.go ? (window.DC.go(`/servers/${encodeURIComponent(ctx.guildId)}/ticket-tool`), window.dispatchEvent(new PopStateEvent("popstate"))) : null;
            renderTab(root, ctx, "panels");
        }));
        document.getElementById("wiz-cancel")?.addEventListener("click", () => { state.wizard = null; renderTab(root, ctx, "panels"); });
        document.getElementById("wiz-help")?.addEventListener("click", () => ctx.modal.alert("Build the message users will see, add buttons or a dropdown to open tickets, pick a channel, then review and send.", { title: "Ticket Panel builder" }));
        document.getElementById("wiz-back")?.addEventListener("click", () => { w.step = Math.max(1, w.step - 1); renderWizard(root, ctx); });
        document.getElementById("wiz-next")?.addEventListener("click", () => handleWizardNext(root, ctx));
        renderWizardStep(document.getElementById("wiz-body"), ctx);
    }
    function wizardStep(n, label, current) {
        const cls = current > n ? "done" : current === n ? "active" : "";
        return `<div class="wizard-step ${cls}"><span class="wizard-step-num">${current > n ? "" : n}</span>${label}</div>`;
    }
    function renderWizardStep(body, ctx) {
        const w = state.wizard;
        if (w.step === 1)
            return renderWizardMessage(body);
        if (w.step === 2)
            return renderWizardOptions(body, ctx);
        if (w.step === 3)
            return renderWizardChannel(body, ctx);
        if (w.step === 4)
            return renderWizardSend(body);
    }
    function renderWizardMessage(body) {
        const w = state.wizard;
        w.panel.plainText = w.panel.plainText ?? "";
        w.panel.embedEnabled = w.panel.embedEnabled ?? Boolean(w.panel.title || w.panel.description);
        body.innerHTML = `
      <p style="text-align:center;color:var(--text-dim);font-size:13px;margin-bottom:18px">Create the message users will see. Click anywhere to edit.</p>
      <div class="wizard-body single">
        <div class="embed-msg" id="w-message-editor">
          <div class="embed-msg-header">
            <div class="embed-msg-avatar"></div>
            <div><span class="embed-msg-author">NEXORIA<span class="embed-msg-tag">APP</span></span><span class="embed-msg-time">Today</span></div>
          </div>
          <textarea id="w-plaintext" class="msg-plaintext-input" placeholder="Write your message here..." maxlength="4000">${esc(w.panel.plainText)}</textarea>
          <div class="char-count" id="w-plaintext-count">${w.panel.plainText.length}/4000</div>
          <div id="w-embed-block"></div>
          <button class="btn btn-ghost btn-small" id="w-toggle-embed" style="margin-top:10px">
            ${w.panel.embedEnabled ? DC.icon("minus") : DC.icon("plus")} ${w.panel.embedEnabled ? "Remove embed" : "Add embed"}
          </button>
        </div>
      </div>`;
        function paintEmbedBlock() {
            const slot = document.getElementById("w-embed-block");
            if (!w.panel.embedEnabled) {
                slot.innerHTML = "";
                return;
            }
            slot.innerHTML = `
        <div class="embed-card" id="w-embed-card" style="--embed-color:${esc(w.panel.color || "#8b5cf6")};margin-top:10px;cursor:text">
          <input type="text" id="w-title" maxlength="256" placeholder="Embed title" value="${esc(w.panel.title)}" class="embed-inline-input embed-card-title">
          <textarea id="w-desc" maxlength="4000" placeholder="Embed description" class="embed-inline-input embed-card-desc">${esc(w.panel.description)}</textarea>
        </div>
        <div class="field" style="margin-top:10px;max-width:160px">
          <label>Accent color</label>
          <input type="color" id="w-color" value="${esc(w.panel.color)}" style="height:34px;padding:3px;cursor:pointer">
        </div>`;
            document.getElementById("w-title")?.addEventListener("input", (e) => { w.panel.title = e.target.value; document.getElementById("w-embed-card").style.setProperty("--embed-color", w.panel.color); });
            document.getElementById("w-desc")?.addEventListener("input", (e) => { w.panel.description = e.target.value; });
            document.getElementById("w-color")?.addEventListener("input", (e) => { w.panel.color = e.target.value; document.getElementById("w-embed-card").style.setProperty("--embed-color", e.target.value); });
            if (window.DC.attachVariableEditor)
                window.DC.attachVariableEditor(document.getElementById("w-desc"));
        }
        document.getElementById("w-plaintext")?.addEventListener("input", (e) => {
            w.panel.plainText = e.target.value;
            document.getElementById("w-plaintext-count").textContent = `${e.target.value.length}/4000`;
        });
        if (window.DC.attachVariableEditor)
            window.DC.attachVariableEditor(document.getElementById("w-plaintext"));
        document.getElementById("w-toggle-embed")?.addEventListener("click", () => {
            w.panel.embedEnabled = !w.panel.embedEnabled;
            renderWizardMessage(body);
        });
        paintEmbedBlock();
    }
    function renderWizardOptions(body, ctx) {
        const w = state.wizard;
        const activeTemplates = state.subjects.filter(s => s.active);
        body.innerHTML = `
      <p style="text-align:center;color:var(--text-dim);font-size:13px;margin-bottom:14px">Add buttons or a dropdown that users click to open tickets. Each one connects to a Ticket Template.</p>
      <div class="ticket-filters" style="justify-content:center;margin-bottom:18px">
        <span class="filter-chip ${w.panel.style !== "buttons" ? "active" : ""}" data-style="dropdown">${DC.icon("list")} Dropdown</span>
        <span class="filter-chip ${w.panel.style === "buttons" ? "active" : ""}" data-style="buttons">${DC.icon("square")} Buttons</span>
      </div>
      ${activeTemplates.length === 0 ? `<div class="empty-state" style="margin-bottom:14px">${DC.icon("tag-off", 28)}No active ticket subjects yet. Create one in Ticket Subjects first.</div>` : ""}
      <div class="wizard-body">
        <div>
          <div style="font-weight:700;font-size:13px;margin-bottom:10px">Buttons (${w.options.length}/25)</div>
          <div id="w-opts-list"></div>
          <button class="btn btn-ghost btn-small" id="w-add-opt" ${activeTemplates.length === 0 ? "disabled" : ""}>${DC.icon("plus")} Add button</button>
        </div>
        <div class="panel-preview" id="w-preview"></div>
      </div>`;
        body.querySelectorAll("[data-style]").forEach(chip => chip.addEventListener("click", () => {
            w.panel.style = chip.dataset.style;
            renderWizardOptions(body, ctx);
        }));
        function paintOpts() {
            const list = document.getElementById("w-opts-list");
            list.innerHTML = w.options.map((o, i) => `
        <div class="opt-row">
          <div class="opt-row-top">
            <span class="opt-row-drag">${DC.icon("grip-vertical")}</span>
            <div style="width:100%">
              <div class="field-hint" style="margin:0 0 4px">Ticket subject</div>
              <div data-opt-template="${i}"></div>
            </div>
            <button class="btn btn-ghost btn-small opt-row-remove" data-opt-remove="${i}">${DC.icon("trash")}</button>
          </div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <input type="text" data-opt-icon="${i}" value="${esc(o.icon || "")}" placeholder="Icon" maxlength="8" style="width:60px;text-align:center">
            <div style="flex:1">
              <input type="text" data-opt-label="${i}" value="${esc(o.label)}" placeholder="Label" maxlength="100">
              <div class="char-count">${o.label.length}/100</div>
            </div>
          </div>
          <textarea data-opt-desc="${i}" placeholder="Description (optional)" maxlength="100" style="min-height:38px;margin-top:8px">${esc(o.description)}</textarea>
        </div>`).join("") || `<div class="empty-state">No buttons yet — add one above.</div>`;
            w.options.forEach((o, i) => {
                const slot = list.querySelector(`[data-opt-template="${i}"]`);
                if (!slot)
                    return;
                const drop = window.DC.createDropdown(slot, {
                    options: activeTemplates.map(s => ({ value: s.id, label: (s.icon ? s.icon + " " : "") + s.name })),
                    value: o.subjectId,
                    placeholder: "Select a subject…",
                });
                drop.onChange(val => { w.options[i].subjectId = val; paintPreview(); });
            });
            list.querySelectorAll("[data-opt-icon]").forEach(el => el.addEventListener("input", () => { w.options[el.dataset.optIcon].icon = el.value; paintPreview(); }));
            list.querySelectorAll("[data-opt-label]").forEach(el => el.addEventListener("input", () => { w.options[el.dataset.optLabel].label = el.value; paintPreview(); paintOpts(); }));
            list.querySelectorAll("[data-opt-desc]").forEach(el => el.addEventListener("input", () => { w.options[el.dataset.optDesc].description = el.value; paintPreview(); }));
            list.querySelectorAll("[data-opt-remove]").forEach(el => el.addEventListener("click", () => { w.options.splice(el.dataset.optRemove, 1); paintOpts(); paintPreview(); }));
        }
        function paintPreview() {
            document.getElementById("w-preview").innerHTML = embedPreviewHtml(w.panel, w.options);
        }
        document.getElementById("w-add-opt")?.addEventListener("click", () => {
            if (activeTemplates.length === 0)
                return;
            const unused = activeTemplates.find(s => !w.options.some(o => o.subjectId === s.id)) || activeTemplates[0];
            w.options.push({ subjectId: unused.id, label: unused.name, icon: unused.icon || "", description: unused.description || "" });
            paintOpts();
            paintPreview();
        });
        paintOpts();
        paintPreview();
    }
    function renderWizardChannel(body, ctx) {
        const w = state.wizard;
        const channels = state.meta?.channels || [];
        body.innerHTML = `
      <p style="text-align:center;color:var(--text-dim);font-size:13px;margin-bottom:18px">Choose where to post your panel.</p>
      <div class="wizard-body">
        <div class="editor-panel">
          <div class="field"><label>Channel</label><div id="w-channel"></div></div>
        </div>
        <div class="panel-preview" id="w-preview"></div>
      </div>`;
        const drop = window.DC.createDropdown(document.getElementById("w-channel"), {
            options: channels.map(c => ({ value: c.id, label: c.name, icon: `<span style="color:var(--text-dim)">#</span> ` })),
            value: w.channelId,
            placeholder: "Select a channel…",
            searchable: true,
        });
        drop.onChange(val => { w.channelId = val; });
        document.getElementById("w-preview").innerHTML = embedPreviewHtml(w.panel, w.options);
    }
    function renderWizardSend(body) {
        const w = state.wizard;
        const channelName = (state.meta?.channels || []).find(c => c.id === w.channelId)?.name;
        body.innerHTML = `
      <p style="text-align:center;color:var(--text-dim);font-size:13px;margin-bottom:18px">Review your changes.</p>
      <div class="wizard-body">
        <div class="panel-preview">${embedPreviewHtml(w.panel, w.options)}</div>
        <div class="editor-panel">
          <div class="field"><label>Channel</label><div class="field-hint">${channelName ? "#" + esc(channelName) : "No channel selected"}</div></div>
          <div class="field"><label>Options</label><div class="field-hint">${w.options.length} option${w.options.length === 1 ? "" : "s"}: ${w.options.map(o => esc(o.label)).join(", ") || "none"}</div></div>
        </div>
      </div>`;
    }
    function showWizardError(root, msg) {
        const el = document.getElementById("wiz-error");
        if (el)
            el.textContent = msg;
    }
    async function handleWizardNext(root, ctx) {
        const w = state.wizard;
        if (w.step === 1 && !w.panel.plainText?.trim() && !w.panel.embedEnabled) {
            showWizardError(root, "Panel message must have text content or an embed");
            return;
        }
        if (w.step === 2 && w.options.length === 0) {
            showWizardError(root, "Panel must have at least one option");
            return;
        }
        if (w.step === 3 && !w.channelId) {
            showWizardError(root, "Please select a channel to post the panel");
            return;
        }
        if (w.step < 4) {
            w.step++;
            renderWizard(root, ctx);
            return;
        }
        const btn = document.getElementById("wiz-next");
        btn.textContent = "Saving…";
        try {
            const panelPayload = { ...w.panel, buttons: w.options };
            let panelId = w.editingId;
            if (panelId) {
                await ctx.api(`/guilds/${ctx.guildId}/panels/${panelId}`, { method: "PUT", body: JSON.stringify(panelPayload) });
            }
            else {
                const created = await ctx.api(`/guilds/${ctx.guildId}/panels`, { method: "POST", body: JSON.stringify(panelPayload) });
                panelId = created.id;
            }
            const existing = state.panels.find(p => p.id === panelId);
            if (existing?.channelId === w.channelId && existing?.messageId) {
                await ctx.api(`/guilds/${ctx.guildId}/panels/${panelId}/resend`, { method: "POST" });
            }
            else {
                await ctx.api(`/guilds/${ctx.guildId}/panels/${panelId}/post`, { method: "POST", body: JSON.stringify({ channelId: w.channelId }) });
            }
            state.wizard = null;
            renderTab(root, ctx, "panels");
        }
        catch (e) {
            await ctx.modal.alert(`Couldn't save the panel: ${e.message}`);
            btn.innerHTML = `Save changes ${DC.icon("arrow-right")}`;
        }
    }
    async function renderSettings(body, ctx) {
        body.innerHTML = loading();
        await ensureMeta(ctx);
        let cfg = {};
        try {
            cfg = await ctx.api(`/guilds/${ctx.guildId}/config`);
        }
        catch { }
        let sharingCfg = { sharingEnabled: false };
        try {
            sharingCfg = await ctx.api(`/guilds/${ctx.guildId}/sharing-settings`);
        }
        catch { }
        body.innerHTML = `
      <div class="config-section">
        <h3>Fallback ticket category</h3><div class="hint">Used when a subject doesn't set its own category.</div>
        <div class="config-row"><span class="config-row-label">Category</span><div id="s-category" style="width:220px"></div></div>
      </div>
      <div class="config-section">
        <h3>Support role</h3><div class="hint">Can view and respond to every ticket, in addition to any per-subject staff roles.</div>
        <div class="config-row"><span class="config-row-label">Role</span><div id="s-role" style="width:220px"></div></div>
      </div>
      <div class="config-section">
        <h3>Log channel</h3><div class="hint">A summary is posted here whenever a ticket closes.</div>
        <div class="config-row"><span class="config-row-label">Channel</span><div id="s-log" style="width:220px"></div></div>
      </div>
      <div class="config-section">
        <h3>Claiming</h3>
        <div class="hint">Claiming a ticket is always limited to staff, no matter what — this only controls whether a ticket needs to be claimed at all before staff act on it.</div>
        <div class="config-row">
          <span class="config-row-label">Require a claim before staff can act</span>
          <button class="toggle ${cfg.staffOnlyClaim !== false ? "on" : ""}" id="s-staff-only-claim" aria-label="Toggle staff-only claim requirement"></button>
        </div>
      </div>
      <div class="config-section">
        <h3>Ticket sharing</h3>
        <div class="hint">Off by default. When enabled, a ticket's owner or staff can generate a public, read-only link to that ticket from its detail page. Turning this off doesn't delete links already created, but stops any new ones from being made and hides the share-link controls.</div>
        <div class="config-row">
          <span class="config-row-label">Allow creating share links for tickets</span>
          <button class="toggle ${sharingCfg.sharingEnabled ? "on" : ""}" id="s-sharing-enabled" aria-label="Toggle ticket sharing"></button>
        </div>
      </div>
      <button class="btn btn-primary btn-small" id="s-save">Save changes</button>`;
        document.getElementById("s-staff-only-claim")?.addEventListener("click", async (e) => {
            const turningOn = !e.currentTarget.classList.contains("on");
            e.currentTarget.classList.toggle("on");
            try {
                await ctx.api(`/guilds/${ctx.guildId}/settings/staff-only-claim`, { method: "PUT", body: JSON.stringify({ enabled: turningOn }) });
            }
            catch (err) {
                e.currentTarget.classList.toggle("on");
                await ctx.modal.alert(`Couldn't update: ${err.message}`);
            }
        });
        document.getElementById("s-sharing-enabled")?.addEventListener("click", async (e) => {
            const turningOn = !e.currentTarget.classList.contains("on");
            e.currentTarget.classList.toggle("on");
            try {
                await ctx.api(`/guilds/${ctx.guildId}/sharing-settings`, { method: "PUT", body: JSON.stringify({ enabled: turningOn }) });
            }
            catch (err) {
                e.currentTarget.classList.toggle("on");
                await ctx.modal.alert(`Couldn't update: ${err.message}`);
            }
        });
        const catDrop = window.DC.createDropdown(document.getElementById("s-category"), {
            options: [{ value: "", label: "None" }, ...(state.meta?.categories || []).map(c => ({ value: c.id, label: c.name }))],
            value: cfg.ticketCategory || "", placeholder: "None",
        });
        const roleDrop = window.DC.createDropdown(document.getElementById("s-role"), {
            options: [{ value: "", label: "None" }, ...(state.meta?.roles || []).map(r => ({ value: r.id, label: "@" + r.name }))],
            value: cfg.supportRole || "", placeholder: "None",
        });
        const logDrop = window.DC.createDropdown(document.getElementById("s-log"), {
            options: [{ value: "", label: "Disabled" }, ...(state.meta?.channels || []).map(c => ({ value: c.id, label: "#" + c.name }))],
            value: cfg.logChannel || "", placeholder: "Disabled",
        });
        document.getElementById("s-save")?.addEventListener("click", async () => {
            const btn = document.getElementById("s-save");
            btn.textContent = "Saving…";
            try {
                await ctx.api(`/guilds/${ctx.guildId}/config`, {
                    method: "POST",
                    body: JSON.stringify({
                        ticketChannel: cfg.ticketChannel || null,
                        ticketCategory: catDrop.getValue() || null,
                        supportRole: roleDrop.getValue() || null,
                        logChannel: logDrop.getValue() || null,
                    }),
                });
                btn.innerHTML = `${DC.icon("check")} Saved`;
            }
            catch (e) {
                btn.textContent = `Failed: ${e.message}`.slice(0, 60);
            }
            setTimeout(() => { btn.textContent = "Save changes"; }, 2200);
        });
    }
    window.DC.registerModule({
        id: "ticket-tool",
        label: "Ticket Tool",
        render(root, ctx, tab) {
            state.subjects = [];
            state.tickets = [];
            state.meta = null;
            state.panelCfg = null;
            state.wizard = null;
            renderTab(root, ctx, tab || "tickets");
        },
    });
})();
