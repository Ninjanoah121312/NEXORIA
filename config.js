// ============================================================
// PUBLIC CONFIG — safe to publish on GitHub Pages.
// Never put your bot token, client SECRET, or GitHub token here.
// Only the client ID (public by design) and public URLs belong here.
// ============================================================

window.TICKET_KEEPER_CONFIG = {
  // Your Discord application's Client ID (found on the Discord Developer
  // Portal -> your app -> OAuth2 -> General). This is PUBLIC, not secret.
  DISCORD_CLIENT_ID: "1545012669113827488",

  // Must exactly match a redirect URL you added in the Discord Developer
  // Portal -> OAuth2 -> Redirects. When hosted on GitHub Pages this will
  // look like: https://<your-username>.github.io/<repo-name>/
  REDIRECT_URI: "https://ninjanoah121312.github.io/NEXORIA/",

  // Scopes requested during login.
  OAUTH_SCOPES: ["identify", "guilds"],

  // Where your locally hosted bot's bridge server is listening.
  // bot.js runs this — see bot/bot.js. Only reachable while your PC
  // and the bot are running; the site handles that being offline.
  LOCAL_BOT_URL: "https://define-plots-workforce-iowa.trycloudflare.com",

  // GitHub Pages project sites are served from a subpath, e.g.
  // /NEXORA/. The router needs this to build correct URLs
  // like /NEXORA/dashboard. Must match your repo name with
  // leading and trailing slash. Leave as "/" only if using a custom
  // domain or a user/organization root site (username.github.io).
  BASE_PATH: "/NEXORIA/",

  // Invite link scope/permissions used by the "Invite to server" button.
  // Adjust the `permissions` integer to match exactly what your bot
  // needs (Manage Channels, Manage Roles, etc).
  BOT_PERMISSIONS: "268435472"

  // Your NEXORIA Discord support/community server invite link. This is
  // the ONE place this ever needs to be changed — every button, the
  // Terms of Service page, and the Privacy Policy page all read it from
  // here at load time rather than having it typed out in several
  // places, since invite links can expire/rotate. bot.js also reads
  // this exact value straight out of this file at startup (see
  // loadDiscordSupportUrl() near the top of bot.js) so Discord-side
  // messages (server-added/removed announcements, /help) link to the
  // same server without it being duplicated into config.env too.
  DISCORD_SUPPORT_URL: "https://discord.gg/QJSvzR9VHC"
};
