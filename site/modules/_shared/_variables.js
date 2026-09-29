// _variables.js
window.DC = window.DC || {};
let _catalogPromise = null;
function fetchVariableCatalog() {
    if (_catalogPromise)
        return _catalogPromise;
    const base = (window.NEXORIA_CONFIG && window.NEXORIA_CONFIG.LOCAL_BOT_URL) || "";
    _catalogPromise = (window.DC?.api ? window.DC.api("/variables") : fetch(`${base}/variables`).then(r => r.json()))
        .then(d => d)
        .then(d => d.variables || [])
        .catch(() => []);
    return _catalogPromise;
}
function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function highlightMarkup(text) {
    const escaped = escapeHtml(text);
    return escaped.replace(/\{([a-zA-Z0-9_.]*)\}/g, `<span class="dc-var-token">{$1}</span>`)
        .replace(/\{([a-zA-Z0-9_.]*)$/, `<span class="dc-var-token dc-var-token-open">{$1</span>`);
}
window.DC.attachVariableEditor = function (textarea) {
    if (!textarea || textarea._dcVarAttached)
        return { destroy() { } };
    textarea._dcVarAttached = true;
    const wrap = document.createElement("div");
    wrap.className = "dc-var-editor-wrap";
    textarea.parentNode.insertBefore(wrap, textarea);
    wrap.appendChild(textarea);
    const backdrop = document.createElement("div");
    backdrop.className = "dc-var-backdrop";
    wrap.insertBefore(backdrop, textarea);
    textarea.classList.add("dc-var-textarea");
    const cs = getComputedStyle(textarea);
    ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "padding", "border", "boxSizing"]
        .forEach(p => { backdrop.style[p] = cs[p]; });
    const dropdown = document.createElement("div");
    dropdown.className = "dc-var-dropdown";
    dropdown.style.display = "none";
    wrap.appendChild(dropdown);
    let variables = [];
    fetchVariableCatalog().then(list => { variables = list; });
    let activeIndex = 0;
    let currentMatches = [];
    let tokenStart = -1;
    function syncBackdrop() {
        backdrop.innerHTML = highlightMarkup(textarea.value) + "\n";
        backdrop.scrollTop = textarea.scrollTop;
        backdrop.scrollLeft = textarea.scrollLeft;
    }
    function caretCoords() {
        const mirror = document.createElement("div");
        const cs = getComputedStyle(textarea);
        ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "padding", "border", "boxSizing", "whiteSpace", "wordWrap"]
            .forEach(p => { mirror.style[p] = cs[p]; });
        mirror.style.position = "absolute";
        mirror.style.visibility = "hidden";
        mirror.style.width = `${textarea.clientWidth}px`;
        mirror.style.whiteSpace = "pre-wrap";
        mirror.style.wordWrap = "break-word";
        const caretIdx = textarea.selectionStart;
        mirror.textContent = textarea.value.slice(0, caretIdx);
        const marker = document.createElement("span");
        marker.textContent = "\u200b";
        mirror.appendChild(marker);
        document.body.appendChild(mirror);
        const rect = marker.getBoundingClientRect();
        const wrapRect = wrap.getBoundingClientRect();
        const top = rect.top - wrapRect.top - textarea.scrollTop + 20;
        const left = Math.min(rect.left - wrapRect.left - textarea.scrollLeft, wrap.clientWidth - 260);
        document.body.removeChild(mirror);
        return { top, left: Math.max(0, left) };
    }
    function findOpenToken() {
        const caret = textarea.selectionStart;
        const text = textarea.value;
        let i = caret - 1;
        while (i >= 0) {
            const ch = text[i];
            if (ch === "{")
                return { start: i, query: text.slice(i + 1, caret) };
            if (ch === "}" || ch === " " || ch === "\n" || ch === "\t")
                return null;
            i--;
        }
        return null;
    }
    function renderDropdown() {
        if (currentMatches.length === 0) {
            dropdown.style.display = "none";
            return;
        }
        const { top, left } = caretCoords();
        dropdown.style.top = `${top}px`;
        dropdown.style.left = `${left}px`;
        dropdown.style.display = "block";
        dropdown.innerHTML = currentMatches.map((v, i) => `
      <div class="dc-var-dropdown-item ${i === activeIndex ? "active" : ""}" data-idx="${i}">
        <span class="dc-var-dropdown-key">{${escapeHtml(v.key)}}</span>
        <span class="dc-var-dropdown-desc">${escapeHtml(v.description || "")}</span>
      </div>`).join("");
        dropdown.querySelectorAll("[data-idx]").forEach(el => {
            el.addEventListener("mousedown", (e) => { e.preventDefault(); commitVariable(currentMatches[Number(el.dataset.idx)]); });
        });
    }
    function updateMatches() {
        const open = findOpenToken();
        if (!open) {
            currentMatches = [];
            tokenStart = -1;
            dropdown.style.display = "none";
            return;
        }
        tokenStart = open.start;
        const q = open.query.toLowerCase();
        currentMatches = q
            ? variables.filter(v => v.key.toLowerCase().includes(q))
            : variables.slice();
        activeIndex = 0;
        renderDropdown();
    }
    function commitVariable(v) {
        if (!v || tokenStart === -1)
            return;
        const caret = textarea.selectionStart;
        const before = textarea.value.slice(0, tokenStart);
        const after = textarea.value.slice(caret);
        const inserted = `{${v.key}}`;
        textarea.value = before + inserted + after;
        const newCaret = before.length + inserted.length;
        textarea.setSelectionRange(newCaret, newCaret);
        currentMatches = [];
        tokenStart = -1;
        dropdown.style.display = "none";
        syncBackdrop();
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.focus();
    }
    textarea.addEventListener("input", () => { syncBackdrop(); updateMatches(); });
    textarea.addEventListener("click", () => { updateMatches(); syncBackdrop(); });
    textarea.addEventListener("scroll", () => { backdrop.scrollTop = textarea.scrollTop; backdrop.scrollLeft = textarea.scrollLeft; });
    textarea.addEventListener("keydown", (e) => {
        if (dropdown.style.display === "none" || currentMatches.length === 0)
            return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            activeIndex = (activeIndex + 1) % currentMatches.length;
            renderDropdown();
        }
        else if (e.key === "ArrowUp") {
            e.preventDefault();
            activeIndex = (activeIndex - 1 + currentMatches.length) % currentMatches.length;
            renderDropdown();
        }
        else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            commitVariable(currentMatches[activeIndex]);
        }
        else if (e.key === "Escape") {
            currentMatches = [];
            tokenStart = -1;
            dropdown.style.display = "none";
        }
    });
    textarea.addEventListener("blur", () => {
        setTimeout(() => { dropdown.style.display = "none"; }, 120);
    });
    syncBackdrop();
    return {
        destroy() {
            wrap.parentNode.insertBefore(textarea, wrap);
            wrap.remove();
            textarea._dcVarAttached = false;
        },
    };
};
