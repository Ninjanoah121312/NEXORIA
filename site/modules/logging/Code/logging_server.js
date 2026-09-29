// logging_server.js
module.exports = function registerLogging(kit, moduleId) {
    const { app, client, createModuleStore } = kit;
    const registerBotLogHandler = typeof kit.registerBotLogHandler === "function" ? kit.registerBotLogHandler : () => { };
    const { EmbedBuilder, Events } = require("discord.js");
    const store = createModuleStore(moduleId, { guilds: {} });
    const SETTINGS_DEFAULTS = {
        useWebhooks: false,
        ignoreEmbeds: false,
        applyIgnoreToVoice: false,
        logDeletedPollsWithMessageDelete: true,
        logDeletedStickyMessages: true,
        logDeletedForwardedMessages: true,
        logUnrecognizableMessageDeletions: false,
    };
    const TYPE_KEYS = [
        "botStartup", "botShutdown", "guildAdded", "guildRemoved", "downtime",
        "applicationCommandPermissionsUpdate",
        "boostAdded", "boostRemoved", "boostLevelUp", "boostLevelDown",
        "channelCreate", "channelDelete", "channelUpdate", "channelOverwriteCreate", "channelOverwriteDelete", "channelOverwriteUpdate",
        "automodRuleCreate", "automodRuleDelete", "automodRuleUpdate", "automodBlockedMessage",
        "emojiCreate", "emojiDelete", "emojiUpdate",
        "scheduledEventCreate", "scheduledEventDelete", "scheduledEventUpdate",
        "inviteCreate", "inviteDelete",
        "messageDelete", "messageDeleteBulk", "messageUpdate",
        "pollCreate", "pollDelete", "pollVoteAdd", "pollVoteRemove",
        "roleCreate", "roleDelete", "roleUpdate",
        "stageInstanceCreate", "stageInstanceDelete", "stageInstanceUpdate",
        "guildUpdate",
        "stickerCreate", "stickerDelete", "stickerUpdate",
        "soundboardSoundCreate", "soundboardSoundDelete", "soundboardSoundUpdate",
        "threadCreate", "threadDelete", "threadUpdate",
        "memberJoin", "memberLeave", "memberNicknameUpdate", "memberRolesUpdate", "memberTimeout", "userAvatarUpdate", "userUsernameUpdate",
        "voiceChannelJoin", "voiceChannelLeave", "voiceChannelMove", "voiceStateUpdate",
        "webhookCreate", "webhookDelete", "webhookUpdate",
        "memberBanAdd", "memberBanRemove", "memberKick", "memberWarn",
        "customCommandUsed",
    ];
    function ensureGuildEntry(data, guildId) {
        data.guilds = data.guilds || {};
        data.guilds[guildId] = data.guilds[guildId] || { types: {}, settings: {}, ignore: { channels: [], roles: [], users: [] }, history: [] };
        const g = data.guilds[guildId];
        g.types = g.types || {};
        TYPE_KEYS.forEach(key => { g.types[key] = g.types[key] || { channelId: null }; });
        g.settings = { ...SETTINGS_DEFAULTS, ...(g.settings || {}) };
        g.ignore = g.ignore || {};
        g.ignore.channels = g.ignore.channels || [];
        g.ignore.roles = g.ignore.roles || [];
        g.ignore.users = g.ignore.users || [];
        g.history = Array.isArray(g.history) ? g.history : [];
        return g;
    }
    const listenSessions = new Map();
    const LISTEN_TTL_MS = 5 * 60_000;
    function pruneListenSessions() {
        const now = Date.now();
        for (const [code, s] of listenSessions.entries())
            if (s.expiresAt < now)
                listenSessions.delete(code);
    }
    function createListenSession(guildId, userId) {
        pruneListenSessions();
        const code = require("crypto").randomBytes(4).toString("hex");
        listenSessions.set(code, { guildId, userId, expiresAt: Date.now() + LISTEN_TTL_MS, resolvedChannelId: null, resolvedChannelName: null });
        return code;
    }
    const COLORS = {
        red: 0xe94560,
        green: 0x6ee7b7,
        orange: 0xf5a623,
        violet: 0x8b5cf6,
        blue: 0x5b8def,
        pink: 0xf47fff,
        grey: 0x99aab5,
    };
    function ts(unixSeconds) { return `<t:${unixSeconds}:F> (<t:${unixSeconds}:R>)`; }
    function tsFromMs(ms) { return ts(Math.floor(ms / 1000)); }
    function idsBlock(rows) {
        return `**IDs**\n${rows.map(r => `> ${r}`).join("\n")}`;
    }
    function idRow(label, id) { return `${label} (\`${id}\`)`; }
    function channelIdRow(channel) { return channel ? `${channel} (\`${channel.id}\`)` : null; }
    function plainUserIdRow(userIdOrUser) {
        if (!userIdOrUser)
            return `@Unknown (\`unknown\`)`;
        if (typeof userIdOrUser === "string")
            return `@Unknown (\`${userIdOrUser}\`)`;
        const name = userIdOrUser.username || userIdOrUser.tag || "Unknown";
        return `@${name} (\`${userIdOrUser.id}\`)`;
    }
    function mentionIdRow(userId) { return `<@${userId}> (\`${userId}\`)`; }
    function plainUserName(userIdOrUser) {
        if (!userIdOrUser || typeof userIdOrUser === "string")
            return "Unknown";
        return userIdOrUser.username || userIdOrUser.tag || "Unknown";
    }
    function baseEmbed({ actingUser, color, title, description, thumbnailUrl }) {
        const embed = new EmbedBuilder().setColor(color ?? COLORS.violet);
        if (actingUser) {
            embed.setAuthor({ name: actingUser.username || actingUser.tag || "Unknown", iconURL: actingUser.displayAvatarURL ? actingUser.displayAvatarURL({ size: 64 }) : undefined });
        }
        if (title)
            embed.setTitle(title);
        if (description)
            embed.setDescription(description.slice(0, 4000));
        if (thumbnailUrl)
            embed.setThumbnail(thumbnailUrl);
        return embed;
    }
    function withBotFooter(embed) {
        if (client.user)
            embed.setFooter({ text: client.user.tag, iconURL: client.user.displayAvatarURL({ size: 32 }) });
        return embed.setTimestamp();
    }
    function withIdFooter(embed, id) {
        return embed.setFooter({ text: `ID: ${id}` }).setTimestamp();
    }
    async function sendLog(guildId, typeKey, embed, { sourceChannelId, authorUserId, roleIds } = {}) {
        try {
            const { data } = store.load();
            const g = data.guilds?.[guildId];
            const channelId = g?.types?.[typeKey]?.channelId;
            if (!channelId)
                return;
            const ignore = g.ignore || { channels: [], roles: [], users: [] };
            if (sourceChannelId && ignore.channels?.includes(sourceChannelId))
                return;
            if (authorUserId && ignore.users?.includes(authorUserId))
                return;
            if (roleIds && roleIds.some(rid => ignore.roles?.includes(rid)))
                return;
            const guild = client.guilds.cache.get(guildId);
            const channel = guild?.channels.cache.get(channelId);
            if (!channel)
                return;
            await store.withFile(async (data2) => {
                const g2 = ensureGuildEntry(data2, guildId);
                g2.history.unshift({ id: crypto.randomBytes(6).toString("hex"), typeKey, channelId, createdAt: new Date().toISOString(), sourceChannelId: sourceChannelId || null, authorUserId: authorUserId || null, embed: embed?.toJSON ? embed.toJSON() : null });
                if (g2.history.length > 5000)
                    g2.history.length = 5000;
            }).catch(() => { });
            if (g.settings?.useWebhooks === true) {
                try {
                    const hooks = await channel.fetchWebhooks();
                    let hook = hooks.find(h => h.owner?.id === client.user.id);
                    if (!hook)
                        hook = await channel.createWebhook({ name: "Logging" });
                    await hook.send({ embeds: [embed], username: client.user.username, avatarURL: client.user.displayAvatarURL({ size: 64 }) });
                    return;
                }
                catch { }
            }
            await channel.send({ embeds: [embed] }).catch(() => { });
        }
        catch (e) {
            console.warn(`[logging] Failed to send log for ${typeKey} in guild ${guildId}:`, e.message);
        }
    }
    registerBotLogHandler(async (guildId, typeKey, payload = {}) => {
        const titleMap = { botStartup: "Bot Started", botShutdown: "Bot Shutdown", guildAdded: "Bot Added to Server", guildRemoved: "Bot Removed from Server", downtime: "Bot Downtime" };
        const desc = typeKey === "downtime" ? `NEXORIA detected downtime${payload.durationLabel ? ` lasting ${payload.durationLabel}` : ""}.` : typeKey === "guildAdded" ? `NEXORIA was added to **${payload.guildName || "this server"}**.` : typeKey === "guildRemoved" ? `NEXORIA was removed from **${payload.guildName || "this server"}**.` : typeKey === "botShutdown" ? `NEXORIA is shutting down (${payload.signal || "manual"}).` : `NEXORIA is online and ready.`;
        const embed = baseEmbed({ color: typeKey === "botShutdown" ? COLORS.orange : COLORS.green, title: titleMap[typeKey] || "Bot Event", description });
        withBotFooter(embed);
        await sendLog(guildId, typeKey, embed);
    });
    client.on("nexoriaCustomCommandUsed", (payload) => {
        const embed = baseEmbed({ color: COLORS.violet, title: "Custom Command Used", description: `**${payload.userName || "Unknown user"}** used **/${payload.commandName || payload.trigger || "custom command"}**.` });
        embed.addFields({ name: "IDs", value: idsBlock([`User (\`${payload.userId}\`)`, `Channel (\`${payload.channelId}\`)`]) });
        withBotFooter(embed);
        sendLog(payload.guildId, "customCommandUsed", embed, { authorUserId: payload.userId, sourceChannelId: payload.channelId });
    });
    client.on(Events.MessageCreate, (message) => {
        if (message.author?.bot || !message.guild || !client.user)
            return;
        const mention = `<@${client.user.id}>`;
        if (!message.content?.startsWith(mention))
            return;
        const code = message.content.slice(mention.length).trim().split(/\s+/)[0];
        const session = listenSessions.get(code);
        if (!session || session.expiresAt < Date.now() || session.guildId !== message.guild.id)
            return;
        session.resolvedChannelId = message.channel.id;
        session.resolvedChannelName = message.channel.name;
        message.react("✅").catch(() => { });
    });
    client.on(Events.GuildMemberAdd, (member) => {
        const embed = baseEmbed({
            actingUser: member.user,
            color: COLORS.green,
            title: "Member Join",
            description: `<@${member.id}> joined the server.`,
            thumbnailUrl: member.user.displayAvatarURL({ size: 128 }),
        });
        embed.addFields({ name: "Account creation", value: tsFromMs(member.user.createdTimestamp) }, { name: "\u200b", value: idsBlock([mentionIdRow(member.id)]) });
        withBotFooter(embed);
        sendLog(member.guild.id, "memberJoin", embed, { authorUserId: member.id });
    });
    client.on(Events.GuildMemberRemove, (member) => {
        const embed = baseEmbed({
            actingUser: member.user,
            color: COLORS.red,
            title: "Member Leave",
            description: `@${plainUserName(member.user)} left the server.`,
            thumbnailUrl: member.user?.displayAvatarURL ? member.user.displayAvatarURL({ size: 128 }) : undefined,
        });
        embed.addFields({ name: "\u200b", value: idsBlock([plainUserIdRow(member.user)]) });
        withBotFooter(embed);
        sendLog(member.guild.id, "memberLeave", embed, { authorUserId: member.id, roleIds: [...(member.roles?.cache?.keys?.() || [])] });
    });
    client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
        if (oldMember.nickname !== newMember.nickname) {
            const oldLabel = oldMember.nickname || oldMember.user.username;
            const newLabel = newMember.nickname || newMember.user.username;
            const embed = baseEmbed({
                actingUser: newMember.user,
                color: COLORS.blue,
                title: "🔀 Nickname Change",
                description: `<@${newMember.id}> has changed ${newMember.user.bot ? "its" : "their"} nickname.`,
                thumbnailUrl: newMember.user.displayAvatarURL({ size: 128 }),
            });
            embed.addFields({ name: "\u200b", value: `${oldLabel} ➡️ ${newLabel}` });
            withIdFooter(embed, newMember.id);
            sendLog(newMember.guild.id, "memberNicknameUpdate", embed, { authorUserId: newMember.id });
        }
        const wasBooster = Boolean(oldMember.premiumSince);
        const isBooster = Boolean(newMember.premiumSince);
        if (wasBooster !== isBooster) {
            const embed = baseEmbed({
                actingUser: newMember.user,
                color: COLORS.pink,
                title: isBooster ? "💗 Server Boost Added" : "💔 Server Boost Removed",
                description: `<@${newMember.id}> ${isBooster ? "boosted the server!" : "is no longer boosting the server."}`,
                thumbnailUrl: newMember.user.displayAvatarURL({ size: 128 }),
            });
            embed.addFields({ name: "\u200b", value: idsBlock([mentionIdRow(newMember.id)]) });
            withBotFooter(embed);
            sendLog(newMember.guild.id, isBooster ? "boostAdded" : "boostRemoved", embed, { authorUserId: newMember.id });
        }
    });
    client.on(Events.GuildUpdate, (oldGuild, newGuild) => {
        if (oldGuild.premiumTier !== newGuild.premiumTier) {
            const leveledUp = newGuild.premiumTier > oldGuild.premiumTier;
            const embed = baseEmbed({
                color: COLORS.pink,
                title: leveledUp ? "💗 Boost Level Up" : "💔 Boost Level Down",
                description: `Server boost level changed: **${oldGuild.premiumTier}** ➡️ **${newGuild.premiumTier}** (${newGuild.premiumSubscriptionCount} boosts)`,
            });
            withBotFooter(embed);
            sendLog(newGuild.id, leveledUp ? "boostLevelUp" : "boostLevelDown", embed, {});
        }
        if (oldGuild.name !== newGuild.name || oldGuild.icon !== newGuild.icon) {
            const embed = baseEmbed({ color: COLORS.violet, title: "🛠️ Server Update", description: "Server settings were updated." });
            withBotFooter(embed);
            sendLog(newGuild.id, "guildUpdate", embed, {});
        }
    });
    client.on(Events.GuildRoleCreate, (role) => {
        const embed = baseEmbed({ color: role.color || COLORS.green, title: "Role Create", description: `**${role.name}** (${role}) was created.` });
        embed.addFields({ name: "\u200b", value: idsBlock([idRow(role.name, role.id)]) });
        withBotFooter(embed);
        sendLog(role.guild.id, "roleCreate", embed, {});
    });
    client.on(Events.GuildRoleDelete, (role) => {
        const embed = baseEmbed({ color: COLORS.red, title: "Role Delete", description: `**${role.name}** was deleted.` });
        embed.addFields({ name: "\u200b", value: idsBlock([idRow(role.name, role.id)]) });
        withBotFooter(embed);
        sendLog(role.guild.id, "roleDelete", embed, {});
    });
    client.on(Events.GuildRoleUpdate, (oldRole, newRole) => {
        if (oldRole.name === newRole.name && oldRole.hexColor === newRole.hexColor && oldRole.permissions.bitfield === newRole.permissions.bitfield)
            return;
        const embed = baseEmbed({ color: newRole.color || COLORS.violet, title: "Role Edited", description: `${newRole}` });
        if (newRole.icon)
            embed.setThumbnail(newRole.iconURL({ size: 64 }));
        if (oldRole.hexColor !== newRole.hexColor)
            embed.addFields({ name: "Role Color", value: `${oldRole.hexColor} ➡️ ${newRole.hexColor}` });
        withIdFooter(embed, newRole.id);
        sendLog(newRole.guild.id, "roleUpdate", embed, {});
    });
    client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
        const oldRoles = oldMember.roles?.cache;
        const newRoles = newMember.roles?.cache;
        if (!oldRoles || !newRoles)
            return;
        const added = newRoles.filter(r => !oldRoles.has(r.id));
        const removed = oldRoles.filter(r => !newRoles.has(r.id));
        if (added.size > 0) {
            const embed = baseEmbed({ actingUser: newMember.user, color: COLORS.violet, description: `<@${newMember.id}> was given the **${added.map(r => r.name).join(", ")}** role.` });
            withIdFooter(embed, newMember.id);
            sendLog(newMember.guild.id, "memberRolesUpdate", embed, { authorUserId: newMember.id, roleIds: [...added.keys()] });
        }
        if (removed.size > 0) {
            const embed = baseEmbed({ actingUser: newMember.user, color: COLORS.red, description: `<@${newMember.id}> had the **${removed.map(r => r.name).join(", ")}** role removed.` });
            withIdFooter(embed, newMember.id);
            sendLog(newMember.guild.id, "memberRolesUpdate", embed, { authorUserId: newMember.id, roleIds: [...removed.keys()] });
        }
    });
    client.on(Events.MessageDelete, (message) => {
        if (!message.guild)
            return;
        const embed = baseEmbed({
            actingUser: message.author && !message.author.bot ? message.author : null,
            color: COLORS.red,
            title: "🗑️ Message Deleted",
            description: message.content ? message.content.slice(0, 3800) : "*Unable to retrieve message content.*",
        });
        embed.addFields({ name: "Message Date", value: message.createdTimestamp ? tsFromMs(message.createdTimestamp) : tsFromMs(Date.now()) }, { name: "\u200b", value: idsBlock([idRow("Message", message.id), channelIdRow(message.channel), plainUserIdRow(message.author)].filter(Boolean)) });
        withBotFooter(embed);
        sendLog(message.guild.id, "messageDelete", embed, { sourceChannelId: message.channel?.id, authorUserId: message.author?.id });
    });
    client.on(Events.MessageDeleteBulk, (messages) => {
        const first = messages.first();
        if (!first?.guild)
            return;
        const embed = baseEmbed({ color: COLORS.red, title: "🗑️ Message Bulk Delete", description: `${messages.size} messages were bulk-deleted in ${first.channel}.` });
        embed.addFields({ name: "\u200b", value: idsBlock([channelIdRow(first.channel)].filter(Boolean)) });
        withBotFooter(embed);
        sendLog(first.guild.id, "messageDeleteBulk", embed, { sourceChannelId: first.channel?.id });
    });
    client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
        if (!newMessage.guild || newMessage.author?.bot)
            return;
        if (oldMessage.content === newMessage.content)
            return;
        const embed = baseEmbed({
            actingUser: newMessage.author,
            color: COLORS.orange,
            title: "Message Edited",
            description: `${newMessage.channel}`,
        });
        embed.addFields({ name: "Old message", value: (oldMessage.content || "—").slice(0, 1000) }, { name: "New message", value: (newMessage.content || "—").slice(0, 1000) }, { name: "Message Date", value: tsFromMs(newMessage.editedTimestamp || Date.now()) }, { name: "\u200b", value: idsBlock([idRow("Message", newMessage.id), channelIdRow(newMessage.channel), plainUserIdRow(newMessage.author)].filter(Boolean)) });
        withBotFooter(embed);
        sendLog(newMessage.guild.id, "messageUpdate", embed, { sourceChannelId: newMessage.channel?.id, authorUserId: newMessage.author?.id });
    });
    client.on(Events.VoiceStateUpdate, (oldState, newState) => {
        const guildId = newState.guild.id;
        const member = newState.member;
        const userRow = plainUserIdRow(member?.user || member?.id);
        if (!oldState.channelId && newState.channelId) {
            const embed = baseEmbed({ actingUser: member?.user, color: COLORS.green, title: "Voice Channel Join", description: `@${plainUserName(member?.user)} joined voice channel ${newState.channel}.` });
            embed.addFields({ name: "\u200b", value: idsBlock([userRow, channelIdRow(newState.channel)].filter(Boolean)) });
            withBotFooter(embed);
            sendLog(guildId, "voiceChannelJoin", embed, { sourceChannelId: newState.channelId, authorUserId: member?.id });
        }
        else if (oldState.channelId && !newState.channelId) {
            const embed = baseEmbed({ actingUser: member?.user, color: COLORS.red, title: "Voice Channel Leave", description: `@${plainUserName(member?.user)} left voice channel ${oldState.channel}.` });
            embed.addFields({ name: "\u200b", value: idsBlock([userRow, channelIdRow(oldState.channel)].filter(Boolean)) });
            withBotFooter(embed);
            sendLog(guildId, "voiceChannelLeave", embed, { sourceChannelId: oldState.channelId, authorUserId: member?.id });
        }
        else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            const embed = baseEmbed({ actingUser: member?.user, color: COLORS.orange, title: "🔀 Voice Channel Move", description: `${oldState.channel} ➡️ ${newState.channel}` });
            embed.addFields({ name: "\u200b", value: idsBlock([userRow].filter(Boolean)) });
            withBotFooter(embed);
            sendLog(guildId, "voiceChannelMove", embed, { sourceChannelId: newState.channelId, authorUserId: member?.id });
        }
        else if (oldState.mute !== newState.mute || oldState.deaf !== newState.deaf) {
            const embed = baseEmbed({ actingUser: member?.user, color: COLORS.violet, title: "🎙️ Voice State Update", description: `${member ? `${member}` : "A user"}'s voice state changed in ${newState.channel}.` });
            embed.addFields({ name: "\u200b", value: idsBlock([userRow, channelIdRow(newState.channel)].filter(Boolean)) });
            withBotFooter(embed);
            sendLog(guildId, "voiceStateUpdate", embed, { sourceChannelId: newState.channelId, authorUserId: member?.id });
        }
    });
    client.on(Events.ChannelCreate, (channel) => {
        if (!channel.guild)
            return;
        const embed = baseEmbed({ color: COLORS.green, title: "# Channel Create", description: `${channel} was created.` });
        embed.addFields({ name: "\u200b", value: idsBlock([channelIdRow(channel)].filter(Boolean)) });
        withBotFooter(embed);
        sendLog(channel.guild.id, "channelCreate", embed, {});
    });
    client.on(Events.ChannelDelete, (channel) => {
        if (!channel.guild)
            return;
        const embed = baseEmbed({ color: COLORS.red, title: "# Channel Delete", description: `**#${channel.name}** was deleted.` });
        embed.addFields({ name: "\u200b", value: idsBlock([idRow(`#${channel.name}`, channel.id)]) });
        withBotFooter(embed);
        sendLog(channel.guild.id, "channelDelete", embed, {});
    });
    client.on(Events.ChannelUpdate, (oldChannel, newChannel) => {
        if (!newChannel.guild)
            return;
        if (oldChannel.name === newChannel.name && oldChannel.parentId === newChannel.parentId)
            return;
        const embed = baseEmbed({ color: COLORS.orange, title: "# Channel Update", description: `${newChannel} was updated.` });
        embed.addFields({ name: "\u200b", value: idsBlock([channelIdRow(newChannel)].filter(Boolean)) });
        withBotFooter(embed);
        sendLog(newChannel.guild.id, "channelUpdate", embed, { sourceChannelId: newChannel.id });
    });
    client.on(Events.ThreadCreate, (thread) => {
        if (!thread.guild)
            return;
        const embed = baseEmbed({ color: COLORS.green, title: "🧵 Thread Create", description: `${thread} was created.` });
        withBotFooter(embed);
        sendLog(thread.guild.id, "threadCreate", embed, {});
    });
    client.on(Events.ThreadDelete, (thread) => {
        if (!thread.guild)
            return;
        const embed = baseEmbed({ color: COLORS.red, title: "🧵 Thread Delete", description: `**${thread.name}** was deleted.` });
        withBotFooter(embed);
        sendLog(thread.guild.id, "threadDelete", embed, {});
    });
    client.on(Events.GuildEmojiCreate, (emoji) => {
        const embed = baseEmbed({ color: COLORS.green, title: "Emoji Create", description: `${emoji} \`:${emoji.name}:\` was added.`, thumbnailUrl: emoji.imageURL?.({ size: 64 }) });
        withBotFooter(embed);
        sendLog(emoji.guild.id, "emojiCreate", embed, {});
    });
    client.on(Events.GuildEmojiDelete, (emoji) => {
        const embed = baseEmbed({ color: COLORS.red, title: "Emoji Delete", description: `\`:${emoji.name}:\` was deleted.` });
        withBotFooter(embed);
        sendLog(emoji.guild.id, "emojiDelete", embed, {});
    });
    client.on(Events.InviteCreate, (invite) => {
        if (!invite.guild)
            return;
        const embed = baseEmbed({ actingUser: invite.inviter, color: COLORS.green, title: "Invite Create", description: `Invite \`${invite.code}\` created for ${invite.channel}.` });
        withBotFooter(embed);
        sendLog(invite.guild.id, "inviteCreate", embed, { sourceChannelId: invite.channel?.id, authorUserId: invite.inviter?.id });
    });
    client.on(Events.InviteDelete, (invite) => {
        if (!invite.guild)
            return;
        const embed = baseEmbed({ color: COLORS.red, title: "Invite Delete", description: `Invite \`${invite.code}\` was deleted or expired.` });
        withBotFooter(embed);
        sendLog(invite.guild.id, "inviteDelete", embed, { sourceChannelId: invite.channel?.id });
    });
    client.on(Events.WebhooksUpdate, (channel) => {
        const embed = baseEmbed({ color: COLORS.violet, title: "Webhook Update", description: `A webhook changed in ${channel}.` });
        withBotFooter(embed);
        sendLog(channel.guild.id, "webhookUpdate", embed, { sourceChannelId: channel.id });
    });
    client.on(Events.GuildBanAdd, (ban) => {
        const embed = baseEmbed({ color: COLORS.red, title: "Member Ban", description: `${ban.user.tag} was banned.${ban.reason ? `\nReason: ${ban.reason}` : ""}` });
        embed.addFields({ name: "\u200b", value: idsBlock([idRow(ban.user.tag, ban.user.id)]) });
        withBotFooter(embed);
        sendLog(ban.guild.id, "memberBanAdd", embed, { authorUserId: ban.user.id });
    });
    client.on(Events.GuildBanRemove, (ban) => {
        const embed = baseEmbed({ color: COLORS.green, title: "Member Unban", description: `${ban.user.tag} was unbanned.` });
        embed.addFields({ name: "\u200b", value: idsBlock([idRow(ban.user.tag, ban.user.id)]) });
        withBotFooter(embed);
        sendLog(ban.guild.id, "memberBanRemove", embed, { authorUserId: ban.user.id });
    });
    app.get("/guilds/:guildId/logging", async (req, res) => {
        try {
            const { data } = store.load();
            const g = ensureGuildEntry(data, req.params.guildId);
            res.json({ types: g.types, settings: g.settings, ignore: g.ignore, history: g.history || [], botUserId: client.user?.id || null });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.put("/guilds/:guildId/logging/types-bulk", async (req, res) => {
        try {
            const { typeKeys, channelId } = req.body || {};
            if (!Array.isArray(typeKeys) || typeKeys.length === 0)
                return res.status(400).json({ error: "typeKeys must be a non-empty array" });
            const types = await store.withFile(async (data) => {
                const g = ensureGuildEntry(data, req.params.guildId);
                typeKeys.forEach(key => {
                    if (!TYPE_KEYS.includes(key))
                        return;
                    g.types[key] = { channelId: channelId || null };
                });
                return g.types;
            });
            res.json({ types });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.put("/guilds/:guildId/logging/settings", async (req, res) => {
        try {
            const body = req.body || {};
            const settings = await store.withFile(async (data) => {
                const g = ensureGuildEntry(data, req.params.guildId);
                Object.keys(SETTINGS_DEFAULTS).forEach(key => { if (body[key] !== undefined)
                    g.settings[key] = Boolean(body[key]); });
                return g.settings;
            });
            res.json({ settings });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.put("/guilds/:guildId/logging/ignore", async (req, res) => {
        try {
            const body = req.body || {};
            const ignore = await store.withFile(async (data) => {
                const g = ensureGuildEntry(data, req.params.guildId);
                if (Array.isArray(body.channels))
                    g.ignore.channels = body.channels;
                if (Array.isArray(body.roles))
                    g.ignore.roles = body.roles;
                if (Array.isArray(body.users))
                    g.ignore.users = body.users;
                return g.ignore;
            });
            res.json({ ignore });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.put("/guilds/:guildId/logging/category", async (req, res) => { try {
        const { typeKeys, channelId } = req.body || {};
        if (!Array.isArray(typeKeys) || !typeKeys.length)
            return res.status(400).json({ error: "typeKeys required" });
        const types = await store.withFile(async (data) => { const g = ensureGuildEntry(data, req.params.guildId); typeKeys.forEach(k => { if (TYPE_KEYS.includes(k))
            g.types[k] = { channelId: channelId || null }; }); return g.types; });
        res.json({ types });
    }
    catch (e) {
        res.status(400).json({ error: e.message });
    } });
    app.post("/guilds/:guildId/logging/test", async (req, res) => { try {
        const { typeKey, message, all } = req.body || {};
        const guild = client.guilds.cache.get(req.params.guildId);
        if (!guild)
            return res.status(404).json({ error: "Bot is not in this server" });
        const { EmbedBuilder } = require("discord.js");
        const embed = new EmbedBuilder().setColor(0x8b5cf6).setTitle("Logging Test").setDescription(String(message || "This is a test logging message.").slice(0, 4000)).setTimestamp();
        const keys = all ? TYPE_KEYS : [typeKey];
        let sent = 0;
        for (const key of keys) {
            if (!TYPE_KEYS.includes(key))
                continue;
            const data = store.load();
            const g = ensureGuildEntry(data, req.params.guildId);
            const channelId = g.types[key]?.channelId;
            const ch = guild.channels.cache.get(channelId);
            if (ch) {
                await ch.send({ embeds: [embed] }).then(() => sent++).catch(() => { });
            }
        }
        res.json({ ok: true, sent });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    } });
    app.get("/guilds/:guildId/logging/history", (req, res) => { try {
        const g = ensureGuildEntry(store.load(), req.params.guildId);
        const q = String(req.query.q || "").toLowerCase();
        const rows = (g.history || []).filter(x => !q || JSON.stringify(x).toLowerCase().includes(q)).slice(0, Number(req.query.limit) || 500);
        res.json({ history: rows });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    } });
    app.post("/guilds/:guildId/logging/listen-start", async (req, res) => {
        try {
            if (!client.user)
                return res.status(503).json({ error: "Bot isn't ready yet" });
            const code = createListenSession(req.params.guildId, req.body?.userId || null);
            res.json({ code, botUserId: client.user.id });
        }
        catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
    app.get("/guilds/:guildId/logging/listen-status/:code", (req, res) => {
        const session = listenSessions.get(req.params.code);
        if (!session || session.guildId !== req.params.guildId)
            return res.status(404).json({ error: "Unknown or expired code" });
        res.json({ resolvedChannelId: session.resolvedChannelId, resolvedChannelName: session.resolvedChannelName });
    });
};
