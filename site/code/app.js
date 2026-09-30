// app.js
let CFG = null;
let configPromise = null;
function inferPublicBasePath() {
    const p = String(window.location.pathname || "/");
    // GitHub Pages project sites are normally /REPOSITORY/. Treat the first
    // path segment as the repository prefix. Custom domains and localhost use /.
    if (/github\.io$/i.test(window.location.hostname)) {
        const parts = p.split("/").filter(Boolean);
        const first = parts[0];
        if (first && String(parts[1] || "").toLowerCase() === "website") return `/${first}/website/`;
        return first ? `/${first}/` : "/";
    }
    return "/";
}
function getSiteBasePath() {
    const configured = String(CFG?.BASE_PATH || window.NEXORIA_CONFIG?.BASE_PATH || window.NEXORIA_ROUTE_BASE || "").trim();
    const current = String(window.location.pathname || "/");
    if (configured) {
        const normalized = configured.startsWith("/") ? configured : `/${configured}`;
        const candidate = normalized.endsWith("/") ? normalized : `${normalized}/`;
        if (current === candidate.slice(0, -1) || current.startsWith(candidate)) return candidate;
    }
    return inferPublicBasePath();
}
function getWebAssetRoot() {
    const explicit = String(window.NEXORIA_WEB_ASSET_ROOT || "").trim();
    if (explicit) return explicit.endsWith("/") ? explicit : `${explicit}/`;
    const src = [...document.scripts].map(s => s.src).find(src => /(?:\/website)?\/site\/code\/app(?:\.min)?\.js(?:\?|$)/i.test(src));
    if (src) {
        try { return new URL("../", new URL(src, window.location.href)).pathname; } catch {}
    }
    const base = getSiteBasePath().replace(/\/+$/, "");
    return `${base}/site/`;
}
function normalizeWebAssetRoot() {
    let p = getWebAssetRoot().replace(/\/+$/, "");
    if (/\/website$/i.test(p)) p += "/site";
    if (!/\/site$/i.test(p)) p += "/site";
    return `${p}/`;
}
window.NEXORIA_SITE_BASE = getSiteBasePath();
window.NEXORIA_WEB_ASSET_ROOT = normalizeWebAssetRoot();

// Shared UI helpers. Keep these in the main app bundle so route/status code can
// never fail because an optional module loaded later did not define them.
function initials(name) {
    const text = String(name || "?").trim();
    if (!text) return "?";
    const parts = text.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return text.slice(0, 2).toUpperCase();
}
window.initials = initials;

function formatUptime(totalSeconds) {
    const total = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function showScreen(id) {
    const targetId = String(id || '').trim();
    const screens = document.querySelectorAll('.screen');
    let found = false;
    screens.forEach(screen => {
        const active = screen.id === targetId;
        screen.classList.toggle('active', active);
        if (active) {
            found = true;
            screen.classList.remove('nexoria-screen-enter');
            void screen.offsetWidth;
            screen.classList.add('nexoria-screen-enter');
        }
    });
    if (found) window.scrollTo({ top: 0, behavior: 'auto' });
    return found;
}
window.formatUptime = formatUptime;
window.showScreen = showScreen;


// Sidebar account block. Kept in the main bundle so it is available before
// asynchronous module code and route rendering run.
function renderSidebarBottom(targetId) {
    const root = document.getElementById(targetId);
    if (!root) return;
    const session = getSession();
    const user = session?.user || null;
    if (!user) {
        root.innerHTML = `
          <div class="sidebar-profile" role="button" tabindex="0" aria-label="Log in to NEXORIA">
            <span class="sidebar-profile-avatar" style="display:grid;place-items:center;background:var(--panel-2);">${icon("profile", 17)}</span>
            <div style="min-width:0"><div class="sidebar-profile-name">Not logged in</div><div class="field-hint">Log in with Discord</div></div>
          </div>`;
        root.querySelector('.sidebar-profile')?.addEventListener('click', () => { window.location.href = `${getSiteBasePath()}login`; });
        return;
    }
    const displayName = user.global_name || user.username || 'Discord user';
    const avatarUrl = user.avatar
      ? `https://cdn.discordapp.com/avatars/${encodeURIComponent(user.id)}/${encodeURIComponent(user.avatar)}.png?size=64`
      : 'https://cdn.discordapp.com/embed/avatars/0.png';
    root.innerHTML = `
      <div class="sidebar-profile" id="sidebar-profile-${targetId}" role="button" tabindex="0" aria-expanded="false">
        <img class="sidebar-profile-avatar" src="${escapeHtml(avatarUrl)}" alt="">
        <div style="min-width:0;flex:1"><div class="sidebar-profile-name">${escapeHtml(displayName)}</div><div class="field-hint">Discord account</div></div>
        <span style="opacity:.55">${icon("chevron-up", 15)}</span>
        <div class="sidebar-profile-menu" style="display:none">
          <div class="sidebar-profile-menu-header"><img class="sidebar-profile-avatar" src="${escapeHtml(avatarUrl)}" alt=""><div><div class="sidebar-profile-name">${escapeHtml(displayName)}</div><div class="field-hint">@${escapeHtml(user.username || '')}</div></div></div>
          <button class="kebab-menu-item" type="button" data-sidebar-action="profile">${icon("profile", 16)} Profile</button>
          <button class="kebab-menu-item" type="button" data-sidebar-action="logout">${icon("log-out", 16)} Log out</button>
        </div>
      </div>`;
    const profile = root.querySelector('.sidebar-profile');
    const menu = root.querySelector('.sidebar-profile-menu');
    const toggle = () => { const open = menu.style.display !== 'none'; menu.style.display = open ? 'none' : 'block'; profile.setAttribute('aria-expanded', String(!open)); };
    profile.addEventListener('click', e => { if (!e.target.closest('[data-sidebar-action]')) toggle(); });
    profile.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    root.querySelector('[data-sidebar-action="profile"]')?.addEventListener('click', () => { menu.style.display='none'; routes.go('/profile'); renderFromRoute(); });
    root.querySelector('[data-sidebar-action="logout"]')?.addEventListener('click', () => { clearSession(); window.location.reload(); });
}
window.renderSidebarBottom = renderSidebarBottom;

function siteAsset(path) {
    const base = normalizeWebAssetRoot().replace(/\/+$/, "");
    return `${base}/${String(path || "").replace(/^\/+/, "")}`;
}
const ASSET_VERSION = String(window.NEXORIA_ASSET_VERSION || "20260930.4");
function versionedAsset(url) { return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(ASSET_VERSION)}`; }
function repoAsset(path) {
    let assetRoot = normalizeWebAssetRoot().replace(/\/+$/, "");
    assetRoot = assetRoot.replace(/\/website\/site$/i, "").replace(/\/site$/i, "");
    const base = assetRoot || "/";
    return `${base.replace(/\/+$/, "")}/${String(path || "").replace(/^\/+/, "")}`;
}
// Safe module API is available before asynchronously loaded module assets arrive.
// This prevents first-render races from breaking the dashboard.
window.DC = window.DC || {};
window.DC.modules = Array.isArray(window.DC.modules) ? window.DC.modules : [];
if (typeof window.DC.getModule !== "function") window.DC.getModule = id => window.DC.modules.find(m => m.id === id);
if (typeof window.DC.registerModule !== "function") window.DC.registerModule = mod => {
    if (!mod || !mod.id || typeof mod.render !== "function") return;
    const i = window.DC.modules.findIndex(m => m.id === mod.id);
    if (i >= 0) window.DC.modules[i] = mod; else window.DC.modules.push(mod);
};
async function loadPublicConfig() {
    if (CFG) return CFG;
    if (configPromise) return configPromise;
    const root = getSiteBasePath().replace(/\/+$/, "");
    const candidates = [
        `${root}/site/data/config.json`,
        `${root}/website/site/data/config.json`,
        `${root}/data/config.json`
    ].map(versionedAsset);
    configPromise = (async () => {
        let lastError = null;
        for (const configUrl of [...new Set(candidates)]) {
            try {
                const response = await fetch(configUrl, { cache: "no-store", signal: AbortSignal.timeout(10000) });
                if (!response.ok) { lastError = new Error(`HTTP ${response.status} for ${configUrl}`); continue; }
                const data = await response.json();
                if (!data || typeof data !== "object") { lastError = new Error(`Invalid JSON at ${configUrl}`); continue; }
                CFG = data;
                window.NEXORIA_CONFIG = CFG;
                console.info(`[config] Loaded NEXORIA configuration from ${configUrl}`);
                return CFG;
            } catch (error) { lastError = error; }
        }
        throw new Error(`Could not load NEXORIA configuration from any known path. ${lastError?.message || "Unknown error"}`);
    })().catch(error => { configPromise = null; throw error; });
    return configPromise;
}
window.addEventListener("error", (e) => {
    console.error("[uncaught error]", e.message, "at", `${e.filename}:${e.lineno}:${e.colno}`, e.error);
});
window.addEventListener("unhandledrejection", (e) => {
    console.error("[unhandled promise rejection]", e.reason);
});
const LS = {
    verifier: "tk_pkce_verifier",
    token: "tk_access_token",
    tokenExpiry: "tk_token_expiry",
    user: "tk_user",
    theme: "tk_theme",
    language: "nexoria_language",
};
const ADMINISTRATOR = 0x8;
const REFRESH_PREFS_KEY = "nexoria_refresh_preferences";
const DEFAULT_REFRESH_PREFS = { statusSeconds: 5, leaderboardSeconds: 1800 };
function getRefreshPrefs() { try { const x=JSON.parse(localStorage.getItem(REFRESH_PREFS_KEY)||"{}"); return {statusSeconds:Math.max(.1,Number(x.statusSeconds)||5), leaderboardSeconds:Math.max(.1,Number(x.leaderboardSeconds)||1800)}; } catch { return {...DEFAULT_REFRESH_PREFS}; } }
function saveRefreshPrefs(p) { const x={statusSeconds:Math.max(.1,Number(p.statusSeconds)||5),leaderboardSeconds:Math.max(.1,Number(p.leaderboardSeconds)||1800)}; localStorage.setItem(REFRESH_PREFS_KEY,JSON.stringify(x)); return x; }
const ICON_PATHS = {
    dashboard: `<rect x="2.5" y="2.5" width="7" height="7" rx="1.6" fill="#8b5cf6"/><rect x="10.5" y="2.5" width="7" height="4.5" rx="1.4" fill="#f472b6"/><rect x="10.5" y="8" width="7" height="9.5" rx="1.6" fill="#22d3ee"/><rect x="2.5" y="10.5" width="7" height="7" rx="1.6" fill="#22d3ee" opacity=".55"/>`,
    tickets: `<path d="M2.5 6.8c0-1 .8-1.8 1.8-1.8h11.4c1 0 1.8.8 1.8 1.8v1.4a1.7 1.7 0 0 0 0 3.6v1.4c0 1-.8 1.8-1.8 1.8H4.3c-1 0-1.8-.8-1.8-1.8v-1.4a1.7 1.7 0 0 0 0-3.6z" fill="#8b5cf6"/><path d="M8.3 5v10" stroke="#0a0b14" stroke-width="1.3" stroke-dasharray="1.6 1.6" opacity=".55"/>`,
    servers: `<rect x="2.5" y="3" width="15" height="5.2" rx="1.5" fill="#22d3ee"/><rect x="2.5" y="11.8" width="15" height="5.2" rx="1.5" fill="#8b5cf6"/><circle cx="5.3" cy="5.6" r="1" fill="#0a0b14" opacity=".6"/><circle cx="5.3" cy="14.4" r="1" fill="#0a0b14" opacity=".6"/>`,
    premium: `<path d="M3 7.5 6.4 10l3-4.4L12.6 10 16 7.5 14.8 15H5.2z" fill="#fbbf24"/><circle cx="3" cy="6.3" r="1.3" fill="#fbbf24"/><circle cx="10" cy="4.6" r="1.3" fill="#fbbf24"/><circle cx="17" cy="6.3" r="1.3" fill="#fbbf24"/>`,
    status: `<path d="M2.5 11h3l1.8-5.5L10 15l2-6.5 1.4 2.5h4.1" fill="none" stroke="#6ee7b7" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
    "ticket-tool": `<path d="M2.5 6.8c0-1 .8-1.8 1.8-1.8h11.4c1 0 1.8.8 1.8 1.8v1.4a1.7 1.7 0 0 0 0 3.6v1.4c0 1-.8 1.8-1.8 1.8H4.3c-1 0-1.8-.8-1.8-1.8v-1.4a1.7 1.7 0 0 0 0-3.6z" fill="#8b5cf6"/><path d="M8.3 5v10" stroke="#0a0b14" stroke-width="1.3" stroke-dasharray="1.6 1.6" opacity=".55"/>`,
    "custom-commands": `<rect x="2.5" y="3.5" width="15" height="13" rx="2" fill="#14162a" stroke="#22d3ee" stroke-width="1.3"/><path d="M5.5 8l2.3 2.2-2.3 2.2" fill="none" stroke="#22d3ee" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 12.4h4.2" stroke="#22d3ee" stroke-width="1.5" stroke-linecap="round"/>`,
    logging: `<rect x="4" y="2.5" width="12" height="15" rx="1.6" fill="#f472b6"/><rect x="6.2" y="5.3" width="7.6" height="1.4" rx=".7" fill="#0a0b14" opacity=".55"/><rect x="6.2" y="8.3" width="7.6" height="1.4" rx=".7" fill="#0a0b14" opacity=".55"/><rect x="6.2" y="11.3" width="4.6" height="1.4" rx=".7" fill="#0a0b14" opacity=".55"/>`,
    admin: `<path d="M10 2.5 16 5v4.5c0 4-2.6 6.7-6 7.8-3.4-1.1-6-3.8-6-7.8V5z" fill="#f472b6"/><path d="M7.3 9.8l1.8 1.8 3.6-3.9" fill="none" stroke="#0a0b14" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    "theme-light": `<circle cx="10" cy="10" r="3.6" fill="#fbbf24"/><g stroke="#fbbf24" stroke-width="1.4" stroke-linecap="round"><path d="M10 2.5v2.2"/><path d="M10 15.3v2.2"/><path d="M17.5 10h-2.2"/><path d="M4.7 10H2.5"/><path d="M15.3 4.7l-1.5 1.5"/><path d="M6.2 13.8l-1.5 1.5"/><path d="M15.3 15.3l-1.5-1.5"/><path d="M6.2 6.2l-1.5-1.5"/></g>`,
    "theme-dark": `<path d="M16.8 12.4A7 7 0 0 1 7.6 3.2 7 7 0 1 0 16.8 12.4z" fill="#8b5cf6"/>`,
    "theme-system": `<rect x="2.5" y="3.5" width="15" height="10" rx="1.6" fill="#22d3ee"/><rect x="4" y="5" width="12" height="7" rx=".6" fill="#0a0b14"/><rect x="7" y="15.5" width="6" height="1.4" rx=".7" fill="#22d3ee"/>`,
    profile: `<circle cx="10" cy="7" r="3.4" fill="#8b5cf6"/><path d="M3.3 17c.6-3.4 3.2-5.4 6.7-5.4s6.1 2 6.7 5.4z" fill="#8b5cf6" opacity=".7"/>`,
    "user-profile": `<circle cx="10" cy="7" r="3.4" fill="#8b5cf6"/><path d="M3.3 17c.6-3.4 3.2-5.4 6.7-5.4s6.1 2 6.7 5.4z" fill="#8b5cf6" opacity=".7"/>`,
    language: `<circle cx="10" cy="10" r="7" fill="none" stroke="#22d3ee" stroke-width="1.6"/><path d="M3 10h14M10 3c2 2 3 4.5 3 7s-1 5-3 7M10 3c-2 2-3 4.5-3 7s1 5 3 7" fill="none" stroke="#22d3ee" stroke-width="1.2"/>`,
    audit: `<path d="M4 3.5h12v13H4z" fill="#f472b6"/><path d="M6.5 7h7M6.5 10h7M6.5 13h4" stroke="#0a0b14" stroke-width="1.2" stroke-linecap="round"/>`,
    general: `<circle cx="10" cy="10" r="7" fill="#8b5cf6"/><path d="M10 5.5v5l3 2" stroke="#0a0b14" stroke-width="1.5" stroke-linecap="round"/>`,
    logout: `<path d="M8 2.8H4.6c-1 0-1.8.8-1.8 1.8v10.8c0 1 .8 1.8 1.8 1.8H8" fill="none" stroke="#e94560" stroke-width="1.6" stroke-linecap="round"/><path d="M12.3 6.5 16 10l-3.7 3.5" fill="none" stroke="#e94560" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 10H7.5" stroke="#e94560" stroke-width="1.6" stroke-linecap="round"/>`,
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
    trophy: `<path d="M6 3.5h8v3.7c0 3-1.5 5.2-4 6.1-2.5-.9-4-3.1-4-6.1z" fill="#fbbf24"/><path d="M6 5H3.5v2c0 1.9 1.2 3.2 3 3.5M14 5h2.5v2c0 1.9-1.2 3.2-3 3.5" fill="none" stroke="#fbbf24" stroke-width="1.4" stroke-linecap="round"/><path d="M10 13.3v2.8M7.2 17h5.6" stroke="#fbbf24" stroke-width="1.5" stroke-linecap="round"/>`,
    star: `<path d="m10 2.8 2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z" fill="#fbbf24"/>`,
    roles: `<path d="M6.5 5.2a2.7 2.7 0 1 0 0 5.4 2.7 2.7 0 0 0 0-5.4M13.7 6.2a2.2 2.2 0 1 0 0 4.4M2.8 16.8c.5-2.7 1.9-4.2 3.7-4.2s3.2 1.5 3.7 4.2M11.2 13c1.8-.1 3.5 1.2 4.1 3.8" fill="#8b5cf6"/>`,
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
    "shield-plus": `<path d="M10 2.5 16 5v4.5c0 4-2.6 6.7-6 7.8-3.4-1.1-6-3.8-6-7.8V5z" fill="#22d3ee"/><path d="M10 7v6M7 10h6" stroke="#0a0b14" stroke-width="1.4" stroke-linecap="round"/>`,
    note: `<rect x="4" y="3" width="12" height="14" rx="1.5" fill="#94a3b8"/><path d="M6.5 7h7M6.5 10h7M6.5 13h4" stroke="#0b0d15" stroke-width="1.2" stroke-linecap="round"/>`,
    clock: `<circle cx="10" cy="10" r="7" fill="#fbbf24"/><path d="M10 6v4l2.7 1.7" stroke="#0b0d15" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`,
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
    discord: `<path d="M5 5.5c3.3-1.8 6.7-1.8 10 0 1.1 1.8 1.7 3.8 1.7 6 0 2.2-1.7 4.3-4.8 5.3l-1.2-1.6c.7-.2 1.3-.5 1.8-.9-1.5.7-3 .9-4.5.9s-3-.2-4.5-.9c.5.4 1.1.7 1.8.9l-1.2 1.6C2.7 15.8 3 13.7 3 11.5c0-2.2.6-4.2 2-6z" fill="#5865f2"/><circle cx="7.5" cy="10.8" r="1" fill="#fff"/><circle cx="12.5" cy="10.8" r="1" fill="#fff"/>`,
};
function icon(name, sizePx = 18) {
    const inner = ICON_PATHS[name] || `<circle cx="10" cy="10" r="3.5" fill="#8b5cf6"/>`;
    return `<span class="nav-svg-icon" aria-hidden="true"><svg width="${sizePx}" height="${sizePx}" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">${inner}</svg></span>`;
}
function navIcon(name, sizePx) { return icon(name, sizePx); }
function autoButtonIcon(button) {
    if (!button || button.disabled || button.dataset.noAutoIcon === "true")
        return;
    if (button.querySelector(".nav-svg-icon"))
        return;
    const text = (button.textContent || "").trim().toLowerCase();
    if (!text || button.classList.contains("wizard-step"))
        return;
    let name = "sparkles";
    if (/^(close|cancel|exit|remove|delete|deny|clear|log out|logout|stop)/.test(text))
        name = "x";
    else if (/^(back|previous)/.test(text))
        name = "arrow-left";
    else if (/^(continue|next|save|create|add|send|apply|confirm|done|enable|connect|invite|open|manage)/.test(text))
        name = "arrow-right";
    else if (/search|find/.test(text))
        name = "search";
    else if (/refresh|reload|sync/.test(text))
        name = "refresh";
    else if (/edit|rename/.test(text))
        name = "edit";
    else if (/help|documentation|docs/.test(text))
        name = "help-circle";
    else if (/settings|configure/.test(text))
        name = "settings";
    else if (/channel|log/.test(text))
        name = "channel";
    else if (/mass|bulk|all/.test(text))
        name = "category-2";
    else if (/test/.test(text))
        name = "terminal-2";
    else if (/theme|light|dark/.test(text))
        name = "theme-dark";
    const holder = document.createElement("span");
    holder.innerHTML = icon(name, 16);
    const svg = holder.firstElementChild;
    if (svg)
        button.insertBefore(svg, button.firstChild);
    button.dataset.autoIcon = "1";
}
function decorateAllButtons(root = document) {
    root.querySelectorAll("button").forEach(autoButtonIcon);
}
const TABLER_TO_NEXORIA = {
    "ti-plus": "plus", "ti-minus": "minus", "ti-x": "x", "ti-arrow-left": "arrow-left", "ti-arrow-right": "arrow-right",
    "ti-chevron-right": "chevron-right", "ti-chevron-down": "chevron-down", "ti-home": "dashboard", "ti-ticket": "tickets", "ti-crown": "premium",
    "ti-eye": "eye", "ti-eye-off": "eye-off", "ti-server-2": "servers", "ti-alert-triangle": "alert-triangle", "ti-folder-off": "folder-off",
    "ti-refresh": "refresh", "ti-edit": "edit", "ti-settings": "settings", "ti-search": "search", "ti-help-circle": "help-circle",
    "ti-brand-discord": "discord", "ti-user": "user", "ti-users": "users", "ti-lock": "lock", "ti-lock-open": "lock-open",
    "ti-lock-check": "lock-check", "ti-tag": "tag", "ti-link": "link", "ti-link-off": "link-off", "ti-copy": "copy", "ti-trash": "trash",
    "ti-plug-connected-x": "plug-connected-x", "ti-circle-check": "check", "ti-message-off": "message-off", "ti-ticket-off": "ticket-off",
    "ti-info-circle": "info", "ti-channel": "channel", "ti-bell": "bell", "ti-shield": "shield", "ti-activity": "activity", "ti-database": "storage",
    "ti-code": "code", "ti-terminal-2": "terminal-2", "ti-variable": "variable", "ti-webhook": "webhook", "ti-logout": "logout", "ti-login": "login"
};
function replaceLegacyTablerIcons(root = document) {
    root.querySelectorAll?.("i.ti").forEach(el => {
        const cls = [...el.classList].find(c => c !== "ti");
        const name = TABLER_TO_NEXORIA[cls] || (cls ? cls.replace(/^ti-/, "") : "sparkles");
        const holder = document.createElement("span");
        holder.innerHTML = icon(name);
        const replacement = holder.firstElementChild;
        if (replacement)
            el.replaceWith(replacement);
    });
}
const buttonIconObserver = new MutationObserver(mutations => {
    for (const m of mutations)
        for (const n of m.addedNodes) {
            if (n.nodeType !== 1)
                continue;
            replaceLegacyTablerIcons(n);
            if (n.matches?.("button"))
                autoButtonIcon(n);
            n.querySelectorAll?.("button").forEach(autoButtonIcon);
        }
});
buttonIconObserver.observe(document.documentElement, { childList: true, subtree: true });
window.DC = window.DC || {};
window.DC.pageDirty = false;
window.DC.pageDirtyReason = "Unsaved changes";
window.DC.markPageDirty = reason => { window.DC.pageDirty=true; window.DC.pageDirtyReason=reason||"Unsaved changes"; };
window.DC.clearPageDirty = () => { window.DC.pageDirty=false; window.DC.pageDirtyReason="Unsaved changes"; };
let __dirtyNavigationPending = null;
async function confirmDirtyNavigation(targetUrl, replace=false){
    if(!window.DC.pageDirty) return true;
    if(__dirtyNavigationPending) return false;
    __dirtyNavigationPending=true;
    const ok=await DCModal.confirm(`You have ${escapeHtml(window.DC.pageDirtyReason||"unsaved changes")}. Are you sure you want to leave without saving?`,{title:"Leave without saving?",confirmLabel:"Leave without saving",cancelLabel:"Stay",danger:true}).catch(()=>false);
    __dirtyNavigationPending=null;
    if(ok){window.DC.clearPageDirty(); routes.go(targetUrl,replace,true);}
    return false;
}
window.addEventListener("beforeunload",e=>{if(window.DC.pageDirty){e.preventDefault();e.returnValue="";return "";}});
let __lastRouteUrl=window.location.href;
const routes = {
    parse() {
        const base = String(CFG?.BASE_PATH || getSiteBasePath()).replace(/\/+$/, "");
        let path = window.location.pathname;
        if (base && path.startsWith(base)) path = path.slice(base.length);
        path = path.replace(/^\/|\/$/g, "");
        const parts = path.split("/").filter(Boolean);
        if (parts[0] === "dashboard")
            return { screen: "picker", panel: "dashboard" };
        if (parts[0] === "my-tickets") {
            if (parts[1] === "ticket" && parts[2] && parts[3])
                return { screen: "picker", panel: "my-tickets", myTicketGuildId: parts[2], myTicketId: parts[3] };
            return { screen: "picker", panel: "my-tickets" };
        }
        if (parts[0] === "premium")
            return { screen: "picker", panel: "premium" };
        if (parts[0] === "leaderboards")
            return { screen: "picker", panel: "leaderboards" };
        if (parts[0] === "docs")
            return { screen: "picker", panel: "docs", docsModuleId: parts[1] || null };
        if (parts[0] === "terms" || parts[0] === "terms-of-service") return { screen: "policy", policy: "terms" };
        if (parts[0] === "privacy" || parts[0] === "privacy-policy") return { screen: "policy", policy: "privacy" };
        if (parts[0] === "admin")
            return { screen: "picker", panel: "admin" };
        if (parts[0] === "settings" || parts[0] === "profile" || parts[0] === "integrations")
            return { screen: "picker", panel: "profile" };
        if (parts[0] === "share" && parts[1])
            return { screen: "share", shareId: parts[1] };
        if (parts[0] === "servers" && parts[1]) {
            const guildId = parts[1];
            const moduleId = parts[2] || "ticket-tool";
            if (parts[3] === "ticket" && parts[4])
                return { screen: "dashboard", guildId, panel: moduleId, ticketId: parts[4] };
            const tab = parts[3] || null;
            return { screen: "dashboard", guildId, panel: moduleId, tab };
        }
        return { screen: "landing" };
    },
    go(url, replace = false, force = false) {
        const base = getSiteBasePath().replace(/\/$/, "");
        const normalized = String(url || "").startsWith("/") ? String(url) : `/${String(url || "")}`;
        const full = `${base}${normalized}`;
        if (!force && window.DC.pageDirty) { confirmDirtyNavigation(full,replace); return false; }
        if (replace) window.history.replaceState({}, "", full); else window.history.pushState({}, "", full);
        __lastRouteUrl=window.location.href;
        return true;
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
window.addEventListener("popstate", () => renderFromRoute().catch(e => scheduleRouteRetry(e?.message || "history navigation failed")));
window.addEventListener("pageshow", e => { if (e.persisted) renderFromRoute().catch(err => scheduleRouteRetry(err?.message || "bfcache restore failed")); });
function escapeHtml(s) { return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
const DCModal = (() => {
    const root = () => document.getElementById("dc-modal-root");
    function close() {
        const r = root();
        r.innerHTML = "";
        r.classList.remove("dc-modal-open");
        document.removeEventListener("keydown", onEscape);
    }
    function onEscape(e) {
        if (e.key === "Escape")
            close();
    }
    function open(bodyHtml, { maxWidth = "440px", panelClass = "", onMount } = {}) {
        const r = root();
        r.classList.add("dc-modal-open");
        r.innerHTML = `
      <div class="dc-modal-overlay">
        <div class="dc-modal-panel ${escapeHtml(panelClass)}" style="max-width:${maxWidth}">${bodyHtml}</div>
      </div>`;
        r.querySelector(".dc-modal-overlay")?.addEventListener("click", (e) => {
            if (e.target.classList.contains("dc-modal-overlay"))
                close();
        });
        document.addEventListener("keydown", onEscape);
        if (onMount)
            onMount(r);
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
                    r.querySelector("#dc-modal-cancel")?.addEventListener("click", () => { close(); resolve(false); });
                    r.querySelector("#dc-modal-confirm")?.addEventListener("click", () => { close(); resolve(true); });
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
                onMount: (r) => r.querySelector("#dc-modal-ok")?.addEventListener("click", () => { close(); resolve(); }),
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
                    input.addEventListener("keydown", (e) => {
                        if (e.key === "Enter") {
                            close();
                            resolve(input.value);
                        }
                    });
                    r.querySelector("#dc-modal-cancel")?.addEventListener("click", () => { close(); resolve(null); });
                    r.querySelector("#dc-modal-confirm")?.addEventListener("click", () => { close(); resolve(input.value); });
                },
            });
        });
    }
    function custom(bodyHtml, opts = {}) {
        return open(bodyHtml, opts);
    }
    return { confirm, alert: alertModal, prompt: promptModal, custom, close };
})();
function base64url(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function makeVerifierAndChallenge() {
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return { verifier, challenge: base64url(digest) };
}
function getRedirectUri() {
    // Discord requires an exact redirect URI match. Do not strip the trailing slash
    // because Discord treats /NEXORIA and /NEXORIA/ as different redirect URIs.
    const configured = String(CFG?.REDIRECT_URI || "").trim();
    if (configured) return configured.replace(/\s+$/g, "");
    const base = getSiteBasePath();
    return `${window.location.origin}${base.endsWith("/") ? base : `${base}/`}`;
}
async function beginLogin() {
    if (!CFG.DISCORD_CLIENT_ID) {
        throw new Error("Discord login is not configured yet. Set DISCORD_CLIENT_ID in config.env and run the tunnel script again so the public site config is updated.");
    }
    const { verifier, challenge } = await makeVerifierAndChallenge();
    // Every login attempt gets a fresh PKCE verifier/state and therefore a fresh one-time Discord authorization code.
    sessionStorage.removeItem(LS.verifier);
    sessionStorage.removeItem("nexoria_discord_oauth_state");
    sessionStorage.setItem(LS.verifier, verifier);
    sessionStorage.setItem("tk_post_login_redirect", "/dashboard");
    const state = `dc_${crypto.randomUUID()}`;
    sessionStorage.setItem("nexoria_discord_oauth_state", state);
    const params = new URLSearchParams({
        client_id: CFG.DISCORD_CLIENT_ID,
        redirect_uri: getRedirectUri(),
        response_type: "code",
        scope: (Array.isArray(CFG.OAUTH_SCOPES) ? CFG.OAUTH_SCOPES : ["identify", "guilds"]).filter(x => ["identify", "guilds"].includes(x)).join(" ") || "identify guilds",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
        prompt: "consent",
    });
    window.location.href = `https://discord.com/oauth2/authorize?${params.toString()}`;
}
async function exchangeCodeForToken(code) {
    const verifier = sessionStorage.getItem(LS.verifier);
    if (!verifier) throw new Error("The OAuth session expired. Please start Discord login again.");
    let res2;
    try {
        res2 = await fetch(`${CFG.LOCAL_BOT_URL}/oauth/exchange`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, verifier, redirect_uri: getRedirectUri() }),
        });
    } catch {
        throw new Error("Could not complete login. Is your bot running?");
    }
    const data = await res2.json().catch(() => ({}));
    if (!res2.ok) throw new Error(data?.error || "Could not complete login. Please start Discord login again to generate a fresh authorization code.");
    sessionStorage.removeItem(LS.verifier);
    return data;
}
function saveSession(tokenData, user) {
    localStorage.setItem(LS.token, tokenData.access_token);
    localStorage.setItem(LS.tokenExpiry, String(Date.now() + tokenData.expires_in * 1000));
    localStorage.setItem(LS.user, JSON.stringify(user));
}
function getSession() {
    const token = localStorage.getItem(LS.token);
    const expiry = Number(localStorage.getItem(LS.tokenExpiry) || 0);
    if (!token || Date.now() > expiry) {
        if (token) clearSession();
        return null;
    }
    return { token, user: JSON.parse(localStorage.getItem(LS.user) || "null") };
}
function clearSession() { [LS.token, LS.tokenExpiry, LS.user].forEach(k => localStorage.removeItem(k)); }
async function fetchMe(token) {
    let res;
    try {
        res = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${token}` } });
    }
    catch {
        throw new Error("Couldn't reach Discord — check your internet connection and try again.");
    }
    if (!res.ok)
        throw new Error("Failed to load Discord profile");
    return res.json();
}
let discordGuildCache = null;
let discordGuildCacheAt = 0;
let discordGuildRequest = null;
let discordGuildRetryAt = 0;
async function fetchMyGuilds(token) {
    const now = Date.now();
    if (discordGuildCache && now - discordGuildCacheAt < 15000) return discordGuildCache;
    if (discordGuildRequest) return discordGuildRequest;
    if (discordGuildRetryAt > now) {
        await new Promise(r => setTimeout(r, discordGuildRetryAt - now));
    }
    discordGuildRequest = (async () => {
        const headers = { Authorization: `Bearer ${token}` };
        let res;
        try {
            res = await fetch("https://discord.com/api/users/@me/guilds", { headers, cache: "no-store" });
        } catch {
            throw new Error("Couldn't reach Discord — check your internet connection and try again.");
        }
        if (res.status === 401) {
            discordGuildCache = null;
            throw new Error("Your login has expired — please log in again.");
        }
        if (res.status === 429) {
            const retryAfterSec = Math.min(Math.max(Number(res.headers.get("retry-after")) || 3, 1), 15);
            discordGuildRetryAt = Date.now() + retryAfterSec * 1000;
            await new Promise(resolve => setTimeout(resolve, retryAfterSec * 1000));
            try {
                res = await fetch("https://discord.com/api/users/@me/guilds", { headers, cache: "no-store" });
            } catch {
                throw new Error("Couldn't reach Discord — check your internet connection and try again.");
            }
            if (res.status === 429) {
                const retry = Math.min(Math.max(Number(res.headers.get("retry-after")) || 5, 2), 20);
                discordGuildRetryAt = Date.now() + retry * 1000;
                throw new Error(`Discord is rate-limiting server access. Please wait ${Math.ceil(retry)} seconds and try again.`);
            }
        }
        if (!res.ok) throw new Error(`Failed to load your servers (HTTP ${res.status}).`);
        const data = await res.json();
        discordGuildCache = Array.isArray(data) ? data : [];
        discordGuildCacheAt = Date.now();
        discordGuildRetryAt = 0;
        return discordGuildCache;
    })();
    try { return await discordGuildRequest; } finally { discordGuildRequest = null; }
}

function isAdmin(guild) {
    return guild.owner || (BigInt(guild.permissions) & BigInt(ADMINISTRATOR)) === BigInt(ADMINISTRATOR);
}
let publicConfigRefreshAt = 0;
async function refreshPublicConfig() {
    const now = Date.now();
    if (now - publicConfigRefreshAt < 1000) return Boolean(CFG?.LOCAL_BOT_URL || CFG?.HOSTS?.length || CFG?.LOCAL_BOT_URLS?.length);
    publicConfigRefreshAt = now;
    try {
        if (!CFG) await loadPublicConfig();
        const response = await fetch(versionedAsset(siteAsset("data/config.json")) + `&runtime=${now}`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
        if (!response.ok) return Boolean(CFG?.LOCAL_BOT_URL || CFG?.HOSTS?.length || CFG?.LOCAL_BOT_URLS?.length);
        const next = await response.json();
        if (next && typeof next === "object") {
            Object.assign(CFG || (CFG = {}), next);
            window.NEXORIA_CONFIG = CFG;
            if (!activeBotUrl && CFG.LOCAL_BOT_URL) activeBotUrl = String(CFG.LOCAL_BOT_URL).trim().replace(/\/$/, "");
        }
    } catch {}
    return Boolean(CFG?.LOCAL_BOT_URL || CFG?.HOSTS?.length || CFG?.LOCAL_BOT_URLS?.length);
}

let botStatusState = "checking";
let botStatusFailedAt = 0;
let activeBotUrl = "";
const HOST_FAIL_LIMIT = 5;
const hostFailureCounts = new Map();
const hostSuccessCounts = new Map();

function getBotTargets() {
    const seen = new Set();
    const targets = [];
    const add = (url, id = "") => {
        const clean = String(url || "").trim().replace(/\/$/, "");
        if (!clean || seen.has(clean)) return;
        seen.add(clean);
        targets.push({ url: clean, id: String(id || "").trim() });
    };
    if (Array.isArray(CFG?.HOSTS)) {
        for (const host of CFG.HOSTS) {
            if (host && typeof host === "object") add(host.url, host.id);
            else add(host);
        }
    }
    if (Array.isArray(CFG?.LOCAL_BOT_URLS)) {
        for (const url of CFG.LOCAL_BOT_URLS) add(url);
    }
    add(CFG?.LOCAL_BOT_URL, CFG?.NEXORIA_HOST_ID);
    return targets;
}

function setActiveBotUrl(url) {
    const clean = String(url || "").trim().replace(/\/$/, "");
    if (clean) {
        activeBotUrl = clean;
        if (CFG) CFG.LOCAL_BOT_URL = clean;
    }
}

function recordHostFailure(url) {
    const clean = String(url || "").trim().replace(/\/$/, "");
    if (!clean) return 0;
    const next = (hostFailureCounts.get(clean) || 0) + 1;
    hostFailureCounts.set(clean, next);
    hostSuccessCounts.delete(clean);
    return next;
}

function recordHostSuccess(url) {
    const clean = String(url || "").trim().replace(/\/$/, "");
    if (!clean) return;
    hostFailureCounts.set(clean, 0);
    hostSuccessCounts.set(clean, (hostSuccessCounts.get(clean) || 0) + 1);
}

function hostIsExhausted(url) {
    return (hostFailureCounts.get(String(url || "").trim().replace(/\/$/, "")) || 0) >= HOST_FAIL_LIMIT;
}

function orderedBotTargets() {
    const targets = getBotTargets();
    if (!targets.length) return [];
    const active = activeBotUrl;
    const preferred = targets.find(t => t.url === active && !hostIsExhausted(t.url));
    const healthy = targets.filter(t => !hostIsExhausted(t.url) && t.url !== active);
    const exhausted = targets.filter(t => hostIsExhausted(t.url));
    return [
        ...(preferred ? [preferred] : []),
        ...healthy.sort((a,b) => (hostFailureCounts.get(a.url)||0) - (hostFailureCounts.get(b.url)||0)),
        ...exhausted
    ];
}

function selectNextBotTarget(failedUrl) {
    const targets = getBotTargets();
    const next = targets.find(t => t.url !== failedUrl && !hostIsExhausted(t.url));
    if (next) setActiveBotUrl(next.url);
    return next || null;
}

async function pingLocalBot() {
    try { await refreshPublicConfig(); } catch (e) { console.warn("[status] public config refresh failed:", e?.message || e); }
    const targets = orderedBotTargets();
    if (!targets.length) {
        if (!botStatusFailedAt) botStatusFailedAt = Date.now();
        botStatusState = (Date.now() - botStatusFailedAt >= 3000) ? "offline" : "checking";
        return null;
    }
    const onlineHosts = [];
    let selected = null;
    for (const target of targets) {
        const startedAt = performance.now();
        try {
            const response = await fetch(`${target.url}/status`, {
                method: "GET", headers: { "Accept": "application/json", "X-NEXORIA-SITE": "1" },
                cache: "no-store", signal: AbortSignal.timeout(3000)
            });
            if (!response.ok) {
                const count = recordHostFailure(target.url);
                if (count >= HOST_FAIL_LIMIT && target.url === activeBotUrl) selectNextBotTarget(target.url);
                continue;
            }
            const data = await response.json();
            if (!data || typeof data !== "object" || !data.online) {
                const count = recordHostFailure(target.url);
                if (count >= HOST_FAIL_LIMIT && target.url === activeBotUrl) selectNextBotTarget(target.url);
                continue;
            }
            recordHostSuccess(target.url);
            const hostId = String(data.hostId || target.id || "").trim();
            const latencyMs = Math.round(performance.now() - startedAt);
            onlineHosts.push({ id: hostId || target.url, url: target.url, latencyMs });
            if (!selected) selected = { ...data, latencyMs, hostId: hostId || target.id || null, hostUrl: target.url };
        } catch {
            const count = recordHostFailure(target.url);
            if (count >= HOST_FAIL_LIMIT && target.url === activeBotUrl) selectNextBotTarget(target.url);
        }
    }
    if (selected) {
        setActiveBotUrl(selected.hostUrl);
        botStatusState = "online"; botStatusFailedAt = 0;
        selected.hosts = onlineHosts; selected.hostCount = onlineHosts.length;
        return selected;
    }
    if (!botStatusFailedAt) botStatusFailedAt = Date.now();
    botStatusState = (Date.now() - botStatusFailedAt >= 3000) ? "offline" : "checking";
    return null;
}

async function api(path, options = {}) {
    if (!CFG?.LOCAL_BOT_URL && !getBotTargets().length)
        await refreshPublicConfig();
    const targets = orderedBotTargets();
    if (!targets.length)
        throw new Error("NEXORIA bridge is waiting for start-tunnel.ps1 and bot.js.");

    const method = String(options.method || "GET").toUpperCase();
    const retryable = method === "GET" || method === "HEAD";
    const maxAttemptsPerHost = retryable ? 3 : 1;
    let lastError = null;

    for (const target of targets) {
        if (hostIsExhausted(target.url) && targets.some(t => !hostIsExhausted(t.url))) continue;
        for (let attempt = 1; attempt <= maxAttemptsPerHost; attempt++) {
            try {
                const headers = {
                    "Accept": "application/json",
                    ...(options.body ? { "Content-Type": "application/json" } : {}),
                    "X-NEXORIA-SITE": "1",
                    ...(options.headers || {})
                };
                const res = await fetch(`${target.url}${path}`, {
                    ...options,
                    headers,
                    cache: "no-store",
                    signal: options.signal || AbortSignal.timeout(10000)
                });
                if (res.ok) {
                    recordHostSuccess(target.url);
                    setActiveBotUrl(target.url);
                    return res;
                }
                if ([401, 403, 404].includes(res.status)) return res;
                const count = recordHostFailure(target.url);
                if (count >= HOST_FAIL_LIMIT) break;
                if (retryable && attempt < maxAttemptsPerHost && [408, 429, 500, 502, 503, 504].includes(res.status)) {
                    const retryAfter = Number(res.headers.get("retry-after"));
                    const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(10000, retryAfter * 1000) : 350 * attempt;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                lastError = new Error(`Request failed (HTTP ${res.status}).`);
                break;
            } catch (e) {
                lastError = e;
                const count = recordHostFailure(target.url);
                if (count >= HOST_FAIL_LIMIT) break;
                if (!retryable || attempt >= maxAttemptsPerHost) break;
                await new Promise(resolve => setTimeout(resolve, 350 * attempt));
            }
        }
        if (!hostIsExhausted(target.url)) continue;
        const next = selectNextBotTarget(target.url);
        if (next) continue;
    }

    const e = lastError || new Error("Request failed");
    throw e;
}
function renderStatusPip(el, botInfo, state = "normal") {
    el.classList.remove("online", "offline", "checking");
    if (state === "checking") {
        el.classList.add("checking");
        el.innerHTML = `<span class="status-dot"></span>Checking…`;
        return;
    }
    if (botInfo && botInfo.online) {
        el.classList.add("online");
        const latency = botInfo.latencyMs != null ? `${botInfo.latencyMs}ms` : "—";
        const uptime = formatUptime(botInfo.uptimeSeconds);
        const hostIds = Array.isArray(botInfo.hosts) ? botInfo.hosts.map(h => String(h.id || "").trim()).filter(Boolean) : [];
        const totalHosts = Math.max(hostIds.length, getBotTargets().length);
        const hostLabel = `${hostIds.length}/${totalHosts || hostIds.length} online`;
        el.innerHTML = `<span class="status-dot"></span>${escapeHtml(hostLabel)} <span class="status-pip-sep">·</span> ${latency} <span class="status-pip-sep">·</span> up ${uptime}`;
    }
    else {
        el.classList.add("offline");
        el.innerHTML = `<span class="status-dot"></span>Bot Servers down`;
    }
}
function timeAgoGlobal(iso) {
    if (!iso)
        return "—";
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1)
        return "just now";
    if (mins < 60)
        return `${mins} minute${mins === 1 ? "" : "s"} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24)
        return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.floor(hours / 24);
    if (days < 30)
        return `${days} day${days === 1 ? "" : "s"} ago`;
    const months = Math.floor(days / 30);
    if (months < 12)
        return `${months} month${months === 1 ? "" : "s"} ago`;
    const years = Math.floor(months / 12);
    return `${years} year${years === 1 ? "" : "s"} ago`;
}
let botInfoCache = null;
let currentGuild = null;
let currentGuildDisabledModules = [];
let routeRetryTimer = null;
let routeRetryAttempt = 0;
let routeRenderInFlight = false;
function scheduleRouteRetry(reason = "temporary network failure") {
    if (routeRetryTimer)
        return;
    routeRetryAttempt = Math.min(routeRetryAttempt + 1, 8);
    const delay = Math.min(15000, 1000 * Math.pow(1.6, routeRetryAttempt - 1));
    console.warn(`[route] ${reason}; retrying in ${Math.round(delay)}ms.`);
    routeRetryTimer = setTimeout(async () => {
        routeRetryTimer = null;
        try {
            await renderFromRoute();
            routeRetryAttempt = 0;
        }
        catch (e) {
            scheduleRouteRetry(e?.message || "screen failed to render");
        }
    }, delay);
}
function retryInBackground(fn, label = "operation", delay = 1500) {
    let stopped = false;
    const run = async () => {
        if (stopped)
            return;
        try {
            await fn();
        }
        catch (e) {
            console.warn(`[retry] ${label} failed; retrying...`, e);
        }
        if (!stopped)
            setTimeout(run, delay);
    };
    run();
    return () => { stopped = true; };
}
async function boot() {
    if (window.location.hash) {
        window.history.replaceState({}, "", window.location.pathname + window.location.search);
    }
    const redirectPath = sessionStorage.getItem("tk_redirect_path");
    if (redirectPath) {
        sessionStorage.removeItem("tk_redirect_path");
        window.history.replaceState({}, "", redirectPath);
    }
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const callbackState = url.searchParams.get("state");
    const robloxAuth = sessionStorage.getItem("nexoria_roblox_oauth");
    let handledRobloxCallback = false;
    if (code && robloxAuth && callbackState) {
        try {
            const saved = JSON.parse(robloxAuth);
            // Only consume this callback when it is unmistakably the Roblox flow.
            // Discord OAuth can also return `code`/`state`; never let that callback
            // accidentally trigger the Roblox verifier.
            if (!saved || !saved.state || !String(saved.state).startsWith("rbx_") || saved.state !== callbackState) {
                // This is another OAuth provider's callback; leave it alone.
            } else {
                handledRobloxCallback = true;
            const data = await api("/oauth/roblox/exchange", { method: "POST", body: JSON.stringify({ code, code_verifier: saved.verifier, discordUserId: saved.discordUserId, redirect_uri: saved.redirectUri }) });
            sessionStorage.removeItem("nexoria_roblox_oauth");
            url.searchParams.delete("code");
            url.searchParams.delete("state");
            window.history.replaceState({}, "", url.pathname + url.search);
                await DCModal.alert(`Connected Roblox account: ${data.account?.displayName || data.account?.username || data.account?.id}`, { title: "Roblox connected" });
                routes.go("/integrations", true);
                renderFromRoute();
                return;
            }
        }
        catch (e) {
            sessionStorage.removeItem("nexoria_roblox_oauth");
            url.searchParams.delete("code");
            url.searchParams.delete("state");
            window.history.replaceState({}, "", url.pathname + url.search);
            await DCModal.alert(e.message || "Roblox connection failed", { title: "Roblox connection failed" });
        }
    }
    const storedSession = getSession();
    if (storedSession?.token) {
        try {
            const freshUser = await fetchMe(storedSession.token);
            localStorage.setItem(LS.user, JSON.stringify(freshUser));
        } catch {
            clearSession();
        }
    }
    const route = routes.parse();
    if (route.screen === "share") {
        await enterSharePage(route.shareId);
        return;
    }
    if (route.screen === "policy") {
        const siteRoot = window.location.origin + getSiteBasePath();
        window.location.replace(`${siteRoot}site/policy/${route.policy}.html`);
        return;
    }
    void refreshHeroStatus().catch(e => console.error("[status] initial refresh failed:", e));
    if (code) {
        const expectedDiscordState = sessionStorage.getItem("nexoria_discord_oauth_state");
        if (expectedDiscordState && callbackState !== expectedDiscordState) {
            sessionStorage.removeItem("nexoria_discord_oauth_state");
            url.searchParams.delete("code");
            url.searchParams.delete("state");
            window.history.replaceState({}, "", url.pathname + url.search);
            await DCModal.alert("The Discord authorization response could not be verified. Please start the login again.", { title: "Login verification failed" });
            routes.go("/", true);
            showScreen("screen-landing");
            return;
        }
        sessionStorage.removeItem("nexoria_discord_oauth_state");
        url.searchParams.delete("code");
        window.history.replaceState({}, "", url.pathname + url.search);
        try {
            const tokenData = await exchangeCodeForToken(code);
            const user = await fetchMe(tokenData.access_token);
            saveSession(tokenData, user);
            routes.go(sessionStorage.getItem("tk_post_login_redirect") || "/dashboard", true);
            try {
                await renderFromRoute();
            }
            catch (e) {
                scheduleRouteRetry(e?.message || "screen failed to render after login");
            }
        }
        catch (e) {
            await DCModal.alert(e.message || "Login failed", { title: "Login failed" });
            routes.go("/", true);
            showScreen("screen-landing");
        }
        return;
    }
    try {
        await renderFromRoute();
        routeRetryAttempt = 0;
    }
    catch (e) {
        scheduleRouteRetry(e?.message || "screen failed to render");
    }
}
async function renderFromRoute() {
    if (routeRenderInFlight)
        return;
    routeRenderInFlight = true;
    try {
    const route = routes.parse();
    const session = getSession();
    if (route.screen === "share") {
        await enterSharePage(route.shareId);
        return;
    }
    if (route.screen === "policy") {
        const siteRoot = window.location.origin + getSiteBasePath();
        window.location.replace(`${siteRoot}site/policy/${route.policy}.html`);
        return;
    }
    if (route.screen !== "landing" && !session) {
        routes.go("/", true);
        showScreen("screen-landing");
        return;
    }
    if (route.screen === "landing") {
        showScreen("screen-landing");
        return;
    }
    if (route.screen === "picker") {
        await enterPicker(route.panel, { myTicketGuildId: route.myTicketGuildId, myTicketId: route.myTicketId, docsModuleId: route.docsModuleId });
        return;
    }
    if (route.screen === "dashboard") {
        if (!currentGuild || currentGuild.id !== route.guildId) {
            currentGuild = { id: route.guildId, name: null, icon: null };
        }
        await enterDashboard(route.panel || "ticket-tool", { tab: route.tab, ticketId: route.ticketId });
    }
    } finally {
        routeRenderInFlight = false;
    }
}
let lastHeroRenderSignature = "";
async function refreshHeroStatus() {
    let info = null;
    try { info = await pingLocalBot(); } catch (e) { console.error("[status] pingLocalBot threw unexpectedly:", e); }
    if (info) botInfoCache = info;
    const displayInfo = info || (botStatusState === "online" ? botInfoCache : null);
    const signature = JSON.stringify({state:botStatusState,info:displayInfo ? {online:!!displayInfo.online,guildCount:displayInfo.guildCount,uptimeBucket:Math.floor((Number(displayInfo.uptimeSeconds)||0)/5),botTag:displayInfo.botTag,hosts:(displayInfo.hosts||[]).map(h=>({id:h.id,url:h.url})),guilds:(displayInfo.guilds||[]).map(g=>({id:g.id,name:g.name,icon:g.icon,memberCount:g.memberCount}))}:null});
    if(signature === lastHeroRenderSignature) return;
    lastHeroRenderSignature = signature;
    const heroPip = document.getElementById("hero-status-pip");
    if(heroPip) renderStatusPip(heroPip,displayInfo,botStatusState === "checking" ? "checking" : "normal");
    const set=(id,val)=>{const el=document.getElementById(id);if(el && el.textContent!==String(val))el.textContent=val;};
    const onlineHostIds = Array.isArray(displayInfo?.hosts) ? displayInfo.hosts.map(h => String(h.id || "")).filter(Boolean) : [];
    const totalHostCount = getBotTargets().length;
    set("hero-bot-url", botStatusState === "checking" ? "Checking…" : (displayInfo?.online ? (onlineHostIds.length ? onlineHostIds.join(" · ") : "Online") : "Down"));
    set("hero-bot-online-count", botStatusState === "checking" ? "—" : `${onlineHostIds.length}/${totalHostCount || onlineHostIds.length}`);
    set("hero-guild-count",displayInfo?.guildCount ?? "—");
    set("hero-uptime",displayInfo ? formatUptime(displayInfo.uptimeSeconds) : "—");
    set("hero-bot-tag",displayInfo?.botTag || displayInfo?.botUsername || "—");
    ["picker-status-pip","dash-status-pip"].forEach(id=>{const el=document.getElementById(id);if(el)renderStatusPip(el,displayInfo,botStatusState === "checking" ? "checking" : "normal");});
    try { paintWatchingPanel(displayInfo); } catch(e){ console.error("[status] paintWatchingPanel failed:",e); }
}
function paintWatchingPanel(info) {
    const panel = document.getElementById("watching-panel");
    if (!panel)
        return;
    const summary = document.getElementById("watching-summary");
    const list = document.getElementById("watching-top-list");
    panel.style.display = "block";
    const guilds = Array.isArray(info?.guilds) ? info.guilds : [];
    if (!info?.online || guilds.length === 0) {
        if (summary)
            summary.innerHTML = `<span class="accent">Top 3 servers</span> · unavailable while the bot is offline`;
        if (list) {
            list.innerHTML = [1, 2, 3].map(i => `
                <div class="watching-top-row watching-top-placeholder">
                  <span class="watching-top-rank">#${i}</span>
                  <span class="watching-top-icon server-icon">${icon("servers", 16)}</span>
                  <span class="watching-top-name">Waiting for bot data</span>
                  <span class="watching-top-count">—</span>
                </div>`).join("");
        }
        return;
    }
    const totalMembers = guilds.reduce((sum, g) => sum + (Number(g.memberCount) || 0), 0);
    if (summary)
        summary.innerHTML = `<span class="accent">${guilds.length}</span> server${guilds.length === 1 ? "" : "s"} · <span class="accent">${totalMembers.toLocaleString()}</span> member${totalMembers === 1 ? "" : "s"}`;
    const top3 = [...guilds].sort((a, b) => (Number(b.memberCount) || 0) - (Number(a.memberCount) || 0)).slice(0, 3);
    if (list) {
        list.innerHTML = top3.map((g, i) => `
        <div class="watching-top-row">
          <span class="watching-top-rank">#${i + 1}</span>
          ${g.icon ? `<img class="watching-top-icon" src="https://cdn.discordapp.com/icons/${encodeURIComponent(g.id)}/${encodeURIComponent(g.icon)}.png" alt="">` : `<span class="watching-top-icon server-icon watching-initials">${initials(g.name)}</span>`}
          <span class="watching-top-name">${escapeHtml(g.name)}</span>
          <span class="watching-top-count">${(Number(g.memberCount) || 0).toLocaleString()}</span>
        </div>`).join("");
    }
}
let pickerActivePanel = "dashboard";
async function enterPicker(panel, deepLink = {}) {
    showScreen("screen-picker");
    pickerActivePanel = panel || pickerActivePanel || "dashboard";
    window.NexoriaAI?.setVisible?.(pickerActivePanel === "docs");
    renderSidebarBottom("picker-sidebar-bottom");
    wirePickerServerSwitcher();
    await refreshHeroStatus();
    paintPickerNav();
    if (pickerActivePanel === "my-tickets" && deepLink.myTicketGuildId && deepLink.myTicketId) {
        await openMyTicketDetail(deepLink.myTicketGuildId, deepLink.myTicketId, false);
    }
    else {
        await renderPickerPanel(pickerActivePanel, deepLink);
    }
    document.querySelectorAll("#picker-sidebar [data-picker-panel]").forEach(el => {
        el.addEventListener("click", () => {
            pickerActivePanel = el.dataset.pickerPanel;
            window.NexoriaAI?.setVisible?.(pickerActivePanel === "docs");
            routes.go(pickerActivePanel === "dashboard" ? "/" : `/${pickerActivePanel}`);
            paintPickerNav();
            Promise.resolve(renderPickerPanel(pickerActivePanel)).catch(e => { console.error("[picker] panel render failed:", e); scheduleRouteRetry(e?.message || "picker render failed"); });
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
    if (panel === "my-tickets")
        return renderMyTicketsPanel(root);
    if (panel === "premium")
        return renderPremiumPanel(root);
    if (panel === "leaderboards")
        return renderLeaderboardsPanel(root);
    if (panel === "admin")
        return renderAdminPanel(root);
    if (panel === "profile")
        return renderProfileSettings(root);
    if (panel === "docs")
        return renderDocsPanel(root, deepLink.docsModuleId || null);
    return renderDashboardPanel(root);
}
let docsModulesCache = null;
let docsBundleCache = null;
async function loadDocumentationBundle() {
    if (docsBundleCache) return docsBundleCache;
    try {
        const r = await fetch(`${siteAsset("data/documentation.json")}?docs=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`Documentation bundle unavailable (HTTP ${r.status})`);
        docsBundleCache = await r.json();
    } catch (e) {
        console.warn("[docs] Static documentation bundle failed:", e);
        docsBundleCache = { general: [], modules: [], variables: [] };
    }
    return docsBundleCache;
}
async function loadDocsModuleList() {
    const bundle = await loadDocumentationBundle();
    return (bundle.modules || []).map(m => ({ id: m.moduleId, title: m.title, summary: m.summary, doc: m }));
}
function prettifyModuleId(id) { return id.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
let nexoriaAILoadPromise = null;
async function openNexoriaAI(scope = null) {
    try {
        console.debug("[NEXORIA AI] open requested", { scope });
        // The AI is normally loaded at the bottom of index.html. This path also
        // repairs the UI when a cached/failed script prevented it from initializing.
        if (!window.NexoriaAI) {
            if (!nexoriaAILoadPromise) {
                nexoriaAILoadPromise = new Promise((resolve, reject) => {
                    const finish = () => {
                        if (window.NexoriaAI) return resolve();
                        reject(new Error("NEXORIA AI loaded but did not initialize. Refresh the page and try again."));
                    };
                    const existing = [...document.scripts].find(x => /nexoria-ai\.js(?:\?|$)/.test(x.src));
                    if (existing) existing.remove();
                    const script = document.createElement("script");
                    script.src = versionedAsset(siteAsset("code/nexoria-ai.js")) + `&repair=${Date.now()}`;
                    script.async = true;
                    script.dataset.nexoriaAiLoader = "1";
                    const timeout = setTimeout(() => reject(new Error("NEXORIA AI took too long to load. Check that site/code/nexoria-ai.js is published.")), 8000);
                    script.onload = () => { clearTimeout(timeout); console.debug("[NEXORIA AI] script loaded", script.src); setTimeout(finish, 0); };
                    script.onerror = () => { clearTimeout(timeout); console.error("[NEXORIA AI] script failed", script.src); reject(new Error("Could not load NEXORIA AI. Check that site/code/nexoria-ai.js exists.")); };
                    document.head.appendChild(script);
                });
            }
            await nexoriaAILoadPromise;
        }
        if (!window.NexoriaAI) throw new Error("NEXORIA AI did not initialize.");
        if (scope) window.NexoriaAI.setScope?.(scope);
        window.NexoriaAI.setVisible?.(true);
        window.NexoriaAI.open?.({ expanded: true });
        return true;
    } catch (e) {
        nexoriaAILoadPromise = null;
        console.error("[AI] open failed", e);
        const message = e?.message || "NEXORIA AI could not be opened.";
        // Do not depend on the modal implementation to report an AI loading error.
        // A small native in-page notice keeps the button useful even if another
        // dashboard component failed to initialize.
        let notice = document.getElementById("nexoria-ai-open-error");
        if (!notice) {
            notice = document.createElement("div");
            notice.id = "nexoria-ai-open-error";
            notice.className = "nexoria-ai-open-error";
            notice.innerHTML = `<span></span><button type="button" aria-label="Close">×</button>`;
            document.body.appendChild(notice);
            notice.querySelector("button").addEventListener("click", () => notice.remove());
        }
        notice.querySelector("span").textContent = message;
        notice.style.display = "flex";
        clearTimeout(notice._timer);
        notice._timer = setTimeout(() => notice.remove(), 7000);
        return false;
    }
}

async function renderDocsPanel(root, initialModuleId) {
    root.innerHTML = `
    <div class="docs-heading-row"><div><h1 class="picker-heading">Documentation</h1><p class="picker-sub">Guides, module references, every variable, command action, setting, and feature NEXORIA exposes. This documentation works even while the bot is offline.</p></div><button type="button" class="btn btn-primary btn-small" id="docs-open-ai" data-open-nexoria-ai="1">Ask NEXORIA AI</button></div>
    <div class="docs-layout">
      <div class="docs-sidebar">
        <input type="text" class="search-input" id="docs-search" placeholder="Search documentation…" style="margin-bottom:10px">
        <div id="docs-module-list">${loadingBlock("Loading documentation…")}</div>
      </div>
      <div class="docs-content" id="docs-content">${loadingBlock("Loading…")}</div>
    </div>`;
    const modules = await loadDocsModuleList();
    const listEl = document.getElementById("docs-module-list");
    let activeId = initialModuleId && modules.some(m => m.id === initialModuleId) ? initialModuleId : null;
    function paintList(filter) {
        const q = (filter || "").toLowerCase().trim();
        const general = (docsBundleCache?.general || []).map(d => ({id:d.id || d.category || null,label:d.title || "Info",search:`${d.title||""} ${d.summary||""} ${(d.sections||[]).map(x=>`${x.heading} ${x.body}`).join(" ")}`,category:d.category||"System",doc:d}));
        const moduleItems = modules.map(m => ({ id:m.id,label:m.title||prettifyModuleId(m.id),search:`${m.title||""} ${m.summary||""} ${(m.doc?.sections||[]).map(x=>`${x.heading} ${x.body}`).join(" ")}`,category:m.doc?.category||"Modules",doc:m.doc }));
        const items=[...general,...moduleItems].filter(it=>!q||`${it.label} ${it.category} ${it.search||""}`.toLowerCase().includes(q));
        const groups={}; for(const it of items)(groups[it.category]=groups[it.category]||[]).push(it);
        const order=["Website","System","Modules","Reference"];
        const categoryHtml = cat => {
            const buttons = groups[cat].map(it => {
                const cls = activeId === it.id ? "active" : "";
                return `<button class="docs-sidebar-item ${cls}" data-docs-id="${escapeHtml(it.id || "")}">${icon(it.category === "Modules" ? "category-2" : "document", 16)} ${escapeHtml(it.label)}</button>`;
            }).join("");
            return `<div class="docs-category-title">${escapeHtml(cat)}</div>${buttons}`;
        };
        listEl.innerHTML = order.filter(c=>groups[c]?.length).concat(Object.keys(groups).filter(c=>!order.includes(c))).map(categoryHtml).join("") || `<div class="field-hint" style="padding:8px">No matches.</div>`;
        listEl.querySelectorAll("[data-docs-id]").forEach(btn => btn.addEventListener("click", () => {
            activeId = btn.dataset.docsId || null;
            routes.go(routes.docsUrl(activeId), true);
            paintList(document.getElementById("docs-search")?.value || "");
            paintContent();
        }));
    }
    async function paintContent() {
        const content = document.getElementById("docs-content");
        if (!content) return;
        if (!activeId) { renderDocsInfoTab(content); window.NexoriaAI?.setScope?.("general"); return; }
        const mod = modules.find(m => m.id === activeId);
        const general = (docsBundleCache?.general || []).find(d => d.id === activeId);
        const item = mod || (general ? {title:general.title,summary:general.summary,doc:general} : null);
        if (!item) { content.innerHTML = `<div class="empty-state">Documentation not found.</div>`; return; }
        const docItem=item.doc || item;
        const advancedVisual = activeId === "custom-commands" ? `<section class="settings-section-block docs-advanced-guide"><h4>${icon("settings")} Advanced command builder at a glance</h4><p>Advanced commands are visual flows. Start with one Trigger and connect its output directly to the first executable node. Branches split into True and False paths.</p><div class="docs-node-example"><div class="docs-node-example-node docs-node-trigger"><strong>Trigger</strong><span>/welcome</span></div><div class="docs-node-example-wire"></div><div class="docs-node-example-node"><strong>Send Message</strong><span>Welcome {user.mention}!</span></div><div class="docs-node-example-wire"></div><div class="docs-node-example-node docs-node-branch"><strong>If</strong><span>User → Has Role → Staff</span><em>True → Add Role</em><em>False → Send Message</em></div></div><div class="docs-node-example-grid"><div><b>Command</b><p>Trigger, Description, Permissions define command metadata.</p></div><div><b>Discord</b><p>Send Message, Embed, Reply, Mention User, Roles, React, DM, Delete Trigger.</p></div><div><b>Flow</b><p>Wait and Stop control execution order.</p></div><div><b>Logic</b><p>If, role checks, text checks, channel checks, command checks and random branches.</p></div><div><b>Variables</b><p>Set Variable and Change Variable store temporary values for later nodes.</p></div><div><b>Utility</b><p>Log writes diagnostics and Comment adds builder-only notes.</p></div></div></section>` : "";
        content.innerHTML = `<div class="docs-article"><h2>${escapeHtml(item.title)}</h2><p class="picker-sub">${escapeHtml(item.summary || "")}</p>${advancedVisual}${(docItem.sections || []).map(sec => `<section class="settings-section-block"><h4>${escapeHtml(sec.heading)}</h4><p>${escapeHtml(sec.body)}</p>${sec.visualNodes?`<div class="nexoria-doc-node-grid">${sec.visualNodes.map(n=>`<div class="nexoria-doc-node"><span class="nexoria-doc-node-dot"></span><strong>${escapeHtml(n.label)}</strong></div>`).join("")}</div>`:""}${sec.visualExamples?sec.visualExamples.map(ex=>`<div class="nexoria-doc-example"><strong>${escapeHtml(ex.title)}</strong><div class="nexoria-doc-example-flow">${ex.nodes.map((n,i)=>`<div class="nexoria-doc-node nexoria-doc-example-node"><strong>${escapeHtml(n.label)}</strong></div>${i<ex.nodes.length-1?`<span class="nexoria-doc-arrow">→</span>`:""}`).join("")}</div></div>`).join(""):""}${(sec.links||[]).map(l=>`<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener" class="btn btn-ghost btn-small" style="margin:6px 6px 0 0;display:inline-flex">${icon("link",14)} ${escapeHtml(l.label||l.url)}</a>`).join("")}</section>`).join("")}</div>`;
        window.NexoriaAI?.setScope?.(activeId);
    }
    paintList("");
    document.getElementById("docs-search")?.addEventListener("input", e => paintList(e.target.value));
    document.getElementById("docs-open-ai")?.addEventListener("click", () => openNexoriaAI(activeId || "general"));
    if (initialModuleId && !modules.some(m => m.id === initialModuleId)) activeId = null;
    await paintContent();
    window.NexoriaAI?.setVisible?.(true);
}
function renderVariableReference(vars, title = "Variables") {
    const groups = {};
    (vars || []).forEach(v => (groups[v.group] = groups[v.group] || []).push(v));
    const groupOrder = Object.keys(groups).sort();
    return `<div class="settings-section-block"><h4>${icon("category-2")} ${escapeHtml(title)}</h4><input id="docs-var-search" class="search-input" placeholder="Search variables…" style="margin:10px 0"><div id="docs-var-table">${groupOrder.map(g => renderVarGroup(g, groups[g])).join("")}</div></div>`;
}
function renderVarGroup(group, vars) {
    return `<div class="docs-var-group" data-var-group><div class="docs-var-group-label">${escapeHtml(group)}</div>${vars.map(v => `<div class="docs-var-row" data-var-row data-var-search="${escapeHtml(v.key + " " + (v.description || ""))}"><code class="cc-command-trigger-chip">{${escapeHtml(v.key)}}</code><span class="docs-var-desc">${escapeHtml(v.description || "")}</span></div>`).join("")}</div>`;
}
async function renderDocsInfoTab(content) {
    const bundle = await loadDocumentationBundle();
    const discordUrl = CFG?.DISCORD_SUPPORT_URL || "#";
    content.innerHTML = `<h2 style="margin-bottom:4px">Info</h2><p class="picker-sub" style="margin-bottom:20px">General NEXORIA documentation, configuration notes, module information, and the full variable reference.</p>
    ${(bundle.general || []).map(d => `<div class="settings-section-block"><h4>${icon("document")} ${escapeHtml(d.title)}</h4><p>${escapeHtml(d.summary || "")}</p>${(d.sections || []).map(s => `<div style="margin-top:12px"><strong>${escapeHtml(s.heading)}</strong><p style="margin-top:4px">${escapeHtml(s.body)}</p></div>`).join("")}</div>`).join("")}
    <div class="settings-section-block"><h4>Legal</h4><p>Review the NEXORIA policies at any time.</p><a class="btn btn-ghost btn-small" href="${getSiteBasePath()}site/policy/terms.html" >Terms of Service</a> <a class="btn btn-ghost btn-small" href="${getSiteBasePath()}site/policy/privacy.html" >Privacy Policy</a></div><div class="settings-section-block"><h4>${icon("discord")}Support &amp; Suggestions</h4><p>Join the official NEXORIA Discord server for help, updates, and to suggest features or languages.</p><a class="btn btn-primary btn-small" href="${escapeHtml(discordUrl)}" target="_blank" rel="noopener" style="margin-top:8px;display:inline-flex">${icon("discord")} Join the Discord</a></div>
    ${renderVariableReference(bundle.variables || [], "All Variables")}`;
    wireVarSearch();
}
function wireVarSearch() {
    const input = document.getElementById("docs-var-search"); if (!input) return;
    input.oninput = () => { const q = input.value.toLowerCase(); document.querySelectorAll("[data-var-row]").forEach(row => row.style.display = !q || row.dataset.varSearch.toLowerCase().includes(q) ? "" : "none"); document.querySelectorAll("[data-var-group]").forEach(group => group.style.display = Array.from(group.querySelectorAll("[data-var-row]")).some(r => r.style.display !== "none") ? "" : "none"); };
}
async function renderLeaderboardsPanel(root) {
    root.innerHTML = loadingBlock("Loading leaderboards…");
    const key="nexoria_leaderboards_cache", at=key+"_at", ttl=Math.max(100,getRefreshPrefs().leaderboardSeconds*1000);
    let d = null;
    let cached = null;
    let cacheAt = 0;
    try {
        const c = localStorage.getItem(key);
        cacheAt = Number(localStorage.getItem(at) || 0);
        if (c)
            cached = JSON.parse(c);
        if (cached && Date.now() - cacheAt < ttl)
            d = cached;
    }
    catch { }
    if (!d) {
        try {
            d = await api("/leaderboards");
            localStorage.setItem(key, JSON.stringify(d));
            localStorage.setItem(at, String(Date.now()));
        }
        catch (e) {
            if (cached) {
                d = cached;
            }
            else {
                root.innerHTML = `<div class="empty-state"><div style="font-weight:700;margin-bottom:5px">Leaderboard data is offline</div><div class="field-hint">The bot is not currently reachable, so live leaderboard data cannot be loaded.</div><div style="margin-top:12px"><button class="btn btn-primary btn-small" id="lb-retry">${icon("refresh")} Retry</button></div></div>`;
                document.getElementById("lb-retry")?.addEventListener("click", () => renderLeaderboardsPanel(root));
                return;
            }
        }
    }
    const mods = d.modules || [];
    root.innerHTML = `<div class="dash-header"><div><h1 class="picker-heading">Leaderboards</h1><p class="picker-sub">Top 10 by default. Choose 10, 25, 50, 75 or 100 and page through results.</p></div><button class="btn btn-ghost btn-small" id="lb-refresh">${icon("refresh")} Refresh</button></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">${mods.map((m, i) => `<button class="btn btn-ghost btn-small ${i === 0 ? "active" : ""}" data-lb-module="${m.id}">${icon("category-2")} ${escapeHtml(m.label)}</button>`).join("") || `<div class="empty-state">Coming soon — no module currently provides leaderboard data.</div>`}</div><div id="lb-content"></div>`;
    const paint = (m) => { const state = { limit: 10, page: 0 }; const draw = () => { const all = m.servers || [], start = state.page * state.limit, rows = all.slice(start, start + state.limit); const isTop=m.id==="top-servers"; document.getElementById("lb-content").innerHTML = `<div class="config-section"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div><h3>${escapeHtml(m.label)} · ${isTop?"Members":"Servers"}</h3><div class="hint">${isTop?"Servers ordered by current Discord member count.":"Server ratings from the installed leaderboard modules."}</div></div><div class="dc-dropdown" id="lb-limit-menu" style="width:120px"></div></div>${rows.map((r, i) => `<div class="config-row"><span class="config-row-label">#${start + i + 1} ${escapeHtml(r.guildName)} </span><span>${isTop?`${Number(r.memberCount||0).toLocaleString()} members`:`${Number(r.average||0).toFixed(1)}/10 · ${r.votes||0} reviews · ${Number(r.memberCount||0).toLocaleString()} members`}</span></div>`).join("") || `<div class="empty-state">No server data yet.</div>`}<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px"><button class="btn btn-ghost btn-small" id="lb-prev" ${start === 0 ? "disabled" : ""}>${icon("arrow-left")} Previous</button><span class="field-hint">Page ${Math.floor(start / state.limit) + 1} of ${Math.max(1, Math.ceil(all.length / state.limit))}</span><button class="btn btn-ghost btn-small" id="lb-next" ${start + state.limit >= all.length ? "disabled" : ""}>Next ${icon("arrow-right")}</button></div></div>${isTop?"":`<div class="config-section"><h3>Best support</h3>${(m.staff || []).map((r, i) => `<div class="config-row"><span class="config-row-label">#${i + 1} ${escapeHtml(r.guildName)} · ${escapeHtml(r.userId)}</span><span>${r.average.toFixed(1)}/10 · ${r.votes} reviews · ${Number(r.memberCount||0).toLocaleString()} members</span></div>`).join("") || `<div class="empty-state">Coming soon — no rated support data yet.</div>`}</div>`}`; const limitHost = document.getElementById("lb-limit-menu");
        if (limitHost) { limitHost.classList.add("drop-up");
            const opts = [10,25,50,75,100].map(n => ({value:String(n), label:String(n)}));
            const dd = window.DC?.createDropdown ? window.DC.createDropdown(limitHost, { options: opts, value: String(state.limit), placeholder: "Results" }) : null;
            dd?.onChange?.(v => { state.limit = Number(v) || 10; state.page = 0; draw(); });
        } document.getElementById("lb-prev")?.addEventListener("click", () => { state.page--; draw(); }); document.getElementById("lb-next")?.addEventListener("click", () => { state.page++; draw(); }); }; draw(); };
    mods.forEach(m => document.querySelector(`[data-lb-module="${CSS.escape(m.id)}"]`)?.addEventListener("click", e => { document.querySelectorAll("[data-lb-module]").forEach(x => x.classList.remove("active")); e.currentTarget.classList.add("active"); paint(m); }));
    if (mods[0])
        paint(mods[0]);
    document.getElementById("lb-refresh")?.addEventListener("click", () => { localStorage.removeItem(key); localStorage.removeItem(at); renderLeaderboardsPanel(root); });
    if (root._lbRefreshTimer) clearInterval(root._lbRefreshTimer);
    root._lbRefreshTimer=setInterval(async()=>{ if(!document.body.contains(root)){clearInterval(root._lbRefreshTimer);return;} try{const fresh=await api("/leaderboards");localStorage.setItem(key,JSON.stringify(fresh));localStorage.setItem(at,String(Date.now()));const active=root.querySelector("[data-lb-module].active")?.dataset.lbModule;const m2=(fresh.modules||[]).find(x=>x.id===active)||(fresh.modules||[])[0];if(m2){const modBtn=root.querySelector(`[data-lb-module="${CSS.escape(m2.id)}"]`);root.querySelectorAll("[data-lb-module]").forEach(x=>x.classList.toggle("active",x===modBtn));paint(m2);}}catch{} },Math.max(100,getRefreshPrefs().leaderboardSeconds*1000));
}
async function renderDashboardPanel(root) {
    root.innerHTML = `
    <div class="dash-header">
      <div><h1 class="picker-heading">Your Servers</h1><p class="picker-sub">Manage tickets and settings for your Discord servers</p></div>
      <div class="dash-header-actions">
        <button class="btn btn-ghost btn-small" id="ds-refresh-btn">${icon("refresh")} Refresh Servers</button>
        <a class="btn btn-primary btn-small" href="${inviteUrl()}" target="_blank" rel="noopener">${icon("plus")} Add Bot</a>
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
            : `<a class="btn btn-primary btn-small" target="_blank" rel="noopener" href="${inviteUrl(g.id)}">${icon("plus")} Begin setup</a>`}
        </div>
      </div>`;
    }
    function wireDashButtons() {
        grid.querySelectorAll("[data-open-dash]").forEach(btn => {
            btn.addEventListener("click", async () => {
                try {
                    const meta = await api(`/guilds/${encodeURIComponent(btn.dataset.openDash)}/meta?userId=${encodeURIComponent(session.user.id)}`);
                    if (!meta.canViewDashboard) {
                        await DCModal.alert("Tell the server owner to open Manage Servers, then open General Settings and allow you to use the server dashboard.", { title: "Dashboard access required" });
                        return;
                    }
                }
                catch {
                    await DCModal.alert("Couldn't verify your server dashboard permissions. Please retry.", { title: "Permission check failed" });
                    return;
                }
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
            if (aHas !== bHas)
                return aHas ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        const activeCount = sorted.filter(g => botGuildIds.has(g.id)).length;
        countEl.textContent = `${activeCount} active · ${sorted.length} available`;
        grid.innerHTML = sorted.map(g => cardHtml(g, botGuildIds.has(g.id))).join("");
        wireDashButtons();
    }
    try {
        await loadAndPaint();
    }
    catch (e) {
        grid.innerHTML = `<div class="empty-state"><i class="ti ti-alert-triangle glyph"></i>${escapeHtml(e.message || "Couldn't load your servers.")}<div style="margin-top:12px"><button class="btn btn-primary btn-small" id="ds-retry-btn">Try again</button></div></div>`;
        countEl.textContent = "";
        document.getElementById("ds-retry-btn")?.addEventListener("click", () => renderDashboardPanel(root));
        return;
    }
    document.getElementById("ds-search")?.addEventListener("input", (e) => {
        const q = e.target.value.trim().toLowerCase();
        grid.querySelectorAll(".server-card[data-server-name]").forEach(card => {
            card.style.display = card.dataset.serverName.includes(q) ? "" : "none";
        });
    });
    const refreshBtn = document.getElementById("ds-refresh-btn");
    refreshBtn?.addEventListener("click", async () => {
        refreshBtn.disabled = true;
        refreshBtn.classList.add("btn-refreshing");
        try {
            await refreshHeroStatus();
            await loadAndPaint();
        }
        catch (e) {
            await DCModal.alert(`Couldn't refresh servers: ${e.message}`);
        }
        finally {
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
    }
    catch (e) {
        const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError";
        throw new Error(timedOut
            ? "The bot didn't respond in time — check that it's running and your tunnel is up."
            : "Couldn't reach the bot — check that it's running and your tunnel is up.");
    }
    if (res.status === 401) {
        setAdminToken(null);
        throw new Error("Session expired — please log in again");
    }
    if (!res.ok) {
        let detail = "";
        try {
            detail = (await res.json()).error;
        }
        catch { }
        throw new Error(detail || `Request failed (HTTP ${res.status}). The bot may need to be restarted — check its console output.`);
    }
    return res.json();
}
async function renderProfileSettings(root) {
    const session = getSession();
    root.innerHTML = `<div class="dash-header"><div><h1 class="picker-heading">Integrations</h1></div></div>
      <div class="integration-panel" id="integrations-panel">
        <div class="integration-header">Integrations</div>
        <div class="integration-grid integration-grid-single">
          <section class="integration-card integration-card-roblox" id="roblox-integration-card">
            <div class="integration-card-top">
              <div class="integration-name"><span class="integration-icon integration-icon-roblox">${icon("brand-roblox")}</span><span>Roblox</span></div>
              <span class="integration-status" id="roblox-integration-status">Loading</span>
            </div>
            <div class="integration-account" id="roblox-integration-account">Account: Loading…</div>
            <div class="integration-actions" id="roblox-integration-actions"></div>
          </section>
        </div>
      </div>`;

    async function load() {
        const status = document.getElementById("roblox-integration-status");
        const account = document.getElementById("roblox-integration-account");
        const actions = document.getElementById("roblox-integration-actions");
        try {
            const d = await api(`/profile/roblox?discordUserId=${encodeURIComponent(session.user.id)}`);
            const accounts = d.accounts || [];
            const a = accounts[0];
            if (a) {
                status.textContent = "Linked";
                status.className = "integration-status integration-status-linked";
                account.innerHTML = `Account: <strong>${escapeHtml(a.username || a.displayName || "Unknown")}</strong> <span class="integration-id">(${escapeHtml(a.id)})</span>`;
                actions.innerHTML = `<button class="integration-btn integration-btn-danger" id="roblox-unlink-btn">Unlink Roblox</button>`;
                document.getElementById("roblox-unlink-btn")?.addEventListener("click", async () => {
                    const btn = document.getElementById("roblox-unlink-btn");
                    btn.disabled = true;
                    try {
                        await api(`/profile/roblox/${encodeURIComponent(a.id)}`, { method: "DELETE", body: JSON.stringify({ discordUserId: session.user.id }) });
                        await load();
                    }
                    catch (e) {
                        btn.disabled = false;
                        await DCModal.alert(e.message, { title: "Couldn't disconnect Roblox" });
                    }
                });
            }
            else {
                status.textContent = "Not Linked";
                status.className = "integration-status integration-status-unlinked";
                account.textContent = "Account: Not linked";
                actions.innerHTML = `<button class="integration-btn integration-btn-primary" id="roblox-connect-btn">Link Roblox</button>`;
                document.getElementById("roblox-connect-btn")?.addEventListener("click", startRobloxOAuth);
            }
        }
        catch (e) {
            status.textContent = "Unavailable";
            status.className = "integration-status integration-status-unlinked";
            account.textContent = "Account: Unable to load";
            actions.innerHTML = `<button class="integration-btn integration-btn-primary" id="roblox-connect-btn">Link Roblox</button>`;
            document.getElementById("roblox-connect-btn")?.addEventListener("click", startRobloxOAuth);
        }
    }

    async function startRobloxOAuth() {
        try {
            const cfg = await api("/oauth/roblox/config");
            const bytes = crypto.getRandomValues(new Uint8Array(32));
            const verifier = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
            const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
            const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
            const state = `rbx_${crypto.randomUUID()}`;
            sessionStorage.setItem("nexoria_roblox_oauth", JSON.stringify({ verifier, state, discordUserId: session.user.id, redirectUri: cfg.redirectUri, scopes: cfg.scopes, createdAt: Date.now() }));
            const u = new URL(cfg.authorizationEndpoint);
            u.searchParams.set("client_id", cfg.clientId);
            u.searchParams.set("redirect_uri", cfg.redirectUri);
            u.searchParams.set("scope", cfg.scopes.join(" "));
            u.searchParams.set("response_type", "code");
            u.searchParams.set("code_challenge", challenge);
            u.searchParams.set("code_challenge_method", "S256");
            u.searchParams.set("state", state);
            u.searchParams.set("prompt", cfg.prompt || "select_account");
            window.location.href = u.toString();
        }
        catch (e) {
            await DCModal.alert(e.message, { title: "Couldn't start Roblox connection" });
        }
    }

    await load();
}

async function renderAdminPanel(root) {
    root.innerHTML = `<h1 class="picker-heading">Admin Panel</h1><p class="picker-sub">Loading…</p>`;
    if (!botInfoCache) {
        root.innerHTML = `<h1 class="picker-heading">Admin Panel</h1><div class="empty-state"><i class="ti ti-plug-connected-x glyph"></i>Bot Servers down — the admin panel needs a live connection.</div>`;
        return;
    }
    const token = getAdminToken();
    if (!token) {
        paintAdminLogin(root);
        return;
    }
    try {
        const session = await adminApi("/admin/session");
        paintAdminDashboard(root, session);
    }
    catch {
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
    document.getElementById("admin-login-btn")?.addEventListener("click", async () => {
        const username = document.getElementById("admin-username").value.trim();
        const password = document.getElementById("admin-password").value;
        const errEl = document.getElementById("admin-login-error");
        errEl.style.display = "none";
        try {
            const session = getSession();
            const loginResult = await adminApi("/admin/login", { method: "POST", body: JSON.stringify({ username, password, discordUserId: session.user.id }) });
            setAdminToken(loginResult.token);
            renderAdminPanel(document.getElementById("picker-panel-root"));
        }
        catch (e) {
            errEl.textContent = e.message;
            errEl.style.display = "block";
        }
    });
}
async function paintAdminDashboard(root, session) {
    root.innerHTML = `
    <div class="admin-console-head">
      <div>
        <div class="admin-eyebrow">NEXORIA CONTROL CENTER</div>
        <h1 class="picker-heading">Admin Panel</h1>
        <p class="picker-sub">Everything is grouped into sections so server management, tickets, AI reports, and security are easier to find.</p>
      </div>
      <button class="btn btn-ghost btn-small" id="admin-logout-btn">${icon("logout")} Log out</button>
    </div>

    <div class="admin-folder-grid">
      <details class="admin-folder" open>
        <summary><span class="admin-folder-icon">${icon("layout-grid",16)}</span><span><b>Overview &amp; system</b><small>Status, refresh behaviour, and high-level dashboard controls.</small></span><span class="admin-folder-chevron">${icon("chevron-down",14)}</span></summary>
        <div class="admin-folder-body">
          <div class="config-section admin-inner-card">
            <div class="dash-header" style="margin-bottom:4px"><div><h3 style="margin:0">Dashboard refresh</h3><div class="hint">Controls how often public status and leaderboard data refresh in this browser.</div></div><button class="btn btn-primary btn-small" id="admin-save-refresh">${icon("check")} Save</button></div>
            <div class="field-row-inline" style="gap:12px;flex-wrap:wrap;margin-top:10px">
              <div class="field" style="width:210px;margin:0"><label>Status / latency (seconds)</label><input id="admin-refresh-status" type="number" min="0.1" step="0.1" class="search-input"></div>
              <div class="field" style="width:210px;margin:0"><label>Leaderboards (seconds)</label><input id="admin-refresh-leaderboard" type="number" min="0.1" step="0.1" class="search-input"></div>
              <span id="admin-refresh-feedback" class="field-hint" style="align-self:end;padding-bottom:9px"></span>
            </div>
          </div>
        </div>
      </details>

      <details class="admin-folder" open>
        <summary><span class="admin-folder-icon">${icon("servers",16)}</span><span><b>Server management</b><small>Control which Discord servers can use NEXORIA.</small></span><span class="admin-folder-chevron">${icon("chevron-down",14)}</span></summary>
        <div class="admin-folder-body">
          <div class="config-section admin-inner-card">
            <h3>Server access</h3>
            <div class="hint">Choose whether every server the bot is in may use it, or only servers you explicitly allow.</div>
            <div class="config-row" style="margin-bottom:4px">
              <span class="config-row-label">Restrict to an allow-list</span>
              <button class="toggle" id="admin-allowmode-toggle" aria-label="Toggle allow-list mode"></button>
            </div>
            <div id="admin-guilds-section"></div>
          </div>
        </div>
      </details>

      <details class="admin-folder">
        <summary><span class="admin-folder-icon">${icon("clipboard-list",16)}</span><span><b>Ticket Tool</b><small>Search and manage tickets across all connected servers.</small></span><span class="admin-folder-chevron">${icon("chevron-down",14)}</span></summary>
        <div class="admin-folder-body">
          <div class="config-section admin-inner-card">
            <div class="dash-header" style="margin-bottom:4px"><div><h3 style="margin:0">Ticket search</h3><div class="hint">Find tickets by number, subject, or the people involved.</div></div><button class="btn btn-ghost btn-small" id="admin-ticket-refresh-btn">${icon("refresh")} Refresh Tickets</button></div>
            <input type="text" class="search-input" id="admin-ticket-search" placeholder="Search by ticket number, subject, or user…" style="width:100%;margin-top:10px;margin-bottom:10px">
            <div id="admin-ticket-search-results"></div>
          </div>
        </div>
      </details>

      <details class="admin-folder">
        <summary><span class="admin-folder-icon">${icon("bolt",16)}</span><span><b>NEXORIA AI &amp; support</b><small>AI error reports, website users, and support cases.</small></span><span class="admin-folder-chevron">${icon("chevron-down",14)}</span></summary>
        <div class="admin-folder-body">
          <div class="config-section admin-inner-card">
            <h3>AI error reports &amp; user contact</h3>
            <div class="hint">Look up a website user, inspect stored AI errors, and contact the linked Discord account.</div>
            <div class="field-row-inline" style="margin:10px 0;gap:8px;flex-wrap:wrap">
              <input type="text" id="admin-site-userid" placeholder="Website user id (e.g. NXR-000001)" style="flex:1;min-width:220px">
              <button class="btn btn-primary btn-small" id="admin-user-lookup">${icon("search")} Find user</button>
            </div>
            <div id="admin-user-result"></div>
            <div style="margin-top:14px"><input type="text" class="search-input" id="admin-ai-error-search" placeholder="Search stored errors by user, Discord id, username, or error…"></div>
            <div id="admin-ai-error-list" style="margin-top:10px">${loadingBlock()}</div>
          </div>
        </div>
      </details>

      <details class="admin-folder">
        <summary><span class="admin-folder-icon">${icon("shield",16)}</span><span><b>Security &amp; restrictions</b><small>Blocked users, server restrictions, and administrator access.</small></span><span class="admin-folder-chevron">${icon("chevron-down",14)}</span></summary>
        <div class="admin-folder-body">
          <div class="config-section admin-inner-card">
            <h3>User restrictions</h3>
            <div class="hint">Block a user, or block all servers owned by that user. Choose the scope from the dropdown.</div>
            <div class="field-row-inline" style="margin-bottom:10px;gap:8px;flex-wrap:wrap"><input type="text" id="admin-restrict-userid" placeholder="Discord user id" inputmode="numeric" style="flex:1;min-width:180px"><select id="admin-restrict-scope" class="dc-select"><option value="user">Block user</option><option value="owner">Block all servers they own</option></select><input type="text" id="admin-restrict-reason" placeholder="Reason (optional)" style="flex:1;min-width:180px"><button class="btn btn-primary btn-small" id="admin-restrict-add">${icon("shield")} Block</button></div>
            <div id="admin-restrictions-list">${loadingBlock()}</div>
          </div>
          ${session.isOwner ? `
          <div class="config-section admin-inner-card admin-owner-card">
            <h3>Granted admins</h3>
            <div class="hint">Discord user ids that can log into this panel, in addition to you as the owner.</div>
            <div class="field-row-inline" style="margin-bottom:10px"><input type="text" id="admin-add-userid" placeholder="Discord user id (numbers only)" inputmode="numeric" style="flex:1"><button class="btn btn-primary btn-small" id="admin-add-btn">Grant access</button></div>
            <div class="field-hint" id="admin-add-error" style="display:none;color:var(--red);margin-bottom:8px"></div>
            <div id="admin-admins-list">${loadingBlock()}</div>
          </div>` : ""}
        </div>
      </details>
    </div>`;

    const adminRefreshPrefs = getRefreshPrefs();
    document.getElementById("admin-refresh-status").value = adminRefreshPrefs.statusSeconds;
    document.getElementById("admin-refresh-leaderboard").value = adminRefreshPrefs.leaderboardSeconds;
    document.getElementById("admin-save-refresh")?.addEventListener("click", () => {
        const saved = saveRefreshPrefs({ statusSeconds: document.getElementById("admin-refresh-status").value, leaderboardSeconds: document.getElementById("admin-refresh-leaderboard").value });
        document.getElementById("admin-refresh-status").value = saved.statusSeconds;
        document.getElementById("admin-refresh-leaderboard").value = saved.leaderboardSeconds;
        document.getElementById("admin-refresh-feedback").textContent = "Saved.";
    });
    document.getElementById("admin-logout-btn")?.addEventListener("click", async () => {
        try { await adminApi("/admin/logout", { method: "POST" }); } catch { }
        setAdminToken(null);
        renderAdminPanel(root);
    });
    await paintAdminGuildsSection();
    wireAdminRestrictions();
    wireAdminTicketSearch();
    wireAdminUserContact();
    paintAdminAiErrors();
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
        }
        else {
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
            document.getElementById("admin-add-guild-btn")?.addEventListener("click", async () => {
                const input = document.getElementById("admin-add-guildid");
                const errEl = document.getElementById("admin-add-guild-error");
                errEl.style.display = "none";
                const guildId = input.value.trim();
                try {
                    await adminApi("/admin/guilds", { method: "POST", body: JSON.stringify({ guildId }) });
                    input.value = "";
                    await paintAdminGuildsSection();
                }
                catch (e) {
                    errEl.textContent = e.message;
                    errEl.style.display = "block";
                }
            });
        }
        toggle.addEventListener("click", async () => {
            const newMode = isAllowlist ? "all" : "allowlist";
            try {
                await adminApi("/admin/guilds-mode", { method: "PUT", body: JSON.stringify({ allowMode: newMode }) });
                await paintAdminGuildsSection();
            }
            catch (e) {
                await DCModal.alert(`Couldn't update: ${e.message}`);
            }
        }, { once: true });
    }
    catch (e) {
        section.innerHTML = `<div class="empty-state">Couldn't load servers: ${escapeHtml(e.message)}</div>`;
    }
}
async function paintAdminGuildsList(guildsResult) {
    const slot = document.getElementById("admin-guilds-list");
    const allowedGuildIds = guildsResult.allowedGuildIds;
    const knownGuilds = guildsResult.knownGuilds;
    if (knownGuilds.length === 0) {
        slot.innerHTML = `<div class="empty-state">The bot isn't in any servers yet.</div>`;
        return;
    }
    const allowedKnown = knownGuilds.filter(g => allowedGuildIds.includes(g.id));
    const allowedUnknownIds = allowedGuildIds.filter(id => !knownGuilds.some(g => g.id === id));
    slot.innerHTML = `
    ${allowedKnown.map(g => `
    <div class="config-row">
      <span class="config-row-label" style="display:flex;align-items:center;gap:8px">
        ${g.icon ? `<img src="https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png" style="width:22px;height:22px;border-radius:6px" alt="">` : `<span class="server-icon" style="width:22px;height:22px;font-size:9px;margin:0">${initials(g.name)}</span>`}
        ${escapeHtml(g.name)}
      </span>
      <button class="btn btn-ghost btn-small" data-guild-revoke="${g.id}">${icon("x")} Remove</button>
    </div>`).join("")}
    ${allowedUnknownIds.map(id => `
    <div class="config-row">
      <span class="config-row-label" style="display:flex;align-items:center;gap:8px"><span class="server-icon" style="width:22px;height:22px;font-size:9px;margin:0">?</span>${escapeHtml(id)} <span class="field-hint">(bot not in this server)</span></span>
      <button class="btn btn-ghost btn-small" data-guild-revoke="${id}">${icon("x")} Remove</button>
    </div>`).join("")}
    ${allowedKnown.length === 0 && allowedUnknownIds.length === 0 ? `<div class="empty-state">No servers granted yet — every server is currently blocked until you add one.</div>` : ""}`;
    slot.querySelectorAll("[data-guild-revoke]").forEach(btn => btn.addEventListener("click", async () => {
        try {
            await adminApi(`/admin/guilds/${btn.dataset.guildRevoke}`, { method: "DELETE" });
            await paintAdminGuildsSection();
        }
        catch (e) {
            await DCModal.alert(`Couldn't update: ${e.message}`);
        }
    }));
}
function wireAdminRestrictions() {
    const addBtn = document.getElementById("admin-restrict-add");
    const list = document.getElementById("admin-restrictions-list");
    if (!addBtn || !list || addBtn.dataset.wired === "1") return;
    addBtn.dataset.wired = "1";
    const paint = async () => {
        try {
            const d = await adminApi("/admin/restrictions");
            const profiles = d.profiles || {};
            const rows = [
                ...Object.entries(d.users || {}).map(([id, r]) => ({ id, scope: "user", row: r })),
                ...Object.entries(d.owners || {}).map(([id, r]) => ({ id, scope: "owner", row: r })),
            ];
            list.innerHTML = rows.length ? rows.map(x => {
                const p = profiles[x.id] || {};
                return `<div class="config-row">
                  <span class="config-row-label" style="display:flex;align-items:center;gap:8px;min-width:0">
                    <img src="${escapeHtml(p.avatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png")}" alt="" style="width:28px;height:28px;border-radius:50%;flex:0 0 28px">
                    <span style="min-width:0"><strong>${escapeHtml(p.displayName || x.id)}</strong><div class="field-hint">${escapeHtml(x.scope === "owner" ? "All servers they own" : "This user")} · ${escapeHtml(x.row?.reason || "No reason")}</div></span>
                  </span>
                  <button class="btn btn-ghost btn-small danger" data-remove-restriction-scope="${x.scope}" data-remove-restriction-id="${x.id}">${icon("trash")} Remove</button>
                </div>`;
            }).join("") : `<div class="empty-state">No active restrictions.</div>`;
            list.querySelectorAll("[data-remove-restriction-id]").forEach(btn => btn.addEventListener("click", async () => {
                try { await adminApi(`/admin/restrictions/${btn.dataset.removeRestrictionScope}/${btn.dataset.removeRestrictionId}`, { method: "DELETE" }); await paint(); }
                catch (e) { await DCModal.alert(e.message, { title: "Couldn't remove restriction" }); }
            }));
        } catch (e) { list.innerHTML = `<div class="empty-state">Couldn't load restrictions: ${escapeHtml(e.message)}</div>`; }
    };
    addBtn.addEventListener("click", async () => {
        const userId = document.getElementById("admin-restrict-userid")?.value.trim();
        const scope = document.getElementById("admin-restrict-scope")?.value || "user";
        const reason = document.getElementById("admin-restrict-reason")?.value.trim() || "";
        if (!userId) return;
        try {
            await adminApi("/admin/restrictions", { method: "POST", body: JSON.stringify({ userId, scope, reason }) });
            document.getElementById("admin-restrict-userid").value = "";
            document.getElementById("admin-restrict-reason").value = "";
            await paint();
        } catch (e) { await DCModal.alert(e.message, { title: "Couldn't add restriction" }); }
    });
    void paint();
}
async function paintAdminAdminsList() {
    const slot = document.getElementById("admin-admins-list");
    const addBtn = document.getElementById("admin-add-btn");
    const errEl = document.getElementById("admin-add-error");
    if (addBtn)
        addBtn.addEventListener("click", async () => {
            const input = document.getElementById("admin-add-userid");
            const userId = input.value.trim();
            errEl.style.display = "none";
            if (!userId)
                return;
            try {
                await adminApi("/admin/admins", { method: "POST", body: JSON.stringify({ userId }) });
                input.value = "";
                await paintAdminAdminsList();
            }
            catch (e) {
                errEl.textContent = e.message;
                errEl.style.display = "block";
            }
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
          ${isOwner ? `<span class="badge badge-open">Owner</span>` : `<button class="btn btn-ghost btn-small" data-revoke-admin="${id}">${icon("x")} Revoke</button>`}
        </div>`;
        };
        slot.innerHTML = rowHtml(ownerUserId, true) + grantedUserIds.map(id => rowHtml(id, false)).join("");
        slot.querySelectorAll("[data-revoke-admin]").forEach(btn => btn.addEventListener("click", async () => {
            const ok = await DCModal.confirm("Revoke this admin's access to the panel?", { title: "Revoke access", confirmLabel: "Revoke", danger: true });
            if (!ok)
                return;
            try {
                await adminApi(`/admin/admins/${btn.dataset.revokeAdmin}`, { method: "DELETE" });
                await paintAdminAdminsList();
            }
            catch (e) {
                await DCModal.alert(`Couldn't revoke: ${e.message}`);
            }
        }));
    }
    catch (e) {
        slot.innerHTML = `<div class="empty-state">Couldn't load admins: ${escapeHtml(e.message)}</div>`;
    }
}
async function openAdminTicketDetail(guildId, ticketId) {
    const root = document.getElementById("picker-panel-root");
    root.innerHTML = `
    <button class="btn btn-ghost btn-small" id="admin-ticket-back">${icon("arrow-left")} Back to Admin Panel</button>
    <div id="admin-ticket-detail-body" style="margin-top:16px">${loadingBlock("Loading ticket…")}</div>`;
    document.getElementById("admin-ticket-back")?.addEventListener("click", () => renderAdminPanel(root));
    const body = document.getElementById("admin-ticket-detail-body");
    try {
        const data = await adminApi(`/admin/guilds/${guildId}/tickets/${ticketId}`);
        paintAdminTicketDetail(body, guildId, ticketId, data);
    }
    catch (e) {
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
        }
        catch (e) {
            resultsSlot.innerHTML = `<div class="empty-state">Couldn't search: ${escapeHtml(e.message)}</div>`;
        }
    }
    function paintAdminTicketSearchResults(tickets) {
        if (tickets.length === 0) {
            resultsSlot.innerHTML = `<div class="empty-state">No tickets found.</div>`;
            return;
        }
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
    const refreshBtn = document.getElementById("admin-ticket-refresh-btn");
    if (refreshBtn)
        refreshBtn.addEventListener("click", async () => {
            refreshBtn.disabled = true;
            refreshBtn.classList.add("btn-refreshing");
            try {
                await runSearch();
            }
            finally {
                refreshBtn.disabled = false;
                refreshBtn.classList.remove("btn-refreshing");
            }
        });
    runSearch();
}
const MY_TICKETS_COLUMNS = ["server", "subject", "content", "status", "created"];
const MY_TICKETS_COLUMN_LABELS = { server: "Server", subject: "Subject", content: "Content", status: "Status", created: "Created" };
async function renderMyTicketsPanel(root) {
    root.innerHTML = `
    <div class="dash-header">
      <div><h1 class="picker-heading">My Tickets</h1><p class="picker-sub" id="my-tickets-count">Loading…</p></div>
      <div class="dash-header-actions">
        <button class="btn btn-ghost btn-small" id="mt-refresh-btn">${icon("refresh")} Refresh Tickets</button>
      </div>
    </div>
    <p class="field-hint" style="margin-bottom:10px">Use filters below to refine results</p>
    <div class="ticket-toolbar">
      <input type="text" class="search-input" id="mt-search" placeholder="Search tickets…">
      <div class="dropdown-anchor">
        <button class="btn btn-ghost btn-small" id="mt-status-btn">All Status ${icon("chevron-down")}</button>
        <div class="dropdown-panel-floating" id="mt-status-panel" style="display:none">
          <div class="dropdown-panel-item" data-mt-status="">All Status</div>
          <div class="dropdown-panel-item" data-mt-status="open">Active</div>
          <div class="dropdown-panel-item" data-mt-status="closed">Closed</div>
        </div>
      </div>
      <div class="dropdown-anchor">
        <button class="btn btn-ghost btn-small" id="mt-server-btn">Server ${icon("chevron-down")}</button>
        <div class="dropdown-panel-floating" id="mt-server-panel" style="display:none">
          <input type="text" class="dropdown-panel-search" id="mt-server-search" placeholder="Search tickets...">
          <div id="mt-server-options"></div>
        </div>
      </div>
      <div class="dropdown-anchor">
        <button class="btn btn-ghost btn-small" id="mt-subject-btn">Subject ${icon("chevron-down")}</button>
        <div class="dropdown-panel-floating" id="mt-subject-panel" style="display:none">
          <input type="text" class="dropdown-panel-search" id="mt-subject-search" placeholder="Search subjects...">
          <div id="mt-subject-options"></div>
        </div>
      </div>
      <div class="dropdown-anchor">
        <button class="btn btn-ghost btn-small" id="mt-date-btn">${icon("calendar")} Date range</button>
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
    }
    catch (e) {
        document.getElementById("my-tickets-list").innerHTML = `<div class="empty-state"><i class="ti ti-alert-triangle glyph"></i>Couldn't load your tickets: ${escapeHtml(e.message)}</div>`;
        document.getElementById("my-tickets-count").textContent = "";
        return;
    }
    document.getElementById("my-tickets-count").textContent = `~${tickets.length} ticket${tickets.length === 1 ? "" : "s"} found`;
    const filters = { query: "", status: "", server: "", subject: "", dateFrom: null, dateTo: null };
    function applyFiltersAndPaint() {
        let rows = tickets;
        if (filters.query) {
            const q = filters.query.toLowerCase();
            rows = rows.filter(t => (t.subject || "").toLowerCase().includes(q) || (t.guildName || "").toLowerCase().includes(q));
        }
        if (filters.status)
            rows = rows.filter(t => (filters.status === "open" ? t.status !== "closed" : t.status === "closed"));
        if (filters.server)
            rows = rows.filter(t => t.guildName === filters.server);
        if (filters.subject)
            rows = rows.filter(t => t.subject === filters.subject);
        if (filters.dateFrom)
            rows = rows.filter(t => new Date(t.createdAt) >= filters.dateFrom);
        if (filters.dateTo)
            rows = rows.filter(t => new Date(t.createdAt) <= filters.dateTo);
        paintMyTicketsList(rows, tickets);
    }
    document.getElementById("mt-search")?.addEventListener("input", (e) => { filters.query = e.target.value; applyFiltersAndPaint(); });
    wireFloatingDropdown("mt-status-btn", "mt-status-panel");
    document.querySelectorAll("[data-mt-status]").forEach(item => item.addEventListener("click", () => {
        filters.status = item.dataset.mtStatus;
        document.getElementById("mt-status-btn").innerHTML = `${item.textContent} ${icon("chevron-down")}`;
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
            document.getElementById("mt-server-btn").innerHTML = `${escapeHtml(filters.server)} ${icon("chevron-down")}`;
            closeAllFloatingDropdowns();
            applyFiltersAndPaint();
        }));
    }
    paintServerOptions("");
    document.getElementById("mt-server-search")?.addEventListener("input", (e) => paintServerOptions(e.target.value));
    wireFloatingDropdown("mt-subject-btn", "mt-subject-panel");
    function uniqueSubjectsNow() { return [...new Set(tickets.map(t => t.subject).filter(Boolean))]; }
    function paintSubjectOptions(query) {
        const q = (query || "").toLowerCase();
        const opts = uniqueSubjectsNow().filter(s => s.toLowerCase().includes(q));
        document.getElementById("mt-subject-options").innerHTML = opts.map(s => `<div class="dropdown-panel-item" data-mt-subject-opt="${escapeHtml(s)}">${escapeHtml(s)}</div>`).join("") || `<div class="dropdown-panel-empty">No matches</div>`;
        document.querySelectorAll("[data-mt-subject-opt]").forEach(item => item.addEventListener("click", () => {
            filters.subject = item.dataset.mtSubjectOpt;
            document.getElementById("mt-subject-btn").innerHTML = `${escapeHtml(filters.subject)} ${icon("chevron-down")}`;
            closeAllFloatingDropdowns();
            applyFiltersAndPaint();
        }));
    }
    paintSubjectOptions("");
    document.getElementById("mt-subject-search")?.addEventListener("input", (e) => paintSubjectOptions(e.target.value));
    wireFloatingDropdown("mt-date-btn", "mt-date-panel");
    paintDateRangePicker(document.getElementById("mt-date-panel"), (from, to) => {
        filters.dateFrom = from;
        filters.dateTo = to;
        closeAllFloatingDropdowns();
        applyFiltersAndPaint();
    });
    const refreshBtn = document.getElementById("mt-refresh-btn");
    refreshBtn.addEventListener("click", async () => {
        refreshBtn.disabled = true;
        refreshBtn.classList.add("btn-refreshing");
        try {
            await loadTickets();
            document.getElementById("my-tickets-count").textContent = `~${tickets.length} ticket${tickets.length === 1 ? "" : "s"} found`;
            applyFiltersAndPaint();
        }
        catch (e) {
            await DCModal.alert(`Couldn't refresh tickets: ${e.message}`);
        }
        finally {
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
    if (!btn || !panel || btn.dataset.dropdownWired === "1") return;
    btn.dataset.dropdownWired = "1";
    const position = () => {
        if (panel.style.display === "none") return;
        const rect = btn.getBoundingClientRect();
        const width = Math.max(260, Math.min(420, rect.width + 40));
        panel.style.width = `${width}px`;
        const maxH = Math.min(window.innerHeight - 24, 520);
        panel.style.maxHeight = `${maxH}px`;
        let left = rect.left;
        if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12;
        left = Math.max(12, left);
        let top = rect.bottom + 6;
        const measured = panel.getBoundingClientRect();
        if (top + Math.min(measured.height || 320, maxH) > window.innerHeight - 12) top = Math.max(12, rect.top - Math.min(measured.height || 320, maxH) - 6);
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
    };
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = panel.style.display !== "none";
        closeAllFloatingDropdowns();
        if (!isOpen) { panel.style.display = "block"; requestAnimationFrame(position); }
    });
    panel.addEventListener("click", (e) => e.stopPropagation());
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
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
        for (let i = 0; i < startWeekday; i++)
            cells += `<span class="dc-cal-cell dc-cal-empty"></span>`;
        for (let d = 1; d <= daysInMonth; d++) {
            const thisDate = new Date(viewYear, viewMonth, d);
            const isSelected = (rangeStart && thisDate.getTime() === rangeStart.getTime()) || (rangeEnd && thisDate.getTime() === rangeEnd.getTime());
            const inRange = rangeStart && rangeEnd && thisDate > rangeStart && thisDate < rangeEnd;
            cells += `<span class="dc-cal-cell ${isSelected ? "selected" : ""} ${inRange ? "in-range" : ""}" data-cal-day="${d}">${d}</span>`;
        }
        panel.innerHTML = `
      <div class="dc-cal-header">
        <button class="icon-btn" id="dc-cal-prev">${icon("arrow-left")}</button>
        <span>${monthNames[viewMonth]} ${viewYear}</span>
        <button class="icon-btn" id="dc-cal-next">${icon("chevron-right")}</button>
      </div>
      <div class="dc-cal-grid">${["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => `<span class="dc-cal-dow">${d}</span>`).join("")}${cells}</div>
      <div class="dc-cal-footer">
        <button class="btn btn-ghost btn-small" id="dc-cal-clear">Clear</button>
        <button class="btn btn-primary btn-small" id="dc-cal-apply">Apply</button>
      </div>`;
        panel.querySelector("#dc-cal-prev").addEventListener("click", () => {
            viewMonth--;
            if (viewMonth < 0) {
                viewMonth = 11;
                viewYear--;
            }
            render();
        });
        panel.querySelector("#dc-cal-next").addEventListener("click", () => {
            viewMonth++;
            if (viewMonth > 11) {
                viewMonth = 0;
                viewYear++;
            }
            render();
        });
        panel.querySelectorAll("[data-cal-day]").forEach(cell => cell.addEventListener("click", () => {
            const d = new Date(viewYear, viewMonth, Number(cell.dataset.calDay));
            if (!rangeStart || (rangeStart && rangeEnd)) {
                rangeStart = d;
                rangeEnd = null;
            }
            else if (d < rangeStart) {
                rangeEnd = rangeStart;
                rangeStart = d;
            }
            else {
                rangeEnd = d;
            }
            render();
        }));
        panel.querySelector("#dc-cal-clear").addEventListener("click", () => { rangeStart = null; rangeEnd = null; onPick(null, null); });
        panel.querySelector("#dc-cal-apply").addEventListener("click", () => onPick(rangeStart, rangeEnd || rangeStart));
    }
    render();
}
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
    if (updateUrl)
        routes.go(routes.myTicketUrl(guildId, ticketId));
    const root = document.getElementById("picker-panel-root");
    root.innerHTML = `
    <button class="btn btn-ghost btn-small" id="mt-back">${icon("arrow-left")} Back to Tickets</button>
    <div id="mt-detail-body" style="margin-top:16px">${loadingBlock("Loading ticket…")}</div>`;
    document.getElementById("mt-back")?.addEventListener("click", () => { routes.go("/my-tickets"); renderMyTicketsPanel(root); });
    await paintTicketDetailBody(document.getElementById("mt-detail-body"), guildId, ticketId);
}
async function paintTicketDetailBody(body, guildId, ticketId) {
    const session = getSession();
    let data;
    try {
        data = await api(`/guilds/${guildId}/tickets/${ticketId}/transcript?requesterId=${session?.user?.id || ""}`);
    }
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
        <div class="ticket-info-row">${icon("calendar")}<div><div class="ticket-info-label">Created</div><div class="ticket-info-val">${timeAgoGlobal(ticket.createdAt)}</div></div></div>
        <div class="ticket-info-row"><i class="ti ti-tag"></i><div><div class="ticket-info-label">Subject</div><div class="ticket-info-val"><span class="cc-trigger-chip" style="background:rgba(139,92,246,.14);color:var(--violet);border-color:rgba(139,92,246,.3)">${escapeHtml(ticket.subject || "—")}</span></div></div></div>
        <div class="ticket-info-row"><i class="ti ti-lock"></i><div><div class="ticket-info-label">Claimed By</div><div class="ticket-info-val">${ticket.claimedBy ? userDisplayHtml(claimer, ticket.claimedById || ticket.claimedBy) : `<span class="field-hint">Not claimed yet</span>`}</div></div></div>
        ${ticket.status === "closed" ? `
        <div class="ticket-info-row"><i class="ti ti-lock-check"></i><div><div class="ticket-info-label">Closed By</div><div class="ticket-info-val">${userDisplayHtml(closer, ticket.closedById || ticket.closedBy)}</div><div class="field-hint">${timeAgoGlobal(ticket.closedAt)}</div></div></div>`
        : `<div class="field-hint" style="margin-top:8px"><i class="ti ti-lock-open"></i> This ticket hasn't been closed yet.</div>`}
        <div class="ticket-share-block" id="ticket-share-block-wrap">
          <div id="ticket-share-controls">${loadingBlock("")}</div>
        </div>
        ${ticket.status === "closed" ? `<div class="ticket-share-block" id="ticket-review-block"><div id="ticket-review-controls">${loadingBlock("")}</div></div>` : ""}
      </div>
    </div>`;
    paintTicketShareControls(document.getElementById("ticket-share-controls"), guildId, ticketId, ticket);
    if (ticket.status === "closed" && document.getElementById("ticket-review-controls"))
        paintTicketReviewControls(document.getElementById("ticket-review-controls"), guildId, ticketId, ticket);
}
async function paintTicketReviewControls(slot, guildId, ticketId, ticket) {
    const session = getSession();
    try {
        const d = await api(`/guilds/${guildId}/tickets/${ticketId}/review?requesterId=${encodeURIComponent(session?.user?.id || "")}`);
        let selected = d.review?.rating || 0;
        const vals = Array.from({ length: 19 }, (_, i) => (i + 2) / 2);
        slot.innerHTML = `<div class="config-row-label">Private support review</div><div class="field-hint" style="margin:6px 0 10px">The server owner cannot see your individual review. You can change it whenever you want.</div><div style="display:flex;gap:4px;flex-wrap:wrap">${vals.map(v => `<button class="btn btn-ghost btn-small review-star-btn ${selected === v ? "active" : ""}" data-review-rating="${v}">${v}</button>`).join("")}</div><div class="field-row-inline" style="margin-top:8px"><button class="btn btn-primary btn-small" id="ticket-review-save">${icon("star")} ${selected ? `Update ${selected}/10` : `Submit rating`}</button>${selected ? `<button class="btn btn-ghost btn-small" id="ticket-review-remove">Remove review</button>` : ""}</div>`;
        slot.querySelectorAll("[data-review-rating]").forEach(b => b.addEventListener("click", () => { selected = Number(b.dataset.reviewRating); slot.querySelectorAll("[data-review-rating]").forEach(x => x.classList.toggle("active", Number(x.dataset.reviewRating) === selected)); document.getElementById("ticket-review-save").textContent = `Update ${selected}/10`; }));
        document.getElementById("ticket-review-save")?.addEventListener("click", async () => {
            try {
                await api(`/guilds/${guildId}/tickets/${ticketId}/review`, { method: "PUT", body: JSON.stringify({ requesterId: session.user.id, rating: selected }) });
                await DCModal.alert("Thanks for voting on your support experience. You can change it whenever you want.", { title: "Review saved" });
                paintTicketReviewControls(slot, guildId, ticketId, ticket);
            }
            catch (e) {
                DCModal.alert(e.message, { title: "Couldn't save review" });
            }
        });
        document.getElementById("ticket-review-remove")?.addEventListener("click", async () => {
            try {
                await api(`/guilds/${guildId}/tickets/${ticketId}/review?requesterId=${encodeURIComponent(session.user.id)}`, { method: "DELETE" });
                paintTicketReviewControls(slot, guildId, ticketId, ticket);
            }
            catch (e) {
                DCModal.alert(e.message, { title: "Couldn't remove review" });
            }
        });
    }
    catch (e) {
        slot.innerHTML = `<div class="field-hint">${escapeHtml(e.message || "Review unavailable")}</div>`;
    }
}
async function paintTicketShareControls(slot, guildId, ticketId, ticket) {
    let sharingEnabled = false;
    try {
        sharingEnabled = (await api(`/guilds/${guildId}/sharing-settings`)).sharingEnabled;
    }
    catch { }
    const wrap = document.getElementById("ticket-share-block-wrap");
    if (!sharingEnabled) {
        if (wrap)
            wrap.style.display = "none";
        return;
    }
    if (wrap)
        wrap.style.display = "";
    const session = getSession();
    const shareUrl = ticket.currentShareId ? `${window.location.origin}${getSiteBasePath().replace(/\/$/, "")}/share/${ticket.currentShareId}` : null;
    slot.innerHTML = `<div class="config-row-label" style="margin-bottom:8px">Share link</div>` + (shareUrl
        ? `<div class="dc-share-link"><input type="text" readonly value="${escapeHtml(shareUrl)}" id="ticket-share-url"></div>
       <div class="field-row-inline" style="margin-top:8px">
         <button class="btn btn-ghost btn-small" id="ticket-share-copy">${icon("copy")} Copy</button>
         <button class="btn btn-ghost btn-small" id="ticket-share-regen">${icon("refresh")} Regenerate</button>
       </div>`
        : `<button class="btn btn-primary btn-small" id="ticket-share-create">${icon("link")} Create share link</button>`);
    const createBtn = document.getElementById("ticket-share-create");
    if (createBtn)
        createBtn.addEventListener("click", async () => {
            try {
                await api(`/guilds/${guildId}/tickets/${ticketId}/share`, { method: "POST", body: JSON.stringify({ requesterId: session?.user?.id }) });
                await refreshShareControls();
            }
            catch (e) {
                await DCModal.alert(`Couldn't create share link: ${e.message}`);
            }
        });
    const copyBtn = document.getElementById("ticket-share-copy");
    if (copyBtn)
        copyBtn.addEventListener("click", () => {
            document.getElementById("ticket-share-url").select();
            navigator.clipboard?.writeText(shareUrl).catch(() => { });
        });
    const regenBtn = document.getElementById("ticket-share-regen");
    if (regenBtn)
        regenBtn.addEventListener("click", async () => {
            const ok = await DCModal.confirm("The old link will stop working immediately. Continue?", { title: "Regenerate share link", confirmLabel: "Regenerate" });
            if (!ok)
                return;
            try {
                await api(`/guilds/${guildId}/tickets/${ticketId}/share`, { method: "POST", body: JSON.stringify({ requesterId: session?.user?.id }) });
                await refreshShareControls();
            }
            catch (e) {
                await DCModal.alert(`Couldn't regenerate: ${e.message}`);
            }
        });
    async function refreshShareControls() {
        try {
            const fresh = await api(`/guilds/${guildId}/tickets/${ticketId}/transcript?requesterId=${session?.user?.id || ""}`);
            paintTicketShareControls(slot, guildId, ticketId, fresh.ticket);
        }
        catch { }
    }
}
async function enterSharePage(shareId) {
    showScreen("screen-share");
    const root = document.getElementById("share-root");
    root.innerHTML = loadingBlock("Loading ticket…");
    try {
        const data = await api(`/share/tickets/${shareId}`);
        const { ticket, guildName, messages } = data;
        root.innerHTML = `
      <div class="brand-row" style="margin-bottom:18px"><div class="brand-glyph"><img src="${siteAsset("images/logo.png")}" alt="NEXORIA logo"></div>NEXORIA</div>
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
    }
    catch (e) {
        root.innerHTML = `
      <div class="brand-row" style="margin-bottom:18px"><div class="brand-glyph"><img src="${siteAsset("images/logo.png")}" alt="NEXORIA logo"></div>NEXORIA</div>
      <div class="empty-state"><i class="ti ti-link-off glyph"></i>${escapeHtml(e.message || "This share link is invalid.")}</div>`;
    }
}
const CORE_PANELS = [];
let modulesLoaded = false;
let modulesLoadingPromise = null;
let modulesRetryTimer = null;
let modulesRetryAttempt = 0;
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const existing = [...document.scripts].find(s => s.dataset.nexoriaSrc === src || s.src === src);
        if (existing && existing.dataset.nexoriaLoaded === "1") { resolve(); return; }
        if (existing && existing._nexoriaPromise) { existing._nexoriaPromise.then(resolve, reject); return; }
        if (existing && existing.dataset.nexoriaLoadFailed === "1") existing.remove();
        const s = existing || document.createElement("script");
        s.src = src;
        s.async = true;
        s.dataset.nexoriaSrc = src;
        s._nexoriaPromise = new Promise((res, rej) => {
            s.onload = () => { s.dataset.nexoriaLoaded = "1"; s.dataset.nexoriaLoadFailed = "0"; res(); };
            s.onerror = () => { s.dataset.nexoriaLoadFailed = "1"; rej(new Error(`Failed to load ${src}`)); };
        });
        s._nexoriaPromise.then(resolve, reject);
        if (!existing) document.body.appendChild(s);
    });
}
function loadStyle(href) {
    if (document.querySelector(`link[href="${href}"]`))
        return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.dataset.nexoriaModuleStyle = "1";
    l.dataset.nexoriaStyleHref = href;
    l.onload = () => { l.dataset.nexoriaLoaded = "1"; };
    l.onerror = () => {
        console.warn(`[modules] Failed to load stylesheet ${href}; the rest of the dashboard will continue rendering.`);
        l.dataset.nexoriaLoadFailed = "1";
        l.remove();
        scheduleModulesRetry(`stylesheet failed: ${href}`);
    };
    document.head.appendChild(l);
}
function scheduleModulesRetry(reason = "temporary module/network failure") {
    if (modulesLoaded || modulesRetryTimer)
        return;
    modulesRetryAttempt = Math.min(modulesRetryAttempt + 1, 8);
    const delay = Math.min(15000, 1000 * Math.pow(1.6, modulesRetryAttempt - 1));
    console.warn(`[modules] ${reason}; retrying in ${Math.round(delay)}ms.`);
    modulesRetryTimer = setTimeout(async () => {
        modulesRetryTimer = null;
        try {
            await ensureModulesLoaded();
            if (modulesLoaded) {
                modulesRetryAttempt = 0;
                if (document.getElementById("screen-dashboard")?.classList.contains("active")) {
                    buildSidebar(currentGuildDisabledModules);
                    try {
                        switchPanel(currentPanelId, false, currentTab);
                    }
                    catch (e) {
                        console.warn("[modules] recovered module render failed:", e);
                    }
                }
            }
        }
        catch (e) {
            scheduleModulesRetry(e?.message || "module retry failed");
        }
    }, delay);
}
async function ensureModulesLoaded() {
    if (modulesLoaded) return true;
    if (modulesLoadingPromise) return modulesLoadingPromise;
    modulesLoadingPromise = (async () => {
        const failures = [];
        const localManifest = {
            shared: ["_shared/_registry.js", "_shared/_variables.js", "_shared/_dropdown.js"],
            modules: [
                { id: "ticket-tool", js: "ticket-tool/Code/ticket-tool.js", css: "ticket-tool/Code/ticket-tool.css", advancedJs: null },
                { id: "custom-commands", js: "custom-commands/Code/custom-commands.js", css: "custom-commands/Code/custom-commands.css", advancedJs: "custom-commands/Code/custom-commands-advanced.js" },
                { id: "logging", js: "logging/Code/logging.js", css: "logging/Code/logging.css", advancedJs: null },
                { id: "setup", js: "setup/Code/setup.js", css: "setup/Code/setup.css", advancedJs: null },
            ]
        };
        try {
            let manifest = null;
            try { manifest = await api("/modules"); }
            catch (e) { console.warn("[modules] Bot module manifest unavailable; using local module manifest.", e); }
            manifest = manifest && Array.isArray(manifest.modules) ? manifest : localManifest;
            const shared = Array.isArray(manifest.shared) && manifest.shared.length ? manifest.shared : localManifest.shared;
            for (const file of shared) {
                try {
                    await loadScript(versionedAsset(`${CFG.LOCAL_BOT_URL}/modules-static/${file}`));
                } catch (e) {
                    failures.push({ file, error: e });
                    console.warn(`[modules] Shared file ${file} failed to load; continuing.`, e);
                }
            }
            const moduleList = manifest.modules.length ? manifest.modules : localManifest.modules;
            for (const mod of moduleList) {
                if (mod.css) loadStyle(versionedAsset(`${CFG.LOCAL_BOT_URL}/modules-static/${mod.css}`));
                if (mod.js) {
                    try { await loadScript(versionedAsset(`${CFG.LOCAL_BOT_URL}/modules-static/${mod.js}`)); }
                    catch (e) { failures.push({ file: mod.js, error: e }); console.warn(`[modules] ${mod.id || mod.js} failed to load; continuing.`, e); }
                }
                if (mod.advancedJs) {
                    try { await loadScript(versionedAsset(`${CFG.LOCAL_BOT_URL}/modules-static/${mod.advancedJs}`)); }
                    catch (e) { failures.push({ file: mod.advancedJs, error: e }); console.warn(`[modules] ${mod.id || mod.js} advanced editor failed to load; continuing.`, e); }
                }
            }
            modulesLoaded = failures.length === 0 || (window.DC?.modules?.length || 0) > 0;
            if (failures.length && !modulesLoaded) scheduleModulesRetry(`${failures.length} module asset(s) failed`);
            return modulesLoaded;
        } catch (e) {
            modulesLoaded = false;
            scheduleModulesRetry(e?.message || "module manifest failed");
            return false;
        } finally {
            modulesLoadingPromise = null;
        }
    })();
    return modulesLoadingPromise;
}

function buildContext(extra = {}) {
    const session = getSession();
    return {
        guildId: currentGuild.id,
        userId: session?.user?.id,
        api: (path, options) => api(path, options),
        modal: DCModal,
        routes,
        renderTicketDetail: (container, guildId, ticketId) => paintTicketDetailBody(container, guildId, ticketId),
        openerPreviewHtml,
        userDisplayHtml,
        navigateToTab: (tab) => { routes.go(routes.moduleUrl(currentGuild.id, currentPanelId, tab)); switchTab(tab); },
        navigateToTicket: (ticketId) => { routes.go(routes.ticketUrl(currentGuild.id, currentPanelId, ticketId)); switchToTicketView(ticketId); },
        ...extra,
    };
}
function switchToTicketView(ticketId) {
    document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.panel === currentPanelId));
    const root = document.getElementById("module-root");
    root.innerHTML = `<button class="btn btn-ghost btn-small" id="dash-ticket-back">${icon("arrow-left")} Back</button><div id="dash-ticket-body" style="margin-top:16px">${loadingBlock("Loading ticket…")}</div>`;
    document.getElementById("dash-ticket-back")?.addEventListener("click", () => { routes.go(routes.moduleUrl(currentGuild.id, currentPanelId)); switchPanel(currentPanelId, false); });
    paintTicketDetailBody(document.getElementById("dash-ticket-body"), currentGuild.id, ticketId);
}
function navItemHtml(id, tablerIconUnused, label, toggleable, isEnabled) {
    const disabledClass = toggleable && !isEnabled ? "module-disabled" : "";
    const iconHtml = icon(id);
    return `<div class="nav-item ${disabledClass}" data-panel="${id}" title="${escapeHtml(label)}">
    ${iconHtml}<span class="nav-item-label">${escapeHtml(label)}</span>
    ${toggleable ? `<button class="toggle nav-item-toggle ${isEnabled ? "on" : ""}" data-module-toggle="${id}" aria-label="Toggle ${escapeHtml(label)}"></button>` : ""}
  </div>`;
}
function buildSidebar(disabledModules) {
    disabledModules = Array.isArray(disabledModules) ? disabledModules : [];
    const wrap = document.getElementById("dash-nav-items");
    if (!wrap) return;
    const modules = (Array.isArray(window.DC?.modules) ? window.DC.modules : []).filter(m => m && m.id !== "status");
    const activePanel = wrap.querySelector(".nav-item.active")?.dataset.panel || null;
    const modulesHtml = modules.length
        ? `<div class="nav-section-label">Modules</div><div class="module-sidebar-search"><input id="sidebar-module-search" class="search-input" placeholder="Search modules…" autocomplete="off"></div><div id="sidebar-module-list">${modules.map(m => navItemHtml(m.id, m.icon, m.label || prettifyModuleId(m.id), true, !disabledModules.includes(m.id))).join("")}</div>`
        : "";
    const generalHtml = `<div class="nav-section-label">General</div>${navItemHtml("general-settings", "", "General Settings", false)}${navItemHtml("audit-log", "", "Audit Log", false)}`;
    wrap.innerHTML = modulesHtml + generalHtml;
    const moduleList=wrap.querySelector("#sidebar-module-list"), search=wrap.querySelector("#sidebar-module-search");
    if(search) search.addEventListener("input",()=>{const q=search.value.toLowerCase().trim();moduleList.querySelectorAll(".nav-item").forEach(n=>n.style.display=(!q||n.textContent.toLowerCase().includes(q))?"":"none");});
    if (activePanel)
        wrap.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.panel === activePanel));
    wrap.querySelectorAll(".nav-item").forEach(n => n.addEventListener("click", (e) => {
        if (e.target.closest("[data-module-toggle]"))
            return;
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
    const ok = await DCModal.confirm(`${label} keeps working normally either way — this only changes how it looks in your sidebar.`, { title: `${turningOn ? "Turn on" : "Turn off"} ${label}?`, confirmLabel: turningOn ? "Turn on" : "Turn off" });
    if (!ok)
        return;
    try {
        await api(`/guilds/${currentGuild.id}/modules/${moduleId}`, { method: "PUT", body: JSON.stringify({ enabled: turningOn }) });
        currentGuildDisabledModules = turningOn ? disabledModules.filter(id => id !== moduleId) : [...disabledModules, moduleId];
        buildSidebar(currentGuildDisabledModules);
        if (currentPanelId === moduleId)
            setModuleDisabledOverlay(!turningOn);
    }
    catch (e2) {
        await DCModal.alert(`Couldn't update module: ${e2.message}`);
    }
}
function setModuleDisabledOverlay(isDisabled) {
    const wrap = document.getElementById("module-root-wrap");
    const overlay = document.getElementById("module-disabled-overlay");
    if (!wrap || !overlay)
        return;
    wrap.classList.toggle("disabled-active", isDisabled);
    overlay.style.display = isDisabled ? "flex" : "none";
}
let currentPanelId = "ticket-tool";
let currentTab = null;
let serverSwitcherWired = false;
function wireServerSwitcher() {
    if (serverSwitcherWired)
        return;
    serverSwitcherWired = true;
    wireFloatingDropdown("dash-nav-server", "dash-crumb-panel");
    document.getElementById("dash-nav-server")?.addEventListener("click", () => {
        const panel = document.getElementById("dash-crumb-panel");
        if (panel.style.display !== "none")
            paintServerSwitcherPanel(panel);
    });
}
let pickerServerSwitcherWired = false;
function wirePickerServerSwitcher() {
    if (pickerServerSwitcherWired)
        return;
    pickerServerSwitcherWired = true;
    wireFloatingDropdown("picker-server-switch", "picker-server-switch-panel");
    document.getElementById("picker-server-switch")?.addEventListener("click", () => {
        const panel = document.getElementById("picker-server-switch-panel");
        if (panel.style.display !== "none")
            paintServerSwitcherPanel(panel);
    });
}
async function paintServerSwitcherPanel(panel) {
    panel.innerHTML = loadingBlock("Loading servers…");
    const session = getSession();
    let manageable = [];
    try {
        const guilds = await fetchMyGuilds(session.token);
        manageable = guilds.filter(isAdmin).sort((a, b) => a.name.localeCompare(b.name));
    }
    catch (e) {
        panel.innerHTML = `<div class="dropdown-panel-empty">Couldn't load servers: ${escapeHtml(e.message)}</div>`;
        return;
    }
    const botGuildIds = new Set((botInfoCache?.guilds || []).map(g => g.id));
    const withBot = manageable.filter(g => botGuildIds.has(g.id));
    const dashSub = document.getElementById("dash-server-sub");
    if (dashSub)
        dashSub.textContent = `${withBot.length} server${withBot.length === 1 ? "" : "s"}`;
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
            if (guildId === currentGuild?.id) {
                closeAllFloatingDropdowns();
                return;
            }
            currentGuild = { id: guildId, name: row.dataset.switchName, icon: row.dataset.switchIcon };
            closeAllFloatingDropdowns();
            routes.go(routes.moduleUrl(currentGuild.id, "ticket-tool"));
            enterDashboard("ticket-tool");
        }));
    }
    wireRows();
    document.getElementById("dash-crumb-search")?.addEventListener("input", (e) => {
        const q = e.target.value.trim().toLowerCase();
        const list = document.getElementById("dash-crumb-list");
        const filtered = withBot.filter(g => g.name.toLowerCase().includes(q));
        list.innerHTML = filtered.length ? filtered.map(rowHtml).join("") : `<div class="dropdown-panel-empty">No matches</div>`;
        wireRows();
    });
    document.getElementById("dash-crumb-view-all")?.addEventListener("click", () => {
        closeAllFloatingDropdowns();
        routes.go("/dashboard");
        enterPicker("dashboard");
    });
}
async function enterDashboard(panel, { tab, ticketId } = {}) {
    showScreen("screen-dashboard");
    window.NexoriaAI?.setVisible?.(panel === "docs");
    renderSidebarBottom("dash-sidebar-bottom");
    const session = getSession();
    const moduleRoot = document.getElementById("module-root");
    if (botInfoCache) {
        try { await ensureModulesLoaded(); } catch (e) { console.warn("[modules] initial dashboard module load failed:", e); }
    }
    buildSidebar(currentGuildDisabledModules);
    if (!moduleRoot) return;
    moduleRoot.innerHTML = loadingBlock("Loading dashboard…");
    await refreshHeroStatus();
    if (botInfoCache) {
        void ensureModulesLoaded().then(() => {
            if (modulesLoaded) {
                buildSidebar(currentGuildDisabledModules);
                if (currentPanelId && document.getElementById("screen-dashboard")?.classList.contains("active")) {
                    try {
                        switchPanel(currentPanelId, false, currentTab);
                    }
                    catch (e) {
                        console.warn("[modules] post-load render failed:", e);
                    }
                }
            }
        });
    }
    if (!currentGuild.name && botInfoCache) {
        const found = (botInfoCache.guilds || []).find(g => g.id === currentGuild.id);
        if (found)
            currentGuild = { id: found.id, name: found.name, icon: found.icon };
    }
    const dashName=document.getElementById("dash-server-name"), dashIcon=document.getElementById("dash-server-icon"), dashCrumb=document.getElementById("dash-crumb");
    if(dashName) dashName.textContent=currentGuild.name||"Server";
    if(dashIcon) dashIcon.innerHTML=currentGuild.icon?`<img src="https://cdn.discordapp.com/icons/${currentGuild.id}/${currentGuild.icon}.png" alt="">`:initials(currentGuild.name||"S");
    if(dashCrumb) dashCrumb.innerHTML=`<button type="button" class="crumb-link" data-crumb-dashboard>Servers</button>${icon("chevron-right",12)}<button type="button" class="crumb-link current" data-crumb-server>${escapeHtml(currentGuild.name||"…")}</button>`;
    dashCrumb?.querySelector("[data-crumb-dashboard]")?.addEventListener("click", () => { routes.go("/dashboard"); enterPicker("dashboard"); });
    dashCrumb?.querySelector("[data-crumb-server]")?.addEventListener("click", () => { document.getElementById("dash-nav-server")?.click(); });
    wireServerSwitcher();
    const crumbPanel = document.getElementById("dash-crumb-panel");
    if (crumbPanel)
        paintServerSwitcherPanel(crumbPanel).then(() => { crumbPanel.style.display = "none"; }).catch(e => { console.warn("[server-switcher] initial load failed; retrying on next open:", e); crumbPanel.style.display = "none"; });
    const sub = document.getElementById("dash-server-sub");
    let guildDisabledModules = [];
    if (botInfoCache) {
        const meta = await api(`/guilds/${currentGuild.id}/meta?userId=${session.user.id}`).catch(() => null);
        guildDisabledModules = meta?.disabledModules || [];
        currentGuildDisabledModules = guildDisabledModules;
        if (sub.textContent === "—")
            sub.textContent = "…";
        if (meta && meta.allowed === false) {
            buildSidebar(guildDisabledModules);
            document.getElementById("module-root").innerHTML = `
        <div class="empty-state" style="max-width:520px;margin:40px auto"><i class="ti ti-lock-off glyph"></i>${escapeHtml(meta.notAllowedMessage || "This server isn't authorized to use this tool.")}</div>`;
            return;
        }
    }
    else {
        sub.textContent = "Bot Servers down";
    }
    buildSidebar(guildDisabledModules);
    currentPanelId = panel;
    currentTab = tab || null;
    if (ticketId) {
        document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.panel === panel));
        const root = document.getElementById("module-root");
        root.innerHTML = `<button class="btn btn-ghost btn-small" id="dash-ticket-back">${icon("arrow-left")} Back</button><div id="dash-ticket-body" style="margin-top:16px">${loadingBlock("Loading ticket…")}</div>`;
        document.getElementById("dash-ticket-back")?.addEventListener("click", () => { routes.go(routes.moduleUrl(currentGuild.id, panel)); switchPanel(panel, false); });
        await paintTicketDetailBody(document.getElementById("dash-ticket-body"), currentGuild.id, ticketId);
        return;
    }
    switchPanel(panel, false, tab);
}
let panelRenderGeneration = 0;
function switchPanel(name, updateUrl = true, tab = null) {
    if (updateUrl && routes.go(routes.moduleUrl(currentGuild.id, name, tab)) === false) return;
    const generation = ++panelRenderGeneration;
    currentPanelId = name;
    currentTab = tab;
    document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.panel === name));
    setModuleDisabledOverlay(currentGuildDisabledModules.includes(name));
    const root = document.getElementById("module-root");
    if (!root) return;
    root.innerHTML = loadingBlock();
    root.dataset.renderGeneration = String(generation);
    const mod = window.DC?.getModule?.(name);
    const renderers = { status: renderStatusModule, "general-settings": renderGeneralSettings, "audit-log": renderAuditLog, docs: (root) => renderDocsPanel(root, null), leaderboards: renderLeaderboardsPanel, premium: renderPremiumPanel, profile: renderProfileSettings, admin: renderAdminPanel };
    const renderer = async () => {
        let resolved = mod || window.DC?.getModule?.(name);
        if (!resolved && !renderers[name]) {
            root.innerHTML = loadingBlock(`Loading ${prettifyModuleId(name)}…`);
            await ensureModulesLoaded();
            resolved = window.DC?.getModule?.(name);
        }
        if (resolved) return resolved.render(root, { ...buildContext(), renderGeneration: generation }, tab);
        if (renderers[name]) return renderers[name](root);
        throw new Error(`Module "${name}" is not available yet.`);
    };
    try {
        Promise.resolve(renderer()).catch(e => {
            console.error(`[render] ${name} failed; keeping the dashboard usable:`, e);
            if (String(root.dataset.renderGeneration) !== String(generation) || currentPanelId !== name) return;
            root.innerHTML = `<div class="empty-state render-error"><div class="render-error-title">This section couldn't finish loading.</div><div class="field-hint">${escapeHtml(e?.message || "Temporary loading error")}</div><button class="btn btn-primary btn-small" id="render-retry">Retry</button></div>`;
            root.querySelector("#render-retry")?.addEventListener("click", () => switchPanel(name, false, tab));
            scheduleRouteRetry(`render failed for ${name}`);
        });
    }
    catch (e) {
        console.error(`[render] ${name} failed; keeping the dashboard usable:`, e);
        if (String(root.dataset.renderGeneration) !== String(generation) || currentPanelId !== name) return;
        root.innerHTML = `<div class="empty-state render-error"><div class="render-error-title">This section couldn't finish loading.</div><div class="field-hint">${escapeHtml(e?.message || "Temporary loading error")}</div><button class="btn btn-primary btn-small" id="render-retry">Retry</button></div>`;
        root.querySelector("#render-retry")?.addEventListener("click", () => switchPanel(name, false, tab));
    }
}
function switchTab(tab) {
    currentTab = tab;
    routes.go(routes.moduleUrl(currentGuild.id, currentPanelId, tab));
}
async function renderGeneralSettings(root) {
    root.innerHTML = loadingBlock("Loading General Settings…");
    try {
        const d = await api(`/guilds/${currentGuild.id}/general-settings?userId=${encodeURIComponent(getSession().user.id)}`);
        if (!root.isConnected || currentPanelId !== "general-settings") return;
        const s = d.settings || {};
        root.innerHTML = `<div class="dash-header"><div><h1>General Settings</h1><p>Dashboard access and Audit Log visibility. Only the server owner can change these settings.</p></div></div>
      <div class="config-section"><h3>Audit Log access</h3><p class="hint">Choose who can open the Audit Log for this server.</p><select id="audit-log-mode" class="dc-select" ${d.editable ? "" : "disabled"}><option value="owner">Owner only</option><option value="everyone">Everyone with dashboard access</option><option value="administrators">Administrators</option><option value="roles">Selected roles</option></select><div id="audit-log-roles-wrap" style="margin-top:10px;display:${s.auditLogMode === "roles" ? "block" : "none"}"><input id="audit-log-roles" class="search-input" placeholder="Role IDs, comma separated" value="${escapeHtml((s.auditLogRoles || []).join(","))}" ${d.editable ? "" : "disabled"}></div></div>
      <div class="config-section"><h3>Leaderboards</h3><p class="hint">Only rated reviews count. Choose whether this server is shown publicly.</p><select id="leaderboard-mode" class="dc-select" ${d.editable ? "" : "disabled"}><option value="all">Show on all supported leaderboards</option><option value="ticket-reviews">Ticket Tool only</option><option value="none">Do not show this server</option></select><div class="field-hint" style="margin-top:8px">Public leaderboard cache refreshes every 30 minutes.</div></div>
      <div class="config-section"><h3>Dashboard access</h3><p class="hint">${d.editable ? "Choose who may open this server’s dashboard." : "You can view these settings, but only the server owner can change them."}</p><select id="dashboard-access-mode" class="dc-select" ${d.editable ? "" : "disabled"}><option value="everyone">Everyone</option><option value="administrators">Administrators</option><option value="roles">Selected roles</option></select><div id="dashboard-roles-wrap" style="margin-top:10px;display:${s.dashboardMode === "roles" ? "block" : "none"}"><input id="dashboard-roles" class="search-input" placeholder="Role IDs, comma separated" value="${escapeHtml((s.dashboardRoles || []).join(","))}" ${d.editable ? "" : "disabled"}></div></div>
      <div class="config-section"><h3>Terminal announcements</h3><p class="hint">Allows the bot owner’s terminal <code>announce</code> command to publish to the configured announcement destination for this server.</p><button type="button" id="terminal-announcements-toggle" class="toggle ${s.terminalAnnouncementsEnabled !== false ? "on" : ""}" ${d.editable ? "" : "disabled"} aria-label="Toggle terminal announcements"></button><span id="terminal-announcements-state" class="field-hint" style="margin-left:10px">${s.terminalAnnouncementsEnabled !== false ? "Enabled" : "Disabled"}</span></div>
      <div class="config-section" style="margin-top:14px"><h3>Settings backup</h3><p class="hint">Export all NEXORIA settings for this server, including module settings and custom command definitions. Ticket history is never included.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost btn-small" id="settings-export-all">${icon("download")} Export all settings</button>${d.editable?`<button class="btn btn-ghost btn-small" id="settings-import-all">${icon("upload")} Import settings</button>`:""}</div></div><div style="margin-top:14px">${d.editable ? `<button class="btn btn-primary" id="save-general-settings">${icon("check")} Save Settings</button>` : `<div class="field-hint">Owner-only editing is enabled for this server.</div>`}</div>`;
        const mode = root.querySelector("#audit-log-mode");
        const rolesWrap = root.querySelector("#audit-log-roles-wrap");
        const lbMode = root.querySelector("#leaderboard-mode");
        const dashMode = root.querySelector("#dashboard-access-mode");
        const dashRolesWrap = root.querySelector("#dashboard-roles-wrap");
        const announceToggle = root.querySelector("#terminal-announcements-toggle");
        const announceState = root.querySelector("#terminal-announcements-state");
        if (announceToggle) announceToggle.dataset.enabled = s.terminalAnnouncementsEnabled !== false ? "true" : "false";
        if (announceToggle) announceToggle.addEventListener("click",()=>{ const on = announceToggle.dataset.enabled !== "true"; announceToggle.dataset.enabled=String(on); announceToggle.classList.toggle("on",on); if(announceState) announceState.textContent=on?"Enabled":"Disabled"; });
        if (lbMode) lbMode.value=s.leaderboardMode||"all";
        if(dashMode) dashMode.value=s.dashboardMode||"everyone";
        if(dashMode) dashMode.addEventListener("change",()=>{if(dashRolesWrap)dashRolesWrap.style.display=dashMode.value==="roles"?"block":"none";});
        if(mode) mode.addEventListener("change",()=>{if(rolesWrap)rolesWrap.style.display=mode.value==="roles"?"block":"none";});
        root.querySelector("#settings-export-all")?.addEventListener("click", async()=>{try{const data=await api(`/guilds/${currentGuild.id}/settings/export?userId=${encodeURIComponent(getSession().user.id)}`);const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download=`nexoria-settings-${currentGuild.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(u),500);}catch(e){await DCModal.alert(e.message,{title:"Export failed"});}});
        root.querySelector("#settings-import-all")?.addEventListener("click",()=>{const input=document.createElement("input");input.type="file";input.accept="application/json";input.onchange=async()=>{try{const file=input.files?.[0];if(!file)return;const data=JSON.parse(await file.text());const ok=await DCModal.confirm("This replaces imported settings while leaving ticket history untouched.",{title:"Import NEXORIA settings?",confirmLabel:"Import",danger:false});if(!ok)return;await api(`/guilds/${currentGuild.id}/settings/import`,{method:"POST",body:JSON.stringify({userId:getSession().user.id,data})});await DCModal.alert("Settings imported. Reloading the dashboard to apply them.",{title:"Import complete"});await renderGeneralSettings(root);}catch(e){await DCModal.alert(e.message||"Invalid settings file",{title:"Import failed"});}};input.click();});
        if (d.editable)
            document.getElementById("save-general-settings")?.addEventListener("click", async () => {
                try {
                    await api(`/guilds/${currentGuild.id}/general-settings`, { method: "PUT", body: JSON.stringify({ userId:getSession().user.id,auditLogMode:mode?.value||"owner",auditLogRoles:(root.querySelector("#audit-log-roles")?.value||"").split(",").map(x=>x.trim()).filter(Boolean),leaderboardMode:lbMode?.value||"all",dashboardMode:dashMode?.value||"everyone",dashboardRoles:(root.querySelector("#dashboard-roles")?.value||"").split(",").map(x=>x.trim()).filter(Boolean),terminalAnnouncementsEnabled:announceToggle?.dataset.enabled !== "false" }) });
                    await DCModal.alert("General Settings saved.", { title: "Saved" });
                }
                catch (e) {
                    await DCModal.alert(e.message, { title: "Couldn't save settings" });
                }
            });
    }
    catch (e) {
        root.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`;
    }
}
async function renderAuditLog(root) {
    root.innerHTML = loadingBlock("Loading Audit Log…");
    try {
        const base = `/guilds/${currentGuild.id}/audit-log?userId=${encodeURIComponent(getSession().user.id)}&limit=1000`;
        const d = await api(base);
        if (!root.isConnected || currentPanelId !== "audit-log") return;
        const entries = Array.isArray(d.entries) ? d.entries : [];
        const userIds = Array.isArray(d.users) ? d.users : [];
        const actions = Array.isArray(d.actions) ? d.actions : [];
        const profiles = d.profiles || {};
        const userLabel = (id) => { const p = profiles[String(id)]; return p?.displayName || p?.username || (id ? id : "Unknown user"); };
        const actionLabel = (action) => String(action || "change").replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        const actionIcon = (action) => {
            const x = String(action || "").toLowerCase();
            if (x.includes("delete") || x.includes("remove") || x.includes("kick"))
                return icon("trash");
            if (x.includes("create") || x.includes("add") || x.includes("invite"))
                return icon("plus");
            if (x.includes("channel"))
                return icon("channel");
            if (x.includes("role"))
                return icon("roles");
            if (x.includes("integration"))
                return icon("link");
            if (x.includes("general") || x.includes("setting") || x.includes("update"))
                return icon("settings");
            return icon("audit");
        };
        const avatarFor = (x) => x.avatarUrl || x.userAvatar || x.avatar || "";
        const dateLabel = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "Unknown time" : d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); };
        const dayStart = (offset) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - offset); return d; };
        root.innerHTML = `
      <div class="audit-page">
        <div class="dash-header audit-header">
          <div><h1>Audit Log</h1><p>Track server changes, dashboard actions, and administrative activity.</p></div>
        </div>
        <div class="audit-filters">
          <label><span>Filter by User</span><select id="audit-user" class="dc-select"><option value="">All Users</option>${userIds.map(id => `<option value="${escapeHtml(id)}">${escapeHtml(userLabel(id))}</option>`).join("")}</select></label>
          <label><span>Filter by Action</span><select id="audit-action" class="dc-select"><option value="">All Actions</option>${actions.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(actionLabel(x))}</option>`).join("")}</select></label>
          <label><span>Filter by Date</span><select id="audit-date" class="dc-select"><option value="">All Dates</option><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="7">Last 7 Days</option><option value="30">Last 30 Days</option><option value="custom">Custom Range</option></select></label>
          <button class="btn btn-ghost audit-refresh" id="audit-refresh" title="Refresh">${icon("refresh")}<span>Refresh</span></button>
        </div>
        <div class="audit-custom-date" id="audit-custom-date" hidden>
          <label><span>From</span><input id="audit-date-from" type="date" class="search-input"></label>
          <label><span>To</span><input id="audit-date-to" type="date" class="search-input"></label>
        </div>
        <div class="audit-list" id="audit-list"></div>
      </div>`;
        const list = root.querySelector("#audit-list");
        function paint() {
            let rows = entries.slice();
            const u = root.querySelector("#audit-user").value;
            const act = root.querySelector("#audit-action").value;
            const date = root.querySelector("#audit-date").value;
            if (u)
                rows = rows.filter(x => String(x.userId || "") === u);
            if (act)
                rows = rows.filter(x => String(x.action || "") === act);
            if (date && date !== "custom") {
                const now = new Date();
                if (date === "today") {
                    const s = dayStart(0);
                    const e = new Date(s);
                    e.setDate(e.getDate() + 1);
                    rows = rows.filter(x => new Date(x.createdAt) >= s && new Date(x.createdAt) < e);
                }
                else if (date === "yesterday") {
                    const e = dayStart(0);
                    const s = dayStart(1);
                    rows = rows.filter(x => new Date(x.createdAt) >= s && new Date(x.createdAt) < e);
                }
                else {
                    const s = dayStart(Number(date) - 1);
                    rows = rows.filter(x => new Date(x.createdAt) >= s && new Date(x.createdAt) <= now);
                }
            }
            if (date === "custom") {
                const f = root.querySelector("#audit-date-from").value, t = root.querySelector("#audit-date-to").value;
                if (f) {
                    const d = new Date(`${f}T00:00:00`);
                    rows = rows.filter(x => new Date(x.createdAt) >= d);
                }
                if (t) {
                    const d = new Date(`${t}T23:59:59.999`);
                    rows = rows.filter(x => new Date(x.createdAt) <= d);
                }
            }
            list.innerHTML = rows.length ? rows.map(x => {
                const avatar = avatarFor(x);
                const user = userLabel(x.userId);
                const action = actionLabel(x.action);
                return `<button class="audit-entry" type="button" data-audit-id="${escapeHtml(x.id || "")}">
          <span class="audit-entry-icon">${actionIcon(x.action)}</span>
          <span class="audit-avatar">${avatar ? `<img src="${escapeHtml(avatar)}" alt="">` : icon("profile")}</span>
          <span class="audit-entry-main"><strong>${escapeHtml(user)} <span class="audit-action-text">${escapeHtml(String(x.summary || x.message || action).replace(/_/g, " "))}</span></strong><small>${escapeHtml(dateLabel(x.createdAt))}</small></span>
          ${x.revertable ? `<span class="audit-revert-wrap"><button type="button" class="btn btn-ghost btn-small audit-revert-btn" data-audit-revert="${escapeHtml(x.id || "")}">${icon("history")} Revert</button></span>` : (x.details ? `<span class="audit-chevron">${icon("chevron-right")}</span>` : "")}
        </button>`;
            }).join("") : `<div class="empty-state audit-empty">No audit entries match these filters.</div>`;
            list.querySelectorAll("[data-audit-revert]").forEach(btn => btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const ok = await DCModal.confirm("Restore the saved state from this change? The current state will be recorded as a new audit entry.", { title: "Revert this change?", confirmLabel: "Revert", danger: true });
                if (!ok) return;
                try { await api(`/guilds/${currentGuild.id}/audit-log/${encodeURIComponent(btn.dataset.auditRevert)}/revert`, { method: "POST", body: JSON.stringify({ userId: getSession().user.id }) }); await renderAuditLog(root); }
                catch (e2) { await DCModal.alert(e2.message, { title: "Couldn't revert change" }); }
            }));
            list.querySelectorAll(".audit-entry").forEach(btn => btn.addEventListener("click", () => {
                const item = entries.find(x => String(x.id) === btn.dataset.auditId);
                if (!item || !item.details)
                    return;
                const detail = typeof item.details === "string" ? item.details : JSON.stringify(item.details, null, 2);
                DCModal.custom(`<div class="dc-modal-header"><h3>${escapeHtml(actionLabel(item.action))}</h3></div><div class="dc-modal-body"><pre class="audit-detail-pre">${escapeHtml(detail)}</pre>${item.revertable ? `<div style="margin-top:12px"><button type="button" class="btn btn-danger btn-small" id="audit-detail-revert">${icon("history")} Revert this change</button></div>` : ""}</div><div class="dc-modal-footer"><button type="button" class="btn btn-primary btn-small" id="audit-detail-close">Close</button></div>`, { maxWidth: "700px", onMount: rr => { rr.querySelector("#audit-detail-close")?.addEventListener("click", () => DCModal.close()); rr.querySelector("#audit-detail-revert")?.addEventListener("click", async () => { const ok = await DCModal.confirm("Restore the saved state from this change?", { title: "Revert this change?", confirmLabel: "Revert", danger: true }); if (!ok) return; try { await api(`/guilds/${currentGuild.id}/audit-log/${encodeURIComponent(item.id)}/revert`, { method: "POST", body: JSON.stringify({ userId: getSession().user.id }) }); DCModal.close(); await renderAuditLog(root); } catch (e2) { await DCModal.alert(e2.message, { title: "Couldn't revert change" }); } }); } });
            }));
        }
        ["audit-user", "audit-action", "audit-date", "audit-date-from", "audit-date-to"].forEach(id => root.querySelector(`#${id}`)?.addEventListener("change", () => {
            root.querySelector("#audit-custom-date").hidden = root.querySelector("#audit-date").value !== "custom";
            paint();
        }));
        root.querySelector("#audit-refresh").addEventListener("click", () => renderAuditLog(root));
        paint();
    }
    catch (e) {
        root.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`;
    }
}
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
    try {
        history = await api("/status-history");
    }
    catch {
        history = null;
    }
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
    if (!slot)
        return;
    try {
        const meta = await api(`/guilds/${currentGuild.id}/meta?userId=${getSession().user.id}`);
        const disabled = meta.disabledModules || [];
        const modules = (window.DC?.modules || []).filter(m => m.id !== "status");
        if (modules.length === 0) {
            slot.innerHTML = `<div class="empty-state">No modules loaded.</div>`;
            return;
        }
        slot.innerHTML = modules.map(m => `
      <div class="config-row">
        <span class="config-row-label"><i class="ti ${m.icon}" style="margin-right:8px;color:var(--text-dim)"></i>${escapeHtml(m.label)}</span>
        <span class="badge badge-${disabled.includes(m.id) ? "closed" : "open"}">${disabled.includes(m.id) ? "Off" : "On"}</span>
      </div>`).join("");
    }
    catch {
        slot.innerHTML = `<div class="empty-state">Couldn't load module list.</div>`;
    }
}
function wireStatusDayHoverTooltip(days, incidents) {
    const bar = document.getElementById("status-daybar");
    if (!bar)
        return;
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
    const seconds = Math.max(0, Number(totalSeconds) || 0);
    const whole = Math.floor(seconds);
    const hundredths = Math.min(99, Math.floor((seconds - whole) * 100));
    const days = Math.floor(whole / 86400);
    const hours = Math.floor((whole % 86400) / 3600);
    const mins = Math.floor((whole % 3600) / 60);
    const secs = whole % 60;
    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (mins) parts.push(`${mins}m`);
    parts.push(`${secs}s`);
    if (hundredths) parts.push(`${String(hundredths).padStart(2, "0")}ms`);
    return parts.join(" ");
}
const TOS_AGREEMENT_KEY = "tk_tos_agreed_v1";
function initTosGate() {
    const overlay = document.getElementById("tos-gate-overlay");
    if (!overlay)
        return;
    const termsLink = document.getElementById("tos-gate-terms-link");
    const privacyLink = document.getElementById("tos-gate-privacy-link");
    const siteRoot = window.location.origin + getSiteBasePath();
    if (termsLink)
        termsLink.href = `${siteRoot}site/policy/terms.html`;
    if (privacyLink)
        privacyLink.href = `${siteRoot}site/policy/privacy.html`;
    if (localStorage.getItem(TOS_AGREEMENT_KEY) === "1")
        return;
    overlay.style.display = "flex";
    document.body.style.overflow = "hidden";
    const checkbox = document.getElementById("tos-gate-checkbox");
    const continueBtn = document.getElementById("tos-gate-continue");
    if (!checkbox || !continueBtn) { console.warn("[tos] TOS controls are missing; skipping gate wiring."); return; }
    checkbox.addEventListener("change", () => { continueBtn.disabled = !checkbox.checked; });
    continueBtn.addEventListener("click", () => {
        if (!checkbox.checked)
            return;
        try {
            localStorage.setItem(TOS_AGREEMENT_KEY, "1");
        }
        catch { }
        overlay.style.display = "none";
        document.body.style.overflow = "";
    });
}
function showMaintenanceToast(message) {
    let el = document.getElementById("nexoria-maintenance-toast");
    if (!el) {
        el = document.createElement("div");
        el.id = "nexoria-maintenance-toast";
        el.className = "nexoria-maintenance-toast";
        el.innerHTML = '<span class="nexoria-maintenance-toast-text"></span><button type="button" aria-label="Close">×</button>';
        document.body.appendChild(el);
        el.querySelector("button").addEventListener("click", () => el.remove());
    }
    el.querySelector(".nexoria-maintenance-toast-text").textContent = message;
    el.style.display = "flex";
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.remove(), 15000);
}
let lastMaintenanceSignature = "";
async function pollMaintenanceState() {
    try {
        const state = await api("/maintenance", { method: "GET" });
        const last = localStorage.getItem("nexoria_last_maintenance_cancel");
        if (state.status === "cancelled" && state.cancelledAt && state.cancelledAt !== last) {
            localStorage.setItem("nexoria_last_maintenance_cancel", state.cancelledAt);
            showMaintenanceToast("The scheduled " + (state.action || "maintenance") + " has been cancelled.");
            lastMaintenanceSignature = "";
            return;
        }
        if (state.status === "scheduled" && state.startedAt) {
            const expected = Math.max(0, Number(state.expectedSeconds || 0));
            const elapsed = Math.max(0, Math.floor((Date.now() - new Date(state.startedAt).getTime()) / 1000));
            const remaining = expected ? Math.max(0, expected - elapsed) : 0;
            const signature = `${state.action}|${state.reason}|${remaining}`;
            if (signature !== lastMaintenanceSignature) {
                lastMaintenanceSignature = signature;
                const action = state.action === "restart" ? "restart" : "shutdown";
                showMaintenanceToast(`NEXORIA ${action} scheduled${remaining ? ` in ${formatUptime(remaining)}` : " now"}. ${state.reason || "Maintenance"}`);
            }
        } else if (state.status === "idle") {
            lastMaintenanceSignature = "";
        }
    } catch { }
}
// Restore the language-preference bootstrap used by the site startup path.
// This function is intentionally lightweight so the site still starts even when
// a language pack is unavailable; the selected language is persisted for the
// rest of the application to consume.
window.loadLanguagePreference = async function loadLanguagePreference() {
    const key = "nexoria_language";
    let language = "en";
    try {
        language = localStorage.getItem(key) || "en";
    } catch (_) {}
    document.documentElement.lang = language;
    try {
        window.NEXORIA_LANGUAGE = language;
        window.dispatchEvent(new CustomEvent("nexoria:language-ready", { detail: { language } }));
    } catch (_) {}
    return language;
};

document.addEventListener("click", (e) => {
    if (e.target.closest("[data-open-nexoria-ai]")) { e.preventDefault(); openNexoriaAI(); }
});
document.addEventListener("DOMContentLoaded", async () => {
    try {
        await loadPublicConfig();
    } catch (e) {
        console.error("[config] Failed to load NEXORIA configuration from known paths:", e);
        const landing = document.getElementById("screen-landing");
        if (landing) landing.insertAdjacentHTML("beforeend", `<div class="empty-state" style="margin-top:20px">NEXORIA configuration could not be loaded. Check the published site/data/config.json path and reload the page.</div>`);
        return;
    }
    await window.loadLanguagePreference();
    // Warm module assets before the user opens a server so controls are ready
    // when the first screen is rendered. Failures are retried by the module loader.
    void ensureModulesLoaded().catch(e => console.debug("[preload] module warm-up deferred:", e?.message || e));
    replaceLegacyTablerIcons(document);
    decorateAllButtons(document);
    function on(id, event, handler) {
        const el = document.getElementById(id);
        if (el)
            el.addEventListener(event, handler);
        else
            console.debug(`[wiring] Optional element #${id} is not present on this screen; skipping listener.`);
    }
    initTosGate();
    const discordBtn = document.getElementById("btn-discord-support");
    if (discordBtn && CFG.DISCORD_SUPPORT_URL) {
        discordBtn.href = CFG.DISCORD_SUPPORT_URL;
        discordBtn.target = "_blank";
        discordBtn.rel = "noopener noreferrer";
        discordBtn.style.display = "";
    }
    on("btn-login", "click", async (e) => {
        e.preventDefault();
        try {
            await beginLogin();
        }
        catch (err) {
            await DCModal.alert(err?.message || "Could not start Discord login.", { title: "Discord login unavailable" });
        }
    });
    on("btn-invite", "click", (e) => { e.preventDefault(); window.open(inviteUrl(), "_blank", "noopener,noreferrer"); });
    on("btn-leaderboards", "click", async (e) => {
        e.preventDefault();
        if (getSession()) {
            routes.go("/leaderboards", true);
            try { await renderFromRoute(); } catch (err) { scheduleRouteRetry(err?.message || "leaderboards failed to render"); }
            return;
        }
        sessionStorage.setItem("tk_post_login_redirect", "/leaderboards");
        try { await beginLogin(); }
        catch (err) { await DCModal.alert(err?.message || "Could not start Discord login.", { title: "Discord login unavailable" }); }
    });
    on("btn-logout", "click", () => { clearSession(); routes.go("/", true); showScreen("screen-landing"); });
    on("btn-back", "click", () => {
        if (window.location.pathname.includes("/servers/")) {
            routes.go("/dashboard");
            enterPicker();
        }
        else
            window.history.back();
    });
    void boot().catch(e => {
        console.error("[boot] initial boot failed; the app will retry automatically:", e);
        try {
            showScreen("screen-landing");
        }
        catch { }
        scheduleRouteRetry(e?.message || "initial boot failed");
    });
    pollMaintenanceState();
    setInterval(pollMaintenanceState, 1000);
    let polling = false;
    const statusTimer={id:null};
    async function runStatusPoll(){
        if (polling)
            return;
        polling = true;
        try {
            const wasOnline = botInfoCache?.online;
            await refreshHeroStatus();
            if (!wasOnline && botInfoCache?.online) {
                window.NexoriaAI?.sync?.();
                routeRetryAttempt = 0;
                if (document.getElementById("screen-dashboard")?.classList.contains("active")) {
                    await ensureModulesLoaded();
                    buildSidebar(currentGuildDisabledModules);
                }
                if (routeRetryTimer) {
                    clearTimeout(routeRetryTimer);
                    routeRetryTimer = null;
                }
                try {
                    await renderFromRoute();
                }
                catch (e) {
                    scheduleRouteRetry(e?.message || "screen recovery failed");
                }
            }
        }
        catch (e) {
            console.error("[status poll] refreshHeroStatus failed:", e);
        }
        finally { polling=false; }
        clearTimeout(statusTimer.id); statusTimer.id=setTimeout(runStatusPoll,Math.max(100,getRefreshPrefs().statusSeconds*1000));
    }
    runStatusPoll();
});
window.DC = window.DC || {};
window.DC.modal = DCModal;
window.DC.icon = icon;
window.DC.go = (url, replace = false) => routes.go(url, replace);
window.DC.decorateButtons = decorateAllButtons;
