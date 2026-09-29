// _dropdown.js
window.DC = window.DC || {};
window.DC.createDropdown = function (container, { options, value, values, placeholder, searchable = false, multi = false, onChange }) {
    let current = value ?? null;
    let currentMulti = Array.isArray(values) ? [...values] : [];
    let listeners = [];
    let open = false;
    container.innerHTML = "";
    container.classList.add("dc-dropdown");
    if (multi)
        container.classList.add("dc-dropdown-multi");
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "dc-dropdown-trigger";
    container.appendChild(trigger);
    const panel = document.createElement("div");
    panel.className = "dc-dropdown-panel";
    panel.style.display = "none";
    container.appendChild(panel);
    let searchInput = null;
    if (searchable) {
        searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.placeholder = "Search…";
        searchInput.className = "dc-dropdown-search";
        panel.appendChild(searchInput);
    }
    const list = document.createElement("div");
    list.className = "dc-dropdown-list";
    panel.appendChild(list);
    function escapeLabel(s) { return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
    function paintTrigger() {
        if (multi) {
            const chosen = options.filter(o => currentMulti.includes(o.value));
            trigger.innerHTML = chosen.length
                ? `<span class="dc-dropdown-chips">${chosen.map(o => `
            <span class="dc-dropdown-chip" data-chip-val="${escapeLabel(String(o.value))}">
              ${o.icon || ""}${escapeLabel(o.label)}
              <span class="dc-dropdown-chip-x" data-chip-remove="${escapeLabel(String(o.value))}">&times;</span>
            </span>`).join("")}</span>
           <i class="ti ti-chevron-down"></i>`
                : `<span class="dc-dropdown-trigger-content"><span class="dc-dropdown-placeholder">${placeholder || "Select…"}</span></span><i class="ti ti-chevron-down"></i>`;
            trigger.querySelectorAll("[data-chip-remove]").forEach(el => el.addEventListener("click", (e) => {
                e.stopPropagation();
                toggleMulti(el.dataset.chipRemove);
            }));
            return;
        }
        const opt = options.find(o => o.value === current);
        trigger.innerHTML = `
      <span class="dc-dropdown-trigger-content">${opt ? (opt.icon || "") + escapeLabel(opt.label) : `<span class="dc-dropdown-placeholder">${placeholder || "Select…"}</span>`}</span>
      <i class="ti ti-chevron-down"></i>`;
    }
    function toggleMulti(rawVal) {
        const opt = options.find(o => String(o.value) === String(rawVal));
        const val = opt ? opt.value : rawVal;
        const idx = currentMulti.indexOf(val);
        if (idx === -1)
            currentMulti.push(val);
        else
            currentMulti.splice(idx, 1);
        paintTrigger();
        paintList(searchInput ? searchInput.value : "");
        listeners.forEach(fn => fn(currentMulti));
    }
    function paintList(filter) {
        const q = (filter || "").toLowerCase();
        const filtered = q ? options.filter(o => o.label.toLowerCase().includes(q)) : options;
        if (filtered.length === 0) {
            list.innerHTML = `<div class="dc-dropdown-empty">No matches</div>`;
            return;
        }
        list.innerHTML = filtered.map(o => {
            const isSelected = multi ? currentMulti.includes(o.value) : o.value === current;
            return `
      <div class="dc-dropdown-item ${isSelected ? "selected" : ""}" data-val="${escapeLabel(String(o.value))}">
        <span class="dc-dropdown-item-main">${o.icon || ""}<span>${escapeLabel(o.label)}</span>${o.sub ? `<span class="dc-dropdown-item-sub">${escapeLabel(o.sub)}</span>` : ""}</span>
        ${isSelected ? `<i class="ti ti-check"></i>` : ""}
      </div>`;
        }).join("");
        list.querySelectorAll("[data-val]").forEach(el => el.addEventListener("click", () => {
            if (multi) {
                toggleMulti(el.dataset.val);
                return;
            }
            const opt = options.find(o => String(o.value) === el.dataset.val);
            current = opt ? opt.value : el.dataset.val;
            paintTrigger();
            closePanel();
            listeners.forEach(fn => fn(current));
        }));
    }
    function openPanel() {
        open = true;
        panel.style.display = "block";
        paintList(searchInput ? searchInput.value : "");
        if (searchInput) {
            searchInput.value = "";
            searchInput.focus();
        }
        document.addEventListener("click", onDocClick, true);
    }
    function closePanel() {
        open = false;
        panel.style.display = "none";
        document.removeEventListener("click", onDocClick, true);
    }
    function onDocClick(e) { if (!container.contains(e.target))
        closePanel(); }
    trigger.addEventListener("click", () => (open ? closePanel() : openPanel()));
    if (searchInput)
        searchInput.addEventListener("input", () => paintList(searchInput.value));
    paintTrigger();
    if (onChange)
        listeners.push(onChange);
    return {
        getValue: () => (multi ? currentMulti : current),
        setValue: (val) => { if (multi) {
            currentMulti = Array.isArray(val) ? [...val] : [];
        }
        else {
            current = val;
        } paintTrigger(); },
        getValues: () => currentMulti,
        setValues: (arr) => { currentMulti = Array.isArray(arr) ? [...arr] : []; paintTrigger(); },
        onChange: (fn) => listeners.push(fn),
    };
};
