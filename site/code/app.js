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
    const src = [...document.scripts].map(s => s.src).find(src => /(?:\/website)?(?:\/site)?\/code\/app(?:\.min)?\.js(?:\?|$)/i.test(src));
    if (src) {
        try { return new URL("../", new URL(src, window.location.href)).pathname; } catch {}
    }
    const base = getSiteBasePath().replace(/\/+$/, "");
    return `${base || "/"}/`;
}
function normalizeWebAssetRoot() {
    let p = getWebAssetRoot().replace(/\/+$/, "");
    // The published GitHub Pages tree is now website/site itself.  Older
    // builds used /NEXORIA/site/...; keep that form readable when an old
    // cached page is encountered, but never manufacture a second /site.
    if (/\/website\/site$/i.test(p)) p = p.replace(/\/website\/site$/i, "");
    else if (/\/website$/i.test(p)) p = p.replace(/\/website$/i, "");
    return `${p || "/"}/`;
}
window.NEXORIA_SITE_BASE = getSiteBasePath();
window.NEXORIA_WEB_ASSET_ROOT = normalizeWebAssetRoot();

// Canonicalize malformed duplicated GitHub Pages repository prefixes such as
// /NEXORIA/NEXORIA/ back to the real project root /NEXORIA/. This can happen
// when an older 404/SPA fallback or bookmark prepends the repository name twice.
(function canonicalizeDuplicateRepoPath(){
    try {
        if (!/github\.io$/i.test(window.location.hostname)) return;
        const parts = String(window.location.pathname || "/").split("/").filter(Boolean);
        if (parts.length < 2 || parts[0].toLowerCase() !== parts[1].toLowerCase()) return;
        const repoBase = `/${parts[0]}`;
        const rest = parts.slice(2).join("/");
        const target = rest ? `${repoBase}/${rest}` : `${repoBase}/`;
        window.history.replaceState({}, "", `${target}${window.location.search || ""}${window.location.hash || ""}`);
    } catch {}
})();

// Canonicalize the former /NEXORIA/website/* public URLs to /NEXORIA/* so
// old bookmarks and OAuth callbacks land on the current GitHub Pages root.
(function canonicalizeLegacyWebsitePath(){
    try {
        if (!/github\.io$/i.test(window.location.hostname)) return;
        const parts = String(window.location.pathname || "/").split("/").filter(Boolean);
        if (parts.length < 2 || String(parts[1]).toLowerCase() !== "website") return;
        const repoBase = `/${parts[0]}`;
        const rest = parts.slice(2).join("/");
        const target = rest ? `${repoBase}/${rest}` : `${repoBase}/`;
        window.history.replaceState({}, "", `${target}${window.location.search || ""}${window.location.hash || ""}`);
        window.NEXORIA_SITE_BASE = `${repoBase}/`;
    } catch {}
})();

function siteAsset(path) {
    const base = normalizeWebAssetRoot().replace(/\/+$/, "");
    return `${base}/${String(path || "").replace(/^\/+/, "")}`;
}
const ASSET_VERSION = String(window.NEXORIA_ASSET_VERSION || "20261008.01");
function versionedAsset(url) { return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(ASSET_VERSION)}`; }
function repoAsset(path) {
    let assetRoot = normalizeWebAssetRoot().replace(/\/+$/, "");
    assetRoot = assetRoot.replace(/\/website\/site$/i, "").replace(/\/site$/i, "");
    const base = assetRoot || "/";
    return `${base.replace(/\/+$/, "")}/${String(path || "").replace(/^\/+/, "")}`;
}
function normalizePublicRoutePath(value) {
    let raw = String(value || "/");
    try {
        const u = new URL(raw, window.location.origin);
        if (u.origin !== window.location.origin) return raw;
        raw = u.pathname + u.search + u.hash;
    } catch {}
    if (/github\.io$/i.test(window.location.hostname)) {
        const clean = raw.split(/[?#]/, 1)[0];
        const suffix = raw.slice(clean.length);
        const parts = clean.split("/").filter(Boolean);
        if (parts.length >= 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) {
            const repo = `/${parts[0]}`;
            const rest = parts.slice(2).join("/");
            return `${repo}/${rest}${suffix}`.replace(/\/{2,}/g, "/");
        }
    }
    return raw;
}
function policyUrl(kind) {
    const base = getSiteBasePath().replace(/\/+$/, "");
    const page = String(kind || "").toLowerCase() === "privacy" ? "privacy" : "terms";
    return `${base}/${page}`;
}
// Safe module API is available before asynchronously loaded module assets arrive.
// This prevents first-render races from breaking the dashboard.
window.DC = window.DC || {};
window.DC.modules = Array.isArray(window.DC.modules) ? window.DC.modules : [];
window.DC.moduleDefaultOrder = Array.isArray(window.DC.moduleDefaultOrder) ? window.DC.moduleDefaultOrder : [];
if (typeof window.DC.getModule !== "function") window.DC.getModule = id => window.DC.modules.find(m => m.id === id);
if (typeof window.DC.registerModule !== "function") window.DC.registerModule = mod => {
    if (!mod || !mod.id || typeof mod.render !== "function") return;
    const i = window.DC.modules.findIndex(m => m.id === mod.id);
    if (i >= 0) window.DC.modules[i] = mod; else window.DC.modules.push(mod);
};
async function loadPublicConfig() {
    if (CFG) return CFG;
    if (configPromise) return configPromise;
    const configUrl = versionedAsset(siteAsset("data/config.json"));
    configPromise = fetch(configUrl, { cache: "no-store", signal: AbortSignal.timeout(10000) })
        .then(async response => {
            if (!response.ok) throw new Error(`Could not load NEXORIA configuration (HTTP ${response.status}).`);
            const data = await response.json();
            if (!data || typeof data !== "object") throw new Error("NEXORIA configuration is invalid.");
            CFG = data;
            window.NEXORIA_CONFIG = CFG;
            return CFG;
        })
        .catch(error => {
            configPromise = null;
            throw error;
        });
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
    refresh: "tk_refresh_token",
};
const ADMINISTRATOR = 0x8;
const REFRESH_PREFS_KEY = "nexoria_refresh_preferences";
const DEFAULT_REFRESH_PREFS = { statusSeconds: 1, leaderboardSeconds: 1800, serversSeconds: 30, dashboardSeconds: 30 };
function getRefreshPrefs() { try { const x=JSON.parse(localStorage.getItem(REFRESH_PREFS_KEY)||"{}"); return { statusSeconds:Math.max(.1,Number(x.statusSeconds)||1), leaderboardSeconds:Math.max(.1,Number(x.leaderboardSeconds)||1800), serversSeconds:Math.max(1,Number(x.serversSeconds)||30), dashboardSeconds:Math.max(1,Number(x.dashboardSeconds)||30) }; } catch { return {...DEFAULT_REFRESH_PREFS}; } }
function saveRefreshPrefs(p) { const x={ statusSeconds:Math.max(.1,Number(p.statusSeconds)||1), leaderboardSeconds:Math.max(1,Number(p.leaderboardSeconds)||1800), serversSeconds:Math.max(1,Number(p.serversSeconds)||30), dashboardSeconds:Math.max(1,Number(p.dashboardSeconds)||30) }; localStorage.setItem(REFRESH_PREFS_KEY,JSON.stringify(x)); return x; }
async function loadRuntimeRefreshPrefs() {
    try {
        const d = await api('/runtime-settings');
        if (d?.refresh) { saveRefreshPrefs(d.refresh); return d.refresh; }
    } catch (e) {
        // A dead Cloudflare host must never silently restore the old 5s default.
        // Keep the last locally saved preference, then fall back to the public
        // config value if this is a fresh browser.
        console.debug('[refresh] runtime settings unavailable:', e?.message || e);
    }
    const configured = CFG?.RUNTIME_REFRESH && typeof CFG.RUNTIME_REFRESH === 'object' ? CFG.RUNTIME_REFRESH : null;
    if (configured) return saveRefreshPrefs({ ...getRefreshPrefs(), ...configured });
    return getRefreshPrefs();
}
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
    "setup": `<path d="M10 2.5 12 5l3.2-.1.9 3.1 2.5 2-2.5 2 .1 3.2-3.1.9-2 2.5-2-2-3.2.1-.9-3.1-2.5-2 2.5-2-.1-3.2 3.1-.9z" fill="#8b5cf6" opacity=".22"/><path d="M10 4.2 11.7 6l2.6-.1.7 2.5 2 1.6-2 1.6.1 2.6-2.5.7-1.6 2-1.6-2-2.6.1-.7-2.5-2-1.6 2-1.6-.1-2.6 2.5-.7z" fill="none" stroke="#a78bfa" stroke-width="1.2"/><circle cx="10" cy="10" r="2.1" fill="#22d3ee"/><path d="M10 6.9v1.3M10 11.8v1.3M6.9 10h1.3M11.8 10h1.3" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>`,
    "member-automation": `<circle cx="7" cy="7" r="2.7" fill="#22d3ee"/><circle cx="14" cy="7.5" r="2.3" fill="#8b5cf6"/><path d="M2.5 16.8c.4-3.1 2.1-4.7 4.5-4.7s4.1 1.6 4.5 4.7z" fill="#22d3ee" opacity=".82"/><path d="M11 16.8c.35-2.5 1.65-3.9 3.65-3.9s3.35 1.4 3.65 3.9z" fill="#8b5cf6" opacity=".82"/><path d="M10 4.2v3.2M8.4 5.8h3.2" stroke="#fbbf24" stroke-width="1.25" stroke-linecap="round"/>`,
    "reaction-roles": `<path d="M3 4.5h14v9.7a2.3 2.3 0 0 1-2.3 2.3H5.3A2.3 2.3 0 0 1 3 14.2z" fill="#f472b6" opacity=".18" stroke="#f472b6" stroke-width="1.2"/><circle cx="7" cy="9" r="1.7" fill="#fbbf24"/><circle cx="10" cy="9" r="1.7" fill="#22d3ee"/><circle cx="13" cy="9" r="1.7" fill="#8b5cf6"/><path d="M6 13h8" stroke="#f472b6" stroke-width="1.3" stroke-linecap="round"/>`,
    "general-settings": `<rect x="3" y="4" width="14" height="12" rx="2.2" fill="#8b5cf6" opacity=".16" stroke="#8b5cf6" stroke-width="1.2"/><path d="M6 7h8M6 10h5M6 13h8" stroke="#22d3ee" stroke-width="1.3" stroke-linecap="round"/><circle cx="14" cy="10" r="1.5" fill="#f472b6"/>`,
    "audit-log": `<path d="M5 3.5h7l3 3V16a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 4 16V5A1.5 1.5 0 0 1 5.5 3.5z" fill="#8b5cf6" opacity=".16" stroke="#8b5cf6" stroke-width="1.2"/><path d="M12 3.8v3h3" fill="none" stroke="#22d3ee" stroke-width="1.2"/><path d="M7 10h5M7 13h4" stroke="#f472b6" stroke-width="1.3" stroke-linecap="round"/><circle cx="8" cy="7.4" r="1" fill="#22d3ee"/>`,
    roblox: `<path d="M4.1 3.1 16.9 6.4 13.4 17 2.8 13.8z" fill="#fff"/><path d="M8.1 7.5 12.4 8.6 11.1 12.8 6.8 11.5z" fill="#0a0b14"/>`,
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
    let name = null;
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
    if (!name) return;
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
window.DC.pageActions = null;
window.DC.registerPageActions = actions => {
    window.DC.pageActions = actions && typeof actions === "object" ? actions : null;
    if (window.DC.pageDirty && typeof window.DC.renderPageDirtyBar === "function") window.DC.renderPageDirtyBar();
};
window.DC.clearPageActions = () => { window.DC.pageActions = null; };
window.DC.renderPageDirtyBar = () => {
    const actions = window.DC.pageActions || {};
    if (!window.DC.pageDirty || (!actions.save && !actions.cancel)) return;
    const existing = document.getElementById("nex-settings-dirty-bar");
    if (existing) return;
    document.body.insertAdjacentHTML("beforeend", `<div class="nex-settings-dirty-bar" id="nex-settings-dirty-bar"><div class="nex-settings-dirty-copy"><strong>Changes detected</strong><div class="field-hint">${escapeHtml(window.DC.pageDirtyReason || "Save or cancel your changes.")}</div></div><div class="nex-settings-dirty-actions"><button type="button" class="btn btn-ghost btn-small" id="nex-settings-cancel">${icon("x",14)} Cancel</button><button type="button" class="btn btn-primary btn-small" id="nex-settings-save-bar">${icon("check",14)} Save</button></div></div>`);
    const bar = document.getElementById("nex-settings-dirty-bar");
    bar?.querySelector("#nex-settings-cancel")?.addEventListener("click", async () => {
        const fn = window.DC.pageActions?.cancel;
        try { if (typeof fn === "function") await fn(); } finally { window.DC.clearPageDirty(); }
    });
    bar?.querySelector("#nex-settings-save-bar")?.addEventListener("click", async () => {
        const btn = bar.querySelector("#nex-settings-save-bar");
        if (btn) { btn.disabled = true; btn.classList.add("is-saving"); btn.innerHTML = `${icon("loader",14)} Saving…`; }
        try { await window.DC.pageActions?.save?.(); } catch (e) { if (typeof showNexoriaError === "function") showNexoriaError(e, "Save changes"); }
        finally { if (btn && bar.isConnected) { btn.disabled = false; btn.classList.remove("is-saving"); btn.innerHTML = `${icon("check",14)} Save`; } }
    });
};
window.DC.markPageDirty = reason => { window.DC.pageDirty=true; window.DC.pageDirtyReason=reason||"Unsaved changes"; window.DC.renderPageDirtyBar?.(); };
window.DC.clearPageDirty = () => {
    window.DC.pageDirty=false; window.DC.pageDirtyReason="Unsaved changes";
    document.querySelectorAll("#nex-settings-dirty-bar,#setup-savebar,#verification-savebar").forEach(el=>{
        if(el.classList.contains("nex-settings-dirty-bar")){el.classList.add("leaving");setTimeout(()=>el.remove(),260);}else el.remove();
    });
};
// Broken CDN avatar URLs should never leave empty/broken profile images across the
// dashboard. One delegated handler covers Discord, Roblox and historical snapshots.
const NEXORIA_AVATAR_FALLBACK = "https://cdn.discordapp.com/embed/avatars/0.png";
document.addEventListener("error", event => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || img.dataset.nexoriaAvatarFailed === "1") return;
    const src = String(img.getAttribute("src") || "");
    if (!src || (!/discordapp\.com\/avatars|roblox\.com|tr\.rbxcdn\.com|avatar/i.test(src) && !/avatar|profile/i.test(String(img.className || "")))) return;
    img.dataset.nexoriaAvatarFailed = "1";
    img.src = NEXORIA_AVATAR_FALLBACK;
}, true);
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
        if (parts[0] === "status")
            return { screen: "picker", panel: "status" };
        if (parts[0] === "docs")
            return { screen: "picker", panel: "docs", docsModuleId: parts[1] || null };
        if (parts[0] === "terms" || parts[0] === "terms-of-service") return { screen: "policy", policy: "terms" };
        if (parts[0] === "privacy" || parts[0] === "privacy-policy") return { screen: "policy", policy: "privacy" };
        if (parts[0] === "verify") {
            const q = new URLSearchParams(window.location.search);
            return { screen: "verify", guildId: parts[1] || q.get("guildId") || "", share: q.get("share") === "1", start: q.get("start") === "1", privacy: q.get("privacy") === "1" };
        }
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
        let normalized = String(url || "").startsWith("/") ? String(url) : `/${String(url || "")}`;
        // Never let an already-prefixed project path become /NEXORIA/NEXORIA/... .
        const basePrefix = `${base}/`;
        if (normalized === base || normalized.startsWith(basePrefix)) normalized = normalized.slice(base.length) || "/";
        if (!normalized.startsWith("/")) normalized = `/${normalized}`;
        const full = `${base}${normalized}`;
        if (!force && window.DC.pageDirty) { confirmDirtyNavigation(full,replace); return false; }
        // Remember where the user opened Terms/Privacy from so the legal
        // screen's Back button returns to that exact dashboard/picker page.
        if (/^\/(?:terms(?:-of-service)?|privacy(?:-policy)?)(?:\/)?$/i.test(normalized)) {
            const current = window.location.pathname + window.location.search + window.location.hash;
            if (!/(?:^|\/)(?:terms(?:-of-service)?|privacy(?:-policy)?)(?:\/)?$/i.test(current.replace(getSiteBasePath().replace(/\/+$/, ""), ""))) {
                try { sessionStorage.setItem("nexoria_policy_return_url", current); } catch {}
            }
        }
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
// Global NEXORIA error surface. Console errors remain available for debugging,
// but users also get a compact bottom-right diagnostic instead of a silent failure.
let nexoriaErrorToastTimer = null;
function showNexoriaError(error, context = "") {
    const message = String(error?.message || error || "Unknown error").trim();
    if (!message) return;
    const errorType = String(error?.name || "Error").trim();
    const display = context ? `${context}: ${errorType} — ${message}` : `${errorType} — ${message}`;
    let stack = document.getElementById("nexoria-error-stack");
    if (!stack) { stack = document.createElement("div"); stack.id = "nexoria-error-stack"; document.body.appendChild(stack); }
    const toast = document.createElement("div");
    toast.className = "nexoria-error-toast";
    toast.innerHTML = `<span class="nexoria-error-mark">!</span><div class="nexoria-error-copy"><strong>${escapeHtml(context || "NEXORIA error")}</strong><span>${escapeHtml(display)}</span></div><button type="button" class="nexoria-error-close" aria-label="Dismiss">×</button>`;
    toast.querySelector(".nexoria-error-close")?.addEventListener("click", () => toast.remove());
    stack.appendChild(toast);
    while (stack.children.length > 4) stack.firstElementChild?.remove();
    clearTimeout(nexoriaErrorToastTimer);
    nexoriaErrorToastTimer = setTimeout(() => { [...stack.children].slice(0, -1).forEach(x => x.remove()); }, 12000);
}
window.addEventListener("error", e => {
    if (e?.error || e?.message) showNexoriaError(e.error || e.message, "Client error");
});
window.addEventListener("unhandledrejection", e => {
    const reason = e?.reason;
    const message = String(reason?.message || reason || "").trim();
    if (!message) return;
    showNexoriaError(reason, "Unexpected client error");
});
function enhanceCustomSelects(scope = document) {
    // The shared module dropdown already provides the single visual control for
    // native <select> elements. Do not create a second dropdown layer here.
    if (window.DC?.enhanceNativeSelects) { window.DC.enhanceNativeSelects(scope); return; }
    const selects = [...(scope?.querySelectorAll ? scope.querySelectorAll("select:not([data-nex-custom])") : [])];
    for (const select of selects) {
        const wrap = document.createElement("div");
        wrap.className = "nex-custom-select";
        const parent = select.parentNode;
        if (!parent) continue;
        parent.insertBefore(wrap, select);
        wrap.appendChild(select);
        select.dataset.nexCustom = "1";
        select.classList.add("nex-native-select");
        const isMulti = !!select.multiple;
        const trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = "nex-select-trigger";
        trigger.disabled = select.disabled;
        trigger.innerHTML = `<span class="nex-select-value"></span>${icon("chevron-down",14)}`;
        trigger.querySelector("svg")?.classList.add("nex-select-chevron");
        const menu = document.createElement("div");
        menu.className = "nex-select-menu";
        const search = document.createElement("input");
        search.type = "search";
        search.className = "nex-select-search";
        search.placeholder = "Search…";
        search.autocomplete = "off";
        search.setAttribute("aria-label", "Search options");
        const list = document.createElement("div");
        list.className = "nex-select-list";
        menu.append(search, list);
        document.body.appendChild(menu);
        wrap.appendChild(trigger);
        function syncOptions(filter = search.value || "") {
            const q = String(filter || "").trim().toLowerCase();
            const enabledOptions=[...select.options].filter(o=>!o.disabled);
            const single=enabledOptions.length===1 && !isMulti;
            wrap.classList.toggle("nex-single-option",single);
            trigger.disabled=select.disabled || single;
            if(single && select.value!==enabledOptions[0].value){ select.value=enabledOptions[0].value; select.dispatchEvent(new Event("change",{bubbles:true})); }
            const options = [...select.options];
            const filtered = q ? options.filter(o => String(o.textContent || "").toLowerCase().includes(q)) : options;
            list.innerHTML = filtered.length ? filtered.map((o) => {
                const color = String(o.dataset.color || "").trim();
                const dotStyle = color && /^#[0-9a-f]{6}$/i.test(color) ? `style="background:${escapeHtml(color)}"` : "";
                return `<button type="button" class="nex-select-option ${o.selected ? "selected" : ""}" data-value="${escapeHtml(o.value)}" ${o.disabled ? "disabled" : ""}><span class="nex-option-dot" ${dotStyle}></span><span class="nex-option-label">${escapeHtml(o.textContent || "")}</span></button>`;
            }).join("") : `<div class="nex-select-empty">No matches</div>`;
            const selectedOptions = [...select.options].filter(o => o.selected);
            const value = trigger.querySelector(".nex-select-value");
            if (value) {
                if (isMulti) value.textContent = selectedOptions.length ? `${selectedOptions.length} selected` : "Select…";
                else {
                    const selected = select.options[select.selectedIndex];
                    const color = String(selected?.dataset?.color || "").trim();
                    const dot = color && /^#[0-9a-f]{6}$/i.test(color) ? `<span class="nex-trigger-role-dot" style="background:${escapeHtml(color)}"></span>` : "";
                    value.innerHTML = `${dot}${escapeHtml(selected?.textContent || "Select…")}`;
                }
            }
            list.querySelectorAll(".nex-select-option").forEach(btn => btn.addEventListener("click", e => {
                e.preventDefault(); e.stopPropagation();
                const option = [...select.options].find(o => String(o.value) === String(btn.dataset.value || ""));
                if (!option) return;
                if (isMulti) {
                    option.selected = !option.selected;
                    select.dispatchEvent(new Event("change", { bubbles:true }));
                    syncOptions(search.value);
                    return;
                }
                select.value = btn.dataset.value || "";
                select.dispatchEvent(new Event("change", { bubbles:true }));
                search.value = "";
                syncOptions("");
                close();
            }));
        }
        function position() {
            const r = trigger.getBoundingClientRect();
            const availableWidth = Math.max(220, window.innerWidth - 16);
            const width = Math.min(Math.max(r.width, 300), Math.min(520, availableWidth));
            const spaceBelow = Math.max(0, window.innerHeight - r.bottom - 8);
            const spaceAbove = Math.max(0, r.top - 8);
            const desired = Math.min(520, Math.max(320, 48 + Math.min(10, select.options.length || 0) * 40));
            const openUp = desired > spaceBelow && spaceAbove > spaceBelow;
            const height = openUp ? Math.min(desired, Math.max(180, spaceAbove)) : Math.min(desired, Math.max(180, spaceBelow));
            menu.style.width = `${Math.min(width, availableWidth)}px`;
            menu.style.maxHeight = `${Math.max(180, height)}px`;
            menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - width - 8))}px`;
            if (openUp) { menu.style.top = "auto"; menu.style.bottom = `${Math.max(8, window.innerHeight - r.top + 6)}px`; }
            else { menu.style.bottom = "auto"; menu.style.top = `${Math.min(window.innerHeight - height - 8, r.bottom + 6)}px`; }
        }
        function close() { wrap.classList.remove("open"); menu.style.display = "none"; search.value = ""; syncOptions(""); }
        trigger.addEventListener("click", e => {
            e.preventDefault(); e.stopPropagation();
            if (select.disabled || wrap.classList.contains("nex-single-option")) return;
            const open = !wrap.classList.contains("open");
            document.querySelectorAll(".nex-custom-select.open").forEach(x => x.classList.remove("open"));
            document.querySelectorAll(".nex-select-menu").forEach(x => x.style.display = "none");
            if (open) { wrap.classList.add("open"); menu.style.display = "flex"; search.value = ""; syncOptions(""); position(); setTimeout(() => search.focus(), 0); }
        });
        search.addEventListener("input", () => { syncOptions(search.value); position(); });
        search.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
        select.addEventListener("change", () => syncOptions(search.value));
        const observer = new MutationObserver(() => { trigger.disabled = select.disabled; syncOptions(search.value); });
        observer.observe(select, { childList:true, subtree:true, attributes:true, attributeFilter:["disabled"] });
        window.addEventListener("resize", () => { if (wrap.classList.contains("open")) position(); });
        window.addEventListener("scroll", () => { if (wrap.classList.contains("open")) position(); }, true);
        document.addEventListener("click", e => { if (!wrap.contains(e.target) && !menu.contains(e.target)) close(); });
        syncOptions("");
    }
}
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
async function beginLogin({ silent = false, redirectPath = null, userInitiated = false } = {}) {
    if (silent && !userInitiated && localStorage.getItem("nexoria_explicit_logout") === "1") throw new Error("You are signed out. Start Discord login manually to continue.");
    if (!CFG.DISCORD_CLIENT_ID) {
        throw new Error("Discord login is not configured yet. Set DISCORD_CLIENT_ID in config.env and run the tunnel script again so the public site config is updated.");
    }
    const { verifier, challenge } = await makeVerifierAndChallenge();
    // Every login attempt gets a fresh PKCE verifier/state and therefore a fresh one-time Discord authorization code.
    sessionStorage.removeItem(LS.verifier);
    sessionStorage.removeItem("nexoria_discord_oauth_state");
    sessionStorage.setItem(LS.verifier, verifier);
    sessionStorage.setItem("tk_silent_login", silent ? "1" : "0");
    // A login started from the public landing page must continue into the dashboard,
    // not return to the landing page after Discord redirects back. Preserve a deep
    // link only when the user actually started from a protected application route.
    const currentRoute = routes.parse();
    const isLanding = currentRoute.screen === "landing";
    const requestedRedirect = String(redirectPath || (isLanding ? "/dashboard" : `${window.location.pathname}${window.location.search}${window.location.hash}`) || "/dashboard");
    sessionStorage.setItem("tk_post_login_redirect", requestedRedirect);
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
        // Logged-in users can reuse the Discord session silently. A logged-out
        // browser must always get a real account-selection/login step so an old
        // Discord session cannot make NEXORIA appear verified automatically.
        prompt: silent && getSession() ? "none" : "select_account",
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
const DEVICE_ID_KEY = "nexoria_device_identity_v1";
function getDeviceIdentityToken() {
    let token = localStorage.getItem(DEVICE_ID_KEY);
    if (!token || !/^[A-Za-z0-9_-]{40,256}$/.test(token)) {
        const bytes = new Uint8Array(48);
        crypto.getRandomValues(bytes);
        token = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
        localStorage.setItem(DEVICE_ID_KEY, token);
    }
    return token;
}
function saveSession(tokenData, user) {
    localStorage.removeItem("nexoria_explicit_logout");
    localStorage.setItem(LS.token, tokenData.access_token);
    localStorage.setItem(LS.tokenExpiry, String(Date.now() + Number(tokenData.expires_in || 604800) * 1000));
    if (tokenData.refresh_token) localStorage.setItem(LS.refresh, tokenData.refresh_token);
    localStorage.setItem(LS.user, JSON.stringify(user));
}
async function registerAuthenticatedUser(accessToken) {
    if (!accessToken) return null;
    try {
        const response = await fetch(`${CFG.LOCAL_BOT_URL}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ deviceToken: getDeviceIdentityToken() }),
            signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) return null;
        return await response.json().catch(() => null);
    } catch (e) {
        console.debug("[auth] Local authentication registration unavailable:", e?.message || e);
        return null;
    }
}

function getSession() {
    const token = localStorage.getItem(LS.token);
    const expiry = Number(localStorage.getItem(LS.tokenExpiry) || 0);
    if (!token || Date.now() > expiry) return null;
    let user = null;
    try { user = JSON.parse(localStorage.getItem(LS.user) || "null"); } catch { localStorage.removeItem(LS.user); return null; }
    if (!user?.id) return null;
    return { token, user };
}
// Browser safety: ordinary users cannot open the native context menu or DevTools.
// Trusted NEXORIA admins/bot owner are explicitly allowed through the same server-side
// eligibility check used by the admin panel. The Advanced Builder keeps its own custom
// right-click menu; the browser menu is still blocked there.
let __nexoriaDevToolsAllowed = false;
let __nexoriaDevToolsChecked = false;
async function refreshDevToolsEligibility(){
    if(__nexoriaDevToolsChecked) return __nexoriaDevToolsAllowed;
    __nexoriaDevToolsChecked=true;
    try{
        const session=getSession();
        if(!session?.user?.id){__nexoriaDevToolsAllowed=false;return false;}
        const d=await api(`/admin/eligibility?discordUserId=${encodeURIComponent(session.user.id)}`);
        __nexoriaDevToolsAllowed=Boolean(d?.eligible);
    }catch{__nexoriaDevToolsAllowed=false;}
    return __nexoriaDevToolsAllowed;
}
void refreshDevToolsEligibility();
window.addEventListener("nexoria-session-changed",()=>{__nexoriaDevToolsChecked=false;void refreshDevToolsEligibility();});
document.addEventListener("contextmenu",e=>{
    if(__nexoriaDevToolsAllowed || !__nexoriaDevToolsChecked) return;
    if(e.target?.closest?.(".cc-vs-workspace")) return;
    e.preventDefault(); e.stopPropagation();
},true);
document.addEventListener("keydown",e=>{
    // Never block a trusted admin/owner while the async eligibility request is still pending.
    // Browser DevTools cannot be securely controlled by a webpage; this only provides the
    // requested convenience restriction for ordinary dashboard users after eligibility is known.
    if(__nexoriaDevToolsAllowed || !__nexoriaDevToolsChecked) return;
    const k=String(e.key||"").toLowerCase();
    if(k==="f12" || (e.ctrlKey&&e.shiftKey&&["i","j","c"].includes(k)) || (e.ctrlKey&&k==="u")){e.preventDefault();e.stopPropagation();}
},true);
window.addEventListener("focus",()=>{ if(!__nexoriaDevToolsAllowed) { __nexoriaDevToolsChecked=false; void refreshDevToolsEligibility(); } });

function wireGlobalSettingDirty(root){
    if(!root || root.dataset.nexGlobalDirtyReady==="1") return;
    root.dataset.nexGlobalDirtyReady="1";
    const shouldTrack=el=>{
        if(!el || !el.closest?.(".config-section")) return false;
        if(el.closest(".dc-modal,.cc-vs-editor,.cc-category-group")) return false;
        if(el.matches("input[type=search],input[type=file],button[data-no-dirty]")) return false;
        if(el.id && /search|filter|query/i.test(el.id)) return false;
        if(el.id === "nh-stats-period") return false;
        return el.matches("select,textarea,input:not([type=button]):not([type=submit]):not([type=hidden]),.toggle,[role=switch]");
    };
    root.addEventListener("change",e=>{ if(shouldTrack(e.target) && window.DC?.pageActions) window.DC.markPageDirty?.("Unsaved changes"); },true);
    root.addEventListener("input",e=>{ if(shouldTrack(e.target) && window.DC?.pageActions) window.DC.markPageDirty?.("Unsaved changes"); },true);
    root.addEventListener("click",e=>{ const el=e.target?.closest?.(".toggle,[role=switch]"); if(el && shouldTrack(el) && window.DC?.pageActions) window.DC.markPageDirty?.("Unsaved changes"); },true);
}

function clearSession(options = {}) {
    [LS.token, LS.tokenExpiry, LS.refresh, LS.user].forEach(k => localStorage.removeItem(k));
    if (options.explicit !== false) { localStorage.setItem("nexoria_explicit_logout", "1"); localStorage.setItem("nexoria_logged_out_at", String(Date.now())); }
}
async function refreshStoredSession() {
    const refreshToken = localStorage.getItem(LS.refresh);
    if (!refreshToken) return null;
    const expiry = Number(localStorage.getItem(LS.tokenExpiry) || 0);
    if (localStorage.getItem(LS.token) && Date.now() < expiry - 120000) return getSession();
    try {
        const response = await fetch(`${CFG.LOCAL_BOT_URL}/oauth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: refreshToken }) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.access_token) throw new Error(data.error || "Refresh failed");
        const user = await fetchMe(data.access_token);
        saveSession(data, user);
        void registerAuthenticatedUser(data.access_token);
        return getSession();
    } catch (e) {
        clearSession({ explicit: false });
        return null;
    }
}
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

let accessibleBotGuildCache = null;
let accessibleBotGuildCacheAt = 0;
async function fetchAccessibleBotGuilds() {
    const now = Date.now();
    if (accessibleBotGuildCache && now - accessibleBotGuildCacheAt < 15000) return accessibleBotGuildCache;
    try {
        const data = await api("/guilds/accessible");
        accessibleBotGuildCache = Array.isArray(data?.servers) ? data.servers : [];
        accessibleBotGuildCacheAt = now;
    } catch {
        accessibleBotGuildCache = accessibleBotGuildCache || [];
    }
    return accessibleBotGuildCache;
}
function mergeAccessibleGuilds(guilds, accessible) {
    // The Discord OAuth guild list is the source of truth for membership.
    // /guilds/accessible may contain extra server metadata, but it must never
    // make a server appear when the logged-in user is not actually a member.
    const access = new Map((accessible || []).map(g => [String(g.id), g]));
    return (guilds || []).map(g => {
        const extra = access.get(String(g.id));
        return extra
            ? { ...g, ...extra, viewerRole: extra.viewerRole || g.viewerRole || null }
            : { ...g, viewerRole: g.viewerRole || null };
    });
}
function viewerGuildRank(g) {
    const role = String(g?.viewerRole || "").toLowerCase();
    if (role === "owner") return 1000000000;
    if (role === "co-owner") return 900000000;
    const explicit = Number(g?.viewerHighestRolePosition);
    if (Number.isFinite(explicit)) return explicit;
    if (role === "admin" || role === "trusted-admin" || role === "bot-owner") return 800000000;
    return 0;
}
function sortViewerGuilds(a, b) {
    const rankDiff = viewerGuildRank(b) - viewerGuildRank(a);
    if (rankDiff) return rankDiff;
    const membersDiff = (Number(b?.memberCount) || 0) - (Number(a?.memberCount) || 0);
    if (membersDiff) return membersDiff;
    return String(a?.name || "").localeCompare(String(b?.name || ""));
}

// ============================================================
// Shared sidebar/theme helpers
// ============================================================
const systemThemeQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
function resolveSystemTheme() { return systemThemeQuery && systemThemeQuery.matches ? "light" : "dark"; }
function applyTheme(theme) {
    const pref = ["light", "dark", "system"].includes(theme) ? theme : "system";
    const resolved = pref === "system" ? resolveSystemTheme() : pref;
    document.body.setAttribute("data-theme", resolved);
    localStorage.setItem(LS.theme, pref);
}
function getThemePreference() { return localStorage.getItem(LS.theme) || "system"; }
if (systemThemeQuery) {
    systemThemeQuery.addEventListener("change", () => { if (getThemePreference() === "system") applyTheme("system"); });
}
let adminEligibilityCache = null;
let adminEligibilityRequest = null;
async function maybeShowAdminPanelButton(slot) {
    const btn = slot?.querySelector?.(".sb-admin-panel-btn");
    if (!btn) return;
    const session = getSession();
    if (!session?.user?.id) { btn.style.display = "none"; return; }
    if (adminEligibilityCache === null && !adminEligibilityRequest) {
        adminEligibilityRequest = api(`/admin/eligibility?discordUserId=${encodeURIComponent(session.user.id)}`)
            .then(result => { adminEligibilityCache = Boolean(result?.eligible); return adminEligibilityCache; })
            .catch(error => {
                // A temporary bridge failure must not permanently hide the button.
                console.warn("[admin] eligibility check failed; will retry", error);
                return false;
            })
            .finally(() => { adminEligibilityRequest = null; });
    }
    if (adminEligibilityRequest) await adminEligibilityRequest;
    btn.style.display = adminEligibilityCache ? "flex" : "none";
}
function quickNavMarkup(prefix = "quick-nav") {
    return `<div class="quick-nav-anchor dropdown-anchor">
      <button type="button" class="quick-nav-trigger icon-btn" id="${prefix}-trigger" aria-label="Quick navigation" title="Quick navigation">${icon("menu",18)}</button>
      <div class="quick-nav-panel dropdown-panel-floating" id="${prefix}-panel" style="display:none">
        <div class="dropdown-panel-title">Quick navigation</div>
        <button type="button" class="quick-nav-item" data-quick-route="/">${icon("home",16)}<span>Main Menu</span></button>
        <button type="button" class="quick-nav-item" data-quick-route="/my-tickets">${icon("tickets",16)}<span>My Tickets</span></button>
        <button type="button" class="quick-nav-item" data-quick-route="/premium">${icon("premium",16)}<span>Premium</span></button>
        <button type="button" class="quick-nav-item" data-quick-panel="docs">${icon("document",16)}<span>Documentation</span></button>
        <button type="button" class="quick-nav-item" data-quick-panel="leaderboards">${icon("trophy",16)}<span>Leaderboards</span></button>
        <button type="button" class="quick-nav-item" data-quick-panel="status">${icon("status",16)}<span>Status</span></button>
        <button type="button" class="quick-nav-item" data-quick-route="/profile/?settings=profile">${icon("profile",16)}<span>User Settings</span></button>
      </div>
    </div>`;
}
function navigateUtilityPanel(panel) {
    // Status is a global page, not a server module. Always use the dedicated
    // /status route so the sidebar button works from both the server dashboard
    // and the server picker, even when no server is currently selected.
    if (panel === "status") {
        pickerActivePanel = "status";
        routes.go("/status", false, true);
        void enterPicker("status");
        return;
    }
    const inDashboard = !!(currentGuild?.id && document.getElementById("screen-dashboard")?.classList.contains("active"));
    if (inDashboard) {
        currentPanelId = panel;
        currentTab = null;
        // Utility navigation must not be blocked by a dirty module form.
        if (routes.go(routes.moduleUrl(currentGuild.id, panel)) === false) return;
        void enterDashboard(panel, { tab: null });
        return;
    }
    pickerActivePanel = panel;
    const route = panel === "leaderboards" ? "/leaderboards/" : `/${panel}`;
    routes.go(route, false, true);
    void enterPicker(panel);
}
function wireQuickNav(prefix) {
    const trigger=document.getElementById(`${prefix}-trigger`), panel=document.getElementById(`${prefix}-panel`);
    if(!trigger || !panel || trigger.dataset.wired === "1") return;
    trigger.dataset.wired="1";
    trigger.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); panel.style.display = panel.style.display === "none" ? "block" : "none"; });
    panel.querySelectorAll("[data-quick-route], [data-quick-panel]").forEach(btn => btn.addEventListener("click", e => {
        e.preventDefault();
        panel.style.display="none";
        const utilityPanel = btn.dataset.quickPanel;
        if (utilityPanel) { navigateUtilityPanel(utilityPanel); return; }
        const route=btn.dataset.quickRoute || "/";
        if(route === "/") { routes.go("/", true, true); void renderFromRoute(); return; }
        routes.go(route);
        void renderFromRoute();
    }));
    document.addEventListener("click", e => { if(!panel.contains(e.target) && !trigger.contains(e.target)) panel.style.display="none"; });
}

function renderSidebarBottom(slotId) {
    const slot = document.getElementById(slotId);
    if (!slot) return;
    const session = getSession();
    if (!session?.user) {
        slot.innerHTML = "";
        return;
    }
    const supportUrl = String(CFG?.DISCORD_SUPPORT_URL || CFG?.DISCORD_SERVER_LINK || "").trim();
    const theme = getThemePreference();
    const themeOptions = [
        { id: "light", label: "Light", icon: "theme-light" },
        { id: "dark", label: "Dark", icon: "theme-dark" },
        { id: "system", label: "System", icon: "theme-system" },
    ];
    const current = themeOptions.find(x => x.id === theme) || themeOptions[2];
    slot.innerHTML = `
      <div class="sidebar-bottom">
        <button type="button" class="nav-item sb-back-main-link">${icon("arrow-left")}<span>Back to Main Menu</span></button>
        <button type="button" class="nav-item sb-docs-link">${icon("document")}<span>Documentation</span></button>
        ${supportUrl ? `<a href="${escapeHtml(supportUrl)}" target="_blank" rel="noopener noreferrer" class="nav-item sb-discord-link">${icon("discord")}<span>Support Server</span></a>` : ""}
        <div class="sidebar-profile-anchor">
          <div class="sidebar-profile sb-profile-trigger">
            <img class="sidebar-profile-avatar" src="${escapeHtml(avatarUrl(session.user))}" alt="">
            <div class="sidebar-profile-name">${escapeHtml(session.user.username || "Discord user")}</div>
            <span style="margin-left:auto">${icon("chevron-up",14)}</span>
          </div>
          <div class="sidebar-profile-menu sb-profile-menu" style="display:none">
          <div class="sidebar-profile-menu-header">
            <img class="sidebar-profile-avatar" src="${escapeHtml(avatarUrl(session.user))}" alt="">
            <div><div class="sidebar-profile-name">${escapeHtml(session.user.username || "Discord user")}</div><div class="field-hint" style="margin-top:1px">@${escapeHtml(session.user.username || "")}</div></div>
          </div>
          <button type="button" class="kebab-menu-item sb-profile-btn">${icon("user-profile")} User Settings</button>
          <button type="button" class="kebab-menu-item sb-admin-panel-btn" style="display:none">${icon("admin")} Admin Panel</button>
            <button type="button" class="kebab-menu-item danger sb-logout-btn">${icon("logout")} Log out</button>
          </div>
        </div>
      </div>`;

    void maybeShowAdminPanelButton(slot);

    const leaderboardsLink = slot.querySelector(".sb-leaderboards-link");
    const docsLink = slot.querySelector(".sb-docs-link");
    const backMain = slot.querySelector(".sb-back-main-link");
    const menu = slot.querySelector(".sb-profile-menu");
    const trigger = slot.querySelector(".sb-profile-trigger");
    const profileBtn = slot.querySelector(".sb-profile-btn");
    const logoutBtn = slot.querySelector(".sb-logout-btn");
    const adminPanelBtn = slot.querySelector(".sb-admin-panel-btn");

    backMain?.addEventListener("click", e => { e.preventDefault(); routes.go("/", true, true); void renderFromRoute(); });
    docsLink?.addEventListener("click", e => {
        e.preventDefault();
        if (currentGuild?.id && document.getElementById("screen-dashboard")?.classList.contains("active")) {
            currentPanelId = "docs"; currentTab = null;
            if (routes.go(routes.moduleUrl(currentGuild.id, "docs")) === false) return;
            void enterDashboard("docs");
        } else {
            pickerActivePanel = "docs";
            routes.go("/docs");
            void enterPicker("docs");
        }
    });
    leaderboardsLink?.addEventListener("click", e => {
        e.preventDefault();
        if (menu) menu.style.display = "none";
        navigateUtilityPanel("leaderboards");
    });
    document.addEventListener("click", e => {
        if (menu && trigger && !menu.contains(e.target) && !trigger.contains(e.target)) menu.style.display = "none";
    });
    trigger?.addEventListener("click", e => {
        e.stopPropagation();
        if (!menu) return;
        menu.style.display = menu.style.display === "none" ? "block" : "none";
    });
    logoutBtn?.addEventListener("click", () => { clearSession(); ["tk_post_login_redirect","tk_redirect_path","tk_silent_login","nexoria_discord_oauth_state"].forEach(k=>sessionStorage.removeItem(k)); routes.go("/", true, true); showScreen("screen-landing"); });
    profileBtn?.addEventListener("click", e => {
        e.preventDefault();
        if (menu) menu.style.display = "none";
        pickerActivePanel = "profile";
        routes.go("/profile/");
        void enterPicker("profile");
    });
    adminPanelBtn?.addEventListener("click", () => {
        if (menu) menu.style.display = "none";
        pickerActivePanel = "admin";
        routes.go("/admin");
        void enterPicker("admin");
    });
}
function initials(name) {
    const value = String(name || "?").trim();
    if (!value) return "?";
    return value.split(/\s+/).slice(0, 2).map(x => x[0]).join("").slice(0, 2).toUpperCase();
}
function guildIconUrl(guild, size = 128) {
    if (guild?.iconUrl) return String(guild.iconUrl);
    if (guild?.guildIconUrl) return String(guild.guildIconUrl);
    if (guild?.iconURL) return String(guild.iconURL);
    if (!guild?.id || !guild?.icon) return "";
    const id = encodeURIComponent(String(guild.id));
    const hashRaw = String(guild.icon).trim();
    const hash = encodeURIComponent(hashRaw);
    const format = hashRaw.startsWith("a_") ? "gif" : "webp";
    const px = Math.max(32, Math.min(4096, Number(size) || 128));
    // media.discordapp.net is Discord's image proxy and is generally more
    // tolerant of browser/CDN caching than the raw CDN host.
    return `https://media.discordapp.net/icons/${id}/${hash}.${format}?size=${px}&quality=lossless`;
}
function initialsFallback(name) {
    const text = String(name || "Server").trim();
    if (!text) return "SV";
    const parts = text.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    const compact = text.replace(/[^A-Za-z0-9]/g, "");
    return (compact.slice(0, 2) || "SV").toUpperCase();
}

function guildInitials(name) {
  const text = String(name || "Server").trim();
  if (!text) return "SV";
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const compact = text.replace(/[^A-Za-z0-9]/g, "");
  return (compact.slice(0, 2) || "SV").toUpperCase();
}

function guildIconHtml(guild, className = "server-icon", size = 128) {
    const safeClass = escapeHtml(className);
    const fallbackClass = safeClass.endsWith("-image") ? safeClass.slice(0, -6) : safeClass;
    // Servers without an icon show the server initials instead of a generic icon.
    // Example: "bot test" -> "BT".
    const initials = (typeof guildInitials === "function" ? guildInitials(guild?.name || "Server") : initialsFallback(guild?.name || "Server"));
    const url = guildIconUrl(guild, size);
    const fallbackHtml = `<span class="${fallbackClass}-fallback nexoria-guild-emoji-fallback" aria-label="Server has no icon"><span class="nexoria-guild-initials" aria-hidden="true">${escapeHtml(initials)}</span></span>`;
    if (!url) return fallbackHtml;
    const id = encodeURIComponent(String(guild?.id || ""));
    const hashRaw = String(guild?.icon || "").trim();
    const format = hashRaw.startsWith("a_") ? "gif" : "webp";
    const px = Math.max(32, Math.min(4096, Number(size) || 128));
    const backup = hashRaw ? `https://cdn.discordapp.com/icons/${id}/${encodeURIComponent(hashRaw)}.${format}?size=${px}` : "";
    // Keep fallback data as plain text.  The old implementation stored encoded
    // HTML in a data attribute; malformed/legacy cached markup could leak pieces
    // like `DC">` into the server name.  Plain text cannot break the img tag.
    return `<img class="${safeClass}" src="${escapeHtml(url)}" data-icon-fallback="${escapeHtml(backup)}" data-icon-fallback-text="${escapeHtml((typeof guildInitials === "function" ? guildInitials(guild?.name || "Server") : initialsFallback(guild?.name || "Server")))}" data-icon-fallback-class="${escapeHtml(fallbackClass)}" alt="" loading="lazy" decoding="async" onerror="nexoriaGuildIconError(this)">`;
}
window.nexoriaGuildIconError = function(img) {
    if (!img || img.dataset.iconFailed === "1") return;
    if (img.dataset.iconFallback) {
        const u = img.dataset.iconFallback;
        img.dataset.iconFallback = "";
        img.src = u;
        return;
    }
    img.dataset.iconFailed = "1";
    const cls = escapeHtml(img.dataset.iconFallbackClass || "server-icon");
    const initials = escapeHtml(img.dataset.iconFallbackText || "?");
    img.outerHTML = `<span class="${cls}-fallback nexoria-guild-emoji-fallback" aria-hidden="true"><span class="nexoria-guild-initials">${initials}</span></span>`;
};
window.nexoriaEmailAvatarError = function(img) {
    if (!img) return;
    const sources = String(img.dataset.avatarSources || "").split("|").map(x => x.trim()).filter(Boolean);
    const index = Number(img.dataset.avatarSourceIndex || 0);
    if (index < sources.length) {
        img.dataset.avatarSourceIndex = String(index + 1);
        img.src = sources[index];
        return;
    }
    const email = String(img.dataset.emailAvatar || "").trim();
    img.onerror = null;
    if (email) {
        img.src = emailAvatarFallbackDataUrl(email);
        img.dataset.emailFallback = "1";
    } else {
        img.removeAttribute("src");
        img.style.opacity = ".35";
    }
};
function emailAvatarFallbackDataUrl(email) {
    const value = String(email || "").trim().toLowerCase();
    let hash = 2166136261;
    for (const ch of value) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
    const hue = hash % 360;
    const local = (value.split("@")[0] || "?").replace(/[^a-z0-9]+/gi, " ").trim();
    const initials = (local.split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]).join("") || local.slice(0,2) || "@").toUpperCase().replace(/[&<>"']/g, "");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 72% 58%)"/><stop offset="1" stop-color="hsl(${(hue+55)%360} 72% 42%)"/></linearGradient></defs><rect width="96" height="96" rx="24" fill="url(#g)"/><text x="48" y="57" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" font-weight="800" fill="white">${initials}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
function avatarUrl(user) {
    if (user?.avatarUrl) return String(user.avatarUrl);
    const id = encodeURIComponent(String(user?.id || "0"));
    const hash = String(user?.avatar || "").trim();
    if (hash) {
        const ext = hash.startsWith("a_") ? "gif" : "webp";
        return `https://cdn.discordapp.com/avatars/${id}/${encodeURIComponent(hash)}.${ext}?size=128`;
    }
    const disc = String(user?.discriminator || "0");
    const index = /^\d+$/.test(disc) ? Number(disc) % 5 : 0;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}
function inviteUrl(guildId) {
    const clientId = String(CFG?.DISCORD_CLIENT_ID || "").trim();
    if (!clientId) return "#";
    const params = new URLSearchParams({ client_id: clientId, permissions: String(CFG?.BOT_PERMISSIONS || "8"), scope: "bot applications.commands" });
    if (guildId) params.set("guild_id", String(guildId));
    return `https://discord.com/oauth2/authorize?${params.toString()}`;
}
function loadingBlock(message = "Loading…") {
    return `<div class="loading-wrap"><div class="spinner"></div><div>${escapeHtml(message)}</div></div>`;
}
function serverLoadingMarkup(stage = "grabbing", compact = false) {
    const validating = stage === "validating";
    const grabbingClass = validating ? "done" : "active";
    const validatingClass = validating ? "active" : "pending";
    return `<div class="server-loading-scene ${compact ? "compact" : ""}" data-server-loading-stage="${stage}">
      <div class="nexoria-signal-art" aria-hidden="true">
        <span class="nexoria-signal-ring ring-a"></span>
        <span class="nexoria-signal-ring ring-b"></span>
        <span class="nexoria-signal-ring ring-c"></span>
        <span class="nexoria-signal-core"><i></i></span>
        <span class="nexoria-signal-scan"></span>
        <span class="nexoria-signal-particle p-a"></span><span class="nexoria-signal-particle p-b"></span><span class="nexoria-signal-particle p-c"></span>
      </div>
      <div class="server-loading-copy"><strong>${validating ? "VERIFYING YOUR SERVERS" : "CONNECTING TO DISCORD"}</strong><span>${validating ? "Checking access and preparing your server list" : "Securely retrieving the servers available to you"}</span></div>
      <div class="server-loading-steps">
        <div class="server-loading-step ${grabbingClass}"><span class="step-icon">${validating ? "✓" : "•"}</span><strong>GRABBING SERVERS</strong></div>
        <div class="server-loading-step ${validatingClass}"><span class="step-icon">${validating ? "•" : "○"}</span><strong>VALIDATING SERVERS</strong></div>
      </div>
      <div class="server-loading-progress"><i></i></div>
    </div>`;
}
function setServerLoadingStage(host, stage, compact = false) {
    if (!host) return;
    host.classList.add("server-grid-loading");
    host.innerHTML = serverLoadingMarkup(stage, compact);
}
function serverValidationDelay(ms = 900) { return new Promise(resolve => setTimeout(resolve, ms)); }
applyTheme(getThemePreference());

function isAdmin(guild) {
    if (!guild) return false;
    if (guild.owner === true) return true;
    try { return (BigInt(String(guild.permissions || "0")) & BigInt(ADMINISTRATOR)) === BigInt(ADMINISTRATOR); } catch { return false; }
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
            // Replace the runtime host list instead of merging it. Merging here
            // kept dead Quick-Tunnel URLs from older sessions alive forever, which
            // made the browser keep retrying expired trycloudflare.com hosts.
            const previous = CFG || {};
            CFG = { ...next };
            window.NEXORIA_CONFIG = CFG;
            const nextTargets = getBotTargets();
            const nextActive = String(CFG.LOCAL_BOT_URL || "").trim().replace(/\/$/, "");
            const currentStillConfigured = activeBotUrl && nextTargets.some(t => t.url === activeBotUrl);
            activeBotUrl = currentStillConfigured ? activeBotUrl : (nextActive || nextTargets[0]?.url || "");
            for (const key of [...hostFailureCounts.keys()]) {
                if (!nextTargets.some(t => t.url === key)) hostFailureCounts.delete(key);
            }
            for (const key of [...hostRetryAfter.keys()]) {
                if (!nextTargets.some(t => t.url === key)) hostRetryAfter.delete(key);
            }
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
const hostRetryAfter = new Map();
const HOST_RETRY_BACKOFF_MS = 30000;

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
    if (next >= HOST_FAIL_LIMIT) hostRetryAfter.set(clean, Date.now() + HOST_RETRY_BACKOFF_MS);
    return next;
}

function recordHostSuccess(url) {
    const clean = String(url || "").trim().replace(/\/$/, "");
    if (!clean) return;
    hostFailureCounts.set(clean, 0);
    hostSuccessCounts.set(clean, (hostSuccessCounts.get(clean) || 0) + 1);
    hostRetryAfter.delete(clean);
}

function hostIsExhausted(url) {
    return (hostFailureCounts.get(String(url || "").trim().replace(/\/$/, "")) || 0) >= HOST_FAIL_LIMIT;
}
function hostIsCoolingDown(url) {
    const clean = String(url || "").trim().replace(/\/$/, "");
    return !!clean && Number(hostRetryAfter.get(clean) || 0) > Date.now();
}

function orderedBotTargets() {
    const targets = getBotTargets();
    if (!targets.length) return [];
    const active = activeBotUrl;
    const preferred = targets.find(t => t.url === active && !hostIsExhausted(t.url) && !hostIsCoolingDown(t.url));
    const healthy = targets.filter(t => !hostIsExhausted(t.url) && !hostIsCoolingDown(t.url) && t.url !== active);
    const exhausted = targets.filter(t => hostIsExhausted(t.url) && !hostIsCoolingDown(t.url));
    const ordered = [
        ...(preferred ? [preferred] : []),
        ...healthy.sort((a,b) => (hostFailureCounts.get(a.url)||0) - (hostFailureCounts.get(b.url)||0)),
        ...exhausted
    ];
    // When every configured host is cooling down, return no target. The caller
    // reports the bridge as temporarily unavailable and the next poll retries
    // after the cooldown instead of spamming a dead Quick Tunnel.
    return ordered;
}

function selectNextBotTarget(failedUrl) {
    const targets = getBotTargets();
    const next = targets.find(t => t.url !== failedUrl && !hostIsExhausted(t.url) && !hostIsCoolingDown(t.url));
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
    let preferredLeaderUrl = "";
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
            onlineHosts.push({ id: hostId || target.url, instanceId: String(data.instanceId || "").trim(), url: target.url, latencyMs, dataUpdatedAt: data.dataUpdatedAt || null });
            if (!preferredLeaderUrl && data.leaderHostUrl) preferredLeaderUrl = String(data.leaderHostUrl).trim().replace(/\/$/, "");
            if (!selected) selected = { ...data, latencyMs, hostId: hostId || target.id || null, hostUrl: target.url };
        } catch {
            const count = recordHostFailure(target.url);
            // DNS/connection failures are treated as a dead Quick Tunnel immediately.
            // Keep the normal five-failure rule for real HTTP failures, but cool a dead
            // host down now so the browser does not print the same DNS error every second.
            hostRetryAfter.set(String(target.url).replace(/\/$/, ""), Date.now() + HOST_RETRY_BACKOFF_MS);
            if (target.url === activeBotUrl || count >= HOST_FAIL_LIMIT) selectNextBotTarget(target.url);
        }
    }
    if (selected) {
        const uniqueOnlineHosts = [];
        const seenHostKeys = new Set();
        for (const host of onlineHosts) {
            const key = String(host.instanceId || host.id || host.url || "").trim();
            if (!key || seenHostKeys.has(key)) continue;
            seenHostKeys.add(key);
            uniqueOnlineHosts.push(host);
        }
        const effectiveOnlineHosts = uniqueOnlineHosts.length ? uniqueOnlineHosts : onlineHosts;
        const leaderHost = preferredLeaderUrl && effectiveOnlineHosts.find(h => h.url === preferredLeaderUrl);
        if (leaderHost) {
            const leaderTarget = targets.find(t => t.url === leaderHost.url);
            if (leaderTarget) {
                // Prefer the elected host for all subsequent API writes/reads.
                try {
                    const leaderResponse = await fetch(`${leaderTarget.url}/status`, {
                        method: "GET", headers: { "Accept": "application/json", "X-NEXORIA-SITE": "1" },
                        cache: "no-store", signal: AbortSignal.timeout(2500)
                    });
                    if (leaderResponse.ok) {
                        const leaderData = await leaderResponse.json();
                        selected = { ...leaderData, latencyMs: leaderHost.latencyMs, hostId: leaderHost.id, hostUrl: leaderTarget.url };
                    }
                } catch {}
            }
        }
        setActiveBotUrl(selected.hostUrl);
        botStatusState = "online"; botStatusFailedAt = 0;
        selected.hosts = effectiveOnlineHosts; selected.hostCount = effectiveOnlineHosts.length;
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
    const retryable = method === "GET" || method === "HEAD" || method === "PUT" || method === "PATCH";
    const maxAttemptsPerHost = retryable ? 3 : 1;
    let lastError = null;
    for (const target of targets) {
        if (hostIsExhausted(target.url) && targets.some(t => !hostIsExhausted(t.url))) continue;
        for (let attempt = 1; attempt <= maxAttemptsPerHost; attempt++) {
            try {
                const storedAccessToken = localStorage.getItem(LS.token) || "";
                const headers = {
                    "Accept": "application/json",
                    ...(options.body ? { "Content-Type": "application/json" } : {}),
                    "X-NEXORIA-SITE": "1",
                    ...(storedAccessToken ? { "Authorization": `Bearer ${storedAccessToken}` } : {}),
                    ...(options.headers || {})
                };
                const response = await fetch(`${target.url}${path}`, { ...options, headers, cache: "no-store", signal: options.signal || AbortSignal.timeout(10000) });
                const requestId = response.headers.get("X-NEXORIA-Request-ID") || "unknown";
                const contentType = String(response.headers.get("content-type") || "").toLowerCase();
                let payload = null;
                try { payload = contentType.includes("application/json") ? await response.json() : await response.text(); } catch (_) { payload = null; }
                if (response.ok) {
                    recordHostSuccess(target.url);
                    setActiveBotUrl(target.url);
                    return payload ?? {};
                }
                const detail = String(payload?.error || payload?.message || payload || `HTTP ${response.status}`);
                const expectedSilent = response.status === 409 && /\/tickets\/[^/]+\/review(?:$|[?])/.test(String(path));
                if (!expectedSilent) console.warn(`[api:${requestId}] ${method} ${path} -> HTTP ${response.status}`, detail);
                const error = new Error(detail || `Request failed (HTTP ${response.status}).`);
                error.status = response.status; error.statusCode = response.status; error.requestId = requestId; error.payload = payload; error.code = payload?.code || "";
                if (response.status === 401 && !String(path).startsWith("/oauth/refresh") && !options.__authRetry) {
                    const refreshed = await refreshStoredSession();
                    if (refreshed?.token) {
                        return api(path, { ...options, __authRetry: true });
                    }
                }
                if ([401,403,404].includes(response.status)) throw error;
                lastError = error;
                const count = recordHostFailure(target.url);
                if (count >= HOST_FAIL_LIMIT) break;
                if (retryable && attempt < maxAttemptsPerHost && [408,429,500,502,503,504].includes(response.status)) {
                    const retryAfter = Number(response.headers.get("retry-after"));
                    const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(10000, retryAfter * 1000) : 350 * attempt;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                break;
            } catch (e) {
                if (e?.status) throw e;
                lastError = e;
                const count = recordHostFailure(target.url);
                // DNS/connection failures should fail over immediately and cool the
                // dead host so background polling does not hammer an expired tunnel.
                hostRetryAfter.set(String(target.url).replace(/\/$/, ""), Date.now() + HOST_RETRY_BACKOFF_MS);
                break;
            }
        }
        if (!hostIsExhausted(target.url)) continue;
        const next = selectNextBotTarget(target.url);
        if (next) continue;
    }
    throw lastError || new Error("Request failed");
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
        const latencyValue = botInfo.latencyMs != null ? Math.max(0, Math.round(Number(botInfo.latencyMs) || 0)) : null;
        const latency = latencyValue != null ? `${String(latencyValue).padStart(2, "0")}ms` : "—";
        const uptime = formatUptime(botInfo.uptimeSeconds, botInfo.uptimeMs);
        const hostIds = Array.isArray(botInfo.hosts) ? [...new Set(botInfo.hosts.map(h => String(h.id || "").trim()).filter(Boolean))] : [];
        const hostLabel = hostIds.length ? `Hosts ${hostIds.length}` : "Bot Servers";
        el.innerHTML = `<span class="status-dot"></span>${escapeHtml(hostLabel)} <span class="status-pip-sep">·</span> ${latency} <span class="status-pip-sep">·</span> Uptime ${uptime}`;
    }
    else {
        el.classList.add("offline");
        el.innerHTML = `<span class="status-dot"></span>Bot Servers down`;
    }
}
function formatUptime(seconds, uptimeMs = null) {
    // Readable uptime: 1h 1m 1s 10ms. Zero-value units are omitted except
    // seconds, and milliseconds are always exactly two digits.
    const msTotal = Number.isFinite(Number(uptimeMs)) && Number(uptimeMs) >= 0
        ? Math.floor(Number(uptimeMs))
        : Math.max(0, Math.floor(Number(seconds) || 0) * 1000);
    let remaining = msTotal;
    const days = Math.floor(remaining / 86400000); remaining %= 86400000;
    const hours = Math.floor(remaining / 3600000); remaining %= 3600000;
    const minutes = Math.floor(remaining / 60000); remaining %= 60000;
    const secs = Math.floor(remaining / 1000);
    const millis = Math.floor((remaining % 1000) / 10);
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);
    parts.push(`${String(millis).padStart(2, "0")}ms`);
    return parts.join(" ");
}
function showScreen(id) {
    const target = String(id || "");
    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.toggle("active", screen.id === target);
    });
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
const ADMIN_TOKEN_STORAGE_KEY = "nexoria_admin_token";
function getAdminToken(){ try{return sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)||localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)||"";}catch{return "";} }
window.getAdminToken = getAdminToken;
function setAdminToken(token){ try{ if(token){sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY,String(token));} else {sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);} }catch{} }
// Admin requests use the same resilient multi-host API/failover as normal
// dashboard requests, with the dedicated X-Admin-Token session header added.
async function adminApi(path, options = {}) {
    const headers = { ...(options.headers || {}), "X-Admin-Token": getAdminToken() };
    return api(path, { ...options, headers });
}
window.adminApi = adminApi;
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
  try { if (!CFG) await loadPublicConfig(); } catch {}
  // An explicit logout is a hard browser-side sign-out. Do not refresh an old
  // Discord token before checking the flag, otherwise a refresh token can log
  // the user straight back in after pressing Log out.
  const explicitLogout = localStorage.getItem("nexoria_explicit_logout") === "1";
  if (!explicitLogout) await refreshStoredSession();
    const authCallbackPending = Boolean(new URL(window.location.href).searchParams.get("code") || new URL(window.location.href).searchParams.get("error"));
    const bootRoute = routes.parse();
    if (!authCallbackPending && !getSession() && bootRoute.screen !== "landing" && bootRoute.screen !== "verify" && localStorage.getItem("nexoria_explicit_logout") !== "1") {
        try {
            const target = `${window.location.pathname}${window.location.search}${window.location.hash}`;
            await beginLogin({ silent: true, redirectPath: target });
            return;
        } catch (e) { console.debug("[auth] protected-route login unavailable", e?.message || e); }
    }
    if (window.location.hash) {
        window.history.replaceState({}, "", window.location.pathname + window.location.search);
    }
    const redirectPath = sessionStorage.getItem("tk_redirect_path");
    if (redirectPath) {
        sessionStorage.removeItem("tk_redirect_path");
        window.history.replaceState({}, "", normalizePublicRoutePath(redirectPath));
    }
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const callbackState = url.searchParams.get("state");
    const authError = url.searchParams.get("error");
    if (authError && sessionStorage.getItem("tk_silent_login") === "1") {
        sessionStorage.removeItem("tk_silent_login");
        url.searchParams.delete("error");
        url.searchParams.delete("error_description");
        url.searchParams.delete("state");
        window.history.replaceState({}, "", url.pathname + url.search);
        if (["login_required", "interaction_required", "consent_required"].includes(authError)) {
            const savedDestination = sessionStorage.getItem("tk_post_login_redirect") || "/dashboard";
            try { await beginLogin({ silent: false, redirectPath: savedDestination }); return; } catch {}
        }
        if (authError === "access_denied") { routes.go("/", true); showScreen("screen-landing"); return; }
    }
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
            const data = await api("/oauth/roblox/exchange", { method: "POST", body: JSON.stringify({ code, code_verifier: saved.verifier, discordUserId: saved.discordUserId, redirect_uri: saved.redirectUri, verificationGuildId: saved.verificationGuildId || null }) });
            sessionStorage.removeItem("nexoria_roblox_oauth");
            url.searchParams.delete("code");
            url.searchParams.delete("state");
            window.history.replaceState({}, "", url.pathname + url.search);
                const savedRobloxReturn = sessionStorage.getItem("nexoria_roblox_return_path") || "/profile/?settings=integrations";
                if (saved.verificationFlow && saved.verificationGuildId) {
                    sessionStorage.removeItem(`nexoria_verification_auto_started_${saved.verificationGuildId}`);
                    const robloxLabel = String(data.account?.username || data.account?.displayName || data.account?.id || "Roblox account");
                    await DCModal.alert(`Done — Roblox account ${robloxLabel} is connected. Return to Discord and click Complete Roblox Verification.`, { title: "Roblox connected" });
                    sessionStorage.setItem("nexoria_verification_return_notice", JSON.stringify({ guildId:String(saved.verificationGuildId), account:robloxLabel }));
                    sessionStorage.setItem("nexoria_roblox_return_path", "/profile/?settings=integrations");
                } else {
                    await DCModal.alert(`Connected Roblox account: ${data.account?.displayName || data.account?.username || data.account?.id}`, { title: "Roblox connected" });
                }
                sessionStorage.removeItem("nexoria_roblox_return_path");
                routes.go(savedRobloxReturn, true);
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
    const discordLinkAuth = sessionStorage.getItem("nexoria_discord_link_oauth");
    if (code && discordLinkAuth && callbackState) {
        try {
            const saved = JSON.parse(discordLinkAuth);
            if(saved?.state===callbackState && String(saved.state).startsWith("dcl_")){
                const data=await api("/oauth/discord/link",{method:"POST",body:JSON.stringify({code,verifier:saved.verifier,redirect_uri:getRedirectUri()})});
                sessionStorage.removeItem("nexoria_discord_link_oauth"); url.searchParams.delete("code");url.searchParams.delete("state");window.history.replaceState({},"",url.pathname+url.search);
                await DCModal.alert(`Connected Discord account: ${data.account?.displayName||data.account?.username||data.account?.id}`,{title:"Discord account connected"});
                routes.go(saved.returnPath||"/profile/",true); await renderFromRoute(); return;
            }
        } catch(e){sessionStorage.removeItem("nexoria_discord_link_oauth");url.searchParams.delete("code");url.searchParams.delete("state");window.history.replaceState({},"",url.pathname+url.search);await DCModal.alert(e.message||"Discord account linking failed",{title:"Discord account linking failed"});routes.go("/profile/",true);await renderFromRoute();return;}
    }
    const storedSession = getSession();
    if (storedSession?.token) {
        try {
            const freshUser = await fetchMe(storedSession.token);
            localStorage.setItem(LS.user, JSON.stringify(freshUser));
        } catch {
            clearSession({ explicit: false });
        }
    }
    const route = routes.parse();
    if (route.screen === "share") {
        await enterSharePage(route.shareId);
        return;
    }
    if (route.screen === "policy") {
        await renderPolicyPanel(route.policy);
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
        sessionStorage.removeItem("tk_silent_login");
        url.searchParams.delete("code");
        window.history.replaceState({}, "", url.pathname + url.search);
        try {
            const tokenData = await exchangeCodeForToken(code);
            const user = await fetchMe(tokenData.access_token);
            saveSession(tokenData, user);
            await registerAuthenticatedUser(tokenData.access_token);
            const savedDestination = sessionStorage.getItem("tk_post_login_redirect") || "/dashboard";
            sessionStorage.removeItem("tk_post_login_redirect");
            let destination = normalizePublicRoutePath(savedDestination);
            // Never allow a stale or externally supplied redirect to send the user
            // away from NEXORIA. Only accept same-site app paths.
            try {
                const destinationUrl = new URL(destination, window.location.origin);
                const base = getSiteBasePath().replace(/\/$/, "");
                if (destinationUrl.origin !== window.location.origin || !(destinationUrl.pathname === base || destinationUrl.pathname.startsWith(`${base}/`))) destination = "/dashboard";
                else destination = destinationUrl.pathname.slice(base.length) + destinationUrl.search + destinationUrl.hash || "/dashboard";
            } catch { destination = "/dashboard"; }
            if (!destination || destination === "/") destination = "/dashboard";
            routes.go(destination, true);
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
async function authorizeNexoriaUrl(rawUrl) {
    const raw = String(rawUrl || "").trim();
    if (!raw) throw new Error("Enter a NEXORIA URL.");
    let url;
    try { url = new URL(raw, window.location.origin); } catch { throw new Error("That URL is not valid."); }
    if (url.origin !== window.location.origin) throw new Error("Only NEXORIA website URLs can be opened from the dashboard navigator.");
    const base = getSiteBasePath().replace(/\/+$/, "");
    const pathname = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : url.pathname;
    const normalized = `/${pathname.replace(/^\/+/, "")}`.replace(/\/+$/, "") || "/";
    const parts = normalized.split("/").filter(Boolean);
    const session = getSession();
    if (!session?.token) throw new Error("You must be logged in to open this NEXORIA page.");
    if (parts[0] === "servers" && parts[1]) {
        const guildId = parts[1];
        const meta = await api(`/guilds/${encodeURIComponent(guildId)}/meta?userId=${encodeURIComponent(session.user.id)}`);
        if (meta?.allowed === false || meta?.canViewDashboard === false) throw new Error(meta?.notAllowedMessage || "You are not authorized to open this server dashboard.");
    }
    return { url };
}
async function navigateAuthorizedUrl(rawUrl) {
    const target = await authorizeNexoriaUrl(rawUrl);
    const base = getSiteBasePath().replace(/\/+$/, "");
    const targetPath = target.url.pathname.startsWith(base) ? (target.url.pathname.slice(base.length) || "/") : target.url.pathname;
    routes.go(`${targetPath}${target.url.search}${target.url.hash}`, false, true);
    await renderFromRoute();
}
function wireUrlNavigator() {
    const input=document.getElementById("nexoria-url-nav"), button=document.getElementById("nexoria-url-nav-go");
    if(!input || input.dataset.wired === "1") return; input.dataset.wired="1";
    const submit=async()=>{const value=input.value.trim(); if(!value)return; const previous=value; input.disabled=true; if(button)button.disabled=true; try{await navigateAuthorizedUrl(value); input.value=window.location.href;}catch(e){input.value=previous; await DCModal.alert(e?.message||"You are not authorized to open that page.",{title:"Navigation blocked"});}finally{input.disabled=false;if(button)button.disabled=false;}};
    input.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();submit();}}); button?.addEventListener("click",submit); input.value=window.location.href;
}
async function renderFromRoute() {
    if (routeRenderInFlight)
        return;
    routeRenderInFlight = true;
    try {
    const route = routes.parse();
    const session = getSession();
    wireUrlNavigator();
    if (route.screen === "share") {
        await enterSharePage(route.shareId);
        return;
    }
    if (route.screen === "policy") {
        await renderPolicyPanel(route.policy);
        return;
    }
    if (route.screen !== "landing" && route.screen !== "verify" && !session) {
        if (localStorage.getItem("nexoria_explicit_logout") === "1") {
            routes.go("/", true);
            showScreen("screen-landing");
            return;
        }
        try {
            const target = `${window.location.pathname}${window.location.search}${window.location.hash}`;
            await beginLogin({ silent: true, redirectPath: target });
            return;
        } catch (e) {
            console.warn("[auth] automatic Discord re-authentication failed:", e?.message || e);
            routes.go("/", true);
            showScreen("screen-landing");
            return;
        }
    }
    if (route.screen === "landing") {
        showScreen("screen-landing");
        return;
    }
    if (route.screen === "verify") {
        await renderVerificationPage(route);
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
    const signature = JSON.stringify({state:botStatusState,info:displayInfo ? {online:!!displayInfo.online,guildCount:displayInfo.guildCount,uptimeSeconds:Math.floor(Number(displayInfo.uptimeSeconds)||0),uptimeMs:Math.floor(Number(displayInfo.uptimeMs)||0),latencyMs:displayInfo.latencyMs,botTag:displayInfo.botTag,hosts:(displayInfo.hosts||[]).map(h=>({id:h.id,url:h.url,latencyMs:h.latencyMs,online:h.online})),guilds:(displayInfo.guilds||[]).map(g=>({id:g.id,name:g.name,icon:g.icon,memberCount:g.memberCount}))}:null});
    if(signature === lastHeroRenderSignature) return;
    lastHeroRenderSignature = signature;
    const heroPip = document.getElementById("hero-status-pip");
    if(heroPip) renderStatusPip(heroPip,displayInfo,botStatusState === "checking" ? "checking" : "normal");
    const set=(id,val)=>{const el=document.getElementById(id);if(el && el.textContent!==String(val))el.textContent=val;};
    const onlineHostIds = Array.isArray(displayInfo?.hosts) ? [...new Set(displayInfo.hosts.map(h => String(h.id || "")).filter(Boolean))] : [];
    set("hero-bot-url", botStatusState === "checking" ? "Checking…" : (displayInfo?.online ? (onlineHostIds.length ? onlineHostIds.join(" · ") : "Online") : "Down"));
    set("hero-guild-count",displayInfo?.guildCount ?? "—");
    set("hero-uptime",displayInfo ? formatUptime(displayInfo.uptimeSeconds, displayInfo.uptimeMs) : "—");
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
          ${guildIconHtml(g, "watching-top-icon server-icon watching-initials", 64)}
          <span class="watching-top-name">${escapeHtml(g.name)}</span>
          <span class="watching-top-count">${(Number(g.memberCount) || 0).toLocaleString()}</span>
        </div>`).join("");
    }
}
let pickerActivePanel = "dashboard";
let pickerPanelRenderGeneration = 0;
function pickerPanelIsCurrent(generation, panel) {
    return generation === pickerPanelRenderGeneration && pickerActivePanel === panel && document.getElementById("screen-picker")?.classList.contains("active");
}
async function renderPickerPanelGuarded(panel, deepLink = {}) {
    const generation = ++pickerPanelRenderGeneration;
    const root = document.getElementById("picker-panel-root");
    if (panel === "dashboard" && root) root.innerHTML = `<div class="server-grid server-grid-loading">${serverLoadingMarkup("grabbing")}</div>`;
    try {
        await renderPickerPanel(panel, deepLink, generation);
    } catch (e) {
        if (pickerPanelIsCurrent(generation, panel) && root) root.innerHTML = `<div class="empty-state">${escapeHtml(e?.message || "Couldn't load this section.")}</div>`;
        throw e;
    }
}
async function enterPicker(panel, deepLink = {}) {
    document.getElementById("screen-picker")?.classList.remove("policy-standalone");
    showScreen("screen-picker");
    pickerActivePanel = panel || pickerActivePanel || "dashboard";
    const pickerRoot = document.getElementById("picker-panel-root");
    // Paint the server-loading scene immediately. Do not wait for config/status
    // calls first, otherwise returning to Servers can show a blank/stale panel.
    if (pickerActivePanel === "dashboard" && pickerRoot) pickerRoot.innerHTML = `<div class="server-grid server-grid-loading">${serverLoadingMarkup("grabbing")}</div>`;
    try { await loadPublicConfig(); } catch {}
    wirePickerServerSwitcher();
    wireQuickNav("picker-quick-nav");
    await refreshHeroStatus();
    renderSidebarBottom("picker-sidebar-bottom");
    paintPickerNav();
    // Wire global picker navigation BEFORE the server list is loaded. Server
    // validation can take several seconds and must never block My Tickets,
    // Premium, Leaderboards, Settings, etc. on first visit.
    document.querySelectorAll("#picker-sidebar [data-picker-panel]").forEach(el => {
        if (el.dataset.pickerWired === "1") return;
        el.dataset.pickerWired = "1";
        el.addEventListener("click", () => {
            const nextPanel = el.dataset.pickerPanel;
            pickerActivePanel = nextPanel;
            routes.go(nextPanel === "dashboard" ? "/" : `/${nextPanel}`);
            paintPickerNav();
            Promise.resolve(renderPickerPanelGuarded(nextPanel)).catch(e => { console.error("[picker] panel render failed:", e); scheduleRouteRetry(e?.message || "picker render failed"); });
        });
    });
    if (pickerActivePanel === "my-tickets" && deepLink.myTicketGuildId && deepLink.myTicketId) {
        await openMyTicketDetail(deepLink.myTicketGuildId, deepLink.myTicketId, false);
    }
    else {
        await renderPickerPanelGuarded(pickerActivePanel, deepLink);
    }
}
function paintPickerNav() {
    const sidebar = document.getElementById("picker-sidebar");
    if (sidebar && !sidebar.querySelector('[data-picker-panel="leaderboards"]')) {
        const spacer = sidebar.querySelector(".app-sidebar-spacer");
        const item = document.createElement("div");
        item.className = "nav-item";
        item.dataset.pickerPanel = "leaderboards";
        item.dataset.navIcon = "trophy";
        item.innerHTML = `${icon("trophy", 16)} Leaderboards`;
        spacer ? sidebar.insertBefore(item, spacer) : sidebar.appendChild(item);
        item.addEventListener("click", () => {
            pickerActivePanel = "leaderboards";
            routes.go("/leaderboards");
            paintPickerNav();
            void renderPickerPanel("leaderboards");
        });
    }
    document.querySelectorAll("#picker-sidebar [data-picker-panel]").forEach(el => {
        el.classList.toggle("active", el.dataset.pickerPanel === pickerActivePanel);
    });
}
async function renderPickerPanel(panel, deepLink = {}, renderGeneration = pickerPanelRenderGeneration) {
    const root = document.getElementById("picker-panel-root");
    if (panel === "my-tickets")
        return renderMyTicketsPanel(root);
    if (panel === "premium") {
        if (typeof renderPremiumPanel === "function") return renderPremiumPanel(root);
        root.innerHTML = `<div class="dash-header"><div><h1 class="picker-heading">Premium</h1><p class="picker-sub">Premium information is temporarily unavailable.</p></div></div><div class="empty-state">The Premium panel could not be loaded. Please reload the page.</div>`;
        return;
    }
    if (panel === "leaderboards")
        return renderLeaderboardsPanel(root);
    if (panel === "status")
        return renderStatusModule(root);
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
window.__nexoriaRefreshDocsOrder = function () { try { docsModulesCache = null; } catch {} };
async function loadDocsModuleList() {
    const bundle = await loadDocumentationBundle();
    const docs = (bundle.modules || []).map(m => ({ id: m.moduleId, title: m.title, summary: m.summary, doc: m }));
    // Documentation follows the exact same default/custom module order as the sidebar.
    // Unknown/offline documentation is kept after installed modules.
    const order = new Map(getOrderedModuleIds().map((id,i) => [String(id), i]));
    return docs.sort((a,b) => {
        const ai = order.has(String(a.id)) ? order.get(String(a.id)) : 100000;
        const bi = order.has(String(b.id)) ? order.get(String(b.id)) : 100000;
        return ai - bi || String(a.title || a.id).localeCompare(String(b.title || b.id));
    });
}
function prettifyModuleId(id) { return id.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
async function renderDocsPanel(root, initialModuleId) {
    root.innerHTML = `
    <div class="docs-heading-row"><div><h1 class="picker-heading">Documentation</h1><p class="picker-sub">Guides, module references, every variable, command action, setting, and feature NEXORIA exposes. This documentation works even while the bot is offline.</p></div><div class="docs-heading-actions">${currentGuild?.id ? `<button type="button" class="btn btn-ghost btn-small" id="docs-back-server">${icon("arrow-left",14)} Back to Server</button>` : ""}</div></div>
    <div class="docs-layout">
      <div class="docs-sidebar">
        <input type="text" class="search-input" id="docs-search" placeholder="Search documentation…" style="margin-bottom:10px">
        <div id="docs-module-list">${loadingBlock("Loading documentation…")}</div>
      </div>
      <div class="docs-content" id="docs-content">${loadingBlock("Loading…")}</div>
    </div>`;
    root.querySelector("#docs-back-server")?.addEventListener("click", () => { if (currentGuild?.id) { const back = currentPanelId && !["docs","leaderboards","status"].includes(currentPanelId) ? currentPanelId : "ticket-tool"; if (routes.go(routes.moduleUrl(currentGuild.id, back, currentTab)) === false) return; void enterDashboard(back, { tab: currentTab }); } });
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
        if (!activeId) { renderDocsInfoTab(content); return; }
        const mod = modules.find(m => m.id === activeId);
        const general = (docsBundleCache?.general || []).find(d => d.id === activeId);
        const item = mod || (general ? {title:general.title,summary:general.summary,doc:general} : null);
        if (!item) { content.innerHTML = `<div class="empty-state">Documentation not found.</div>`; return; }
        const docItem=item.doc || item;
        const advancedVisual = activeId === "custom-commands" ? `<section class="settings-section-block docs-advanced-guide"><h4>${icon("settings")} Advanced command builder at a glance</h4><p>Advanced commands are visual flows. Start with one Trigger and connect its output directly to the first executable node. Branches split into True and False paths.</p><div class="docs-node-example"><div class="docs-node-example-node docs-node-trigger"><strong>Trigger</strong><span>/welcome</span></div><div class="docs-node-example-wire"></div><div class="docs-node-example-node"><strong>Send Message</strong><span>Welcome {user.mention}!</span></div><div class="docs-node-example-wire"></div><div class="docs-node-example-node docs-node-branch"><strong>If</strong><span>User → Has Role → Staff</span><em>True → Add Role</em><em>False → Send Message</em></div></div><div class="docs-node-example-grid"><div><b>Command</b><p>Trigger, Description, Permissions define command metadata.</p></div><div><b>Discord</b><p>Send Message, Embed, Reply, Mention User, Roles, React, DM, Delete Trigger.</p></div><div><b>Flow</b><p>Wait and Stop control execution order.</p></div><div><b>Logic</b><p>If, role checks, text checks, channel checks, command checks and random branches.</p></div><div><b>Variables</b><p>Set Variable and Change Variable store temporary values for later nodes.</p></div><div><b>Utility</b><p>Log writes diagnostics and Comment adds builder-only notes.</p></div></div></section>` : "";
        content.innerHTML = `<div class="docs-article"><h2>${escapeHtml(item.title)}</h2><p class="picker-sub">${escapeHtml(item.summary || "")}</p>${advancedVisual}${(docItem.sections || []).map(sec => `<section class="settings-section-block"><h4>${escapeHtml(sec.heading)}</h4><p>${escapeHtml(sec.body)}</p>${sec.visualNodes?`<div class="nexoria-doc-node-grid">${sec.visualNodes.map(n=>`<div class="nexoria-doc-node"><span class="nexoria-doc-node-dot"></span><strong>${escapeHtml(n.label)}</strong></div>`).join("")}</div>`:""}${sec.visualExamples?sec.visualExamples.map(ex=>`<div class="nexoria-doc-example"><strong>${escapeHtml(ex.title)}</strong><div class="nexoria-doc-example-flow">${ex.nodes.map((n,i)=>`<div class="nexoria-doc-node nexoria-doc-example-node"><strong>${escapeHtml(n.label)}</strong></div>${i<ex.nodes.length-1?`<span class="nexoria-doc-arrow">→</span>`:""}`).join("")}</div></div>`).join(""):""}${(sec.links||[]).map(l=>`<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener" class="btn btn-ghost btn-small" style="margin:6px 6px 0 0;display:inline-flex">${icon("link",14)} ${escapeHtml(l.label||l.url)}</a>`).join("")}</section>`).join("")}</div>`;
    }
    paintList("");
    document.getElementById("docs-search")?.addEventListener("input", e => paintList(e.target.value));
    // The AI button is wired before the documentation request above so it remains
    // usable even if the documentation bundle is temporarily unavailable.
    if (initialModuleId && !modules.some(m => m.id === initialModuleId)) activeId = null;
    await paintContent();
    
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
    <div class="settings-section-block"><h4>Legal</h4><p>Review the NEXORIA policies at any time.</p><a class="btn btn-ghost btn-small docs-policy-link" data-policy="terms" href="${policyUrl("terms")}">Terms of Service</a> <a class="btn btn-ghost btn-small docs-policy-link" data-policy="privacy" href="${policyUrl("privacy")}">Privacy Policy</a></div><div class="settings-section-block"><h4>${icon("discord")}Support &amp; Suggestions</h4><p>Join the official NEXORIA Discord server for help, updates, and to suggest features or languages.</p><p>Have an idea or want a feature added? Send suggestions in the <a href="https://discord.gg/qrMmetkGvk" target="_blank" rel="noopener"><strong>NEXORIA Community Discord</strong></a>.</p><a class="btn btn-primary btn-small" href="${escapeHtml(discordUrl)}" target="_blank" rel="noopener" style="margin-top:8px;display:inline-flex">${icon("discord")} Join the Discord</a></div>
    ${renderVariableReference(bundle.variables || [], "All Variables")}`;
    content.querySelectorAll(".docs-policy-link").forEach(link => link.addEventListener("click", e => {
        e.preventDefault();
        routes.go(link.dataset.policy === "privacy" ? "/privacy" : "/terms");
        void renderFromRoute();
    }));
    wireVarSearch();
}
function wireVarSearch() {
    const input = document.getElementById("docs-var-search"); if (!input) return;
    input.oninput = () => { const q = input.value.toLowerCase(); document.querySelectorAll("[data-var-row]").forEach(row => row.style.display = !q || row.dataset.varSearch.toLowerCase().includes(q) ? "" : "none"); document.querySelectorAll("[data-var-group]").forEach(group => group.style.display = Array.from(group.querySelectorAll("[data-var-row]")).some(r => r.style.display !== "none") ? "" : "none"); };
}
async function renderLeaderboardsPanel(root) {
    root.innerHTML = loadingBlock("Loading leaderboards…");
    const key = "nexoria_leaderboards_cache", at = key + "_at";
    const ttl = Math.max(100, getRefreshPrefs().leaderboardSeconds * 1000);
    let d = null, cached = null, cacheAt = 0;
    try {
        const raw = localStorage.getItem(key);
        cacheAt = Number(localStorage.getItem(at) || 0);
        if (raw) cached = JSON.parse(raw);
        if (cached && Date.now() - cacheAt < ttl) d = cached;
    } catch {}
    if (!d) {
        try {
            d = await api("/leaderboards");
            localStorage.setItem(key, JSON.stringify(d));
            localStorage.setItem(at, String(Date.now()));
        } catch (e) {
            d = cached;
            if (!d) {
                const fallbackGuilds = Array.isArray(botInfoCache?.guilds) ? botInfoCache.guilds : [];
                if (fallbackGuilds.length) {
                    d = { modules: [{ id:"top-servers", label:"Top Servers", category:"Players", metric:"players", servers:fallbackGuilds.map(g => ({guildId:g.id,guildName:g.name,guildIcon:g.icon,memberCount:Number(g.memberCount)||0})) } ] };
                } else {
                    root.innerHTML = `<div class="empty-state"><div style="font-weight:700;margin-bottom:5px">Leaderboard data is offline</div><div class="field-hint">The bot is not currently reachable, so live leaderboard data cannot be loaded.</div><div style="margin-top:12px"><button class="btn btn-primary btn-small" id="lb-retry">${icon("refresh")} Retry</button></div></div>`;
                    root.querySelector("#lb-retry")?.addEventListener("click", () => renderLeaderboardsPanel(root));
                    return;
                }
            }
        }
    }
    let mods = Array.isArray(d?.modules) ? d.modules.filter(Boolean) : [];
    if (!mods.length) {
        const fallbackGuilds = Array.isArray(botInfoCache?.guilds) ? botInfoCache.guilds : [];
        mods = [{ id:"top-servers", label:"Top Servers", category:"Players", metric:"players", leaderboard:true, servers:fallbackGuilds.map(g => ({ guildId:g.id, guildName:g.name, guildIcon:g.icon, guildIconUrl:g.iconUrl || null, memberCount:Number(g.memberCount)||0 })), staff:[] }, { id:"ticket-ratings", label:"Ticket Ratings", category:"Ticket Support", metric:"rating", leaderboard:true, servers:[], staff:[] }, { id:"support-staff", label:"Support Staff", category:"Ticket Support", metric:"staff-score", leaderboard:true, servers:[], staff:[] }];
    }
    // Each leaderboard is its own category/tab. The previous UI mixed staff
    // results into the ticket leaderboard, which made separate leaderboard data
    // look like one broken category.
    root.innerHTML = `<div class="dash-header"><div><h1 class="picker-heading">Leaderboards</h1><p class="picker-sub">Choose a leaderboard category, then choose how many results to display.</p></div><div class="dash-header-actions"><button class="btn btn-ghost btn-small" id="lb-main-menu">${icon("home",14)} Main Menu</button>${currentGuild?.id ? `<button class="btn btn-ghost btn-small" id="lb-back-server">${icon("arrow-left",14)} Back to Server</button>` : ""}<button class="btn btn-ghost btn-small" id="lb-refresh" disabled title="Leaderboard data refreshes automatically on the configured interval">${icon("refresh")} <span id="lb-refresh-label">Updates every ${Math.round(getRefreshPrefs().leaderboardSeconds/60)}m</span></button></div></div>
      <div class="leaderboard-category-groups">${Object.entries(mods.reduce((groups,m)=>{
          const category = m.id === "top-servers" ? "General" : (m.id === "verified-roblox-servers" ? "Roblox Verification" : (String(m.category || "General").toLowerCase().includes("ticket") ? "Ticket Support" : String(m.category || "General")));
          (groups[category] ||= []).push(m); return groups; },{})).map(([category,items],gi)=>`<section class="leaderboard-category-group"><div class="leaderboard-category-heading">${icon(category === "Ticket Support" ? "tickets" : category === "Roblox Verification" ? "shield-check" : "dashboard",14)}<span>${escapeHtml(category)}</span></div><div class="leaderboard-category-bar">${items.map((m,i)=>{const summary=m.id==="top-servers"?`${Number(m.totalServers||m.servers?.length||0).toLocaleString()} servers · ${Number(m.totalMembers||0).toLocaleString()} members`:m.id==="ticket-ratings"?`Average rating based on all Ticket Ratings · ${Number(m.totalRatings||0).toLocaleString()} ${Number(m.totalRatings||0)===1?"rating":"ratings"}`:m.id==="support-staff"?`Average rating based on staff Ticket Ratings · ${Number(m.totalStaffRatings||m.totalRatings||0).toLocaleString()} ${Number(m.totalStaffRatings||m.totalRatings||0)===1?"rating":"ratings"}`:m.id==="verified-roblox-servers"?`${Number(m.verificationServerCount||0).toLocaleString()} servers · ${Number(m.verifiedTotal||0).toLocaleString()} / ${Number(m.verificationMemberTotal||0).toLocaleString()} verified`:"";return `<button class="leaderboard-category-btn btn btn-ghost btn-small ${gi===0&&i===0?"active":""}" data-lb-module="${escapeHtml(m.id)}"><span class="leaderboard-category-icon">${icon(m.id==="top-servers"?"users":m.id==="verified-roblox-servers"?"shield-check":m.id==="support-staff"?"user":"star",15)}</span><span class="leaderboard-category-copy"><strong>${escapeHtml(m.label || "Leaderboard")}</strong>${summary?`<small>${escapeHtml(summary)}</small>`:""}</span></button>`;}).join("")}</div></section>`).join("") || `<div class="empty-state">No leaderboard categories are available yet.</div>`}</div>
      <div id="lb-content"></div>`;
    const content = root.querySelector("#lb-content");
    const paint = (m) => {
        if (!content) return;
        const state = { limit: 10, page: 0 };
        const isTop = m.id === "top-servers";
        const isStaff = m.id === "support-staff";
        const isVerifiedRoblox = m.id === "verified-roblox-servers";
        const all = isStaff ? (m.staff || []) : (m.servers || []);
        const draw = () => {
            const start = state.page * state.limit;
            const rows = all.slice(start, start + state.limit);
            const titleMetric = isTop ? `${Number(m.totalServers||m.servers?.length||0).toLocaleString()} servers · ${Number(m.totalMembers||0).toLocaleString()} members` : isVerifiedRoblox ? `${Number(m.verificationServerCount||0).toLocaleString()} servers · ${Number(m.verifiedTotal||0).toLocaleString()} / ${Number(m.verificationMemberTotal||0).toLocaleString()} verified` : isStaff ? `${Number(m.ratedStaffCount||m.staff?.length||0).toLocaleString()} staff rated` : `${Number(m.totalRatings||0).toLocaleString()} ratings`;
            const description = isTop ? "Servers grouped by current Discord member count (bots excluded)." : isVerifiedRoblox ? "Servers grouped by the number of currently verified Roblox accounts." : isStaff ? "Support staff grouped by Ticket Ratings (bot accounts excluded)." : "Average rating based on all Ticket Ratings (bot accounts excluded).";
            content.innerHTML = `<div class="config-section"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div><h3>${escapeHtml(m.label || "Leaderboard")} · ${titleMetric}</h3><div class="hint">${escapeHtml(description)}</div></div><select id="lb-limit-menu" class="search-input leaderboard-limit-select" style="width:170px" aria-label="Results per page"><option value="10">10 results</option><option value="25">25 results</option><option value="50">50 results</option><option value="75">75 results</option><option value="100">100 results</option></select></div>
              ${rows.map((r,i) => {
                const name = isStaff ? (r.userId === "unassigned" ? "Unassigned" : (r.userName || r.userId)) : (r.guildName || r.name || "Unknown Server");
                const guildText = isStaff ? ` · ${r.guildName}` : "";
                const metric = isTop ? `${Number(r.memberCount||0).toLocaleString()} players` : isVerifiedRoblox ? `${Number(r.verifiedRobloxAccounts||0).toLocaleString()} verified Roblox accounts` : `${Number(r.supportScore ?? r.average ?? 0).toFixed(2)}/10 score · ${Number(r.average||0).toFixed(1)}/10 avg · ${Number(r.votes||0)} reviews`;
                const avatar = isStaff ? (r.avatarUrl ? `<span class="leaderboard-staff-avatar"><img src="${escapeHtml(r.avatarUrl)}" alt="" loading="lazy" decoding="async" onerror="this.replaceWith(document.createTextNode(""))"></span>` : `<span class="leaderboard-staff-avatar">${icon("user",16)}</span>`) : `<span class="leaderboard-server-avatar">${guildIconHtml({id:r.guildId,icon:r.guildIcon,iconUrl:r.guildIconUrl,name:r.guildName || r.name || "Unknown Server"},"leaderboard-server-avatar",64)}</span>`;
                return `<div class="config-row leaderboard-server-row"><span class="config-row-label" style="display:flex;align-items:center;gap:9px">${avatar}<span>#${start+i+1} ${escapeHtml(name)}${escapeHtml(guildText)}</span></span><span>${metric}</span></div>`;
              }).join("") || `<div class="empty-state">No data is available for this category yet.</div>`}
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px"><button class="btn btn-ghost btn-small" id="lb-prev" ${start===0?"disabled":""}>${icon("arrow-left")} Previous</button><span class="field-hint">Page ${Math.floor(start/state.limit)+1} of ${Math.max(1,Math.ceil(all.length/state.limit))}</span><button class="btn btn-ghost btn-small" id="lb-next" ${start+state.limit>=all.length?"disabled":""}>Next ${icon("arrow-right")}</button></div></div>`;
            const limitHost = content.querySelector("#lb-limit-menu");
            if (limitHost) {
                limitHost.value = String(state.limit);
                limitHost.addEventListener("change", () => { state.limit = Number(limitHost.value) || 10; state.page = 0; draw(); });
                enhanceCustomSelects(content);
            }
            content.querySelector("#lb-prev")?.addEventListener("click",()=>{state.page--;draw();});
            content.querySelector("#lb-next")?.addEventListener("click",()=>{state.page++;draw();});
        };
        draw();
    };
    root.querySelectorAll("[data-lb-module]").forEach(btn => btn.addEventListener("click", e => {
        root.querySelectorAll("[data-lb-module]").forEach(x => x.classList.remove("active"));
        e.currentTarget.classList.add("active");
        const m = mods.find(x => x.id === e.currentTarget.dataset.lbModule);
        if (m) paint(m);
    }));
    if (mods[0]) paint(mods[0]);
    root.querySelector("#lb-main-menu")?.addEventListener("click", () => { routes.go("/", true, true); void renderFromRoute(); });
    root.querySelector("#lb-back-server")?.addEventListener("click", () => { if (currentGuild?.id) { const back = currentPanelId && !["leaderboards","docs","status"].includes(currentPanelId) ? currentPanelId : "ticket-tool"; if (routes.go(routes.moduleUrl(currentGuild.id, back, currentTab)) === false) return; void enterDashboard(back, { tab: currentTab }); } });
        const refreshButton = root.querySelector("#lb-refresh");
    if (refreshButton) {
        // Global wall-clock timer: it does not restart when a user opens Leaderboards.
        const GLOBAL_LEADERBOARD_INTERVAL_MS = 30 * 60 * 1000;
        const getGlobalRemaining = () => Math.max(1, Math.ceil((GLOBAL_LEADERBOARD_INTERVAL_MS - (Date.now() % GLOBAL_LEADERBOARD_INTERVAL_MS)) / 1000));
        let remaining = getGlobalRemaining();
        const paintCountdown = () => {
            const label = root.querySelector("#lb-refresh-label");
            if (label) {
                const m=Math.floor(remaining/60), sec=remaining%60;
                label.textContent = `Next update ${m}m${sec?` ${sec}s`:""}`;
            }
        };
        paintCountdown();
        if (root._lbRefreshTimer) clearInterval(root._lbRefreshTimer);
        root._lbRefreshTimer=setInterval(async()=>{
            if (!document.body.contains(root)){clearInterval(root._lbRefreshTimer);return;}
            const next = getGlobalRemaining();
            if (next > 1) { remaining = next; paintCountdown(); return; }
            remaining = next; paintCountdown();
            try{
                const fresh=await api("/leaderboards");
                localStorage.setItem(key,JSON.stringify(fresh));localStorage.setItem(at,String(Date.now()));
                const active=root.querySelector("[data-lb-module].active")?.dataset.lbModule;
                const m2=(fresh.modules||[]).find(x=>x.id===active)||(fresh.modules||[])[0];
                if(m2){root.querySelectorAll("[data-lb-module]").forEach(x=>x.classList.toggle("active",x.dataset.lbModule===m2.id));paint(m2);}
            }catch{}
            remaining = getGlobalRemaining();
            paintCountdown();
        },1000);
    }
}
if (!document.getElementById("nexoria-server-member-count-style")) {
  const style = document.createElement("style");
  style.id = "nexoria-server-member-count-style";
  style.textContent = `.server-switch-name-wrap{min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:2px}.server-switch-member-count{font-size:10px;color:var(--muted,#8f96b3);font-weight:600;line-height:1.2}.server-switch-item .server-role-tag{margin-left:0}`;
  document.head.appendChild(style);
}
async function renderDashboardPanel(root, renderGeneration = pickerPanelRenderGeneration) {
    if (!pickerPanelIsCurrent(renderGeneration, "dashboard")) return;
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
    <div class="server-grid server-grid-loading" id="server-grid">${serverLoadingMarkup("grabbing")}</div>`;
    const grid = document.getElementById("server-grid");
    const countEl = document.getElementById("ds-count");
    const session = getSession();
    let sorted = [];
    function cardHtml(g, hasBot) {
        const iconHtml = guildIconHtml({ ...g, name: g?.name || g?.guildName || "Unknown Server" }, "server-icon-image", 128);
        const roleBadge = g.viewerRole === "co-owner" ? `<span class="role-badge co-owner"><i class="ti ti-crown"></i> Co-Owner</span>` : g.viewerRole === "owner" ? `<span class="role-badge owner"><i class="ti ti-crown"></i> Owner</span>` : ["admin","trusted-admin","bot-owner"].includes(String(g.viewerRole || "")) ? `<span class="role-badge admin"><i class="ti ti-shield"></i> Admin</span>` : "";
        return `
      <div class="server-card ${hasBot ? "" : "bot-absent"}" data-server-name="${escapeHtml(g.name.toLowerCase())}">
        <div class="server-icon">${iconHtml}</div>
        <div class="server-name">${escapeHtml(g.name || g.guildName || "Unknown Server")}</div>
        <div class="server-meta">${roleBadge} · ${(Number(g.memberCount) || 0).toLocaleString()} member${(Number(g.memberCount) || 0) === 1 ? "" : "s"} ${hasBot ? "" : "· Bot not added"}</div>
        <div class="server-card-actions">
          ${hasBot
            ? (g.viewerRole ? `<button class="btn btn-primary btn-small" data-open-dash="${g.id}" data-name="${escapeHtml(g.name)}" data-icon="${g.icon || ""}">Manage Server</button>` : `<button class="btn btn-ghost btn-small" disabled title="You do not have dashboard access">No access</button>`)
            : `<a class="btn btn-primary btn-small" target="_blank" rel="noopener" href="${inviteUrl(g.id)}">${icon("plus")} Begin setup</a>`}
        </div>
      </div>`;
    }
    function wireDashButtons() {
        grid.querySelectorAll("[data-open-dash]").forEach(btn => {
            btn.addEventListener("click", async () => {
                try {
                    const meta = await api(`/guilds/${encodeURIComponent(btn.dataset.openDash)}/meta?userId=${encodeURIComponent(session.user.id)}`);
                    const discordGuild = (discordGuildCache || []).find(g => String(g.id) === String(btn.dataset.openDash));
                    if (!meta.canViewDashboard) {
                        await DCModal.alert("Tell the server owner to open Manage Servers, then open General Settings and allow you to use the server dashboard.", { title: "Dashboard access required" });
                        return;
                    }
                }
                catch {
                    await DCModal.alert("Couldn't verify your server dashboard permissions. Please retry.", { title: "Permission check failed" });
                    return;
                }
                if (window.DC?.pageDirty) {
                    const ok = await DCModal.confirm(`You have ${escapeHtml(window.DC.pageDirtyReason || "unsaved changes")}. Are you sure you want to leave without saving?`, { title:"Leave without saving?", confirmLabel:"Leave without saving", cancelLabel:"Stay", danger:true }).catch(() => false);
                    if (!ok) return;
                    window.DC.clearPageDirty();
                }
                currentGuild = { id: btn.dataset.openDash, name: btn.dataset.name, icon: btn.dataset.icon };
                if (routes.go(routes.moduleUrl(currentGuild.id, "ticket-tool")) === false) return;
                enterDashboard("ticket-tool");
            });
        });
    }
    async function loadAndPaint() {
        const freshGuilds = await fetchMyGuilds(session.token);
        if (!pickerPanelIsCurrent(renderGeneration, "dashboard")) return false;
        // As soon as Discord has returned the guild list, render the cards. Access
        // validation happens in parallel; the user should never stare at an empty
        // page while the validation requests are still running.
        const botGuildIdsPreview = new Set((botInfoCache?.guilds || []).map(g => g.id));
        const initialPreview = [...freshGuilds].sort(sortViewerGuilds);
        grid.classList.remove("server-grid-loading");
        grid.innerHTML = `<div class="server-validation-preview"><div class="server-validation-status">${serverLoadingMarkup("validating", true)}</div><div class="server-validation-cards server-validation-cards-live">${initialPreview.map(g=>cardHtml(g,botGuildIdsPreview.has(g.id))).join("")}</div></div>`;
        setServerLoadingStage(grid, "validating");
        const accessible = await fetchAccessibleBotGuilds();
        if (!pickerPanelIsCurrent(renderGeneration, "dashboard")) return false;
        discordGuildCache = mergeAccessibleGuilds(freshGuilds, accessible);
        const accessibleIds = new Set(accessible.map(g => String(g.id)));
        const preview = [...discordGuildCache.filter(g => accessibleIds.has(String(g.id)) || (isAdmin(g) && !botGuildIdsPreview.has(g.id)))].sort(sortViewerGuilds);
        // Replace the provisional OAuth list with the validated candidate set, but
        // keep it visible while each /meta request is being checked. The final
        // ordered list is rendered only after every validation worker completes.
        grid.innerHTML = `<div class="server-validation-preview"><div class="server-validation-status">${serverLoadingMarkup("validating", true)}</div><div class="server-validation-cards server-validation-cards-live">${preview.map(g=>cardHtml(g,botGuildIdsPreview.has(g.id))).join("")}</div></div>`;
        // Do real server validation before ending the loading state. No fixed delay
        // is used; validation finishes only after all candidates have been checked
        // and the final list can be sorted once, so it never visibly reorders later.
        const validated = [];
        const queue = [...preview];
        const workers = Array.from({length: Math.min(6, Math.max(1, queue.length))}, async () => {
            while (queue.length) {
                const g = queue.shift();
                // Servers where NEXORIA is not installed do not have a /meta route.
                // Keep those cards immediately available for setup instead of firing
                // guaranteed 404 requests and filling the console with false errors.
                if (!botGuildIdsPreview.has(String(g.id))) {
                    validated.push(g);
                    continue;
                }
                try {
                    const meta = await api(`/guilds/${encodeURIComponent(g.id)}/meta?userId=${encodeURIComponent(session.user.id)}`);
                    validated.push({...g, ...meta, viewerRole: meta?.viewerRole || g.viewerRole || null});
                } catch {
                    validated.push(g);
                }
            }
        });
        await Promise.all(workers);
        if (!pickerPanelIsCurrent(renderGeneration, "dashboard")) return false;
        const admin = validated.filter(g => accessibleIds.has(String(g.id)) || isAdmin(g));
        if (admin.length === 0) {
            grid.innerHTML = `<div class="empty-state"><i class="ti ti-folder-off glyph"></i>No servers found that you can manage with NEXORIA.</div>`;
            countEl.textContent = "";
            return true;
        }
        const botGuildIds = new Set((botInfoCache?.guilds || []).map(g => g.id));
        sorted = [...admin].sort(sortViewerGuilds);
        const activeCount = sorted.filter(g => botGuildIds.has(g.id)).length;
        countEl.textContent = `${activeCount} active · ${sorted.length} available`;
        grid.classList.remove("server-grid-loading");
        grid.innerHTML = sorted.map(g => cardHtml(g, botGuildIds.has(g.id))).join("");
        // Validation is now genuinely complete: the cards are loaded, validated,
        // and ordered before the validating indicator disappears.
        const validationStatus = grid.querySelector(".server-validation-status");
        if (validationStatus) validationStatus.remove();
        wireDashButtons();
        return true;
        }
    try {
        setServerLoadingStage(grid, "grabbing");
        const painted = await loadAndPaint();
        if (!pickerPanelIsCurrent(renderGeneration, "dashboard") || painted === false) return;
    }
    catch (e) {
        if (!pickerPanelIsCurrent(renderGeneration, "dashboard")) return;
        grid.innerHTML = `<div class="empty-state"><i class="ti ti-alert-triangle glyph"></i>${escapeHtml(e.message || "Couldn't load your servers.")}<div style="margin-top:12px"><button class="btn btn-primary btn-small" id="ds-retry-btn">Try again</button></div></div>`;
        countEl.textContent = "";
        document.getElementById("ds-retry-btn")?.addEventListener("click", () => { pickerActivePanel = "dashboard"; void renderPickerPanelGuarded("dashboard"); });
        return;
    }
    document.getElementById("ds-search")?.addEventListener("input", (e) => {
        const q = e.target.value.trim().toLowerCase();
        grid.querySelectorAll(".server-card[data-server-name]").forEach(card => {
            card.style.display = card.dataset.serverName.includes(q) ? "" : "none";
        });
    });
    if (root._serverRefreshTimer) clearInterval(root._serverRefreshTimer);
    root._serverRefreshTimer = setInterval(async () => {
        if (!document.body.contains(root) || !pickerPanelIsCurrent(renderGeneration, "dashboard")) { clearInterval(root._serverRefreshTimer); root._serverRefreshTimer = null; return; }
        try { await loadAndPaint(); } catch (e) { console.debug("[servers] automatic refresh failed:", e?.message || e); }
    }, Math.max(1000, getRefreshPrefs().serversSeconds * 1000));
    const refreshBtn = document.getElementById("ds-refresh-btn");
    refreshBtn?.addEventListener("click", async () => {
        refreshBtn.disabled = true;
        refreshBtn.classList.add("btn-refreshing");
        try {
            setServerLoadingStage(grid, "grabbing");
            await refreshHeroStatus();
            await serverValidationDelay(450);
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

async function startVerificationRobloxOAuth(guildId, share = true) {
    const session = getSession();
    if (!session?.token) throw new Error("Discord login is required before starting verification.");
    const cfg = await api("/oauth/roblox/config");
    const auth = new URL(cfg.authorizationEndpoint || "https://apis.roblox.com/oauth/v1/authorize");
    const redirect = new URL(cfg.redirectUri || `${window.location.origin}${getSiteBasePath()}`, window.location.origin);
    const bytes = crypto.getRandomValues(new Uint8Array(64));
    const verifier = base64url(bytes);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    const challenge = base64url(digest);
    const state = `rbx_${crypto.randomUUID()}`;
    const scopes = Array.isArray(cfg.scopes) && cfg.scopes.length ? cfg.scopes : ["openid", "profile", "game-pass:read", "group-forum:read", "group:read", "user.inventory-item:read"];
    const returnPath = `/profile/?settings=integrations&integration=roblox&verification=1&guildId=${encodeURIComponent(guildId)}`;
    sessionStorage.setItem("nexoria_roblox_oauth", JSON.stringify({
        verifier, state, discordUserId: session.user.id, redirectUri: redirect.toString(), scopes,
        verificationGuildId: String(guildId), verificationFlow: true, share: share !== false, createdAt: Date.now()
    }));
    sessionStorage.setItem("nexoria_roblox_return_path", returnPath);
    auth.searchParams.set("client_id", cfg.clientId);
    auth.searchParams.set("redirect_uri", redirect.toString());
    auth.searchParams.set("scope", scopes.join(" "));
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("code_challenge", challenge);
    auth.searchParams.set("code_challenge_method", "S256");
    auth.searchParams.set("state", state);
    window.location.href = auth.toString();
}

async function renderVerificationPage(route) {
    const root=document.getElementById("picker-panel-root");
    if(!root) return;
    const guildId=String(route.guildId||"");
    root.innerHTML=`<div class="dash-header"><div><h1 class="picker-heading">NEXORIA Roblox Verification</h1><p class="picker-sub">Official Roblox verification by NEXORIA.</p></div></div><div class="verification-page" id="verification-page-root"><div class="empty-state">${icon("shield-check",20)} Loading verification…</div></div>`;
    const box=root.querySelector("#verification-page-root");
    if(!guildId){box.innerHTML=`<div class="empty-state">This verification link is missing the server ID.</div>`;return;}
    const session=getSession();
    if(!session?.token){
        box.innerHTML=`<div class="config-section verification-web-card"><div class="verification-brand">${icon("shield-check",24)} <span>NEXORIA Official Roblox Verification</span></div><h2>Sign in with Discord first</h2><p class="hint">NEXORIA must confirm which Discord account is being verified. No email address is shown to the server owner.</p><button class="btn btn-primary" id="verification-discord-login">${icon("discord")} Continue with Discord</button></div>`;
        box.querySelector("#verification-discord-login")?.addEventListener("click",async()=>{try{await beginLogin({silent:false,redirectPath:`/verify?guildId=${encodeURIComponent(guildId)}${route.start?"&start=1":(route.share?"&start=1":"")}`,userInitiated:true});}catch(e){await DCModal.alert(e.message,{title:"Discord login failed"});}});
        return;
    }
    let me;
    try { me=await api(`/guilds/${encodeURIComponent(guildId)}/verification/me?userId=${encodeURIComponent(session.user.id)}`); }
    catch(e){box.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`;return;}
    if(!me.enabled){
        box.innerHTML=`<div class="config-section verification-web-card"><div class="verification-brand">${icon("shield-check",24)} <span>NEXORIA Official Roblox Verification</span></div><h2>Roblox Verification is not enabled</h2><p class="hint">The owner of this server has not enabled NEXORIA verification yet.</p></div>`;
        return;
    }
    if(route.start && !me.verified && !sessionStorage.getItem(`nexoria_verification_auto_started_${guildId}`)){
        sessionStorage.setItem(`nexoria_verification_auto_started_${guildId}`,"1");
        try { await startVerificationRobloxOAuth(guildId, true); return; }
        catch(e){ sessionStorage.removeItem(`nexoria_verification_auto_started_${guildId}`); await DCModal.alert(e.message||"Could not start Roblox authorization",{title:"Roblox authorization failed"}); }
    }
    if(me.verified && me.record){
        box.innerHTML=`<div class="config-section verification-web-card"><div class="verification-success-mark">✓</div><div class="verification-brand">${icon("shield-check",24)} <span>NEXORIA Official Roblox Verification</span></div><h2>Roblox Verification already complete</h2><p class="hint">You are already verified in this server, so there is nothing else to verify here.</p><div class="verification-account-preview">${me.record.robloxAvatarUrl?`<img src="${escapeHtml(me.record.robloxAvatarUrl)}" alt="">`:icon("roblox",22)}<div><strong>${escapeHtml(me.record.robloxUsername||me.record.robloxDisplayName||me.record.robloxId)}</strong><span>Verified ${escapeHtml(formatDirectoryDate(me.record.verifiedAt))}</span></div></div><div class="verification-actions"><a class="btn btn-primary" href="${escapeHtml(getSiteBasePath())}/profile/?settings=integrations">Open User Settings</a></div><div class="field-hint" style="margin-top:12px">You can change your main Roblox account from User Settings → Integrations → Roblox.</div></div>`;
        return;
    }
    let candidates;
    try { candidates=await api(`/guilds/${encodeURIComponent(guildId)}/verification/candidates?userId=${encodeURIComponent(session.user.id)}`); }
    catch(e){box.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`;return;}
    const accounts=candidates?.accounts||[];
    const primary=accounts.find(a=>a.primary) || accounts[0] || null;
    box.innerHTML=`<div class="config-section verification-web-card"><div class="verification-brand">${icon("shield-check",24)} <span>NEXORIA Official Roblox Verification</span></div><div class="verification-step"><span class="verification-step-number">1</span><div><strong>Discord account confirmed</strong><div class="hint">${escapeHtml(session.user.globalName||session.user.username||session.user.id)}</div></div></div><div class="verification-step"><span class="verification-step-number">2</span><div><strong>Connect your Roblox account</strong><div class="hint">NEXORIA will send you through Roblox OAuth. After Roblox is connected, return to Discord and click <b>Complete Roblox Verification</b>.</div></div></div>${primary?`<div class="verification-account-preview" style="margin-top:14px">${primary.avatarUrl?`<img src="${escapeHtml(primary.avatarUrl)}" alt="">`:icon("roblox",22)}<div><strong>${escapeHtml(primary.username||primary.displayName||primary.id)}</strong><span>${primary.primary?"Main Roblox account":"Connected Roblox account"}</span></div></div>`:`<div class="empty-state" style="margin-top:12px">No Roblox account is connected yet.</div>`}<div class="verification-actions" style="margin-top:14px"><button class="btn btn-primary" id="verification-connect-roblox">${icon("roblox")} Connect / verify with Roblox</button><a class="btn btn-ghost" href="${escapeHtml(getSiteBasePath())}/profile/?settings=integrations">Open User Settings</a></div><div class="field-hint" id="verification-feedback" style="margin-top:10px">If you already have Roblox connected, you can manage your main account in User Settings.</div></div>`;
    box.querySelector("#verification-connect-roblox")?.addEventListener("click",async()=>{
        const b=box.querySelector("#verification-connect-roblox");
        b.disabled=true;b.textContent="Opening Roblox…";
        try { await startVerificationRobloxOAuth(guildId, route.share !== false); }
        catch(e) { b.disabled=false;b.innerHTML=`${icon("roblox")} Connect / verify with Roblox`; await DCModal.alert(e.message,{title:"Could not start Roblox verification"}); }
    });
    // The Discord verification button is the start of the flow. After Discord
    // authorization, automatically continue into Roblox OAuth once so the user
    // is not left on an intermediate page wondering what to click next.
    if((route.share || route.start) && !sessionStorage.getItem(`nexoria_verification_auto_started_${guildId}`)){
        sessionStorage.setItem(`nexoria_verification_auto_started_${guildId}`,"1");
        setTimeout(async()=>{
            try { await startVerificationRobloxOAuth(guildId, true); }
            catch(e) { sessionStorage.removeItem(`nexoria_verification_auto_started_${guildId}`); await DCModal.alert(e.message,{title:"Could not start Roblox verification"}); }
        }, 150);
    }
}

function renderPremiumPanel(root) {
    root.innerHTML = `
    <h1 class="picker-heading">Premium</h1>
    <p class="picker-sub">Unlock higher limits and advanced features across every server.</p>
    <div class="empty-state"><i class="ti ti-crown glyph"></i>Premium plans aren't set up yet — check back soon.</div>`;
}


async function loadVerificationServers() {
    const list=document.getElementById("roblox-verification-server-list");
    const unverifyAll=document.getElementById("roblox-unverify-all");
    if(!list)return;
    try{
        const d=await api("/profile/verification/servers");
        const servers=Array.isArray(d?.servers)?d.servers:[];
        if(!servers.length){list.innerHTML='<div class="connected-empty">You are not currently verified in any NEXORIA server.</div>';if(unverifyAll)unverifyAll.style.display="none";return;}
        list.innerHTML=servers.map(x=>`<div class="nx-verification-server-row"><div class="nx-verification-server-icon">${guildIconHtml({id:x.guildId,name:x.guildName||"Unknown Server",iconUrl:x.guildIconUrl,icon:x.guildIcon},"nx-verification-server-icon-img",96)}</div><div class="nx-verification-server-copy"><strong>${escapeHtml(x.guildName||"Unknown Server")}</strong><span>${escapeHtml(x.robloxUsername||"Roblox account")} · Verified ${escapeHtml(formatDirectoryDate(x.verifiedAt))}</span></div><button type="button" class="integration-btn integration-btn-danger nx-verification-unverify" data-guild-id="${escapeHtml(x.guildId)}">Unverify</button></div>`).join("");
        if(unverifyAll){unverifyAll.style.display="inline-flex";unverifyAll.onclick=async()=>{unverifyAll.disabled=true;unverifyAll.textContent="Unverifying…";try{await api("/profile/verification/unverify-all",{method:"POST",body:JSON.stringify({})});await loadVerificationServers();}catch(e){await DCModal.alert(e.message,{title:"Couldn't unverify servers"});}finally{unverifyAll.disabled=false;unverifyAll.textContent="Unverify in all servers";}};}
        list.querySelectorAll(".nx-verification-unverify").forEach(btn=>btn.addEventListener("click",async()=>{const guildId=String(btn.dataset.guildId||"");if(!guildId)return;btn.disabled=true;btn.textContent="Unverifying…";try{await api(`/guilds/${encodeURIComponent(guildId)}/verification/unverify`,{method:"POST",body:JSON.stringify({userId:getSession()?.user?.id||""})});await loadVerificationServers();}catch(e){btn.disabled=false;btn.textContent="Unverify";await DCModal.alert(e.message,{title:"Couldn't unverify"});}}));
    }catch(e){list.innerHTML='<div class="connected-empty">Could not load verified servers.</div>';if(unverifyAll)unverifyAll.style.display="none";}
}

async function renderProfileSettings(root) {
    // User Settings always has a canonical trailing-slash URL so deep links
    // Canonical User Settings URLs: always use /profile/?settings=<section>.
    // An integration query takes precedence over an older settings=profile query
    // so links such as /profile/?integration=roblox&settings=profile open Roblox
    // Integrations rather than the Profile section.
    try {
        const u=new URL(window.location.href);
        const base=getSiteBasePath().replace(/\/+$/,'');
        const profilePath=`${base}/profile/`;
        if (u.pathname === `${base}/profile` || u.pathname === `${base}/integrations` || u.pathname === `${base}/settings` || u.pathname === profilePath) {
            const forcedIntegration=u.searchParams.has("integration");
            const section=forcedIntegration ? "integrations" : (u.searchParams.get("settings") || (u.pathname.endsWith("/integrations") ? "integrations" : "profile"));
            u.pathname=profilePath;
            u.searchParams.set("settings",section);
            if (forcedIntegration) u.searchParams.set("settings","integrations");
            window.history.replaceState({},"",u.pathname+u.search+u.hash);
        }
    } catch {}
    const session = getSession();
    const discordName = session.user.globalName || session.user.username || "Discord account";
    const discordAvatar = avatarUrl(session.user);
    root.innerHTML = `<div class="dash-header"><div><h1 class="picker-heading">User Settings</h1><p class="picker-sub">Customize your NEXORIA account and connected services.</p></div></div>
      <div class="nx-settings-layout" id="user-settings-panel">
        <aside class="nx-settings-nav" aria-label="User settings">
          <div class="nx-settings-nav-title">USER SETTINGS</div>
          <button type="button" class="nx-settings-nav-item active" data-settings-section="profile">${icon("profile",16)}<span>Profile</span><span class="nx-settings-nav-chevron">›</span></button>
          <button type="button" class="nx-settings-nav-item" data-settings-section="appearance">${icon("theme-system",16)}<span>Appearance</span><span class="nx-settings-nav-chevron">›</span></button>
          <button type="button" class="nx-settings-nav-item" data-settings-section="integrations">${icon("link",16)}<span>Integrations</span><span class="nx-settings-nav-chevron">›</span></button>
          <button type="button" class="nx-settings-nav-item" data-settings-section="notifications">${icon("bell",16)}<span>Notifications</span><span class="nx-settings-nav-chevron">›</span></button>
          <div class="nx-settings-nav-note">Theme and language are managed inside Appearance. Notification preferences only affect your own NEXORIA account.</div>
        </aside>
        <main class="nx-settings-content">
        <section class="config-section user-settings-section nx-settings-section" data-settings-content="profile">
          <div class="config-section-title">Public profile</div>
          <div class="profile-visibility-row"><div class="profile-visibility-copy"><strong>Show me on the public Support Staff leaderboard</strong><div class="hint">When enabled, your Discord username and profile picture may appear on NEXORIA's public Support Staff leaderboard. It is off by default.</div></div><button type="button" class="nx-switch" id="public-support-leaderboard-toggle" role="switch" aria-checked="false"><span class="nx-switch-track"><span class="nx-switch-thumb"></span></span><span class="nx-switch-label">Hidden</span></button></div>
          <div class="field-hint" id="public-support-leaderboard-status" style="margin-top:8px"></div>
          <div class="profile-visibility-row nx-auto-verify-row" style="margin-top:16px"><div class="profile-visibility-copy"><strong>Automatically verify me when I join NEXORIA servers</strong><div class="hint">When enabled, NEXORIA uses your connected main Roblox account to automatically verify you when you join a server that has NEXORIA Roblox Verification enabled. If you verify through a DM, NEXORIA will also use this setting for future server joins.</div></div><button type="button" class="nx-switch" id="auto-verify-on-join-toggle" role="switch" aria-checked="false"><span class="nx-switch-track"><span class="nx-switch-thumb"></span></span><span class="nx-switch-label">Disabled</span></button></div>
          <div class="field-hint" id="auto-verify-on-join-status" style="margin-top:8px"></div>
        </section>

        <section class="config-section user-settings-section nx-settings-section" data-settings-content="appearance">
          <div class="config-section-title">Appearance &amp; Language</div>
          <div class="nx-preferences-grid">
            <div class="nx-preference-card"><div><strong>Theme</strong><span>Choose how NEXORIA looks on this device.</span></div><select id="nx-theme-setting" class="search-input"><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></div>
            <div class="nx-preference-card"><div><strong>Language</strong><span>Choose the language used by the NEXORIA website.</span></div><select id="nx-language-setting" class="search-input"><option value="en">English</option></select></div>
          </div>
          <div class="field-hint" id="nx-language-hint" style="margin-top:10px">Language packs are managed by NEXORIA. New languages will appear here when available.</div>
        </section>

        <section class="config-section user-settings-section nx-settings-section" data-settings-content="notifications">
          <div class="config-section-title">Notifications</div>
          <p class="hint" style="margin:-2px 0 14px">Choose which private Discord messages NEXORIA may send to your account. These settings only affect your own account.</p>
          ${[["moderation-warning-dm-toggle","Moderation warning DMs","When a NEXORIA server warns you, receive the warning reason, case link and active warning count."],["announcement-dm-toggle","Official announcement DMs","Receive official NEXORIA announcements privately when an announcement is sent to your account."],["ticket-closing-dm-toggle","Ticket closing DMs","Receive the private ticket-closed message and review link when your ticket closes."],["honeypot-dm-toggle","Honeypot action DMs","Receive a private message when a Honeypot action affects you."],["verification-dm-toggle","Verification DMs","Receive private NEXORIA verification and account-linking messages."],["ticket-staff-reply-dm-toggle","Ticket staff reply DMs","Receive optional private notifications when staff reply to a ticket." ]].map(([id,title,hint])=>`<div class="profile-visibility-row nx-notification-row"><div class="profile-visibility-copy"><strong>${title}</strong><div class="hint">${hint}</div></div><button type="button" class="nx-switch" id="${id}" role="switch" aria-checked="true"><span class="nx-switch-track"><span class="nx-switch-thumb"></span></span><span class="nx-switch-label">Enabled</span></button></div><div class="field-hint nx-notification-status" id="${id}-status"></div>`).join("")}
        </section>

        <section class="integrations-section nx-settings-section" data-settings-content="integrations">
          <div class="integrations-heading">
            <div>
              <div class="integrations-eyebrow">Connections</div>
              <h2>Integrations</h2>
              <p>Connect external accounts to unlock features and keep your NEXORIA profile linked. Email is optional and can be verified with your configured mail provider.</p>
            </div>
            <div class="integrations-count"><span class="integrations-count-dot"></span><span id="integration-count-text">Checking connections…</span></div>
          </div>

          <div class="primary-account-panel" id="primary-account-panel">
            <div class="primary-account-heading"><div><strong>Main accounts</strong><span>Choose which connected Discord, email, and Roblox accounts NEXORIA should use as your primary identity.</span></div></div>
            <div class="primary-account-grid">
              <div class="primary-account-item" id="primary-discord-item"><span class="primary-account-type">Discord</span><span class="primary-account-value">Loading…</span></div>
              <div class="primary-account-item" id="primary-email-item"><span class="primary-account-type">Email</span><span class="primary-account-value">Loading…</span></div>
              <div class="primary-account-item" id="primary-roblox-item"><span class="primary-account-type">Roblox</span><span class="primary-account-value">Loading…</span></div>
            </div>
            <div class="field-hint" style="margin-top:10px">Your main Roblox account is the account NEXORIA will prefer for Roblox-linked features and verification.</div>
          </div>

          <div class="integration-help-banner">
            <div><strong>Need help with an integration or verification?</strong><span>Join the NEXORIA Community server and make a ticket for support.</span></div>
            <a class="integration-btn integration-btn-primary" href="${escapeHtml(CFG?.DISCORD_SUPPORT_URL || CFG?.DISCORD_SERVER_LINK || "https://discord.gg/qrMmetkGvk")}" target="_blank" rel="noopener">Join NEXORIA Community <span class="integration-btn-arrow">↗</span></a>
          </div>

          <div class="integration-grid">
            <section class="integration-card integration-card-discord" aria-label="Discord integration">
              <div class="integration-card-glow"></div>
              <div class="integration-card-top">
                <div class="integration-brand-row">
                  <div class="integration-brand-icon integration-brand-discord">${icon("discord")}</div>
                  <div><div class="integration-brand-name">Discord</div><div class="integration-brand-sub">NEXORIA account</div></div>
                </div>
                <span class="integration-status integration-status-linked" id="discord-integration-status"><span class="integration-status-dot"></span>Checking…</span>
              </div>
              <div class="integration-connected-user">
                <img src="${escapeHtml(discordAvatar)}" alt="" loading="lazy" onerror="this.onerror=null;this.style.opacity='.25';">
                <div><strong>${escapeHtml(discordName)}</strong><span>Signed in with Discord</span></div>
              </div>
              <div class="integration-card-footer" id="discord-integration-footer"><span class="integration-check">✓</span> Your Discord identity is connected to this NEXORIA session.</div>
              <div class="integration-actions" id="discord-integration-actions"><button class="integration-btn integration-btn-primary" id="discord-link-btn"><span>Connect another Discord account</span><span class="integration-btn-arrow">→</span></button><div id="discord-linked-list" class="integration-secondary-actions"></div></div>
            </section>

            <section class="integration-card integration-card-email" id="email-integration-card" aria-label="Email integration">
              <div class="integration-card-glow"></div>
              <div class="integration-card-top">
                <div class="integration-brand-row"><div class="integration-brand-icon integration-brand-email">${icon("mail")}</div><div><div class="integration-brand-name">Email</div><div class="integration-brand-sub">Announcements &amp; account recovery</div></div></div>
                <span class="integration-status integration-status-loading" id="email-integration-status"><span class="integration-status-dot"></span>Checking…</span>
              </div>
              <div class="integration-account-row" id="email-integration-account"><div class="integration-account-avatar integration-account-avatar-placeholder">${icon("mail",18)}</div><div><strong>Checking email</strong><span>Looking for a verified email address…</span></div></div><div class="integration-benefit">Get NEXORIA announcements by email. If a message lands in spam/junk, mark it as <b>Not spam</b> so future NEXORIA emails can reach your inbox.</div>
              <div class="integration-actions" id="email-integration-actions"></div>
            </section>

            <section class="integration-card integration-card-roblox" id="roblox-integration-card" aria-label="Roblox integration">
              <div class="integration-card-glow"></div>
              <div class="integration-card-top">
                <div class="integration-brand-row">
                  <div class="integration-brand-icon integration-brand-roblox">${icon("roblox")}</div>
                  <div><div class="integration-brand-name">Roblox</div><div class="integration-brand-sub">Roblox identity &amp; account linking</div></div>
                </div>
                <span class="integration-status integration-status-loading" id="roblox-integration-status"><span class="integration-status-dot"></span>Checking…</span>
              </div>
              <div class="integration-account-row" id="roblox-integration-account"><div class="integration-account-avatar integration-account-avatar-placeholder">${icon("user",18)}</div><div><strong>Checking connection</strong><span>Looking for a linked Roblox account…</span></div></div><div class="integration-benefit">Linking Roblox lets NEXORIA associate your Roblox identity with your Discord/NEXORIA account for Roblox-linked features.</div>
              <div class="integration-actions" id="roblox-integration-actions"></div>
              <div class="roblox-verification-servers" id="roblox-verification-servers"><div class="config-section-title" style="margin-top:14px">Verified servers</div><div class="hint">Choose which servers you want to stay verified in. You can remove verification from an individual server or everywhere.</div><div id="roblox-verification-server-list" style="margin-top:10px"></div><button class="integration-btn integration-btn-danger" id="roblox-unverify-all" style="margin-top:10px;display:none">Unverify in all servers</button></div>
            </section>
          </div>
        </section>
        </main>
      </div>`;

    const settingsNav = root.querySelectorAll("[data-settings-section]");
    const settingsSections = root.querySelectorAll("[data-settings-content]");
    function switchUserSettingsSection(section){
        const target=["profile","appearance","integrations","notifications"].includes(String(section))?String(section):"profile";
        settingsNav.forEach(btn=>btn.classList.toggle("active",btn.dataset.settingsSection===target));
        settingsSections.forEach(el=>el.classList.toggle("active",el.dataset.settingsContent===target));
    }
    settingsNav.forEach(btn=>btn.addEventListener("click",()=>{
        const section=String(btn.dataset.settingsSection||"profile");
        switchUserSettingsSection(section);
        const params=new URLSearchParams();
        params.set("settings",section);
        if(routes.go(`/profile/?${params.toString()}`) !== false) {
            __lastRouteUrl=window.location.href;
        }
    }));
    const profileParams=new URLSearchParams(window.location.search); const requestedSettingsSection=profileParams.get("integration")?"integrations":(profileParams.get("settings")||"profile");
    switchUserSettingsSection(requestedSettingsSection);

    const integrationState = { discord: true, email: false, roblox: false };
    function updateIntegrationCount() {
        const el = document.getElementById("integration-count-text");
        if (el) el.textContent = `${Object.values(integrationState).filter(Boolean).length} of 3 connected`;
    }

    const themeSetting = document.getElementById("nx-theme-setting");
    const languageSetting = document.getElementById("nx-language-setting");
    if (themeSetting) { themeSetting.value = getThemePreference(); themeSetting.addEventListener("change", () => applyTheme(themeSetting.value)); }
    if (languageSetting) {
        languageSetting.value = localStorage.getItem(LS.language) || "en";
        fetch(versionedAsset(siteAsset("languages/languages.json")), { cache:"no-store" }).then(r=>r.ok?r.json():null).then(bundle=>{
            const languages=Array.isArray(bundle?.languages)?bundle.languages:[];
            if (!languages.length) return;
            languageSetting.innerHTML=languages.map(l=>`<option value="${escapeHtml(l.id)}">${escapeHtml(l.name || l.id)}</option>`).join("");
            languageSetting.value=localStorage.getItem(LS.language) || bundle.default || "en";
        }).catch(()=>{});
        languageSetting.addEventListener("change",()=>{ localStorage.setItem(LS.language, languageSetting.value || "en"); document.documentElement.lang=languageSetting.value || "en"; window.NEXORIA_LANGUAGE=languageSetting.value || "en"; window.dispatchEvent(new CustomEvent("nexoria:language-ready",{detail:{language:languageSetting.value||"en"}})); });
    }

    async function loadSettings() {
        const toggle = document.getElementById("public-support-leaderboard-toggle");
        const status = document.getElementById("public-support-leaderboard-status");
        try {
            const d = await api(`/profile/settings?discordUserId=${encodeURIComponent(session.user.id)}`);
            const notificationDefs = [
                ["moderation-warning-dm-toggle","moderationWarningDMs","Moderation warning DMs"],["announcement-dm-toggle","announcementDMs","Official announcement DMs"],["ticket-closing-dm-toggle","ticketClosingDMs","Ticket closing DMs"],["honeypot-dm-toggle","honeypotDMs","Honeypot action DMs"],["verification-dm-toggle","verificationDMs","Verification DMs"],["ticket-staff-reply-dm-toggle","ticketStaffReplyDMs","Ticket staff reply DMs"]
            ];
            notificationDefs.forEach(([id,key,label])=>{const el=document.getElementById(id),st=document.getElementById(id+"-status"),enabled=d.settings?.[key]!==false;if(el){el.dataset.enabled=String(enabled);el.setAttribute("aria-checked",String(enabled));el.classList.toggle("on",enabled);el.querySelector(".nx-switch-label").textContent=enabled?"Enabled":"Disabled";}if(st)st.textContent=enabled?`${label} are enabled.`:`${label} are disabled.`;});
            const visible = d.settings?.publicSupportLeaderboard === true;
        const autoVerifyToggle = document.getElementById("auto-verify-on-join-toggle");
            const autoVerifyStatus = document.getElementById("auto-verify-on-join-status");
            const autoVerify = d.settings?.autoVerifyOnJoin === true;
            if (autoVerifyToggle) { autoVerifyToggle.dataset.enabled = String(autoVerify); autoVerifyToggle.setAttribute("aria-checked", String(autoVerify)); autoVerifyToggle.classList.toggle("on", autoVerify); autoVerifyToggle.querySelector(".nx-switch-label").textContent = autoVerify ? "Enabled" : "Disabled"; }
            if (autoVerifyStatus) autoVerifyStatus.textContent = autoVerify ? "NEXORIA will try to verify you automatically when you join eligible servers." : "You will use the normal verification flow when joining servers.";
            toggle.dataset.enabled = String(visible);
            toggle.setAttribute("aria-checked", String(visible));
            toggle.classList.toggle("on", visible);
            toggle.querySelector(".nx-switch-label").textContent = visible ? "Visible" : "Hidden";
            status.textContent = visible ? "You are currently visible on the public leaderboard." : "You are currently hidden from the public leaderboard.";
        } catch (e) {
            status.textContent = "Could not load this setting.";
            status.style.color = "var(--red)";
        }
        toggle.addEventListener("click", async () => {
            const desired = toggle.dataset.enabled !== "true";
            toggle.disabled = true;
            try {
                const d = await api("/profile/settings", { method:"PUT", body:JSON.stringify({ discordUserId:session.user.id, publicSupportLeaderboard:desired }) });
                const visible = d.settings?.publicSupportLeaderboard === true;
                toggle.dataset.enabled = String(visible);
                toggle.setAttribute("aria-checked", String(visible));
                toggle.classList.toggle("on", visible);
                toggle.querySelector(".nx-switch-label").textContent = visible ? "Visible" : "Hidden";
                status.textContent = visible ? "You are now visible on the public leaderboard." : "You are now hidden from the public leaderboard.";
                status.style.color = "";
            } catch (e) {
                toggle.dataset.enabled = String(!desired);
                toggle.setAttribute("aria-checked", String(!desired));
                toggle.classList.toggle("on", !desired);
                toggle.querySelector(".nx-switch-label").textContent = !desired ? "Visible" : "Hidden";
                status.textContent = e.message || "Could not save this setting.";
                status.style.color = "var(--red)";
            } finally { toggle.disabled = false; }
        });
        const notificationDefs = [
            ["moderation-warning-dm-toggle","moderationWarningDMs","Moderation warning DMs"],["announcement-dm-toggle","announcementDMs","Official announcement DMs"],["ticket-closing-dm-toggle","ticketClosingDMs","Ticket closing DMs"],["honeypot-dm-toggle","honeypotDMs","Honeypot action DMs"],["verification-dm-toggle","verificationDMs","Verification DMs"],["ticket-staff-reply-dm-toggle","ticketStaffReplyDMs","Ticket staff reply DMs"]
        ];
        notificationDefs.forEach(([id,key,label])=>{const el=document.getElementById(id),st=document.getElementById(id+"-status");el?.addEventListener("click",async()=>{const desired=el.dataset.enabled!=="true";el.disabled=true;try{const d=await api("/profile/settings",{method:"PUT",body:JSON.stringify({discordUserId:session.user.id,[key]:desired})});const enabled=d.settings?.[key]!==false;el.dataset.enabled=String(enabled);el.setAttribute("aria-checked",String(enabled));el.classList.toggle("on",enabled);el.querySelector(".nx-switch-label").textContent=enabled?"Enabled":"Disabled";if(st)st.textContent=enabled?`${label} are enabled.`:`${label} are disabled.`;}catch(e){if(st){st.textContent=e.message||"Could not save this setting.";st.style.color="var(--red)";}}finally{el.disabled=false;}});});
        const autoVerifyToggle = document.getElementById("auto-verify-on-join-toggle");
        const autoVerifyStatus = document.getElementById("auto-verify-on-join-status");
        autoVerifyToggle?.addEventListener("click", async () => {
            const desired = autoVerifyToggle.dataset.enabled !== "true";
            autoVerifyToggle.disabled = true;
            try {
                const d = await api("/profile/settings", { method:"PUT", body:JSON.stringify({ discordUserId:session.user.id, autoVerifyOnJoin:desired }) });
                const enabled = d.settings?.autoVerifyOnJoin === true;
                autoVerifyToggle.dataset.enabled = String(enabled);
                autoVerifyToggle.setAttribute("aria-checked", String(enabled));
                autoVerifyToggle.classList.toggle("on", enabled);
                autoVerifyToggle.querySelector(".nx-switch-label").textContent = enabled ? "Enabled" : "Disabled";
                if (autoVerifyStatus) { autoVerifyStatus.textContent = enabled ? "NEXORIA will try to verify you automatically when you join eligible servers." : "You will use the normal verification flow when joining servers."; autoVerifyStatus.style.color = ""; }
            } catch (e) {
                if (autoVerifyStatus) { autoVerifyStatus.textContent = e.message || "Could not save this setting."; autoVerifyStatus.style.color = "var(--red)"; }
            } finally { autoVerifyToggle.disabled = false; }
        });
    }


    function wireIntegrationAccountMenus(scope){
        const root=scope||document;
        root.querySelectorAll("[data-integration-menu]").forEach(btn=>{
            if(btn.dataset.bound === "1") return;
            btn.dataset.bound="1";
            btn.addEventListener("click",e=>{
                e.preventDefault();e.stopPropagation();
                const row=btn.closest(".nx-account-row");
                const menu=row?.querySelector(".nx-account-menu");
                if(!menu)return;
                root.querySelectorAll(".nx-account-menu.open").forEach(m=>{if(m!==menu)m.classList.remove("open");});
                menu.classList.toggle("open");
            });
        });
        root.querySelectorAll(".nx-account-menu").forEach(menu=>{
            if(menu.dataset.bound === "1") return;
            menu.dataset.bound="1";
            menu.addEventListener("click",e=>e.stopPropagation());
        });
    }
    document.addEventListener("click",()=>document.querySelectorAll(".nx-account-menu.open").forEach(m=>m.classList.remove("open")));

    function accountMenuHtml(type,id,primary,canDisconnect=true){
        const safe=escapeHtml(String(id||""));
        const disconnect=canDisconnect ? `<button type="button" class="nx-account-menu-btn danger" data-action-disconnect="${safe}">Disconnect</button>` : "";
        return `${primary?`<button type="button" class="nx-account-menu-btn" data-action-change-main="${safe}">Change main</button>`:`<button type="button" class="nx-account-menu-btn" data-action-set-main="${safe}">Set as main</button>`}${disconnect}`;
    }

    function closeAccountMenu(button){
        button?.closest(".nx-account-menu")?.classList.remove("open");
    }

    function openPrimaryAccountPicker(type, accounts, reload){
        const list=Array.isArray(accounts)?accounts:[];
        if(!list.length) return;
        let selected=String((list.find(a=>a.primary)||list[0]).id || (list.find(a=>a.primary)||list[0]).email || "");
        const label=type === "email" ? "Email" : type === "roblox" ? "Roblox" : "Discord";
        const accountId=a=>String(a.id ?? a.email ?? "");
        const avatar=a=>String(a.avatarUrl||"");
        DCModal.custom(`<div class="dc-modal-header"><h3>Change main ${escapeHtml(label)} account</h3></div><div class="dc-modal-body"><p class="hint">Choose which connected ${escapeHtml(label)} account NEXORIA should use as your main account.</p><div class="nx-primary-picker" id="nx-primary-picker">${list.map(a=>`<button type="button" class="nx-primary-choice ${accountId(a)===selected?"selected":""}" data-account-id="${escapeHtml(accountId(a))}"><span class="nx-primary-choice-avatar">${avatar(a)?`<img src="${escapeHtml(avatar(a))}" alt="" loading="lazy">`:icon(type==="email"?"mail":type==="roblox"?"roblox":"discord",18)}</span><span class="nx-primary-choice-copy"><strong>${escapeHtml(a.email||a.username||a.displayName||accountId(a))}</strong><small>${a.primary?"Current main account":"Connected account"}</small></span><span class="nx-primary-choice-check">${accountId(a)===selected?"✓":""}</span></button>`).join("")}</div><p class="hint" id="nx-primary-cooldown" style="margin-top:10px">Confirm becomes available in 3 seconds.</p></div><div class="dc-modal-footer"><button type="button" class="btn btn-ghost btn-small" id="nx-primary-cancel">Cancel</button><button type="button" class="btn btn-primary btn-small" id="nx-primary-confirm" disabled>Confirm (3)</button></div>`,{onMount:modal=>{
            const picker=modal.querySelector("#nx-primary-picker"), confirm=modal.querySelector("#nx-primary-confirm"), cancel=modal.querySelector("#nx-primary-cancel");
            let seconds=3;
            const timer=setInterval(()=>{seconds--; if(seconds<=0){clearInterval(timer);confirm.disabled=false;confirm.textContent="Confirm";}else confirm.textContent=`Confirm (${seconds})`;},1000);
            picker?.querySelectorAll("[data-account-id]").forEach(choice=>choice.addEventListener("click",()=>{
                selected=String(choice.dataset.accountId||"");
                picker.querySelectorAll(".nx-primary-choice").forEach(x=>x.classList.toggle("selected",x===choice));
                picker.querySelectorAll(".nx-primary-choice-check").forEach(x=>x.textContent=x.closest("[data-account-id]")?.dataset.accountId===selected?"✓":"");
            }));
            cancel?.addEventListener("click",()=>{clearInterval(timer);DCModal.close();});
            confirm?.addEventListener("click",async()=>{
                confirm.disabled=true;confirm.textContent="Saving…";
                try{await api("/profile/primary",{method:"PUT",body:JSON.stringify({type,id:selected})});clearInterval(timer);DCModal.close();await reload();}
                catch(e){confirm.disabled=false;confirm.textContent="Confirm";await DCModal.alert(e.message,{title:`Couldn't change main ${label}`});}
            });
        }});
    }

    function openDisconnectPicker(type, accounts, reload, preselectedId = "") {
        const list=Array.isArray(accounts)?accounts:[];
        if(!list.length) return;
        const label=type === "email" ? "Email" : type === "roblox" ? "Roblox" : "Discord";
        let selected=String(preselectedId || list[0]?.id || list[0]?.email || "");
        const accountId=a=>String(a.id ?? a.email ?? "");
        const avatar=a=>String(a.avatarUrl||"");
        DCModal.custom(`<div class="dc-modal-header"><h3>Disconnect ${escapeHtml(label)} account</h3></div><div class="dc-modal-body"><p class="hint">Choose which connected ${escapeHtml(label)} account you want to disconnect. The account ID is shown so you can select the correct one.</p><div class="nx-primary-picker" id="nx-disconnect-picker">${list.map(a=>{const id=accountId(a);return `<button type="button" class="nx-primary-choice ${id===selected?"selected":""}" data-account-id="${escapeHtml(id)}"><span class="nx-primary-choice-avatar">${avatar(a)?`<img src="${escapeHtml(avatar(a))}" alt="" loading="lazy">`:icon(type==="email"?"mail":type==="roblox"?"roblox":"discord",18)}</span><span class="nx-primary-choice-copy"><strong>${escapeHtml(a.email||a.username||a.displayName||id)}</strong><small>${a.primary?"MAIN · ":""}ID ${escapeHtml(id)}</small></span><span class="nx-primary-choice-check">${id===selected?"✓":""}</span></button>`;}).join("")}</div></div><div class="dc-modal-footer"><button type="button" class="btn btn-ghost btn-small" id="nx-disconnect-picker-cancel">Cancel</button><button type="button" class="btn btn-danger btn-small" id="nx-disconnect-picker-next">Continue</button></div>`,{onMount:modal=>{
            const picker=modal.querySelector("#nx-disconnect-picker");
            picker?.querySelectorAll("[data-account-id]").forEach(choice=>choice.addEventListener("click",()=>{
                selected=String(choice.dataset.accountId||"");
                picker.querySelectorAll(".nx-primary-choice").forEach(x=>x.classList.toggle("selected",x===choice));
                picker.querySelectorAll(".nx-primary-choice-check").forEach(x=>x.textContent=x.closest("[data-account-id]")?.dataset.accountId===selected?"✓":"");
            }));
            modal.querySelector("#nx-disconnect-picker-cancel")?.addEventListener("click",()=>DCModal.close());
            modal.querySelector("#nx-disconnect-picker-next")?.addEventListener("click",()=>{
                const a=list.find(x=>accountId(x)===selected);
                DCModal.close();
                setTimeout(()=>openDisconnectConfirmation(type,selected,a?.email||a?.username||a?.displayName||selected,reload),60);
            });
        }});
    }

    function openDisconnectConfirmation(type,id,label,reload){
        let seconds=3;
        DCModal.custom(`<div class="dc-modal-header"><h3>Disconnect ${escapeHtml(label)}?</h3></div><div class="dc-modal-body"><p>This will remove <strong>${escapeHtml(label)}</strong> from your NEXORIA connected accounts.</p><p class="hint">The confirmation button becomes available after 3 seconds.</p></div><div class="dc-modal-footer"><button type="button" class="btn btn-ghost btn-small" id="nx-disconnect-cancel">Cancel</button><button type="button" class="btn btn-danger btn-small" id="nx-disconnect-confirm" disabled>Confirm (3)</button></div>`,{onMount:modal=>{
            const confirm=modal.querySelector("#nx-disconnect-confirm"),cancel=modal.querySelector("#nx-disconnect-cancel");
            const timer=setInterval(()=>{seconds--;if(seconds<=0){clearInterval(timer);confirm.disabled=false;confirm.textContent="Disconnect";}else confirm.textContent=`Confirm (${seconds})`;},1000);
            cancel?.addEventListener("click",()=>{clearInterval(timer);DCModal.close();});
            confirm?.addEventListener("click",async()=>{
                confirm.disabled=true;confirm.textContent="Disconnecting…";
                try{
                    const url=type==="discord"?`/profile/discord/${encodeURIComponent(id)}`:type==="email"?`/profile/email?email=${encodeURIComponent(id)}`:`/profile/roblox/${encodeURIComponent(id)}`;
                    const body=type==="roblox"?{discordUserId:getSession()?.user?.id}:undefined;
                    await api(url,{method:"DELETE",...(body?{body:JSON.stringify(body)}:{})});
                    clearInterval(timer);DCModal.close();await reload();
                }catch(e){confirm.disabled=false;confirm.textContent="Disconnect";await DCModal.alert(e.message,{title:`Couldn't disconnect ${type}`});}
            });
        }});
    }

    function bindAccountActions(container,type,accounts,reload){
        const list=Array.isArray(accounts)?accounts:[];
        container.querySelectorAll("[data-action-change-main]").forEach(btn=>btn.addEventListener("click",()=>{closeAccountMenu(btn);openPrimaryAccountPicker(type,list,reload);}));
        container.querySelectorAll("[data-action-set-main]").forEach(btn=>btn.addEventListener("click",()=>{closeAccountMenu(btn);openPrimaryAccountPicker(type,list,reload);}));
        container.querySelectorAll("[data-action-disconnect]").forEach(btn=>btn.addEventListener("click",()=>{closeAccountMenu(btn);const id=String(btn.dataset.actionDisconnect||"");openDisconnectPicker(type,list,reload,id);}));
    }

    function accountCard(type,a,menuCanDisconnect=true){
        const id=String(a.id ?? a.email ?? "");
        const image=a.avatarUrl||"";
        const title=a.email||a.username||a.displayName||id;
        const meta=a.email ? `${a.primary?"Main email · ":""}Connected ${formatDirectoryDate(a.connectedAt||a.verifiedAt)}` : `${a.primary?`Main ${type} · `:""}Connected ${formatDirectoryDate(a.connectedAt)}${a.id?` · ID ${escapeHtml(a.id)}`:""}`;
        const iconName=type==="email"?"mail":type==="roblox"?"roblox":"discord";
        return `<div class="integration-account-row nx-account-row" data-account-card="${escapeHtml(id)}"><div class="integration-account-avatar integration-account-avatar-${type}">${image?`<img src="${escapeHtml(image)}" alt="" loading="lazy" data-account-avatar="1" data-email-avatar="${escapeHtml(a.email||"")}" data-avatar-sources="${escapeHtml([`https://www.google.com/s2/photos/profile/${encodeURIComponent(String(a.email||"").trim().toLowerCase())}?sz=96`,`https://unavatar.io/google/${encodeURIComponent(String(a.email||"").trim().toLowerCase())}?size=96`,`https://unavatar.io/${encodeURIComponent(String(a.email||"").trim().toLowerCase())}?size=96`,`https://www.gravatar.com/avatar/${encodeURIComponent(String(a.email||"").trim().toLowerCase())}?s=96&d=identicon`].join("|"))}" onerror="nexoriaEmailAvatarError(this)">`:icon(iconName,18)}</div><div style="min-width:0;flex:1"><strong>${escapeHtml(title)}</strong><span>${meta}</span></div><span class="primary-badge" style="${a.primary?"":"display:none"}">MAIN</span></div>`;
    }

    function integrationStatusMenuHtml(type, accounts, canDisconnect = true) {
        const list = Array.isArray(accounts) ? accounts : [];
        if (!list.length) return "";
        // Keep this menu intentionally generic. The menu is an action launcher;
        // the actual account choice is shown only after the user selects an action.
        // This prevents every connected account from being duplicated in the small
        // status dropdown while still letting the existing pickers choose the exact account.
        const allowDisconnect = canDisconnect && !(type === "discord" && list.length <= 1);
        const disconnect = allowDisconnect ? `<button type="button" class="nx-account-menu-btn danger" data-action-disconnect-picker="1">Disconnect</button>` : `<span class="field-hint" style="display:block;padding:5px 7px">Your primary Discord connection cannot be disconnected here.</span>`;
        return `<div class="nx-status-menu-wrap"><button type="button" class="nx-status-menu-trigger" data-integration-status-menu aria-label="Connected account options">⋯</button><div class="nx-account-menu nx-status-menu"><div class="nx-status-menu-actions nx-status-menu-actions-generic"><button type="button" class="nx-account-menu-btn" data-action-set-main-picker="1">Set as main</button>${disconnect}</div></div></div>`;
    }
    function wireIntegrationStatusMenu(scope, type, accounts, reload) {
        const root = scope || document;
        root.querySelectorAll("[data-integration-status-menu]").forEach(btn => {
            if (btn.dataset.bound === "1") return;
            btn.dataset.bound = "1";
            btn.addEventListener("click", e => {
                e.preventDefault(); e.stopPropagation();
                const menu = btn.parentElement?.querySelector(".nx-status-menu");
                if (!menu) return;
                document.querySelectorAll(".nx-account-menu.open").forEach(m => { if (m !== menu) m.classList.remove("open"); });
                menu.classList.toggle("open");
            });
        });
        root.querySelectorAll(".nx-status-menu").forEach(menu => {
            if (menu.dataset.bound === "1") return;
            menu.dataset.bound = "1";
            menu.addEventListener("click", e => e.stopPropagation());
        });
        const list = Array.isArray(accounts) ? accounts : [];
        root.querySelectorAll("[data-action-set-main-picker]").forEach(btn => {
            if (btn.dataset.bound === "1") return;
            btn.dataset.bound = "1";
            btn.addEventListener("click", () => { closeAccountMenu(btn); openPrimaryAccountPicker(type, list, reload); });
        });
        root.querySelectorAll("[data-action-disconnect-picker]").forEach(btn => {
            if (btn.dataset.bound === "1") return;
            btn.dataset.bound = "1";
            btn.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); closeAccountMenu(btn); openDisconnectPicker(type, list, reload); });
        });
    }

    function renderIntegrationAccountDropdown(container,accounts,type,reload){
        const list=Array.isArray(accounts)?accounts:[];
        if(!list.length){container.innerHTML='<div class="nx-connected-account-empty">No connected account.</div>';return;}

        // Keep the familiar compact layout: the main account is shown immediately,
        // while every additional connected account lives directly underneath it in
        // the same card and can be expanded with one custom dropdown control.
        const ordered=[...list].sort((a,b)=>Number(Boolean(b.primary))-Number(Boolean(a.primary)));
        const main=ordered[0];
        const extras=ordered.slice(1);
        const extraId=`nx-connected-${type}-${Math.random().toString(36).slice(2,9)}`;
        const count=extras.length;
        container.innerHTML=`
          <div class="nx-account-stack nx-account-stack-collapsible">
            <div class="nx-account-main">${accountCard(type,main,true)}</div>
            <button type="button" class="nx-account-expand" data-account-expand aria-expanded="false" aria-controls="${extraId}" ${count?'':'disabled'}>
              <span class="nx-account-expand-icon">⌄</span>
              <span class="nx-account-expand-label">Show connected accounts (${count})</span>
              <span class="nx-account-expand-spacer"></span>
              <span class="nx-account-expand-chevron">⌄</span>
            </button>
            <div class="nx-account-extra-list" id="${extraId}" hidden>
              ${extras.length?extras.map(a=>accountCard(type,a,true)).join(""):''}
            </div>
          </div>`;

        wireIntegrationAccountMenus(container);
        bindAccountActions(container,type,ordered,reload);
        const expand=container.querySelector('[data-account-expand]');
        const extra=container.querySelector('.nx-account-extra-list');
        if(expand && extra && count){
            expand.addEventListener('click',()=>{
                const open=expand.getAttribute('aria-expanded')==='true';
                expand.setAttribute('aria-expanded',String(!open));
                extra.hidden=open;
                expand.classList.toggle('open',!open);
                const label=expand.querySelector('.nx-account-expand-label');
                if(label) label.textContent=`${open?'Show':'Hide'} connected accounts (${count})`;
            });
        }
    }

    async function loadDiscordLinks(){
        const list=document.getElementById("discord-linked-list");if(!list)return;
        try{
            const d=await api("/profile/discord"); const accounts=d.accounts||[]; const primary=accounts.find(a=>a.primary)||accounts[0];
            const footer=document.getElementById("discord-integration-footer"); if(footer)footer.innerHTML=`<span class="integration-check">✓</span> Main Discord: ${escapeHtml(primary?.displayName||primary?.username||primary?.id||"Not selected")} · Connected ${escapeHtml(formatDirectoryDate(primary?.connectedAt||null))}`; const ds=document.getElementById("discord-integration-status"); if(ds){ds.innerHTML=`<span class="integration-status-dot"></span>${accounts.length} connected${integrationStatusMenuHtml("discord",accounts)}`;ds.className="integration-status integration-status-linked";wireIntegrationStatusMenu(ds,"discord",accounts,loadDiscordLinks);}
            renderIntegrationAccountDropdown(list,accounts,"discord",loadDiscordLinks);
            const p0=document.getElementById("primary-discord-item");if(p0)p0.querySelector(".primary-account-value").innerHTML=`${escapeHtml(primary?.displayName||primary?.username||"Not selected")} <span class="primary-badge">MAIN</span>`;
            integrationState.discord=accounts.length>0;updateIntegrationCount();
            document.getElementById("discord-link-btn")?.addEventListener("click",startDiscordLinkOAuth);
        }catch(e){integrationState.discord=false;updateIntegrationCount();list.innerHTML=`<div class="field-hint">Could not load linked Discord accounts.</div>`;}
    }

    async function startDiscordLinkOAuth(){
        try{const {verifier,challenge}=await makeVerifierAndChallenge();const state=`dcl_${crypto.randomUUID()}`;sessionStorage.setItem("nexoria_discord_link_oauth",JSON.stringify({verifier,state,returnPath:`/profile/?settings=integrations&integration=discord`,createdAt:Date.now()}));const params=new URLSearchParams({client_id:CFG.DISCORD_CLIENT_ID,redirect_uri:getRedirectUri(),response_type:"code",scope:"identify",code_challenge:challenge,code_challenge_method:"S256",state,prompt:"select_account"});window.location.href=`https://discord.com/oauth2/authorize?${params.toString()}`;}catch(e){await DCModal.alert(e.message,{title:"Couldn't start Discord account linking"});}
    }

    async function loadEmail() {
        const status=document.getElementById("email-integration-status"), account=document.getElementById("email-integration-account"), actions=document.getElementById("email-integration-actions");
        if(!status||!account||!actions)return;
        try{
            const d=await api("/profile/email"); const emails=Array.isArray(d.emails)?d.emails:[];
            if(emails.length){
                status.innerHTML=`<span class="integration-status-dot"></span>${emails.length} connected${integrationStatusMenuHtml("email",emails)}`;status.className="integration-status integration-status-linked";
                 renderIntegrationAccountDropdown(account,emails,"email",loadEmail);
                 wireIntegrationStatusMenu(status,"email",emails,loadEmail);
                actions.innerHTML=`<div class="email-connect-row"><input id="email-connect-input" type="email" class="search-input" placeholder="Add another email address"><button class="integration-btn integration-btn-primary" id="email-connect-btn"><span>Connect email</span><span class="integration-btn-arrow">→</span></button></div>${d.pending?`<div class="nx-email-verify-box"><strong>Verify ${escapeHtml(d.pending.email)}</strong><span>Enter the 6-digit code sent to this email.</span><div class="nx-email-verify-row"><input id="email-verify-code" class="search-input" inputmode="numeric" maxlength="6" placeholder="6-digit code"><button class="integration-btn integration-btn-primary" id="email-verify-btn">Verify</button></div></div>`:""}`;
            }else{
                status.innerHTML='<span class="integration-status-dot"></span>Not connected';status.className="integration-status integration-status-unlinked";
                account.innerHTML='<div class="integration-account-avatar integration-account-avatar-placeholder">'+icon("mail",18)+'</div><div><strong>No email connected</strong><span>Connect an email to verify it with NEXORIA.</span></div>';
                actions.innerHTML='<div class="email-connect-row"><input id="email-connect-input" type="email" class="search-input" placeholder="you@example.com"><button class="integration-btn integration-btn-primary" id="email-connect-btn"><span>Connect email</span><span class="integration-btn-arrow">→</span></button></div>' + (d.pending ? `<div class="nx-email-verify-box"><strong>Verify ${escapeHtml(d.pending.email)}</strong><span>Enter the 6-digit code sent to this email.</span><div class="nx-email-verify-row"><input id="email-verify-code" class="search-input" inputmode="numeric" maxlength="6" placeholder="6-digit code"><button class="integration-btn integration-btn-primary" id="email-verify-btn">Verify</button></div></div>` : '');
            }
            const primary=emails.find(e=>e.primary)||emails[0];
            const p0=document.getElementById("primary-email-item");if(p0)p0.querySelector(".primary-account-value").innerHTML=`${escapeHtml(primary?.email||"Not selected")} <span class="primary-badge">MAIN</span>`;
            integrationState.email=emails.length>0;updateIntegrationCount();
            document.getElementById("email-connect-btn")?.addEventListener("click",async()=>{const b=document.getElementById("email-connect-btn"),email=document.getElementById("email-connect-input")?.value||"";b.disabled=true;try{await api("/profile/email",{method:"POST",body:JSON.stringify({email})});await loadEmail();}catch(e){await DCModal.alert(e.message,{title:"Couldn't connect email"});}finally{b.disabled=false;}});
            document.getElementById("email-verify-btn")?.addEventListener("click",async()=>{const b=document.getElementById("email-verify-btn"),code=document.getElementById("email-verify-code")?.value.trim()||"";b.disabled=true;try{await api("/profile/email/verify",{method:"POST",body:JSON.stringify({code})});await DCModal.alert("Email verified and connected to NEXORIA.",{title:"Email verified"});await loadEmail();}catch(e){await DCModal.alert(e.message,{title:"Couldn't verify email"});}finally{b.disabled=false;}});
            document.getElementById("email-verify-code")?.addEventListener("input",e=>{e.target.value=e.target.value.replace(/\D/g,"").slice(0,6);});
        }catch(e){integrationState.email=false;updateIntegrationCount();status.innerHTML='<span class="integration-status-dot"></span>Unavailable';status.className="integration-status integration-status-unlinked";account.innerHTML='<div class="integration-account-avatar integration-account-avatar-placeholder">'+icon("mail",18)+'</div><div><strong>Email connection unavailable</strong><span>Check your host connection and try again.</span></div>';actions.innerHTML='';}
    }

    async function loadRoblox() {
        const status=document.getElementById("roblox-integration-status"),account=document.getElementById("roblox-integration-account"),actions=document.getElementById("roblox-integration-actions");
        try{
            const d=await api(`/profile/roblox?discordUserId=${encodeURIComponent(session.user.id)}`),accounts=d.accounts||[];
            if(accounts.length){
                status.innerHTML=`<span class="integration-status-dot"></span>${accounts.length} connected${integrationStatusMenuHtml("roblox",accounts)}`;status.className="integration-status integration-status-linked";
                 renderIntegrationAccountDropdown(account,accounts,"roblox",loadRoblox);
                 wireIntegrationStatusMenu(status,"roblox",accounts,loadRoblox);
                actions.innerHTML=`<button class="integration-btn integration-btn-primary" id="roblox-connect-btn"><span>Connect another Roblox account</span><span class="integration-btn-arrow">→</span></button>`;
            }else{
                status.innerHTML='<span class="integration-status-dot"></span>Not connected';status.className="integration-status integration-status-unlinked";account.innerHTML='<div class="integration-account-avatar integration-account-avatar-placeholder">'+icon("link",18)+'</div><div><strong>No Roblox account linked</strong><span>Connect one to use Roblox-linked features.</span></div>';actions.innerHTML='<button class="integration-btn integration-btn-primary" id="roblox-connect-btn"><span>Connect Roblox</span><span class="integration-btn-arrow">→</span></button>';
            }
            const primary=accounts.find(a=>a.primary)||accounts[0];
            const p0=document.getElementById("primary-roblox-item");if(p0)p0.querySelector(".primary-account-value").innerHTML=`${escapeHtml(primary?.username||primary?.displayName||"Not selected")} <span class="primary-badge">MAIN</span>`;
            integrationState.roblox=accounts.length>0;updateIntegrationCount();
            document.getElementById("roblox-connect-btn")?.addEventListener("click",startRobloxOAuth);
        }catch(e){integrationState.roblox=false;updateIntegrationCount();status.innerHTML='<span class="integration-status-dot"></span>Unavailable';status.className="integration-status integration-status-unlinked";account.innerHTML='<div class="integration-account-avatar integration-account-avatar-placeholder">'+icon("link",18)+'</div><div><strong>Roblox connection unavailable</strong><span>Check your host connection and try again.</span></div>';actions.innerHTML='<button class="integration-btn integration-btn-primary" id="roblox-connect-btn"><span>Try connecting Roblox</span><span class="integration-btn-arrow">→</span></button>';document.getElementById("roblox-connect-btn")?.addEventListener("click",startRobloxOAuth);}
    }
    async function startRobloxOAuth() {
        try {
            let cfg;
            try { cfg=await api("/oauth/roblox/config"); }
            catch (configError) { cfg={clientId:CFG?.ROBLOX_CLIENT_ID||"",redirectUri:CFG?.ROBLOX_REDIRECT_URI||"",authorizationEndpoint:"https://apis.roblox.com/oauth/v1/authorize",scopes:Array.isArray(CFG?.ROBLOX_OAUTH_SCOPES)&&CFG.ROBLOX_OAUTH_SCOPES.length?CFG.ROBLOX_OAUTH_SCOPES:["openid","profile","game-pass:read","group-forum:read","group:read","user.inventory-item:read"]}; if(!cfg.clientId) throw configError; }
            const authorizationEndpoint=String(cfg?.authorizationEndpoint||"https://apis.roblox.com/oauth/v1/authorize").trim();
            const redirectUri=String(cfg?.redirectUri||CFG?.ROBLOX_REDIRECT_URI||`${window.location.origin}${getSiteBasePath()}`).trim();
            const clientId=String(cfg?.clientId||"").trim();
            const scopes=Array.isArray(cfg?.scopes)&&cfg.scopes.length?cfg.scopes.map(String):["openid","profile","game-pass:read","group-forum:read","group:read","user.inventory-item:read"];
            if(!clientId) throw new Error("Roblox OAuth is not configured on the NEXORIA host.");
            const authUrl=new URL(authorizationEndpoint), redirectUrl=new URL(redirectUri,window.location.origin);
            if(!["https:","http:"].includes(authUrl.protocol)||!["https:","http:"].includes(redirectUrl.protocol)) throw new Error("The Roblox OAuth configuration is invalid.");
            const bytes=crypto.getRandomValues(new Uint8Array(64));
            const verifier=base64url(bytes); const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier)); const challenge=base64url(digest);
            const state=`rbx_${crypto.randomUUID()}`;
            sessionStorage.setItem("nexoria_roblox_oauth",JSON.stringify({verifier,state,discordUserId:session.user.id,redirectUri:redirectUrl.toString(),scopes,createdAt:Date.now()}));
            sessionStorage.setItem("nexoria_roblox_return_path", "/profile/?settings=integrations");
            const u=new URL(authUrl.toString()); u.searchParams.set("client_id",clientId); u.searchParams.set("redirect_uri",redirectUrl.toString()); u.searchParams.set("scope",scopes.join(" ")); u.searchParams.set("response_type","code"); u.searchParams.set("code_challenge",challenge); u.searchParams.set("code_challenge_method","S256"); u.searchParams.set("state",state);
            // Roblox's hosted authorization page decides which account-confirmation
            // step is required. Keep the URL in the documented Roblox PKCE/code-flow shape.
            window.location.href=u.toString();
        } catch(e) { await DCModal.alert(e.message,{title:"Couldn't start Roblox connection"}); }
    }
    await Promise.all([loadSettings(), loadDiscordLinks(), loadEmail(), loadRoblox(), loadVerificationServers()]);
    const verificationNoticeRaw=sessionStorage.getItem("nexoria_verification_return_notice");
    if(verificationNoticeRaw){
        sessionStorage.removeItem("nexoria_verification_return_notice");
        try {
            const notice=JSON.parse(verificationNoticeRaw);
            await DCModal.alert(`Roblox account **${notice.account||"Roblox account"}** is connected to your NEXORIA account.\n\nReturn to Discord and click **Complete Roblox Verification** in the verification message to finish verification for this server.`,{title:"Roblox connected — return to Discord"});
        } catch {}
    }
    const integration=new URLSearchParams(window.location.search).get("integration");
    if(integration==="roblox"){setTimeout(()=>document.getElementById("roblox-integration-card")?.scrollIntoView({behavior:"smooth",block:"center"}),150);}
    if(integration==="discord"){setTimeout(()=>document.querySelector(".integration-card-discord")?.scrollIntoView({behavior:"smooth",block:"center"}),150);}
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
        await paintAdminDashboard(root, session);
    }
    catch (e) {
        setAdminToken(null);
        paintAdminLogin(root);
    }
}
function paintAdminLogin(root) {
    root.innerHTML = `
    <h1 class="picker-heading">Admin Panel</h1>
    <p class="picker-sub">Sign in with the shared admin credentials. Your Discord account also needs to be granted access.</p>
    <div class="config-section" style="max-width:380px">
      <div class="field"><label>Username</label><input type="text" id="admin-username" autocomplete="username" placeholder="Username"></div>
      <div class="field"><label>Password</label><input type="password" id="admin-password" autocomplete="current-password" placeholder="Password"></div>
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
function getAdminFolderState() {
    try { return sessionStorage.getItem("nexoria_admin_open_folder") || ""; } catch { return ""; }
}
function setAdminFolderState(id) {
    try {
        if (id) sessionStorage.setItem("nexoria_admin_open_folder", id);
        else sessionStorage.removeItem("nexoria_admin_open_folder");
    } catch {}
}

async function paintAdminDashboard(root, session) {
    root.innerHTML = `
    <div class="admin-console-head">
      <div>
        
        <h1 class="picker-heading">Admin Panel</h1>
        <p class="picker-sub">Everything is grouped into sections so server management, tickets, the Discord directory, and security are easier to find.</p>
      </div>
      <button class="btn btn-ghost btn-small" id="admin-logout-btn">${icon("logout")} Log out</button>
    </div>

    <div class="admin-folder-grid">
      <details class="admin-folder" data-admin-folder="overview">
        <summary><span class="admin-folder-icon">${icon("layout-grid",16)}</span><span><b>Overview &amp; system</b><small>Status, refresh behaviour, and high-level dashboard controls.</small></span><span class="admin-folder-chevron">${icon("chevron-down",14)}</span></summary>
        <div class="admin-folder-body">
          <div class="config-section admin-inner-card admin-refresh-card">
            <div class="dash-header" style="margin-bottom:4px"><div><h3 style="margin:0">Dashboard refresh</h3><div class="hint">One central refresh policy for status, leaderboards, server lists, and dashboard data. Saved here, used by every browser.</div></div><button class="btn btn-primary btn-small" id="admin-save-refresh">${icon("check")} Save</button></div>
            <div class="admin-refresh-grid">
              <label class="admin-refresh-control"><span>${icon("activity",14)} Status / latency</span><small>Host status, uptime and latency.</small><input id="admin-refresh-status" type="number" min="0.1" step="0.1" class="search-input"></label>
              <label class="admin-refresh-control"><span>${icon("trophy",14)} Leaderboards</span><small>Public leaderboard data.</small><input id="admin-refresh-leaderboard" type="number" min="1" step="1" class="search-input"></label>
              <label class="admin-refresh-control"><span>${icon("servers",14)} Server lists</span><small>Discord server picker/list refresh.</small><input id="admin-refresh-servers" type="number" min="1" step="1" class="search-input"></label>
              <label class="admin-refresh-control"><span>${icon("dashboard",14)} Dashboard data</span><small>Live dashboard/module data refresh.</small><input id="admin-refresh-dashboard" type="number" min="1" step="1" class="search-input"></label>
            </div>
            <div class="admin-refresh-footer"><span id="admin-refresh-feedback" class="field-hint"></span><span class="admin-refresh-note">Lower values update more often and can increase requests to your local host.</span></div>
          </div>
        </div>
      </details>

      <details class="admin-folder">
        <summary><span class="admin-folder-icon">${icon("megaphone",16)}</span><span><b>NEXORIA announcements</b><small>Publish an official NEXORIA announcement to the configured announcement destination.</small></span><span class="admin-folder-chevron">${icon("chevron-down",14)}</span></summary>
        <div class="admin-folder-body">
          <div class="config-section admin-inner-card">
            <h3>Publish announcement</h3>
            <div class="hint">The official NEXORIA status is added automatically to every Discord message. Messages longer than Discord's limit are split into up to two messages. The same announcement is published to the website announcement popup and emailed to everyone with a verified email connected to NEXORIA.</div>
            <textarea id="admin-announcement-text" class="search-input" rows="7" maxlength="7800" placeholder="Write your NEXORIA announcement…" style="width:100%;resize:vertical;margin-top:12px"></textarea>
            <div style="margin-top:12px"><label class="field-label" for="admin-announcement-files">Attachments</label><div class="nexoria-file-picker" style="display:flex;align-items:center;gap:10px;margin-top:7px"><input id="admin-announcement-files" type="file" multiple hidden><button type="button" class="btn btn-primary btn-small" id="admin-announcement-files-button">${icon("paperclip",14)} Choose files</button><span id="admin-announcement-files-name" class="field-hint">No files selected</span></div><div id="admin-announcement-files-list" style="display:flex;flex-direction:column;gap:6px;margin-top:8px"></div><div class="field-hint" id="admin-announcement-files-info" style="margin-top:7px">Up to 10 files. Files will be compressed into one ZIP before NEXORIA checks the size. There is no uncompressed-size limit. The final compressed ZIP must be at or below 19.99 MB for safety; anything above 20 MB is blocked.</div></div>
            <div class="field-row-inline" style="margin-top:10px;align-items:center"><button class="btn btn-primary btn-small" id="admin-announcement-send">${icon("send",14)} Publish official announcement</button><span id="admin-announcement-feedback" class="field-hint"></span></div>
          </div>
        </div>
      </details>

      <details class="admin-folder" data-admin-folder="servers">
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

      <details class="admin-folder" data-admin-folder="tickets">
        <summary><span class="admin-folder-icon">${icon("clipboard-list",16)}</span><span><b>Ticket Tool</b><small>Search and manage tickets across all connected servers.</small></span><span class="admin-folder-chevron">${icon("chevron-down",14)}</span></summary>
        <div class="admin-folder-body">
          <div class="config-section admin-inner-card">
            <div class="dash-header" style="margin-bottom:4px"><div><h3 style="margin:0">Ticket search</h3><div class="hint">Find tickets by number, subject, or the people involved.</div></div><button class="btn btn-ghost btn-small" id="admin-ticket-refresh-btn">${icon("refresh")} Refresh Tickets</button></div>
            <input type="text" class="search-input" id="admin-ticket-search" placeholder="Search by ticket number, subject, or user…" style="width:100%;margin-top:10px;margin-bottom:10px">
            <div id="admin-ticket-search-results"></div>
          </div>
        </div>
      </details>

      <details class="admin-folder" data-admin-folder="moderation-cases">
        <summary><span class="admin-folder-icon">${icon("gavel",16)}</span><span><b>Moderation Cases</b><small>Search every NEXORIA moderation case by username, user ID, server case ID or global case ID.</small></span><span class="admin-folder-chevron">${icon("chevron-down",14)}</span></summary>
        <div class="admin-folder-body">
          <div class="config-section admin-inner-card">
            <div class="dash-header" style="margin-bottom:4px"><div><h3 style="margin:0">Global moderation case search</h3><div class="hint">Global case IDs remain searchable from NEXORIA's admin panel even when the original Discord channel or message is gone.</div></div><button class="btn btn-ghost btn-small" id="admin-moderation-case-refresh">${icon("refresh")} Refresh</button></div>
            <div class="field-row-inline" style="margin-top:10px;gap:8px"><input type="text" class="search-input" id="admin-moderation-case-search" placeholder="Username, Discord user ID, CASE-000001 or NEX-…" style="flex:1"><button class="btn btn-primary btn-small" id="admin-moderation-case-search-btn">${icon("search")} Search</button></div>
            <div id="admin-moderation-case-results" style="margin-top:12px">${loadingBlock()}</div>
            <div id="admin-moderation-case-detail" style="display:none;margin-top:14px"></div>
          </div>
        </div>
      </details>

      <details class="admin-folder" data-admin-folder="directory">
        <summary><span class="admin-folder-icon">${icon("servers",16)}</span><span><b>Discord directory</b><small>Browse every server NEXORIA is in and every Discord user authenticated with NEXORIA.</small></span><span class="admin-folder-chevron">${icon("chevron-down",14)}</span></summary>
        <div class="admin-folder-body">
          <div class="config-section admin-inner-card">
            <div class="admin-directory-tabs" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
              <button type="button" class="btn btn-primary btn-small" id="admin-directory-servers-tab">${icon("servers")} Servers</button>
              <button type="button" class="btn btn-ghost btn-small" id="admin-directory-users-tab">${icon("user")} Discord <span id="admin-directory-discord-count" style="opacity:.75">(0)</span></button>
              <button type="button" class="btn btn-ghost btn-small" id="admin-directory-roblox-tab">${icon("roblox")} Roblox <span id="admin-directory-roblox-count" style="opacity:.75">(0)</span></button>
              <button type="button" class="btn btn-ghost btn-small" id="admin-directory-email-tab">${icon("mail")} Email <span id="admin-directory-email-count" style="opacity:.75">(0)</span></button>
            </div>
            <div id="admin-directory-heading"><h3 style="margin:0">All servers</h3><div class="hint">Every Discord server the NEXORIA bot is currently connected to.</div></div>
            <input type="text" class="search-input" id="admin-directory-search" placeholder="Search servers…" style="width:100%;margin:12px 0">
            <div id="admin-directory-list">${loadingBlock()}</div>
            <div id="admin-directory-detail" style="display:none"></div>
          </div>
        </div>
      </details>

      <details class="admin-folder" data-admin-folder="security">
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

    const savedAdminFolder = getAdminFolderState();
    root.querySelectorAll("details.admin-folder").forEach(detail => {
        detail.open = Boolean(savedAdminFolder && detail.dataset.adminFolder === savedAdminFolder);
        detail.addEventListener("toggle", () => {
            if (detail.open) {
                setAdminFolderState(detail.dataset.adminFolder || "");
                root.querySelectorAll("details.admin-folder").forEach(other => { if (other !== detail) other.open = false; });
            } else if (getAdminFolderState() === detail.dataset.adminFolder) {
                setAdminFolderState("");
            }
        });
    });

    const adminRefreshPrefs = getRefreshPrefs();
    document.getElementById("admin-refresh-status").value = adminRefreshPrefs.statusSeconds;
    document.getElementById("admin-refresh-leaderboard").value = adminRefreshPrefs.leaderboardSeconds;
    document.getElementById("admin-refresh-servers").value = adminRefreshPrefs.serversSeconds;
    document.getElementById("admin-refresh-dashboard").value = adminRefreshPrefs.dashboardSeconds;
    document.getElementById("admin-save-refresh")?.addEventListener("click", async () => {
        const payload = { statusSeconds: document.getElementById("admin-refresh-status").value, leaderboardSeconds: document.getElementById("admin-refresh-leaderboard").value, serversSeconds: document.getElementById("admin-refresh-servers").value, dashboardSeconds: document.getElementById("admin-refresh-dashboard").value };
        try { const saved = await adminApi("/admin/runtime-settings", { method:"PUT", body:JSON.stringify({ refresh:payload }) }); const local=saveRefreshPrefs(saved.refresh||payload); ["status","leaderboard","servers","dashboard"].forEach(k=>{ const el=document.getElementById(`admin-refresh-${k}`); if(el) el.value=local[`${k}Seconds`]; }); document.getElementById("admin-refresh-feedback").textContent="Saved for all dashboard sessions."; }
        catch(e) { document.getElementById("admin-refresh-feedback").textContent=`Couldn't save: ${e.message}`; }
    });
    const announcementFileInput = document.getElementById("admin-announcement-files");
    const announcementFileButton = document.getElementById("admin-announcement-files-button");
    const announcementFilesName = document.getElementById("admin-announcement-files-name");
    const announcementFilesInfo = document.getElementById("admin-announcement-files-info");
    const announcementFilesList = document.getElementById("admin-announcement-files-list");
    let selectedAnnouncementFiles = [];
    function syncAnnouncementFileInput() {
        if (!announcementFileInput || typeof DataTransfer === "undefined") return;
        try {
            const dt = new DataTransfer();
            selectedAnnouncementFiles.forEach(file => dt.items.add(file));
            announcementFileInput.files = dt.files;
        } catch {}
    }
    function renderAnnouncementFiles() {
        const files = selectedAnnouncementFiles;
        if (announcementFilesName) announcementFilesName.textContent = files.length ? `${files.length} file${files.length===1?"":"s"} selected` : "No files selected";
        const total = files.reduce((n,f)=>n+Number(f.size||0),0);
        if (announcementFilesInfo) {
            announcementFilesInfo.style.color = files.length > ANNOUNCEMENT_MAX_FILES ? "var(--red)" : "";
            announcementFilesInfo.textContent = files.length > ANNOUNCEMENT_MAX_FILES
                ? `You can attach up to ${ANNOUNCEMENT_MAX_FILES} files.`
                : files.length
                    ? `${files.length} file${files.length===1?"":"s"} selected · ${(total/1024/1024).toFixed(2)} MB before compression · NEXORIA will compress the files before checking whether the final ZIP is above the 19.99 MB safe limit.`
                    : "Up to 10 files. There is no uncompressed-size limit. NEXORIA compresses the files into one ZIP first, then checks whether that compressed ZIP is above the 19.99 MB safe limit.";
        }
        if (announcementFilesList) announcementFilesList.innerHTML = files.map((file,index)=>`<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 9px;border:1px solid var(--border,#2b2f52);border-radius:8px"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(file.name)} <span class="field-hint">· ${(Number(file.size||0)/1024/1024).toFixed(2)} MB</span></span><button type="button" class="btn btn-ghost btn-small" data-announcement-remove="${index}" title="Delete attachment" aria-label="Delete ${esc(file.name)}">Delete</button></div>`).join("");
        announcementFilesList?.querySelectorAll("[data-announcement-remove]").forEach(btn=>btn.addEventListener("click",()=>{
            const index=Number(btn.dataset.announcementRemove); if(!Number.isInteger(index)) return;
            selectedAnnouncementFiles.splice(index,1); syncAnnouncementFileInput(); renderAnnouncementFiles();
        }));
    }
    announcementFileButton?.addEventListener("click",()=>announcementFileInput?.click());
    const ANNOUNCEMENT_MAX_ZIP = Math.floor(19.99 * 1024 * 1024);
    const ANNOUNCEMENT_MAX_FILES = 10;
    function crc32Announcement(data) {
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < data.length; i++) {
            crc ^= data[i];
            for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    function u16Announcement(v) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0,v,true); return b; }
    function u32Announcement(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0,v>>>0,true); return b; }
    function dosDateAnnouncement(date = new Date()) {
        const time = (date.getHours()<<11) | (date.getMinutes()<<5) | Math.floor(date.getSeconds()/2);
        const day = date.getDate(), month = date.getMonth()+1, year = Math.max(1980,date.getFullYear())-1980;
        return { time, date: (year<<9)|(month<<5)|day };
    }
    function zipTextBytes(s) { return new TextEncoder().encode(s); }
    function sanitizeAnnouncementZipName(name, index) {
        let clean=String(name||`attachment-${index+1}`).replace(/[^a-zA-Z0-9._()\[\] -]+/g,"_").replace(/^\.+/,"").trim();
        return (clean||`attachment-${index+1}`).slice(0,180);
    }
    async function compressAnnouncementFile(file, onProgress) {
        if (!window.CompressionStream) throw new Error("This browser does not support announcement compression. Please use a current Chrome, Edge, Firefox, or Safari release.");
        const crcState={crc:0xFFFFFFFF};
        const tracker=new TransformStream({transform(chunk,controller){
            const data=chunk instanceof Uint8Array?chunk:new Uint8Array(chunk);
            crcState.crc=crc32AnnouncementUpdate(crcState.crc,data); controller.enqueue(data);
        }});
        const compressedStream=file.stream().pipeThrough(tracker).pipeThrough(new CompressionStream("deflate"));
        const compressedZlib=await new Response(compressedStream).arrayBuffer();
        const z=new Uint8Array(compressedZlib);
        if(z.length<6) throw new Error(`Could not compress ${file.name}.`);
        const raw=z.slice(2,z.length-4);
        return {name:sanitizeAnnouncementZipName(file.name,0),originalSize:file.size,compressed:raw,crc:(crcState.crc^0xFFFFFFFF)>>>0};
    }
    function crc32AnnouncementUpdate(crc,data){
        for(let i=0;i<data.length;i++){crc^=data[i];for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xEDB88320:0);}
        return crc>>>0;
    }
    async function makeAnnouncementZip(files, feedback) {
        const locals=[],centrals=[]; let offset=0,originalBytes=0; const dt=dosDateAnnouncement(); const names=new Set();
        for(let i=0;i<files.length;i++){
            const file=files[i]; originalBytes+=file.size;
            feedback.textContent=`Compressing ${i+1}/${files.length}: ${file.name}…`;
            const item=await compressAnnouncementFile(file,()=>{}); item.name=sanitizeAnnouncementZipName(file.name,i);
            let unique=item.name,n=2; while(names.has(unique)) unique=item.name.replace(/(\.[^.]*)?$/,`-${n++}$1`); item.name=unique; names.add(unique);
            const name=zipTextBytes(item.name), c=item.compressed, unc=file.size;
            const local=new Uint8Array(30+name.length); const dv=new DataView(local.buffer); dv.setUint32(0,0x04034b50,true); dv.setUint16(4,20,true); dv.setUint16(6,0x0800,true); dv.setUint16(8,8,true); dv.setUint16(10,dt.time,true); dv.setUint16(12,dt.date,true); dv.setUint32(14,item.crc,true); dv.setUint32(18,c.length,true); dv.setUint32(22,unc,true); dv.setUint16(26,name.length,true); local.set(name,30); locals.push(local,c);
            const central=new Uint8Array(46+name.length); const cd=new DataView(central.buffer); cd.setUint32(0,0x02014b50,true); cd.setUint16(4,20,true); cd.setUint16(6,20,true); cd.setUint16(8,0x0800,true); cd.setUint16(10,8,true); cd.setUint16(12,dt.time,true); cd.setUint16(14,dt.date,true); cd.setUint32(16,item.crc,true); cd.setUint32(20,c.length,true); cd.setUint32(24,unc,true); cd.setUint16(28,name.length,true); cd.setUint32(42,offset,true); central.set(name,46); centrals.push(central); offset+=local.length+c.length;
            const estimated=offset+centrals.reduce((n,b)=>n+b.length,0)+22;
            if(estimated>ANNOUNCEMENT_MAX_ZIP) throw new Error(`Attachments compress to ${(estimated/1024/1024).toFixed(2)} MB, which exceeds the 19.99 MB safe announcement limit (20 MB maximum). Remove files or use more compressible files.`);
        }
        const centralSize=centrals.reduce((n,b)=>n+b.length,0), end=new Uint8Array(22), ed=new DataView(end.buffer); ed.setUint32(0,0x06054b50,true); ed.setUint16(8,files.length,true); ed.setUint16(10,files.length,true); ed.setUint32(12,centralSize,true); ed.setUint32(16,offset,true);
        const blob=new Blob([...locals,...centrals,end],{type:"application/zip"});
        if(blob.size>ANNOUNCEMENT_MAX_ZIP) throw new Error(`Attachments compress to ${(blob.size/1024/1024).toFixed(2)} MB, which exceeds the 19.99 MB safe announcement limit (20 MB maximum).`);
        const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||""));r.onerror=()=>reject(new Error("Could not prepare the compressed ZIP."));r.readAsDataURL(blob);});
        return {data:base64,name:"nexoria-announcement-attachments.zip",originalBytes,compressedBytes:blob.size,fileCount:files.length};
    }
    announcementFileInput?.addEventListener("change",()=>{
        selectedAnnouncementFiles=[...(announcementFileInput.files||[])];
        renderAnnouncementFiles();
    });
    document.getElementById("admin-announcement-send")?.addEventListener("click",async()=>{
        const btn=document.getElementById("admin-announcement-send"),text=document.getElementById("admin-announcement-text")?.value?.trim(),feedback=document.getElementById("admin-announcement-feedback");
        const files=[...selectedAnnouncementFiles];
        if(!text && !files.length){feedback.textContent="Enter an announcement or attach at least one file before publishing.";return;}
        if(files.length>ANNOUNCEMENT_MAX_FILES){feedback.textContent="You can attach up to 10 files.";return;}
        btn.disabled=true; feedback.style.color="";
        try{
            let attachments=[]; if(files.length){feedback.textContent="Compressing attachments locally before sending…";const zip=await makeAnnouncementZip(files,feedback);attachments=[zip];feedback.textContent=`Compressed to ${(zip.compressedBytes/1024/1024).toFixed(2)} MB from ${(zip.originalBytes/1024/1024).toFixed(2)} MB. Sending…`;}
            const d=await adminApi("/admin/announcement",{method:"POST",body:JSON.stringify({text,attachments})}); const a=d.attachment; const attachmentText=a?` · Attachments: ${(Number(a.compressedBytes)/1024/1024).toFixed(2)} MB compressed from ${(Number(a.originalBytes)/1024/1024).toFixed(2)} MB`:"";
            feedback.textContent=`Published to ${d.sent} destination${d.sent===1?"":"s"}. Email: ${Number(d.email?.sent||0)}/${Number(d.email?.attempted||0)} sent${d.email?.failed?` · ${d.email.failed} failed`:""}${attachmentText}.`;
            document.getElementById("admin-announcement-text").value=""; selectedAnnouncementFiles=[]; if(announcementFileInput)announcementFileInput.value="";
            renderAnnouncementFiles();;
        }catch(e){feedback.textContent=e.message||"Could not publish announcement.";feedback.style.color="var(--red)";}finally{btn.disabled=false;}
    });
    document.getElementById("admin-logout-btn")?.addEventListener("click", async () => {
        try { await adminApi("/admin/logout", { method: "POST" }); } catch { }
        setAdminToken(null);
        renderAdminPanel(root);
    });
    await paintAdminGuildsSection();
    wireAdminRestrictions();
    wireAdminTicketSearch();
    wireAdminDirectory();
    wireAdminModerationCases();
    if (session.isOwner) await paintAdminAdminsList();
    const directCase = new URLSearchParams(window.location.search).get("case");
    if (directCase) {
        const folder = root.querySelector('details[data-admin-folder="moderation-cases"]');
        if (folder) { folder.open = true; setAdminFolderState("moderation-cases"); }
        await openAdminModerationCase(directCase);
    }
}
async function wireAdminModerationCases() {
    const search = document.getElementById("admin-moderation-case-search");
    const button = document.getElementById("admin-moderation-case-search-btn");
    const refresh = document.getElementById("admin-moderation-case-refresh");
    const run = async () => {
        const q = search?.value?.trim() || "";
        const box = document.getElementById("admin-moderation-case-results");
        if (!box) return;
        box.innerHTML = loadingBlock();
        try {
            const d = await adminApi(`/admin/moderation/cases?q=${encodeURIComponent(q)}`);
            box.innerHTML = d.cases?.length ? `<div class="admin-case-list">${d.cases.map(c=>`<button type="button" class="admin-case-row" data-admin-case="${escapeHtml(c.globalCaseId||"")}"><span><strong>${escapeHtml(c.serverCaseId||"")}</strong><small>${escapeHtml(c.type||"")} · ${escapeHtml(c.guildName||c.guildId||"")}</small></span><span><strong>${escapeHtml(c.globalCaseId||"")}</strong><small>${escapeHtml(c.username||c.userId||"")} · ${new Date(c.createdAt).toLocaleString()}</small></span><span>${escapeHtml(c.reason||"")}</span></button>`).join("")}</div>` : `<div class="empty-state">No moderation cases found.</div>`;
            box.querySelectorAll("[data-admin-case]").forEach(el=>el.addEventListener("click",()=>openAdminModerationCase(el.dataset.adminCase)));
        } catch (e) { box.innerHTML = `<div class="empty-state">${escapeHtml(e.message)}</div>`; }
    };
    button?.addEventListener("click",run); refresh?.addEventListener("click",run); search?.addEventListener("keydown",e=>{if(e.key==="Enter")run();});
    await run();
}
async function openAdminModerationCase(id) {
    const detail = document.getElementById("admin-moderation-case-detail");
    if (!detail) return;
    detail.style.display = "block"; detail.innerHTML = loadingBlock();
    try {
        const d = await adminApi(`/admin/moderation/cases/${encodeURIComponent(id)}`); const c=d.case;
        detail.innerHTML = `<div class="config-section admin-inner-card"><div class="dash-header"><div><h3 style="margin:0">Case ${escapeHtml(c.serverCaseId||"")}</h3><div class="hint">Global ID: ${escapeHtml(c.globalCaseId||"")}</div></div><a class="btn btn-ghost btn-small" href="${escapeHtml(c.caseUrl||"#")}" target="_blank" rel="noopener">${icon("external-link")} Website link</a></div><div class="admin-case-detail-grid"><div><b>Server</b><span>${escapeHtml(c.guildName||c.guildId||"")}</span></div><div><b>Type</b><span>${escapeHtml(c.type||"")}</span></div><div><b>User</b><span>${escapeHtml(c.username||c.displayName||"")} · ${escapeHtml(c.userId||"")}</span></div><div><b>Given by</b><span>${escapeHtml(c.moderatorUsername||"")} · ${escapeHtml(c.moderatorId||"")}</span></div><div><b>Created</b><span>${new Date(c.createdAt).toLocaleString()}</span></div><div><b>Status</b><span>${c.removed?"Removed":c.active?"Active":"Inactive"}</span></div><div><b>Duration</b><span>${c.durationMs?escapeHtml(String(c.durationMs))+" ms":"None / permanent"}</span></div><div><b>Related case</b><span>${escapeHtml(c.relatedCaseId||"None")}</span></div><div class="wide"><b>Reason</b><span>${escapeHtml(c.reason||"")}</span></div>${c.closureReason?`<div class="wide"><b>Closure reason</b><span>${escapeHtml(c.closureReason)}</span></div>`:""}</div>${!c.removed?`<div class="admin-case-remove"><input id="admin-case-remove-reason" class="search-input" placeholder="Reason for removing this case"><button type="button" class="btn btn-danger btn-small" id="admin-case-remove-btn">${icon("trash")} Remove case</button><span id="admin-case-remove-feedback" class="field-hint"></span></div>`:""}</div>`;
        detail.querySelector("#admin-case-remove-btn")?.addEventListener("click",async()=>{const reason=detail.querySelector("#admin-case-remove-reason")?.value?.trim();const fb=detail.querySelector("#admin-case-remove-feedback");if(!reason){fb.textContent="A reason is required.";fb.style.color="var(--red)";return;}const btn=detail.querySelector("#admin-case-remove-btn");btn.disabled=true;try{await adminApi(`/admin/moderation/cases/${encodeURIComponent(c.globalCaseId)}/remove`,{method:"POST",body:JSON.stringify({reason})});fb.textContent="Case removed.";await openAdminModerationCase(c.globalCaseId);await wireAdminModerationCases();}catch(e){fb.textContent=e.message;fb.style.color="var(--red)";}finally{btn.disabled=false;}});
    } catch(e) { detail.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`; }
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
        ${guildIconHtml(g, "server-icon", 32)}
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
function adminDirectoryAvatarHtml(profile, size = 40) {
    const fallback = "https://cdn.discordapp.com/embed/avatars/0.png";
    const url = profile?.avatarUrl || fallback;
    return `<img src="${escapeHtml(url)}" alt="" loading="lazy" decoding="async" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:1px solid var(--panel-border)" onerror="this.onerror=null;this.src='${fallback}'">`;
}
function adminDirectoryServerIconHtml(server, size = 44) {
    return guildIconHtml(server, "server-icon", size);
}
function formatDirectoryDate(value, fallback = "Unknown") {
    if (!value) return fallback;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? fallback : d.toLocaleString();
}
function adminDirectoryStat(label, value) {
    return `<div class="config-row" style="display:block"><div class="field-hint" style="margin-bottom:2px">${escapeHtml(label)}</div><div style="font-weight:600;word-break:break-word">${escapeHtml(String(value ?? "—"))}</div></div>`;
}
function wireAdminDirectory() {
    const serversTab = document.getElementById("admin-directory-servers-tab");
    const usersTab = document.getElementById("admin-directory-users-tab");
    const robloxTab = document.getElementById("admin-directory-roblox-tab");
    const emailTab = document.getElementById("admin-directory-email-tab");
    const search = document.getElementById("admin-directory-search");
    const list = document.getElementById("admin-directory-list");
    const detail = document.getElementById("admin-directory-detail");
    const heading = document.getElementById("admin-directory-heading");
    if (!serversTab || !usersTab || !robloxTab || !emailTab || !search || !list || !detail || !heading) return;
    let mode = "servers";
    let timer = null;
    let serverCache = [];
    let userCache = [];
    let directoryStats = { discord:0, roblox:0, email:0, servers:0 };
    const setMode = async next => {
        mode = next;
        serversTab.classList.toggle("btn-primary", mode === "servers");
        serversTab.classList.toggle("btn-ghost", mode !== "servers");
        usersTab.classList.toggle("btn-primary", mode === "users");
        usersTab.classList.toggle("btn-ghost", mode !== "users");
        robloxTab.classList.toggle("btn-primary", mode === "roblox");
        robloxTab.classList.toggle("btn-ghost", mode !== "roblox");
        emailTab.classList.toggle("btn-primary", mode === "email");
        emailTab.classList.toggle("btn-ghost", mode !== "email");
        search.placeholder = mode === "servers" ? "Search servers…" : mode === "users" ? "Search authenticated Discord users…" : mode === "roblox" ? "Search Roblox accounts…" : "Search email addresses…";
        heading.innerHTML = mode === "servers"
            ? `<h3 style="margin:0">All servers</h3><div class="hint">Every Discord server the NEXORIA bot is currently connected to.</div>`
            : mode === "users"
            ? `<h3 style="margin:0">Discord accounts</h3><div class="hint">Current and historically authenticated Discord accounts.</div>`
            : mode === "roblox"
            ? `<h3 style="margin:0">Roblox accounts</h3><div class="hint">Roblox accounts connected to NEXORIA.</div>`
            : `<h3 style="margin:0">Email addresses</h3><div class="hint">Email addresses connected to NEXORIA.</div>`;
        detail.style.display = "none";
        list.style.display = "block";
        await load();
    };
    const renderServers = servers => {
        if (!servers.length) { list.innerHTML = `<div class="empty-state">No servers match your search.</div>`; return; }
        list.innerHTML = servers.map(s => `<button type="button" class="config-row" data-directory-server="${escapeHtml(s.id)}" style="width:100%;text-align:left;cursor:pointer;display:flex;align-items:center;gap:10px">
            ${adminDirectoryServerIconHtml(s, 42)}
            <span style="min-width:0;flex:1"><strong style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(s.name)}</strong><span class="field-hint">${Number(s.memberCount||0).toLocaleString()} members · Owner ${escapeHtml(s.owner?.displayName || s.owner?.username || s.ownerId || "Unknown")} (${escapeHtml(s.owner?.id || s.ownerId || "—")})</span></span>
            <span class="field-hint">${icon("arrow-right",14)}</span>
        </button>`).join("");
        list.querySelectorAll("[data-directory-server]").forEach(btn => btn.addEventListener("click", () => openServer(btn.dataset.directoryServer)));
    };
    const renderUsers = users => {
        if (!users.length) { list.innerHTML = `<div class="empty-state">No authenticated users match your search.</div>`; return; }
        list.innerHTML = users.map(u => `<button type="button" class="config-row" data-directory-user="${escapeHtml(u.discordUserId)}" style="width:100%;text-align:left;cursor:pointer;display:flex;align-items:center;gap:10px">
            ${adminDirectoryAvatarHtml(u, 42)}
            <span style="min-width:0;flex:1"><strong style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(u.displayName || u.username || u.discordUserId)}</strong><span class="field-hint">${escapeHtml(u.username ? `@${u.username}` : u.discordUserId)} · ${Number(u.linkedDiscordAccounts?.length||1)} Discord · ${Number(u.linkedRobloxAccounts?.length||0)} Roblox · ${Number(u.ownedServerCount||0)} owned bot server${Number(u.ownedServerCount||0)===1?"":"s"}</span></span>
            <span class="field-hint">${icon("arrow-right",14)}</span>
        </button>`).join("");
        list.querySelectorAll("[data-directory-user]").forEach(btn => btn.addEventListener("click", () => openUser(btn.dataset.directoryUser)));
    };
    const renderAccountList = (type) => {
        const q = search.value.trim().toLowerCase();
        const rows = userCache.flatMap(u => type === "roblox" ? (u.linkedRobloxAccounts||[]).map(a => ({...a, ownerDiscordId:u.discordUserId, ownerName:u.displayName||u.username})) : (u.linkedEmails||[]).map(a => ({...a, ownerDiscordId:u.discordUserId, ownerName:u.displayName||u.username})));
        const unique = [...new Map(rows.map(r => [type === "roblox" ? String(r.id) : String(r.email), r])).values()].filter(r => `${type === "roblox" ? `${r.displayName||""} ${r.username||""} ${r.id}` : `${r.email||""}`} ${r.ownerName||""}`.toLowerCase().includes(q));
        if (!unique.length) { list.innerHTML = `<div class="empty-state">No ${type} accounts match your search.</div>`; return; }
        list.innerHTML = unique.map(a => `<button type="button" class="config-row" data-directory-account="${escapeHtml(a.ownerDiscordId)}" style="width:100%;text-align:left;display:flex;align-items:center;gap:10px">${type === "roblox" && a.avatarUrl ? `<img src="${escapeHtml(a.avatarUrl)}" alt="" style="width:42px;height:42px;border-radius:50%;object-fit:cover">` : type === "email" && a.ownerAvatarUrl ? `<img src="${escapeHtml(a.ownerAvatarUrl)}" alt="" style="width:42px;height:42px;border-radius:50%;object-fit:cover">` : `<span class="admin-linked-account-fallback">${type === "roblox" ? "R" : "@"}</span>`}<span style="min-width:0;flex:1"><strong>${escapeHtml(type === "roblox" ? (a.displayName||a.username||a.id) : a.email)}</strong><span class="field-hint" style="display:block">${type === "roblox" ? `Roblox ID ${escapeHtml(a.id)}` : "Verified email"} · ${a.linked === false ? "Disconnected" : "Connected"}</span><span class="field-hint" style="display:block">Discord: ${escapeHtml(a.ownerName||"Unknown")} (${escapeHtml(a.ownerDiscordId||"—")})</span></span>${icon("arrow-right",14)}</button>`).join("");
        list.querySelectorAll("[data-directory-account]").forEach(btn => btn.addEventListener("click", () => openUser(btn.dataset.directoryAccount)));
    };
    const renderList = () => {
        const q = search.value.trim().toLowerCase();
        if (mode === "servers") renderServers(serverCache.filter(s => `${s.name} ${s.id} ${s.owner?.username||""} ${s.owner?.displayName||""}`.toLowerCase().includes(q)));
        else if (mode === "users") renderUsers(userCache.filter(u => `${u.displayName||""} ${u.username||""} ${u.discordUserId} ${u.siteUserId||""}`.toLowerCase().includes(q)));
        else renderAccountList(mode);
    };
    async function load() {
        list.innerHTML = loadingBlock(mode === "servers" ? "Loading servers…" : mode === "users" ? "Loading Discord accounts…" : mode === "roblox" ? "Loading Roblox accounts…" : "Loading email addresses…");
        try {
            const stats = await adminApi("/admin/directory/stats"); directoryStats = stats || directoryStats;
            document.getElementById("admin-directory-discord-count")?.replaceChildren(document.createTextNode(`(${Number(directoryStats.discord||0).toLocaleString()})`));
            document.getElementById("admin-directory-roblox-count")?.replaceChildren(document.createTextNode(`(${Number(directoryStats.roblox||0).toLocaleString()})`));
            document.getElementById("admin-directory-email-count")?.replaceChildren(document.createTextNode(`(${Number(directoryStats.email||0).toLocaleString()})`));
            if (mode === "servers") { const d=await adminApi("/admin/directory/servers"); serverCache=d.servers||[]; }
            else { const d=await adminApi("/admin/directory/users"); userCache=d.users||[]; }
            renderList();
        } catch(e) { list.innerHTML = `<div class="empty-state">Couldn't load ${mode}: ${escapeHtml(e.message)}</div>`; }
    }
    async function openServer(id, returnAction = null, returnLabel = "Back to servers") {
        list.style.display = "none"; detail.style.display = "block"; detail.innerHTML = loadingBlock("Loading server details…");
        try {
            const d=await adminApi(`/admin/directory/servers/${encodeURIComponent(id)}`), s=d.server;
            const invite = s.inviteUrl ? `<a class="btn btn-primary btn-small" href="${escapeHtml(s.inviteUrl)}" target="_blank" rel="noopener">${icon("discord")} Join server</a>` : `<span class="field-hint">No usable invite is available. The bot may not have permission to create or view invites.</span>`;
            detail.innerHTML = `<button type="button" class="btn btn-ghost btn-small" data-directory-back>${icon("arrow-left")} ${escapeHtml(returnLabel)}</button>
                <div class="config-section" style="margin-top:12px">
                  <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">${adminDirectoryServerIconHtml(s, 64)}<div style="flex:1;min-width:180px"><h2 style="margin:0">${escapeHtml(s.name)}</h2><div class="field-hint">${escapeHtml(s.id)}</div></div><div>${invite}</div></div>
                  ${s.description ? `<p class="hint" style="margin:14px 0 0">${escapeHtml(s.description)}</p>` : ""}
                  <div class="admin-directory-stat-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-top:14px">
                    ${adminDirectoryStat("Server created", formatDirectoryDate(s.createdAt))}
                    ${adminDirectoryStat("Members", Number(s.memberCount||0).toLocaleString())}
                    ${adminDirectoryStat("Channels", s.channelCount)}
                    ${adminDirectoryStat("Roles", s.roleCount)}
                    ${adminDirectoryStat("Boosts", s.boosts)}
                    ${adminDirectoryStat("Boost tier", s.boostTier)}
                    ${adminDirectoryStat("Owner", `${s.owner?.displayName || s.owner?.username || "Unknown"} (${s.owner?.id || s.ownerId || "—"})`)}
                    ${adminDirectoryStat("Locale", s.preferredLocale || "—")}
                  </div>
                  <h3 style="margin-top:18px">Channels</h3><div class="field-hint" style="max-height:220px;overflow:auto">${(s.channels||[]).map(c=>`<div style="padding:4px 0"># ${escapeHtml(c.name)} <span style="opacity:.65">(${escapeHtml(c.type)})</span></div>`).join("") || "No channels available."}</div>
                  <h3 style="margin-top:18px">Roles</h3><div class="field-hint" style="max-height:220px;overflow:auto">${(s.roles||[]).map(r=>`<div style="padding:4px 0">${escapeHtml(r.name)} <span style="opacity:.65">${escapeHtml(r.id)}</span></div>`).join("") || "No roles available."}</div>
                </div>`;
            detail.querySelector("[data-directory-back]")?.addEventListener("click", () => { if (returnAction) returnAction(); else { detail.style.display="none"; list.style.display="block"; } });
        } catch(e) { detail.innerHTML = `<div class="empty-state">Couldn't load server: ${escapeHtml(e.message)}<br><button type="button" class="btn btn-ghost btn-small" data-directory-back style="margin-top:10px">${icon("arrow-left")} Back</button></div>`; detail.querySelector("[data-directory-back]")?.addEventListener("click", () => { detail.style.display="none"; list.style.display="block"; }); }
    }
    async function openUser(id) {
        list.style.display = "none"; detail.style.display = "block"; detail.innerHTML = loadingBlock("Loading user details…");
        try {
            const d=await adminApi(`/admin/directory/users/${encodeURIComponent(id)}`), u=d.user;
            const owned=u.ownedServers||[];
            detail.innerHTML = `<button type="button" class="btn btn-ghost btn-small" data-directory-back>${icon("arrow-left")} Back to users</button>
              <div class="config-section" style="margin-top:12px">
                <div style="display:flex;align-items:center;gap:12px">${adminDirectoryAvatarHtml(u,64)}<div><h2 style="margin:0">${escapeHtml(u.displayName||u.username||u.discordUserId)}</h2><div class="field-hint">@${escapeHtml(u.username||"unknown")}</div></div></div>
                <div class="admin-directory-stat-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin-top:14px">
                  ${adminDirectoryStat("Discord user ID", u.discordUserId)}
                  ${adminDirectoryStat("NEXORIA user ID", u.siteUserId)}
                  ${adminDirectoryStat("Discord account created", formatDirectoryDate(u.discordCreatedAt))}
                  ${adminDirectoryStat("First authenticated", formatDirectoryDate(u.firstAuthenticatedAt))}
                  ${adminDirectoryStat("Last authenticated", formatDirectoryDate(u.lastAuthenticatedAt || u.updatedAt))}
                  ${adminDirectoryStat("Authentication count", Number(u.authenticationCount||0))}
                  ${adminDirectoryStat("Servers owned with NEXORIA", owned.length)}
                </div>
                <div class="admin-linked-accounts" style="margin-top:18px"><h3>Integration history</h3><div class="hint">Integration connections recorded for this identity.</div><div class="admin-linked-account-grid">${(u.integrationHistory||[]).map(a=>`<div class="admin-linked-account-card">${a.avatarUrl?`<img src="${escapeHtml(a.avatarUrl)}" alt="" loading="lazy" style="width:38px;height:38px;border-radius:50%;object-fit:cover">`:`<span class="admin-linked-account-fallback">${a.type==="email"?"@":a.type==="roblox"?"R":"D"}</span>`}<div><strong>${escapeHtml(a.label||a.accountId)}</strong><span>${escapeHtml(a.type)} · ${a.current?"Connected":"Disconnected"}</span><small>Connected ${escapeHtml(formatDirectoryDate(a.connectedAt))}</small></div></div>`).join("") || `<div class="empty-state">No integration history recorded.</div>`}</div></div>
                <div class="admin-linked-accounts" style="margin-top:18px">
                  <h3>Linked accounts</h3>
                  <div class="hint">Accounts NEXORIA has locally associated through the persistent browser identity, shared network signal, or a previously linked Roblox account. A shared network can belong to different people.</div>
                  <div class="admin-linked-account-grid">
                    ${(u.linkedDiscordAccounts||[]).map(a=>`<div class="admin-linked-account-card">${adminDirectoryAvatarHtml(a,38)}<div><strong>${escapeHtml(a.displayName||a.username||a.id)}</strong><span>Discord · @${escapeHtml(a.username||"unknown")}</span><small>${escapeHtml(a.id)} · Connected ${escapeHtml(formatDirectoryDate(a.connectedAt))}</small></div></div>`).join("") || `<div class="empty-state">No linked Discord accounts recorded.</div>`}
                    ${(u.linkedRobloxAccounts||[]).map(a=>`<div class="admin-linked-account-card">${a.avatarUrl ? `<img src="${escapeHtml(a.avatarUrl)}" alt="" loading="lazy" style="width:38px;height:38px;border-radius:50%;object-fit:cover">` : `<span class="admin-linked-account-fallback">R</span>`}<div><strong>${escapeHtml(a.displayName||a.username||a.id)}</strong><span>Roblox · @${escapeHtml(a.username||"unknown")}</span><small>${escapeHtml(a.id)} · Connected ${escapeHtml(formatDirectoryDate(a.connectedAt))}</small></div></div>`).join("")}
                  </div>
                </div>
                <div class="admin-linked-accounts" style="margin-top:18px"><h3>Email history</h3><div class="hint">Verified email addresses associated with this identity.</div><div class="admin-linked-account-grid">${(u.linkedEmails||[]).map(a=>`<div class="admin-linked-account-card">${a.avatarUrl?`<img src="${escapeHtml(a.avatarUrl)}" alt="" loading="lazy" style="width:38px;height:38px;border-radius:50%;object-fit:cover">`:`<span class="admin-linked-account-fallback">@</span>`}<div><strong>${escapeHtml(a.email)}</strong><span>${a.linked ? "Connected" : "Disconnected"}</span><small>Connected ${escapeHtml(formatDirectoryDate(a.firstLinkedAt))}</small></div></div>`).join("") || `<div class="empty-state">No email history recorded.</div>`}</div></div>
                <h3 style="margin-top:18px">Servers this user is currently in</h3>
                <input type="search" class="search-input directory-detail-search" data-directory-members-search placeholder="Search servers this user is currently in…" aria-label="Search servers this user is currently in">
                <div class="directory-detail-list" id="directory-members-list">${(u.serverMemberships||[]).length ? u.serverMemberships.map(g=>`<button type="button" class="directory-server-card" data-directory-owned-server="${escapeHtml(g.id)}" data-directory-server-search="${escapeHtml(`${g.name} ${g.id}`.toLowerCase())}">${adminDirectoryServerIconHtml(g,46)}<span><strong>${escapeHtml(g.name)}</strong><small>${Number(g.memberCount||0).toLocaleString()} members · ${escapeHtml(g.id)}</small></span>${icon("arrow-right",14)}</button>`).join("") : `<div class="empty-state">This user is not currently cached as a member of any connected server.</div>`}</div>
                <h3 style="margin-top:18px">Servers this user owns where NEXORIA is installed</h3>
                <input type="search" class="search-input directory-detail-search" data-directory-owned-search placeholder="Search servers this user owns…" aria-label="Search servers this user owns">
                <div class="directory-detail-list" id="directory-owned-list">${owned.length ? owned.map(g=>`<button type="button" class="directory-server-card" data-directory-owned-server="${escapeHtml(g.id)}" data-directory-server-search="${escapeHtml(`${g.name} ${g.id}`.toLowerCase())}">${adminDirectoryServerIconHtml(g,46)}<span><strong>${escapeHtml(g.name)}</strong><small>${Number(g.memberCount||0).toLocaleString()} members · Owner ${escapeHtml(u.displayName||u.username||u.discordUserId)} (${escapeHtml(u.discordUserId)})</small></span>${icon("arrow-right",14)}</button>`).join("") : `<div class="empty-state">This user does not currently own a server where NEXORIA is installed.</div>`}</div>
              </div>`;
            detail.querySelector("[data-directory-back]")?.addEventListener("click", () => { detail.style.display="none"; list.style.display="block"; });
            detail.querySelectorAll("[data-directory-owned-server]").forEach(btn=>btn.addEventListener("click",()=>openServer(btn.dataset.directoryOwnedServer, () => openUser(id), "Back to user")));
            const wireDetailSearch = (input, listId) => input?.addEventListener("input", () => { const q=input.value.trim().toLowerCase(); detail.querySelectorAll(`#${listId} [data-directory-server-search]`).forEach(card => { card.style.display = !q || card.dataset.directoryServerSearch.includes(q) ? "flex" : "none"; }); });
            wireDetailSearch(detail.querySelector("[data-directory-members-search]"), "directory-members-list");
            wireDetailSearch(detail.querySelector("[data-directory-owned-search]"), "directory-owned-list");
        } catch(e) { detail.innerHTML = `<div class="empty-state">Couldn't load user: ${escapeHtml(e.message)}<br><button type="button" class="btn btn-ghost btn-small" data-directory-back style="margin-top:10px">${icon("arrow-left")} Back</button></div>`; detail.querySelector("[data-directory-back]")?.addEventListener("click", () => { detail.style.display="none"; list.style.display="block"; }); }
    }
    serversTab.addEventListener("click", () => void setMode("servers"));
    usersTab.addEventListener("click", () => void setMode("users"));
    robloxTab.addEventListener("click", () => void setMode("roblox"));
    emailTab.addEventListener("click", () => void setMode("email"));
    search.addEventListener("input", () => { clearTimeout(timer); timer=setTimeout(renderList,120); });
    void setMode("servers");
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
        // Older tickets may predate historical profile snapshots. Hydrate any
        // missing people from the ticket-user endpoint so the admin view does
        // not fall back to "Unknown" when Discord can still resolve the ID.
        const hydrateIds = [
            !data.opener && (data.ticket?.openedById || data.ticket?.openedBy),
            !data.claimer && (data.ticket?.claimedById || data.ticket?.claimedBy),
            !data.closer && (data.ticket?.closedById || data.ticket?.closedBy),
            ...(Array.isArray(data.viewers) ? data.viewers.filter(v => v && v.userId && !v.displayName && !v.username).map(v => v.userId) : [])
        ].filter(Boolean).map(String).filter(id => /^\d+$/.test(id));
        if (hydrateIds.length) {
            const uniqueIds = [...new Set(hydrateIds)];
            const profiles = await Promise.all(uniqueIds.map(async uid => {
                try { const r = await adminApi(`/guilds/${guildId}/tickets/${ticketId}/user/${encodeURIComponent(uid)}`); return [uid, r?.profile || null]; }
                catch { return [uid, null]; }
            }));
            const byId = Object.fromEntries(profiles.filter(([, profile]) => profile).map(([uid, profile]) => [uid, profile]));
            const pick = (profile, id) => profile || (id ? byId[String(id)] || null : null);
            data.opener = pick(data.opener, data.ticket?.openedById || data.ticket?.openedBy);
            data.claimer = pick(data.claimer, data.ticket?.claimedById || data.ticket?.claimedBy);
            data.closer = pick(data.closer, data.ticket?.closedById || data.ticket?.closedBy);
            if (Array.isArray(data.viewers)) data.viewers = data.viewers.map(v => ({ ...v, ...(byId[String(v.userId)] || {}) }));
            paintAdminTicketDetail(body, guildId, ticketId, data);
        }
    }
    catch (e) {
        body.innerHTML = `<div class="empty-state"><i class="ti ti-alert-triangle glyph"></i>Couldn't load this ticket: ${escapeHtml(e.message)}</div>`;
    }
}
function userDisplayHtml(profile, fallbackId) {
    const name = profile?.displayName || profile?.username || fallbackId || "Unknown";
    const avatar = profile?.avatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png";
    const color = profile?.highestColoredRole?.color || profile?.authorColor || "";
    const style = color ? ` style="--user-role-color:${escapeHtml(color)}"` : "";
    const uid = profile?.userId || fallbackId || "";
    return `<button type="button" class="user-display user-display-clickable" data-ticket-user-id="${escapeHtml(uid)}"${style}><img class="user-display-avatar" src="${escapeHtml(avatar)}" alt="" onerror="this.onerror=null;this.src='https://cdn.discordapp.com/embed/avatars/0.png'"><span class="user-display-name">${escapeHtml(name)}</span></button>`;
}
function transcriptSafeFileName(value) {
    return String(value || "ticket").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "ticket";
}
function transcriptPersonText(profile, fallbackId, fallbackName = "Unknown") {
    return profile?.displayName || profile?.username || fallbackName || fallbackId || "Unknown";
}
function buildTicketTranscriptHtml({ ticket, messages = [], opener, claimer, closer, guildName = "Discord server", guildIcon = null, guildId = null }) {
    const esc = value => escapeHtml(String(value ?? ""));
    const person = (profile, id, fallback = "Unknown") => profile?.displayName || profile?.username || fallback || id || "Unknown";
    const avatar = (profile) => profile?.avatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png";
    const created = ticket?.createdAt ? new Date(ticket.createdAt).toLocaleString() : "—";
    const closed = ticket?.closedAt ? new Date(ticket.closedAt).toLocaleString() : "—";
    const serverIcon = guildIcon && (guildId || ticket?.guildId) ? `https://cdn.discordapp.com/icons/${encodeURIComponent(String(guildId || ticket?.guildId))}/${encodeURIComponent(String(guildIcon))}.png?size=128` : "";
    const personHtml = (profile, id, fallback = "Unknown") => `<span class="person"><img src="${esc(avatar(profile))}" alt=""><span>${esc(person(profile, id, fallback))}</span></span>`;
    const rows = [
        ["Author", personHtml(opener, ticket?.openedById || ticket?.openedBy)],
        ["Created", esc(created)],
        ["Subject", esc(ticket?.subject || "—")],
        ["Claimed By", ticket?.claimedBy ? personHtml(claimer, ticket.claimedById || ticket.claimedBy) : `<span class="muted">Not claimed yet</span>`],
        ["Closed By", ticket?.closedBy ? personHtml(closer, ticket.closedById || ticket.closedBy) : `<span class="muted">Not closed</span>`]
    ];
    const info = rows.map(([label, value]) => `<div class="info-row"><div class="info-label">${esc(label)}</div><div class="info-value">${value}</div></div>`).join("");
    const msgHtml = (Array.isArray(messages) ? messages : []).map(m => {
        const profile = m.authorProfile || null;
        const author = m.authorName || profile?.displayName || profile?.username || m.authorId || "Unknown";
        const when = m.createdAt ? new Date(m.createdAt).toLocaleString() : "";
        const content = String(m.content || "").trim() || "(no text content)";
        const msgAvatar = m.authorAvatar || profile?.avatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png";
        return `<article class="message ${m.deleted ? "deleted" : ""}"><img class="message-avatar" src="${esc(msgAvatar)}" alt=""><div class="message-main"><div class="message-meta"><strong>${esc(author)}</strong>${m.authorIsBot ? `<span class="app-tag">APP</span>` : ""}${m.authorIsStaff ? `<span class="staff-tag">STAFF</span>` : ""}<span class="message-time">${esc(when)}</span></div><div class="message-content">${esc(content)}</div>${Array.isArray(m.attachments) && m.attachments.length ? `<div class="attachments">Attachments: ${m.attachments.map(a => esc(a.name || a.url || "attachment")).join(", ")}</div>` : ""}</div></article>`;
    }).join("");
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(ticket?.subject || "Ticket")} — NEXORIA Transcript</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#070914;color:#eef0ff;font:14px/1.55 Inter,Segoe UI,Arial,sans-serif}.page{max-width:1320px;margin:0 auto;padding:28px}.topbar{height:54px;border-bottom:1px solid #252946;display:flex;align-items:center;gap:10px;margin:-28px -28px 22px;padding:0 28px;background:#0a0c18}.brand{font-weight:800;letter-spacing:.08em}.brand-mark{width:30px;height:30px;border-radius:50%;object-fit:cover}.layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:20px}.main,.side{background:#0c0f1e;border:1px solid #2b2f52;border-radius:14px}.main{padding:20px}.side{padding:18px;align-self:start}.server-card{display:flex;align-items:center;gap:14px;background:#101326;border:1px solid #292e52;border-radius:14px;padding:14px 16px;margin-bottom:18px}.server-icon{width:54px;height:54px;border-radius:50%;object-fit:cover;background:#151a31}.server-kicker{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#8d91ab;font-weight:700}.server-name{display:block;font-size:16px;font-weight:800}.ticket-subject{font-size:18px;font-weight:800;margin:0}.ticket-meta{color:#9ea4c0;margin-top:5px}.badge{display:inline-block;padding:3px 8px;border-radius:999px;background:#3a2030;color:#ff6b8b;font-size:11px;font-weight:700}.messages{margin-top:18px}.message{display:flex;gap:12px;background:#12162a;border:1px solid #30345b;border-radius:12px;padding:14px 16px;margin-bottom:12px}.message-avatar{width:38px;height:38px;border-radius:50%;object-fit:cover;flex:0 0 38px}.message-main{min-width:0;flex:1}.message-meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.message-meta strong{font-size:14px}.message-time{font-size:11px;color:#858ba8}.staff-tag,.app-tag{font-size:9px;border-radius:4px;padding:2px 5px;background:#7c4dff22;color:#c6b5ff;font-weight:800}.app-tag{background:#55c7f222;color:#67d5ff}.message-content{margin-top:7px;white-space:pre-wrap;overflow-wrap:anywhere}.deleted{opacity:.6}.attachments{margin-top:8px;color:#9ea4c0;font-size:12px}.side h2{font-size:16px;margin:0 0 14px}.info-row{padding:12px 0;border-top:1px solid #282c48}.info-label{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#8d91ab;font-weight:800;margin-bottom:6px}.info-value{font-weight:600}.person{display:inline-flex;align-items:center;gap:8px}.person img{width:30px;height:30px;border-radius:50%;object-fit:cover}.muted{color:#9298b2}.footer{color:#747b98;text-align:center;font-size:11px;padding:20px 0 4px}@media(max-width:850px){.layout{grid-template-columns:1fr}.page{padding:16px}.topbar{margin:-16px -16px 16px;padding:0 16px}}
</style></head><body><div class="page"><div class="topbar"><img class="brand-mark" src="${esc(siteAsset("images/logo.png"))}" alt="NEXORIA"><span class="brand">NEXORIA</span></div><div class="layout"><main class="main"><div class="server-card">${serverIcon ? `<img class="server-icon" src="${esc(serverIcon)}" alt="">` : `<img class="server-icon" src="${esc(siteAsset("images/logo.png"))}" alt="">`}<div><div class="server-kicker">SERVER</div><span class="server-name">${esc(guildName)}</span><div class="ticket-meta">Ticket #${esc(ticket?.number ?? ticket?.id ?? "")}</div></div></div><h1 class="ticket-subject">${esc(ticket?.subject || "No subject")} <span class="ticket-meta">#${esc(ticket?.number ?? ticket?.id ?? "")}</span></h1><div class="ticket-meta"><span class="badge">${esc(ticket?.status || "open")}</span> · ${esc(ticket?.subject || "General")} · Created ${esc(created)}</div><div class="messages">${msgHtml || `<div class="muted">No messages were sent in this ticket.</div>`}</div></main><aside class="side"><h2>Ticket Information</h2>${info}<div class="info-row"><div class="info-label">Status</div><div class="info-value">${esc(ticket?.status || "—")}</div></div></aside></div><div class="footer">NEXORIA Ticket Transcript · Generated ${esc(new Date().toLocaleString())}</div></div></body></html>`;
}
function downloadTicketTranscript({ ticket, messages, opener, claimer, closer, guildName, guildIcon, guildId = null }) {
    const html = buildTicketTranscriptHtml({ ticket, messages, opener, claimer, closer, guildName, guildIcon, guildId });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const number = ticket?.number ?? ticket?.id ?? "ticket";
    const subject = transcriptSafeFileName(ticket?.subject || "ticket");
    const a = document.createElement("a");
    a.href = url;
    a.download = `ticket-${transcriptSafeFileName(number)}-${subject}-transcript.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function transcriptDownloadButton(id = "ticket-transcript-download") {
    return `<button type="button" class="btn btn-ghost btn-small" id="${escapeHtml(id)}">${icon("download")} Download Transcript</button>`;
}
function paintAdminTicketDetail(body, guildId, ticketId, data) {
    const { ticket, messages, viewers, opener, claimer, closer, review, guildName, guildIcon } = data;
    const status = String(ticket.status || "open").toLowerCase();
    const ticketGuild = { id: guildId, name: guildName || "Discord server", icon: guildIcon || "" };
    body.innerHTML = `
    <div class="ticket-detail-layout admin-ticket-detail-layout" data-ticket-guild="${escapeHtml(guildId)}" data-ticket-id="${escapeHtml(ticketId)}">
      <div class="ticket-detail-main">
        <div class="ticket-server-profile"><span class="ticket-server-profile-icon-wrap">${guildIconHtml(ticketGuild, "ticket-server-profile-icon", 96)}</span><div><span class="ticket-server-profile-kicker">SERVER</span><strong>${escapeHtml(guildName || "Discord server")}</strong><small>Server #${escapeHtml(String(ticket.number ?? ticket.id))} · Global #${escapeHtml(String(ticket.globalNumber ?? ticket.id))}</small></div></div>
        <div class="admin-ticket-title-row" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap"><h3 class="admin-ticket-subject">${escapeHtml(ticket.subject || "No subject")} <span class="field-hint" style="font-weight:400">#${escapeHtml(String(ticket.number ?? ticket.id))}</span></h3>${transcriptDownloadButton("admin-ticket-transcript-download")}</div>
        <div class="field-hint admin-ticket-meta-line"><span class="badge badge-${escapeHtml(status)}">${escapeHtml(status)}</span> · ${escapeHtml(ticket.subject || "General")} · Created ${timeAgoGlobal(ticket.createdAt)}</div>
        <div class="transcript-body admin-ticket-transcript-body">
          ${!Array.isArray(messages) || messages.length === 0
        ? `<div class="empty-state"><i class="ti ti-message-off glyph"></i>No messages were sent in this ticket.</div>`
        : messages.map(m => {
            const profile = m.authorProfile || null;
            const displayName = m.authorName || profile?.displayName || profile?.username || m.authorId || "Unknown";
            const avatar = m.authorAvatar || profile?.avatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png";
            const roleColor = m.authorColor || profile?.highestColoredRole?.color || "";
            const uid = m.authorId || profile?.userId || "";
            return `
            <div class="msg-container ${m.deleted ? "deleted" : ""}" style="${roleColor ? `--message-role-color:${escapeHtml(roleColor)};border-left-color:${escapeHtml(roleColor)}` : ""}">
              <button type="button" class="msg-container-avatar-button user-display-clickable" data-ticket-user-id="${escapeHtml(uid)}" aria-label="View ${escapeHtml(displayName)}">
                <img class="msg-container-avatar" src="${escapeHtml(avatar)}" alt="">
              </button>
              <div class="msg-container-body">
                <div class="msg-container-meta">
                  <button type="button" class="msg-container-author user-display-clickable" data-ticket-user-id="${escapeHtml(uid)}"${roleColor ? ` style="color:${escapeHtml(roleColor)}"` : ""}>${escapeHtml(displayName)}</button>
                  ${m.authorIsBot ? `<span class="staff-tag" style="background:rgba(125,211,252,.14);color:var(--sky, #7dd3fc)">APP</span>` : ""}
                  ${m.authorIsStaff ? `<span class="staff-tag">STAFF</span>` : ""}
                  <span class="msg-container-time">${new Date(m.createdAt).toLocaleString()}</span>
                  ${m.deleted ? `<span class="transcript-msg-deleted-tag"><i class="ti ti-trash"></i> deleted</span>` : ""}
                </div>
                <div class="msg-container-content">${escapeHtml(m.content) || `<span class="field-hint">(no text content)</span>`}</div>
              </div>
            </div>`;
        }).join("")}
        </div>
      </div>

      <aside class="ticket-detail-sidebar admin-ticket-sidebar">
        <h4>Ticket Information</h4>
        <div class="ticket-info-row"><i class="ti ti-user"></i><div><div class="ticket-info-label">Author</div><div class="ticket-info-val">${userDisplayHtml(opener, ticket.openedById || ticket.openedBy)}</div></div></div>
        <div class="ticket-info-row">${icon("calendar")}<div><div class="ticket-info-label">Created</div><div class="ticket-info-val">${timeAgoGlobal(ticket.createdAt)}</div></div></div>
        <div class="ticket-info-row"><i class="ti ti-tag"></i><div><div class="ticket-info-label">Subject</div><div class="ticket-info-val"><span class="cc-trigger-chip" style="background:rgba(139,92,246,.14);color:var(--violet);border-color:rgba(139,92,246,.3)">${escapeHtml(ticket.subject || "—")}</span></div></div></div>
        <div class="ticket-info-row"><i class="ti ti-lock"></i><div><div class="ticket-info-label">Claimed By</div><div class="ticket-info-val">${ticket.claimedBy ? userDisplayHtml(claimer, ticket.claimedById || ticket.claimedBy) : `<span class="field-hint">Not claimed yet</span>`}</div></div></div>
        ${status === "closed" ? `<div class="ticket-info-row"><i class="ti ti-lock-check"></i><div><div class="ticket-info-label">Closed By</div><div class="ticket-info-val">${userDisplayHtml(closer, ticket.closedById || ticket.closedBy)}</div><div class="field-hint">${timeAgoGlobal(ticket.closedAt)}</div></div></div>` : `<div class="field-hint admin-ticket-open-note"><i class="ti ti-lock-open"></i> This ticket hasn't been closed yet.</div>`}
        <div class="ticket-share-block"><div class="ticket-info-label">Ticket sharing administration</div><div class="field-hint" style="margin:6px 0 8px">Force sharing on or off for this ticket. Server owners cannot control ticket sharing globally.</div><button type="button" class="btn btn-ghost btn-small ${ticket.sharingEnabled ? "danger" : ""}" id="admin-ticket-sharing-toggle">${ticket.sharingEnabled ? "Force sharing OFF" : "Force sharing ON"}</button></div>
        <div class="ticket-share-block"><div class="ticket-info-label">Customer review</div>${review ? `<div style="display:flex;align-items:center;gap:10px;margin-top:8px"><span class="cc-trigger-chip" style="background:rgba(139,92,246,.14);color:var(--violet);border-color:rgba(139,92,246,.3)">${Number(review.rating).toFixed(1)} / 10</span><span class="field-hint">${review.updatedAt || review.createdAt ? escapeHtml(new Date(review.updatedAt || review.createdAt).toLocaleString()) : ""}</span></div><div class="field-hint" style="margin-top:6px">Visible here because this is the NEXORIA Admin Panel. Server owners, co-owners and staff do not see private review scores.</div>` : `<div class="field-hint">No review has been submitted for this ticket yet.</div>`}</div>
        <div class="ticket-share-block"><div class="ticket-info-label">Viewers</div>${Array.isArray(viewers) && viewers.length ? `<div class="ticket-viewers-list">${viewers.map(v => `<div class="ticket-viewer-row">${userDisplayHtml(v, v.userId)}<span class="ticket-viewer-time">${new Date(v.viewedAt).toLocaleString()}</span></div>`).join("")}</div>` : `<div class="field-hint">No one has viewed this ticket yet.</div>`}</div>
      </aside>
    </div>`;
    document.getElementById("admin-ticket-transcript-download")?.addEventListener("click", () => downloadTicketTranscript({ ticket, messages, opener, claimer, closer, guildName, guildIcon, guildId }));
    document.getElementById("admin-ticket-sharing-toggle")?.addEventListener("click", async (e) => {
        const btn = e.currentTarget; const enabled = !ticket.sharingEnabled; btn.disabled = true;
        try {
            await adminApi(`/admin/guilds/${encodeURIComponent(guildId)}/tickets/${encodeURIComponent(ticketId)}/sharing`, { method:"PUT", body:JSON.stringify({ enabled }) });
            const fresh = await adminApi(`/admin/guilds/${encodeURIComponent(guildId)}/tickets/${encodeURIComponent(ticketId)}`);
            paintAdminTicketDetail(body, guildId, ticketId, fresh);
        } catch (err) { await DCModal.alert(err.message || "Could not update ticket sharing.", { title:"Couldn't update ticket sharing" }); btn.disabled = false; }
    });
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
        const ticketContent = (t) => {
            const messages = Array.isArray(t.messages) ? t.messages : [];
            const opening = messages.find(m => String(m?.content || "").trim());
            const content = String(opening?.content || t.content || t.lastMessageContent || "").trim();
            return content || "—";
        };
        resultsSlot.innerHTML = `
      <div class="ticket-table admin-ticket-search-table">
        <div class="ticket-row head" style="grid-template-columns:90px 1fr 1fr 1.35fr 100px 120px"><span>Server # / Global #</span><span>Server</span><span>Subject</span><span>Content</span><span>Status</span><span>Created</span></div>
        ${tickets.slice(0, 50).map(t => `
          <div class="ticket-row ticket-row-clickable" style="grid-template-columns:90px 1fr 1fr 1.35fr 100px 120px" data-admin-ticket="${t.guildId}:${t.id}">
            <span>#${escapeHtml(String(t.number ?? t.id))}<small style="display:block;color:var(--text-dim)">G#${escapeHtml(String(t.globalNumber ?? t.id))}</small></span>
            <span>${escapeHtml(t.guildName || "Unknown")}</span>
            <span>${escapeHtml(t.subject || "—")}</span>
            <span class="ticket-content-preview" title="${escapeHtml(ticketContent(t))}">${escapeHtml(ticketContent(t))}</span>
            <span class="badge badge-${escapeHtml(t.status)}">${escapeHtml(t.status)}</span>
            <span>${timeAgoGlobal(t.createdAt)}</span>
          </div>`).join("")}
      </div>`;
        resultsSlot.querySelectorAll("[data-admin-ticket]").forEach(row => row.addEventListener("click", () => {
            setAdminFolderState("tickets");
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
    <div id="my-tickets-list">${loadingBlock("Loading tickets…")}</div>`;
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
    function uniqueServersNow() {
        const map = new Map();
        for (const t of tickets) {
            const id = String(t.guildId || t.guildName || "");
            if (!id || map.has(id)) continue;
            map.set(id, { id, name: t.guildName || "Unknown server", icon: t.guildIcon || null, iconUrl: t.guildIconUrl || null });
        }
        return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
    }
    function paintServerOptions(query) {
        const q = (query || "").toLowerCase();
        const opts = uniqueServersNow().filter(s => s.name.toLowerCase().includes(q));
        document.getElementById("mt-server-options").innerHTML = opts.map(s => `<div class="dropdown-panel-item" data-mt-server-opt="${escapeHtml(s.id)}" data-mt-server-name="${escapeHtml(s.name)}"><span style="display:flex;align-items:center;gap:9px">${guildIconHtml(s,"server-icon",40)}<span>${escapeHtml(s.name)}</span></span></div>`).join("") || `<div class="dropdown-panel-empty">No matches</div>`;
        document.querySelectorAll("[data-mt-server-opt]").forEach(item => item.addEventListener("click", () => {
            filters.server = item.dataset.mtServerName;
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
document.addEventListener("click", (event) => {
    if (event.target.closest?.(".dropdown-panel-floating") || event.target.closest?.("[data-dropdown-button], .dropdown-anchor, .dropdown-panel-item")) return;
    closeAllFloatingDropdowns();
});
document.addEventListener("click", async (event) => {
    const el = event.target.closest?.("[data-ticket-user-id]");
    if (!el) return;
    event.stopPropagation();
    const wrap = el.closest("[data-ticket-guild][data-ticket-id]");
    if (!wrap) return;
    try {
        const p = await api(`/guilds/${encodeURIComponent(wrap.dataset.ticketGuild)}/tickets/${encodeURIComponent(wrap.dataset.ticketId)}/user/${encodeURIComponent(el.dataset.ticketUserId)}?requesterId=${encodeURIComponent(getSession()?.user?.id || "")}`);
        const profile = p.profile || {};
        const roles = Array.isArray(profile.roles) ? profile.roles : [];
        const roleHtml = roles.length ? roles.map(r => `<span class="ticket-profile-role" style="${r.color ? `--role-color:${escapeHtml(r.color)}` : ""}"><span class="ticket-profile-role-dot"></span>${escapeHtml(r.name)}</span>`).join("") : `<span class="field-hint">No roles were recorded.</span>`;
        DCModal.custom(`<div class="dc-modal-header"><h3>${escapeHtml(profile.displayName || profile.username || "Discord user")}</h3><p>@${escapeHtml(profile.username || "unknown")} · ${escapeHtml(profile.userId || "—")}</p></div><div class="dc-modal-body"><div class="ticket-profile-hero"><img src="${escapeHtml(profile.avatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png")}" alt=""><div><strong>${escapeHtml(profile.displayName || profile.username || "Unknown")}</strong><span>@${escapeHtml(profile.username || "unknown")}</span><span>User ID: ${escapeHtml(profile.userId || "—")}</span></div></div><div class="ticket-profile-section"><label>Highest colored role at time of ticket activity</label>${profile.highestColoredRole ? `<div class="ticket-profile-role featured" style="--role-color:${escapeHtml(profile.highestColoredRole.color || "#8D5BFF")}"><span class="ticket-profile-role-dot"></span>${escapeHtml(profile.highestColoredRole.name)}</div>` : `<div class="field-hint">No colored role was recorded.</div>`}</div><div class="ticket-profile-section"><label>Roles recorded at that time</label><div class="ticket-profile-roles">${roleHtml}</div></div><div class="field-hint" style="margin-top:14px">${profile.capturedAt ? `Snapshot captured ${new Date(profile.capturedAt).toLocaleString()}.` : "No historical snapshot was available; current Discord profile data was used."}</div></div><div class="dc-modal-footer"><button class="btn btn-primary btn-small" type="button" id="ticket-profile-close">Close</button></div>`, { maxWidth:"620px", onMount: r => r.querySelector("#ticket-profile-close")?.addEventListener("click",()=>DCModal.close()) });
    } catch (e) { DCModal.alert(e.message || "Couldn't load the Discord profile.", { title:"Profile unavailable" }); }
}, true);

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
        server: (t) => `<span style="display:flex;align-items:center;gap:8px">${guildIconHtml({id:t.guildId,icon:t.guildIcon,iconUrl:t.guildIconUrl,name:t.guildName||"Unknown server"}, "server-icon", 32)} ${escapeHtml(t.guildName || "Unknown server")}</span>`,
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
    const { ticket, messages, hasLog, opener, claimer, closer, guildName, guildIcon } = data;
    const canManagePrivateTicket = String(session?.user?.id || "") === String(ticket?.openedById || "");
    const ticketGuild = { id: guildId, name: guildName || "Discord server", icon: guildIcon || "" };
    body.innerHTML = `
    <div class="ticket-detail-layout" data-ticket-guild="${escapeHtml(guildId)}" data-ticket-id="${escapeHtml(ticketId)}">
      <div class="ticket-detail-main">
        <div class="ticket-server-profile">${guildIconHtml(ticketGuild, "ticket-server-profile-icon", 96)}<div><span class="ticket-server-profile-kicker">SERVER</span><strong>${escapeHtml(guildName || "Discord server")}</strong><small>Ticket #${escapeHtml(String(ticket.number ?? ticket.id))}</small></div></div>
        <h3 style="font-size:16px;font-weight:700">${escapeHtml(ticket.subject || "No subject")} <span class="field-hint" style="font-weight:400">Server #${escapeHtml(String(ticket.number ?? ticket.id))} · Global #${escapeHtml(String(ticket.globalNumber ?? ticket.id))}</span></h3>
        <div class="field-hint" style="margin:6px 0 14px"><span class="badge badge-${ticket.status}">${ticket.status}</span> · ${escapeHtml(ticket.subject || "General")} · Created ${timeAgoGlobal(ticket.createdAt)}</div>
        <div style="display:flex;justify-content:flex-end;margin:0 0 10px">${transcriptDownloadButton("my-ticket-transcript-download")}</div>
        <div class="transcript-body" style="max-height:60vh">
          ${!hasLog
        ? `<div class="empty-state"><i class="ti ti-message-off glyph"></i>No message log available for this ticket.</div>`
        : messages.length === 0
            ? `<div class="empty-state"><i class="ti ti-message-off glyph"></i>No messages were sent in this ticket.</div>`
            : messages.map(m => `
                <div class="msg-container ${m.deleted ? "deleted" : ""}" style="${m.authorColor ? `--message-role-color:${escapeHtml(m.authorColor)};border-left-color:${escapeHtml(m.authorColor)}` : ""}">
                  <img class="msg-container-avatar" src="${m.authorAvatar ? escapeHtml(m.authorAvatar) : "https://cdn.discordapp.com/embed/avatars/0.png"}" alt="">
                  <div class="msg-container-body">
                    <div class="msg-container-meta">
                      <span class="msg-container-author" style="${m.authorColor ? `color:${escapeHtml(m.authorColor)}` : ""}">${escapeHtml(m.authorName)}</span>
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
        <div class="ticket-info-row"><i class="ti ti-lock"></i><div><div class="ticket-info-label">Claimed By</div><div class="ticket-info-val">${ticket.claimedBy ? userDisplayHtml(claimer, ticket.claimedById || ticket.claimedBy) : `<span class="field-hint">Not claimed yet</span>`}</div>${ticket.claimedById && String(ticket.claimedById) === String(session?.user?.id) && ticket.status !== "closed" ? `<button type="button" class="btn btn-ghost btn-small" id="ticket-unclaim-btn" style="margin-top:8px">${icon("unlock")} Unclaim ticket</button>` : ""}</div></div>
        ${ticket.status === "closed" ? `
        <div class="ticket-info-row"><i class="ti ti-lock-check"></i><div><div class="ticket-info-label">Closed By</div><div class="ticket-info-val">${userDisplayHtml(closer, ticket.closedById || ticket.closedBy)}</div><div class="field-hint">${timeAgoGlobal(ticket.closedAt)}</div></div></div>`
        : `<div class="field-hint" style="margin-top:8px"><i class="ti ti-lock-open"></i> This ticket hasn't been closed yet.</div>`}
        ${canManagePrivateTicket ? `<div class="ticket-share-block" id="ticket-share-block-wrap"><div id="ticket-share-controls">${loadingBlock("")}</div></div>` : ""}
        ${canManagePrivateTicket ? `<div class="ticket-share-block" id="ticket-review-block"><div id="ticket-review-controls">${loadingBlock("")}</div></div>` : ""}
      </div>
    </div>`;
    document.getElementById("my-ticket-transcript-download")?.addEventListener("click", () => downloadTicketTranscript({ ticket, messages, opener, claimer, closer, guildName, guildIcon, guildId }));
    document.getElementById("ticket-unclaim-btn")?.addEventListener("click", async () => {
        const btn = document.getElementById("ticket-unclaim-btn"); if (!btn) return; btn.disabled = true;
        try { await api(`/guilds/${guildId}/tickets/${ticketId}/unclaim`, { method:"POST", body:JSON.stringify({ requesterId: session?.user?.id || "" }) }); await paintTicketDetailBody(body, guildId, ticketId); }
        catch(e) { btn.disabled = false; await DCModal.alert(e.message || "Could not unclaim ticket.", { title:"Couldn't unclaim ticket" }); }
    });
    if (canManagePrivateTicket) {
        paintTicketShareControls(document.getElementById("ticket-share-controls"), guildId, ticketId, ticket);
        if (document.getElementById("ticket-review-controls")) paintTicketReviewControls(document.getElementById("ticket-review-controls"), guildId, ticketId, ticket);
    }
}
async function paintTicketReviewControls(slot, guildId, ticketId, ticket) {
    const session = getSession();
    try {
        const d = await api(`/guilds/${guildId}/tickets/${ticketId}/review?requesterId=${encodeURIComponent(session?.user?.id || "")}`);
        let selected = d.review?.rating || 0;
        selected = Math.max(0, Math.min(10, Number(selected) || 0));
        slot.innerHTML = `<div class="config-row-label">Private support review</div><div class="field-hint" style="margin:6px 0 10px">Choose any score from 0 to 10. You can type a value or use the controls in 0.1 steps.</div><div class="rating-editor"><input id="ticket-review-range" type="range" min="0" max="10" step="0.1" value="${selected}" aria-label="Support score"><div class="rating-editor-row"><input id="ticket-review-number" type="number" min="0" max="10" step="0.1" value="${selected.toFixed(1)}" inputmode="decimal" aria-label="Support score value"><span>/ 10</span></div></div><div class="field-row-inline" style="margin-top:8px"><button class="btn btn-primary btn-small" id="ticket-review-save">${icon("star")} ${d.review ? `Update ${selected.toFixed(1)}/10` : `Submit score`}</button>${d.review ? `<button class="btn btn-ghost btn-small" id="ticket-review-remove">Remove review</button>` : ""}</div>`;
        const range=slot.querySelector("#ticket-review-range"), number=slot.querySelector("#ticket-review-number"), save=slot.querySelector("#ticket-review-save");
        const sync=(value)=>{ let n=Math.max(0,Math.min(10,Math.round(Number(value||0)*10)/10)); selected=n; range.value=String(n); number.value=n.toFixed(1); save.textContent=`Update ${n.toFixed(1)}/10`; };
        range.addEventListener("input",()=>sync(range.value)); number.addEventListener("input",()=>sync(number.value));
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
    const session = getSession();
    const forcedOn = Boolean(ticket.sharingForcedByAdminId);
    const forcedOff = Boolean(ticket.sharingDisabledByAdminId);
    const sharingEnabled = ticket.sharingEnabled === true;
    const shareUrl = ticket.currentShareId ? `${window.location.origin}${getSiteBasePath().replace(/\/$/, "")}/share/${ticket.currentShareId}` : null;
    let message = "Sharing is off for this ticket. You can enable it here whenever you want.";
    if (forcedOn) message = "An administrator force-enabled sharing for this ticket. Only an administrator can disable it.";
    if (forcedOff) message = "Ticket sharing was disabled by an administrator. Contact your server administrator first; if that does not resolve it, contact NEXORIA administrators in the NEXORIA Community Discord.";
    slot.innerHTML = `<div class="config-row-label" style="margin-bottom:8px">Ticket sharing</div>
      <div class="field-hint" style="margin-bottom:8px">${message}</div>` +
      (forcedOff ? `<div class="field-hint" style="color:var(--red)">Sharing cannot be re-enabled from this ticket while an administrator's restriction is active.</div>` :
       !sharingEnabled ? `<button class="btn btn-primary btn-small" id="ticket-share-enable">${icon("link")} Enable sharing</button>` :
       shareUrl ? `<div class="dc-share-link"><input type="text" readonly value="${escapeHtml(shareUrl)}" id="ticket-share-url"></div><div class="field-row-inline" style="margin-top:8px"><button class="btn btn-ghost btn-small" id="ticket-share-copy">${icon("copy")} Copy</button><button class="btn btn-ghost btn-small" id="ticket-share-regen">${icon("refresh")} Regenerate</button>${!forcedOn ? `<button class="btn btn-ghost btn-small danger" id="ticket-share-disable">${icon("link-off")} Disable sharing</button>` : ""}</div>` : `<button class="btn btn-primary btn-small" id="ticket-share-create">${icon("link")} Create share link</button>`);
    const enableBtn = document.getElementById("ticket-share-enable");
    if (enableBtn) enableBtn.addEventListener("click", async () => {
        enableBtn.disabled = true;
        try { await api(`/guilds/${guildId}/tickets/${ticketId}/sharing`, { method:"PUT", body:JSON.stringify({ enabled:true, requesterId:session?.user?.id||"" }) }); await refreshShareControls(); }
        catch (e) { await DCModal.alert(e.message || "Couldn't enable sharing.", { title:"Ticket sharing unavailable" }); }
        finally { enableBtn.disabled = false; }
    });
    const createBtn = document.getElementById("ticket-share-create");
    if (createBtn) createBtn.addEventListener("click", async () => { try { await api(`/guilds/${guildId}/tickets/${ticketId}/share`, { method:"POST", body:JSON.stringify({ requesterId:session?.user?.id }) }); await refreshShareControls(); } catch(e) { await DCModal.alert(`Couldn't create share link: ${e.message}`); } });
    const copyBtn = document.getElementById("ticket-share-copy");
    if (copyBtn) copyBtn.addEventListener("click", () => { const input=document.getElementById("ticket-share-url"); input?.select(); navigator.clipboard?.writeText(shareUrl).catch(()=>{}); });
    const disableBtn = document.getElementById("ticket-share-disable");
    if (disableBtn) disableBtn.addEventListener("click", async () => { const ok=await DCModal.confirm("This disables sharing for this ticket and immediately invalidates the current public link. You can enable sharing again later.",{title:"Disable ticket sharing",confirmLabel:"Disable",danger:true}); if(!ok)return; try { await api(`/guilds/${guildId}/tickets/${ticketId}/sharing`,{method:"PUT",body:JSON.stringify({enabled:false,requesterId:session?.user?.id||""})}); await refreshShareControls(); } catch(e){ await DCModal.alert(`Couldn't disable sharing: ${e.message}`); } });
    const regenBtn = document.getElementById("ticket-share-regen");
    if (regenBtn) regenBtn.addEventListener("click", async () => { const ok=await DCModal.confirm("The old link will stop working immediately. Continue?",{title:"Regenerate share link",confirmLabel:"Regenerate"}); if(!ok)return; try { await api(`/guilds/${guildId}/tickets/${ticketId}/share`,{method:"POST",body:JSON.stringify({requesterId:session?.user?.id})}); await refreshShareControls(); } catch(e){ await DCModal.alert(`Couldn't regenerate: ${e.message}`); } });
    async function refreshShareControls(){ try { const fresh=await api(`/guilds/${guildId}/tickets/${ticketId}/transcript?requesterId=${session?.user?.id||""}`); paintTicketShareControls(slot,guildId,ticketId,fresh.ticket); } catch{} }
}

async function enterSharePage(shareId) {
    showScreen("screen-share");
    const root = document.getElementById("share-root");
    root.innerHTML = loadingBlock("Loading ticket…");
    try {
        const data = await api(`/share/tickets/${shareId}`);
        const { ticket, guildName, guildIcon, messages, opener, claimer, closer } = data;
        const profileHtml = (profile, fallback) => {
            const name = profile?.displayName || profile?.username || fallback || "Unknown";
            const avatar = profile?.avatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png";
            return `<span class="shared-ticket-person"><img src="${escapeHtml(avatar)}" alt=""><strong>${escapeHtml(name)}</strong></span>`;
        };
        const infoRow = (label, value) => `<div class="shared-ticket-info-row"><span class="shared-ticket-info-label">${escapeHtml(label)}</span><span class="shared-ticket-info-value">${value}</span></div>`;
        root.innerHTML = `
      <div class="brand-row" style="margin-bottom:18px"><div class="brand-glyph"><img src="${siteAsset("images/logo.png")}" alt="NEXORIA logo"></div>NEXORIA</div>
      <div class="modal-panel shared-ticket-page" style="max-width:980px;max-height:none;margin:0 auto">
        <div class="transcript-header">
          <div>
            <h3 style="font-size:16px;font-weight:700">${escapeHtml(ticket.subject || "No subject")} <span class="field-hint" style="font-weight:400">#${escapeHtml(String(ticket.number ?? ticket.id))}</span></h3>
            <div class="field-hint" style="margin-top:2px">${escapeHtml(guildName)} · <span class="badge badge-${escapeHtml(ticket.status)}">${escapeHtml(ticket.status)}</span></div>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;margin:-4px 0 12px">${transcriptDownloadButton("shared-ticket-transcript-download")}</div>
        <div class="shared-ticket-info-grid">
          ${infoRow("Author", profileHtml(opener, ticket.openedById || ticket.openedBy))}
          ${infoRow("Created", timeAgoGlobal(ticket.createdAt))}
          ${infoRow("Subject", escapeHtml(ticket.subject || "—"))}
          ${infoRow("Claimed By", ticket.claimedBy ? profileHtml(claimer, ticket.claimedById || ticket.claimedBy) : "<span class=\"field-hint\">Not claimed yet</span>")}
          ${infoRow("Closed By", ticket.closedBy ? profileHtml(closer, ticket.closedById || ticket.closedBy) : "<span class=\"field-hint\">Not closed</span>")}
        </div>
        <div class="field-hint shared-ticket-private-note">Ticket ratings and other private review information are not displayed on shared ticket pages.</div>
        <div class="transcript-body" style="max-height:70vh">
          ${messages.length === 0
            ? `<div class="empty-state"><i class="ti ti-message-off glyph"></i>No messages were sent in this ticket.</div>`
            : messages.map(m => `
              <div class="transcript-msg ${m.deleted ? "deleted" : ""}">
                <img class="transcript-msg-avatar" src="${m.authorAvatar ? escapeHtml(m.authorAvatar) : "https://cdn.discordapp.com/embed/avatars/0.png"}" alt="">
                <div class="transcript-msg-body">
                  <div class="transcript-msg-meta">
                    <span class="transcript-msg-author">${escapeHtml(m.authorName || "Unknown")}</span>
                    ${m.authorIsStaff ? `<span class="staff-tag">STAFF</span>` : ""}
                    <span class="transcript-msg-time">${new Date(m.createdAt).toLocaleString()}</span>
                  </div>
                  <div class="transcript-msg-content">${escapeHtml(m.content) || `<span class="field-hint">(no text content)</span>`}</div>
                </div>
              </div>`).join("")}
        </div>
      </div>`;
        document.getElementById("shared-ticket-transcript-download")?.addEventListener("click", () => downloadTicketTranscript({ ticket, messages, opener, claimer, closer, guildName, guildIcon, guildId: ticket.guildId || null }));
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
                        if (window.DC?.pageDirty) return;
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
                { id: "moderation", js: "moderation/Code/moderation.js", css: "moderation/Code/moderation.css", advancedJs: null },
                { id: "logging", js: "logging/Code/logging.js", css: "logging/Code/logging.css", advancedJs: null },
                { id: "honeypot", js: "honeypot/Code/honeypot.js", css: "honeypot/Code/honeypot.css", advancedJs: null },
                { id: "verification", js: "verification/Code/verification.js", css: "verification/Code/verification.css", advancedJs: null },
                { id: "member-automation", js: "member-automation/Code/member-automation.js", css: "member-automation/Code/member-automation.css", advancedJs: null },
                { id: "reaction-roles", js: "reaction-roles/Code/reaction-roles.js", css: "reaction-roles/Code/reaction-roles.css", advancedJs: null },
                { id: "webhook", js: "webhook/Code/webhook.js", css: "webhook/Code/webhook.css", advancedJs: null },
                { id: "setup", js: "setup/Code/setup.js", css: "setup/Code/setup.css", advancedJs: null },
            ]
        };
        try {
            let manifest = null;
            try { manifest = await api("/modules"); }
            catch (e) { console.warn("[modules] Bot module manifest unavailable; using local module manifest.", e); }
            manifest = manifest && Array.isArray(manifest.modules) ? manifest : localManifest;
            // Merge the server manifest with the browser-known manifest.  A stale
            // bot process can temporarily omit a module from /modules even though
            // its static asset is present; the dashboard should still be able to
            // load that module instead of declaring it unavailable.
            const knownModules = new Map(localManifest.modules.map(m => [m.id, m]));
            for (const mod of (manifest.modules || [])) knownModules.set(mod.id, { ...knownModules.get(mod.id), ...mod });
            manifest.modules = [...knownModules.values()];
            const shared = Array.isArray(manifest.shared) && manifest.shared.length ? [...new Set([...localManifest.shared, ...manifest.shared])] : localManifest.shared;
            for (const file of shared) {
                try {
                    await loadScript(versionedAsset(`${(activeBotUrl || CFG.LOCAL_BOT_URL)}/modules-static/${file}`));
                } catch (e) {
                    failures.push({ file, error: e });
                    console.warn(`[modules] Shared file ${file} failed to load; continuing.`, e);
                }
            }
            const moduleList = manifest.modules.length ? manifest.modules : localManifest.modules;
            window.DC.moduleDefaultOrder = moduleList.map(m => String(m.id || "")).filter(Boolean);
            for (const mod of moduleList) {
                if (mod.css) loadStyle(versionedAsset(`${(activeBotUrl || CFG.LOCAL_BOT_URL)}/modules-static/${mod.css}`));
                if (mod.js) {
                    try { await loadScript(versionedAsset(`${(activeBotUrl || CFG.LOCAL_BOT_URL)}/modules-static/${mod.js}`)); }
                    catch (e) { failures.push({ file: mod.js, error: e }); console.warn(`[modules] ${mod.id || mod.js} failed to load; continuing.`, e); }
                }
                if (mod.advancedJs) {
                    try { await loadScript(versionedAsset(`${(activeBotUrl || CFG.LOCAL_BOT_URL)}/modules-static/${mod.advancedJs}`)); }
                    catch (e) { failures.push({ file: mod.advancedJs, error: e }); console.warn(`[modules] ${mod.id || mod.js} advanced editor failed to load; continuing.`, e); }
                }
            }
            // A partially populated registry is NOT a successful module load.  The
            // old check treated "at least one module loaded" as success, which let
            // Logging load while Ticket Tool was still missing and then permanently
            // produced "Module ticket-tool is not available yet" on first render.
            const expectedIds = moduleList.map(m => m.id).filter(Boolean);
            const missingIds = expectedIds.filter(id => !window.DC?.getModule?.(id));
            for (const id of missingIds) {
                const missing = new Error(`Module ${id} did not register itself after loading.`);
                failures.push({ file: `${id}/Code/${id}.js`, error: missing });
                // Remove an unregistered script so the next retry really executes it
                // again instead of treating the stale <script> as already loaded.
                document.querySelectorAll(`script[data-nexoria-src*="/modules-static/${id}/Code/${id}.js"]`).forEach(el => el.remove());
                showNexoriaError(missing, "Module loader");
            }
            modulesLoaded = failures.length === 0;
            if (failures.length) scheduleModulesRetry(`${failures.length} module asset(s) failed or did not register`);
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

async function moduleApi(path, options = {}) {
    return await api(path, options);
}

function buildContext(extra = {}) {
    const session = getSession();
    return {
        guildId: currentGuild.id,
        userId: session?.user?.id,
        api: (path, options) => moduleApi(path, options),
        apiBase: activeBotUrl || CFG?.LOCAL_BOT_URL || "",
        modal: DCModal,
        registerPageActions: actions => window.DC?.registerPageActions?.(actions),
        clearPageActions: () => window.DC?.clearPageActions?.(),
        routes,
        renderTicketDetail: (container, guildId, ticketId) => paintTicketDetailBody(container, guildId, ticketId),
        openerPreviewHtml,
        userDisplayHtml,
        navigateToTab: (tab) => { if (routes.go(routes.moduleUrl(currentGuild.id, currentPanelId, tab)) === false) return; switchTab(tab); },
        navigateToTicket: (ticketId) => { if (routes.go(routes.ticketUrl(currentGuild.id, currentPanelId, ticketId)) === false) return; switchToTicketView(ticketId); },
        ...extra,
    };
}
function switchToTicketView(ticketId) {
    document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.panel === currentPanelId));
    const root = document.getElementById("module-root");
    root.innerHTML = `<button class="btn btn-ghost btn-small" id="dash-ticket-back">${icon("arrow-left")} Back</button><div id="dash-ticket-body" style="margin-top:16px">${loadingBlock("Loading ticket…")}</div>`;
    document.getElementById("dash-ticket-back")?.addEventListener("click", () => { if (routes.go(routes.moduleUrl(currentGuild.id, currentPanelId)) === false) return; switchPanel(currentPanelId, false); });
    paintTicketDetailBody(document.getElementById("dash-ticket-body"), currentGuild.id, ticketId);
}
function moduleOrderStorageKey() {
    return `nexoria_module_order_${currentGuild?.id || "global"}`;
}
function getDefaultModuleIds() {
    const fallback = ["ticket-tool","custom-commands","moderation","logging","honeypot","member-automation","reaction-roles","webhook","verification","setup"];
    const manifest = Array.isArray(window.DC?.moduleDefaultOrder) && window.DC.moduleDefaultOrder.length ? window.DC.moduleDefaultOrder.map(String) : fallback;
    return manifest.filter(id => id && id !== "status");
}
function getOrderedModuleIds() {
    const available = new Set((window.DC?.modules || []).map(m => String(m?.id || "")).filter(Boolean));
    const defaults = getDefaultModuleIds().filter(id => available.size === 0 || available.has(id));
    let saved = [];
    try { const raw = JSON.parse(localStorage.getItem(moduleOrderStorageKey()) || "[]"); if (Array.isArray(raw)) saved = raw.map(String); } catch {}
    const result = [];
    for (const id of saved) if (id && id !== "status" && (available.size === 0 || available.has(id)) && !result.includes(id)) result.push(id);
    // Moderation is intentionally positioned immediately above Logging even for browsers
    // that already have an older module order saved in localStorage.
    if (result.includes("moderation") && result.includes("logging")) {
        result.splice(result.indexOf("moderation"),1);
        result.splice(result.indexOf("logging"),0,"moderation");
    }
    for (const id of defaults) if (!result.includes(id)) result.push(id);
    for (const id of available) if (!result.includes(id)) result.push(id);
    return result;
}
function persistModuleOrder(ids) {
    try { localStorage.setItem(moduleOrderStorageKey(), JSON.stringify(ids.filter(id => id && id !== "status"))); } catch {}
}
function navItemHtml(id, tablerIconUnused, label, toggleable, isEnabled) {
    const disabledClass = toggleable && !isEnabled ? "module-disabled" : "";
    const iconHtml = icon(id);
    return `<div class="nav-item ${disabledClass}" data-panel="${id}" title="${escapeHtml(label)}">
    <span class="nav-item-module-icon" data-module-icon="${escapeHtml(id)}">${iconHtml}</span><span class="nav-item-label">${escapeHtml(label)}</span>
    ${toggleable ? `<button class="toggle nav-item-toggle ${isEnabled ? "on" : ""}" data-module-toggle="${id}" aria-label="Toggle ${escapeHtml(label)}"></button>` : ""}
  </div>`;
}
const DEFAULT_MODULE_CATEGORIES = [
    { id:"moderation", label:"Moderation", icon:"gavel", emoji:"🛡️", modules:["moderation","logging","honeypot","verification"] },
    { id:"support", label:"Support", icon:"tickets", modules:["ticket-tool","custom-commands"] },
    { id:"community", label:"Community", icon:"users", modules:["member-automation","reaction-roles"] },
    { id:"integrations", label:"Integrations", icon:"link", modules:["webhook"] },
    { id:"server", label:"Server", icon:"settings", modules:["setup"] }
];
function moduleCategoryStorageKey() { return `nexoria_module_categories_${currentGuild?.id || "global"}`; }
function moduleCategoryCollapseStorageKey() { return `nexoria_module_category_collapsed_${currentGuild?.id || "global"}`; }
function getCollapsedModuleCategories() {
    try {
        const raw = JSON.parse(localStorage.getItem(moduleCategoryCollapseStorageKey()) || "[]");
        return new Set(Array.isArray(raw) ? raw.map(String) : []);
    } catch { return new Set(); }
}
function persistCollapsedModuleCategories(set) {
    try { localStorage.setItem(moduleCategoryCollapseStorageKey(), JSON.stringify([...set])); } catch {}
}
function getModuleCategories() {
    const available = new Set((window.DC?.modules || []).map(m => String(m?.id || "")).filter(Boolean));
    const fallback = DEFAULT_MODULE_CATEGORIES.map(c => ({...c, modules:[...c.modules]}));
    let saved = null;
    try { const raw = JSON.parse(localStorage.getItem(moduleCategoryStorageKey()) || "null"); if (Array.isArray(raw)) saved = raw; } catch {}
    const source = Array.isArray(saved) && saved.length ? saved : fallback;
    const categories = source.map((c,i) => ({ id:String(c?.id || `category-${i+1}`), label:String(c?.label || `Category ${i+1}`), icon:String(c?.icon || "category-2"), emoji:String(c?.emoji || ""), modules:Array.isArray(c?.modules)?c.modules.map(String):[] }));
    const moderationCategory = categories.find(c => c.id === "moderation");
    if (moderationCategory && !moderationCategory.emoji) moderationCategory.emoji = "🛡️";
    const byId = new Map(categories.map(c => [c.id,c]));
    for (const c of fallback) if (!byId.has(c.id)) { const clone={...c,modules:[...c.modules]}; categories.push(clone); byId.set(c.id,clone); }
    const seen = new Set();
    for (const c of categories) c.modules = c.modules.filter(id => available.size === 0 || available.has(id)).filter(id => !seen.has(id) && (seen.add(id), true));
    const misc = categories.find(c => c.id === "other") || (()=>{const c={id:"other",label:"Other",icon:"category-2",modules:[]};categories.push(c);return c;})();
    for (const id of available) if (!seen.has(id)) { misc.modules.push(id); seen.add(id); }
    if (!misc.modules.length && categories.at(-1)?.id === "other") categories.pop();
    return categories;
}
function persistModuleCategories(categories) {
    try { localStorage.setItem(moduleCategoryStorageKey(), JSON.stringify(categories.map(c => ({id:c.id,label:c.label,icon:c.icon,emoji:c.emoji||"",modules:c.modules})))); } catch {}
}
function sidebarSectionOrderStorageKey() { return `nexoria_sidebar_section_order_${currentGuild?.id || "global"}`; }
function getSidebarSectionOrder(categories) {
    const ids = ["__general__", ...categories.map(c => String(c.id))];
    let saved = [];
    try { const raw = JSON.parse(localStorage.getItem(sidebarSectionOrderStorageKey()) || "[]"); if (Array.isArray(raw)) saved = raw.map(String); } catch {}
    const out = [];
    for (const id of saved) if (ids.includes(id) && !out.includes(id)) out.push(id);
    for (const id of ids) if (!out.includes(id)) out.push(id);
    return out;
}
function persistSidebarSectionOrder(order) {
    try { localStorage.setItem(sidebarSectionOrderStorageKey(), JSON.stringify(order.filter(Boolean))); } catch {}
}
function buildSidebar(disabledModules) {
    disabledModules = Array.isArray(disabledModules) ? disabledModules : [];
    const wrap = document.getElementById("dash-nav-items");
    if (!wrap) return;
    const registeredModules = (Array.isArray(window.DC?.modules) ? window.DC.modules : []).filter(m => m && m.id !== "status");
    const bootModules = [
        { id:"ticket-tool", label:"Ticket Tool", icon:"tickets" }, { id:"custom-commands", label:"Custom Commands", icon:"terminal-2" },
        { id:"moderation", label:"Moderation", icon:"gavel" }, { id:"logging", label:"Logging", icon:"clipboard" },
        { id:"honeypot", label:"Nexoria Honeypot", icon:"shield" }, { id:"verification", label:"Roblox Verification", icon:"shield" },
        { id:"member-automation", label:"Member Automation", icon:"users" }, { id:"reaction-roles", label:"Reaction Roles", icon:"reaction" },
        { id:"webhook", label:"Webhooks", icon:"webhook" }, { id:"setup", label:"Setup", icon:"settings" }
    ];
    const sourceModules = registeredModules.length ? registeredModules : bootModules;
    const byId = new Map(sourceModules.map(m => [String(m.id), m]));
    const categories = getModuleCategories();
    const collapsedCategories = getCollapsedModuleCategories();
    const activePanel = wrap.querySelector(".nav-item.active")?.dataset.panel || currentPanelId || null;
    const savedModuleSearch = (()=>{ try { return sessionStorage.getItem(`nexoria_module_search_${currentGuild?.id || "global"}`) || ""; } catch { return ""; } })();
    const normalizedSearch = savedModuleSearch.trim().toLowerCase();
    const matchesModuleSearch = m => {
        if (!normalizedSearch) return true;
        const haystack = `${m?.label || ""} ${m?.id || ""} ${m?.summary || ""} ${m?.description || ""} ${m?.doc?.title || ""}`.toLowerCase();
        return haystack.includes(normalizedSearch);
    };
    const sectionOrder = getSidebarSectionOrder(categories);
    const renderCategory = category => {
        const allMods = category.modules.map(id => byId.get(id)).filter(Boolean);
        const categoryMatches = normalizedSearch && String(category.label||"").toLowerCase().includes(normalizedSearch);
        const mods = categoryMatches ? allMods : allMods.filter(matchesModuleSearch);
        if (!mods.length) return "";
        const collapsed = normalizedSearch ? false : collapsedCategories.has(String(category.id));
        const allEnabled = allMods.length > 0 && allMods.every(m => !disabledModules.includes(String(m.id)));
        const categoryIcon = category.emoji ? `<span class="sidebar-module-category-emoji" data-category-emoji="${escapeHtml(category.id)}">${escapeHtml(category.emoji)}</span>` : `<span class="sidebar-module-category-icon">${icon(category.icon,13)}</span>`;
        return `<section class="sidebar-module-category sidebar-sortable-section ${collapsed ? "category-collapsed" : ""}" data-category-id="${escapeHtml(category.id)}" data-sidebar-section-id="${escapeHtml(category.id)}"><div role="button" tabindex="0" class="sidebar-module-category-head" draggable="${normalizedSearch ? "false" : "true"}" data-category-drag="${escapeHtml(category.id)}" aria-expanded="${collapsed ? "false" : "true"}">${categoryIcon}<span>${escapeHtml(category.label)}</span><span class="sidebar-module-category-actions"><button type="button" class="toggle sidebar-category-toggle ${allEnabled ? "on" : ""}" data-category-toggle="${escapeHtml(category.id)}" aria-label="${allEnabled ? "Disable" : "Enable"} all ${escapeHtml(category.label)}"></button><span class="sidebar-module-category-chevron">${icon("chevron-down",13)}</span><span class="sidebar-module-category-grip" title="Drag to move category">⋮⋮</span></span></div><div class="sidebar-module-category-items" data-category-drop="${escapeHtml(category.id)}">${mods.map(m => navItemHtml(m.id,m.icon,m.label||prettifyModuleId(m.id),true,!disabledModules.includes(m.id))).join("")}</div></section>`;
    };
    const renderGeneral = () => `<section class="sidebar-general-section sidebar-sortable-section" data-sidebar-section-id="__general__"><div class="sidebar-general-head" draggable="${normalizedSearch ? "false" : "true"}" data-sidebar-section-drag="__general__"><span class="sidebar-general-icon">${icon("settings",13)}</span><span>General</span><span class="sidebar-module-category-grip" title="Drag to move section">⋮⋮</span></div><div class="sidebar-general-items">${navItemHtml("general-settings","","General Settings",false)}${navItemHtml("audit-log","","Audit Log",false)}</div></section>`;
    const renderedSectionParts = sectionOrder.map(id => id === "__general__" ? renderGeneral() : renderCategory(categories.find(c => String(c.id) === String(id)))).filter(Boolean);
    const hasModuleSearchResults = renderedSectionParts.some(html => !String(html).includes('data-sidebar-section-id="__general__"'));
    const renderedSections = renderedSectionParts.join("");
    const emptySearch = normalizedSearch && !hasModuleSearchResults ? `<div class="module-sidebar-no-results">No modules found for <strong>${escapeHtml(savedModuleSearch)}</strong>.</div>` : "";
    wrap.innerHTML = `<div class="nav-section-label modules-label-row"><span>Modules</span></div><div class="module-sidebar-search"><input id="sidebar-module-search" class="search-input" type="search" value="${escapeHtml(savedModuleSearch)}" placeholder="Search modules…" autocomplete="off" aria-label="Search modules"><button type="button" id="sidebar-module-search-clear" class="module-sidebar-search-clear" aria-label="Clear module search" title="Clear search">${icon("x",13)}</button></div><div id="sidebar-module-sections">${renderedSections}</div>${emptySearch}`;

    const moduleSearchInput = wrap.querySelector("#sidebar-module-search");
    const moduleSearchClear = wrap.querySelector("#sidebar-module-search-clear");
    const updateModuleSearch = value => {
        const q = String(value || "");
        try { sessionStorage.setItem(`nexoria_module_search_${currentGuild?.id || "global"}`, q); } catch {}
        buildSidebar(disabledModules);
        const input = document.getElementById("sidebar-module-search");
        if (input) { input.focus(); input.setSelectionRange(q.length, q.length); }
    };
    moduleSearchInput?.addEventListener("input", e => updateModuleSearch(e.target.value));
    moduleSearchClear?.addEventListener("click", () => updateModuleSearch(""));

    if (currentGuild?.id && sessionStorage.getItem(`nexoria_sidebar_emoji_${currentGuild.id}`) !== "none") {
        const paintModuleEmoji = (moduleId, value) => {
            const slot = wrap.querySelector(`[data-module-icon="${moduleId}"]`); if (!slot || !value) return;
            const custom=String(value).match(/^<a?:[A-Za-z0-9_]+:(\d+)>$/);
            slot.innerHTML=custom ? `<img class="nav-custom-emoji" src="https://cdn.discordapp.com/emojis/${custom[1]}.${String(value).startsWith("<a:")?"gif":"png"}?size=32" alt="" loading="lazy">` : escapeHtml(String(value));
            slot.classList.add("has-custom-emoji");
        };
        const paintCategoryEmoji = (categoryId, value) => {
            const slot = wrap.querySelector(`[data-category-emoji="${categoryId}"]`); if (!slot || !value) return;
            const custom=String(value).match(/^<a?:[A-Za-z0-9_]+:(\d+)>$/);
            if (!custom) return;
            slot.innerHTML=`<img src="https://cdn.discordapp.com/emojis/${custom[1]}.${String(value).startsWith("<a:")?"gif":"png"}?size=32" alt="" loading="lazy">`;
            slot.classList.add("has-custom-emoji");
        };
        const uid=encodeURIComponent(getSession()?.user?.id || "");
        void api(`/guilds/${encodeURIComponent(currentGuild.id)}/verification/public?userId=${uid}`).then(d => paintModuleEmoji("verification", d?.customEmoji)).catch(()=>{});
        void api(`/guilds/${encodeURIComponent(currentGuild.id)}/honeypot/public?userId=${uid}`).then(d => paintModuleEmoji("honeypot", d?.customEmoji)).catch(()=>{});
        void api(`/guilds/${encodeURIComponent(currentGuild.id)}/meta?userId=${uid}`).then(d => paintCategoryEmoji("moderation", d?.moderationEmoji)).catch(()=>{});
    }
    if (activePanel) wrap.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.panel === activePanel));

    const categoryWrap = wrap.querySelector("#sidebar-module-sections");
    let draggedModule = null, draggedCategory = null;
    categoryWrap?.querySelectorAll(".sidebar-module-category-items .nav-item[data-panel]").forEach(item => {
        item.draggable = !normalizedSearch; item.classList.add("module-reorderable");
        item.addEventListener("dragstart", e => { if (e.target.closest("[data-module-toggle]")) { e.preventDefault(); return; } draggedModule=item; draggedCategory=null; item.classList.add("module-dragging"); e.dataTransfer.effectAllowed="move"; e.dataTransfer.setData("text/plain",`module:${item.dataset.panel}`); });
        item.addEventListener("dragover", e => { if (!draggedModule || draggedModule===item) return; e.preventDefault(); const rect=item.getBoundingClientRect(); const before=e.clientY<rect.top+rect.height/2; const list=item.parentElement; if(before) list.insertBefore(draggedModule,item); else list.insertBefore(draggedModule,item.nextSibling); });
        item.addEventListener("dragend", () => { item.classList.remove("module-dragging"); if (!draggedModule) return; const next=getSidebarCategoriesFromDom(wrap); persistModuleCategories(next); draggedModule=null; if(typeof window.__nexoriaRefreshDocsOrder==="function") window.__nexoriaRefreshDocsOrder(); });
    });
    categoryWrap?.querySelectorAll(".sidebar-module-category [data-category-drop]").forEach(list => {
        list.addEventListener("dragover", e => { if (!draggedModule) return; e.preventDefault(); if (e.target.closest(".nav-item")) return; list.appendChild(draggedModule); });
    });
    categoryWrap?.querySelectorAll("[data-category-toggle]").forEach(btn => btn.addEventListener("click", async e => {
        e.preventDefault(); e.stopPropagation();
        const categoryId=String(btn.dataset.categoryToggle||"");
        const category=categories.find(c=>String(c.id)===categoryId);
        const ids=(category?.modules||[]).map(String).filter(id=>byId.has(id));
        if(!ids.length)return;
        const enableAll=!btn.classList.contains("on");
        const label=category?.label||"category";
        const ok=await DCModal.confirm(`${enableAll?"Enable":"Disable"} all ${ids.length} modules in ${label}?`,{title:`${enableAll?"Enable":"Disable"} ${label}`,confirmLabel:enableAll?"Enable all":"Disable all"});
        if(!ok)return;
        btn.disabled=true;
        try {
            await Promise.all(ids.map(id=>api(`/guilds/${encodeURIComponent(currentGuild.id)}/modules/${encodeURIComponent(id)}`,{method:"PUT",body:JSON.stringify({enabled:enableAll})})));
            buildSidebar(enableAll ? disabledModules.filter(id=>!ids.includes(String(id))) : [...new Set([...disabledModules,...ids])]);
        } catch(e2) { await DCModal.alert(e2.message||"Could not update the category.",{title:"Category update failed"}); buildSidebar(disabledModules); }
        finally { btn.disabled=false; }
    }));
    categoryWrap?.querySelectorAll("[data-category-drag]").forEach(head => {
        if (normalizedSearch) head.draggable = false;
        let justDragged = false;
        head.addEventListener("keydown", e => { if((e.key==="Enter"||e.key===" ") && !e.target.closest(".sidebar-category-toggle")){ e.preventDefault(); head.click(); } });
        head.addEventListener("click", e => {
            if (justDragged) { justDragged = false; return; }
            if (e.target.closest(".sidebar-module-category-grip,.sidebar-category-toggle")) return;
            const section = head.closest(".sidebar-module-category");
            if (!section) return;
            const collapsed = section.classList.toggle("category-collapsed");
            head.setAttribute("aria-expanded", collapsed ? "false" : "true");
            const set = getCollapsedModuleCategories();
            if (collapsed) set.add(String(section.dataset.categoryId || ""));
            else set.delete(String(section.dataset.categoryId || ""));
            persistCollapsedModuleCategories(set);
        });
        head.addEventListener("dragstart", e => { if (draggedModule || normalizedSearch) return; draggedCategory=head.closest(".sidebar-sortable-section"); justDragged=true; draggedCategory?.classList.add("category-dragging"); e.dataTransfer.effectAllowed="move"; e.dataTransfer.setData("text/plain",`section:${head.dataset.categoryDrag}`); });
        head.addEventListener("dragover", e => { if (!draggedCategory) return; e.preventDefault(); const target=head.closest(".sidebar-sortable-section"); if (!target || target===draggedCategory) return; const rect=target.getBoundingClientRect(); const before=e.clientY<rect.top+rect.height/2; if(before) categoryWrap.insertBefore(draggedCategory,target); else categoryWrap.insertBefore(draggedCategory,target.nextSibling); });
        head.addEventListener("dragend", () => { if (!draggedCategory) return; draggedCategory.classList.remove("category-dragging"); persistSidebarSectionOrder([...categoryWrap.querySelectorAll("[data-sidebar-section-id]")].map(x=>String(x.dataset.sidebarSectionId||""))); draggedCategory=null; setTimeout(() => { justDragged=false; }, 0); });
    });
    categoryWrap?.querySelectorAll("[data-sidebar-section-drag]").forEach(head => {
        if (normalizedSearch) head.draggable = false;
        head.addEventListener("dragstart", e => { if (draggedModule || normalizedSearch) return; draggedCategory=head.closest(".sidebar-sortable-section"); draggedCategory?.classList.add("category-dragging"); e.dataTransfer.effectAllowed="move"; e.dataTransfer.setData("text/plain","section:__general__"); });
        head.addEventListener("dragover", e => { if (!draggedCategory) return; e.preventDefault(); const target=head.closest(".sidebar-sortable-section"); if (!target || target===draggedCategory) return; const rect=target.getBoundingClientRect(); const before=e.clientY<rect.top+rect.height/2; if(before) categoryWrap.insertBefore(draggedCategory,target); else categoryWrap.insertBefore(draggedCategory,target.nextSibling); });
        head.addEventListener("dragend", () => { if (!draggedCategory) return; draggedCategory.classList.remove("category-dragging"); persistSidebarSectionOrder([...categoryWrap.querySelectorAll("[data-sidebar-section-id]")].map(x=>String(x.dataset.sidebarSectionId||""))); draggedCategory=null; });
    });
    wrap.querySelectorAll(".nav-item").forEach(n => n.addEventListener("click", e => { if(e.target.closest("[data-module-toggle]")) return; if(routes.go(routes.moduleUrl(currentGuild.id,n.dataset.panel))===false)return; switchPanel(n.dataset.panel,false); }));
    wrap.querySelectorAll("[data-module-toggle]").forEach(btn=>btn.addEventListener("click",e=>{e.stopPropagation();const moduleId=btn.dataset.moduleToggle;const turningOn=!btn.classList.contains("on");openModuleToggleConfirm(moduleId,turningOn,btn,disabledModules);}));
}
function getSidebarCategoriesFromDom(wrap) {
    return [...(wrap?.querySelectorAll(".sidebar-module-category") || [])].map(section => ({
        id:String(section.dataset.categoryId||""),
        label:String(section.querySelector(".sidebar-module-category-head span:nth-child(2)")?.textContent||"Category"),
        icon:"category-2",
        modules:[...(section.querySelectorAll(".nav-item[data-panel]")||[])].map(x=>String(x.dataset.panel||"")).filter(Boolean)
    })).filter(c=>c.id);
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
    wireQuickNav("dash-quick-nav");
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
    panel.innerHTML = serverLoadingMarkup("grabbing", true);
    const session = getSession();
    let manageable = [];
    try {
        const [guilds, accessible] = await Promise.all([fetchMyGuilds(session.token), fetchAccessibleBotGuilds()]);
        discordGuildCache = mergeAccessibleGuilds(guilds, accessible);
        setServerLoadingStage(panel, "validating", true);
        const accessibleIds = new Set(accessible.map(g => String(g.id)));
        const candidates = discordGuildCache.filter(g => accessibleIds.has(String(g.id)) || isAdmin(g));
        const pending = [...candidates], validated = [];
        const workers = Array.from({length: Math.min(4, Math.max(1, pending.length))}, async () => {
            while (pending.length) {
                const g = pending.shift();
                try {
                    const meta = await api(`/guilds/${encodeURIComponent(g.id)}/meta?userId=${encodeURIComponent(session.user.id)}`);
                    validated.push({...g, ...meta, viewerRole: meta?.viewerRole || g.viewerRole || null});
                } catch { validated.push(g); }
            }
        });
        await Promise.all(workers);
        manageable = validated.sort(sortViewerGuilds);
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
        const iconHtml = guildIconHtml(g, "server-switch-icon", 64);
        const role = String(g.viewerRole || "").toLowerCase();
        const roleTag = role === "co-owner" ? `<span class="server-role-tag co-owner">CO-OWNER</span>` : role === "owner" ? `<span class="server-role-tag owner">OWNER</span>` : ["admin","trusted-admin","bot-owner"].includes(role) ? `<span class="server-role-tag admin">ADMIN</span>` : "";
        const memberCount = Number(g.memberCount) || 0;
        return `
      <div class="dropdown-panel-item server-switch-item ${isActive ? "selected" : ""}" data-switch-guild="${g.id}" data-switch-name="${escapeHtml(g.name)}" data-switch-icon="${g.icon || ""}">
        <span class="server-switch-icon">${iconHtml}</span>
        <span class="server-switch-name-wrap"><span class="server-switch-name">${escapeHtml(g.name)}</span><span class="server-switch-member-count">${memberCount.toLocaleString()} member${memberCount === 1 ? "" : "s"}</span>${roleTag}</span>
        ${isActive ? icon("check", 15) : ""}
      </div>`;
    }
    panel.innerHTML = `
    <div class="dropdown-panel-title">Staff Servers (${withBot.length})</div>
    <input type="text" class="dropdown-panel-search" id="dash-crumb-search" placeholder="Search servers…">
    <div id="dash-crumb-list">
      ${withBot.length ? withBot.map(rowHtml).join("") : `<div class="dropdown-panel-empty">NEXORIA isn't on any server you manage yet.</div>`}
    </div>
    <div class="dropdown-panel-footer-action" style="display:grid;gap:7px">
      <a class="btn btn-primary btn-small" id="dash-crumb-invite-bot" href="${inviteUrl()}" target="_blank" rel="noopener" style="width:100%">${icon("plus")} Invite Bot</a>
      <button class="btn btn-ghost btn-small" id="dash-crumb-view-all" style="width:100%">${icon("servers")} View All Servers</button>
    </div>`;
    function wireRows() {
        panel.querySelectorAll("[data-switch-guild]").forEach(row => row.addEventListener("click", async () => {
            const guildId = row.dataset.switchGuild;
            if (guildId === currentGuild?.id) {
                closeAllFloatingDropdowns();
                return;
            }
            const targetPanel = currentPanelId || "ticket-tool";
            if (window.DC?.pageDirty) {
                const ok = await DCModal.confirm(`You have ${escapeHtml(window.DC.pageDirtyReason || "unsaved changes")}. Are you sure you want to leave without saving?`, { title:"Leave without saving?", confirmLabel:"Leave without saving", cancelLabel:"Stay", danger:true }).catch(() => false);
                if (!ok) return;
                window.DC.clearPageDirty();
            }
            currentGuild = { id: guildId, name: row.dataset.switchName, icon: row.dataset.switchIcon };
            const pickerBtn = document.getElementById("picker-server-switch");
            if (pickerBtn) {
                const nameEl = pickerBtn.querySelector(".dash-nav-server-name"); const subEl = pickerBtn.querySelector(".dash-nav-server-sub");
                const selectedMeta = manageable.find(g => String(g.id) === String(guildId)) || (discordGuildCache || []).find(g => String(g.id) === String(guildId));
                const selectedMemberCount = Number(selectedMeta?.memberCount) || 0;
                if (nameEl) nameEl.textContent = currentGuild.name;
                if (subEl) subEl.textContent = `${selectedMemberCount.toLocaleString()} member${selectedMemberCount === 1 ? "" : "s"}`;
            }
            closeAllFloatingDropdowns();
            const requestedPanel = targetPanel;
            let nextPanel = requestedPanel;
            try {
                const session = getSession();
                const meta = await api(`/guilds/${encodeURIComponent(guildId)}/meta?userId=${encodeURIComponent(session?.user?.id || "")}`);
                const disabled = Array.isArray(meta?.disabledModules) ? meta.disabledModules : [];
                const protectedPanel = requestedPanel === "general-settings" || requestedPanel === "audit-log";
                if (!meta?.canViewDashboard || (requestedPanel && disabled.includes(requestedPanel))) nextPanel = "ticket-tool";
                if (protectedPanel && !meta?.canViewDashboard) nextPanel = "ticket-tool";
            } catch {
                nextPanel = "ticket-tool";
            }
            currentTab = requestedPanel === nextPanel ? currentTab : null;
            currentPanelId = nextPanel;
            if (routes.go(routes.moduleUrl(currentGuild.id, nextPanel, currentTab)) === false) return;
            void enterDashboard(nextPanel, { tab: currentTab });
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
    document.getElementById("dash-crumb-view-all")?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeAllFloatingDropdowns();
        pickerActivePanel = "dashboard";
        routes.go("/dashboard", true);
        void enterPicker("dashboard").catch(err => {
            console.error("[server-switcher] View All Servers failed:", err);
            const root = document.getElementById("picker-panel-root");
            if (root) root.innerHTML = `<div class="empty-state">Couldn't open the server list: ${escapeHtml(err?.message || "Unknown error")}</div>`;
        });
    });
}
async function enterDashboard(panel, { tab, ticketId } = {}) {
    const target = routes.moduleUrl(currentGuild?.id || "", panel || "ticket-tool", tab);
    const currentPath = window.location.pathname + window.location.search + window.location.hash;
    const normalizedTarget = `${getSiteBasePath().replace(/\/$/, "")}${target}`;
    if (window.DC?.pageDirty && currentPath !== normalizedTarget) {
        const ok = await DCModal.confirm(`You have ${escapeHtml(window.DC.pageDirtyReason || "unsaved changes")}. Are you sure you want to leave without saving?`, { title:"Leave without saving?", confirmLabel:"Leave without saving", cancelLabel:"Stay", danger:true }).catch(() => false);
        if (!ok) return false;
        window.DC.clearPageDirty();
    }
    showScreen("screen-dashboard");
    try { await loadPublicConfig(); } catch {}
    const session = getSession();
    const moduleRoot = document.getElementById("module-root");
    // Build the navigation immediately so the user can switch categories while
    // the module scripts are still loading. The sidebar uses a boot manifest until
    // the real module registry is ready, then is rebuilt below.
    buildSidebar(currentGuildDisabledModules);
    if (!moduleRoot) return;
    if (botInfoCache) {
        try { await ensureModulesLoaded(); } catch (e) { console.warn("[modules] initial dashboard module load failed:", e); }
    }
    moduleRoot.innerHTML = loadingBlock("Loading dashboard…");
    await refreshHeroStatus();
    renderSidebarBottom("dash-sidebar-bottom");
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
    if(dashName) dashName.innerHTML=`${escapeHtml(currentGuild.name||"Server")}<span id="dash-server-role" class="server-role-tag" style="display:none"></span>`;
    if(dashIcon) dashIcon.innerHTML=guildIconHtml(currentGuild, "server-icon", 64);
    if(dashCrumb) dashCrumb.innerHTML=`<button type="button" class="crumb-link" data-crumb-dashboard>Servers</button>${icon("chevron-right",12)}<button type="button" class="crumb-link current" data-crumb-server>${escapeHtml(currentGuild.name||"…")}</button>`;
    dashCrumb?.querySelector("[data-crumb-dashboard]")?.addEventListener("click", () => { if (routes.go("/dashboard") === false) return; enterPicker("dashboard"); });
    dashCrumb?.querySelector("[data-crumb-server]")?.addEventListener("click", () => { document.getElementById("dash-nav-server")?.click(); });
    wireServerSwitcher();
    const crumbPanel = document.getElementById("dash-crumb-panel");
    if (crumbPanel)
        paintServerSwitcherPanel(crumbPanel).then(() => { crumbPanel.style.display = "none"; }).catch(e => { console.warn("[server-switcher] initial load failed; retrying on next open:", e); crumbPanel.style.display = "none"; });
    const sub = document.getElementById("dash-server-sub");
    let guildDisabledModules = [];
    if (botInfoCache) {
        const meta = await api(`/guilds/${currentGuild.id}/meta?userId=${session.user.id}`).catch(() => null);
        const roleBadge = document.getElementById("dash-server-role");
        if (roleBadge) { const role = meta?.viewerRole; roleBadge.textContent = role === "co-owner" ? "CO-OWNER" : role === "owner" ? "OWNER" : ""; roleBadge.className = `server-role-tag ${role === "co-owner" ? "co-owner" : role === "owner" ? "owner" : ""}`; roleBadge.style.display = role === "co-owner" || role === "owner" ? "inline-flex" : "none"; }
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
        document.getElementById("dash-ticket-back")?.addEventListener("click", () => { if (routes.go(routes.moduleUrl(currentGuild.id, panel)) === false) return; switchPanel(panel, false); });
        await paintTicketDetailBody(document.getElementById("dash-ticket-body"), currentGuild.id, ticketId);
        return;
    }
    switchPanel(panel, false, tab);
}
function enhanceLargeConfigSections(root) {
    if (!root) return;
    root.querySelectorAll?.(".config-section").forEach(section => {
        if (section.closest(".dc-modal,.cc-category-group,.cc-vs-palette-section") || section.dataset.nexCollapseReady === "1") return;
        const direct = [...section.children];
        if (direct.length < 2) return;
        const headingIndex = direct.findIndex(el => el.matches("h2,h3,.config-section-title,.nh-section-head,.wh-embed-head"));
        if (headingIndex < 0 || headingIndex > 0) return;
        const heading = direct[headingIndex];
        if (direct.length < 3 && !section.classList.contains("verification-card") && !section.classList.contains("mod-card") && !section.classList.contains("tt-config-section")) return;
        section.dataset.nexCollapseReady = "1";
        const key = `nexoria_section_collapsed_${currentGuild?.id||"global"}_${currentPanelId}_${section.dataset.nexSectionKey||heading.textContent.trim().slice(0,80)}`;
        let collapsed=false; try { collapsed=localStorage.getItem(key)==="1"; } catch {}
        const content=document.createElement("div");
        content.className="nex-collapse-content";
        for(let i=headingIndex+1;i<direct.length;i++) content.appendChild(direct[i]);
        const header=document.createElement("div");
        header.className="nex-collapse-header";
        header.appendChild(heading);
        const button=document.createElement("button");
        button.type="button";button.className="nex-collapse-toggle";button.setAttribute("aria-expanded",collapsed?"false":"true");button.title=collapsed?"Expand section":"Collapse section";
        button.innerHTML=icon(collapsed?"chevron-down":"chevron-up",15);
        header.appendChild(button);
        section.replaceChildren(header,content);
        const set=(isCollapsed,save=true)=>{section.classList.toggle("nex-section-collapsed",isCollapsed);button.setAttribute("aria-expanded",isCollapsed?"false":"true");button.title=isCollapsed?"Expand section":"Collapse section";button.innerHTML=icon(isCollapsed?"chevron-down":"chevron-up",15);if(save){try{localStorage.setItem(key,isCollapsed?"1":"0");}catch{}}};
        button.addEventListener("click",()=>set(!section.classList.contains("nex-section-collapsed")));
        set(collapsed,false);
    });
}
let panelRenderGeneration = 0;
function switchPanel(name, updateUrl = true, tab = null) {
    if (updateUrl && routes.go(routes.moduleUrl(currentGuild.id, name, tab)) === false) return;
    const generation = ++panelRenderGeneration;
    window.DC?.clearPageActions?.();
    if (window.DC?.pageDirty) window.DC.clearPageDirty();
    currentPanelId = name;
    currentTab = tab;
    document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.panel === name));
    setModuleDisabledOverlay(currentGuildDisabledModules.includes(name));
    let root = document.getElementById("module-root");
    if (!root) return;
    // Every navigation gets a fresh DOM node. If an older module is still waiting
    // on a network/API request, it keeps a reference to the old (detached) node and
    // can no longer paint over the module the user just selected.
    const freshRoot = root.cloneNode(false);
    root.replaceWith(freshRoot);
    root = freshRoot;
    root.innerHTML = loadingBlock();
    root.dataset.renderGeneration = String(generation);
    const mod = window.DC?.getModule?.(name);
    const renderPremiumSafe = (root) => {
        if (typeof renderPremiumPanel === "function") return renderPremiumPanel(root);
        root.innerHTML = `<div class="dash-header"><div><h1 class="picker-heading">Premium</h1><p class="picker-sub">Premium information is temporarily unavailable.</p></div></div><div class="empty-state">The Premium panel could not be loaded. Please reload the page.</div>`;
    };
    const renderers = { status: renderStatusModule, "general-settings": renderGeneralSettings, "audit-log": renderAuditLog, docs: (root) => renderDocsPanel(root, null), leaderboards: renderLeaderboardsPanel, premium: renderPremiumSafe, profile: renderProfileSettings, admin: renderAdminPanel };
    const renderer = async () => {
        let resolved = mod || window.DC?.getModule?.(name);
        if (!resolved && !renderers[name]) {
            root.innerHTML = loadingBlock(`Loading ${prettifyModuleId(name)}…`);
            await ensureModulesLoaded();
            resolved = window.DC?.getModule?.(name);
            // A previous partial module load can leave the global flag false/true at
            // different points during startup. Give the requested module a direct
            // recovery pass instead of failing the whole panel.
            if (!resolved) {
                modulesLoaded = false;
                modulesRetryAttempt = 0;
                await ensureModulesLoaded();
                resolved = window.DC?.getModule?.(name);
            }
        }
        if (resolved) { const result = await resolved.render(root, { ...buildContext(), renderGeneration: generation }, tab); enhanceLargeConfigSections(root); enhanceCustomSelects(root); wireGlobalSettingDirty(root); return result; }
        if (renderers[name]) { const result = await renderers[name](root); enhanceLargeConfigSections(root); enhanceCustomSelects(root); wireGlobalSettingDirty(root); return result; }
        throw new Error(`Module "${name}" is not available yet.`);
    };
    try {
        Promise.resolve(renderer()).catch(e => {
            console.error(`[render] ${name} failed; keeping the dashboard usable:`, e);
            showNexoriaError(e, `Module ${prettifyModuleId(name)}`);
            if (String(root.dataset.renderGeneration) !== String(generation) || currentPanelId !== name) return;
            root.innerHTML = `<div class="empty-state render-error"><div class="render-error-title">This section couldn't finish loading.</div><div class="field-hint">${escapeHtml(e?.message || "Temporary loading error")}</div><button class="btn btn-primary btn-small" id="render-retry">Retry</button></div>`;
            root.querySelector("#render-retry")?.addEventListener("click", () => switchPanel(name, false, tab));
            scheduleRouteRetry(`render failed for ${name}`);
        });
    }
    catch (e) {
        console.error(`[render] ${name} failed; keeping the dashboard usable:`, e);
        showNexoriaError(e, `Module ${prettifyModuleId(name)}`);
        if (String(root.dataset.renderGeneration) !== String(generation) || currentPanelId !== name) return;
        root.innerHTML = `<div class="empty-state render-error"><div class="render-error-title">This section couldn't finish loading.</div><div class="field-hint">${escapeHtml(e?.message || "Temporary loading error")}</div><button class="btn btn-primary btn-small" id="render-retry">Retry</button></div>`;
        root.querySelector("#render-retry")?.addEventListener("click", () => switchPanel(name, false, tab));
    }
}
const nexSelectObserver = new MutationObserver(muts => {
    for (const m of muts) if (m.addedNodes?.length) { enhanceCustomSelects(document); break; }
});
if (document.documentElement) nexSelectObserver.observe(document.documentElement,{childList:true,subtree:true});
function switchTab(tab) {
    if (routes.go(routes.moduleUrl(currentGuild.id, currentPanelId, tab)) === false) return false;
    currentTab = tab;
    return true;
}
async function renderGeneralSettings(root) {
    root.innerHTML = loadingBlock("Loading General Settings…");
    try {
        const session = getSession();
        const d = await api(`/guilds/${currentGuild.id}/general-settings?userId=${encodeURIComponent(session.user.id)}`);
        if (!root.isConnected || currentPanelId !== "general-settings") return;
        const s = d.settings || {};
        let coOwnerIds = new Set((s.coOwnerIds || []).map(String));
        let members = Array.isArray(d.coOwnerMembers) ? d.coOwnerMembers.slice() : [];
        let serverRoles = Array.isArray(d.serverRoles) ? d.serverRoles.slice() : [];
        members.sort((a,b) => (Number(b.highestRolePosition||0)-Number(a.highestRolePosition||0)) || String(a.displayName||a.username||"").localeCompare(String(b.displayName||b.username||"")));
        serverRoles.sort((a,b) => Number(b.position||0)-Number(a.position||0));
        const original = {
            coOwnerIds: new Set(coOwnerIds),
            auditLogMode: s.auditLogMode || "owner",
            auditLogRoles: [...(s.auditLogRoles || [])],
            leaderboardMode: s.leaderboardMode || "all",
            dashboardMode: s.dashboardMode || "owner",
            dashboardRoles: [...(s.dashboardRoles || [])],
            dashboardUsers: [...(s.dashboardUsers || [])],
            moduleAccess: structuredClone(d.moduleAccess || {}),
            terminalAnnouncementsEnabled: s.terminalAnnouncementsEnabled !== false
        };
        let dirty = false;
        function setDirty(reason = "Unsaved General Settings") {
            dirty = true;
            window.DC?.markPageDirty?.(reason);
            drawDirtyBar();
        }
        function clearDirty() {
            dirty = false;
            window.DC?.clearPageDirty?.();
            document.getElementById("nex-settings-dirty-bar")?.remove();
        }
        function drawDirtyBar() {
            if (!d.editable || !dirty || !root.isConnected) return;
            if (root.querySelector("#nex-settings-dirty-bar")) return;
            document.body.insertAdjacentHTML("beforeend", `<div class="nex-settings-dirty-bar" id="nex-settings-dirty-bar"><div><strong>Unsaved General Settings</strong><div class="field-hint">Save or cancel before leaving this section.</div></div><div class="nex-settings-dirty-actions"><button type="button" class="btn btn-ghost btn-small" id="nex-settings-cancel">Cancel</button><button type="button" class="btn btn-primary btn-small" id="nex-settings-save-bar">${icon("check")} Save</button></div></div>`);
            document.getElementById("nex-settings-cancel")?.addEventListener("click", () => { restoreOriginal(); });
            document.getElementById("nex-settings-save-bar")?.addEventListener("click", () => saveSettings());
        }
        function restoreOriginal() {
            coOwnerIds = new Set(original.coOwnerIds);
            root.querySelector("#audit-log-mode").value = original.auditLogMode;
            root.querySelector("#leaderboard-mode").value = original.leaderboardMode;
            root.querySelector("#dashboard-access-mode").value = original.dashboardMode;
            const ar = root.querySelector("#audit-log-roles"); if (ar) ar.value = original.auditLogRoles.join(",");
            const dr = root.querySelector("#dashboard-roles"); if (dr) dr.value = original.dashboardRoles.join(",");
            const du = root.querySelector("#dashboard-users"); if (du) du.value = original.dashboardUsers.join(",");
            d.moduleAccess = structuredClone(original.moduleAccess || {});
            const t = root.querySelector("#terminal-announcements-toggle"); if (t) { t.dataset.enabled = String(original.terminalAnnouncementsEnabled); t.classList.toggle("on", original.terminalAnnouncementsEnabled); }
            paintCoOwners(); updateConditionalFields(); clearDirty();
            enhanceCustomSelects(root);
        }
        function memberCard(m) {
            const active = coOwnerIds.has(String(m.id));
            return `<button type="button" class="nex-coowner-row ${active ? "coowner" : ""}" data-coowner-id="${escapeHtml(m.id)}" data-name="${escapeHtml(`${m.displayName||""} ${m.username||""} ${m.id}`.toLowerCase())}">
                <span class="nex-coowner-avatar">${m.avatarUrl ? `<img src="${escapeHtml(m.avatarUrl)}" alt="">` : icon("user",16)}</span>
                <span class="nex-coowner-copy"><strong style="color:${escapeHtml(m.highestRoleColor || "inherit")}">${escapeHtml(m.displayName || m.username || m.id)}</strong><small>@${escapeHtml(m.username || m.id)} · ${escapeHtml(m.id)}</small></span>
                <span class="nex-coowner-state">${active ? "CO-OWNER" : "SELECT"}</span>
            </button>`;
        }
        function paintCoOwners() {
            const list = root.querySelector("#coowner-list");
            if (!list) return;
            const ordered = [...members].sort((a,b) => {
                const rankDiff = Number(b.highestRolePosition || 0) - Number(a.highestRolePosition || 0);
                if (rankDiff) return rankDiff;
                return String(a.displayName || a.username || a.id).localeCompare(String(b.displayName || b.username || b.id));
            });
            list.innerHTML = ordered.length ? ordered.map(memberCard).join("") : `<div class="field-hint nex-empty-coowners">No matching members. Search by username, display name, or Discord ID.</div>`;
            list.querySelectorAll("[data-coowner-id]").forEach(btn => btn.addEventListener("click", () => openCoOwnerProfile(btn.dataset.coownerId)));
        }
        function findMember(id) { return members.find(m => String(m.id) === String(id)); }
        async function persistCoOwnersImmediate() {
            if (!d.coOwnerEditable) throw new Error("Only the server owner can change co-owners.");
            const out = await api(`/guilds/${currentGuild.id}/general-settings`, { method:"PUT", body:JSON.stringify({ userId:session.user.id, coOwnerIds:[...coOwnerIds] }) });
            if (out?.settings) s.coOwnerIds = out.settings.coOwnerIds || [...coOwnerIds];
            original.coOwnerIds = new Set(coOwnerIds);
        }
        async function openCoOwnerProfile(id) {
            const m = findMember(id);
            if (!m) return;
            const active = coOwnerIds.has(String(id));
            const fmtDate = value => {
                if (!value) return "Unavailable";
                const d = new Date(value);
                return Number.isNaN(d.getTime()) ? "Unavailable" : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
            };
            const details = `<div class="nex-coowner-profile-details">
                <div><span>Display name</span><strong>${escapeHtml(m.displayName || m.username || m.id)}</strong></div>
                <div><span>Username</span><strong>@${escapeHtml(m.username || m.id)}</strong></div>
                <div><span>Discord ID</span><strong class="mono">${escapeHtml(m.id)}</strong></div>
                ${m.roblox?.username ? `<div><span>Verified Roblox username</span><strong>${escapeHtml(m.roblox.username)}</strong><small class="field-hint">Visible because this member allows their Roblox username to be shared in this server.</small></div>` : ""}
                <div><span>Joined this server</span><strong>${escapeHtml(fmtDate(m.joinedAt))}</strong></div>
                <div><span>Discord account created</span><strong>${escapeHtml(fmtDate(m.accountCreatedAt))}</strong></div>
                ${m.nickname ? `<div><span>Server nickname</span><strong>${escapeHtml(m.nickname)}</strong></div>` : ""}
                <div class="nex-coowner-roles-field"><span>Server roles</span><div class="nex-member-role-list">${(m.roles || []).length ? (m.roles || []).map(r => `<span class="nex-member-role" style="--role-color:${escapeHtml(r.color || "#667085")}"><i></i>${escapeHtml(r.name)}</span>`).join("") : `<em>No custom roles</em>`}</div></div>
            </div>`;
            const accessWarning = `<div class="nex-coowner-warning"><strong>Full server access</strong>This member will get access to everything inside this NEXORIA server: modules, server settings, tickets, logging, setup and administrative controls. They will <b>not</b> be allowed to add or remove co-owners.</div>`;
            const openGrantConfirm = () => {
                let countdown = 3;
                DCModal.custom(`<div class="dc-modal-header"><h3>Confirm co-owner access</h3><p>Confirm that you want to grant elevated NEXORIA access to this member.</p></div>
                  <div class="dc-modal-body"><div class="nex-coowner-confirm-person"><div class="nex-coowner-profile-avatar">${m.avatarUrl ? `<img src="${escapeHtml(m.avatarUrl)}" alt="">` : icon("user",24)}</div><div><strong>${escapeHtml(m.displayName || m.username || m.id)}</strong><span>@${escapeHtml(m.username || m.id)} · ${escapeHtml(m.id)}</span></div></div>${accessWarning}<div class="field-hint nex-coowner-countdown" id="coowner-countdown">Confirm available in 3s</div></div>
                  <div class="dc-modal-footer"><button type="button" class="btn btn-ghost btn-small" id="coowner-confirm-cancel">Cancel</button><button type="button" class="btn btn-primary btn-small" id="coowner-confirm-action" disabled>Wait 3s</button></div>`, { maxWidth:"560px", onMount: rr => {
                    const timer = setInterval(() => {
                        countdown--;
                        const label = rr.querySelector("#coowner-countdown");
                        const button = rr.querySelector("#coowner-confirm-action");
                        if (label) label.textContent = countdown > 0 ? `Confirm available in ${countdown}s` : "You can confirm now";
                        if (button) { button.disabled = countdown > 0; button.textContent = countdown > 0 ? `Wait ${countdown}s` : "Confirm co-owner"; }
                        if (countdown <= 0) clearInterval(timer);
                    }, 1000);
                    rr.querySelector("#coowner-confirm-cancel")?.addEventListener("click", () => { clearInterval(timer); DCModal.close(); });
                    rr.querySelector("#coowner-confirm-action")?.addEventListener("click", () => {
                        if (countdown > 0) return;
                        coOwnerIds.add(String(id));
                        const button = rr.querySelector("#coowner-confirm-action");
                        if (button) { button.disabled=true; button.textContent="Saving…"; }
                        persistCoOwnersImmediate().then(() => { paintCoOwners(); clearInterval(timer); DCModal.close(); }).catch(async e => { coOwnerIds.delete(String(id)); if(button){button.disabled=false;button.textContent="Retry";} await DCModal.alert(e.message,{title:"Could not add co-owner"}); });
                    });
                }});
            };
            const openRemoveConfirm = () => {
                DCModal.custom(`<div class="dc-modal-header"><h3>Remove co-owner</h3><p>Remove this member's elevated NEXORIA access?</p></div>
                  <div class="dc-modal-body"><div class="nex-coowner-confirm-person"><div class="nex-coowner-profile-avatar">${m.avatarUrl ? `<img src="${escapeHtml(m.avatarUrl)}" alt="">` : icon("user",24)}</div><div><strong>${escapeHtml(m.displayName || m.username || m.id)}</strong><span>@${escapeHtml(m.username || m.id)} · ${escapeHtml(m.id)}</span></div></div><div class="nex-coowner-warning nex-coowner-warning-danger"><strong>Access removal</strong>This removes co-owner access immediately from the pending settings. The member will return to the normal dashboard permissions configured for this server.</div></div>
                  <div class="dc-modal-footer"><button type="button" class="btn btn-ghost btn-small" id="coowner-remove-cancel">Cancel</button><button type="button" class="btn btn-danger btn-small" id="coowner-remove-action">Remove co-owner</button></div>`, { maxWidth:"560px", onMount: rr => {
                    rr.querySelector("#coowner-remove-cancel")?.addEventListener("click", () => DCModal.close());
                    rr.querySelector("#coowner-remove-action")?.addEventListener("click", async () => { coOwnerIds.delete(String(id)); const btn=rr.querySelector("#coowner-remove-action"); if(btn){btn.disabled=true;btn.textContent="Removing…";} try { await persistCoOwnersImmediate(); paintCoOwners(); DCModal.close(); } catch(e) { coOwnerIds.add(String(id)); if(btn){btn.disabled=false;btn.textContent="Remove co-owner";} await DCModal.alert(e.message,{title:"Could not remove co-owner"}); } });
                }});
            };
            const ownerActionHtml = d.coOwnerEditable
              ? `<button type="button" class="btn ${active ? "btn-danger" : "btn-primary"} btn-small" id="coowner-profile-action">${active ? "Remove co-owner" : "Make co-owner"}</button>`
              : `<span class="field-hint">Only the server owner can add or remove co-owners.</span>`;
            DCModal.custom(`<div class="dc-modal-header"><h3>${active ? "Co-owner profile" : "Member profile"}</h3><p>${active ? "This member currently has elevated NEXORIA access." : "Review this member before granting elevated NEXORIA access."}</p></div>
              <div class="dc-modal-body"><div class="nex-coowner-profile"><div class="nex-coowner-profile-avatar">${m.avatarUrl ? `<img src="${escapeHtml(m.avatarUrl)}" alt="">` : icon("user",24)}</div><div><div class="nex-coowner-profile-name">${escapeHtml(m.displayName || m.username || m.id)}</div><div class="nex-coowner-profile-user">@${escapeHtml(m.username || m.id)}</div><span class="nex-coowner-profile-id">Discord ID: ${escapeHtml(m.id)}</span></div></div>${details}</div>
              <div class="dc-modal-footer"><button type="button" class="btn btn-ghost btn-small" id="coowner-profile-cancel">Close</button>${ownerActionHtml}</div>`, { maxWidth:"620px", onMount: rr => {
                    rr.querySelector("#coowner-profile-cancel")?.addEventListener("click", () => DCModal.close());
                    rr.querySelector("#coowner-profile-action")?.addEventListener("click", () => active ? openRemoveConfirm() : openGrantConfirm());
                }});
        }
        async function searchMembers(q) {
            q = String(q || "").trim();
            if (!q) { paintCoOwners(); return; }
            try {
                const result = await api(`/guilds/${currentGuild.id}/general-settings?userId=${encodeURIComponent(session.user.id)}&memberSearch=${encodeURIComponent(q)}`);
                if (Array.isArray(result.coOwnerMembers)) {
                    const merged = new Map(members.map(m => [String(m.id), m]));
                    result.coOwnerMembers.forEach(m => merged.set(String(m.id), m));
                    members = [...merged.values()].filter(m => String(m.id) !== String(result.ownerId || currentGuild.ownerId || "") && !m.bot);
                }
            } catch {}
            paintCoOwners();
        }
        root.innerHTML = `<div class="dash-header"><div><h1>General Settings</h1><p>Server-wide access, ownership, dashboard visibility and audit controls. ${d.coOwner ? "You are a configured co-owner." : d.owner ? "You are the server owner." : ""}</p></div></div>
          <div class="config-section nex-ownership-card"><div class="nex-settings-section-head"><div><span class="setup-kicker">MEMBERS</span><h3>${icon("users",16)} Members</h3><p class="hint">View server members here. The server owner can make a member a co-owner, giving them full NEXORIA access without allowing them to manage the co-owner list.</p></div><span class="nex-owner-state">${d.owner ? "OWNER CONTROL" : d.coOwner ? "CO-OWNER" : "VIEW ONLY"}</span></div>
            <div class="nex-coowner-search"><span>${icon("search",14)}</span><input id="coowner-search" class="search-input" placeholder="Search username, display name, or Discord ID…" autocomplete="off" ${d.coOwnerEditable ? "" : "disabled"}></div>
            <div id="coowner-list" class="nex-coowner-list"></div><div class="field-hint" style="margin-top:10px">Co-owners appear first. The server owner and all bot accounts are hidden from this selector. Click a member to open their profile.</div></div>
          <section class="config-section nex-settings-collapsible" data-nex-settings-section="audit"><button type="button" class="nex-settings-collapse-head" data-nex-settings-toggle="audit" aria-expanded="false"><span><strong>Audit Log access</strong><small>Choose who can open the NEXORIA Audit Log.</small></span><span class="nex-settings-collapse-icon">${icon("chevron-down",16)}</span></button><div class="nex-settings-collapse-body" data-nex-settings-body="audit"><p class="hint">Owner and co-owners always retain access.</p><select id="audit-log-mode" class="dc-select" ${d.editable ? "" : "disabled"}><option value="owner">Owner only</option><option value="everyone">Everyone with dashboard access</option><option value="administrators">Administrators</option><option value="roles">Selected roles</option></select><div id="audit-log-roles-wrap" style="margin-top:10px;display:${s.auditLogMode === "roles" ? "block" : "none"}"><input id="audit-log-roles" class="search-input" placeholder="Role IDs, comma separated" value="${escapeHtml((s.auditLogRoles || []).join(","))}" ${d.editable ? "" : "disabled"}></div></div></section>
          <section class="config-section nex-settings-collapsible" data-nex-settings-section="leaderboards"><button type="button" class="nex-settings-collapse-head" data-nex-settings-toggle="leaderboards" aria-expanded="false"><span><strong>Leaderboards</strong><small>Control where this server can appear publicly.</small></span><span class="nex-settings-collapse-icon">${icon("chevron-down",16)}</span></button><div class="nex-settings-collapse-body" data-nex-settings-body="leaderboards"><p class="hint">Only rated reviews count. Public leaderboard cache refreshes every 30 minutes.</p><select id="leaderboard-mode" class="dc-select" ${d.editable ? "" : "disabled"}><option value="all">Show on all supported leaderboards</option><option value="ticket-reviews">Ticket Tool only</option><option value="none">Do not show this server</option></select></div></section>
          <section class="config-section nex-settings-collapsible" data-nex-settings-section="dashboard"><button type="button" class="nex-settings-collapse-head" data-nex-settings-toggle="dashboard" aria-expanded="false"><span><strong>Dashboard access</strong><small>Choose who can manage this server through NEXORIA.</small></span><span class="nex-settings-collapse-icon">${icon("chevron-down",16)}</span></button><div class="nex-settings-collapse-body" data-nex-settings-body="dashboard"><p class="hint">By default the owner and co-owners can use the dashboard. This policy never grants access to unrelated servers.</p><select id="dashboard-access-mode" class="dc-select" ${d.editable ? "" : "disabled"}><option value="owner">Owner / co-owners only</option><option value="owner-only">Owner only</option><option value="everyone">Everyone</option><option value="administrators">Administrators</option><option value="roles">Selected roles</option><option value="users">Selected people</option><option value="selected">Selected people or roles</option></select><div id="dashboard-access-selection" class="nex-access-selection" style="margin-top:10px;display:${["roles","users","selected"].includes(s.dashboardMode) ? "block" : "none"}"><div class="field-hint">Choose the people or roles who can open this server dashboard.</div><div id="dashboard-users-picker" class="nex-access-picker"></div><input id="dashboard-users" class="search-input" placeholder="Discord user IDs, comma separated" value="${escapeHtml((s.dashboardUsers || []).join(","))}" ${d.editable ? "" : "disabled"}><input id="dashboard-roles" class="search-input" style="margin-top:8px" placeholder="Discord role IDs, comma separated" value="${escapeHtml((s.dashboardRoles || []).join(","))}" ${d.editable ? "" : "disabled"}></div></div></section>
          <section class="config-section nex-settings-collapsible nex-module-access-card" data-nex-settings-section="module-access"><button type="button" class="nex-settings-collapse-head" data-nex-settings-toggle="module-access" aria-expanded="false"><span><strong>Module permissions</strong><small>Restrict individual NEXORIA capabilities to selected people or roles.</small></span><span class="nex-settings-collapse-icon">${icon("chevron-down",16)}</span></button><div class="nex-settings-collapse-body" data-nex-settings-body="module-access"><p class="hint">Owners and co-owners always retain full access. These controls only affect this Discord server.</p><div id="module-access-grid" class="nex-module-access-grid"></div></div></section>
          <section class="config-section nex-settings-collapsible" data-nex-settings-section="announcements"><button type="button" class="nex-settings-collapse-head" data-nex-settings-toggle="announcements" aria-expanded="false"><span><strong>Terminal announcements</strong><small>Allow the bot owner's terminal announcements to publish for this server.</small></span><span class="nex-settings-collapse-icon">${icon("chevron-down",16)}</span></button><div class="nex-settings-collapse-body" data-nex-settings-body="announcements"><div class="config-row-label">Announcement publishing</div><button type="button" id="terminal-announcements-toggle" class="toggle ${s.terminalAnnouncementsEnabled !== false ? "on" : ""}" ${d.editable ? "" : "disabled"} aria-label="Toggle terminal announcements"></button><span id="terminal-announcements-state" class="field-hint" style="margin-left:10px">${s.terminalAnnouncementsEnabled !== false ? "Enabled" : "Disabled"}</span></div></section>
          <section class="config-section nex-settings-collapsible" data-nex-settings-section="backup"><button type="button" class="nex-settings-collapse-head" data-nex-settings-toggle="backup" aria-expanded="false"><span><strong>Settings backup</strong><small>Export or import NEXORIA settings for this server.</small></span><span class="nex-settings-collapse-icon">${icon("chevron-down",16)}</span></button><div class="nex-settings-collapse-body" data-nex-settings-body="backup"><p class="hint">Ticket history is never included.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost btn-small" id="settings-export-all">${icon("download")} Export all settings</button>${d.editable ? `<button class="btn btn-ghost btn-small" id="settings-import-all">${icon("upload")} Import settings</button>` : ""}</div></div></section>
          ${d.editable ? `<div style="margin-top:14px"><button class="btn btn-primary" id="save-general-settings">${icon("check")} Save Settings</button></div>` : `<div style="margin-top:14px" class="field-hint">Only the server owner or a configured co-owner can edit these settings.</div>`}`;
        paintCoOwners();
        root.querySelectorAll("[data-nex-settings-toggle]").forEach(btn => btn.addEventListener("click", () => {
            const key = btn.dataset.nexSettingsToggle;
            const body = root.querySelector(`[data-nex-settings-body="${key}"]`);
            if (!body) return;
            const open = btn.getAttribute("aria-expanded") === "true";
            root.querySelectorAll("[data-nex-settings-toggle]").forEach(other => {
                const otherKey = other.dataset.nexSettingsToggle;
                const otherBody = root.querySelector(`[data-nex-settings-body="${otherKey}"]`);
                if (other !== btn) { other.setAttribute("aria-expanded", "false"); other.classList.remove("open"); if (otherBody) otherBody.hidden = true; }
            });
            btn.setAttribute("aria-expanded", String(!open));
            body.hidden = open;
            btn.classList.toggle("open", !open);
        }));
        const mode=root.querySelector("#audit-log-mode"), rolesWrap=root.querySelector("#audit-log-roles-wrap"), lbMode=root.querySelector("#leaderboard-mode"), dashMode=root.querySelector("#dashboard-access-mode"), dashSelection=root.querySelector("#dashboard-access-selection"), announceToggle=root.querySelector("#terminal-announcements-toggle"), announceState=root.querySelector("#terminal-announcements-state");
        if (mode) mode.value=s.auditLogMode||"owner";
        if (lbMode) lbMode.value=s.leaderboardMode||"all";
        if (dashMode) dashMode.value=s.dashboardMode||"owner";
        const dashboardUsersInput=root.querySelector("#dashboard-users"), dashboardRolesInput=root.querySelector("#dashboard-roles");
        if (announceToggle) announceToggle.dataset.enabled=s.terminalAnnouncementsEnabled !== false ? "true" : "false";
        function updateConditionalFields(){ if(rolesWrap) rolesWrap.style.display=mode?.value==="roles"?"block":"none"; if(dashSelection) dashSelection.style.display=["roles","users","selected"].includes(dashMode?.value)?"block":"none"; enhanceCustomSelects(root); }
        [mode,lbMode,dashMode].forEach(el=>el?.addEventListener("change",()=>{setDirty();updateConditionalFields();}));
        announceToggle?.addEventListener("click",()=>{const on=announceToggle.dataset.enabled!=="true";announceToggle.dataset.enabled=String(on);announceToggle.classList.toggle("on",on);if(announceState)announceState.textContent=on?"Enabled":"Disabled";setDirty();});
        let searchTimer=null;
        root.querySelector("#coowner-search")?.addEventListener("input",e=>{clearTimeout(searchTimer);const q=e.target.value;searchTimer=setTimeout(()=>searchMembers(q),250);});
        root.querySelector("#settings-export-all")?.addEventListener("click",async()=>{try{const data=await api(`/guilds/${currentGuild.id}/settings/export?userId=${encodeURIComponent(session.user.id)}`);const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download=`nexoria-settings-${currentGuild.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(u),500);}catch(e){showNexoriaError(e,"Settings export");}});
        root.querySelector("#settings-import-all")?.addEventListener("click",()=>{const input=document.createElement("input");input.type="file";input.accept="application/json";input.onchange=async()=>{try{const file=input.files?.[0];if(!file)return;const data=JSON.parse(await file.text());const ok=await DCModal.confirm("This replaces imported settings while leaving ticket history untouched.",{title:"Import NEXORIA settings?",confirmLabel:"Import"});if(!ok)return;await api(`/guilds/${currentGuild.id}/settings/import`,{method:"POST",body:JSON.stringify({userId:session.user.id,data})});clearDirty();await DCModal.alert("Settings imported. Reloading the dashboard to apply them.",{title:"Import complete"});await renderGeneralSettings(root);}catch(e){showNexoriaError(e,"Settings import");}};input.click();});
        function renderModuleAccess(){
            const slot=root.querySelector("#module-access-grid"); if(!slot) return;
            const catalog=d.moduleAccessCatalog||{}; const current=d.moduleAccess||{};
            const openPolicyModal=(title, subtitle, initial, onApply)=>{
                const p=structuredClone(initial||{users:[],roles:[],restricted:false});
                const selectedUsers=new Set((p.users||[]).map(String));
                const selectedRoles=new Set((p.roles||[]).map(String));
                const renderSelected=()=>{
                    const u=[...selectedUsers].map(id=>members.find(m=>String(m.id)===id)).filter(Boolean);
                    const r=[...selectedRoles].map(id=>serverRoles.find(x=>String(x.id)===id)).filter(Boolean);
                    return `<div class="nex-permission-selected"><div class="nex-permission-selected-title">Selected members</div><div class="nex-permission-chip-list">${u.length?u.map(m=>`<button type="button" class="nex-permission-chip" data-remove-user="${escapeHtml(m.id)}"><span class="nex-permission-avatar">${m.avatarUrl?`<img src="${escapeHtml(m.avatarUrl)}" alt="">`:icon("user",13)}</span><strong style="color:${escapeHtml(m.highestRoleColor||"inherit")}">${escapeHtml(m.displayName||m.username||m.id)}</strong> <span>×</span></button>`).join(""):`<span class="field-hint">None</span>`}</div><div class="nex-permission-selected-title">Selected roles</div><div class="nex-permission-chip-list">${r.length?r.map(x=>`<button type="button" class="nex-permission-chip" data-remove-role="${escapeHtml(x.id)}"><i style="background:${escapeHtml(x.color||"#8b93a7")}"></i>${escapeHtml(x.name)} <span>×</span></button>`).join(""):`<span class="field-hint">None</span>`}</div></div>`;
                };
                const modal=DCModal.custom(`<div class="dc-modal-header"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(subtitle||"")}</p></div><div class="dc-modal-body"><label class="dc-checkbox-row"><input type="checkbox" id="map-restricted" ${p.restricted?"checked":""}><span class="dc-checkbox-box">${icon("check",12)}</span><span>Restrict access to selected people or roles</span></label><div class="field-hint" style="margin:10px 0">Owners and co-owners always retain access. Search the server's members or roles and add them to the access list.</div><div class="nex-permission-picker-grid"><div><label class="field-label">Server members</label><div class="nex-permission-picker" id="map-user-picker"><input class="search-input" id="map-user-search" placeholder="Search members..."><div class="nex-permission-options" id="map-user-options"></div></div></div><div><label class="field-label">Server roles</label><div class="nex-permission-picker" id="map-role-picker"><input class="search-input" id="map-role-search" placeholder="Search roles..."><div class="nex-permission-options" id="map-role-options"></div></div></div></div><div id="map-selected-wrap">${renderSelected()}</div></div><div class="dc-modal-footer"><button class="btn btn-ghost btn-small" id="map-cancel">Cancel</button><button class="btn btn-primary btn-small" id="map-save">Apply</button></div>`,{maxWidth:"760px"});
                const paintOptions=()=>{
                    const q=(modal.querySelector("#map-user-search")?.value||"").trim().toLowerCase();
                    const userOptions=members.filter(m=>!selectedUsers.has(String(m.id)) && `${m.displayName||""} ${m.username||""} ${m.id}`.toLowerCase().includes(q)).slice(0,50);
                    const roleQ=(modal.querySelector("#map-role-search")?.value||"").trim().toLowerCase();
                    const roleOptions=serverRoles.filter(r=>!selectedRoles.has(String(r.id)) && `${r.name} ${r.id}`.toLowerCase().includes(roleQ) && !r.managed).slice(0,50);
                    modal.querySelector("#map-user-options").innerHTML=userOptions.map(m=>`<button type="button" class="nex-permission-option" data-add-user="${escapeHtml(m.id)}"><span class="nex-permission-avatar">${m.avatarUrl?`<img src="${escapeHtml(m.avatarUrl)}" alt="">`:icon("user",13)}</span><span><strong style="color:${escapeHtml(m.highestRoleColor||"inherit")}">${escapeHtml(m.displayName||m.username||m.id)}</strong><small>@${escapeHtml(m.username||m.id)}</small></span></button>`).join("") || `<div class="field-hint">No members found.</div>`;
                    modal.querySelector("#map-role-options").innerHTML=roleOptions.map(r=>`<button type="button" class="nex-permission-option" data-add-role="${escapeHtml(r.id)}"><i class="nex-permission-role-dot" style="background:${escapeHtml(r.color||"#8b93a7")}"></i><span><strong>${escapeHtml(r.name)}</strong><small>${escapeHtml(r.id)}</small></span></button>`).join("") || `<div class="field-hint">No roles found.</div>`;
                };
                const paintSelected=()=>{ modal.querySelector("#map-selected-wrap").innerHTML=renderSelected(); paintOptions(); modal.querySelectorAll("[data-remove-user]").forEach(b=>b.addEventListener("click",()=>{selectedUsers.delete(String(b.dataset.removeUser));paintSelected();})); modal.querySelectorAll("[data-remove-role]").forEach(b=>b.addEventListener("click",()=>{selectedRoles.delete(String(b.dataset.removeRole));paintSelected();})); };
                modal.addEventListener?.("click",()=>{});
                modal.querySelector("#map-user-options")?.addEventListener("click",e=>{const b=e.target.closest("[data-add-user]");if(!b)return;selectedUsers.add(String(b.dataset.addUser));paintSelected();});
                modal.querySelector("#map-role-options")?.addEventListener("click",e=>{const b=e.target.closest("[data-add-role]");if(!b)return;selectedRoles.add(String(b.dataset.addRole));paintSelected();});
                let memberSearchTimer=null;
                modal.querySelector("#map-user-search")?.addEventListener("input",e=>{
                    clearTimeout(memberSearchTimer);
                    const q=String(e.target.value||"").trim();
                    paintOptions();
                    memberSearchTimer=setTimeout(async()=>{
                        if(!q) return;
                        try {
                            const result=await api(`/guilds/${currentGuild.id}/general-settings?userId=${encodeURIComponent(session.user.id)}&memberSearch=${encodeURIComponent(q)}`);
                            if(Array.isArray(result.coOwnerMembers)){
                                const merged=new Map(members.map(m=>[String(m.id),m]));
                                result.coOwnerMembers.forEach(m=>merged.set(String(m.id),m));
                                members=[...merged.values()].sort((a,b)=>(Number(b.highestRolePosition||0)-Number(a.highestRolePosition||0))||String(a.displayName||a.username||"").localeCompare(String(b.displayName||b.username||"")));
                                paintOptions();
                            }
                        } catch {}
                    },220);
                });
                modal.querySelector("#map-role-search")?.addEventListener("input",paintOptions);
                modal.querySelector("#map-cancel")?.addEventListener("click",DCModal.close);
                modal.querySelector("#map-save")?.addEventListener("click",()=>{onApply({restricted:modal.querySelector("#map-restricted")?.checked===true,users:[...selectedUsers],roles:[...selectedRoles]});d.moduleAccess=current;setDirty("Module permissions");DCModal.close();renderModuleAccess();});
                paintOptions();
            };
            const clearCategory=(moduleId, features)=>{
                current[moduleId]=current[moduleId]||{}; features.forEach(feature=>{ current[moduleId][feature]={restricted:false,users:[],roles:[]}; });
            };
            const allFeatures=Object.values(catalog).flat();
            slot.innerHTML=`<div class="nex-module-access-bulk"><div><strong>Bulk category permissions</strong><small>Set the same access policy for every module category, or remove all category restrictions.</small></div><div class="nex-module-access-bulk-actions"><button type="button" class="btn btn-ghost btn-small" id="module-access-set-all">${icon("shield-check",13)} Set for all categories</button><button type="button" class="btn btn-ghost btn-small" id="module-access-remove-all">${icon("shield-off",13)} Remove from all categories</button></div></div>` + Object.entries(catalog).map(([moduleId,features])=>{
                const entries=features.map(feature=>{ const p=current?.[moduleId]?.[feature]||{}; return `<div class="nex-module-permission-row"><div><strong>${escapeHtml(feature.replace(/-/g," "))}</strong><small>${p.restricted?"Restricted access":"Follows dashboard access"}</small></div><button type="button" class="btn btn-ghost btn-small nex-module-permission-edit" data-module="${escapeHtml(moduleId)}" data-feature="${escapeHtml(feature)}">${icon("settings",13)} Configure</button></div>`; }).join("");
                return `<section class="nex-module-access-module"><div class="nex-module-access-head"><div><strong>${escapeHtml(moduleId)}</strong><span>${features.length} access points</span></div><div class="nex-module-access-category-actions"><button type="button" class="btn btn-ghost btn-small nex-module-category-set" data-module="${escapeHtml(moduleId)}">Set category</button><button type="button" class="btn btn-ghost btn-small nex-module-category-remove" data-module="${escapeHtml(moduleId)}">Remove</button></div></div>${entries}</section>`;
            }).join("");
            slot.querySelector("#module-access-set-all")?.addEventListener("click",()=>{
                openPolicyModal("Set permissions for all categories","Apply one access policy to every NEXORIA module category.",{restricted:false,users:[],roles:[]},policy=>{ Object.entries(catalog).forEach(([moduleId,features])=>{ current[moduleId]=current[moduleId]||{}; features.forEach(feature=>{ current[moduleId][feature]={...policy}; }); }); });
            });
            slot.querySelector("#module-access-remove-all")?.addEventListener("click",async()=>{
                const ok=await DCModal.confirm("This removes all custom restrictions from every module category. Owners and co-owners will continue to have full access.",{title:"Remove permissions from all categories?",confirmLabel:"Remove all"});
                if(!ok)return; Object.entries(catalog).forEach(([moduleId,features])=>clearCategory(moduleId,features)); d.moduleAccess=current; setDirty("Module permissions"); renderModuleAccess();
            });
            slot.querySelectorAll(".nex-module-category-set").forEach(btn=>btn.addEventListener("click",()=>{
                const moduleId=btn.dataset.module, features=catalog[moduleId]||[];
                const seed=current?.[moduleId]?.[features[0]]||{restricted:false,users:[],roles:[]};
                openPolicyModal(`Set permissions · ${moduleId}`,`Apply one access policy to every capability in this module category.`,seed,policy=>{ current[moduleId]=current[moduleId]||{}; features.forEach(feature=>{ current[moduleId][feature]={...policy}; }); });
            }));
            slot.querySelectorAll(".nex-module-category-remove").forEach(btn=>btn.addEventListener("click",async()=>{
                const moduleId=btn.dataset.module, features=catalog[moduleId]||[];
                const ok=await DCModal.confirm(`This removes all custom restrictions from the ${moduleId} category.`,{title:`Remove ${moduleId} permissions?`,confirmLabel:"Remove"});
                if(!ok)return; clearCategory(moduleId,features); d.moduleAccess=current; setDirty("Module permissions"); renderModuleAccess();
            }));
            slot.querySelectorAll(".nex-module-permission-edit").forEach(btn=>btn.addEventListener("click",()=>{
                const moduleId=btn.dataset.module, feature=btn.dataset.feature; const p=structuredClone(current?.[moduleId]?.[feature]||{users:[],roles:[],restricted:false});
                openPolicyModal(`Module access · ${moduleId}`,`${feature.replace(/-/g," ")} permissions`,p,policy=>{ current[moduleId]=current[moduleId]||{}; current[moduleId][feature]=policy; });
            }));
        }

        renderModuleAccess();
        async function saveSettings(){
            try {
                const payload={userId:session.user.id,auditLogMode:mode?.value||"owner",auditLogRoles:(root.querySelector("#audit-log-roles")?.value||"").split(",").map(x=>x.trim()).filter(Boolean),leaderboardMode:lbMode?.value||"all",dashboardMode:dashMode?.value||"owner",dashboardRoles:(root.querySelector("#dashboard-roles")?.value||"").split(",").map(x=>x.trim()).filter(Boolean),dashboardUsers:(root.querySelector("#dashboard-users")?.value||"").split(",").map(x=>x.trim()).filter(Boolean),terminalAnnouncementsEnabled:announceToggle?.dataset.enabled !== "false",moduleAccess:d.moduleAccess||{}};
                if(d.coOwnerEditable) payload.coOwnerIds=[...coOwnerIds];
                await api(`/guilds/${currentGuild.id}/general-settings`,{method:"PUT",body:JSON.stringify(payload)});
                clearDirty();
                await DCModal.alert("General Settings saved.",{title:"Saved"});
                await renderGeneralSettings(root);
            } catch(e) { showNexoriaError(e,"Couldn't save settings"); }
        }
        root.querySelector("#save-general-settings")?.addEventListener("click",saveSettings);
        updateConditionalFields();
        enhanceCustomSelects(root);
    } catch (e) { showNexoriaError(e,"General Settings"); root.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`; }
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
        const avatarFor = (x) => x.avatarUrl || x.userAvatar || x.avatar || profiles[String(x.userId)]?.avatarUrl || "";
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
                const changed = Array.isArray(x.changedFields) ? x.changedFields.map(v => String(v)).filter(Boolean) : [];
                const fields = changed.length ? changed.slice(0, 6) : [];
                const resource = x.resource || "Dashboard change";
                const plain = x.auditText || `${user} ${String(x.summary || x.message || action).replace(/_/g, " ")}. ${resource}.`;
                return `<div class="audit-entry audit-entry-plain" role="button" tabindex="0" data-audit-id="${escapeHtml(x.id || "")}">
          <span class="audit-avatar">${avatar ? `<img src="${escapeHtml(avatar)}" alt="">` : icon("profile")}</span>
          <span class="audit-entry-main"><strong>${escapeHtml(user)}</strong><p>${escapeHtml(plain)}</p><div class="audit-entry-fields">${fields.length ? fields.map(f => `<span>${escapeHtml(f)}</span>`).join("") : ""}</div><small>${escapeHtml(dateLabel(x.createdAt))} · ${escapeHtml(x.method || "CHANGE")} · ${escapeHtml(resource)}</small></span>
          ${x.revertable ? `<span class="audit-revert-wrap"><button type="button" class="btn btn-ghost btn-small audit-revert-btn" data-audit-revert="${escapeHtml(x.id || "")}">${icon("history")} Revert</button></span>` : `<span class="audit-chevron">${icon("chevron-right")}</span>`}
        </div>`;
            }).join("") : `<div class="empty-state audit-empty">No audit entries match these filters.</div>`;
            list.querySelectorAll("[data-audit-revert]").forEach(btn => btn.addEventListener("click", async (e) => {
                e.stopPropagation();
                const ok = await DCModal.confirm("Restore the saved state from this change? The current state will be recorded as a new audit entry.", { title: "Revert this change?", confirmLabel: "Revert", danger: true });
                if (!ok) return;
                try { await api(`/guilds/${currentGuild.id}/audit-log/${encodeURIComponent(btn.dataset.auditRevert)}/revert`, { method: "POST", body: JSON.stringify({ userId: getSession().user.id }) }); await renderAuditLog(root); }
                catch (e2) { await DCModal.alert(e2.message, { title: "Couldn't revert change" }); }
            }));
            list.querySelectorAll(".audit-entry").forEach(btn => {
                btn.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); btn.click(); } });
                btn.addEventListener("click", () => {
                const item = entries.find(x => String(x.id) === btn.dataset.auditId);
                if (!item || !item.details)
                    return;
                const detail = typeof item.details === "string" ? item.details : JSON.stringify(item.details || {}, null, 2);
                const profile = profiles[String(item.userId)] || {};
                const avatar = avatarFor(item);
                const fields = Array.isArray(item.changedFields) ? item.changedFields : [];
                const meta = `<div class="audit-detail-meta"><div class="audit-detail-person">${avatar ? `<img src="${escapeHtml(avatar)}" alt="">` : icon("profile")}<span><b>${escapeHtml(profile.displayName || profile.username || (item.userId ? `Discord user ${item.userId}` : "Unknown user"))}</b><small>${escapeHtml(profile.username ? `@${profile.username}` : String(item.userId || "Unknown user"))}</small></span></div><div class="audit-detail-chips"><span>${escapeHtml(item.method || "CHANGE")}</span><span>${escapeHtml(item.resource || "Dashboard change")}</span><span>${escapeHtml(dateLabel(item.createdAt))}</span></div></div>`;
                DCModal.custom(`<div class="dc-modal-header"><h3>${escapeHtml(item.summary || actionLabel(item.action))}</h3><p>${escapeHtml(item.resource || "NEXORIA dashboard change")}</p></div><div class="dc-modal-body">${meta}<div class="audit-detail-section"><label>What changed</label><div class="audit-field-chips">${fields.length ? fields.map(f => `<span>${escapeHtml(f)}</span>`).join("") : `<span>No field list recorded</span>`}</div></div><div class="audit-detail-section"><label>Detailed audit message</label><div class="audit-detail-text">${escapeHtml(item.auditText || detail)}</div></div>${item.revertable ? `<div style="margin-top:12px"><button type="button" class="btn btn-danger btn-small" id="audit-detail-revert">${icon("history")} Revert this change</button></div>` : ""}</div><div class="dc-modal-footer"><button type="button" class="btn btn-primary btn-small" id="audit-detail-close">Close</button></div>`, { maxWidth: "760px", onMount: rr => { rr.querySelector("#audit-detail-close")?.addEventListener("click", () => DCModal.close()); rr.querySelector("#audit-detail-revert")?.addEventListener("click", async () => { const ok = await DCModal.confirm("Restore the saved state from this change?", { title: "Revert this change?", confirmLabel: "Revert", danger: true }); if (!ok) return; try { await api(`/guilds/${currentGuild.id}/audit-log/${encodeURIComponent(item.id)}/revert`, { method: "POST", body: JSON.stringify({ userId: getSession().user.id }) }); DCModal.close(); await renderAuditLog(root); } catch (e2) { await DCModal.alert(e2.message, { title: "Couldn't revert change" }); } }); } });
                });
            });
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
async function renderPolicyPanel(policy = "terms") {
    const kind = String(policy || "terms").toLowerCase() === "privacy" ? "privacy" : "terms";
    const title = kind === "privacy" ? "Privacy Policy" : "Terms of Service";
    const root = document.getElementById("picker-panel-root");
    if (!root) return;

    // Legal pages are deliberately standalone. They must never inherit the
    // currently selected Discord server/dashboard or expose dashboard-only
    // navigation such as "Back to Server".
    document.getElementById("screen-picker")?.classList.add("policy-standalone");
    showScreen("screen-picker");
    renderSidebarBottom("picker-sidebar-bottom");
    root.innerHTML = `<div class="policy-screen"><div class="dash-header"><div><span class="setup-kicker">NEXORIA LEGAL</span><h1 class="picker-heading">${title}</h1><p class="picker-sub">Read this policy inside NEXORIA without leaving the application.</p></div><div class="dash-header-actions"><button type="button" class="btn btn-ghost btn-small" id="policy-back">${icon("arrow-left",14)} Back</button></div></div><div class="policy-switcher"><button type="button" class="btn ${kind === "terms" ? "btn-primary" : "btn-ghost"} btn-small" id="policy-terms">${icon("file-text",14)} Terms of Service</button><button type="button" class="btn ${kind === "privacy" ? "btn-primary" : "btn-ghost"} btn-small" id="policy-privacy">${icon("shield",14)} Privacy Policy</button></div><article class="policy-content" id="policy-content"><div class="loading-wrap">Loading ${title}…</div></article></div>`;
    root.querySelector("#policy-back")?.addEventListener("click", () => {
        let target = "";
        try { target = String(sessionStorage.getItem("nexoria_policy_return_url") || ""); } catch {}
        if (target) {
            try { sessionStorage.removeItem("nexoria_policy_return_url"); } catch {}
            routes.go(target, true, true);
            void renderFromRoute();
            return;
        }
        if (window.history.length > 1) window.history.back();
        else { routes.go("/", true, true); void renderFromRoute(); }
    });
    root.querySelector("#policy-terms")?.addEventListener("click", e => { e.preventDefault(); routes.go("/terms", false, true); void renderFromRoute(); });
    root.querySelector("#policy-privacy")?.addEventListener("click", e => { e.preventDefault(); routes.go("/privacy", false, true); void renderFromRoute(); });

    try {
        // The published GitHub Pages root is /NEXORIA/, while the source tree
        // stores legal documents under website/site/policy. siteAsset() resolves
        // the deployed asset root correctly; using getSiteBasePath() here was
        // producing /NEXORIA/policy/... in the old layout and a 404 in the
        // current published layout.
        const candidates = [
            siteAsset(`policy/${kind}.html`),
            repoAsset(`site/policy/${kind}.html`),
            repoAsset(`website/site/policy/${kind}.html`)
        ].filter((u, i, a) => u && a.indexOf(u) === i);
        let response = null;
        let lastStatus = 404;
        for (const candidate of candidates) {
            try {
                const r = await fetch(versionedAsset(candidate), { cache: "no-store" });
                if (r.ok) { response = r; break; }
                lastStatus = r.status;
            } catch {}
        }
        if (!response) throw new Error(`HTTP ${lastStatus}`);
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        // Only import the actual policy article. The standalone HTML file also
        // contains its own logo/navigation; importing that shell caused the
        // broken logo and duplicate Back/Terms controls shown inside NEXORIA.
        const source = doc.querySelector("main.legal-card") || doc.querySelector("main") || doc.querySelector("article") || doc.body;
        const content = root.querySelector("#policy-content");
        const fragment = source ? source.cloneNode(true) : null;
        fragment?.querySelectorAll(".legal-links, .legal-nav")?.forEach(el => el.remove());
        content.innerHTML = fragment ? fragment.innerHTML : escapeHtml(html);
        content.querySelectorAll("a").forEach(a => {
            const href = String(a.getAttribute("href") || "");
            if (/privacy|terms|terms-of-service/i.test(href)) {
                a.addEventListener("click", e => { e.preventDefault(); routes.go(href.includes("privacy") ? "/privacy" : "/terms", false, true); void renderFromRoute(); });
            } else if (/^https?:/i.test(href)) {
                a.setAttribute("target", "_blank");
                a.setAttribute("rel", "noopener");
            }
        });
    } catch (e) {
        root.querySelector("#policy-content").innerHTML = `<div class="empty-state">Couldn't load ${title}: ${escapeHtml(e.message)}</div>`;
    }
}

async function renderStatusModule(root) {
    await refreshHeroStatus();
    root.innerHTML = `<div class="dash-header"><div><h1>Status</h1><p>Uptime history for your bot.</p></div><div class="dash-header-actions"><button class="btn btn-ghost btn-small" id="status-main-menu">${icon("home",14)} Main Menu</button>${currentGuild?.id ? `<button class="btn btn-ghost btn-small" id="status-back-server">${icon("arrow-left",14)} Back to Server</button>` : ""}</div></div><div id="status-body">${loadingBlock()}</div>`;
    root.querySelector("#status-main-menu")?.addEventListener("click", () => { routes.go("/", true, true); void renderFromRoute(); });
    root.querySelector("#status-back-server")?.addEventListener("click", () => { if (currentGuild?.id) { const back = currentPanelId && !["status","docs","leaderboards"].includes(currentPanelId) ? currentPanelId : "ticket-tool"; if (routes.go(routes.moduleUrl(currentGuild.id, back, currentTab)) === false) return; void enterDashboard(back, { tab: currentTab }); } });
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
      <div class="overview-card"><div class="num">${formatUptime(history.currentUptimeSeconds, history.currentUptimeMs)}</div><div class="lbl">Current uptime</div></div>
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
        const statusEmojiMap = {
            "ticket-tool": "🎟️",
            "custom-commands": "⌨️",
            "logging": "📝",
            "honeypot": "🍯",
            "verification": "🛡️",
            "member-automation": "👥",
            "reaction-roles": "🎭",
            "webhook": "🔗",
            "setup": "⚙️"
        };
        const renderStatusModuleEmoji = (m) => {
            const value = String(m?.emoji || statusEmojiMap[m.id] || "•");
            const custom = value.match(/^<a?:[A-Za-z0-9_]+:(\d+)>$/);
            if (custom) {
                const ext = value.startsWith("<a:") ? "gif" : "png";
                return `<img class="nav-custom-emoji status-module-emoji" src="https://cdn.discordapp.com/emojis/${custom[1]}.${ext}?size=32" alt="" loading="lazy">`;
            }
            return `<span class="status-module-emoji" aria-hidden="true">${escapeHtml(value)}</span>`;
        };
        slot.innerHTML = modules.map(m => `
      <div class="config-row">
        <span class="config-row-label"><span class="status-module-icon">${renderStatusModuleEmoji(m)}</span>${escapeHtml(m.label)}</span>
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
            const seenDayIncidentKeys = new Set();
            const dayIncidents = incidents.filter(i => new Date(i.startedAt).toISOString().slice(0, 10) === d.date).filter(i => {
                const key = `${i.startedAt}|${i.endedAt}|${i.durationSeconds}|${String(i.note || '').trim()}`;
                if (seenDayIncidentKeys.has(key)) return false;
                seenDayIncidentKeys.add(key);
                return true;
            });
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
    if (termsLink) {
        termsLink.href = policyUrl("terms");
        termsLink.addEventListener("click", e => { e.preventDefault(); routes.go("/terms"); void renderFromRoute(); });
    }
    if (privacyLink) {
        privacyLink.href = policyUrl("privacy");
        privacyLink.addEventListener("click", e => { e.preventDefault(); routes.go("/privacy"); void renderFromRoute(); });
    }
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
const ANNOUNCEMENT_SEEN_KEY = "nexoria_last_seen_announcement";
function showAnnouncementPopup(announcement) {
    const text = String(announcement?.text || "").replace(/\n\n— Official NEXORIA Announcement\s*$/i, "").trim();
    const id = String(announcement?.id || "").trim();
    if (!text || !id) return;
    let overlay = document.getElementById("nexoria-announcement-overlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "nexoria-announcement-overlay";
        overlay.className = "nexoria-announcement-overlay";
        overlay.innerHTML = `<div class="nexoria-announcement-modal" role="dialog" aria-modal="true" aria-labelledby="nexoria-announcement-title">
            <div class="nexoria-announcement-header">
                <div class="nexoria-announcement-title-wrap">
                    <div class="nexoria-announcement-kicker">NEXORIA</div>
                    <h2 id="nexoria-announcement-title">Announcement</h2>
                </div>
                <button type="button" class="nexoria-announcement-close" aria-label="Close announcement">×</button>
            </div>
            <div class="nexoria-announcement-body"></div>
            <div class="nexoria-announcement-footer"><button type="button" class="btn btn-primary nexoria-announcement-read">Close</button></div>
        </div>`;
        document.body.appendChild(overlay);
        const close = () => {
            try { if (overlay.dataset.announcementId) localStorage.setItem(ANNOUNCEMENT_SEEN_KEY, overlay.dataset.announcementId); } catch {}
            overlay.remove();
        };
        overlay.querySelector(".nexoria-announcement-close")?.addEventListener("click", close);
        overlay.querySelector(".nexoria-announcement-read")?.addEventListener("click", close);
        overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
    }
    overlay.dataset.announcementId = id;
    const body = overlay.querySelector(".nexoria-announcement-body");
    body.textContent = text;
    const existingAttachment = body.querySelector(".nexoria-announcement-attachment");
    if (existingAttachment) existingAttachment.remove();
    const attachment = announcement?.attachment;
    if (attachment?.id) {
        const link = document.createElement("a");
        link.className = "nexoria-announcement-attachment";
        link.href = `${CFG.LOCAL_BOT_URL}/announcement-attachment/${encodeURIComponent(String(attachment.id))}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        const mb = Number(attachment.compressedBytes || 0) / 1024 / 1024;
        const originalMb = Number(attachment.originalBytes || 0) / 1024 / 1024;
        link.textContent = `📦 ${String(attachment.name || "Announcement attachment.zip")} — ${mb.toFixed(2)} MB compressed${originalMb > 0 ? ` (${originalMb.toFixed(2)} MB original)` : ""}`;
        link.style.display = "block"; link.style.marginTop = "16px"; link.style.wordBreak = "break-word";
        body.appendChild(link);
    }
    overlay.style.display = "flex";
    document.body.style.overflow = "hidden";
    const restore = () => { if (!document.getElementById("nexoria-announcement-overlay")) document.body.style.overflow = ""; };
    overlay.querySelector(".nexoria-announcement-close")?.addEventListener("click", restore, { once: true });
    overlay.querySelector(".nexoria-announcement-read")?.addEventListener("click", restore, { once: true });
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
    if (routes.parse().screen === "policy") return;
    const CACHE_KEY = "nexoria_maintenance_state";
    try {
        const state = await api("/maintenance", { method: "GET" });
        if (state.status === "scheduled") {
            try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...state, cachedAt: Date.now() })); } catch {}
        }
        const last = localStorage.getItem("nexoria_last_maintenance_cancel");
        if (state.status === "cancelled" && state.cancelledAt && state.cancelledAt !== last) {
            localStorage.setItem("nexoria_last_maintenance_cancel", state.cancelledAt);
            try { localStorage.removeItem(CACHE_KEY); } catch {}
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
            try { localStorage.removeItem(CACHE_KEY); } catch {}
        }
    } catch {
        // GitHub Pages is static and the active bridge can disappear during a restart.
        // Reuse the short-lived state captured before the host went offline.
        try {
            const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
            if (cached?.status === "scheduled" && Date.now() - Number(cached.cachedAt || 0) < 120000) {
                const expected = Math.max(0, Number(cached.expectedSeconds || 0));
                const elapsed = Math.max(0, Math.floor((Date.now() - new Date(cached.startedAt).getTime()) / 1000));
                const remaining = expected ? Math.max(0, expected - elapsed) : 0;
                const signature = `${cached.action}|${cached.reason}|${remaining}|offline`;
                if (signature !== lastMaintenanceSignature) {
                    lastMaintenanceSignature = signature;
                    const action = cached.action === "restart" ? "restart" : "shutdown";
                    showMaintenanceToast(`NEXORIA ${action} is temporarily offline${remaining ? ` — expected back in ${formatUptime(remaining)}` : " for maintenance"}. ${cached.reason || "Maintenance"}`);
                }
            }
        } catch {}
    }
}
let lastControlStateSignature = "";
async function pollHostControlState() {
    if (routes.parse().screen === "policy") return;
    try {
        const state = await api("/control-state", { method: "GET" });
        const maintenance = state?.maintenance || {};
        const terminal = state?.terminal || {};
        const countdown = state?.countdown || null;
        const announcement = state?.announcement || null;
        const announcementSignature = announcement?.id ? `announcement:${announcement.id}` : "";
        const parts = [];
        if (maintenance.status === "scheduled") {
            parts.push(`maintenance:${maintenance.action || "maintenance"}:${maintenance.startedAt || ""}:${maintenance.reason || ""}`);
        }
        if (terminal.startupStatusPending) parts.push("startup-status");
        if (terminal.incidentReportPending) parts.push("incident-report");
        if (terminal.shutdownPrompt) parts.push(`shutdown:${terminal.shutdownPrompt.stage || ""}:${terminal.shutdownPrompt.reason || ""}`);
        if (terminal.restartPrompt) parts.push(`restart:${terminal.restartPrompt.stage || ""}:${terminal.restartPrompt.seconds || 0}`);
        if (announcementSignature) parts.push(announcementSignature);
        if (countdown) parts.push(`countdown:${countdown.label}:${countdown.remainingSeconds}`);
        const signature = parts.join("|");
        if (signature === lastControlStateSignature) return;
        const previous = lastControlStateSignature;
        lastControlStateSignature = signature;

        // Terminal prompts/countdowns are host-console state, not website
        // notifications. Only published announcements should appear here.
        if (announcement?.id && announcement?.text) {
            let seen = "";
            try { seen = String(localStorage.getItem(ANNOUNCEMENT_SEEN_KEY) || ""); } catch {}
            if (seen !== String(announcement.id)) showAnnouncementPopup(announcement);
        }
    } catch {
        // Host failover is handled by api(); do not spam the UI while every host
        // is temporarily unavailable during a restart.
    }
}

// Restore the language-preference bootstrap used by the site startup path.
// This function is intentionally lightweight so the site still starts even when
// a language pack is unavailable; the selected language is persisted for the
// rest of the application to consume.
async function loadLanguagePreference() {
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
}

function showGlobalUiError(message, source = "Website") {
    const text = String(message || "Unknown error").slice(0, 500);
    let el = document.getElementById("nexoria-global-error");
    if (!el) {
        el = document.createElement("div");
        el.id = "nexoria-global-error";
        el.className = "nexoria-global-error";
        el.innerHTML = `<span></span><button type="button" aria-label="Dismiss">×</button>`;
        document.body.appendChild(el);
        el.querySelector("button")?.addEventListener("click", () => el.remove());
    }
    el.querySelector("span").textContent = `${source}: ${text}`;
    el.style.display = "flex";
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.remove(), 9000);
}
window.addEventListener("error", event => {
    if (event?.message) {
        console.error("[website] uncaught error:", event.error || event.message);
        showGlobalUiError(event.message, "Website error");
    }
});
window.addEventListener("unhandledrejection", event => {
    const reason = event?.reason;
    const message = String(reason?.message || reason || "").trim();
    if (!message) return;
    console.error("[website] unhandled promise rejection:", reason);
    showGlobalUiError(message, "Request error");
});

document.addEventListener("DOMContentLoaded", async () => {
    try {
        await loadPublicConfig();
    } catch (e) {
        console.error("[config] Failed to load data/config.json:", e);
        const landing = document.getElementById("screen-landing");
        if (landing) landing.insertAdjacentHTML("beforeend", `<div class="empty-state" style="margin-top:20px">NEXORIA configuration could not be loaded. Check data/config.json and reload the page.</div>`);
        return;
    }
    await loadLanguagePreference();
    const initialRouteIsPolicy = routes.parse().screen === "policy";
    // Legal pages are completely standalone. Do not contact the active bot host
    // for refresh settings or warm dashboard modules while the user is only
    // reading Terms/Privacy. This also prevents a dead Cloudflare tunnel from
    // delaying or spamming the legal page.
    if (!initialRouteIsPolicy) {
        await loadRuntimeRefreshPrefs();
        // Warm module assets before the user opens a server so controls are ready
        // when the first screen is rendered. Failures are retried by the module loader.
        void ensureModulesLoaded().catch(e => console.debug("[preload] module warm-up deferred:", e?.message || e));
    }
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
    document.querySelectorAll(".landing-legal-links a").forEach(link => {
        link.addEventListener("click", e => {
            const href = String(link.getAttribute("href") || "");
            if (!/(?:terms|privacy)/i.test(href)) return;
            e.preventDefault();
            routes.go(/privacy/i.test(href) ? "/privacy" : "/terms");
            void renderFromRoute();
        });
    });
    const discordBtn = document.getElementById("btn-discord-support");
    if (discordBtn && CFG?.DISCORD_SUPPORT_URL) {
        discordBtn.href = CFG.DISCORD_SUPPORT_URL;
        discordBtn.target = "_blank";
        discordBtn.rel = "noopener noreferrer";
        discordBtn.innerHTML = `${icon("discord")}<span>Support Server</span>`;
        discordBtn.style.display = "";
    }
    on("btn-login", "click", async (e) => {
        e.preventDefault();
        try {
            await beginLogin({ silent: false, redirectPath: "/dashboard", userInitiated: true });
        }
        catch (err) {
            await DCModal.alert(err?.message || "Could not start Discord login.", { title: "Discord login unavailable" });
        }
    });
    on("btn-invite", "click", (e) => { e.preventDefault(); window.open(inviteUrl(), "_blank", "noopener,noreferrer"); });
    on("btn-leaderboards", "click", async (e) => {
        e.preventDefault();
        if (getSession()) {
            routes.go("/leaderboards/", true);
            try { await renderFromRoute(); } catch (err) { scheduleRouteRetry(err?.message || "leaderboards failed to render"); }
            return;
        }
        sessionStorage.setItem("tk_post_login_redirect", "/leaderboards/");
        try { await beginLogin({ silent: true, userInitiated: true }); }
        catch (err) { await DCModal.alert(err?.message || "Could not start Discord login.", { title: "Discord login unavailable" }); }
    });
    on("btn-logout", "click", () => { clearSession(); ["tk_post_login_redirect","tk_redirect_path","tk_silent_login","nexoria_discord_oauth_state"].forEach(k=>sessionStorage.removeItem(k)); routes.go("/", true); showScreen("screen-landing"); });
    on("btn-back", "click", () => {
        if (window.location.pathname.includes("/servers/")) {
            routes.go("/", true, true);
            showScreen("screen-landing");
            return;
        }
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
    if (routes.parse().screen !== "policy") {
        pollMaintenanceState();
        pollHostControlState();
    }
    setInterval(() => { if (routes.parse().screen !== "policy") void pollMaintenanceState(); }, 1000);
    setInterval(() => { if (routes.parse().screen !== "policy") void pollHostControlState(); }, 1000);
    let polling = false;
    const statusTimer={id:null};
    async function runStatusPoll(){
        if (routes.parse().screen === "policy") {
            clearTimeout(statusTimer.id);
            statusTimer.id=setTimeout(runStatusPoll,Math.max(100,getRefreshPrefs().statusSeconds*1000));
            return;
        }
        if (polling)
            return;
        polling = true;
        try {
            const wasOnline = botInfoCache?.online;
            await refreshHeroStatus();
            if (!wasOnline && botInfoCache?.online) {
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
