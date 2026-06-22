"use strict";

// Mirror of content/core.js DEFAULTS (per-site nested).
const DEFAULTS = {
  enabled: true,
  youtube: { enabled: true, thumbnails: true, player: true, chapters: true },
  twitch: { enabled: true, thumbnails: true, player: true, chapters: true },
};

const clone = (o) => JSON.parse(JSON.stringify(o));

// Inline brand glyphs (no network, no extra files).
const ICONS = {
  youtube:
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#FF0000" d="M23 7.5a3 3 0 0 0-2.1-2.1C19 5 12 5 12 5s-7 0-8.9.4A3 3 0 0 0 1 7.5 31 31 0 0 0 .6 12 31 31 0 0 0 1 16.5a3 3 0 0 0 2.1 2.1C5 19 12 19 12 19s7 0 8.9-.4a3 3 0 0 0 2.1-2.1A31 31 0 0 0 23.4 12 31 31 0 0 0 23 7.5Z"/><path fill="#fff" d="M9.8 15.3 15.5 12 9.8 8.7Z"/></svg>',
  twitch:
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#9146FF" d="M2.15 0 .54 4.12v16.83h5.73V24h3.05l3.04-3.05h4.84L23.46 15V0Zm19.16 14.16-3.58 3.58h-5.73l-3.05 3.05v-3.05H4.57V2.15h16.74Z"/><path fill="#9146FF" d="M16.75 5.73H14.6V12h2.15zM11.16 5.73H9.02V12h2.14z"/></svg>',
};

// Each site exposes its OWN sub-options (they differ where the sites differ).
const SITES = [
  {
    key: "youtube",
    name: "YouTube",
    subs: [
      { k: "thumbnails", title: "Thumbnail durations", sub: "Lengths & watched bars on video lists" },
      { k: "player", title: "Player progress & time", sub: "Scrubber, progress bar & timestamps" },
      { k: "chapters", title: "Chapters & timestamps", sub: "Chapter lengths + description/comment timestamps" },
    ],
  },
  {
    key: "twitch",
    name: "Twitch",
    subs: [
      { k: "thumbnails", title: "VOD durations", sub: "Lengths & watched bars on VOD cards" },
      { k: "player", title: "Player seekbar & time", sub: "VOD scrubber, seekbar & time" },
      { k: "chapters", title: "Chapter lengths", sub: "Per-chapter lengths in video lists" },
    ],
  },
];

let state = clone(DEFAULTS);

const enabledEl = document.getElementById("enabled");
const sitesEl = document.getElementById("sites");

// Effective config for a site (stored partial merged over defaults).
function siteCfg(key) {
  const v = state[key];
  return Object.assign({}, DEFAULTS[key], v && typeof v === "object" ? v : {});
}

function reflectMaster() {
  enabledEl.checked = !!state.enabled;
  sitesEl.classList.toggle("disabled", !state.enabled);
}

// Dim a site's sub-toggles when the site itself is off.
function reflectSite(card) {
  const on = siteCfg(card.dataset.site).enabled !== false;
  card.classList.toggle("site-off", !on);
  card.querySelectorAll('input[data-toggle]:not([data-toggle="enabled"])').forEach((inp) => {
    inp.disabled = !on;
  });
}

function build() {
  sitesEl.innerHTML = "";
  SITES.forEach((site) => {
    const cfg = siteCfg(site.key);
    const card = document.createElement("div");
    card.className = "site";
    card.dataset.site = site.key;

    const head = document.createElement("div");
    head.className = "site-head";
    head.innerHTML =
      `<span class="site-ico">${ICONS[site.key]}</span>` +
      `<span class="site-name">${site.name}</span>` +
      `<label class="switch site-switch"><input type="checkbox" data-toggle="enabled" /><span class="slider"></span></label>` +
      `<span class="chevron" aria-hidden="true">›</span>`;
    card.appendChild(head);

    const subs = document.createElement("div");
    subs.className = "site-subs";
    site.subs.forEach((s) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML =
        `<span class="switch-label"><span class="title">${s.title}</span><span class="sub">${s.sub}</span></span>` +
        `<label class="switch"><input type="checkbox" data-toggle="${s.k}" /><span class="slider"></span></label>`;
      subs.appendChild(row);
    });
    card.appendChild(subs);

    // Initial states.
    card.querySelectorAll("input[data-toggle]").forEach((inp) => {
      inp.checked = cfg[inp.dataset.toggle] !== false;
    });
    reflectSite(card);

    // Click the row to expand the site's options - but not when flipping the
    // site's own on/off switch.
    head.addEventListener("click", (e) => {
      if (e.target.closest(".site-switch")) return;
      card.classList.toggle("open");
    });

    // Persist on change. Sub-toggles and the site switch both write the whole
    // site object under its top-level storage key.
    card.querySelectorAll("input[data-toggle]").forEach((inp) => {
      inp.addEventListener("change", () => {
        const obj = siteCfg(site.key);
        obj[inp.dataset.toggle] = inp.checked;
        state[site.key] = obj;
        chrome.storage.sync.set({ [site.key]: obj });
        if (inp.dataset.toggle === "enabled") reflectSite(card);
      });
    });

    sitesEl.appendChild(card);
  });
}

// Load settings, then render.
chrome.storage.sync.get(DEFAULTS, (s) => {
  if (s) state = Object.assign(clone(DEFAULTS), s);
  reflectMaster();
  build();
});

enabledEl.addEventListener("change", () => {
  state.enabled = enabledEl.checked;
  chrome.storage.sync.set({ enabled: state.enabled });
  reflectMaster();
});

// Keep an open popup in sync if settings change elsewhere (another device via
// Chrome Sync, or a second surface). Updates controls IN PLACE so it never
// collapses a card mid-interaction. (Also fires for our own writes - harmless,
// the values already match.)
function syncInputs() {
  enabledEl.checked = !!state.enabled;
  sitesEl.classList.toggle("disabled", !state.enabled);
  sitesEl.querySelectorAll(".site").forEach((card) => {
    const cfg = siteCfg(card.dataset.site);
    card.querySelectorAll("input[data-toggle]").forEach((inp) => {
      inp.checked = cfg[inp.dataset.toggle] !== false;
    });
    reflectSite(card);
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  for (const k in changes) state[k] = changes[k].newValue;
  syncInputs();
});

// ---------- peek (temporary reveal of the current tab) ----------
const peekBtn = document.getElementById("peek");
const peekText = peekBtn.querySelector(".peek-text");
const peekIcon = peekBtn.querySelector(".peek-icon");
let peeking = false;

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function setPeekUI(on) {
  peeking = on;
  peekBtn.classList.toggle("active", on);
  peekText.textContent = on ? "Re-hide video" : "Reveal current video";
  peekIcon.textContent = on ? "🙈" : "👁";
}

// Reflect whether the current tab is already peeking (and disable on non
// YouTube/Twitch tabs, where the content script isn't present).
(async () => {
  const tab = await activeTab();
  if (!tab || !tab.id) return;
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "anticip-status" });
    if (res && res.peeking) setPeekUI(true);
  } catch (e) {
    // Content script not ready (tab opened before install/update, mid-load, or
    // a non-YouTube/Twitch tab). The click handler tolerates a missing content
    // script, so leave the button enabled rather than dead-locking it on a
    // supported page.
  }
})();

peekBtn.addEventListener("click", async () => {
  const tab = await activeTab();
  if (!tab || !tab.id) return;
  const next = !peeking;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: next ? "anticip-peek" : "anticip-unpeek" });
    setPeekUI(next);
  } catch (e) {
    // Content script not present on this page.
  }
});
