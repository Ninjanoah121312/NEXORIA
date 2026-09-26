// ============================================================
// NEXORIA — frontend app logic
// Static site (GitHub Pages) talking to:
//   1) Discord's OAuth + REST API directly (PKCE, no secret needed here)
//   2) Your own hosted bot (bot/bot.js) over CFG.LOCAL_BOT_URL
//
// URL shape (extended router):
//   /                                        landing
//   /dashboard | /my-tickets | /premium      picker screens
//   /status                                  status page
//   /servers/:guildId/:moduleId              a module's default tab
//   /servers/:guildId/:moduleId/:tab         a module's named sub-tab
//   /servers/:guildId/:moduleId/ticket/:id   a ticket detail page
//   /share/:shareId                          public read-only ticket view
// ============================================================

const CFG = window.TICKET_KEEPER_CONFIG;
const LS = {
  verifier: "tk_pkce_verifier",
  token: "tk_access_token",
  tokenExpiry: "tk_token_expiry",
  user: "tk_user",
  theme: "tk_theme",
};
const ADMINISTRATOR = 0x8;

// ============================================================
// Custom icon library — small, hand-built colored SVGs used
// EVERYWHERE an icon appears in this app, replacing the generic
// monochrome Tabler icon font entirely: primary navigation, module
// tabs, the theme picker, sidebar rows, and common inline action
// icons (edit/delete/refresh/search/copy/etc). Nothing in the app
// should fall back to Tabler — every icon here is custom-drawn.
//   Each is a flat 20x20 viewBox, two-tone (a filled shape plus one
// accent), no gradients/shadows so they stay crisp at small sizes and
// match the app's existing flat design language. icon(name, sizePx)
// returns the ready-to-place <span> wrapper; an unrecognized name
// falls back to a plain generic dot rather than rendering nothing, so
// a typo'd name never silently breaks a whole line of UI.
// ============================================================
const ICON_PATHS = {
  // --- primary navigation / destinations ---
  dashboard: `<rect x="2.5" y="2.5" width="7" height="7" rx="1.6" fill="#8b5cf6"/><rect x="10.5" y="2.5" width="7" height="4.5" rx="1.4" fill="#f472b6"/><rect x="10.5" y="8" width="7" height="9.5" rx="1.6" fill="#22d3ee"/><rect x="2.5" y="10.5" width="7" height="7" rx="1.6" fill="#22d3ee" opacity=".55"/>`,
  tickets: `<path d="M2.5 6.8c0-1 .8-1.8 1.8-1.8h11.4c1 0 1.8.8 1.8 1.8v1.4a1.7 1.7 0 0 0 0 3.6v1.4c0 1-.8 1.8-1.8 1.8H4.3c-1 0-1.8-.8-1.8-1.8v-1.4a1.7 1.7 0 0 0 0-3.6z" fill="#8b5cf6"/><path d="M8.3 5v10" stroke="#0a0b14" stroke-width="1.3" stroke-dasharray="1.6 1.6" opacity=".55"/>`,
  servers: `<rect x="2.5" y="3" width="15" height="5.2" rx="1.5" fill="#22d3ee"/><rect x="2.5" y="11.8" width="15" height="5.2" rx="1.5" fill="#8b5cf6"/><circle cx="5.3" cy="5.6" r="1" fill="#0a0b14" opacity=".6"/><circle cx="5.3" cy="14.4" r="1" fill="#0a0b14" opacity=".6"/>`,
  premium: `<path d="M3 7.5 6.4 10l3-4.4L12.6 10 16 7.5 14.8 15H5.2z" fill="#fbbf24"/><circle cx="3" cy="6.3" r="1.3" fill="#fbbf24"/><circle cx="10" cy="4.6" r="1.3" fill="#fbbf24"/><circle cx="17" cy="6.3" r="1.3" fill="#fbbf24"/>`,
  status: `<path d="M2.5 11h3l1.8-5.5L10 15l2-6.5 1.4 2.5h4.1" fill="none" stroke="#6ee7b7" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  "ticket-tool": `<path d="M2.5 6.8c0-1 .8-1.8 1.8-1.8h11.4c1 0 1.8.8 1.8 1.8v1.4a1.7 1.7 0 0 0 0 3.6v1.4c0 1-.8 1.8-1.8 1.8H4.3c-1 0-1.8-.8-1.8-1.8v-1.4a1.7 1.7 0 0 0 0-3.6z" fill="#8b5cf6"/><path d="M8.3 5v10" stroke="#0a0b14" stroke-width="1.3" stroke-dasharray="1.6 1.6" opacity=".55"/>`,
  "custom-commands": `<rect x="2.5" y="3.5" width="15" height="13" rx="2" fill="#14162a" stroke="#22d3ee" stroke-width="1.3"/><path d="M5.5 8l2.3 2.2-2.3 2.2" fill="none" stroke="#22d3ee" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 12.4h4.2" stroke="#22d3ee" stroke-width="1.5" stroke-linecap="round"/>`,
  logging: `<rect x="4" y="2.5" width="12" height="15" rx="1.6" fill="#f472b6"/><rect x="6.2" y="5.3" width="7.6" height="1.4" rx=".7" fill="#0a0b14" opacity=".55"/><rect x="6.2" y="8.3" width="7.6" height="1.4" rx=".7" fill="#0a0b14" opacity=".55"/><rect x="6.2" y="11.3" width="4.6" height="1.4" rx=".7" fill="#0a0b14" opacity=".55"/>`,
  admin: `<path d="M10 2.5 16 5v4.5c0 4-2.6 6.7-6 7.8-3.4-1.1-6-3.8-6-7.8V5z" fill="#f472b6"/><path d="M7.3 9.8l1.8 1.8 3.6-3.9" fill="none" stroke="#0a0b14" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,

  // --- theme picker ---
  "theme-light": `<circle cx="10" cy="10" r="3.6" fill="#fbbf24"/><g stroke="#fbbf24" stroke-width="1.4" stroke-linecap="round"><path d="M10 2.5v2.2"/><path d="M10 15.3v2.2"/><path d="M17.5 10h-2.2"/><path d="M4.7 10H2.5"/><path d="M15.3 4.7l-1.5 1.5"/><path d="M6.2 13.8l-1.5 1.5"/><path d="M15.3 15.3l-1.5-1.5"/><path d="M6.2 6.2l-1.5-1.5"/></g>`,
  "theme-dark": `<path d="M16.8 12.4A7 7 0 0 1 7.6 3.2 7 7 0 1 0 16.8 12.4z" fill="#8b5cf6"/>`,
  "theme-system": `<rect x="2.5" y="3.5" width="15" height="10" rx="1.6" fill="#22d3ee"/><rect x="4" y="5" width="12" height="7" rx=".6" fill="#0a0b14"/><rect x="7" y="15.5" width="6" height="1.4" rx=".7" fill="#22d3ee"/>`,

  // --- sidebar footer / profile / misc ---
  "user-profile": `<circle cx="10" cy="7" r="3.4" fill="#8b5cf6"/><path d="M3.3 17c.6-3.4 3.2-5.4 6.7-5.4s6.1 2 6.7 5.4z" fill="#8b5cf6" opacity=".7"/>`,
  logout: `<path d="M8 2.8H4.6c-1 0-1.8.8-1.8 1.8v10.8c0 1 .8 1.8 1.8 1.8H8" fill="none" stroke="#e94560" stroke-width="1.6" stroke-linecap="round"/><path d="M12.3 6.5 16 10l-3.7 3.5" fill="none" stroke="#e94560" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 10H7.5" stroke="#e94560" stroke-width="1.6" stroke-linecap="round"/>`,

  // --- common inline actions (used throughout tables/panels/modals) ---
  edit: `<path d="M12.9 3.3a1.6 1.6 0 0 1 2.3 0l1.5 1.5a1.6 1.6 0 0 1 0 2.3L7 16.8l-4 1 1-4z" fill="#fbbf24"/><path d="M11.3 4.9l3.8 3.8" stroke="#0a0b14" stroke-width="1.1" opacity=".4"/>`,
  trash: `<path d="M4 6.5h12" stroke="#e94560" stroke-width="1.6" stroke-linecap="round"/><path d="M7.3 6.5V4.8c0-.6.5-1 1-1h3.4c.6 0 1 .4 1 1v1.7" fill="none" stroke="#e94560" stroke-width="1.6"/><path d="M5.6 6.5 6.3 16c.1.7.6 1.2 1.3 1.2h4.8c.7 0 1.2-.5 1.3-1.2l.7-9.5z" fill="#e94560" opacity=".7"/>`,
  document: `<path d="M6 2.8h5.4L15 6.4V17a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.8a1 1 0 0 1 1-1z" fill="#22d3ee"/><path d="M11.2 2.8V6h3.6" fill="none" stroke="#0a0b14" stroke-width="1.1" opacity=".45"/><rect x="6.4" y="9" width="6.3" height="1.2" rx=".6" fill="#0a0b14" opacity=".4"/><rect x="6.4" y="11.6" width="6.3" height="1.2" rx=".6" fill="#0a0b14" opacity=".4"/>`,
  kebab: `<circle cx="10" cy="4.2" r="1.6" fill="#8b8da8"/><circle cx="10" cy="10" r="1.6" fill="#8b8da8"/><circle cx="10" cy="15.8" r="1.6" fill="#8b8da8"/>`,
  refresh: `<path d="M16.2 6.3A6.8 6.8 0 1 0 17 10" fill="none" stroke="#8b5cf6" stroke-width="1.8" stroke-linecap="round"/><path d="M16.2 2.7v4h-4" fill="none" stroke="#8b5cf6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  search: `<circle cx="8.6" cy="8.6" r="5" fill="none" stroke="#22d3ee" stroke-width="1.8"/><path d="M12.5 12.5 17 17" stroke="#22d3ee" stroke-width="1.8" stroke-linecap="round"/>`,
  copy: `<rect x="7" y="7" width="9.5" height="9.5" rx="1.4" fill="#22d3ee"/><path d="M4.5 12.5V4.9c0-.8.6-1.4 1.4-1.4h7.6" fill="none" stroke="#22d3ee" stroke-width="1.6" stroke-linecap="round"/>`,
  link: `<path d="M8.5 11.5 11.5 8.5" stroke="#8b5cf6" stroke-width="1.8" stroke-linecap="round"/><path d="M6.8 12.5 4.9 14.4a2.6 2.6 0 0 0 3.7 3.7L10.5 16" fill="none" stroke="#8b5cf6" stroke-width="1.8" stroke-linecap="round"/><path d="M13.2 7.5 15.1 5.6a2.6 2.6 0 0 0-3.7-3.7L9.5 4" fill="none" stroke="#8b5cf6" stroke-width="1.8" stroke-linecap="round"/>`,
  eye: `<path d="M2 10s2.8-5.5 8-5.5S18 10 18 10s-2.8 5.5-8 5.5S2 10 2 10z" fill="none" stroke="#6ee7b7" stroke-width="1.6" stroke-linejoin="round"/><circle cx="10" cy="10" r="2.4" fill="#6ee7b7"/>`,
  "eye-off": `<path d="M2 10s2.8-5.5 8-5.5c1.3 0 2.5.25 3.5.65M18 10s-1 2-2.8 3.5M10 15.5c-5.2 0-8-5.5-8-5.5" fill="none" stroke="#8b8da8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 3l14 14" stroke="#8b8da8" stroke-width="1.6" stroke-linecap="round"/>`,
  check: `<path d="M4 10.5 8 14.5 16 5.5" fill="none" stroke="#6ee7b7" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  x: `<path d="M5 5l10 10M15 5 5 15" stroke="#e94560" stroke-width="2" stroke-linecap="round"/>`,
  plus: `<path d="M10 4v12M4 10h12" stroke="#8b5cf6" stroke-width="2" stroke-linecap="round"/>`,
  lock: `<rect x="4.5" y="9" width="11" height="8" rx="1.6" fill="#fbbf24"/><path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" fill="none" stroke="#fbbf24" stroke-width="1.6"/>`,
  "arrow-left": `<path d="M16 10H4" stroke="#8b8da8" stroke-width="1.8" stroke-linecap="round"/><path d="M8.5 5.5 4 10l4.5 4.5" fill="none" stroke="#8b8da8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  "chevron-right": `<path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="#8b8da8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  "chevron-down": `<path d="M5 7.5 10 13l5-5.5" fill="none" stroke="#8b8da8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  crown: `<path d="M3 7.5 6.4 10l3-4.4L12.6 10 16 7.5 14.8 15H5.2z" fill="#fbbf24"/><circle cx="3" cy="6.3" r="1.3" fill="#fbbf24"/><circle cx="10" cy="4.6" r="1.3" fill="#fbbf24"/><circle cx="17" cy="6.3" r="1.3" fill="#fbbf24"/>`,
  shield: `<path d="M10 2.5 16 5v4.5c0 4-2.6 6.7-6 7.8-3.4-1.1-6-3.8-6-7.8V5z" fill="#8b5cf6"/>`,
  calendar: `<rect x="3" y="4" width="14" height="13" rx="1.6" fill="#22d3ee"/><rect x="3" y="4" width="14" height="3.4" rx="1.4" fill="#0a0b14" opacity=".35"/><path d="M6.5 2.5v3M13.5 2.5v3" stroke="#22d3ee" stroke-width="1.6" stroke-linecap="round"/>`,
  "alert-triangle": `<path d="M10 2.8 18 16.5H2z" fill="#fbbf24"/><rect x="9.2" y="8" width="1.6" height="4.6" rx=".8" fill="#0a0b14" opacity=".55"/><circle cx="10" cy="14.3" r=".95" fill="#0a0b14" opacity=".55"/>`,
  "link-off": `<path d="M8.5 11.5 11.5 8.5" stroke="#e94560" stroke-width="1.8" stroke-linecap="round"/><path d="M6.8 12.5 4.9 14.4a2.6 2.6 0 0 0 3.7 3.7L10.5 16" fill="none" stroke="#e94560" stroke-width="1.8" stroke-linecap="round"/><path d="M13.2 7.5 15.1 5.6a2.6 2.6 0 0 0-3.7-3.7L9.5 4" fill="none" stroke="#e94560" stroke-width="1.8" stroke-linecap="round"/><path d="M3 3l14 14" stroke="#e94560" stroke-width="1.8" stroke-linecap="round"/>`,
  "message-off": `<path d="M3 4.5h14v9H9l-4 3v-3H3z" fill="#8b8da8" opacity=".5"/><path d="M3 3l14 14" stroke="#e94560" stroke-width="1.6" stroke-linecap="round"/>`,
  "plug-connected-x": `<path d="M6 6 3 3M14 6l3-3M6 6l4 4M12 8l-4-4" stroke="#e94560" stroke-width="1.6" stroke-linecap="round"/><circle cx="10" cy="12" r="4.5" fill="none" stroke="#e94560" stroke-width="1.6"/><path d="M8 10l4 4M12 10l-4 4" stroke="#e94560" stroke-width="1.6" stroke-linecap="round"/>`,
  "folder-off": `<path d="M3 5.5h5l1.6 2H17V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" fill="#8b8da8" opacity=".5"/><path d="M3 3l14 14" stroke="#e94560" stroke-width="1.6" stroke-linecap="round"/>`,
  "ticket-off": `<path d="M2.5 6.8c0-1 .8-1.8 1.8-1.8h11.4c1 0 1.8.8 1.8 1.8v1.4a1.7 1.7 0 0 0 0 3.6v1.4c0 1-.8 1.8-1.8 1.8H4.3c-1 0-1.8-.8-1.8-1.8v-1.4a1.7 1.7 0 0 0 0-3.6z" fill="#8b8da8" opacity=".5"/><path d="M3 3l14 14" stroke="#e94560" stroke-width="1.6" stroke-linecap="round"/>`,
  "circle-check": `<circle cx="10" cy="10" r="7.5" fill="#6ee7b7"/><path d="M6.5 10.2 9 12.7l4.5-5.4" fill="none" stroke="#0a0b14" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  "info-circle": `<circle cx="10" cy="10" r="7.5" fill="#22d3ee"/><rect x="9.2" y="8.6" width="1.6" height="5" rx=".8" fill="#0a0b14"/><circle cx="10" cy="6" r="1" fill="#0a0b14"/>`,
  "chevron-up": `<path d="M5 12.5 10 7l5 5.5" fill="none" stroke="#8b8da8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  "layout-grid": `<rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.4" fill="#8b5cf6"/><rect x="11" y="2.5" width="6.5" height="6.5" rx="1.4" fill="#f472b6"/><rect x="2.5" y="11" width="6.5" height="6.5" rx="1.4" fill="#22d3ee"/><rect x="11" y="11" width="6.5" height="6.5" rx="1.4" fill="#22d3ee" opacity=".55"/>`,
  tag: `<path d="M9.5 3H4.5a1.5 1.5 0 0 0-1.5 1.5V9c0 .4.15.78.44 1.06l7 7c.6.6 1.5.6 2.1 0l4-4c.6-.6.6-1.5 0-2.1l-7-7A1.5 1.5 0 0 0 9.5 3z" fill="#8b5cf6"/><circle cx="7" cy="7" r="1.2" fill="#0a0b14"/>`,

  // --- module-file icons (ticket-tool.js / custom-commands.js /
  // logging.js — exposed to them via window.DC.icon, see the bottom
  // of this file) ---
  adjustments: `<path d="M4 5h12M4 10h12M4 15h12" stroke="#8b8da8" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="5" r="1.8" fill="#8b5cf6"/><circle cx="14" cy="10" r="1.8" fill="#8b5cf6"/><circle cx="7" cy="15" r="1.8" fill="#8b5cf6"/>`,
  apps: `<rect x="2.5" y="2.5" width="6" height="6" rx="1.3" fill="#8b5cf6"/><rect x="11.5" y="2.5" width="6" height="6" rx="1.3" fill="#f472b6"/><rect x="2.5" y="11.5" width="6" height="6" rx="1.3" fill="#22d3ee"/><rect x="11.5" y="11.5" width="6" height="6" rx="1.3" fill="#6ee7b7"/>`,
  "arrow-right": `<path d="M4 10h12" stroke="#8b8da8" stroke-width="1.8" stroke-linecap="round"/><path d="M11.5 5.5 16 10l-4.5 4.5" fill="none" stroke="#8b8da8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  bell: `<path d="M10 2.5c-2.5 0-4 2-4 4.5v2.7L4.3 12.5h11.4L14 9.7V7c0-2.5-1.5-4.5-4-4.5z" fill="#fbbf24"/><path d="M8 15a2 2 0 0 0 4 0" fill="none" stroke="#fbbf24" stroke-width="1.4"/>`,
  bolt: `<path d="M11 2 4.5 11.5h4L9 18l6.5-9.5h-4z" fill="#fbbf24"/>`,
  "calendar-event": `<rect x="3" y="4" width="14" height="13" rx="1.6" fill="#22d3ee"/><rect x="3" y="4" width="14" height="3.4" rx="1.4" fill="#0a0b14" opacity=".35"/><path d="M6.5 2.5v3M13.5 2.5v3" stroke="#22d3ee" stroke-width="1.6" stroke-linecap="round"/><circle cx="10" cy="12.5" r="1.8" fill="#0a0b14" opacity=".5"/>`,
  channel: `<path d="M8 3.5 6.5 16.5M13.5 3.5 12 16.5" stroke="#8b8da8" stroke-width="1.5" stroke-linecap="round"/><path d="M3.5 8h13M3.5 12.5h13" stroke="#8b8da8" stroke-width="1.5" stroke-linecap="round"/>`,
  "chart-bar": `<rect x="3" y="11" width="3.4" height="6" rx="1" fill="#8b5cf6"/><rect x="8.3" y="6.5" width="3.4" height="10.5" rx="1" fill="#22d3ee"/><rect x="13.6" y="9" width="3.4" height="8" rx="1" fill="#f472b6"/>`,
  click: `<path d="M6 3v3M11 9l6 2.5-2.7.7-.7 2.7z" fill="#fbbf24"/><path d="M4 8H6M8 4V6M3.5 5.5l1.4 1.4" stroke="#fbbf24" stroke-width="1.4" stroke-linecap="round"/><rect x="6" y="6" width="4" height="4" rx="1" fill="#fbbf24" opacity=".6"/>`,
  "clipboard-list": `<rect x="4.5" y="3.5" width="11" height="14" rx="1.6" fill="#22d3ee"/><rect x="7" y="2" width="6" height="3" rx="1" fill="#0a0b14" opacity=".4"/><rect x="6.5" y="8" width="7" height="1.3" rx=".65" fill="#0a0b14" opacity=".5"/><rect x="6.5" y="11" width="7" height="1.3" rx=".65" fill="#0a0b14" opacity=".5"/><rect x="6.5" y="14" width="4.5" height="1.3" rx=".65" fill="#0a0b14" opacity=".5"/>`,
  clock: `<circle cx="10" cy="10" r="7.5" fill="#22d3ee"/><path d="M10 6v4.3l3 2" fill="none" stroke="#0a0b14" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  "door-exit": `<path d="M8 2.8H4.6c-1 0-1.8.8-1.8 1.8v10.8c0 1 .8 1.8 1.8 1.8H8" fill="none" stroke="#e94560" stroke-width="1.6" stroke-linecap="round"/><path d="M12.3 6.5 16 10l-3.7 3.5" fill="none" stroke="#e94560" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 10H7.5" stroke="#e94560" stroke-width="1.6" stroke-linecap="round"/>`,
  "file-text": `<path d="M6 2.8h5.4L15 6.4V17a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.8a1 1 0 0 1 1-1z" fill="#f472b6"/><path d="M11.2 2.8V6h3.6" fill="none" stroke="#0a0b14" stroke-width="1.1" opacity=".45"/><rect x="6.4" y="9" width="6.3" height="1.2" rx=".6" fill="#0a0b14" opacity=".4"/><rect x="6.4" y="11.6" width="6.3" height="1.2" rx=".6" fill="#0a0b14" opacity=".4"/>`,
  gavel: `<rect x="9" y="10.5" width="8" height="2.6" rx="1" fill="#8b5cf6" transform="rotate(-45 9 10.5)"/><rect x="2.5" y="12.5" width="5" height="2.4" rx="1" fill="#8b5cf6" transform="rotate(-45 2.5 12.5)"/><rect x="10.5" y="2.5" width="2.4" height="6.5" rx="1" fill="#8b5cf6" transform="rotate(45 10.5 2.5)"/><rect x="3" y="16.5" width="10" height="1.6" rx=".8" fill="#8b5cf6" opacity=".6"/>`,
  "grip-vertical": `<circle cx="7.5" cy="4.5" r="1.3" fill="#8b8da8"/><circle cx="12.5" cy="4.5" r="1.3" fill="#8b8da8"/><circle cx="7.5" cy="10" r="1.3" fill="#8b8da8"/><circle cx="12.5" cy="10" r="1.3" fill="#8b8da8"/><circle cx="7.5" cy="15.5" r="1.3" fill="#8b8da8"/><circle cx="12.5" cy="15.5" r="1.3" fill="#8b8da8"/>`,
  hash: `<path d="M7.3 2.5 5.7 17.5M14.3 2.5l-1.6 15M2.5 7.3h15M2.5 12.7h15" stroke="#22d3ee" stroke-width="1.6" stroke-linecap="round"/>`,
  headphones: `<path d="M4 11.5v-1a6 6 0 0 1 12 0v1" fill="none" stroke="#8b5cf6" stroke-width="1.8" stroke-linecap="round"/><rect x="2.5" y="11" width="3.4" height="5" rx="1.4" fill="#8b5cf6"/><rect x="14.1" y="11" width="3.4" height="5" rx="1.4" fill="#8b5cf6"/>`,
  "help-circle": `<circle cx="10" cy="10" r="7.5" fill="#8b5cf6"/><path d="M7.8 7.7a2.2 2.2 0 1 1 3.3 1.9c-.7.4-1.1.8-1.1 1.6" fill="none" stroke="#0a0b14" stroke-width="1.4" stroke-linecap="round"/><circle cx="10" cy="14" r="1" fill="#0a0b14"/>`,
  home: `<path d="M3 9.5 10 3l7 6.5" fill="none" stroke="#8b5cf6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 8.5V17h10V8.5" fill="#8b5cf6" opacity=".85"/>`,
  "layout-board": `<rect x="2.5" y="3" width="5" height="14" rx="1.4" fill="#8b5cf6"/><rect x="8.5" y="3" width="9" height="6.5" rx="1.4" fill="#22d3ee"/><rect x="8.5" y="10.5" width="9" height="6.5" rx="1.4" fill="#f472b6"/>`,
  list: `<circle cx="4" cy="5.5" r="1.2" fill="#8b5cf6"/><circle cx="4" cy="10" r="1.2" fill="#8b5cf6"/><circle cx="4" cy="14.5" r="1.2" fill="#8b5cf6"/><path d="M7.5 5.5h9M7.5 10h9M7.5 14.5h9" stroke="#8b5cf6" stroke-width="1.5" stroke-linecap="round"/>`,
  mail: `<rect x="2.5" y="4.5" width="15" height="11" rx="1.6" fill="#22d3ee"/><path d="M3 5.5l7 5.5 7-5.5" fill="none" stroke="#0a0b14" stroke-width="1.3" opacity=".5"/>`,
  message: `<path d="M3 4.5h14v9H9l-4 3v-3H3z" fill="#8b5cf6"/>`,
  messages: `<path d="M2.5 3.5h11v7H8l-3 2.3V10.5H2.5z" fill="#8b5cf6" opacity=".55"/><path d="M6.5 9h11v7H12l-3 2.3V16H6.5z" fill="#22d3ee"/>`,
  minus: `<path d="M4 10h12" stroke="#e94560" stroke-width="2" stroke-linecap="round"/>`,
  "mood-smile": `<circle cx="10" cy="10" r="7.5" fill="#fbbf24"/><circle cx="7.2" cy="8.5" r="1" fill="#0a0b14"/><circle cx="12.8" cy="8.5" r="1" fill="#0a0b14"/><path d="M6.8 11.5c.7 1.4 2 2.2 3.2 2.2s2.5-.8 3.2-2.2" fill="none" stroke="#0a0b14" stroke-width="1.3" stroke-linecap="round"/>`,
  notebook: `<rect x="4" y="2.5" width="12" height="15" rx="1.6" fill="#f472b6"/><rect x="6.2" y="5.3" width="7.6" height="1.4" rx=".7" fill="#0a0b14" opacity=".55"/><rect x="6.2" y="8.3" width="7.6" height="1.4" rx=".7" fill="#0a0b14" opacity=".55"/><rect x="6.2" y="11.3" width="4.6" height="1.4" rx=".7" fill="#0a0b14" opacity=".55"/>`,
  palette: `<path d="M10 2.5a7.5 7.5 0 1 0 0 15c1 0 1.6-.8 1.6-1.6 0-.4-.15-.75-.4-1a1.35 1.35 0 0 1 1-2.3H14a3 3 0 0 0 3-3c0-4-3.1-7.1-7-7.1z" fill="#8b5cf6"/><circle cx="6.3" cy="8" r="1.2" fill="#f472b6"/><circle cx="6.8" cy="12.2" r="1.2" fill="#22d3ee"/><circle cx="10.5" cy="6" r="1.2" fill="#fbbf24"/><circle cx="13.5" cy="8.2" r="1.2" fill="#6ee7b7"/>`,
  rocket: `<path d="M10 2.5c2.5 1.2 4 3.8 4 7 0 2.5-1 4.5-2.2 5.8L10 17l-1.8-1.7C7 14 6 12 6 9.5c0-3.2 1.5-5.8 4-7z" fill="#8b5cf6"/><circle cx="10" cy="8.5" r="1.6" fill="#0a0b14"/><path d="M7 14.5 5 18l3-1.2M13 14.5l2 3.5-3-1.2" fill="#fbbf24"/>`,
  settings: `<circle cx="10" cy="10" r="2.6" fill="#8b8da8"/><path d="M10 3v2.2M10 14.8V17M17 10h-2.2M5.2 10H3M14.8 5.2l-1.5 1.5M6.7 13.3l-1.5 1.5M14.8 14.8l-1.5-1.5M6.7 6.7 5.2 5.2" stroke="#8b8da8" stroke-width="1.6" stroke-linecap="round"/>`,
  "shield-check": `<path d="M10 2.5 16 5v4.5c0 4-2.6 6.7-6 7.8-3.4-1.1-6-3.8-6-7.8V5z" fill="#6ee7b7"/><path d="M7.3 9.8l1.8 1.8 3.6-3.9" fill="none" stroke="#0a0b14" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  "shield-lock": `<path d="M10 2.5 16 5v4.5c0 4-2.6 6.7-6 7.8-3.4-1.1-6-3.8-6-7.8V5z" fill="#f472b6"/><rect x="7.7" y="9.3" width="4.6" height="3.6" rx=".8" fill="#0a0b14"/><path d="M8.6 9.3V8a1.4 1.4 0 0 1 2.8 0v1.3" fill="none" stroke="#0a0b14" stroke-width="1.1"/>`,
  "shield-x": `<path d="M10 2.5 16 5v4.5c0 4-2.6 6.7-6 7.8-3.4-1.1-6-3.8-6-7.8V5z" fill="#e94560"/><path d="M7.8 7.8l4.4 4.4M12.2 7.8l-4.4 4.4" stroke="#0a0b14" stroke-width="1.4" stroke-linecap="round"/>`,
  sparkles: `<path d="M6 2.5l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill="#fbbf24"/><path d="M14.5 7l1.3 3.6 3.6 1.3-3.6 1.3-1.3 3.6-1.3-3.6-3.6-1.3 3.6-1.3z" fill="#f472b6"/>`,
  square: `<rect x="4" y="4" width="12" height="12" rx="2" fill="none" stroke="#8b8da8" stroke-width="1.8"/>`,
  sticker: `<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h6.4c.9 0 1.4.3 1.9.8l2.4 2.4c.5.5.8 1 .8 1.9v6.4a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 14.5z" fill="#fbbf24"/><path d="M12.5 3.3V7a1.5 1.5 0 0 0 1.5 1.5h3.7" fill="none" stroke="#0a0b14" stroke-width="1.1" opacity=".45"/>`,
  "toggle-left": `<rect x="2.5" y="6" width="15" height="8" rx="4" fill="#8b8da8" opacity=".4"/><circle cx="6.5" cy="10" r="3" fill="#8b8da8"/>`,
  "toggle-right": `<rect x="2.5" y="6" width="15" height="8" rx="4" fill="#8b5cf6"/><circle cx="13.5" cy="10" r="3" fill="#fff"/>`,
  transfer: `<path d="M3 6.5h11" stroke="#8b5cf6" stroke-width="1.8" stroke-linecap="round"/><path d="M10.5 3l3.5 3.5L10.5 10" fill="none" stroke="#8b5cf6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 13.5H6" stroke="#22d3ee" stroke-width="1.8" stroke-linecap="round"/><path d="M9.5 10l-3.5 3.5L9.5 17" fill="none" stroke="#22d3ee" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  "user-off": `<circle cx="10" cy="7" r="3.4" fill="#8b8da8" opacity=".5"/><path d="M3.3 17c.6-3.4 3.2-5.4 6.7-5.4s6.1 2 6.7 5.4z" fill="#8b8da8" opacity=".35"/><path d="M3 3l14 14" stroke="#e94560" stroke-width="1.6" stroke-linecap="round"/>`,
  users: `<circle cx="7" cy="7" r="2.8" fill="#8b5cf6"/><circle cx="14" cy="8" r="2.2" fill="#f472b6"/><path d="M2.3 17c.5-3.2 2.4-4.8 4.7-4.8s4.2 1.6 4.7 4.8z" fill="#8b5cf6" opacity=".8"/><path d="M11.5 17c.4-2.5 1.7-4 3.8-4s3.4 1.5 3.8 4z" fill="#f472b6" opacity=".8"/>`,
  user: `<circle cx="10" cy="7" r="3.4" fill="#8b5cf6"/><path d="M3.3 17c.6-3.4 3.2-5.4 6.7-5.4s6.1 2 6.7 5.4z" fill="#8b5cf6" opacity=".8"/>`,
  variable: `<path d="M6 4.5c-2 3.5-2 8 0 11M14 4.5c2 3.5 2 8 0 11" fill="none" stroke="#22d3ee" stroke-width="1.6" stroke-linecap="round"/><path d="M8 8.5l4 3M12 8.5l-4 3" stroke="#22d3ee" stroke-width="1.6" stroke-linecap="round"/>`,
  volume: `<path d="M3 8v4h3l4 3V5L6 8z" fill="#22d3ee"/><path d="M13 7.5a4 4 0 0 1 0 5M15.5 5a7.5 7.5 0 0 1 0 10" fill="none" stroke="#22d3ee" stroke-width="1.5" stroke-linecap="round"/>`,
  webhook: `<circle cx="6" cy="14.5" r="2.5" fill="#8b5cf6"/><circle cx="15" cy="6.5" r="2.5" fill="#22d3ee"/><circle cx="15" cy="14.5" r="2.5" fill="#f472b6"/><path d="M8 13.5 12.5 7M8 15h4.5" stroke="#8b8da8" stroke-width="1.5" stroke-linecap="round"/>`,
  "category-2": `<rect x="2.5" y="4" width="15" height="12" rx="1.6" fill="#8b5cf6" opacity=".2"/><path d="M2.5 6.5c0-1.4 1-2.5 2.4-2.5h3l1.6 2h5.4c1.4 0 2.6 1.1 2.6 2.5v6c0 1.4-1.2 2.5-2.6 2.5H5.1c-1.4 0-2.6-1.1-2.6-2.5z" fill="#8b5cf6"/>`,
  storage: `<rect x="2.5" y="3" width="15" height="5.2" rx="1.5" fill="#22d3ee"/><rect x="2.5" y="11.8" width="15" height="5.2" rx="1.5" fill="#8b5cf6"/><circle cx="5.3" cy="5.6" r="1" fill="#0a0b14" opacity=".6"/><circle cx="5.3" cy="14.4" r="1" fill="#0a0b14" opacity=".6"/><path d="M14 5.6h1.8M14 14.4h1.8" stroke="#0a0b14" stroke-width="1.1" opacity=".5"/>`,
  "search-off": `<circle cx="8.6" cy="8.6" r="5" fill="none" stroke="#8b8da8" stroke-width="1.8" opacity=".5"/><path d="M12.5 12.5 17 17" stroke="#8b8da8" stroke-width="1.8" stroke-linecap="round" opacity=".5"/><path d="M3 3l14 14" stroke="#e94560" stroke-width="1.6" stroke-linecap="round"/>`,
  "tag-off": `<path d="M9.5 3H4.5a1.5 1.5 0 0 0-1.5 1.5V9c0 .4.15.78.44 1.06l7 7c.6.6 1.5.6 2.1 0l4-4c.6-.6.6-1.5 0-2.1l-7-7A1.5 1.5 0 0 0 9.5 3z" fill="#8b8da8" opacity=".4"/><path d="M2 2l16 16" stroke="#e94560" stroke-width="1.6" stroke-linecap="round"/>`,
  "terminal-2": `<rect x="2.5" y="3.5" width="15" height="13" rx="2" fill="#14162a" stroke="#22d3ee" stroke-width="1.3"/><path d="M5.5 8l2.3 2.2-2.3 2.2" fill="none" stroke="#22d3ee" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 12.4h4.2" stroke="#22d3ee" stroke-width="1.5" stroke-linecap="round"/>`,
  "history-off": `<path d="M3.5 10a6.5 6.5 0 1 1 1.9 4.6" fill="none" stroke="#8b8da8" stroke-width="1.6" stroke-linecap="round" opacity=".5"/><path d="M10 6.5V10l2.5 1.5" fill="none" stroke="#8b8da8" stroke-width="1.5" stroke-linecap="round" opacity=".5"/><path d="M3 3l14 14" stroke="#e94560" stroke-width="1.6" stroke-linecap="round"/>`,
  "microphone-2": `<rect x="7.5" y="2.5" width="5" height="9" rx="2.5" fill="#f472b6"/><path d="M5.5 9.5v.8a4.5 4.5 0 0 0 9 0v-.8" fill="none" stroke="#f472b6" stroke-width="1.5" stroke-linecap="round"/><path d="M10 14.8v2.7M7.3 17.5h5.4" stroke="#f472b6" stroke-width="1.5" stroke-linecap="round"/>`,
};
function icon(name, sizePx = 18) {
  const inner = ICON_PATHS[name] || `<circle cx="10" cy="10" r="3.5" fill="#8b5cf6"/>`;
  return `<span class="nav-svg-icon" aria-hidden="true"><svg width="${sizePx}" height="${sizePx}" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">${inner}</svg></span>`;
}
// navIcon kept as an alias — existing call sites (nav items, module
// sidebar) already use this name.
function navIcon(name, sizePx) { return icon(name, sizePx); }

// ============================================================
// Router
// ============================================================
const routes = {
  parse() {
    const path = window.location.pathname.replace(CFG.BASE_PATH, "").replace(/^\/|\/$/g, "");
    const parts = path.split("/").filter(Boolean);
    if (parts[0] === "dashboard") return { screen: "picker", panel: "dashboard" };
    if (parts[0] === "my-tickets") {
      // /my-tickets/ticket/:guildId/:ticketId — a specific ticket opened
      // from the personal My Tickets list, distinct from the module's
      // own /servers/:id/:module/ticket/:id (different entry point,
      // same underlying detail page).
      if (parts[1] === "ticket" && parts[2] && parts[3]) return { screen: "picker", panel: "my-tickets", myTicketGuildId: parts[2], myTicketId: parts[3] };
      return { screen: "picker", panel: "my-tickets" };
    }
    if (parts[0] === "premium") return { screen: "picker", panel: "premium" };
    // /docs with no scope lands on the base Info tab; /docs/<moduleId>
    // opens straight to that module's own documentation page.
    if (parts[0] === "docs") return { screen: "picker", panel: "docs", docsModuleId: parts[1] || null };
    if (parts[0] === "admin") return { screen: "picker", panel: "admin" };
    if (parts[0] === "share" && parts[1]) return { screen: "share", shareId: parts[1] };
    if (parts[0] === "servers" && parts[1]) {
      const guildId = parts[1];
      const moduleId = parts[2] || "ticket-tool";
      if (parts[3] === "ticket" && parts[4]) return { screen: "dashboard", guildId, panel: moduleId, ticketId: parts[4] };
      const tab = parts[3] || null;
      return { screen: "dashboard", guildId, panel: moduleId, tab };
    }
    return { screen: "landing" };
  },
  go(url, replace = false) {
    const full = CFG.BASE_PATH.replace(/\/$/, "") + url;
    if (replace) window.history.replaceState({}, "", full);
    else window.history.pushState({}, "", full);
  },
  moduleUrl(guildId, moduleId, tab) {
    return `/servers/${guildId}/${moduleId}${tab ? `/${tab}` : ""}`;
  },
  ticketUrl(guildId, moduleId, ticketId) {
    return `/servers/${guildId}/${moduleId}/ticket/${ticketId}`;
  },
  myTicketUrl(guildId, ticketId) {
    return `/my-tickets/ticket/${guildId}/${ticketId}`;
  },
  docsUrl(moduleId) {
    return moduleId ? `/docs/${moduleId}` : "/docs";
  },
};

window.addEventListener("popstate", () => renderFromRoute());

// ============================================================
// Shared modal system — every dialog in the app (confirm, alert, or a
// fully custom body) renders through this, so nothing anywhere uses the
// browser's native confirm()/alert() or a one-off overlay div.
// ============================================================
function escapeHtml(s) { return (s || "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

const DCModal = (() => {
  const root = () => document.getElementById("dc-modal-root");

  function close() {
    const r = root();
    r.innerHTML = "";
    r.classList.remove("dc-modal-open");
    document.removeEventListener("keydown", onEscape);
  }
  function onEscape(e) { if (e.key === "Escape") close(); }

  function open(bodyHtml, { maxWidth = "440px", onMount } = {}) {
    const r = root();
    r.classList.add("dc-modal-open");
    r.innerHTML = `
      <div class="dc-modal-overlay">
        <div class="dc-modal-panel" style="max-width:${maxWidth}">${bodyHtml}</div>
      </div>`;
    r.querySelector(".dc-modal-overlay").addEventListener("click", (e) => { if (e.target.classList.contains("dc-modal-overlay")) close(); });
    document.addEventListener("keydown", onEscape);
    if (onMount) onMount(r);
    return r;
  }

  function confirm(message, opts = {}) {
    return new Promise((resolve) => {
      const { title = "Are you sure?", confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false } = opts;
      open(`
        <div class="dc-modal-header"><h3>${escapeHtml(title)}</h3></div>
        <div class="dc-modal-body"><p>${escapeHtml(message)}</p></div>
        <div class="dc-modal-footer">
          <button class="btn btn-ghost btn-small" id="dc-modal-cancel">${escapeHtml(cancelLabel)}</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"} btn-small" id="dc-modal-confirm">${escapeHtml(confirmLabel)}</button>
        </div>`, {
        onMount: (r) => {
          r.querySelector("#dc-modal-cancel").addEventListener("click", () => { close(); resolve(false); });
          r.querySelector("#dc-modal-confirm").addEventListener("click", () => { close(); resolve(true); });
        },
      });
    });
  }

  function alertModal(message, opts = {}) {
    return new Promise((resolve) => {
      const { title = "Notice", okLabel = "OK" } = opts;
      open(`
        <div class="dc-modal-header"><h3>${escapeHtml(title)}</h3></div>
        <div class="dc-modal-body"><p>${escapeHtml(message)}</p></div>
        <div class="dc-modal-footer">
          <button class="btn btn-primary btn-small" id="dc-modal-ok">${escapeHtml(okLabel)}</button>
        </div>`, {
        onMount: (r) => r.querySelector("#dc-modal-ok").addEventListener("click", () => { close(); resolve(); }),
      });
    });
  }

  function promptModal(message, opts = {}) {
    return new Promise((resolve) => {
      const { title = "Enter a value", placeholder = "", defaultValue = "", confirmLabel = "Save" } = opts;
      open(`
        <div class="dc-modal-header"><h3>${escapeHtml(title)}</h3></div>
        <div class="dc-modal-body">
          <p style="margin-bottom:10px">${escapeHtml(message)}</p>
          <input type="text" class="dc-modal-input" id="dc-modal-prompt-input" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(defaultValue)}">
        </div>
        <div class="dc-modal-footer">
          <button class="btn btn-ghost btn-small" id="dc-modal-cancel">Cancel</button>
          <button class="btn btn-primary btn-small" id="dc-modal-confirm">${escapeHtml(confirmLabel)}</button>
        </div>`, {
        onMount: (r) => {
          const input = r.querySelector("#dc-modal-prompt-input");
          input.focus();
          input.select();
          input.addEventListener("keydown", (e) => { if (e.key === "Enter") { close(); resolve(input.value); } });
          r.querySelector("#dc-modal-cancel").addEventListener("click", () => { close(); resolve(null); });
          r.querySelector("#dc-modal-confirm").addEventListener("click", () => { close(); resolve(input.value); });
        },
      });
    });
  }

  function custom(bodyHtml, opts = {}) {
    return open(bodyHtml, opts);
  }

  return { confirm, alert: alertModal, prompt: promptModal, custom, close };
})();

// ============================================================
// PKCE helpers
// ============================================================
function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function makeVerifierAndChallenge() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(digest) };
}
async function beginLogin() {
  const { verifier, challenge } = await makeVerifierAndChallenge();
  sessionStorage.setItem(LS.verifier, verifier);
  sessionStorage.setItem("tk_post_login_redirect", "/dashboard");
  const params = new URLSearchParams({
    client_id: CFG.DISCORD_CLIENT_ID,
    redirect_uri: CFG.REDIRECT_URI,
    response_type: "code",
    scope: CFG.OAUTH_SCOPES.join(" "),
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  window.location.href = `https://discord.com/oauth2/authorize?${params.toString()}`;
}
async function exchangeCodeForToken(code) {
  const verifier = sessionStorage.getItem(LS.verifier);
  const body = new URLSearchParams({
    client_id: CFG.DISCORD_CLIENT_ID, grant_type: "authorization_code",
    code, redirect_uri: CFG.REDIRECT_URI, code_verifier: verifier,
  });
  try {
    const res = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
    if (!res.ok) throw new Error("direct exchange failed");
    return await res.json();
  } catch {
    let res2;
    try {
      res2 = await fetch(`${CFG.LOCAL_BOT_URL}/oauth/exchange`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, verifier, redirect_uri: CFG.REDIRECT_URI }),
      });
    } catch {
      throw new Error("Could not complete login. Is your bot running?");
    }
    if (!res2.ok) throw new Error("Could not complete login. Is your bot running?");
    return await res2.json();
  }
}

function saveSession(tokenData, user) {
  localStorage.setItem(LS.token, tokenData.access_token);
  localStorage.setItem(LS.tokenExpiry, String(Date.now() + tokenData.expires_in * 1000));
  localStorage.setItem(LS.user, JSON.stringify(user));
}
function getSession() {
  const token = localStorage.getItem(LS.token);
  const expiry = Number(localStorage.getItem(LS.tokenExpiry) || 0);
  if (!token || Date.now() > expiry) return null;
  return { token, user: JSON.parse(localStorage.getItem(LS.user) || "null") };
}
function clearSession() { [LS.token, LS.tokenExpiry, LS.user].forEach(k => localStorage.removeItem(k)); }

// ============================================================
// Discord API (direct, via the user's own access token)
// ============================================================
async function fetchMe(token) {
  let res;
  try {
    res = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    // fetch() itself throwing (not an HTTP error status) means the
    // request never reached Discord at all — a network drop, DNS
    // failure, or the browser blocking it. The raw error here is just
    // "TypeError: Failed to fetch", which explains nothing useful to
    // read in a modal — replaced with an actual, actionable message.
    throw new Error("Couldn't reach Discord — check your internet connection and try again.");
  }
  if (!res.ok) throw new Error("Failed to load Discord profile");
  return res.json();
}
async function fetchMyGuilds(token) {
  let res;
  try {
    res = await fetch("https://discord.com/api/users/@me/guilds", { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new Error("Couldn't reach Discord — check your internet connection and try again.");
  }
  if (res.status === 429) {
    // Discord's own guild-list endpoint rate-limits unusually
    // aggressively, especially right after a fresh login when other
    // requests (fetchMe, pingLocalBot) are firing around the same
    // time — this is the single most common cause of "couldn't load
    // your servers" and is genuinely transient, not a real failure.
    // Respect the Retry-After header Discord sends rather than
    // guessing a delay, then try exactly once more before giving up.
    const retryAfterSec = Number(res.headers.get("retry-after")) || 1.5;
    await new Promise(resolve => setTimeout(resolve, retryAfterSec * 1000));
    let retryRes;
    try {
      retryRes = await fetch("https://discord.com/api/users/@me/guilds", { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      throw new Error("Couldn't reach Discord — check your internet connection and try again.");
    }
    if (!retryRes.ok) throw new Error(retryRes.status === 429 ? "Discord is rate-limiting this request — wait a moment and try again." : `Failed to load your servers (HTTP ${retryRes.status}).`);
    return retryRes.json();
  }
  if (res.status === 401) throw new Error("Your login has expired — please log in again.");
  if (!res.ok) throw new Error(`Failed to load your servers (HTTP ${res.status}).`);
  return res.json();
}
function isAdmin(guild) {
  return guild.owner || (BigInt(guild.permissions) & BigInt(ADMINISTRATOR)) === BigInt(ADMINISTRATOR);
}

// ============================================================
// Bot bridge
// ============================================================
async function pingLocalBot() {
  const startedAt = performance.now();
  // Short timeouts (2s each) so a down bot is detected and re-checked
  // roughly every second as intended, rather than one slow check (up
  // to 16s with the old 8s+8s timeouts) blocking the in-flight guard
  // in the polling loop below for most of that window.
  try {
    const res = await fetch(`${CFG.LOCAL_BOT_URL}/status`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      // Round-trip time for this exact request — the only place we can
      // measure latency from, since the bot itself doesn't report one.
      data.latencyMs = Math.round(performance.now() - startedAt);
      return data;
    }
  } catch { /* fall through to root check below */ }
  try {
    await fetch(`${CFG.LOCAL_BOT_URL}/`, { signal: AbortSignal.timeout(2000) });
    return null;
  } catch {
    return null;
  }
}
async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(`${CFG.LOCAL_BOT_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    // fetch() throwing here (rather than resolving with a non-ok
    // status) means the request never reached the bot at all — the
    // tunnel is down, the bot's PC is off, or AbortSignal.timeout
    // fired. The raw error in either case is an unreadable
    // "TypeError: Failed to fetch" / "AbortError: signal timed out"
    // with no indication of what actually went wrong — this was
    // previously uncaught here entirely, so every single api() call
    // anywhere in the app (nearly everything) could throw that raw
    // text straight into a UI error message. Replaced with one clear,
    // actionable message covering both cases.
    const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError";
    throw new Error(timedOut
      ? "The bot didn't respond in time — check that it's running and your tunnel is up."
      : "Couldn't reach the bot — check that it's running and your tunnel is up.");
  }
  if (!res.ok) {
    let detail = "";
    try {
      const text = await res.text();
      try {
        detail = JSON.parse(text).error || "";
      } catch {
        // The bot didn't return JSON (an unexpected HTML error page from
        // Express itself, a proxy, etc). Rather than dumping raw HTML
        // markup into the UI (unreadable, and looks broken), fall back
        // to a short, honest message that still names the HTTP status.
        detail = "";
      }
    } catch { /* couldn't even read the body */ }
    throw new Error(detail || `Request failed (HTTP ${res.status}). The bot may need to be restarted — check its console output.`);
  }
  return res.json();
}

// ============================================================
// Theme — #18: three-way Light / Dark / System selector, replacing the
// old two-way on/off toggle. "system" tracks prefers-color-scheme live
// (via a media query listener) rather than being resolved once at
// apply-time, so the page follows the OS if the person leaves it set
// to System and changes their OS theme later.
// ============================================================
const systemThemeQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
function resolveSystemTheme() { return systemThemeQuery && systemThemeQuery.matches ? "light" : "dark"; }
function applyTheme(theme) {
  // theme is the person's PREFERENCE: "light" | "dark" | "system".
  // The actual attribute painted on <body> is always a concrete
  // "light"/"dark" — "system" resolves to whichever the OS reports.
  const resolved = theme === "system" ? resolveSystemTheme() : theme;
  document.body.setAttribute("data-theme", resolved);
  localStorage.setItem(LS.theme, theme);
  document.querySelectorAll("[id^=btn-theme]").forEach(btn => {
    btn.innerHTML = resolved === "dark" ? `<i class="ti ti-moon"></i>` : `<i class="ti ti-sun"></i>`;
  });
}
function getThemePreference() { return localStorage.getItem(LS.theme) || "system"; }
if (systemThemeQuery) {
  systemThemeQuery.addEventListener("change", () => { if (getThemePreference() === "system") applyTheme("system"); });
}

// Shared bottom-of-sidebar block: the theme picker sits above
// Status, then the logged-in user's profile chip with its
// Profile/Admin Panel/Log out menu.
function renderSidebarBottom(slotId) {
  const slot = document.getElementById(slotId);
  if (!slot) return;
  const session = getSession();
  const currentPref = getThemePreference();
  const THEME_OPTIONS = [
    { id: "light", label: "Light", icon: "theme-light" },
    { id: "dark", label: "Dark", icon: "theme-dark" },
    { id: "system", label: "System", icon: "theme-system" },
  ];
  const currentOpt = THEME_OPTIONS.find(o => o.id === currentPref) || THEME_OPTIONS[1];
  slot.innerHTML = `
    <div class="sidebar-bottom">
      <a href="${inviteUrl()}" target="_blank" rel="noopener" class="nav-item sb-invite-link">${icon("plus")} Invite Bot</a>
      <a href="#" class="nav-item sb-docs-link">${icon("document")} Documentation</a>
      <div class="theme-picker-anchor">
        <div class="nav-item sidebar-theme-row theme-picker-trigger">
          ${icon(currentOpt.icon)} <span class="sidebar-theme-label">${currentOpt.label}</span>
          <span style="margin-left:auto">${icon("chevron-up", 14)}</span>
        </div>
        <div class="theme-picker-menu" style="display:none">
          ${THEME_OPTIONS.map(o => `<button class="theme-picker-item ${o.id === currentPref ? "active" : ""}" data-theme-opt="${o.id}">${icon(o.icon)} ${o.label}</button>`).join("")}
        </div>
      </div>
      <a href="#" class="nav-item sb-status-link">${icon("status")} Status</a>
      ${CFG.DISCORD_SUPPORT_URL ? `<a href="${CFG.DISCORD_SUPPORT_URL}" target="_blank" rel="noopener" class="nav-item sb-discord-link"><i class="ti ti-brand-discord" style="font-size:18px;width:20px;text-align:center"></i> Support Server</a>` : ""}
      <div class="sidebar-profile sb-profile-trigger">
        <img class="sidebar-profile-avatar" src="${avatarUrl(session.user)}" alt="">
        <div class="sidebar-profile-name">${escapeHtml(session.user.username)}</div>
        <span style="margin-left:auto">${icon("chevron-up", 14)}</span>
      </div>
      <div class="sidebar-profile-menu sb-profile-menu" style="display:none">
        <div class="sidebar-profile-menu-header">
          <img class="sidebar-profile-avatar" src="${avatarUrl(session.user)}" alt="">
          <div><div class="sidebar-profile-name">${escapeHtml(session.user.username)}</div><div class="field-hint" style="margin-top:1px">@${escapeHtml(session.user.username)}</div></div>
        </div>
        <button class="kebab-menu-item sb-profile-btn">${icon("user-profile")} Profile</button>
        <button class="kebab-menu-item sb-admin-panel-btn" style="display:none">${icon("admin")} Admin Panel</button>
        <button class="kebab-menu-item danger sb-logout-btn">${icon("logout")} Log out</button>
      </div>
    </div>`;

  maybeShowAdminPanelButton(slot);

  const statusLink = slot.querySelector(".sb-status-link");
  const docsLink = slot.querySelector(".sb-docs-link");
  const themeTrigger = slot.querySelector(".theme-picker-trigger");
  const themeMenu = slot.querySelector(".theme-picker-menu");
  const menu = slot.querySelector(".sb-profile-menu");
  const trigger = slot.querySelector(".sb-profile-trigger");
  const profileBtn = slot.querySelector(".sb-profile-btn");
  const logoutBtn = slot.querySelector(".sb-logout-btn");
  const adminPanelBtn = slot.querySelector(".sb-admin-panel-btn");

  docsLink.addEventListener("click", (e) => {
    e.preventDefault();
    pickerActivePanel = "docs";
    routes.go("/docs");
    enterPicker("docs");
  });

  statusLink.addEventListener("click", async (e) => {
    e.preventDefault();
    // Status is a dashboard panel like any module (server context,
    // full module list in the sidebar) rather than its own separate
    // screen — if no server is currently open (e.g. clicked from the
    // picker), fall back to the last server that was open, or the
    // first server the bot is in, so there's always something to show.
    if (!currentGuild?.id) {
      await refreshHeroStatus();
      const fallback = (botInfoCache?.guilds || [])[0];
      if (!fallback) { await DCModal.alert("No servers to show status for yet — open a server's dashboard first.", { title: "No server selected" }); return; }
      currentGuild = { id: fallback.id, name: fallback.name, icon: fallback.icon };
    }
    routes.go(routes.moduleUrl(currentGuild.id, "status"));
    enterDashboard("status");
  });

  function closeThemeMenuOnOutsideClick(e) {
    if (!themeMenu.contains(e.target) && !themeTrigger.contains(e.target)) {
      themeMenu.style.display = "none";
      document.removeEventListener("click", closeThemeMenuOnOutsideClick, true);
    }
  }
  themeTrigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = themeMenu.style.display !== "none";
    if (isOpen) { themeMenu.style.display = "none"; document.removeEventListener("click", closeThemeMenuOnOutsideClick, true); }
    else { themeMenu.style.display = "block"; document.addEventListener("click", closeThemeMenuOnOutsideClick, true); }
  });
  themeMenu.querySelectorAll("[data-theme-opt]").forEach(btn => btn.addEventListener("click", () => {
    applyTheme(btn.dataset.themeOpt);
    themeMenu.style.display = "none";
    document.removeEventListener("click", closeThemeMenuOnOutsideClick, true);
    // Repaint every sidebar-bottom slot currently in the DOM so the
    // trigger's own label/icon and the menu's "active" state update
    // immediately, without needing a full screen re-render.
    ["picker-sidebar-bottom", "dash-sidebar-bottom"].forEach(id => { if (document.getElementById(id)) renderSidebarBottom(id); });
  }));

  function closeMenuOnOutsideClick(e) {
    if (!menu.contains(e.target) && !trigger.contains(e.target)) {
      menu.style.display = "none";
      document.removeEventListener("click", closeMenuOnOutsideClick, true);
    }
  }
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = menu.style.display !== "none";
    if (isOpen) {
      menu.style.display = "none";
      document.removeEventListener("click", closeMenuOnOutsideClick, true);
    } else {
      menu.style.display = "block";
      document.addEventListener("click", closeMenuOnOutsideClick, true);
    }
  });
  logoutBtn.addEventListener("click", () => { clearSession(); routes.go("/", true); showScreen("screen-landing"); });
  profileBtn.addEventListener("click", () => { menu.style.display = "none"; /* no dedicated profile page yet */ });
  adminPanelBtn.addEventListener("click", () => {
    menu.style.display = "none";
    pickerActivePanel = "admin";
    routes.go("/admin");
    enterPicker("admin");
  });
}

let adminEligibilityCache = null;
async function maybeShowAdminPanelButton(slot) {
  const btn = slot.querySelector(".sb-admin-panel-btn");
  if (!btn) return;
  const session = getSession();
  if (!session?.user?.id) return;
  if (adminEligibilityCache === null) {
    try {
      const result = await api(`/admin/eligibility?discordUserId=${session.user.id}`);
      adminEligibilityCache = Boolean(result.eligible);
    } catch { adminEligibilityCache = false; }
  }
  if (adminEligibilityCache) btn.style.display = "flex";
}

applyTheme(getThemePreference());

// Paint every static custom SVG icon placeholder once at load,
// replacing the plain Tabler <i class="ti ..."> each one ships with in
// index.html (kept there only so the page has something sensible to
// show for that one instant if this script somehow failed to run)
// with the real custom SVG from icon(). Covers two attribute names
// for historical reasons (data-nav-icon predates the general-purpose
// data-icon, both work the same way) — runs once at load since these
// are static markup in index.html, never re-rendered.
document.querySelectorAll("[data-nav-icon], [data-icon]").forEach(el => {
  const iconName = el.dataset.navIcon || el.dataset.icon;
  const placeholder = el.querySelector("i.ti") || (el.matches("i.ti") ? el : null);
  if (iconName && placeholder) placeholder.outerHTML = icon(iconName);
});

// ============================================================
// Small render helpers
// ============================================================
function showScreen(id) { document.querySelectorAll(".screen").forEach(s => s.classList.remove("active")); document.getElementById(id).classList.add("active"); }
function initials(name) { return (name || "?").slice(0, 2).toUpperCase(); }
function avatarUrl(user) {
  return user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/${Number(user.discriminator || 0) % 5}.png`;
}
function inviteUrl(guildId) {
  const p = { client_id: CFG.DISCORD_CLIENT_ID, permissions: CFG.BOT_PERMISSIONS, scope: "bot applications.commands" };
  if (guildId) p.guild_id = guildId;
  return `https://discord.com/oauth2/authorize?${new URLSearchParams(p)}`;
}
function formatUptime(sec) {
  if (sec == null) return "—";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}
function loadingBlock(msg) { return `<div class="loading-wrap"><div class="spinner"></div><div>${msg || "Loading…"}</div></div>`; }
function renderStatusPip(el, botInfo) {
  el.classList.remove("online", "offline", "checking");
  if (botInfo && botInfo.online) {
    el.classList.add("online");
    const latency = botInfo.latencyMs != null ? `${botInfo.latencyMs}ms` : "—";
    const uptime = formatUptime(botInfo.uptimeSeconds);
    el.innerHTML = `<span class="status-dot"></span>Bot Servers up <span class="status-pip-sep">·</span> ${latency} <span class="status-pip-sep">·</span> up ${uptime}`;
  } else {
    el.classList.add("offline");
    el.innerHTML = `<span class="status-dot"></span>Bot Servers down`;
  }
}
function timeAgoGlobal(iso) {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

// ============================================================
// Global state
// ============================================================
let botInfoCache = null;
let currentGuild = null;   // { id, name, icon }
let currentGuildDisabledModules = [];

// ============================================================
// Boot + top-level routing
// ============================================================
async function boot() {
  const redirectPath = sessionStorage.getItem("tk_redirect_path");
  if (redirectPath) {
    sessionStorage.removeItem("tk_redirect_path");
    window.history.replaceState({}, "", redirectPath);
  }

  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");

  const route = routes.parse();
  if (route.screen === "share") { await enterSharePage(route.shareId); return; }

  refreshHeroStatus();

  if (code) {
    url.searchParams.delete("code");
    window.history.replaceState({}, "", url.pathname + url.search);
    try {
      const tokenData = await exchangeCodeForToken(code);
      const user = await fetchMe(tokenData.access_token);
      saveSession(tokenData, user);
      routes.go(sessionStorage.getItem("tk_post_login_redirect") || "/dashboard", true);
      renderFromRoute();
    } catch (e) {
      await DCModal.alert(e.message || "Login failed", { title: "Login failed" });
      routes.go("/", true);
      showScreen("screen-landing");
    }
    return;
  }
  renderFromRoute();
}

async function renderFromRoute() {
  const route = routes.parse();
  const session = getSession();

  if (route.screen === "share") { await enterSharePage(route.shareId); return; }
  if (route.screen !== "landing" && !session) { routes.go("/", true); showScreen("screen-landing"); return; }

  if (route.screen === "landing") { showScreen("screen-landing"); return; }
  if (route.screen === "picker") { await enterPicker(route.panel, { myTicketGuildId: route.myTicketGuildId, myTicketId: route.myTicketId, docsModuleId: route.docsModuleId }); return; }
  if (route.screen === "dashboard") {
    if (!currentGuild || currentGuild.id !== route.guildId) {
      currentGuild = { id: route.guildId, name: null, icon: null };
    }
    await enterDashboard(route.panel || "ticket-tool", { tab: route.tab, ticketId: route.ticketId });
  }
}

async function refreshHeroStatus() {
  const info = await pingLocalBot();
  botInfoCache = info;
  const heroPip = document.getElementById("hero-status-pip");
  if (heroPip) renderStatusPip(heroPip, info);
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("hero-bot-url", info?.online ? "Online" : "Down");
  set("hero-guild-count", info?.guildCount ?? "—");
  set("hero-uptime", info ? formatUptime(info.uptimeSeconds) : "—");
  set("hero-bot-tag", info?.botTag ?? "—");
  ["picker-status-pip", "dash-status-pip"].forEach(id => { const el = document.getElementById(id); if (el) renderStatusPip(el, info); });
  paintWatchingPanel(info);
}

// "NEXORIA is watching" box on the landing page: total servers/members
// across every guild the bot is in, plus the top 3 by member count.
// Uses the same /status payload refreshHeroStatus already fetched — no
// extra request. Left hidden (see index.html) until there's a real
// guild list to show, rather than flashing "0 servers, 0 members".
function paintWatchingPanel(info) {
  const panel = document.getElementById("watching-panel");
  if (!panel) return;
  const guilds = info?.guilds || [];
  if (!info?.online || guilds.length === 0) { panel.style.display = "none"; return; }
  panel.style.display = "";
  const totalMembers = guilds.reduce((sum, g) => sum + (g.memberCount || 0), 0);
  document.getElementById("watching-summary").innerHTML =
    `<span class="accent">${guilds.length}</span> server${guilds.length === 1 ? "" : "s"} · <span class="accent">${totalMembers.toLocaleString()}</span> member${totalMembers === 1 ? "" : "s"}`;
  const top3 = [...guilds].sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0)).slice(0, 3);
  document.getElementById("watching-top-list").innerHTML = top3.map((g, i) => `
    <div class="watching-top-row">
      <span class="watching-top-rank">#${i + 1}</span>
      ${g.icon
        ? `<img class="watching-top-icon" src="https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png" alt="">`
        : `<span class="watching-top-icon server-icon" style="display:flex;align-items:center;justify-content:center;font-size:9px">${initials(g.name)}</span>`}
      <span class="watching-top-name">${escapeHtml(g.name)}</span>
      <span class="watching-top-count">${(g.memberCount || 0).toLocaleString()}</span>
    </div>`).join("");
}

// ============================================================
// Picker screen
// ============================================================
let pickerActivePanel = "dashboard";

async function enterPicker(panel, deepLink = {}) {
  showScreen("screen-picker");
  pickerActivePanel = panel || pickerActivePanel || "dashboard";
  renderSidebarBottom("picker-sidebar-bottom");
  wirePickerServerSwitcher();
  await refreshHeroStatus();
  paintPickerNav();

  if (pickerActivePanel === "my-tickets" && deepLink.myTicketGuildId && deepLink.myTicketId) {
    await openMyTicketDetail(deepLink.myTicketGuildId, deepLink.myTicketId, false);
  } else {
    await renderPickerPanel(pickerActivePanel, deepLink);
  }

  document.querySelectorAll("#picker-sidebar [data-picker-panel]").forEach(el => {
    el.addEventListener("click", () => {
      pickerActivePanel = el.dataset.pickerPanel;
      routes.go(pickerActivePanel === "dashboard" ? "/" : `/${pickerActivePanel}`);
      paintPickerNav();
      renderPickerPanel(pickerActivePanel);
    });
  });
}

function paintPickerNav() {
  document.querySelectorAll("#picker-sidebar [data-picker-panel]").forEach(el => {
    el.classList.toggle("active", el.dataset.pickerPanel === pickerActivePanel);
  });
}

async function renderPickerPanel(panel, deepLink = {}) {
  const root = document.getElementById("picker-panel-root");
  if (panel === "my-tickets") return renderMyTicketsPanel(root);
  if (panel === "premium") return renderPremiumPanel(root);
  if (panel === "admin") return renderAdminPanel(root);
  if (panel === "docs") return renderDocsPanel(root, deepLink.docsModuleId || null);
  return renderDashboardPanel(root);
}

// ============================================================
// Documentation
// ============================================================
// Left-hand list: a fixed "Info" entry (general info + the Discord
// link + Terms/Privacy + the full variable reference) plus one entry
// per module that shipped a Documentation/<id>.doc.json — read
// straight from the same /modules manifest the dashboard sidebar uses,
// so a module with no doc file simply doesn't show up here rather
// than linking to a 404. A search box filters that list by name.
// Selecting "Info" or no scope at all is exactly what /docs (no
// module) and NEXORIA's /help command (no scope given) land on;
// picking a module matches /docs/<moduleId> and /help <module>.
let docsModulesCache = null;
async function loadDocsModuleList() {
  if (docsModulesCache) return docsModulesCache;
  try {
    const manifest = await api("/modules");
    docsModulesCache = (manifest.modules || []).filter(m => m.doc);
  } catch {
    docsModulesCache = [];
  }
  return docsModulesCache;
}

function prettifyModuleId(id) {
  return id.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

async function renderDocsPanel(root, initialModuleId) {
  root.innerHTML = `
    <h1 class="picker-heading">Documentation</h1>
    <p class="picker-sub">Guides, module references, and every variable NEXORIA supports.</p>
    <div class="docs-layout">
      <div class="docs-sidebar">
        <input type="text" class="search-input" id="docs-search" placeholder="Search modules…" style="margin-bottom:10px">
        <div id="docs-module-list">${loadingBlock("Loading modules…")}</div>
      </div>
      <div class="docs-content" id="docs-content">${loadingBlock("Loading…")}</div>
    </div>`;

  const modules = await loadDocsModuleList();
  const listEl = document.getElementById("docs-module-list");
  let activeId = initialModuleId && modules.some(m => m.id === initialModuleId) ? initialModuleId : null;

  function paintList(filter) {
    const q = (filter || "").toLowerCase();
    const items = [{ id: null, label: "Info" }, ...modules.map(m => ({ id: m.id, label: prettifyModuleId(m.id) }))]
      .filter(it => !q || it.label.toLowerCase().includes(q));
    listEl.innerHTML = items.map(it => `
      <button class="docs-sidebar-item ${activeId === it.id ? "active" : ""}" data-docs-id="${it.id || ""}">
        ${it.id ? icon("category-2", 16) : icon("help-circle", 16)} ${escapeHtml(it.label)}
      </button>`).join("") || `<div class="field-hint" style="padding:8px">No matches.</div>`;
    listEl.querySelectorAll("[data-docs-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        activeId = btn.dataset.docsId || null;
        routes.go(routes.docsUrl(activeId), true);
        paintList(document.getElementById("docs-search").value);
        paintContent();
      });
    });
  }

  async function paintContent() {
    const content = document.getElementById("docs-content");
    if (!activeId) { renderDocsInfoTab(content); return; }
    const mod = modules.find(m => m.id === activeId);
    content.innerHTML = loadingBlock("Loading documentation…");
    try {
      const doc = await fetch(`${CFG.LOCAL_BOT_URL}/modules-static/${mod.doc}`).then(r => r.json());
      const varsRes = await fetch(`${CFG.LOCAL_BOT_URL}/variables`).then(r => r.json()).catch(() => ({ variables: [] }));
      const relevantVars = (varsRes.variables || []).filter(v => !v.moduleId || v.moduleId === activeId);
      content.innerHTML = `
        <h2 style="margin-bottom:4px">${escapeHtml(doc.title || prettifyModuleId(activeId))}</h2>
        <p class="picker-sub" style="margin-bottom:20px">${escapeHtml(doc.summary || "")}</p>
        ${(doc.sections || []).map(s => `<div class="settings-section-block"><h4>${escapeHtml(s.heading || "")}</h4><p>${escapeHtml(s.body || "")}</p></div>`).join("")}
        ${renderVariableReference(relevantVars, `Variables for ${prettifyModuleId(activeId)}`)}`;
    } catch {
      content.innerHTML = `<div class="empty-state">${icon("document", 28)}Couldn't load this module's documentation right now.</div>`;
    }
  }

  document.getElementById("docs-search").addEventListener("input", (e) => paintList(e.target.value));
  paintList("");
  await paintContent();
}

function renderVariableReference(variables, heading = "All Variables") {
  const groups = {};
  variables.forEach(v => { (groups[v.group] = groups[v.group] || []).push(v); });
  const groupOrder = Object.keys(groups).sort();
  return `
    <div class="settings-section-block">
      <h4>${icon("variable", 16)} ${escapeHtml(heading)}</h4>
      <input type="text" class="search-input" id="docs-var-search" placeholder="Search variables…" style="margin:10px 0">
      <div id="docs-var-table">${groupOrder.map(g => renderVarGroup(g, groups[g])).join("")}</div>
    </div>`;
}
function renderVarGroup(group, vars) {
  return `
    <div class="docs-var-group" data-var-group>
      <div class="docs-var-group-label">${escapeHtml(group)}</div>
      ${vars.map(v => `
        <div class="docs-var-row" data-var-row data-var-search="${escapeHtml(v.key + " " + (v.description || ""))}">
          <code class="cc-command-trigger-chip">{${escapeHtml(v.key)}}</code>
          <span class="docs-var-desc">${escapeHtml(v.description || "")}</span>
        </div>`).join("")}
    </div>`;
}

function renderDocsInfoTab(content) {
  const discordUrl = CFG.DISCORD_SUPPORT_URL || "#";
  content.innerHTML = `
    <h2 style="margin-bottom:4px">Info</h2>
    <p class="picker-sub" style="margin-bottom:20px">General information about NEXORIA, plus the full list of variables usable anywhere they're supported.</p>
    <div class="settings-section-block">
      <h4><i class="ti ti-brand-discord" style="font-size:16px;vertical-align:-3px;margin-right:6px"></i>Support &amp; Suggestions</h4>
      <p>Join the official NEXORIA Discord server for help, updates, and to make suggestions — feature requests and feedback all happen there now.</p>
      <a class="btn btn-primary btn-small" href="${escapeHtml(discordUrl)}" target="_blank" rel="noopener" style="margin-top:8px;display:inline-flex"><i class="ti ti-brand-discord"></i> Join the Discord</a>
    </div>
    <div class="settings-section-block">
      <h4>${icon("shield-check", 16)} Legal</h4>
      <p><a href="terms.html" target="_blank" rel="noopener">Terms of Service</a> &nbsp;·&nbsp; <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a></p>
    </div>
    ${renderVariableReference([], "All Variables")}`;

  // The Info tab's reference always shows every variable, unscoped —
  // fetched separately here (rather than reusing renderVariableReference's
  // built-in fetch) since this tab has no single module to filter to.
  fetch(`${CFG.LOCAL_BOT_URL}/variables`).then(r => r.json()).then(d => {
    const table = document.getElementById("docs-var-table");
    if (!table) return;
    const groups = {};
    (d.variables || []).forEach(v => { (groups[v.group] = groups[v.group] || []).push(v); });
    table.innerHTML = Object.keys(groups).sort().map(g => renderVarGroup(g, groups[g])).join("");
    wireVarSearch();
  }).catch(() => {});
  wireVarSearch();
}

function wireVarSearch() {
  const input = document.getElementById("docs-var-search");
  if (!input) return;
  input.addEventListener("input", () => {
    const q = input.value.toLowerCase();
    document.querySelectorAll("[data-var-row]").forEach(row => {
      row.style.display = !q || row.dataset.varSearch.toLowerCase().includes(q) ? "" : "none";
    });
    document.querySelectorAll("[data-var-group]").forEach(group => {
      const anyVisible = Array.from(group.querySelectorAll("[data-var-row]")).some(r => r.style.display !== "none");
      group.style.display = anyVisible ? "" : "none";
    });
  });
}

async function renderDashboardPanel(root) {
  root.innerHTML = `
    <div class="dash-header">
      <div><h1 class="picker-heading">Your Servers</h1><p class="picker-sub">Manage tickets and settings for your Discord servers</p></div>
      <div class="dash-header-actions">
        <button class="btn btn-ghost btn-small" id="ds-refresh-btn"><i class="ti ti-refresh"></i> Refresh Servers</button>
        <a class="btn btn-primary btn-small" href="${inviteUrl()}" target="_blank" rel="noopener"><i class="ti ti-plus"></i> Add Bot</a>
      </div>
    </div>
    <div class="servers-search-row">
      <input type="text" class="search-input" id="ds-search" placeholder="Search servers…">
    </div>
    <p class="field-hint" id="ds-count" style="margin-bottom:14px">Loading…</p>
    <div class="server-grid" id="server-grid">${loadingBlock("Loading your servers…")}</div>`;

  const grid = document.getElementById("server-grid");
  const countEl = document.getElementById("ds-count");
  const session = getSession();
  let sorted = [];

  function cardHtml(g, hasBot) {
    const iconHtml = g.icon ? `<img src="https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png" alt="">` : initials(g.name);
    const roleBadge = g.owner ? `<span class="role-badge owner"><i class="ti ti-crown"></i> Owner</span>` : `<span class="role-badge admin"><i class="ti ti-shield"></i> Admin</span>`;
    return `
      <div class="server-card ${hasBot ? "" : "bot-absent"}" data-server-name="${escapeHtml(g.name.toLowerCase())}">
        <div class="server-icon">${iconHtml}</div>
        <div class="server-name">${escapeHtml(g.name)}</div>
        <div class="server-meta">${roleBadge} ${hasBot ? "" : "· Bot not added"}</div>
        <div class="server-card-actions">
          ${hasBot
            ? `<button class="btn btn-primary btn-small" data-open-dash="${g.id}" data-name="${escapeHtml(g.name)}" data-icon="${g.icon || ""}">Manage Server</button>`
            : `<a class="btn btn-primary btn-small" target="_blank" rel="noopener" href="${inviteUrl(g.id)}"><i class="ti ti-plus"></i> Begin setup</a>`}
        </div>
      </div>`;
  }

  function wireDashButtons() {
    grid.querySelectorAll("[data-open-dash]").forEach(btn => {
      btn.addEventListener("click", () => {
        currentGuild = { id: btn.dataset.openDash, name: btn.dataset.name, icon: btn.dataset.icon };
        routes.go(routes.moduleUrl(currentGuild.id, "ticket-tool"));
        enterDashboard("ticket-tool");
      });
    });
  }

  async function loadAndPaint() {
    const guilds = await fetchMyGuilds(session.token);
    const admin = guilds.filter(isAdmin);
    if (admin.length === 0) {
      grid.innerHTML = `<div class="empty-state"><i class="ti ti-folder-off glyph"></i>No servers found where you have Administrator permission.</div>`;
      countEl.textContent = "";
      return;
    }
    const botGuildIds = new Set((botInfoCache?.guilds || []).map(g => g.id));
    sorted = [...admin].sort((a, b) => {
      const aHas = botGuildIds.has(a.id), bHas = botGuildIds.has(b.id);
      if (aHas !== bHas) return aHas ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    const activeCount = sorted.filter(g => botGuildIds.has(g.id)).length;
    countEl.textContent = `${activeCount} active · ${sorted.length} available`;
    grid.innerHTML = sorted.map(g => cardHtml(g, botGuildIds.has(g.id))).join("");
    wireDashButtons();
  }

  try {
    await loadAndPaint();
  } catch (e) {
    grid.innerHTML = `<div class="empty-state"><i class="ti ti-alert-triangle glyph"></i>${escapeHtml(e.message || "Couldn't load your servers.")}<div style="margin-top:12px"><button class="btn btn-primary btn-small" id="ds-retry-btn">Try again</button></div></div>`;
    countEl.textContent = "";
    document.getElementById("ds-retry-btn")?.addEventListener("click", () => renderDashboardPanel(root));
    return;
  }

  document.getElementById("ds-search").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    grid.querySelectorAll(".server-card[data-server-name]").forEach(card => {
      card.style.display = card.dataset.serverName.includes(q) ? "" : "none";
    });
  });

  // #13: Refresh Servers — re-fetches guild membership and bot-presence
  // data and repaints the grid in place, without a full page reload.
  // The button shows a brief spinning-icon "working" state so it's
  // clear the click registered while the requests are in flight.
  const refreshBtn = document.getElementById("ds-refresh-btn");
  refreshBtn.addEventListener("click", async () => {
    refreshBtn.disabled = true;
    refreshBtn.classList.add("btn-refreshing");
    try {
      await refreshHeroStatus();
      await loadAndPaint();
    } catch (e) {
      await DCModal.alert(`Couldn't refresh servers: ${e.message}`);
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.classList.remove("btn-refreshing");
    }
  });
}

function renderPremiumPanel(root) {
  root.innerHTML = `
    <h1 class="picker-heading">Premium</h1>
    <p class="picker-sub">Unlock higher limits and advanced features across every server.</p>
    <div class="empty-state"><i class="ti ti-crown glyph"></i>Premium plans aren't set up yet — check back soon.</div>`;
}

// ============================================================
// Admin panel
// ============================================================
const ADMIN_TOKEN_KEY = "tk_admin_token";
function getAdminToken() { return localStorage.getItem(ADMIN_TOKEN_KEY); }
function setAdminToken(t) { t ? localStorage.setItem(ADMIN_TOKEN_KEY, t) : localStorage.removeItem(ADMIN_TOKEN_KEY); }
async function adminApi(path, options = {}) {
  let res;
  try {
    res = await fetch(`${CFG.LOCAL_BOT_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", "X-Admin-Token": getAdminToken() || "", ...(options.headers || {}) },
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError";
    throw new Error(timedOut
      ? "The bot didn't respond in time — check that it's running and your tunnel is up."
      : "Couldn't reach the bot — check that it's running and your tunnel is up.");
  }
  if (res.status === 401) { setAdminToken(null); throw new Error("Session expired — please log in again"); }
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).error; } catch { /* not JSON — fall back below */ }
    throw new Error(detail || `Request failed (HTTP ${res.status}). The bot may need to be restarted — check its console output.`);
  }
  return res.json();
}

async function renderAdminPanel(root) {
  root.innerHTML = `<h1 class="picker-heading">Admin Panel</h1><p class="picker-sub">Loading…</p>`;
  if (!botInfoCache) {
    root.innerHTML = `<h1 class="picker-heading">Admin Panel</h1><div class="empty-state"><i class="ti ti-plug-connected-x glyph"></i>Bot Servers down — the admin panel needs a live connection.</div>`;
    return;
  }
  const token = getAdminToken();
  if (!token) { paintAdminLogin(root); return; }
  try {
    const session = await adminApi("/admin/session");
    paintAdminDashboard(root, session);
  } catch {
    paintAdminLogin(root);
  }
}

function paintAdminLogin(root) {
  root.innerHTML = `
    <h1 class="picker-heading">Admin Panel</h1>
    <p class="picker-sub">Sign in with the shared admin credentials. Your Discord account also needs to be granted access.</p>
    <div class="config-section" style="max-width:380px">
      <div class="field"><label>Username</label><input type="text" id="admin-username" autocomplete="username" placeholder="Username"></div>
      <div class="field"><label>Password</label><input type="text" id="admin-password" autocomplete="username" placeholder="Password" class="admin-password-as-username"></div>
      <div class="field-hint" id="admin-login-error" style="color:var(--red);display:none"></div>
      <button class="btn btn-primary btn-small" id="admin-login-btn" style="margin-top:6px">Log in</button>
    </div>`;
  document.getElementById("admin-login-btn").addEventListener("click", async () => {
    const username = document.getElementById("admin-username").value.trim();
    const password = document.getElementById("admin-password").value;
    const errEl = document.getElementById("admin-login-error");
    errEl.style.display = "none";
    try {
      const session = getSession();
      const loginResult = await adminApi("/admin/login", { method: "POST", body: JSON.stringify({ username, password, discordUserId: session.user.id }) });
      setAdminToken(loginResult.token);
      renderAdminPanel(document.getElementById("picker-panel-root"));
    } catch (e) {
      errEl.textContent = e.message;
      errEl.style.display = "block";
    }
  });
}

async function paintAdminDashboard(root, session) {
  root.innerHTML = `
    <div class="dash-header">
      <div><h1 class="picker-heading">Admin Panel</h1><p class="picker-sub">${session.isOwner ? "Signed in as the bot owner." : "Signed in with granted admin access."}</p></div>
      <button class="btn btn-ghost btn-small" id="admin-logout-btn"><i class="ti ti-logout"></i> Log out</button>
    </div>
    <div class="config-section">
      <h3>Server access</h3>
      <div class="hint">Choose whether every server the bot is in may use it, or only servers you explicitly allow.</div>
      <div class="config-row" style="margin-bottom:4px">
        <span class="config-row-label">Restrict to an allow-list</span>
        <button class="toggle" id="admin-allowmode-toggle" aria-label="Toggle allow-list mode"></button>
      </div>
      <div id="admin-guilds-section"></div>
    </div>
    <div class="config-section" style="margin-top:18px">
      <div class="dash-header" style="margin-bottom:4px">
        <h3 style="margin:0">Ticket search</h3>
        <button class="btn btn-ghost btn-small" id="admin-ticket-refresh-btn"><i class="ti ti-refresh"></i> Refresh Tickets</button>
      </div>
      <div class="hint">Find any ticket across every server by its number, subject, or who opened/claimed/closed it.</div>
      <input type="text" class="search-input" id="admin-ticket-search" placeholder="Search by ticket number, subject, or user…" style="width:100%;margin-bottom:10px">
      <div id="admin-ticket-search-results"></div>
    </div>
    ${session.isOwner ? `
    <div class="config-section" style="margin-top:18px">
      <h3>Granted admins</h3>
      <div class="hint">Discord user ids that can log into this panel, in addition to you as the owner. Numbers only.</div>
      <div class="field-row-inline" style="margin-bottom:10px">
        <input type="text" id="admin-add-userid" placeholder="Discord user id (numbers only)" inputmode="numeric" style="flex:1">
        <button class="btn btn-primary btn-small" id="admin-add-btn">Grant access</button>
      </div>
      <div class="field-hint" id="admin-add-error" style="display:none;color:var(--red);margin-bottom:8px"></div>
      <div id="admin-admins-list">${loadingBlock()}</div>
    </div>` : ""}`;

  document.getElementById("admin-logout-btn").addEventListener("click", async () => {
    try { await adminApi("/admin/logout", { method: "POST" }); } catch {}
    setAdminToken(null);
    renderAdminPanel(root);
  });

  await paintAdminGuildsSection();
  wireAdminTicketSearch();
  if (session.isOwner) await paintAdminAdminsList();
}

async function paintAdminGuildsSection() {
  const section = document.getElementById("admin-guilds-section");
  const toggle = document.getElementById("admin-allowmode-toggle");
  try {
    const result = await adminApi("/admin/guilds");
    const isAllowlist = result.allowMode === "allowlist";
    toggle.classList.toggle("on", isAllowlist);

    if (!isAllowlist) {
      section.innerHTML = `<div class="field-hint" style="margin-top:10px"><i class="ti ti-info-circle"></i> Every server the bot is in may currently use it. Turn the toggle on to restrict access to specific servers.</div>`;
    } else {
      section.innerHTML = `
        <div style="margin-top:10px">
          <div class="field-row-inline" style="margin-bottom:10px">
            <input type="text" id="admin-add-guildid" placeholder="Server id (numbers only)" inputmode="numeric" style="flex:1">
            <button class="btn btn-primary btn-small" id="admin-add-guild-btn">Grant server</button>
          </div>
          <div class="field-hint" id="admin-add-guild-error" style="display:none;color:var(--red);margin-bottom:8px"></div>
          <div id="admin-guilds-list">${loadingBlock()}</div>
        </div>`;
      await paintAdminGuildsList(result);
      document.getElementById("admin-add-guild-btn").addEventListener("click", async () => {
        const input = document.getElementById("admin-add-guildid");
        const errEl = document.getElementById("admin-add-guild-error");
        errEl.style.display = "none";
        const guildId = input.value.trim();
        try {
          await adminApi("/admin/guilds", { method: "POST", body: JSON.stringify({ guildId }) });
          input.value = "";
          await paintAdminGuildsSection();
        } catch (e) { errEl.textContent = e.message; errEl.style.display = "block"; }
      });
    }

    toggle.addEventListener("click", async () => {
      const newMode = isAllowlist ? "all" : "allowlist";
      try { await adminApi("/admin/guilds-mode", { method: "PUT", body: JSON.stringify({ allowMode: newMode }) }); await paintAdminGuildsSection(); }
      catch (e) { await DCModal.alert(`Couldn't update: ${e.message}`); }
    }, { once: true });
  } catch (e) {
    section.innerHTML = `<div class="empty-state">Couldn't load servers: ${escapeHtml(e.message)}</div>`;
  }
}

async function paintAdminGuildsList(guildsResult) {
  const slot = document.getElementById("admin-guilds-list");
  const allowedGuildIds = guildsResult.allowedGuildIds;
  const knownGuilds = guildsResult.knownGuilds;
  if (knownGuilds.length === 0) { slot.innerHTML = `<div class="empty-state">The bot isn't in any servers yet.</div>`; return; }
  const allowedKnown = knownGuilds.filter(g => allowedGuildIds.includes(g.id));
  const allowedUnknownIds = allowedGuildIds.filter(id => !knownGuilds.some(g => g.id === id));
  slot.innerHTML = `
    ${allowedKnown.map(g => `
    <div class="config-row">
      <span class="config-row-label" style="display:flex;align-items:center;gap:8px">
        ${g.icon ? `<img src="https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png" style="width:22px;height:22px;border-radius:6px" alt="">` : `<span class="server-icon" style="width:22px;height:22px;font-size:9px;margin:0">${initials(g.name)}</span>`}
        ${escapeHtml(g.name)}
      </span>
      <button class="btn btn-ghost btn-small" data-guild-revoke="${g.id}"><i class="ti ti-x"></i> Remove</button>
    </div>`).join("")}
    ${allowedUnknownIds.map(id => `
    <div class="config-row">
      <span class="config-row-label" style="display:flex;align-items:center;gap:8px"><span class="server-icon" style="width:22px;height:22px;font-size:9px;margin:0">?</span>${escapeHtml(id)} <span class="field-hint">(bot not in this server)</span></span>
      <button class="btn btn-ghost btn-small" data-guild-revoke="${id}"><i class="ti ti-x"></i> Remove</button>
    </div>`).join("")}
    ${allowedKnown.length === 0 && allowedUnknownIds.length === 0 ? `<div class="empty-state">No servers granted yet — every server is currently blocked until you add one.</div>` : ""}`;
  slot.querySelectorAll("[data-guild-revoke]").forEach(btn => btn.addEventListener("click", async () => {
    try { await adminApi(`/admin/guilds/${btn.dataset.guildRevoke}`, { method: "DELETE" }); await paintAdminGuildsSection(); }
    catch (e) { await DCModal.alert(`Couldn't update: ${e.message}`); }
  }));
}

async function paintAdminAdminsList() {
  const slot = document.getElementById("admin-admins-list");
  const addBtn = document.getElementById("admin-add-btn");
  const errEl = document.getElementById("admin-add-error");
  if (addBtn) addBtn.addEventListener("click", async () => {
    const input = document.getElementById("admin-add-userid");
    const userId = input.value.trim();
    errEl.style.display = "none";
    if (!userId) return;
    try { await adminApi("/admin/admins", { method: "POST", body: JSON.stringify({ userId }) }); input.value = ""; await paintAdminAdminsList(); }
    catch (e) { errEl.textContent = e.message; errEl.style.display = "block"; }
  });
  try {
    const adminsResult = await adminApi("/admin/admins");
    const ownerUserId = adminsResult.ownerUserId;
    const grantedUserIds = adminsResult.grantedUserIds;
    const profiles = adminsResult.profiles || {};
    const rowHtml = (id, isOwner) => {
      const p = profiles[id] || { displayName: id, avatarUrl: null };
      return `
        <div class="config-row">
          <span class="config-row-label" style="display:flex;align-items:center;gap:8px">
            <img src="${p.avatarUrl || `https://cdn.discordapp.com/embed/avatars/0.png`}" alt="" style="width:26px;height:26px;border-radius:50%;border:1px solid var(--panel-border)">
            <span>${escapeHtml(p.displayName)}<div class="field-hint" style="margin-top:1px">${escapeHtml(id)}</div></span>
          </span>
          ${isOwner ? `<span class="badge badge-open">Owner</span>` : `<button class="btn btn-ghost btn-small" data-revoke-admin="${id}"><i class="ti ti-x"></i> Revoke</button>`}
        </div>`;
    };
    slot.innerHTML = rowHtml(ownerUserId, true) + grantedUserIds.map(id => rowHtml(id, false)).join("");
    slot.querySelectorAll("[data-revoke-admin]").forEach(btn => btn.addEventListener("click", async () => {
      const ok = await DCModal.confirm("Revoke this admin's access to the panel?", { title: "Revoke access", confirmLabel: "Revoke", danger: true });
      if (!ok) return;
      try { await adminApi(`/admin/admins/${btn.dataset.revokeAdmin}`, { method: "DELETE" }); await paintAdminAdminsList(); }
      catch (e) { await DCModal.alert(`Couldn't revoke: ${e.message}`); }
    }));
  } catch (e) {
    slot.innerHTML = `<div class="empty-state">Couldn't load admins: ${escapeHtml(e.message)}</div>`;
  }
}

// Renders the Admin Panel's inline ticket detail view (#6: opened
// directly inside the Admin Panel, never redirecting the admin out to
// My Tickets) including the viewers list (#7).
async function openAdminTicketDetail(guildId, ticketId) {
  const root = document.getElementById("picker-panel-root");
  root.innerHTML = `
    <button class="btn btn-ghost btn-small" id="admin-ticket-back"><i class="ti ti-arrow-left"></i> Back to Admin Panel</button>
    <div id="admin-ticket-detail-body" style="margin-top:16px">${loadingBlock("Loading ticket…")}</div>`;
  document.getElementById("admin-ticket-back").addEventListener("click", () => renderAdminPanel(root));
  const body = document.getElementById("admin-ticket-detail-body");
  try {
    const data = await adminApi(`/admin/guilds/${guildId}/tickets/${ticketId}`);
    paintAdminTicketDetail(body, guildId, ticketId, data);
  } catch (e) {
    body.innerHTML = `<div class="empty-state"><i class="ti ti-alert-triangle glyph"></i>Couldn't load this ticket: ${escapeHtml(e.message)}</div>`;
  }
}

function userDisplayHtml(profile, fallbackId) {
  const name = profile?.displayName || profile?.username || fallbackId || "Unknown";
  const avatar = profile?.avatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png";
  return `<span class="user-display"><img class="user-display-avatar" src="${escapeHtml(avatar)}" alt=""><span class="user-display-name">${escapeHtml(name)}</span></span>`;
}

function paintAdminTicketDetail(body, guildId, ticketId, data) {
  const { ticket, messages, viewers, opener } = data;
  body.innerHTML = `
    <div class="ticket-panel-card">
      <div class="ticket-panel-card-header">
        <span class="ticket-panel-card-title">${escapeHtml(ticket.subject || "No subject")} <span class="field-hint" style="font-weight:400">#${escapeHtml(String(ticket.number ?? ticket.id))}</span></span>
        <span class="badge badge-${ticket.status}">${ticket.status}</span>
      </div>
      <div class="ticket-panel-card-body">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><span class="ticket-info-label" style="margin-bottom:0">Author</span> ${userDisplayHtml(opener, ticket.openedById)}</div>
        ${messages.length === 0
          ? `<div class="empty-state"><i class="ti ti-message-off glyph"></i>No messages were sent in this ticket.</div>`
          : messages.map(m => `
            <div class="msg-container">
              <img class="msg-container-avatar" src="${m.authorAvatar ? escapeHtml(m.authorAvatar) : "https://cdn.discordapp.com/embed/avatars/0.png"}" alt="">
              <div class="msg-container-body">
                <div class="msg-container-meta">
                  <span class="msg-container-author">${escapeHtml(m.authorName)}</span>
                  ${m.authorIsStaff ? `<span class="staff-tag">STAFF</span>` : ""}
                  <span class="msg-container-time">${new Date(m.createdAt).toLocaleString()}</span>
                </div>
                <div class="msg-container-content">${escapeHtml(m.content) || `<span class="field-hint">(no text content)</span>`}</div>
              </div>
            </div>`).join("")}
      </div>
    </div>
    <div class="ticket-panel-card">
      <div class="ticket-panel-card-header"><span class="ticket-panel-card-title"><i class="ti ti-eye"></i> Viewers</span></div>
      <div class="ticket-panel-card-body">
        ${viewers.length === 0 ? `<div class="empty-state">No one has viewed this ticket yet.</div>` : `
          <div class="ticket-viewers-list">
            ${viewers.map(v => `
              <div class="ticket-viewer-row">
                ${userDisplayHtml(v, v.userId)}
                <span class="ticket-viewer-time">${new Date(v.viewedAt).toLocaleString()}</span>
              </div>`).join("")}
          </div>`}
      </div>
    </div>`;
}

function wireAdminTicketSearch() {
  const input = document.getElementById("admin-ticket-search");
  const resultsSlot = document.getElementById("admin-ticket-search-results");
  let debounceTimer = null;
  async function runSearch() {
    resultsSlot.innerHTML = loadingBlock("Searching…");
    try {
      const d = await api(`/admin/tickets/search?q=${encodeURIComponent(input.value.trim())}`);
      paintAdminTicketSearchResults(d.tickets || []);
    } catch (e) {
      resultsSlot.innerHTML = `<div class="empty-state">Couldn't search: ${escapeHtml(e.message)}</div>`;
    }
  }
  function paintAdminTicketSearchResults(tickets) {
    if (tickets.length === 0) { resultsSlot.innerHTML = `<div class="empty-state">No tickets found.</div>`; return; }
    resultsSlot.innerHTML = `
      <div class="ticket-table">
        <div class="ticket-row head" style="grid-template-columns:70px 1fr 1fr 100px 120px"><span>#</span><span>Server</span><span>Subject</span><span>Status</span><span>Created</span></div>
        ${tickets.slice(0, 50).map(t => `
          <div class="ticket-row ticket-row-clickable" style="grid-template-columns:70px 1fr 1fr 100px 120px" data-admin-ticket="${t.guildId}:${t.id}">
            <span>${escapeHtml(String(t.number ?? t.id))}</span>
            <span>${escapeHtml(t.guildName || "Unknown")}</span>
            <span>${escapeHtml(t.subject || "—")}</span>
            <span class="badge badge-${t.status}">${t.status}</span>
            <span>${timeAgoGlobal(t.createdAt)}</span>
          </div>`).join("")}
      </div>`;
    resultsSlot.querySelectorAll("[data-admin-ticket]").forEach(row => row.addEventListener("click", () => {
      const [guildId, ticketId] = row.dataset.adminTicket.split(":");
      openAdminTicketDetail(guildId, ticketId);
    }));
  }
  input.addEventListener("input", () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(runSearch, 300); });
  // #14: Refresh Tickets in the Admin Panel — re-runs the current
  // search (or the default unfiltered list) in place.
  const refreshBtn = document.getElementById("admin-ticket-refresh-btn");
  if (refreshBtn) refreshBtn.addEventListener("click", async () => {
    refreshBtn.disabled = true;
    refreshBtn.classList.add("btn-refreshing");
    try { await runSearch(); }
    finally { refreshBtn.disabled = false; refreshBtn.classList.remove("btn-refreshing"); }
  });
  runSearch();
}

// ============================================================
// My Tickets — filter chips (status/server/subject/date range), a
// columns toggle, and a detail page with an Author/Created/Subject/
// Closed-By info panel plus claim/share-link controls.
// ============================================================
// #9: "Opened By" removed from the My Tickets table — the whole list
// already belongs to the logged-in user, so it added no information.
// It's kept inside the ticket detail view itself (see the Author row in
// paintTicketDetailBody below). Column order/set now fixed to match the
// reference exactly: Server, Subject, Content, Status, Created.
const MY_TICKETS_COLUMNS = ["server", "subject", "content", "status", "created"];
const MY_TICKETS_COLUMN_LABELS = { server: "Server", subject: "Subject", content: "Content", status: "Status", created: "Created" };

async function renderMyTicketsPanel(root) {
  root.innerHTML = `
    <div class="dash-header">
      <div><h1 class="picker-heading">My Tickets</h1><p class="picker-sub" id="my-tickets-count">Loading…</p></div>
      <div class="dash-header-actions">
        <button class="btn btn-ghost btn-small" id="mt-refresh-btn"><i class="ti ti-refresh"></i> Refresh Tickets</button>
      </div>
    </div>
    <p class="field-hint" style="margin-bottom:10px">Use filters below to refine results</p>
    <div class="ticket-toolbar">
      <input type="text" class="search-input" id="mt-search" placeholder="Search tickets…">
      <div class="dropdown-anchor">
        <button class="btn btn-ghost btn-small" id="mt-status-btn">All Status <i class="ti ti-chevron-down"></i></button>
        <div class="dropdown-panel-floating" id="mt-status-panel" style="display:none">
          <div class="dropdown-panel-item" data-mt-status="">All Status</div>
          <div class="dropdown-panel-item" data-mt-status="open">Active</div>
          <div class="dropdown-panel-item" data-mt-status="closed">Closed</div>
        </div>
      </div>
      <div class="dropdown-anchor">
        <button class="btn btn-ghost btn-small" id="mt-server-btn">Server <i class="ti ti-chevron-down"></i></button>
        <div class="dropdown-panel-floating" id="mt-server-panel" style="display:none">
          <input type="text" class="dropdown-panel-search" id="mt-server-search" placeholder="Search tickets...">
          <div id="mt-server-options"></div>
        </div>
      </div>
      <div class="dropdown-anchor">
        <button class="btn btn-ghost btn-small" id="mt-subject-btn">Subject <i class="ti ti-chevron-down"></i></button>
        <div class="dropdown-panel-floating" id="mt-subject-panel" style="display:none">
          <input type="text" class="dropdown-panel-search" id="mt-subject-search" placeholder="Search subjects...">
          <div id="mt-subject-options"></div>
        </div>
      </div>
      <div class="dropdown-anchor">
        <button class="btn btn-ghost btn-small" id="mt-date-btn"><i class="ti ti-calendar"></i> Date range</button>
        <div class="dropdown-panel-floating" id="mt-date-panel" style="display:none"></div>
      </div>
    </div>
    <div id="my-tickets-list">${loadingBlock()}</div>`;

  const session = getSession();
  let tickets = [];
  async function loadTickets() {
    tickets = (await api(`/tickets?userId=${session.user.id}`)).tickets || [];
  }
  try {
    await loadTickets();
  } catch (e) {
    document.getElementById("my-tickets-list").innerHTML = `<div class="empty-state"><i class="ti ti-alert-triangle glyph"></i>Couldn't load your tickets: ${escapeHtml(e.message)}</div>`;
    document.getElementById("my-tickets-count").textContent = "";
    return;
  }
  document.getElementById("my-tickets-count").textContent = `~${tickets.length} ticket${tickets.length === 1 ? "" : "s"} found`;

  const filters = { query: "", status: "", server: "", subject: "", dateFrom: null, dateTo: null };
  function applyFiltersAndPaint() {
    let rows = tickets;
    if (filters.query) { const q = filters.query.toLowerCase(); rows = rows.filter(t => (t.subject || "").toLowerCase().includes(q) || (t.guildName || "").toLowerCase().includes(q)); }
    if (filters.status) rows = rows.filter(t => (filters.status === "open" ? t.status !== "closed" : t.status === "closed"));
    if (filters.server) rows = rows.filter(t => t.guildName === filters.server);
    if (filters.subject) rows = rows.filter(t => t.subject === filters.subject);
    if (filters.dateFrom) rows = rows.filter(t => new Date(t.createdAt) >= filters.dateFrom);
    if (filters.dateTo) rows = rows.filter(t => new Date(t.createdAt) <= filters.dateTo);
    paintMyTicketsList(rows, tickets);
  }

  document.getElementById("mt-search").addEventListener("input", (e) => { filters.query = e.target.value; applyFiltersAndPaint(); });

  wireFloatingDropdown("mt-status-btn", "mt-status-panel");
  document.querySelectorAll("[data-mt-status]").forEach(item => item.addEventListener("click", () => {
    filters.status = item.dataset.mtStatus;
    document.getElementById("mt-status-btn").innerHTML = `${item.textContent} <i class="ti ti-chevron-down"></i>`;
    closeAllFloatingDropdowns();
    applyFiltersAndPaint();
  }));

  wireFloatingDropdown("mt-server-btn", "mt-server-panel");
  function uniqueServersNow() { return [...new Set(tickets.map(t => t.guildName).filter(Boolean))]; }
  function paintServerOptions(query) {
    const q = (query || "").toLowerCase();
    const opts = uniqueServersNow().filter(s => s.toLowerCase().includes(q));
    document.getElementById("mt-server-options").innerHTML = opts.map(s => `<div class="dropdown-panel-item" data-mt-server-opt="${escapeHtml(s)}">${escapeHtml(s)}</div>`).join("") || `<div class="dropdown-panel-empty">No matches</div>`;
    document.querySelectorAll("[data-mt-server-opt]").forEach(item => item.addEventListener("click", () => {
      filters.server = item.dataset.mtServerOpt;
      document.getElementById("mt-server-btn").innerHTML = `${escapeHtml(filters.server)} <i class="ti ti-chevron-down"></i>`;
      closeAllFloatingDropdowns();
      applyFiltersAndPaint();
    }));
  }
  paintServerOptions("");
  document.getElementById("mt-server-search").addEventListener("input", (e) => paintServerOptions(e.target.value));

  wireFloatingDropdown("mt-subject-btn", "mt-subject-panel");
  function uniqueSubjectsNow() { return [...new Set(tickets.map(t => t.subject).filter(Boolean))]; }
  function paintSubjectOptions(query) {
    const q = (query || "").toLowerCase();
    const opts = uniqueSubjectsNow().filter(s => s.toLowerCase().includes(q));
    document.getElementById("mt-subject-options").innerHTML = opts.map(s => `<div class="dropdown-panel-item" data-mt-subject-opt="${escapeHtml(s)}">${escapeHtml(s)}</div>`).join("") || `<div class="dropdown-panel-empty">No matches</div>`;
    document.querySelectorAll("[data-mt-subject-opt]").forEach(item => item.addEventListener("click", () => {
      filters.subject = item.dataset.mtSubjectOpt;
      document.getElementById("mt-subject-btn").innerHTML = `${escapeHtml(filters.subject)} <i class="ti ti-chevron-down"></i>`;
      closeAllFloatingDropdowns();
      applyFiltersAndPaint();
    }));
  }
  paintSubjectOptions("");
  document.getElementById("mt-subject-search").addEventListener("input", (e) => paintSubjectOptions(e.target.value));

  wireFloatingDropdown("mt-date-btn", "mt-date-panel");
  paintDateRangePicker(document.getElementById("mt-date-panel"), (from, to) => {
    filters.dateFrom = from; filters.dateTo = to;
    closeAllFloatingDropdowns();
    applyFiltersAndPaint();
  });

  // #14: Refresh Tickets — reloads the ticket list in place (re-fetch +
  // repaint) without touching filters, scroll position, or the rest of
  // the dashboard/page around it.
  const refreshBtn = document.getElementById("mt-refresh-btn");
  refreshBtn.addEventListener("click", async () => {
    refreshBtn.disabled = true;
    refreshBtn.classList.add("btn-refreshing");
    try {
      await loadTickets();
      document.getElementById("my-tickets-count").textContent = `~${tickets.length} ticket${tickets.length === 1 ? "" : "s"} found`;
      applyFiltersAndPaint();
    } catch (e) {
      await DCModal.alert(`Couldn't refresh tickets: ${e.message}`);
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.classList.remove("btn-refreshing");
    }
  });

  applyFiltersAndPaint();
}

function closeAllFloatingDropdowns() {
  document.querySelectorAll(".dropdown-panel-floating").forEach(p => { p.style.display = "none"; });
}
function wireFloatingDropdown(btnId, panelId) {
  const btn = document.getElementById(btnId);
  const panel = document.getElementById(panelId);
  if (!btn || !panel) return;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = panel.style.display !== "none";
    closeAllFloatingDropdowns();
    panel.style.display = isOpen ? "none" : "block";
  });
  panel.addEventListener("click", (e) => e.stopPropagation());
}
document.addEventListener("click", () => closeAllFloatingDropdowns());

function paintDateRangePicker(panel, onPick) {
  const now = new Date();
  let viewMonth = now.getMonth();
  let viewYear = now.getFullYear();
  let rangeStart = null, rangeEnd = null;

  function render() {
    const first = new Date(viewYear, viewMonth, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let cells = "";
    for (let i = 0; i < startWeekday; i++) cells += `<span class="dc-cal-cell dc-cal-empty"></span>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const thisDate = new Date(viewYear, viewMonth, d);
      const isSelected = (rangeStart && thisDate.getTime() === rangeStart.getTime()) || (rangeEnd && thisDate.getTime() === rangeEnd.getTime());
      const inRange = rangeStart && rangeEnd && thisDate > rangeStart && thisDate < rangeEnd;
      cells += `<span class="dc-cal-cell ${isSelected ? "selected" : ""} ${inRange ? "in-range" : ""}" data-cal-day="${d}">${d}</span>`;
    }
    panel.innerHTML = `
      <div class="dc-cal-header">
        <button class="icon-btn" id="dc-cal-prev"><i class="ti ti-chevron-left"></i></button>
        <span>${monthNames[viewMonth]} ${viewYear}</span>
        <button class="icon-btn" id="dc-cal-next"><i class="ti ti-chevron-right"></i></button>
      </div>
      <div class="dc-cal-grid">${["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => `<span class="dc-cal-dow">${d}</span>`).join("")}${cells}</div>
      <div class="dc-cal-footer">
        <button class="btn btn-ghost btn-small" id="dc-cal-clear">Clear</button>
        <button class="btn btn-primary btn-small" id="dc-cal-apply">Apply</button>
      </div>`;
    panel.querySelector("#dc-cal-prev").addEventListener("click", () => { viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } render(); });
    panel.querySelector("#dc-cal-next").addEventListener("click", () => { viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } render(); });
    panel.querySelectorAll("[data-cal-day]").forEach(cell => cell.addEventListener("click", () => {
      const d = new Date(viewYear, viewMonth, Number(cell.dataset.calDay));
      if (!rangeStart || (rangeStart && rangeEnd)) { rangeStart = d; rangeEnd = null; }
      else if (d < rangeStart) { rangeEnd = rangeStart; rangeStart = d; }
      else { rangeEnd = d; }
      render();
    }));
    panel.querySelector("#dc-cal-clear").addEventListener("click", () => { rangeStart = null; rangeEnd = null; onPick(null, null); });
    panel.querySelector("#dc-cal-apply").addEventListener("click", () => onPick(rangeStart, rangeEnd || rangeStart));
  }
  render();
}

// Shared "opened by" preview cell — avatar, display name, and the raw
// Discord user id in small dim text underneath. Used inside a ticket's
// own detail view (#9 keeps this there) and the Ticket Tool module's
// own staff-facing ticket list, so both show who opened a ticket the
// same way.
function openerPreviewHtml(t) {
  const opener = t.opener;
  const displayName = opener?.displayName || t.openedBy || "Unknown";
  const userId = opener?.id || t.openedById || "";
  const avatar = opener?.avatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png";
  return `
    <span class="opener-preview">
      <img class="opener-preview-avatar" src="${escapeHtml(avatar)}" alt="">
      <span class="opener-preview-text">
        <span class="opener-preview-name">${escapeHtml(displayName)}</span>
        ${userId ? `<span class="opener-preview-id">${escapeHtml(userId)}</span>` : ""}
      </span>
    </span>`;
}

function paintMyTicketsList(rows, allTickets) {
  const list = document.getElementById("my-tickets-list");
  if (rows.length === 0) {
    list.innerHTML = `<div class="empty-state"><i class="ti ti-ticket-off glyph"></i>${allTickets.length === 0 ? "You haven't opened any tickets yet." : "No tickets match."}</div>`;
    return;
  }
  // #9: fixed column set/order — Server, Subject, Content, Status,
  // Created — no "Opened By" column and no per-user column toggle
  // (removed along with it, since it existed mainly to hide/show that
  // column).
  const cols = MY_TICKETS_COLUMNS;
  const colWidths = { server: "1fr", subject: "1fr", content: "1.6fr", status: "100px", created: "120px" };
  const gridTemplate = cols.map(c => colWidths[c]).join(" ");
  const colLabel = MY_TICKETS_COLUMN_LABELS;
  const cellHtml = {
    server: (t) => `<span style="display:flex;align-items:center;gap:8px">${t.guildIcon ? `<img src="https://cdn.discordapp.com/icons/${t.guildId}/${t.guildIcon}.png" style="width:20px;height:20px;border-radius:6px" alt="">` : `<span class="server-icon" style="width:20px;height:20px;font-size:9px;margin:0">${initials(t.guildName || "?")}</span>`} ${escapeHtml(t.guildName || "Unknown server")}</span>`,
    subject: (t) => `<span class="cc-trigger-chip" style="background:rgba(139,92,246,.14);color:var(--violet);border-color:rgba(139,92,246,.3)">${escapeHtml(t.subject || "No subject")}</span>`,
    content: (t) => escapeHtml((t.messages && t.messages[0]?.content) || "—").slice(0, 80),
    status: (t) => `<span class="badge badge-${t.status}">${t.status}</span>`,
    created: (t) => timeAgoGlobal(t.createdAt),
  };
  list.innerHTML = `
    <div class="ticket-table">
      <div class="ticket-row head" style="grid-template-columns:${gridTemplate}">${cols.map(c => `<span>${colLabel[c]}</span>`).join("")}</div>
      ${rows.map(t => `
        <div class="ticket-row ticket-row-clickable" style="grid-template-columns:${gridTemplate}" data-my-ticket="${t.guildId}:${t.id}">
          ${cols.map(c => `<span>${cellHtml[c](t)}</span>`).join("")}
        </div>`).join("")}
    </div>`;
  list.querySelectorAll("[data-my-ticket]").forEach(row => row.addEventListener("click", () => {
    const [guildId, ticketId] = row.dataset.myTicket.split(":");
    openMyTicketDetail(guildId, ticketId);
  }));
}

async function openMyTicketDetail(guildId, ticketId, updateUrl = true) {
  if (updateUrl) routes.go(routes.myTicketUrl(guildId, ticketId));
  const root = document.getElementById("picker-panel-root");
  root.innerHTML = `
    <button class="btn btn-ghost btn-small" id="mt-back"><i class="ti ti-arrow-left"></i> Back to Tickets</button>
    <div id="mt-detail-body" style="margin-top:16px">${loadingBlock("Loading ticket…")}</div>`;
  document.getElementById("mt-back").addEventListener("click", () => { routes.go("/my-tickets"); renderMyTicketsPanel(root); });
  await paintTicketDetailBody(document.getElementById("mt-detail-body"), guildId, ticketId);
}

// Shared ticket-detail renderer (used by both My Tickets and a module's
// own ticket view) — the info panel (Author/Created/Subject/Closed By),
// claimed/unclaimed state, share-link controls, and the transcript.
//
// #5: every call now identifies the requester (the logged-in user) so
// the backend's authorizeTicketAccess() can enforce "owner or staff
// only" server-side — a denial here renders the same empty-state UI a
// 404 would, rather than silently falling back to showing the ticket
// anyway.
async function paintTicketDetailBody(body, guildId, ticketId) {
  const session = getSession();
  let data;
  try { data = await api(`/guilds/${guildId}/tickets/${ticketId}/transcript?requesterId=${session?.user?.id || ""}`); }
  catch (e) {
    body.innerHTML = `<div class="empty-state"><i class="ti ti-lock-off glyph"></i>${escapeHtml(e.message || "Couldn't load this ticket.")}</div>`;
    return;
  }
  const { ticket, messages, hasLog, opener, claimer, closer } = data;
  body.innerHTML = `
    <div class="ticket-detail-layout">
      <div class="ticket-detail-main">
        <h3 style="font-size:16px;font-weight:700">${escapeHtml(ticket.subject || "No subject")} <span class="field-hint" style="font-weight:400">#${escapeHtml(String(ticket.number ?? ticket.id))}</span></h3>
        <div class="field-hint" style="margin:6px 0 14px"><span class="badge badge-${ticket.status}">${ticket.status}</span> · ${escapeHtml(ticket.subject || "General")} · Created ${timeAgoGlobal(ticket.createdAt)}</div>
        <div class="transcript-body" style="max-height:60vh">
          ${!hasLog
            ? `<div class="empty-state"><i class="ti ti-message-off glyph"></i>No message log available for this ticket.</div>`
            : messages.length === 0
              ? `<div class="empty-state"><i class="ti ti-message-off glyph"></i>No messages were sent in this ticket.</div>`
              : messages.map(m => `
                <div class="msg-container ${m.deleted ? "deleted" : ""}">
                  <img class="msg-container-avatar" src="${m.authorAvatar ? escapeHtml(m.authorAvatar) : "https://cdn.discordapp.com/embed/avatars/0.png"}" alt="">
                  <div class="msg-container-body">
                    <div class="msg-container-meta">
                      <span class="msg-container-author">${escapeHtml(m.authorName)}</span>
                      ${m.authorIsBot ? `<span class="staff-tag" style="background:rgba(125,211,252,.14);color:var(--sky, #7dd3fc)">APP</span>` : ""}
                      ${m.authorIsStaff ? `<span class="staff-tag">STAFF</span>` : ""}
                      <span class="msg-container-time">${new Date(m.createdAt).toLocaleString()}</span>
                      ${m.deleted ? `<span class="transcript-msg-deleted-tag"><i class="ti ti-trash"></i> deleted</span>` : ""}
                    </div>
                    <div class="msg-container-content">${escapeHtml(m.content) || `<span class="field-hint">(no text content)</span>`}</div>
                  </div>
                </div>`).join("")}
        </div>
      </div>
      <div class="ticket-detail-sidebar">
        <h4>Ticket Information</h4>
        <div class="ticket-info-row"><i class="ti ti-user"></i><div><div class="ticket-info-label">Author</div><div class="ticket-info-val">${userDisplayHtml(opener, ticket.openedById || ticket.openedBy)}</div></div></div>
        <div class="ticket-info-row"><i class="ti ti-calendar"></i><div><div class="ticket-info-label">Created</div><div class="ticket-info-val">${timeAgoGlobal(ticket.createdAt)}</div></div></div>
        <div class="ticket-info-row"><i class="ti ti-tag"></i><div><div class="ticket-info-label">Subject</div><div class="ticket-info-val"><span class="cc-trigger-chip" style="background:rgba(139,92,246,.14);color:var(--violet);border-color:rgba(139,92,246,.3)">${escapeHtml(ticket.subject || "—")}</span></div></div></div>
        <div class="ticket-info-row"><i class="ti ti-lock"></i><div><div class="ticket-info-label">Claimed By</div><div class="ticket-info-val">${ticket.claimedBy ? userDisplayHtml(claimer, ticket.claimedById || ticket.claimedBy) : `<span class="field-hint">Not claimed yet</span>`}</div></div></div>
        ${ticket.status === "closed" ? `
        <div class="ticket-info-row"><i class="ti ti-lock-check"></i><div><div class="ticket-info-label">Closed By</div><div class="ticket-info-val">${userDisplayHtml(closer, ticket.closedById || ticket.closedBy)}</div><div class="field-hint">${timeAgoGlobal(ticket.closedAt)}</div></div></div>`
          : `<div class="field-hint" style="margin-top:8px"><i class="ti ti-lock-open"></i> This ticket hasn't been closed yet.</div>`}
        <div class="ticket-share-block" id="ticket-share-block-wrap">
          <div id="ticket-share-controls">${loadingBlock("")}</div>
        </div>
      </div>
    </div>`;
  paintTicketShareControls(document.getElementById("ticket-share-controls"), guildId, ticketId, ticket);
}

// #4: share-link controls only render at all when sharing is enabled
// for this server — while it's off, no share-link UI is shown (not
// even a disabled state), per "Users should not see share-link
// functionality" when the setting is off.
async function paintTicketShareControls(slot, guildId, ticketId, ticket) {
  let sharingEnabled = false;
  try { sharingEnabled = (await api(`/guilds/${guildId}/sharing-settings`)).sharingEnabled; } catch { /* default false on failure */ }
  const wrap = document.getElementById("ticket-share-block-wrap");
  if (!sharingEnabled) { if (wrap) wrap.style.display = "none"; return; }
  if (wrap) wrap.style.display = "";

  const session = getSession();
  const shareUrl = ticket.currentShareId ? `${window.location.origin}${CFG.BASE_PATH.replace(/\/$/, "")}/share/${ticket.currentShareId}` : null;
  slot.innerHTML = `<div class="config-row-label" style="margin-bottom:8px">Share link</div>` + (shareUrl
    ? `<div class="dc-share-link"><input type="text" readonly value="${escapeHtml(shareUrl)}" id="ticket-share-url"></div>
       <div class="field-row-inline" style="margin-top:8px">
         <button class="btn btn-ghost btn-small" id="ticket-share-copy"><i class="ti ti-copy"></i> Copy</button>
         <button class="btn btn-ghost btn-small" id="ticket-share-regen"><i class="ti ti-refresh"></i> Regenerate</button>
       </div>`
    : `<button class="btn btn-primary btn-small" id="ticket-share-create"><i class="ti ti-link"></i> Create share link</button>`);

  const createBtn = document.getElementById("ticket-share-create");
  if (createBtn) createBtn.addEventListener("click", async () => {
    try { await api(`/guilds/${guildId}/tickets/${ticketId}/share`, { method: "POST", body: JSON.stringify({ requesterId: session?.user?.id }) }); await refreshShareControls(); }
    catch (e) { await DCModal.alert(`Couldn't create share link: ${e.message}`); }
  });
  const copyBtn = document.getElementById("ticket-share-copy");
  if (copyBtn) copyBtn.addEventListener("click", () => {
    document.getElementById("ticket-share-url").select();
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
  });
  const regenBtn = document.getElementById("ticket-share-regen");
  if (regenBtn) regenBtn.addEventListener("click", async () => {
    const ok = await DCModal.confirm("The old link will stop working immediately. Continue?", { title: "Regenerate share link", confirmLabel: "Regenerate" });
    if (!ok) return;
    try { await api(`/guilds/${guildId}/tickets/${ticketId}/share`, { method: "POST", body: JSON.stringify({ requesterId: session?.user?.id }) }); await refreshShareControls(); }
    catch (e) { await DCModal.alert(`Couldn't regenerate: ${e.message}`); }
  });

  async function refreshShareControls() {
    try {
      const fresh = await api(`/guilds/${guildId}/tickets/${ticketId}/transcript?requesterId=${session?.user?.id || ""}`);
      paintTicketShareControls(slot, guildId, ticketId, fresh.ticket);
    } catch { /* keep old controls visible on failure */ }
  }
}

// ============================================================
// Public share page — no auth, reachable at /share/:shareId
// ============================================================
async function enterSharePage(shareId) {
  showScreen("screen-share");
  const root = document.getElementById("share-root");
  root.innerHTML = loadingBlock("Loading ticket…");
  try {
    const data = await api(`/share/tickets/${shareId}`);
    const { ticket, guildName, messages } = data;
    root.innerHTML = `
      <div class="brand-row" style="margin-bottom:18px"><div class="brand-glyph"><img src="logo.png" alt="NEXORIA logo"></div>NEXORIA</div>
      <div class="modal-panel" style="max-width:800px;max-height:none;margin:0 auto">
        <div class="transcript-header">
          <div>
            <h3 style="font-size:16px;font-weight:700">${escapeHtml(ticket.subject || "No subject")} <span class="field-hint" style="font-weight:400">#${escapeHtml(String(ticket.number ?? ticket.id))}</span></h3>
            <div class="field-hint" style="margin-top:2px">${escapeHtml(guildName)} · <span class="badge badge-${ticket.status}">${ticket.status}</span> · Created ${timeAgoGlobal(ticket.createdAt)}</div>
          </div>
        </div>
        <div class="transcript-body" style="max-height:70vh">
          ${messages.length === 0
            ? `<div class="empty-state"><i class="ti ti-message-off glyph"></i>No messages were sent in this ticket.</div>`
            : messages.map(m => `
              <div class="transcript-msg ${m.deleted ? "deleted" : ""}">
                <img class="transcript-msg-avatar" src="${m.authorAvatar ? escapeHtml(m.authorAvatar) : "https://cdn.discordapp.com/embed/avatars/0.png"}" alt="">
                <div class="transcript-msg-body">
                  <div class="transcript-msg-meta">
                    <span class="transcript-msg-author">${escapeHtml(m.authorName)}</span>
                    ${m.authorIsStaff ? `<span class="staff-tag">STAFF</span>` : ""}
                    <span class="transcript-msg-time">${new Date(m.createdAt).toLocaleString()}</span>
                  </div>
                  <div class="transcript-msg-content">${escapeHtml(m.content) || `<span class="field-hint">(no text content)</span>`}</div>
                </div>
              </div>`).join("")}
        </div>
      </div>`;
  } catch (e) {
    root.innerHTML = `
      <div class="brand-row" style="margin-bottom:18px"><div class="brand-glyph"><img src="logo.png" alt="NEXORIA logo"></div>NEXORIA</div>
      <div class="empty-state"><i class="ti ti-link-off glyph"></i>${escapeHtml(e.message || "This share link is invalid.")}</div>`;
  }
}

// ============================================================
// Dashboard shell
// ============================================================
// Status isn't a real module (it has no server-side .server.js, no
// toggle, no Module_Data file) — it's core dashboard functionality, so
// it lives in CORE_PANELS rather than window.DC.modules. It still
// renders through the exact same switchPanel/buildSidebar machinery as
// every module, which is what makes it show the same full sidebar
// (server context, module list, profile/theme footer) instead of a
// separate stripped-down screen.
const CORE_PANELS = [{ id: "status", label: "Status", icon: "ti-activity" }];

let modulesLoaded = false;
let modulesLoadFailed = false;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}
function loadStyle(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = href;
  document.head.appendChild(l);
}

async function ensureModulesLoaded() {
  if (modulesLoaded || modulesLoadFailed) return;
  try {
    const manifest = await api("/modules");
    for (const file of manifest.shared || []) await loadScript(`${CFG.LOCAL_BOT_URL}/modules-static/${file}`);
    for (const mod of manifest.modules || []) {
      if (mod.css) loadStyle(`${CFG.LOCAL_BOT_URL}/modules-static/${mod.css}`);
      if (mod.js) await loadScript(`${CFG.LOCAL_BOT_URL}/modules-static/${mod.js}`);
    }
    modulesLoaded = true;
  } catch {
    modulesLoadFailed = true;
  }
}

function buildContext(extra = {}) {
  const session = getSession();
  return {
    guildId: currentGuild.id,
    userId: session?.user?.id,
    api: (path, options) => api(path, options),
    modal: DCModal,
    routes,
    // Exposed so a module (ticket-tool) can render the same ticket detail
    // page — info panel, transcript, share-link controls — that My
    // Tickets and the deep-linked /ticket/:id route use, instead of
    // reimplementing its own transcript viewer.
    renderTicketDetail: (container, guildId, ticketId) => paintTicketDetailBody(container, guildId, ticketId),
    openerPreviewHtml,
    userDisplayHtml,
    navigateToTab: (tab) => { routes.go(routes.moduleUrl(currentGuild.id, currentPanelId, tab)); switchTab(tab); },
    navigateToTicket: (ticketId) => { routes.go(routes.ticketUrl(currentGuild.id, currentPanelId, ticketId)); switchToTicketView(ticketId); },
    ...extra,
  };
}

// Used by navigateToTicket so a module can push a person straight into a
// ticket's detail view without a full page navigation — mirrors what
// enterDashboard does for a page-load-time deep link.
function switchToTicketView(ticketId) {
  document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.panel === currentPanelId));
  const root = document.getElementById("module-root");
  root.innerHTML = `<button class="btn btn-ghost btn-small" id="dash-ticket-back"><i class="ti ti-arrow-left"></i> Back</button><div id="dash-ticket-body" style="margin-top:16px">${loadingBlock("Loading ticket…")}</div>`;
  document.getElementById("dash-ticket-back").addEventListener("click", () => { routes.go(routes.moduleUrl(currentGuild.id, currentPanelId)); switchPanel(currentPanelId, false); });
  paintTicketDetailBody(document.getElementById("dash-ticket-body"), currentGuild.id, ticketId);
}

function navItemHtml(id, tablerIconUnused, label, toggleable, isEnabled) {
  const disabledClass = toggleable && !isEnabled ? "module-disabled" : "";
  // Every module id gets a custom SVG — built-in modules have a
  // purpose-drawn one in ICON_PATHS; any third-party module without
  // one yet still gets icon()'s own generic dot fallback rather than
  // ever falling back to the Tabler icon font. The second parameter
  // (a module's own Tabler icon string, e.g. "ti-ticket") is kept for
  // call-site compatibility with every registerModule() call across
  // ticket-tool.js/custom-commands.js/logging.js, which still pass
  // one, but is intentionally unused now.
  const iconHtml = icon(id);
  return `<div class="nav-item ${disabledClass}" data-panel="${id}" title="${escapeHtml(label)}">
    ${iconHtml}<span class="nav-item-label">${escapeHtml(label)}</span>
    ${toggleable ? `<button class="toggle nav-item-toggle ${isEnabled ? "on" : ""}" data-module-toggle="${id}" aria-label="Toggle ${escapeHtml(label)}"></button>` : ""}
  </div>`;
}

function buildSidebar(disabledModules) {
  disabledModules = disabledModules || [];
  const wrap = document.getElementById("dash-nav-items");
  // The custom-commands module's built-in "Bot Status" slash command is
  // intentionally excluded here — it's a Discord slash command, not a
  // dashboard page, and only ever appears in that module's own command
  // list. This dashboard's own Status page is added via CORE_PANELS
  // below instead, since it's not a toggleable module.
  const modules = (window.DC?.modules || []).filter(m => m.id !== "status");
  // Preserve which panel is currently open across the rebuild below —
  // wrap.innerHTML replaces every .nav-item from scratch, which would
  // otherwise silently drop the .active class (and, since the module
  // toggle is only shown on the active item per its CSS, make the
  // toggle disappear) every time this runs, e.g. right after using
  // that very toggle.
  const activePanel = wrap.querySelector(".nav-item.active")?.dataset.panel || null;

  const modulesHtml = modules.length
    ? `<div class="nav-section-label">Modules</div>${modules.map(m => navItemHtml(m.id, m.icon, m.label, true, !disabledModules.includes(m.id))).join("")}`
    : "";
  const generalHtml = CORE_PANELS.length ? `<div class="nav-section-label">General</div>${CORE_PANELS.map(p => navItemHtml(p.id, p.icon, p.label, false)).join("")}` : "";

  wrap.innerHTML = modulesHtml + generalHtml;
  if (activePanel) wrap.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.panel === activePanel));
  wrap.querySelectorAll(".nav-item").forEach(n => n.addEventListener("click", (e) => {
    if (e.target.closest("[data-module-toggle]")) return;
    routes.go(routes.moduleUrl(currentGuild.id, n.dataset.panel));
    switchPanel(n.dataset.panel, false);
  }));
  wrap.querySelectorAll("[data-module-toggle]").forEach(btn => btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const moduleId = btn.dataset.moduleToggle;
    const turningOn = !btn.classList.contains("on");
    openModuleToggleConfirm(moduleId, turningOn, btn, disabledModules);
  }));
}

async function openModuleToggleConfirm(moduleId, turningOn, btn, disabledModules) {
  const label = (window.DC?.modules || []).find(m => m.id === moduleId)?.label || moduleId;
  const ok = await DCModal.confirm(
    `${label} keeps working normally either way — this only changes how it looks in your sidebar.`,
    { title: `${turningOn ? "Turn on" : "Turn off"} ${label}?`, confirmLabel: turningOn ? "Turn on" : "Turn off" }
  );
  if (!ok) return;
  try {
    await api(`/guilds/${currentGuild.id}/modules/${moduleId}`, { method: "PUT", body: JSON.stringify({ enabled: turningOn }) });
    currentGuildDisabledModules = turningOn ? disabledModules.filter(id => id !== moduleId) : [...disabledModules, moduleId];
    buildSidebar(currentGuildDisabledModules);
    // The toggle is only ever visible on the module you're currently
    // looking at (see navItemHtml/CSS), so flipping it always affects
    // the open module — update its overlay immediately rather than
    // requiring a navigate-away-and-back to see the change take effect.
    if (currentPanelId === moduleId) setModuleDisabledOverlay(!turningOn);
  } catch (e2) { await DCModal.alert(`Couldn't update module: ${e2.message}`); }
}

// Shows/hides the translucent "this module is off" overlay on top of
// module-root — the module underneath keeps rendering and working
// completely normally either way (toggling is purely cosmetic); this
// never replaces its content, only sits above it.
function setModuleDisabledOverlay(isDisabled) {
  const wrap = document.getElementById("module-root-wrap");
  const overlay = document.getElementById("module-disabled-overlay");
  if (!wrap || !overlay) return;
  wrap.classList.toggle("disabled-active", isDisabled);
  overlay.style.display = isDisabled ? "flex" : "none";
}

let currentPanelId = "ticket-tool";
let currentTab = null;

// ============================================================
// Dashboard topbar server switcher — clicking "Servers > current
// server" opens a dropdown of every server the person can manage
// (fetched fresh each open, same call/filter as the Dashboard picker
// page), with the currently open one checkmarked, a search box, and a
// "View All Servers" button that leaves the switcher and goes to the
// full Dashboard grid. Both the in-dashboard trigger (dash-nav-server,
// shows the current server's own icon/name once one is open) and the
// picker sidebar's own trigger (picker-server-switch, shows a generic
// "Select Server" prompt since none is open there) use this same
// dropdown content — paintServerSwitcherPanel(panel) is shared between
// them. Each is wired once since both triggers are static markup that
// always exists once their respective screen has been shown at all.
// ============================================================
let serverSwitcherWired = false;
function wireServerSwitcher() {
  if (serverSwitcherWired) return;
  serverSwitcherWired = true;
  wireFloatingDropdown("dash-nav-server", "dash-crumb-panel");
  document.getElementById("dash-nav-server").addEventListener("click", () => {
    const panel = document.getElementById("dash-crumb-panel");
    if (panel.style.display !== "none") paintServerSwitcherPanel(panel);
  });
}

let pickerServerSwitcherWired = false;
function wirePickerServerSwitcher() {
  if (pickerServerSwitcherWired) return;
  pickerServerSwitcherWired = true;
  wireFloatingDropdown("picker-server-switch", "picker-server-switch-panel");
  document.getElementById("picker-server-switch").addEventListener("click", () => {
    const panel = document.getElementById("picker-server-switch-panel");
    if (panel.style.display !== "none") paintServerSwitcherPanel(panel);
  });
}

async function paintServerSwitcherPanel(panel) {
  panel.innerHTML = loadingBlock("Loading servers…");
  const session = getSession();
  let manageable = [];
  try {
    const guilds = await fetchMyGuilds(session.token);
    manageable = guilds.filter(isAdmin).sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) {
    panel.innerHTML = `<div class="dropdown-panel-empty">Couldn't load servers: ${escapeHtml(e.message)}</div>`;
    return;
  }
  const botGuildIds = new Set((botInfoCache?.guilds || []).map(g => g.id));
  const withBot = manageable.filter(g => botGuildIds.has(g.id));

  // Update every trigger currently in the DOM with the real "N
  // servers" count (image 9's reference) — the in-dashboard trigger's
  // subtitle always shows this now, replacing the role-badge text it
  // used to show in that spot.
  const dashSub = document.getElementById("dash-server-sub");
  if (dashSub) dashSub.textContent = `${withBot.length} server${withBot.length === 1 ? "" : "s"}`;

  function rowHtml(g) {
    const isActive = g.id === currentGuild?.id;
    const iconHtml = g.icon ? `<img src="https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png" alt="">` : initials(g.name);
    return `
      <div class="dropdown-panel-item server-switch-item ${isActive ? "selected" : ""}" data-switch-guild="${g.id}" data-switch-name="${escapeHtml(g.name)}" data-switch-icon="${g.icon || ""}">
        <span class="server-switch-icon">${iconHtml}</span>
        <span class="server-switch-name">${escapeHtml(g.name)}</span>
        ${isActive ? icon("check", 15) : ""}
      </div>`;
  }

  panel.innerHTML = `
    <div class="dropdown-panel-title">Staff Servers</div>
    <input type="text" class="dropdown-panel-search" id="dash-crumb-search" placeholder="Search servers…">
    <div id="dash-crumb-list">
      ${withBot.length ? withBot.map(rowHtml).join("") : `<div class="dropdown-panel-empty">NEXORIA isn't on any server you manage yet.</div>`}
    </div>
    <div class="dropdown-panel-footer-action">
      <button class="btn btn-ghost btn-small" id="dash-crumb-view-all" style="width:100%">${icon("servers")} View All Servers</button>
    </div>`;

  function wireRows() {
    panel.querySelectorAll("[data-switch-guild]").forEach(row => row.addEventListener("click", () => {
      const guildId = row.dataset.switchGuild;
      if (guildId === currentGuild?.id) { closeAllFloatingDropdowns(); return; }
      currentGuild = { id: guildId, name: row.dataset.switchName, icon: row.dataset.switchIcon };
      closeAllFloatingDropdowns();
      routes.go(routes.moduleUrl(currentGuild.id, "ticket-tool"));
      enterDashboard("ticket-tool");
    }));
  }
  wireRows();

  document.getElementById("dash-crumb-search").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    const list = document.getElementById("dash-crumb-list");
    const filtered = withBot.filter(g => g.name.toLowerCase().includes(q));
    list.innerHTML = filtered.length ? filtered.map(rowHtml).join("") : `<div class="dropdown-panel-empty">No matches</div>`;
    wireRows();
  });

  document.getElementById("dash-crumb-view-all").addEventListener("click", () => {
    closeAllFloatingDropdowns();
    routes.go("/dashboard");
    enterPicker("dashboard");
  });
}

async function enterDashboard(panel, { tab, ticketId } = {}) {
  showScreen("screen-dashboard");
  renderSidebarBottom("dash-sidebar-bottom");
  const session = getSession();

  await refreshHeroStatus();
  if (botInfoCache) await ensureModulesLoaded();

  if (!currentGuild.name && botInfoCache) {
    const found = (botInfoCache.guilds || []).find(g => g.id === currentGuild.id);
    if (found) currentGuild = { id: found.id, name: found.name, icon: found.icon };
  }
  document.getElementById("dash-server-name").textContent = currentGuild.name || "Server";
  document.getElementById("dash-server-icon").innerHTML = currentGuild.icon
    ? `<img src="https://cdn.discordapp.com/icons/${currentGuild.id}/${currentGuild.icon}.png" alt="">`
    : initials(currentGuild.name || "S");
  document.getElementById("dash-crumb").innerHTML = `Servers ${icon("chevron-right", 12)} <b>${escapeHtml(currentGuild.name || "…")}</b>`;
  wireServerSwitcher();
  // Populate the switcher's "N servers" subtitle right away rather
  // than waiting for the person to actually open the dropdown — the
  // panel itself stays hidden/unpainted until they click, but the
  // count on the trigger is real from the moment the dashboard loads.
  const crumbPanel = document.getElementById("dash-crumb-panel");
  if (crumbPanel) paintServerSwitcherPanel(crumbPanel).then(() => { crumbPanel.style.display = "none"; });

  const sub = document.getElementById("dash-server-sub");
  let guildDisabledModules = [];
  if (botInfoCache) {
    const meta = await api(`/guilds/${currentGuild.id}/meta?userId=${session.user.id}`).catch(() => null);
    guildDisabledModules = meta?.disabledModules || [];
    currentGuildDisabledModules = guildDisabledModules;
    // The switcher trigger's subtitle is always "N servers" (see
    // image 9's reference — "2 servers", not a role badge) — the
    // paintServerSwitcherPanel call above sets the real count once its
    // fetch resolves; this is just the placeholder shown before that.
    if (sub.textContent === "—") sub.textContent = "…";
    if (meta && meta.allowed === false) {
      buildSidebar(guildDisabledModules);
      document.getElementById("module-root").innerHTML = `
        <div class="empty-state" style="max-width:520px;margin:40px auto"><i class="ti ti-lock-off glyph"></i>${escapeHtml(meta.notAllowedMessage || "This server isn't authorized to use this tool.")}</div>`;
      return;
    }
  } else {
    sub.textContent = "Bot Servers down";
  }
  buildSidebar(guildDisabledModules);

  currentPanelId = panel;
  currentTab = tab || null;

  if (ticketId) {
    document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.panel === panel));
    const root = document.getElementById("module-root");
    root.innerHTML = `<button class="btn btn-ghost btn-small" id="dash-ticket-back"><i class="ti ti-arrow-left"></i> Back</button><div id="dash-ticket-body" style="margin-top:16px">${loadingBlock("Loading ticket…")}</div>`;
    document.getElementById("dash-ticket-back").addEventListener("click", () => { routes.go(routes.moduleUrl(currentGuild.id, panel)); switchPanel(panel, false); });
    await paintTicketDetailBody(document.getElementById("dash-ticket-body"), currentGuild.id, ticketId);
    return;
  }

  switchPanel(panel, false, tab);
}

function switchPanel(name, updateUrl = true, tab = null) {
  currentPanelId = name;
  currentTab = tab;
  document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.panel === name));
  if (updateUrl) routes.go(routes.moduleUrl(currentGuild.id, name, tab));

  // A disabled module still renders and works completely normally
  // underneath (toggling is purely cosmetic) — setModuleDisabledOverlay
  // only adds a translucent grey overlay with a centered "this module
  // is off" message on top of it, and never skips actually rendering
  // the module itself.
  setModuleDisabledOverlay(currentGuildDisabledModules.includes(name));

  const root = document.getElementById("module-root");
  root.innerHTML = loadingBlock();

  const mod = window.DC?.getModule(name);
  if (mod) { mod.render(root, buildContext(), tab); return; }

  const renderers = { status: renderStatusModule };
  (renderers[name] || renderStatusModule)(root);
}

function switchTab(tab) {
  currentTab = tab;
  routes.go(routes.moduleUrl(currentGuild.id, currentPanelId, tab));
}

// ============================================================
// Status module — colored uptime bar (green/yellow/orange/red by worst
// incident severity that day) with a HOVER tooltip (#17 — no click
// required) showing that day's detail.
// ============================================================
async function renderStatusModule(root) {
  await refreshHeroStatus();
  root.innerHTML = `<div class="dash-header"><div><h1>Status</h1><p>Uptime history for your bot.</p></div></div><div id="status-body">${loadingBlock()}</div>`;
  const body = document.getElementById("status-body");
  if (!botInfoCache) {
    body.innerHTML = `
      <div class="status-banner down"><i class="ti ti-alert-triangle"></i> Bot is currently offline</div>
      <div class="empty-state"><i class="ti ti-plug-connected-x glyph"></i>Can't reach the bot right now — history will still be here once it's back online.</div>`;
    return;
  }
  let history;
  try { history = await api("/status-history"); } catch { history = null; }
  if (!history) {
    body.innerHTML = `<div class="empty-state"><i class="ti ti-alert-triangle glyph"></i>Bot is online, but its history couldn't be loaded.</div>`;
    return;
  }

  const days = history.days || [];
  body.innerHTML = `
    <div class="status-banner ${history.online ? "up" : "down"}"><i class="ti ${history.online ? "ti-circle-check" : "ti-alert-triangle"}"></i> ${history.online ? "All Systems Operational" : "Bot Offline"}</div>
    <div class="status-uptime-card">
      <div class="status-uptime-header">
        <span>Bot process</span>
        <span class="status-pip ${history.online ? "online" : "offline"}"><span class="status-dot"></span>${history.online ? "Operational" : "Down"}</span>
      </div>
      <div class="status-daybar" id="status-daybar">
        ${days.map((d, i) => `<div class="status-day status-day-${d.severity}" data-day-idx="${i}"></div>`).join("")}
      </div>
      <div class="status-daybar-footer">
        <span>90 days ago</span>
        <span>${history.uptimePercent}% uptime over 90 days</span>
        <span>Today</span>
      </div>
    </div>
    <div class="overview-grid" style="grid-template-columns:repeat(3,1fr);margin-top:18px">
      <div class="overview-card"><div class="num">${formatUptime(history.currentUptimeSeconds)}</div><div class="lbl">Current uptime</div></div>
      <div class="overview-card"><div class="num">${history.uptimePercent}%</div><div class="lbl">Uptime (90 days)</div></div>
      <div class="overview-card"><div class="num">${history.incidents.length}</div><div class="lbl">Recorded incidents</div></div>
    </div>
    <div class="config-section" style="margin-top:18px">
      <h3>Installed modules</h3>
      <div class="hint">Turn modules on or off for this server. Disabling a module hides it from the sidebar without deleting its data.</div>
      <div id="status-modules-list">${loadingBlock()}</div>
    </div>
    <div class="config-section" style="margin-top:18px">
      <h3>Incident history</h3>
      <div class="hint">Unplanned downtime the bot detected on its own restart — a clean shutdown (Ctrl+C) is never logged as an incident.</div>
      ${history.incidents.length === 0
        ? `<div class="empty-state">No downtime recorded.</div>`
        : history.incidents.slice(0, 25).map(i => `
          <div class="config-row" style="align-items:flex-start">
            <span class="config-row-label"><span class="severity-dot severity-${i.severity}"></span>${new Date(i.startedAt).toLocaleString()}${i.note ? `<div class="field-hint" style="margin-top:2px;font-weight:400">${escapeHtml(i.note)}</div>` : ""}</span>
            <span class="config-row-label" style="font-weight:400;color:var(--text-dim)">${formatDuration(i.durationSeconds)} downtime</span>
          </div>`).join("")}
    </div>`;

  wireStatusDayHoverTooltip(days, history.incidents);
  paintStatusModulesList();
}

async function paintStatusModulesList() {
  const slot = document.getElementById("status-modules-list");
  if (!slot) return;
  try {
    const meta = await api(`/guilds/${currentGuild.id}/meta?userId=${getSession().user.id}`);
    const disabled = meta.disabledModules || [];
    const modules = (window.DC?.modules || []).filter(m => m.id !== "status");
    if (modules.length === 0) { slot.innerHTML = `<div class="empty-state">No modules loaded.</div>`; return; }
    slot.innerHTML = modules.map(m => `
      <div class="config-row">
        <span class="config-row-label"><i class="ti ${m.icon}" style="margin-right:8px;color:var(--text-dim)"></i>${escapeHtml(m.label)}</span>
        <span class="badge badge-${disabled.includes(m.id) ? "closed" : "open"}">${disabled.includes(m.id) ? "Off" : "On"}</span>
      </div>`).join("");
  } catch {
    slot.innerHTML = `<div class="empty-state">Couldn't load module list.</div>`;
  }
}

// #17: hover (not click) opens a small fixed-position tooltip that
// follows the mouse across the bar — "September 12 / Incident: Bot
// restarted unexpectedly." or "September 13 / No incidents." — and
// disappears immediately on mouseleave. One tooltip element is reused
// for the whole bar rather than one per day, repositioned/repainted on
// each mouseenter.
function wireStatusDayHoverTooltip(days, incidents) {
  const bar = document.getElementById("status-daybar");
  if (!bar) return;

  let tooltip = document.getElementById("status-day-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "status-day-tooltip";
    tooltip.className = "status-day-tooltip";
    document.body.appendChild(tooltip);
  }

  function positionTooltip(target) {
    const rect = target.getBoundingClientRect();
    const tipRect = tooltip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${rect.top - tipRect.height - 10}px`;
  }

  bar.querySelectorAll("[data-day-idx]").forEach(el => {
    el.addEventListener("mouseenter", () => {
      const d = days[+el.dataset.dayIdx];
      const dayIncidents = incidents.filter(i => new Date(i.startedAt).toISOString().slice(0, 10) === d.date);
      const dateLabel = new Date(d.date).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
      tooltip.innerHTML = `
        <div class="status-day-tooltip-date">${dateLabel}</div>
        ${dayIncidents.length === 0
          ? `<div class="status-day-tooltip-none"><i class="ti ti-check"></i> No incidents.</div>`
          : dayIncidents.map(i => `
            <div class="status-day-tooltip-row">
              <span class="severity-dot severity-${i.severity}" style="margin-top:3px"></span>
              <span>Incident:<br>${escapeHtml(i.note || `${formatDuration(i.durationSeconds)} downtime`)}</span>
            </div>`).join("")}`;
      tooltip.classList.add("visible");
      positionTooltip(el);
    });
    el.addEventListener("mousemove", () => positionTooltip(el));
    el.addEventListener("mouseleave", () => tooltip.classList.remove("visible"));
  });
}

function formatDuration(totalSeconds) {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const mins = Math.floor(totalSeconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return `${hours}h ${remMins}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

// ============================================================
// Wiring
// ============================================================
// Bump this if the Terms/Privacy content changes enough that
// previously-agreed visitors should be asked again — everyone who
// already agreed under an older key just gets the gate once more.
const TOS_AGREEMENT_KEY = "tk_tos_agreed_v1";
function initTosGate() {
  const overlay = document.getElementById("tos-gate-overlay");
  if (!overlay) return;
  if (localStorage.getItem(TOS_AGREEMENT_KEY) === "1") return; // already agreed — stays hidden
  overlay.style.display = "flex";
  document.body.style.overflow = "hidden";
  const checkbox = document.getElementById("tos-gate-checkbox");
  const continueBtn = document.getElementById("tos-gate-continue");
  checkbox.addEventListener("change", () => { continueBtn.disabled = !checkbox.checked; });
  continueBtn.addEventListener("click", () => {
    if (!checkbox.checked) return;
    try { localStorage.setItem(TOS_AGREEMENT_KEY, "1"); } catch { /* privacy mode etc — gate just reappears next visit, non-fatal */ }
    overlay.style.display = "none";
    document.body.style.overflow = "";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  function on(id, event, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
    else console.warn(`Wiring: #${id} not found in the page — skipping its listener.`);
  }

  initTosGate();
  const discordBtn = document.getElementById("btn-discord-support");
  if (discordBtn && CFG.DISCORD_SUPPORT_URL) { discordBtn.href = CFG.DISCORD_SUPPORT_URL; discordBtn.style.display = ""; }
  on("btn-login", "click", (e) => { e.preventDefault(); beginLogin(); });
  on("btn-invite", "click", (e) => { e.preventDefault(); window.open(inviteUrl(), "_blank"); });
  on("btn-logout", "click", () => { clearSession(); routes.go("/", true); showScreen("screen-landing"); });
  on("btn-back", "click", () => {
    if (window.location.pathname.includes("/servers/")) { routes.go("/dashboard"); enterPicker(); }
    else window.history.back();
  });

  boot();
  // Poll every second so "Bot Servers up/down" reflects reality almost
  // immediately rather than being up to 15s stale. pingLocalBot's own
  // request can take a few seconds in the worst case (its /status call
  // has an 8s timeout, with an 8s fallback root check on top of that
  // if /status itself fails) — a 1s interval alone would let requests
  // pile up faster than they resolve whenever the bot is actually
  // down, so `polling` below is a simple in-flight guard: if the
  // previous tick's check hasn't finished yet, this tick skips firing
  // a new one rather than stacking another request on top of it.
  let polling = false;
  setInterval(async () => {
    if (polling) return;
    polling = true;
    try {
      const wasOnline = botInfoCache?.online;
      await refreshHeroStatus();
      if (!wasOnline && botInfoCache?.online && document.getElementById("screen-dashboard").classList.contains("active")) {
        await ensureModulesLoaded();
        buildSidebar(currentGuildDisabledModules);
      }
    } finally {
      polling = false;
    }
  }, 1000);
});

// Expose the modal API and the custom icon library for modules to use
// — window.DC.icon(name, sizePx) is how ticket-tool.js/custom-
// commands.js/logging.js (and any future module) render icons too, so
// every icon anywhere in the app — including inside module code that
// lives in separate files loaded at runtime — comes from the same
// custom SVG set rather than any module falling back to the Tabler
// icon font on its own.
window.DC = window.DC || {};
window.DC.modal = DCModal;
window.DC.icon = icon;
