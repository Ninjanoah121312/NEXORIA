// NEXORIA shared module registry. Safe to load more than once during retries.
window.DC = window.DC || {};
window.DC.modules = Array.isArray(window.DC.modules) ? window.DC.modules : [];
window.DC.registerModule = function (mod) {
    if (!mod || !mod.id || typeof mod.render !== "function") {
        console.error("Invalid module registration", mod);
        return;
    }
    const existing = window.DC.modules.findIndex(m => m.id === mod.id);
    if (existing >= 0) window.DC.modules[existing] = mod;
    else window.DC.modules.push(mod);
};
window.DC.getModule = function (id) {
    return window.DC.modules.find(m => m.id === id);
};
