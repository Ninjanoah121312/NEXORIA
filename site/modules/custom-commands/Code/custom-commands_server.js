// custom-commands_server.js
module.exports = function registerCustomCommands(kit, moduleId) {
    const { app, client, createModuleStore, registerSlashCommandProvider, registerCustomCommandProvider, syncGuildSlashCommands, formatDurationForCli, getStartedAt, buildVariables, getGeneralSettings } = kit;
    const { EmbedBuilder } = require("discord.js");
    const rawStore = createModuleStore(moduleId, { guilds: {} });
    const store = { load: () => rawStore.load().data, withFile: rawStore.withFile };
    const MAX_HISTORY_PER_COMMAND = 200;
    const ACTION_TYPES = [
        { value: "message", label: "Send a message" },
        { value: "addRole", label: "Add a role" },
        { value: "removeRole", label: "Remove a role" },
        { value: "comment", label: "Comment / note" },
        { value: "delay", label: "Wait" },
    ];
    function ensureCommandsGuildEntry(data, guildId) {
        data.guilds = data.guilds || {};
        data.guilds[guildId] = data.guilds[guildId] || { commands: [], categories: [{ id: "general", name: "General", enabled: true }], nextCommandId: 1 };
        const g = data.guilds[guildId];
        g.commands = g.commands || [];
        g.categories = Array.isArray(g.categories) && g.categories.length ? g.categories : [{ id: "general", name: "General", enabled: true }];
        g.categories.forEach(c => { c.enabled = c.enabled !== false; c.name = c.name || c.id; });
        g.nextCommandId = g.nextCommandId || 1;
        if (!g.commands.some(c => c.builtin === "status")) {
            g.commands.unshift({
                id: String(g.nextCommandId++),
                name: "Bot Status",
                trigger: "status",
                triggerType: "slash",
                scope: "slash",
                enabled: true,
                categoryId: "general",
                permissionMode: "everyone",
                description: "Shows whether the bot is online and basic stats about it.",
                allowedRoles: [],
                cooldownSeconds: 0,
                cooldownPerUser: true,
                embedEnabled: true,
                embedColor: "#8b5cf6",
                actions: [],
                variables: {},
                history: [],
                builtin: "status",
                createdAt: new Date().toISOString(),
            });
        }
        for (const b of [{builtin:"dashboard",name:"Dashboard",trigger:"dashboard",description:"Open the NEXORIA dashboard."},{builtin:"help",name:"Help",trigger:"help",description:"Show NEXORIA built-in commands and support information."}]) { if (!g.commands.some(c=>c.builtin===b.builtin)) g.commands.unshift({id:String(g.nextCommandId++),...b,triggerType:"slash",scope:"slash",enabled:true,categoryId:"general",permissionMode:"everyone",allowedRoles:[],cooldownSeconds:0,cooldownPerUser:true,embedEnabled:true,embedColor:"#8b5cf6",actions:[],variables:{},history:[],createdAt:new Date().toISOString()}); }
        if (typeof registerCustomCommandProvider === "function") {
            // Providers contribute non-deletable, owner-toggleable commands that live in this same command list.
            // Providers are synchronous by design so the command registry stays available during startup.
            for (const provider of (global.__NEXORIA_CUSTOM_COMMAND_PROVIDERS || [])) {
                try {
                    const provided = provider(guildId) || [];
                    for (const item of (Array.isArray(provided) ? provided : [provided])) {
                        if (!item?.trigger || g.commands.some(c => c.builtin === item.builtin)) continue;
                        g.commands.unshift({ id: String(g.nextCommandId++), name: item.name || item.trigger, trigger: item.trigger, triggerType: item.triggerType === "slash" ? "slash" : "prefix", scope: ["prefix","slash","both"].includes(item.scope) ? item.scope : (item.triggerType === "slash" ? "slash" : "prefix"), enabled: item.enabled !== false, categoryId: item.categoryId || "general", permissionMode: item.permissionMode || "everyone", description: item.description || "Module-provided command", allowedRoles: item.allowedRoles || [], cooldownSeconds: Number(item.cooldownSeconds) || 0, cooldownPerUser: item.cooldownPerUser !== false, embedEnabled: Boolean(item.embedEnabled), embedColor: item.embedColor || "#8b5cf6", actions: Array.isArray(item.actions) ? item.actions : [], variables: item.variables || {}, history: [], builtin: item.builtin || `${item.provider || "module"}:${item.trigger}`, provider: item.provider || null, createdAt: new Date().toISOString() });
                    }
                } catch (e) { console.warn(`[custom-commands] command provider failed: ${e.message}`); }
            }
        }
        g.commands.forEach(c => {
            c.allowedRoles = c.allowedRoles || [];
            c.actions = c.actions || [];
            c.variables = c.variables || {};
            c.history = c.history || [];
            c.cooldownSeconds = c.cooldownSeconds ?? 0;
            c.cooldownPerUser = c.cooldownPerUser ?? true;
            c.embedEnabled = c.embedEnabled ?? false;
            c.embedColor = c.embedColor || "#8b5cf6";
            c.scope = c.scope || "prefix";
            c.triggerType = c.triggerType || "prefix";
            c.builtin = c.builtin || null;
            c.categoryId = c.categoryId || "general";
            c.permissionMode = ["everyone", "administrators", "roles"].includes(c.permissionMode) ? c.permissionMode : "everyone";
        });
        return g;
    }
    async function buildBuiltinVars(guild, user, channel, command) {
        return buildVariables(guild, { user, channel, command });
    }
    function renderCommandTemplate(template, builtinVars, commandVars) {
        let out = (template || "");
        out = out.replace(/\{@role:(\d+)\}/g, (m, roleId) => `<@&${roleId}>`);
        out = out.replace(/\{@user:(\d+)\}/g, (m, userId) => `<@${userId}>`);
        out = out.replace(/\{var\.([a-zA-Z0-9_]+)\}/g, (m, key) => (commandVars && key in commandVars ? commandVars[key] : m));
        out = out.replace(/\{([a-zA-Z0-9_.]+)\}/g, (m, key) => (key in builtinVars ? builtinVars[key] : m));
        return out;
    }
    function pushCommandHistory(command, entry) {
        command.history = command.history || [];
        command.history.unshift(entry);
        if (command.history.length > MAX_HISTORY_PER_COMMAND)
            command.history.length = MAX_HISTORY_PER_COMMAND;
    }
    const commandCooldowns = new Map();
    function checkAndSetCooldown(guildId, command, userId) {
        if (!command.cooldownSeconds)
            return { ok: true };
        const key = `${guildId}:${command.id}:${command.cooldownPerUser ? userId : "guild"}`;
        const now = Date.now();
        const last = commandCooldowns.get(key);
        if (last && now - last < command.cooldownSeconds * 1000) {
            const remaining = Math.ceil((command.cooldownSeconds * 1000 - (now - last)) / 1000);
            return { ok: false, remaining };
        }
        commandCooldowns.set(key, now);
        return { ok: true };
    }
    function memberHasAllowedRole(member, allowedRoles) {
        if (!allowedRoles || allowedRoles.length === 0)
            return true;
        if (!member)
            return false;
        if (member.permissions?.has?.("Administrator"))
            return true;
        return member.roles?.cache?.some(r => allowedRoles.includes(r.id)) || false;
    }
    function orderedActions(command) {
        const actions = Array.isArray(command?.actions) ? command.actions : [];
        const graph = command?.graph;
        if (!graph?.connections?.length) return actions;
        const byId = new Map(actions.map((a,i)=>[String(a.nodeId || `node-${i}`), a]));
        const indegree = new Map([...byId.keys()].map(id=>[id,0]));
        const next = new Map([...byId.keys()].map(id=>[id,[]]));
        for (const c of graph.connections) {
            if (!byId.has(String(c.from)) || !byId.has(String(c.to)) || String(c.from)===String(c.to)) continue;
            next.get(String(c.from)).push(String(c.to)); indegree.set(String(c.to), (indegree.get(String(c.to))||0)+1);
        }
        const queue = [...indegree.entries()].filter(([,d])=>d===0).map(([id])=>id);
        const out=[];
        while(queue.length){ const id=queue.shift(); out.push(byId.get(id)); for(const to of next.get(id)||[]){ const d=(indegree.get(to)||0)-1; indegree.set(to,d); if(d===0) queue.push(to); } }
        return out.length===actions.length ? out : actions;
    }
    async function runCommandActions(command, { guild, member, user, channel, send }) {
        const builtinVars = await buildBuiltinVars(guild, user, channel, command);
        for (const action of orderedActions(command)) {
            try {
                if (action.type === "comment") continue;
                if (action.type === "message") {
                    const content = renderCommandTemplate(action.content || "", builtinVars, command.variables);
                    if (command.embedEnabled) {
                        const embed = new EmbedBuilder().setDescription(content || "\u200b").setColor(parseInt((command.embedColor || "#8b5cf6").replace("#", ""), 16));
                        await send({ embeds: [embed] });
                    }
                    else {
                        await send({ content: content || "\u200b" });
                    }
                }
                else if (action.type === "addRole" && action.roleId && member) {
                    await member.roles.add(action.roleId).catch(() => { });
                }
                else if (action.type === "removeRole" && action.roleId && member) {
                    await member.roles.remove(action.roleId).catch(() => { });
                }
                else if (action.type === "delay") {
                    const ms = Math.max(0, Math.min(120000, Number(action.ms) || 0));
                    if (ms) await new Promise(resolve => setTimeout(resolve, ms));
                }
            }
            catch (e) {
                console.warn(`[custom-commands] Action failed for "${command.name}":`, e.message);
            }
        }
    }
    async function handleBuiltinStatusCommand(command, { send }) {
        const startedAt = getStartedAt();
        const embed = new EmbedBuilder()
            .setTitle("Bot Status")
            .setColor(parseInt((command.embedColor || "#8b5cf6").replace("#", ""), 16))
            .addFields({ name: "Status", value: client.isReady() ? "🟢 Online" : "🔴 Offline", inline: true }, { name: "Servers", value: String(client.guilds.cache.size), inline: true }, { name: "Uptime", value: startedAt ? formatDurationForCli(Math.floor((Date.now() - startedAt) / 1000)) : "—", inline: true }, { name: "Latency", value: client.ws?.ping != null && client.ws.ping >= 0 ? `${client.ws.ping}ms` : "—", inline: true });
        if (command.embedEnabled)
            await send({ embeds: [embed] });
        else
            await send({ content: `Status: ${client.isReady() ? "🟢 Online" : "🔴 Offline"} · ${client.guilds.cache.size} servers · Uptime: ${startedAt ? formatDurationForCli(Math.floor((Date.now() - startedAt) / 1000)) : "—"}` });
    }
    async function handleBuiltinDashboardCommand(command,{send}){const site=String(kit.siteUrl||"").replace(/\/$/,"");const url=site?`${site}/dashboard`:null;const text=url?`Open the NEXORIA dashboard: ${url}`:"The NEXORIA dashboard URL is not configured.";if(command.embedEnabled){const e=new EmbedBuilder().setTitle("NEXORIA Dashboard").setColor(parseInt((command.embedColor||"#8b5cf6").replace("#",""),16)).setDescription(text);await send({embeds:[e]});}else await send({content:text});}
    async function handleBuiltinHelpCommand(command,{send}){const site=String(kit.siteUrl||"").replace(/\/$/,"");const lines=["NEXORIA built-in commands:","/dashboard — open the NEXORIA dashboard","/help — show this help","/status — show bot status"];if(site)lines.push(`Dashboard: ${site}/dashboard`);if(kit.supportUrl)lines.push(`Support: ${kit.supportUrl}`);if(command.embedEnabled){const e=new EmbedBuilder().setTitle("NEXORIA Help").setColor(parseInt((command.embedColor||"#8b5cf6").replace("#",""),16)).setDescription(lines.join("\n"));await send({embeds:[e]});}else await send({content:lines.join("\n")});}
    client.on("messageCreate", async (message) => {
        if (message.author?.bot || !message.guild)
            return;
        try {
            const data = store.load();
            const g = data.guilds?.[message.guild.id];
            if (!g || !g.commands?.length)
                return;
            const content = message.content || "";
            const match = g.commands.find(c => c.enabled && g.categories.find(cat => cat.id === (c.categoryId || "general"))?.enabled !== false && (c.scope === "prefix" || c.scope === "both") && c.triggerType === "prefix" && c.trigger && content.startsWith(c.trigger) && (content.length === c.trigger.length || content[c.trigger.length] === " "));
            if (!match)
                return;
            const member = message.member;
            if (!memberHasAllowedRole(member, match.allowedRoles) || (match.permissionMode === "administrators" && !member?.permissions?.has?.("Administrator")) || (match.permissionMode === "roles" && !member?.roles?.cache?.some(r => match.allowedRoles?.includes(r.id))))
                return;
            const cd = checkAndSetCooldown(message.guild.id, match, message.author.id);
            if (!cd.ok)
                return message.reply({ content: `This command is on cooldown — try again in ${cd.remaining}s.` }).catch(() => { });
            const send = (payload) => message.channel.send(payload);
            if (match.builtin === "dashboard") await handleBuiltinDashboardCommand(match,{send}); else if (match.builtin === "help") await handleBuiltinHelpCommand(match,{send}); else if (match.builtin === "status") {
                const gs = getGeneralSettings(message.guild.id);
                const allowed = gs.statusMode === "everyone" || (gs.statusMode === "administrators" && member?.permissions?.has?.("Administrator")) || (gs.statusMode === "roles" && member?.roles?.cache?.some(r => gs.statusRoles?.includes(r.id)));
                if (!allowed)
                    return message.reply({ content: "You don't have permission to use /status.", ephemeral: true }).catch(() => { });
                await handleBuiltinStatusCommand(match, { send });
            }
            else
                await runCommandActions(match, { guild: message.guild, member, user: message.author, channel: message.channel, send });
            await store.withFile(async (data2) => {
                const g2 = ensureCommandsGuildEntry(data2, message.guild.id);
                const cmd2 = g2.commands.find(c => c.id === match.id);
                if (cmd2)
                    pushCommandHistory(cmd2, { userId: message.author.id, userName: message.author.username, channelId: message.channel.id, channelName: message.channel.name, usedAt: new Date().toISOString() });
                return null;
            });
            try {
                kit.registerBotLogHandler && kit.registerBotLogHandler(async () => { });
            }
            catch { }
            client.emit("nexoriaCustomCommandUsed", { guildId: message.guild.id, userId: message.author.id, userName: message.author.username, commandName: match.name || match.trigger, trigger: match.trigger, channelId: message.channel.id });
        }
        catch (e) {
            console.warn("[custom-commands] Prefix command failed:", e.message);
        }
    });
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isChatInputCommand() || !interaction.guild)
            return;
        try {
            const data = store.load();
            const g = ensureCommandsGuildEntry(data, interaction.guild.id);
            const match = g.commands.find(c => c.enabled && g.categories.find(cat => cat.id === (c.categoryId || "general"))?.enabled !== false && (c.scope === "slash" || c.scope === "both") && c.triggerType === "slash" && c.trigger === interaction.commandName);
            if (!match)
                return;
            const member = interaction.member;
            const permissionDenied = !memberHasAllowedRole(member, match.allowedRoles)
                || (match.permissionMode === "administrators" && !member?.permissions?.has?.("Administrator"))
                || (match.permissionMode === "roles" && !member?.roles?.cache?.some(r => match.allowedRoles?.includes(r.id)));
            if (permissionDenied) {
                return interaction.reply({ content: "You don't have permission to use this command.", ephemeral: true }).catch(() => { });
            }
            const cd = checkAndSetCooldown(interaction.guild.id, match, interaction.user.id);
            if (!cd.ok)
                return interaction.reply({ content: `This command is on cooldown — try again in ${cd.remaining}s.`, ephemeral: true }).catch(() => { });
            await interaction.deferReply();
            const send = (payload) => interaction.editReply(payload);
            if (match.builtin === "dashboard") await handleBuiltinDashboardCommand(match,{send}); else if (match.builtin === "help") await handleBuiltinHelpCommand(match,{send}); else if (match.builtin === "status") {
                const gs = getGeneralSettings(interaction.guild.id);
                const allowed = gs.statusMode === "everyone" || (gs.statusMode === "administrators" && member?.permissions?.has?.("Administrator")) || (gs.statusMode === "roles" && member?.roles?.cache?.some(r => gs.statusRoles?.includes(r.id)));
                if (!allowed)
                    return interaction.editReply({ content: "You don't have permission to use /status." }).catch(() => { });
                await handleBuiltinStatusCommand(match, { send });
            }
            else
                await runCommandActions(match, { guild: interaction.guild, member, user: interaction.user, channel: interaction.channel, send });
            await store.withFile(async (data2) => {
                const g2 = ensureCommandsGuildEntry(data2, interaction.guild.id);
                const cmd2 = g2.commands.find(c => c.id === match.id);
                if (cmd2)
                    pushCommandHistory(cmd2, { userId: interaction.user.id, userName: interaction.user.username, channelId: interaction.channel.id, channelName: interaction.channel.name, usedAt: new Date().toISOString() });
                return null;
            });
            client.emit("nexoriaCustomCommandUsed", { guildId: interaction.guild.id, userId: interaction.user.id, userName: interaction.user.username, commandName: match.name || match.trigger, trigger: match.trigger, channelId: interaction.channel.id });
        }
        catch (e) {
            console.warn("[custom-commands] Slash command failed:", e.message);
            if (interaction.deferred || interaction.replied)
                return;
            try {
                await interaction.reply({ content: "Something went wrong running that command.", ephemeral: true });
            }
            catch { }
        }
    });
    const commandNameRegex = /^[-_a-z0-9]{1,32}$/;
    function isValidSlashName(name) { return typeof name === "string" && commandNameRegex.test(name); }
    registerSlashCommandProvider(async (guildId) => {
        const data = store.load();
        const g = ensureCommandsGuildEntry(data, guildId);
        return g.commands
            .filter(c => c.enabled && g.categories.find(cat => cat.id === (c.categoryId || "general"))?.enabled !== false && (c.scope === "slash" || c.scope === "both") && c.triggerType === "slash" && isValidSlashName(c.trigger))
            .map(c => ({ name: c.trigger, description: (c.description || c.name || "Custom command").slice(0, 100) || "Custom command" }));
    });
    const COMMAND_FIELDS = [
        "name", "trigger", "triggerType", "scope", "description", "enabled",
        "allowedRoles", "permissionMode", "categoryId", "cooldownSeconds", "cooldownPerUser",
        "embedEnabled", "embedColor", "actions", "variables",
    ];
    app.get("/guilds/:guildId/custom-commands", async (req, res) => {
        try {
            const data = store.load();
            const g = ensureCommandsGuildEntry(data, req.params.guildId);
            res.json({ commands: g.commands, actionTypes: ACTION_TYPES });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.post("/guilds/:guildId/custom-commands", async (req, res) => {
        try {
            const body = req.body || {};
            const command = await store.withFile(async (data) => {
                const g = ensureCommandsGuildEntry(data, req.params.guildId);
                const c = { id: String(g.nextCommandId++), builtin: null, createdAt: new Date().toISOString() };
                for (const key of COMMAND_FIELDS)
                    if (body[key] !== undefined)
                        c[key] = body[key];
                c.name = c.name || "New command";
                c.trigger = c.trigger || "";
                c.triggerType = c.triggerType === "slash" ? "slash" : "prefix";
                c.scope = ["prefix", "slash", "both"].includes(c.scope) ? c.scope : c.triggerType;
                c.description = c.description || "";
                c.enabled = c.enabled !== false;
                c.categoryId = c.categoryId || "general";
                c.permissionMode = ["everyone", "administrators", "roles"].includes(c.permissionMode) ? c.permissionMode : "everyone";
                c.allowedRoles = Array.isArray(c.allowedRoles) ? c.allowedRoles : [];
                c.cooldownSeconds = Number(c.cooldownSeconds) || 0;
                c.cooldownPerUser = c.cooldownPerUser !== false;
                c.embedEnabled = Boolean(c.embedEnabled);
                c.embedColor = c.embedColor || "#8b5cf6";
                c.actions = Array.isArray(c.actions) ? c.actions : [];
                c.variables = c.variables && typeof c.variables === "object" ? c.variables : {};
                c.history = [];
                g.commands.push(c);
                return c;
            });
            syncGuildSlashCommands(req.params.guildId);
            res.json(command);
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.put("/guilds/:guildId/custom-commands/:commandId", async (req, res) => {
        try {
            const body = req.body || {};
            const command = await store.withFile(async (data) => {
                const g = ensureCommandsGuildEntry(data, req.params.guildId);
                const c = g.commands.find(x => x.id === req.params.commandId);
                if (!c)
                    throw new Error("Command not found");
                if (c.builtin) {
                    const guild = client.guilds.cache.get(req.params.guildId);
                    if (!guild || String(body.userId || "") !== String(guild.ownerId))
                        throw new Error("Only the server owner can change built-in command permissions.");
                    if (body.enabled !== undefined)
                        c.enabled = Boolean(body.enabled);
                    if (body.permissionMode !== undefined && ["everyone", "administrators", "roles"].includes(body.permissionMode))
                        c.permissionMode = body.permissionMode;
                    if (Array.isArray(body.allowedRoles))
                        c.allowedRoles = body.allowedRoles;
                    if (body.categoryId)
                        c.categoryId = String(body.categoryId);
                    return c;
                }
                for (const key of COMMAND_FIELDS)
                    if (body[key] !== undefined)
                        c[key] = body[key];
                return c;
            });
            syncGuildSlashCommands(req.params.guildId);
            res.json(command);
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.delete("/guilds/:guildId/custom-commands/:commandId", async (req, res) => {
        try {
            await store.withFile(async (data) => {
                const g = ensureCommandsGuildEntry(data, req.params.guildId);
                const c = g.commands.find(x => x.id === req.params.commandId);
                if (c?.builtin)
                    throw new Error("Built-in commands can't be deleted, only disabled");
                g.commands = g.commands.filter(x => x.id !== req.params.commandId);
                return null;
            });
            syncGuildSlashCommands(req.params.guildId);
            res.json({ ok: true });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.post("/guilds/:guildId/custom-commands/:commandId/duplicate", async (req, res) => {
        try {
            const command = await store.withFile(async (data) => {
                const g = ensureCommandsGuildEntry(data, req.params.guildId);
                const src = g.commands.find(x => x.id === req.params.commandId);
                if (!src)
                    throw new Error("Command not found");
                const c = { ...JSON.parse(JSON.stringify(src)), id: String(g.nextCommandId++), name: `${src.name} (copy)`, enabled: false, builtin: null, history: [], createdAt: new Date().toISOString() };
                g.commands.push(c);
                return c;
            });
            res.json(command);
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.put("/guilds/:guildId/custom-commands-order", async (req, res) => {
        try {
            const { orderedIds } = req.body || {};
            const commands = await store.withFile(async (data) => {
                const g = ensureCommandsGuildEntry(data, req.params.guildId);
                const byId = new Map(g.commands.map(c => [c.id, c]));
                const ordered = (orderedIds || []).map(id => byId.get(id)).filter(Boolean);
                const remaining = g.commands.filter(c => !(orderedIds || []).includes(c.id));
                g.commands = [...ordered, ...remaining];
                return g.commands;
            });
            res.json({ commands });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.put("/guilds/:guildId/custom-commands-bulk", async (req, res) => {
        try {
            const { enabled } = req.body || {};
            const commands = await store.withFile(async (data) => {
                const g = ensureCommandsGuildEntry(data, req.params.guildId);
                g.commands.forEach(c => { c.enabled = Boolean(enabled); });
                return g.commands;
            });
            syncGuildSlashCommands(req.params.guildId);
            res.json({ commands });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.get("/guilds/:guildId/custom-commands/categories", (req, res) => { try {
        const g = ensureCommandsGuildEntry(store.load(), req.params.guildId);
        res.json({ categories: g.categories });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    } });
    app.post("/guilds/:guildId/custom-commands/categories", async (req, res) => { try {
        const category = await store.withFile(async (data) => { const g = ensureCommandsGuildEntry(data, req.params.guildId); const id = String(req.body?.id || req.body?.name || "category").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || `category-${Date.now()}`; if (g.categories.some(c => c.id === id))
            throw new Error("Category already exists"); const c = { id, name: String(req.body?.name || id).slice(0, 60), enabled: req.body?.enabled !== false }; g.categories.push(c); return c; });
        res.json(category);
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    } });
    app.put("/guilds/:guildId/custom-commands/categories/:categoryId", async (req, res) => { try {
        const categories = await store.withFile(async (data) => { const g = ensureCommandsGuildEntry(data, req.params.guildId); const c = g.categories.find(x => x.id === req.params.categoryId); if (!c)
            throw new Error("Category not found"); if (req.body?.name !== undefined)
            c.name = String(req.body.name).slice(0, 60); if (req.body?.enabled !== undefined)
            c.enabled = Boolean(req.body.enabled); return g.categories; });
        syncGuildSlashCommands(req.params.guildId);
        res.json({ categories });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    } });
    app.get("/guilds/:guildId/custom-commands/export", (req, res) => { try {
        const g = ensureCommandsGuildEntry(store.load(), req.params.guildId);
        const safe = { version: 1, categories: g.categories, commands: g.commands.filter(c => !c.builtin).map(({ history, ...c }) => c) };
        res.setHeader("Content-Disposition", `attachment; filename="custom-commands-${req.params.guildId}.json"`);
        res.json(safe);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    } });
    app.post("/guilds/:guildId/custom-commands/import", async (req, res) => { try {
        const payload = req.body || {};
        const commands = Array.isArray(payload.commands) ? payload.commands : [];
        await store.withFile(async (data) => { const g = ensureCommandsGuildEntry(data, req.params.guildId); if (Array.isArray(payload.categories))
            g.categories = payload.categories.filter(c => c && c.id).map(c => ({ id: String(c.id), name: String(c.name || c.id).slice(0, 60), enabled: c.enabled !== false })); for (const src of commands) {
            if (!src || src.builtin)
                continue;
            const c = { ...src, id: String(g.nextCommandId++), builtin: null, history: [], createdAt: new Date().toISOString(), categoryId: src.categoryId || "general" };
            g.commands.push(c);
        } });
        syncGuildSlashCommands(req.params.guildId);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    } });
    app.get("/guilds/:guildId/custom-commands-meta", async (req, res) => {
        try {
            const guild = client.guilds.cache.get(req.params.guildId);
            if (!guild)
                return res.status(404).json({ error: "Bot is not in this server" });
            const roles = guild.roles.cache.filter(r => r.id !== guild.id).map(r => ({ id: r.id, name: r.name, color: r.hexColor && r.hexColor !== "#000000" ? r.hexColor : "#99aab5" }));
            const members = guild.members.cache.map(m => ({ id: m.id, name: m.user.username, displayName: m.displayName, avatarUrl: m.user.displayAvatarURL({ size: 32 }) })).slice(0, 500);
            res.json({ roles, members });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
};
