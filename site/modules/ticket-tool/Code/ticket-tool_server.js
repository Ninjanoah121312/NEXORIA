// ticket-tool_server.js
module.exports = function registerTicketTool(kit, moduleId) {
    const { app, client, createModuleStore, isGuildAllowed, GUILD_NOT_ALLOWED_MESSAGE, siteUrl, requireAdminAuth, buildVariables, getGeneralSettings, registerLeaderboardProvider } = kit;
    const { PermissionsBitField, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, } = require("discord.js");
    const crypto = require("crypto");
    const DEFAULT_PANEL = { title: "Need help?", description: "Pick a subject below to open a private support ticket.", plainText: "", embedEnabled: true, color: "#8b5cf6", style: "dropdown", buttons: null };
    const PRIORITIES = ["low", "normal", "high", "urgent"];
    const rawStore = createModuleStore(moduleId, { guilds: {} });
    const store = { load: () => rawStore.load().data, withFile: rawStore.withFile };
    function ensureGuildEntry(data, guildId) {
        data.guilds = data.guilds || {};
        data.guilds[guildId] = data.guilds[guildId] || {
            tickets: [],
            subjects: [],
            config: { ticketChannel: null, ticketCategory: null, supportRole: null, logChannel: null, ticketNameFormat: "{subject.name}-{user.name}" },
            panels: [],
            shareLinks: {},
            closingDm: {
                enabled: true,
                embedColor: "#8b5cf6",
                message: "**{server.name}**\n**Ticket Closed**\nThank you for using our ticket system. Your ticket was closed either by you or one of our supporters.\n\nIf you need any assistance in the future, feel free to open another ticket.\n**Did you not see the answer?**\nYou can view the ticket at anytime by visiting the website\n{ticket.url}",
            },
            sharingEnabled: false,
            leaderboard: { enabled: true, mode: "all", refreshMinutes: 30 },
            reviews: [],
            nextTicketId: 1,
            nextSubjectId: 1,
            nextPanelId: 1,
            moduleDisabled: false,
            staffOnlyClaim: true,
        };
        const g = data.guilds[guildId];
        g.moduleDisabled = Boolean(g.moduleDisabled);
        g.tickets = g.tickets || [];
        g.subjects = g.subjects || [];
        g.config = g.config || {};
        g.config.logChannel = g.config.logChannel ?? null;
        g.config.ticketNameFormat = g.config.ticketNameFormat ?? "{subject.name}-{user.name}";
        g.staffOnlyClaim = g.staffOnlyClaim !== false;
        g.shareLinks = g.shareLinks || {};
        g.closingDm = g.closingDm || {};
        g.closingDm.enabled = g.closingDm.enabled !== false;
        g.closingDm.embedColor = g.closingDm.embedColor || "#8b5cf6";
        g.closingDm.message = g.closingDm.message || "**{server.name}**\n**Ticket Closed**\nThank you for using our ticket system. Your ticket was closed either by you or one of our supporters.\n\nIf you need any assistance in the future, feel free to open another ticket.\n**Did you not see the answer?**\nYou can view the ticket at anytime by visiting the website\n{ticket.url}";
        g.sharingEnabled = g.sharingEnabled === true;
        g.leaderboard = { enabled: g.leaderboard?.enabled !== false, mode: ["all", "none", "ticket-reviews"].includes(g.leaderboard?.mode) ? g.leaderboard.mode : "all", refreshMinutes: Number(g.leaderboard?.refreshMinutes) > 0 ? Number(g.leaderboard.refreshMinutes) : 30 };
        g.reviews = Array.isArray(g.reviews) ? g.reviews : [];
        g.panels = g.panels || [];
        g.nextPanelId = g.nextPanelId || 1;
        g.panels.forEach(p => {
            p.plainText = p.plainText ?? "";
            p.embedEnabled = p.embedEnabled ?? Boolean(p.title || p.description);
            p.channelId = p.channelId ?? null;
            p.messageId = p.messageId ?? null;
            p.postedAt = p.postedAt ?? null;
        });
        g.nextSubjectId = g.nextSubjectId || 1;
        g.subjects.forEach(s => {
            s.welcomeMessage = s.welcomeMessage ?? "{user.mention} welcome — **{subject.name}**. Describe your issue and support will be with you shortly.";
            s.closeMessage = s.closeMessage ?? "This ticket has been closed. Thanks for reaching out!";
            s.staffRoles = s.staffRoles || [];
            s.icon = s.icon ?? "";
            s.priority = PRIORITIES.includes(s.priority) ? s.priority : "normal";
        });
        g.nextTicketId = g.nextTicketId || 1;
        (g.tickets || []).forEach(t => {
            t.number = t.number ?? t.id;
            t.claimedById = t.claimedById ?? null;
            t.closedById = t.closedById ?? null;
            t.messages = t.messages || [];
            t.viewers = t.viewers || [];
            if (t.shareId && !t.currentShareId) {
                g.shareLinks[t.shareId] = g.shareLinks[t.shareId] || { ticketId: t.id, createdAt: t.createdAt || new Date().toISOString(), views: t.shareViews || [] };
                t.currentShareId = t.shareId;
            }
            t.currentShareId = t.currentShareId ?? null;
            t.reviewId = t.reviewId ?? null;
            delete t.shareId;
            delete t.shareViews;
        });
        return g;
    }
    function buildShareUrl(shareId) {
        if (!shareId)
            return null;
        return `${siteUrl}/share/${shareId}`;
    }
    function buildTicketUrl(guildId, ticketId) {
        return `${siteUrl}/my-tickets/ticket/${guildId}/${ticketId}`;
    }
    function resolvePanelButtons(panel, subjects) {
        const activeSubjects = subjects.filter(s => s.active);
        if (Array.isArray(panel.buttons) && panel.buttons.length > 0) {
            return panel.buttons
                .map(b => {
                const subject = subjects.find(s => s.id === b.subjectId);
                if (!subject || !subject.active)
                    return null;
                return {
                    subjectId: subject.id,
                    label: (b.label || subject.name || "Ticket").slice(0, 100),
                    icon: b.icon ?? subject.icon ?? "",
                    description: (b.description ?? subject.description ?? "").slice(0, 100),
                };
            })
                .filter(Boolean);
        }
        return activeSubjects.map(s => ({ subjectId: s.id, label: s.name, icon: s.icon || "", description: s.description || "" }));
    }
    function renderTemplate(template, vars) {
        return (template || "").replace(/\{([a-zA-Z0-9_.]+)\}/g, (m, key) => (key in vars ? vars[key] : m));
    }
    function isStaffMember(member, g, subject) {
        if (!member)
            return false;
        if (member.permissions?.has?.(PermissionsBitField.Flags.ManageChannels))
            return true;
        if (member.permissions?.has?.(PermissionsBitField.Flags.Administrator))
            return true;
        const staffRoleIds = new Set([...(g?.config?.supportRole ? [g.config.supportRole] : []), ...(subject?.staffRoles || [])]);
        return member.roles?.cache?.some(r => staffRoleIds.has(r.id)) || false;
    }
    async function findTicketByChannelId(data, channelId) {
        for (const guildId of Object.keys(data.guilds || {})) {
            const g = data.guilds[guildId];
            const ticket = (g.tickets || []).find(t => t.channelId === channelId);
            if (ticket)
                return { guildId, g, ticket };
        }
        return null;
    }
    async function authorizeTicketAccess(guildId, ticketId, requesterId, { allowAdminPanel = false } = {}) {
        if (allowAdminPanel) {
            const data = await store.load();
            const g = ensureGuildEntry(data, guildId);
            const ticket = g.tickets.find(t => String(t.id) === String(ticketId));
            if (!ticket)
                return { ok: false, status: 404, error: "Ticket not found" };
            return { ok: true, ticket, g };
        }
        if (!requesterId)
            return { ok: false, status: 401, error: "You must be logged in to view this ticket." };
        const data = await store.load();
        const g = ensureGuildEntry(data, guildId);
        const ticket = g.tickets.find(t => String(t.id) === String(ticketId));
        if (!ticket)
            return { ok: false, status: 404, error: "Ticket not found" };
        if (String(ticket.openedById) === String(requesterId))
            return { ok: true, ticket, g };
        const guild = client.guilds.cache.get(guildId);
        if (!guild)
            return { ok: false, status: 403, error: "You don't have permission to view this ticket." };
        if (guild.ownerId === requesterId)
            return { ok: true, ticket, g };
        try {
            const member = await guild.members.fetch(requesterId);
            const subject = g.subjects.find(s => s.id === ticket.subjectId);
            if (isStaffMember(member, g, subject))
                return { ok: true, ticket, g };
        }
        catch { }
        return { ok: false, status: 403, error: "You don't have permission to view this ticket." };
    }
    function reactionSummary(message) {
        return (message.reactions?.cache ? [...message.reactions.cache.values()] : []).map(r => ({
            emoji: r.emoji.id ? `<${r.emoji.animated ? "a" : ""}:${r.emoji.name}:${r.emoji.id}>` : r.emoji.name,
            count: r.count,
        }));
    }
    const SHARE_TOKEN_LENGTH = 50;
    const SHARE_TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    function randomShareToken() {
        let token = "";
        for (let i = 0; i < SHARE_TOKEN_LENGTH; i++) {
            token += SHARE_TOKEN_ALPHABET[crypto.randomInt(0, SHARE_TOKEN_ALPHABET.length)];
        }
        return token;
    }
    function tokenExistsAnywhere(data, token) {
        for (const guildId of Object.keys(data.guilds || {})) {
            const g = data.guilds[guildId];
            if (g?.shareLinks && Object.prototype.hasOwnProperty.call(g.shareLinks, token))
                return true;
        }
        return false;
    }
    function generateUniqueShareToken(data) {
        let token = randomShareToken();
        let attempts = 0;
        while (tokenExistsAnywhere(data, token)) {
            token = randomShareToken();
            attempts++;
            if (attempts > 1000)
                throw new Error("Could not generate a unique share token after 1000 attempts");
        }
        return token;
    }
    client.on("messageCreate", async (message) => {
        if (!message.guild)
            return;
        try {
            await store.withFile(async (data) => {
                const found = await findTicketByChannelId(data, message.channel.id);
                if (!found)
                    return null;
                const { g, ticket } = found;
                const subject = g.subjects.find(s => s.id === ticket.subjectId);
                const isBot = Boolean(message.author?.bot);
                const member = isBot ? null : await message.guild.members.fetch(message.author.id).catch(() => null);
                const staff = isBot ? false : isStaffMember(member, g, subject);
                ticket.messages = ticket.messages || [];
                ticket.messages.push({
                    id: message.id,
                    authorId: message.author.id,
                    authorName: message.author.username,
                    authorAvatar: message.author.displayAvatarURL?.({ size: 64 }) || null,
                    authorIsStaff: staff,
                    authorIsBot: isBot,
                    content: message.content || "",
                    embeds: (message.embeds || []).map(e => ({ title: e.title || null, description: e.description || null })),
                    attachments: [...message.attachments.values()].map(a => ({ name: a.name, url: a.url, contentType: a.contentType || null })),
                    createdAt: message.createdAt.toISOString(),
                    editedAt: null,
                    deleted: false,
                    deletedAt: null,
                    reactions: [],
                });
                if (!isBot && !staff && ticket.status === "open")
                    ticket.status = "pending";
                return null;
            });
        }
        catch (e) {
            console.warn("[ticket-tool] Failed to log ticket message:", e.message);
        }
    });
    client.on("messageUpdate", async (oldMessage, newMessage) => {
        if (!newMessage.guild)
            return;
        try {
            await store.withFile(async (data) => {
                const found = await findTicketByChannelId(data, newMessage.channel.id);
                if (!found)
                    return null;
                const entry = (found.ticket.messages || []).find(m => m.id === newMessage.id);
                if (!entry)
                    return null;
                entry.content = newMessage.content || entry.content;
                entry.editedAt = new Date().toISOString();
                return null;
            });
        }
        catch (e) {
            console.warn("[ticket-tool] Failed to log ticket message edit:", e.message);
        }
    });
    client.on("messageDelete", async (message) => {
        if (!message.guild)
            return;
        try {
            await store.withFile(async (data) => {
                const found = await findTicketByChannelId(data, message.channel.id);
                if (!found)
                    return null;
                const entry = (found.ticket.messages || []).find(m => m.id === message.id);
                if (!entry)
                    return null;
                entry.deleted = true;
                entry.deletedAt = new Date().toISOString();
                return null;
            });
        }
        catch (e) {
            console.warn("[ticket-tool] Failed to log ticket message deletion:", e.message);
        }
    });
    client.on("messageReactionAdd", async (reaction, user) => {
        if (user.bot)
            return;
        try {
            if (reaction.partial)
                await reaction.fetch().catch(() => { });
            const channel = reaction.message.channel;
            if (!channel?.guild)
                return;
            await store.withFile(async (data) => {
                const found = await findTicketByChannelId(data, channel.id);
                if (!found)
                    return null;
                const entry = (found.ticket.messages || []).find(m => m.id === reaction.message.id);
                if (!entry)
                    return null;
                entry.reactions = reactionSummary(reaction.message);
                return null;
            });
        }
        catch (e) {
            console.warn("[ticket-tool] Failed to log ticket reaction:", e.message);
        }
    });
    client.on("messageReactionRemove", async (reaction, user) => {
        if (user.bot)
            return;
        try {
            if (reaction.partial)
                await reaction.fetch().catch(() => { });
            const channel = reaction.message.channel;
            if (!channel?.guild)
                return;
            await store.withFile(async (data) => {
                const found = await findTicketByChannelId(data, channel.id);
                if (!found)
                    return null;
                const entry = (found.ticket.messages || []).find(m => m.id === reaction.message.id);
                if (!entry)
                    return null;
                entry.reactions = reactionSummary(reaction.message);
                return null;
            });
        }
        catch (e) {
            console.warn("[ticket-tool] Failed to log ticket reaction removal:", e.message);
        }
    });
    client.on("interactionCreate", async (interaction) => {
        if (interaction.isButton() && interaction.customId === "close_ticket")
            return handleCloseTicket(interaction);
        if (interaction.isButton() && interaction.customId === "claim_ticket")
            return handleClaimTicket(interaction);
        if (interaction.isButton() && interaction.customId.startsWith("open_ticket_subject_btn:"))
            return handleOpenTicket(interaction, interaction.customId.split(":")[1]);
        if (interaction.isStringSelectMenu() && interaction.customId === "open_ticket_subject")
            return handleOpenTicket(interaction, interaction.values[0]);
    });
    async function handleClaimTicket(interaction) {
        const channelId = interaction.channel.id;
        const guildData = await store.load();
        const g = ensureGuildEntry(guildData, interaction.guild.id);
        const ticket = g.tickets.find(t => t.channelId === channelId);
        if (!ticket)
            return interaction.reply({ content: "Couldn't find this ticket.", ephemeral: true });
        const subject = g.subjects.find(s => s.id === ticket.subjectId);
        const member = interaction.member;
        if (!isStaffMember(member, g, subject)) {
            return interaction.reply({ content: "Only staff can claim tickets.", ephemeral: true });
        }
        const result = await store.withFile(async (data) => {
            const g2 = ensureGuildEntry(data, interaction.guild.id);
            const t2 = g2.tickets.find(x => x.channelId === channelId);
            if (!t2)
                return { ok: false };
            t2.claimedBy = interaction.user.username;
            t2.claimedById = interaction.user.id;
            t2.claimedAt = new Date().toISOString();
            return { ok: true };
        });
        if (!result.ok)
            return interaction.reply({ content: "Couldn't find this ticket.", ephemeral: true });
        await interaction.reply({ content: `🔒 Claimed by ${interaction.user}` });
    }
    function buildPanelMessage(panel, buttons) {
        const embeds = [];
        if (panel.embedEnabled && (panel.title || panel.description)) {
            const embed = new EmbedBuilder().setColor(parseInt((panel.color || "#8b5cf6").replace("#", ""), 16));
            if (panel.title)
                embed.setTitle(panel.title);
            if (panel.description)
                embed.setDescription(panel.description);
            embeds.push(embed);
        }
        let row;
        if (panel.style === "buttons") {
            row = new ActionRowBuilder().addComponents(buttons.slice(0, 5).map(b => new ButtonBuilder().setCustomId(`open_ticket_subject_btn:${b.subjectId}`).setLabel(b.icon ? `${b.icon} ${b.label}` : b.label).setStyle(ButtonStyle.Primary)));
        }
        else {
            const menu = new StringSelectMenuBuilder()
                .setCustomId("open_ticket_subject")
                .setPlaceholder("Select an option...")
                .addOptions(buttons.map(b => ({ label: b.label, value: b.subjectId, description: b.description?.slice(0, 100) || undefined, emoji: b.icon || undefined })));
            row = new ActionRowBuilder().addComponents(menu);
        }
        return { content: panel.plainText || undefined, embeds, row };
    }
    async function handleOpenTicket(interaction, subjectId) {
        await interaction.deferReply({ ephemeral: true });
        const guild = interaction.guild;
        if (!isGuildAllowed(guild.id)) {
            return interaction.editReply({ content: GUILD_NOT_ALLOWED_MESSAGE }).catch(() => { });
        }
        const preCheckData = await store.load();
        const preCheckGuild = ensureGuildEntry(preCheckData, guild.id);
        const preCheckSubject = preCheckGuild.subjects.find(s => s.id === subjectId);
        if (preCheckSubject?.restrictedRoles?.length > 0) {
            const member = interaction.member;
            const hasRole = preCheckSubject.restrictedRoles.some(rid => member.roles.cache.has(rid));
            const allowed = preCheckSubject.roleRestrictionMode === "disallow" ? !hasRole : hasRole;
            if (!allowed)
                return interaction.editReply({ content: "You don't have permission to open this type of ticket." }).catch(() => { });
        }
        let result;
        try {
            result = await store.withFile(async (data) => {
                const g = ensureGuildEntry(data, guild.id);
                const subject = g.subjects.find(s => s.id === subjectId);
                const ticketId = g.nextTicketId++;
                const format = subject?.ticketNameFormat || g.config.ticketNameFormat || "{subject.name}-{user.name}";
                const nameVars = { "subject.name": (subject?.name || "ticket").toLowerCase().replace(/\s+/g, "-"), "user.name": interaction.user.username.toLowerCase().replace(/\s+/g, "-"), "ticket.id": String(ticketId) };
                const channelName = renderTemplate(format, nameVars).slice(0, 90) || `ticket-${ticketId}`;
                const botPerms = guild.members.me.permissions;
                const botOverwriteAllow = [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages];
                if (botPerms.has(PermissionsBitField.Flags.ManageChannels))
                    botOverwriteAllow.push(PermissionsBitField.Flags.ManageChannels);
                if (botPerms.has(PermissionsBitField.Flags.ManageMessages))
                    botOverwriteAllow.push(PermissionsBitField.Flags.ManageMessages);
                const validRoleId = (rid) => rid && guild.roles.cache.has(rid);
                const staffOverwrites = (subject?.staffRoles || []).filter(validRoleId).map(rid => ({ id: rid, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }));
                const supportOverwrite = validRoleId(g.config.supportRole) ? [{ id: g.config.supportRole, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] : [];
                const channel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: subject?.category || g.config.ticketCategory || undefined,
                    permissionOverwrites: [
                        { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                        { id: guild.members.me.id, allow: botOverwriteAllow },
                        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                        ...supportOverwrite,
                        ...staffOverwrites,
                    ],
                });
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("claim_ticket").setLabel("Claim ticket").setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId("close_ticket").setLabel("Close ticket").setStyle(ButtonStyle.Danger));
                const vars = await buildVariables(guild, {
                    user: interaction.user,
                    channel,
                    subject,
                    ticket: { id: ticketId, number: ticketId, subject: subject?.name || "Support", priority: subject?.priority || "normal", status: "open", openedBy: interaction.user.username, claimedBy: null, currentShareId: null },
                });
                try {
                    await channel.send({
                        content: renderTemplate(subject?.welcomeMessage || "{user.mention} welcome — **{subject.name}**. Describe your issue and support will be with you shortly.", vars),
                        components: [row],
                    });
                }
                catch (sendErr) {
                    console.warn(`[ticket-tool] Couldn't send welcome message in ticket #${ticketId}:`, sendErr.message);
                }
                g.tickets.push({
                    id: ticketId,
                    number: ticketId,
                    shareId: null,
                    shareViews: [],
                    channelId: channel.id,
                    openedBy: interaction.user.username,
                    openedById: interaction.user.id,
                    subjectId: subject?.id || null,
                    subject: subject?.name || "General",
                    priority: subject?.priority || "normal",
                    status: "open",
                    createdAt: new Date().toISOString(),
                    claimedBy: null,
                    claimedById: null,
                    claimedAt: null,
                    closedBy: null,
                    closedById: null,
                    closedAt: null,
                    messages: [],
                });
                return { channel, ticketId };
            });
        }
        catch (e) {
            console.warn("[ticket-tool] Failed to open ticket:", e.message);
            return interaction.editReply({ content: "Something went wrong opening your ticket. Please try again or contact staff." }).catch(() => { });
        }
        await interaction.editReply({ content: `Ticket opened: <#${result.channel.id}>` });
    }
    async function handleCloseTicket(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const guild = interaction.guild;
        const channelId = interaction.channel.id;
        const preData = await store.load();
        const preGuild = ensureGuildEntry(preData, guild.id);
        const preTicket = preGuild.tickets.find(t => t.channelId === channelId);
        const preSubject = preTicket ? preGuild.subjects.find(s => s.id === preTicket.subjectId) : null;
        if (!isStaffMember(interaction.member, preGuild, preSubject)) {
            return interaction.editReply({ content: "Only staff can close tickets." }).catch(() => { });
        }
        const closedTicket = await store.withFile(async (data) => {
            const g = ensureGuildEntry(data, guild.id);
            const ticket = g.tickets.find(t => t.channelId === channelId);
            const subject = ticket ? g.subjects.find(s => s.id === ticket.subjectId) : null;
            if (ticket) {
                ticket.status = "closed";
                ticket.closedAt = new Date().toISOString();
                ticket.closedBy = interaction.user.username;
                ticket.closedById = interaction.user.id;
            }
            return { ticket, subject, guildId: guild.id, logChannel: g.config.logChannel, closingDm: g.closingDm };
        });
        if (closedTicket?.ticket?.openedById) {
            try {
                const opener = await client.users.fetch(closedTicket.ticket.openedById);
                const vars = await buildVariables(guild, { user: opener, ticket: closedTicket.ticket, subject: closedTicket.subject });
                const msg = renderTemplate(closedTicket.subject?.closeMessage || "This ticket has been closed. Thanks for reaching out!", vars);
                await opener.send({ content: msg }).catch(() => { });
                const reviewUrl = buildTicketUrl(closedTicket.guildId, closedTicket.ticket.id);
                const reviewEmbed = new EmbedBuilder().setTitle("How was your support?").setDescription(`Your ticket **#${closedTicket.ticket.number ?? closedTicket.ticket.id}** has been closed.\n\nOpen the ticket to rate the support from 1 to 10 stars, including half-star ratings. Your individual review is private from the server owner, and you can change it whenever you want.`).setColor(parseInt("8b5cf6", 16));
                const reviewRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("Open ticket & review").setStyle(ButtonStyle.Link).setURL(reviewUrl));
                await opener.send({ embeds: [reviewEmbed], components: [reviewRow] }).catch(() => { });
                if (closedTicket.closingDm?.enabled) {
                    const dmVars = { ...vars, "ticket.url": reviewUrl, "review.url": reviewUrl };
                    const dmText = renderTemplate(closedTicket.closingDm.message, dmVars);
                    const dmEmbed = new EmbedBuilder().setDescription(dmText).setColor(parseInt((closedTicket.closingDm.embedColor || "#8b5cf6").replace("#", ""), 16));
                    await opener.send({ embeds: [dmEmbed] }).catch(() => { });
                }
            }
            catch { }
        }
        if (closedTicket?.logChannel && closedTicket.ticket) {
            const logCh = guild.channels.cache.get(closedTicket.logChannel);
            if (logCh) {
                const t = closedTicket.ticket;
                const embed = new EmbedBuilder()
                    .setTitle(`Ticket #${t.number ?? t.id} closed`)
                    .addFields({ name: "Subject", value: t.subject || "—", inline: true }, { name: "Opened by", value: t.openedBy || "—", inline: true }, { name: "Closed by", value: t.closedBy || "—", inline: true })
                    .setColor(0xe94560)
                    .setTimestamp();
                logCh.send({ embeds: [embed] }).catch(() => { });
            }
        }
        await interaction.editReply({ content: "Closing ticket in 5 seconds…" });
        setTimeout(() => interaction.channel.delete().catch(() => { }), 5000);
    }
    app.get("/guilds/:guildId/ticket-tool/export", (req, res) => { try {
        const data = store.load();
        const g = ensureGuildEntry(data, req.params.guildId);
        const payload = { version: 1, config: g.config, subjects: g.subjects, panels: g.panels, closingDm: g.closingDm };
        res.setHeader("Content-Disposition", `attachment; filename="ticket-settings-${req.params.guildId}.json"`);
        res.json(payload);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    } });
    app.post("/guilds/:guildId/ticket-tool/import", async (req, res) => { try {
        const body = req.body || {};
        await store.withFile(async (data) => { const g = ensureGuildEntry(data, req.params.guildId); if (body.config && typeof body.config === 'object')
            g.config = { ...g.config, ...body.config }; if (Array.isArray(body.subjects))
            g.subjects = body.subjects; if (Array.isArray(body.panels))
            g.panels = body.panels; if (body.closingDm && typeof body.closingDm === 'object')
            g.closingDm = { ...g.closingDm, ...body.closingDm }; });
        res.json({ ok: true });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    } });
    const userProfileCache = new Map();
    const USER_PROFILE_CACHE_MS = 5 * 60_000;
    async function fetchUserProfile(userId) {
        const cached = userProfileCache.get(userId);
        if (cached && Date.now() - cached.fetchedAt < USER_PROFILE_CACHE_MS)
            return cached.profile;
        let profile;
        try {
            const u = await client.users.fetch(userId);
            profile = { id: u.id, displayName: u.globalName || u.username, username: u.username, avatarUrl: u.displayAvatarURL({ size: 64 }) };
        }
        catch {
            profile = { id: userId, displayName: null, username: null, avatarUrl: null };
        }
        userProfileCache.set(userId, { profile, fetchedAt: Date.now() });
        return profile;
    }
    async function enrichTicketsWithOpener(tickets) {
        const uniqueIds = [...new Set(tickets.map(t => t.openedById).filter(Boolean))];
        const profiles = {};
        for (const id of uniqueIds)
            profiles[id] = await fetchUserProfile(id);
        return tickets.map(t => ({ ...t, opener: t.openedById ? profiles[t.openedById] : null }));
    }
    app.get("/guilds/:guildId/tickets", async (req, res) => {
        try {
            const guild = client.guilds.cache.get(req.params.guildId);
            const g = await store.withFile(async (data) => ensureGuildEntry(data, req.params.guildId));
            const tickets = await enrichTicketsWithOpener(g.tickets || []);
            res.json({ tickets, memberCount: guild?.memberCount ?? null, staffOnlyClaim: g.staffOnlyClaim !== false });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.get("/tickets", async (req, res) => {
        try {
            const userId = req.query.userId;
            if (!userId)
                return res.status(400).json({ error: "userId is required" });
            const data = await store.load();
            const results = [];
            for (const guild of client.guilds.cache.values()) {
                const g = data.guilds?.[guild.id];
                for (const t of g?.tickets || []) {
                    if (t.openedById !== userId)
                        continue;
                    results.push({ ...t, guildId: guild.id, guildName: guild.name, guildIcon: guild.icon });
                }
            }
            results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            const enriched = await enrichTicketsWithOpener(results);
            res.json({ tickets: enriched });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    async function recordTicketViewer(guildId, ticketId, viewerId) {
        if (!viewerId)
            return;
        try {
            await store.withFile(async (data) => {
                const g = ensureGuildEntry(data, guildId);
                const ticket = g.tickets.find(t => String(t.id) === String(ticketId));
                if (!ticket)
                    return null;
                ticket.viewers = ticket.viewers || [];
                ticket.viewers.push({ userId: viewerId, viewedAt: new Date().toISOString() });
                if (ticket.viewers.length > 200)
                    ticket.viewers = ticket.viewers.slice(-200);
                return null;
            });
        }
        catch (e) {
            console.warn("[ticket-tool] Failed to record ticket viewer:", e.message);
        }
    }
    async function enrichTicketViewers(ticket) {
        const raw = ticket.viewers || [];
        const latestByUser = new Map();
        for (const v of raw)
            latestByUser.set(v.userId, v.viewedAt);
        const entries = [...latestByUser.entries()].sort((a, b) => new Date(b[1]) - new Date(a[1]));
        const out = [];
        for (const [userId, viewedAt] of entries) {
            const profile = await fetchUserProfile(userId);
            out.push({ userId, viewedAt, displayName: profile.displayName || profile.username || userId, avatarUrl: profile.avatarUrl });
        }
        return out;
    }
    app.get("/guilds/:guildId/tickets/:ticketId/transcript", async (req, res) => {
        try {
            const requesterId = req.query.requesterId;
            const authCheck = await authorizeTicketAccess(req.params.guildId, req.params.ticketId, requesterId);
            if (!authCheck.ok)
                return res.status(authCheck.status).json({ error: authCheck.error });
            await recordTicketViewer(req.params.guildId, req.params.ticketId, requesterId);
            const g = await store.withFile(async (data) => ensureGuildEntry(data, req.params.guildId));
            const ticket = g?.tickets?.find(t => String(t.id) === req.params.ticketId);
            if (!ticket)
                return res.status(404).json({ error: "Ticket not found" });
            const opener = ticket.openedById ? await fetchUserProfile(ticket.openedById) : null;
            const claimer = ticket.claimedById ? await fetchUserProfile(ticket.claimedById) : null;
            const closer = ticket.closedById ? await fetchUserProfile(ticket.closedById) : null;
            res.json({ ticket, messages: ticket.messages || [], hasLog: Array.isArray(ticket.messages), opener, claimer, closer });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.get("/admin/guilds/:guildId/tickets/:ticketId", requireAdminAuth, async (req, res) => {
        try {
            const authCheck = await authorizeTicketAccess(req.params.guildId, req.params.ticketId, null, { allowAdminPanel: true });
            if (!authCheck.ok)
                return res.status(authCheck.status).json({ error: authCheck.error });
            await recordTicketViewer(req.params.guildId, req.params.ticketId, req.adminUserId);
            const g = await store.withFile(async (data) => ensureGuildEntry(data, req.params.guildId));
            const ticket = g?.tickets?.find(t => String(t.id) === req.params.ticketId);
            if (!ticket)
                return res.status(404).json({ error: "Ticket not found" });
            const viewers = await enrichTicketViewers(ticket);
            const opener = ticket.openedById ? await fetchUserProfile(ticket.openedById) : null;
            res.json({ ticket, messages: ticket.messages || [], hasLog: Array.isArray(ticket.messages), viewers, opener });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    function reviewAuth(guildId, ticketId, requesterId) { return authorizeTicketAccess(guildId, ticketId, requesterId).then(a => { if (!a.ok)
        return a; if (String(a.ticket.openedById) !== String(requesterId))
        return { ok: false, status: 403, error: "Only the ticket owner can review this ticket." }; if (a.ticket.status !== "closed")
        return { ok: false, status: 409, error: "You can review a ticket after it has been closed." }; return a; }); }
    app.get("/guilds/:guildId/tickets/:ticketId/review", async (req, res) => { try {
        const a = await reviewAuth(req.params.guildId, req.params.ticketId, String(req.query.requesterId || ""));
        if (!a.ok)
            return res.status(a.status).json({ error: a.error });
        const g = await store.withFile(async (d) => ensureGuildEntry(d, req.params.guildId));
        const r = (g.reviews || []).find(x => String(x.ticketId) === String(req.params.ticketId) && String(x.userId) === String(req.query.requesterId));
        res.json({ review: r ? { rating: r.rating, createdAt: r.createdAt, updatedAt: r.updatedAt } : null });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    } });
    app.put("/guilds/:guildId/tickets/:ticketId/review", async (req, res) => { try {
        const uid = String(req.body?.requesterId || "");
        const rating = Number(req.body?.rating);
        if (!Number.isFinite(rating) || rating < 1 || rating > 10 || Math.round(rating * 2) !== rating * 2)
            return res.status(400).json({ error: "Rating must be from 1 to 10 in half-star increments." });
        const a = await reviewAuth(req.params.guildId, req.params.ticketId, uid);
        if (!a.ok)
            return res.status(a.status).json({ error: a.error });
        const now = new Date().toISOString();
        const out = await store.withFile(async (d) => { const g = ensureGuildEntry(d, req.params.guildId); g.reviews = g.reviews || []; let r = g.reviews.find(x => String(x.ticketId) === String(req.params.ticketId) && String(x.userId) === uid); const created = !r; if (!r) {
            r = { id: crypto.randomBytes(10).toString("hex"), ticketId: Number(req.params.ticketId), userId: uid, guildId: req.params.guildId, rating, createdAt: now, updatedAt: now, claimedById: a.ticket.claimedById || a.ticket.closedById || null };
            g.reviews.push(r);
        }
        else {
            r.rating = rating;
            r.updatedAt = now;
        } a.ticket.reviewId = r.id; return { rating: r.rating, created }; });
        res.json({ ok: true, ...out });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    } });
    app.delete("/guilds/:guildId/tickets/:ticketId/review", async (req, res) => { try {
        const uid = String(req.query.requesterId || "");
        const a = await reviewAuth(req.params.guildId, req.params.ticketId, uid);
        if (!a.ok)
            return res.status(a.status).json({ error: a.error });
        await store.withFile(async (d) => { const g = ensureGuildEntry(d, req.params.guildId); g.reviews = (g.reviews || []).filter(r => !(String(r.ticketId) === String(req.params.ticketId) && String(r.userId) === uid)); a.ticket.reviewId = null; });
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    } });
    app.get("/guilds/:guildId/ticket-tool/reviews", async (req, res) => { try {
        const guild = client.guilds.cache.get(req.params.guildId);
        const uid = String(req.query.userId || "");
        if (!guild)
            return res.status(404).json({ error: "Bot is not in this server" });
        const m = await guild.members.fetch(uid).catch(() => null);
        if (!m || (guild.ownerId !== uid && !m.permissions.has(PermissionsBitField.Flags.Administrator)))
            return res.status(403).json({ error: "Dashboard access required." });
        const g = await store.withFile(async (d) => ensureGuildEntry(d, req.params.guildId));
        const reviews = (g.reviews || []).map(r => ({ rating: r.rating, createdAt: r.createdAt, updatedAt: r.updatedAt }));
        res.json({ reviews, leaderboard: g.leaderboard });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    } });
    app.get("/guilds/:guildId/ticket-tool/leaderboard", async (req, res) => { try {
        const guild = client.guilds.cache.get(req.params.guildId);
        const uid = String(req.query.userId || "");
        if (!guild)
            return res.status(404).json({ error: "Bot is not in this server" });
        const m = await guild.members.fetch(uid).catch(() => null);
        if (!m || (guild.ownerId !== uid && !m.permissions.has(PermissionsBitField.Flags.Administrator)))
            return res.status(403).json({ error: "Dashboard access required." });
        const g = await store.withFile(async (d) => ensureGuildEntry(d, req.params.guildId));
        const rs = (g.reviews || []).filter(r => Number.isFinite(Number(r.rating)));
        const now = Date.now();
        const ranges = { daily: 1, weekly: 7, monthly: 30, sixMonths: 183, yearly: 365, total: null };
        const stats = {};
        for (const [k, days] of Object.entries(ranges)) {
            const a = days === null ? rs : rs.filter(r => now - new Date(r.createdAt).getTime() <= days * 86400000);
            stats[k] = { count: a.length, average: a.length ? a.reduce((x, r) => x + Number(r.rating), 0) / a.length : 0 };
        }
        const daily = Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (29 - i)); const n = new Date(d); n.setDate(n.getDate() + 1); const a = rs.filter(r => new Date(r.createdAt) >= d && new Date(r.createdAt) < n); return { date: d.toISOString().slice(0, 10), count: a.length, average: a.length ? a.reduce((x, r) => x + Number(r.rating), 0) / a.length : 0 }; });
        const staff = {};
        for (const r of rs) {
            const id = r.claimedById || r.closedById || "unassigned";
            staff[id] = staff[id] || { userId: id, votes: 0, total: 0 };
            staff[id].votes++;
            staff[id].total += Number(r.rating);
        }
        const staffRows = Object.values(staff).map(x => ({ ...x, average: x.total / x.votes })).sort((a, b) => b.average - a.average || b.votes - a.votes).slice(0, 100);
        res.json({ leaderboard: g.leaderboard, stats, daily, staff: staffRows, updatedAt: new Date().toISOString() });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    } });
    if (typeof registerLeaderboardProvider === "function") {
        registerLeaderboardProvider(async () => {
            try {
                const data = await store.load();
                const servers = [], staff = [];
                for (const guild of client.guilds.cache.values()) {
                    const g = data.guilds?.[guild.id];
                    if (!g || g.leaderboard?.enabled === false || g.leaderboard?.mode === "none") continue;
                    const gs = typeof getGeneralSettings === "function" ? getGeneralSettings(guild.id) : null;
                    if (gs?.leaderboardMode === "none") continue;
                    const rs = (g.reviews || []).filter(r => Number.isFinite(Number(r.rating)));
                    if (!rs.length) continue;
                    const avg = rs.reduce((a, r) => a + Number(r.rating), 0) / rs.length;
                    servers.push({ guildId: guild.id, guildName: guild.name, guildIcon: guild.icon, average: avg, votes: rs.length });
                    for (const r of rs) {
                        const id = r.claimedById || r.closedById || "unassigned";
                        let x = staff.find(v => v.guildId === guild.id && v.userId === id);
                        if (!x) { x = { guildId: guild.id, guildName: guild.name, userId: id, votes: 0, total: 0, average: 0 }; staff.push(x); }
                        x.votes++; x.total += Number(r.rating); x.average = x.total / x.votes;
                    }
                }
                servers.sort((a,b) => b.average-a.average || b.votes-a.votes);
                staff.sort((a,b) => b.average-a.average || b.votes-a.votes);
                return { id: "ticket-tool", label: "Ticket Tool", leaderboard: true, refreshMinutes: 30, updatedAt: new Date().toISOString(), servers, staff: staff.slice(0,100) };
            } catch (e) { console.warn("[ticket-tool] leaderboard provider failed:", e.message); return { id: "ticket-tool", label: "Ticket Tool", leaderboard: true, refreshMinutes: 30, servers: [], staff: [], error: e.message }; }
        });
    }
    app.post("/guilds/:guildId/tickets/:ticketId/share", async (req, res) => {
        try {
            const { requesterId } = req.body || {};
            const authCheck = await authorizeTicketAccess(req.params.guildId, req.params.ticketId, requesterId);
            if (!authCheck.ok)
                return res.status(authCheck.status).json({ error: authCheck.error });
            const result = await store.withFile(async (data) => {
                const g = ensureGuildEntry(data, req.params.guildId);
                if (!g.sharingEnabled)
                    throw Object.assign(new Error("Sharing is turned off for this server."), { httpStatus: 403 });
                const ticket = g.tickets.find(t => String(t.id) === req.params.ticketId);
                if (!ticket)
                    throw new Error("Ticket not found");
                const shareId = generateUniqueShareToken(data);
                g.shareLinks[shareId] = { ticketId: ticket.id, createdAt: new Date().toISOString(), views: [] };
                ticket.currentShareId = shareId;
                return { shareId };
            });
            res.json({ shareId: result.shareId, shareUrl: buildShareUrl(result.shareId) });
        }
        catch (e) {
            res.status(e.httpStatus || 500).json({ error: e.message });
        }
    });
    app.get("/guilds/:guildId/sharing-settings", async (req, res) => {
        try {
            const data = await store.load();
            const g = ensureGuildEntry(data, req.params.guildId);
            res.json({ sharingEnabled: g.sharingEnabled === true });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.put("/guilds/:guildId/sharing-settings", async (req, res) => {
        try {
            const { enabled } = req.body || {};
            const value = await store.withFile(async (data) => {
                const g = ensureGuildEntry(data, req.params.guildId);
                g.sharingEnabled = enabled === true;
                return g.sharingEnabled;
            });
            res.json({ sharingEnabled: value });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.delete("/guilds/:guildId/tickets/:ticketId/share", async (req, res) => {
        try {
            await store.withFile(async (data) => {
                const g = ensureGuildEntry(data, req.params.guildId);
                const ticket = g.tickets.find(t => String(t.id) === req.params.ticketId);
                if (ticket)
                    ticket.currentShareId = null;
                return null;
            });
            res.json({ ok: true });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.get("/admin/share-links/:shareId", async (req, res) => {
        try {
            const data = store.load();
            for (const guildId of Object.keys(data.guilds || {})) {
                const g = ensureGuildEntry(data, guildId);
                const record = g.shareLinks?.[req.params.shareId];
                if (!record)
                    continue;
                const ticket = g.tickets.find(t => t.id === record.ticketId);
                return res.json({
                    shareId: req.params.shareId,
                    isActive: ticket?.currentShareId === req.params.shareId,
                    createdAt: record.createdAt,
                    views: record.views || [],
                    guildId,
                    guildName: client.guilds.cache.get(guildId)?.name || "Unknown server",
                    ticket: ticket || null,
                });
            }
            res.status(404).json({ error: "No share link found with that id" });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.get("/share/tickets/:shareId", async (req, res) => {
        try {
            const data = store.load();
            let found = null;
            for (const guildId of Object.keys(data.guilds || {})) {
                const g = ensureGuildEntry(data, guildId);
                const record = g.shareLinks?.[req.params.shareId];
                if (!record)
                    continue;
                const ticket = g.tickets.find(t => t.id === record.ticketId);
                if (!ticket || ticket.currentShareId !== req.params.shareId)
                    continue;
                found = { guildId, ticket, guildName: client.guilds.cache.get(guildId)?.name || "Unknown server" };
                break;
            }
            if (!found)
                return res.status(404).json({ error: "This share link is invalid or has been regenerated." });
            await store.withFile(async (d2) => {
                const g2 = ensureGuildEntry(d2, found.guildId);
                const record = g2.shareLinks[req.params.shareId];
                if (record) {
                    record.views = record.views || [];
                    record.views.push({ viewedAt: new Date().toISOString(), ip: req.ip });
                    if (record.views.length > 500)
                        record.views = record.views.slice(-500);
                }
                return null;
            });
            res.json({ ticket: found.ticket, guildName: found.guildName, messages: found.ticket.messages || [] });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.get("/admin/tickets/search", async (req, res) => {
        try {
            const q = (req.query.q || "").toLowerCase().trim();
            const data = await store.load();
            const results = [];
            for (const guildId of Object.keys(data.guilds || {})) {
                const g = data.guilds[guildId];
                const guild = client.guilds.cache.get(guildId);
                for (const t of g.tickets || []) {
                    const haystack = `${t.number ?? t.id} ${t.subject || ""} ${t.openedBy || ""} ${t.claimedBy || ""} ${t.closedBy || ""}`.toLowerCase();
                    if (q && !haystack.includes(q))
                        continue;
                    results.push({ ...t, guildId, guildName: guild?.name || "Unknown server", guildIcon: guild?.icon || null });
                }
            }
            results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            res.json({ tickets: results.slice(0, 200) });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.put("/guilds/:guildId/settings/staff-only-claim", async (req, res) => {
        try {
            const { enabled } = req.body || {};
            const value = await store.withFile(async (data) => {
                const g = ensureGuildEntry(data, req.params.guildId);
                g.staffOnlyClaim = enabled !== false;
                return g.staffOnlyClaim;
            });
            res.json({ staffOnlyClaim: value });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.get("/guilds/:guildId/closing-dm", async (req, res) => {
        try {
            const data = await store.load();
            const g = ensureGuildEntry(data, req.params.guildId);
            res.json(g.closingDm);
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.post("/guilds/:guildId/closing-dm", async (req, res) => {
        try {
            const { enabled, embedColor, message } = req.body || {};
            const closingDm = await store.withFile(async (data) => {
                const g = ensureGuildEntry(data, req.params.guildId);
                if (enabled !== undefined)
                    g.closingDm.enabled = Boolean(enabled);
                if (embedColor !== undefined)
                    g.closingDm.embedColor = embedColor || "#8b5cf6";
                if (message !== undefined)
                    g.closingDm.message = message;
                return g.closingDm;
            });
            res.json(closingDm);
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.get("/guilds/:guildId/subjects", async (req, res) => {
        try {
            const data = await store.load();
            const g = ensureGuildEntry(data, req.params.guildId);
            res.json({ subjects: g.subjects });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    const SUBJECT_FIELDS = [
        "name", "description", "category", "active", "welcomeMessage", "closeMessage",
        "staffRoles", "icon", "priority", "ticketNameFormat",
        "defaultCategoryId", "autoMoveEnabled", "waitingCategoryId",
        "roleRestrictionMode", "restrictedRoles", "maxTicketsPerUser", "maxTicketsPerUserEnabled",
        "maxTotalTickets", "maxTotalTicketsEnabled", "creationCooldownEnabled", "creationCooldownValue",
        "creationCooldownUnit", "closeRestriction",
        "userPermissions", "staffPermissions", "claimerPermissions",
        "aiEnabled", "formsEnabled", "formQuestions",
        "autoCloseEnabled", "autoCloseHours",
        "storageRetentionDays",
        "logChannelId", "logTicketCreation", "logTicketClaims", "logTicketClosure", "logMemberChanges", "logRainbowColors",
    ];
    app.post("/guilds/:guildId/subjects", async (req, res) => {
        try {
            const body = req.body || {};
            const subject = await store.withFile(async (data) => {
                const g = ensureGuildEntry(data, req.params.guildId);
                const s = { id: String(g.nextSubjectId++) };
                for (const key of SUBJECT_FIELDS)
                    if (body[key] !== undefined)
                        s[key] = body[key];
                s.name = s.name || "New subject";
                s.description = s.description || "";
                s.category = s.category ?? null;
                s.active = s.active !== false;
                s.welcomeMessage = s.welcomeMessage || "{user.mention} welcome — **{subject.name}**. Describe your issue and support will be with you shortly.";
                s.closeMessage = s.closeMessage || "This ticket has been closed. Thanks for reaching out!";
                s.staffRoles = s.staffRoles || [];
                s.icon = s.icon || "";
                s.priority = PRIORITIES.includes(s.priority) ? s.priority : "normal";
                g.subjects.push(s);
                return s;
            });
            res.json(subject);
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.put("/guilds/:guildId/subjects/:subjectId", async (req, res) => {
        try {
            const body = req.body || {};
            const subject = await store.withFile(async (data) => {
                const g = ensureGuildEntry(data, req.params.guildId);
                const s = g.subjects.find(x => x.id === req.params.subjectId);
                if (!s)
                    throw new Error("Subject not found");
                for (const key of SUBJECT_FIELDS) {
                    if (body[key] === undefined)
                        continue;
                    if (key === "priority" && !PRIORITIES.includes(body.priority))
                        continue;
                    s[key] = body[key];
                }
                return s;
            });
            res.json(subject);
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.delete("/guilds/:guildId/subjects/:subjectId", async (req, res) => {
        try {
            await store.withFile(async (data) => {
                const g = ensureGuildEntry(data, req.params.guildId);
                g.subjects = g.subjects.filter(x => x.id !== req.params.subjectId);
                return null;
            });
            res.json({ ok: true });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.get("/guilds/:guildId/config", async (req, res) => {
        try {
            const data = await store.load();
            const g = ensureGuildEntry(data, req.params.guildId);
            res.json({ ...g.config, staffOnlyClaim: g.staffOnlyClaim !== false });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.post("/guilds/:guildId/config", async (req, res) => {
        try {
            const { ticketChannel, ticketCategory, supportRole, logChannel } = req.body;
            await store.withFile(async (data) => {
                const g = ensureGuildEntry(data, req.params.guildId);
                g.config = { ticketChannel, ticketCategory, supportRole, logChannel };
                return null;
            });
            res.json({ ok: true });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.get("/guilds/:guildId/panels", async (req, res) => {
        try {
            const data = await store.load();
            const g = ensureGuildEntry(data, req.params.guildId);
            res.json({ panels: g.panels });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.post("/guilds/:guildId/panels", async (req, res) => {
        try {
            const { title, description, plainText, embedEnabled, color, style, buttons } = req.body;
            const panel = await store.withFile(async (data) => {
                const g = ensureGuildEntry(data, req.params.guildId);
                const p = {
                    id: String(g.nextPanelId++),
                    title: title ?? DEFAULT_PANEL.title,
                    description: description ?? DEFAULT_PANEL.description,
                    plainText: plainText ?? DEFAULT_PANEL.plainText,
                    embedEnabled: embedEnabled ?? DEFAULT_PANEL.embedEnabled,
                    color: color ?? DEFAULT_PANEL.color,
                    style: style ?? DEFAULT_PANEL.style,
                    buttons: buttons ?? null,
                    channelId: null, messageId: null, postedAt: null,
                };
                g.panels.push(p);
                return p;
            });
            res.json(panel);
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.put("/guilds/:guildId/panels/:panelId", async (req, res) => {
        try {
            const { title, description, plainText, embedEnabled, color, style, buttons } = req.body;
            const panel = await store.withFile(async (data) => {
                const g = ensureGuildEntry(data, req.params.guildId);
                const p = g.panels.find(x => x.id === req.params.panelId);
                if (!p)
                    throw new Error("Panel not found");
                if (title !== undefined)
                    p.title = title;
                if (description !== undefined)
                    p.description = description;
                if (plainText !== undefined)
                    p.plainText = plainText;
                if (embedEnabled !== undefined)
                    p.embedEnabled = embedEnabled;
                if (color !== undefined)
                    p.color = color;
                if (style !== undefined)
                    p.style = style;
                if (buttons !== undefined)
                    p.buttons = buttons;
                return p;
            });
            res.json(panel);
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.delete("/guilds/:guildId/panels/:panelId", async (req, res) => {
        try {
            const guild = client.guilds.cache.get(req.params.guildId);
            await store.withFile(async (data) => {
                const g = ensureGuildEntry(data, req.params.guildId);
                const p = g.panels.find(x => x.id === req.params.panelId);
                if (p?.channelId && p?.messageId && guild) {
                    const channel = guild.channels.cache.get(p.channelId);
                    if (channel)
                        await channel.messages.delete(p.messageId).catch(() => { });
                }
                g.panels = g.panels.filter(x => x.id !== req.params.panelId);
                return null;
            });
            res.json({ ok: true });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.post("/guilds/:guildId/panels/:panelId/post", async (req, res) => {
        try {
            const guild = client.guilds.cache.get(req.params.guildId);
            if (!guild)
                return res.status(404).json({ error: "Bot is not in this server" });
            const { channelId } = req.body;
            const channel = guild.channels.cache.get(channelId);
            if (!channel)
                return res.status(404).json({ error: "Channel not found" });
            const data = await store.load();
            const g = ensureGuildEntry(data, req.params.guildId);
            const p = g.panels.find(x => x.id === req.params.panelId);
            if (!p)
                return res.status(404).json({ error: "Panel not found" });
            const buttons = resolvePanelButtons(p, g.subjects);
            if (buttons.length === 0)
                return res.status(400).json({ error: "No active subjects to show" });
            const { content, embeds, row } = buildPanelMessage(p, buttons);
            const sent = await channel.send({ content, embeds, components: [row] });
            await store.withFile(async (data2) => {
                const g2 = ensureGuildEntry(data2, req.params.guildId);
                const p2 = g2.panels.find(x => x.id === req.params.panelId);
                if (p2) {
                    p2.channelId = channelId;
                    p2.messageId = sent.id;
                    p2.postedAt = new Date().toISOString();
                }
                return null;
            });
            res.json({ ok: true });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.post("/guilds/:guildId/panels/:panelId/resend", async (req, res) => {
        try {
            const guild = client.guilds.cache.get(req.params.guildId);
            if (!guild)
                return res.status(404).json({ error: "Bot is not in this server" });
            const data = await store.load();
            const g = ensureGuildEntry(data, req.params.guildId);
            const p = g.panels.find(x => x.id === req.params.panelId);
            if (!p)
                return res.status(404).json({ error: "Panel not found" });
            if (!p.channelId)
                return res.status(400).json({ error: "This panel hasn't been posted anywhere yet" });
            const channel = guild.channels.cache.get(p.channelId);
            if (!channel)
                return res.status(404).json({ error: "The channel this panel was posted in no longer exists" });
            const buttons = resolvePanelButtons(p, g.subjects);
            if (buttons.length === 0)
                return res.status(400).json({ error: "No active subjects to show" });
            const { content, embeds, row } = buildPanelMessage(p, buttons);
            const sent = await channel.send({ content, embeds, components: [row] });
            const oldMessageId = p.messageId;
            await store.withFile(async (data2) => {
                const g2 = ensureGuildEntry(data2, req.params.guildId);
                const p2 = g2.panels.find(x => x.id === req.params.panelId);
                if (p2) {
                    p2.messageId = sent.id;
                    p2.postedAt = new Date().toISOString();
                }
                return null;
            });
            if (oldMessageId)
                await channel.messages.delete(oldMessageId).catch(() => { });
            res.json({ ok: true });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
};
