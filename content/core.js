/*
 * Spoiler Shield - core engine (site-agnostic)
 * ============================================================================
 * This file knows NOTHING about YouTube or Twitch markup. All site-specific
 * selectors live in content/sites/<site>.js + <site>.css. This split is the
 * whole maintainability story: when a site ships a UI change, you edit ONE
 * file under content/sites/ and never touch the engine.
 *
 * HOW HIDING WORKS (read this before changing anything)
 * -----------------------------------------------------
 * Almost all hiding is pure CSS, gated behind classes this script toggles on
 * <html>:
 *     anticip-on        master switch (site enabled + not peeking)
 *     anticip-thumbs    thumbnail / list durations & watched bars
 *     anticip-player    player progress bar, scrubber & time
 *     anticip-chapters  chapter lengths + in-video timestamps
 *     anticip-tw-vod    (Twitch) current page is a VOD - scopes player rules
 *                       so live-stream controls are never touched
 * Flipping a class re-applies every rule instantly, with no reload, and the
 * rules auto-apply to nodes the site renders later.
 *
 * WHY SOME THINGS NEED JAVASCRIPT
 * -------------------------------
 * A few duration elements share their class with non-durations, so CSS alone
 * would over-hide. The site scan() functions identify the real durations by
 * their TEXT (an anchored MM:SS / H:MM:SS regex) and add a marker class the
 * CSS hides. Text-matching is the resilient part: when a site renames a hashed
 * class, only the cheap "locator" selector breaks - the regex still works.
 *
 *   .anticip-dur       a duration pill/cell to hide        (display:none)
 *   .anticip-dur-fill  a watched-progress fill to hide     (visibility:hidden)
 *   .anticip-ts        a timestamp <a> link - hide its time, keep it clickable
 *   .anticip-chapter-dur  a chapter length to hide; the row stays clickable
 *
 * CRITICAL: the regex is fully ANCHORED (^...$ on the trimmed text). Never
 * loosen it to match a timecode *inside* a longer string - that would hide
 * "4:3", chat timestamps, "Top 10 plays at 5:00", etc.
 *
 * Engine responsibilities:
 *   1. Hide synchronously at document_start (before first paint) so durations
 *      never flash, then reconcile against saved per-site settings.
 *   2. React to popup changes live (chrome.storage.onChanged), no reload.
 *   3. Run the site scan() on a debounced, idempotent MutationObserver and on
 *      SPA navigation (both sites lazy-render and never fully reload).
 *   4. Handle "peek" - temporarily reveal until the next navigation.
 * ============================================================================
 */
(() => {
  "use strict";
  if (window.__anticip) return; // guard against double injection

  const html = document.documentElement;

  // --- 1. Pre-hide before first paint -------------------------------------
  // These gates are universal; the Twitch VOD scope is added later by the site
  // file (still at document_start, still before paint, so no spoiler flash).
  html.classList.add("anticip-on", "anticip-thumbs", "anticip-player", "anticip-chapters");

  // --- Authoritative duration test ----------------------------------------
  // Matches the ENTIRE trimmed text: M:SS, MM:SS, H:MM:SS, HH:MM:SS, optional
  // surrounding parens (some YouTube pills render "(12:34)"). Anchored on
  // purpose - see the CRITICAL note above.
  const DUR_RE = /^\s*\(?\s*(?:\d{1,3}:)?\d{1,3}:\d{2}\s*\)?\s*$/;

  // --- Default settings (mirror this in popup/popup.js) -------------------
  // Per-site nested objects so each site exposes its own sub-toggles.
  const DEFAULTS = {
    enabled: true, // global master
    youtube: { enabled: true, thumbnails: true, player: true, chapters: true },
    twitch: { enabled: true, thumbnails: true, player: true, chapters: true },
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));

  let settings = clone(DEFAULTS);
  let site = null; // the registered site config (set by boot())
  let peeking = false;
  let observer = null;
  let lastUrl = location.href;
  let scanTimer = 0;
  let siteActive = true; // mirrors siteEnabled; gates scans when the site is off

  // Effective settings for the current site (defaults merged with stored).
  function siteSettings() {
    const stored = settings[site.key];
    const sv = stored && typeof stored === "object" ? stored : {};
    return Object.assign({}, DEFAULTS[site.key], sv);
  }

  // ---------- text-tagging helpers (used by site scan() functions) ----------
  // Add `cls` to every node whose trimmed text matches `re`; remove it from the
  // rest (nodes get recycled into non-durations as the SPA re-renders). If
  // `closestSel` is given, the class lands on that ancestor (e.g. the whole
  // pill) instead of the text node.
  function tagByText(nodes, re, cls, closestSel) {
    nodes.forEach((el) => {
      const match = re.test((el.textContent || "").trim());
      const target = closestSel ? el.closest(closestSel) || el : el;
      if (match) target.classList.add(cls);
      else if (!closestSel) el.classList.remove(cls);
      else if (target.classList.contains(cls) && !match) target.classList.remove(cls);
    });
  }

  // Tag leaf elements (no element children) whose ENTIRE text is a duration,
  // restricted to the given roots. This is the resilient fallback for panels
  // whose timecode lives in an unlabeled / renamed node: even a broad root is
  // safe because only a node that is *exactly* a duration is ever tagged.
  // Pass `re` to match a different shape (e.g. Twitch's word-form chapter
  // lengths, "47 minutes 55 seconds"); it must stay fully anchored. Defaults to
  // the timecode DUR_RE.
  function tagLeafDurations(roots, cls, re) {
    const rx = re || DUR_RE;
    roots.forEach((root) => {
      root.querySelectorAll("*").forEach((el) => {
        if (el.firstElementChild) return; // leaf nodes only
        if (el.classList.contains("anticip-dur")) return; // already a thumbnail-gated duration - don't double-gate
        if (rx.test((el.textContent || "").trim())) el.classList.add(cls);
      });
    });
  }

  const ctx = { DUR_RE, tagByText, tagLeafDurations, html };

  function runScan() {
    if (!siteActive) return; // disabled site: nothing to tag (CSS is off anyway)
    if (!site || typeof site.scan !== "function") return;
    try {
      site.scan(ctx);
    } catch (e) {
      /* a site DOM change should never throw the engine */
    }
  }

  // Coalesce bursty SPA mutations into a single pass.
  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = 0;
      runScan();
    }, 120);
  }

  function startObserver() {
    if (observer) return;
    runScan(); // initial pass; later passes come from the observer / nav / poll
    observer = new MutationObserver(scheduleScan);
    // Observe childList/subtree only - attribute/characterData observation is
    // the main source of jank on YouTube and we don't need it (the targets we
    // tag are added/removed as nodes, and in-place text like the player clock
    // is hidden by static CSS, not by tagging).
    observer.observe(html, { childList: true, subtree: true });
  }
  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  // ---------- apply settings → classes ----------
  function apply() {
    const s = siteSettings();
    const siteEnabled = settings.enabled && s.enabled !== false;
    html.classList.toggle("anticip-on", siteEnabled && !peeking);
    html.classList.toggle("anticip-thumbs", s.thumbnails !== false);
    html.classList.toggle("anticip-player", s.player !== false);
    html.classList.toggle("anticip-chapters", s.chapters !== false);
    if (typeof site.vodScope === "function") {
      html.classList.toggle("anticip-tw-vod", !!site.vodScope());
    }
    siteActive = siteEnabled;
    if (siteEnabled) startObserver();
    else stopObserver();
  }

  // ---------- settings load + live updates ----------
  function mergeStored(stored) {
    const out = clone(DEFAULTS);
    for (const k in stored) {
      const v = stored[k];
      if (v && typeof v === "object" && out[k] && typeof out[k] === "object") {
        out[k] = Object.assign({}, out[k], v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  function loadSettings() {
    try {
      chrome.storage.sync.get(DEFAULTS, (stored) => {
        if (!chrome.runtime.lastError && stored) settings = mergeStored(stored);
        apply();
      });
    } catch (e) {
      apply();
    }
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync") return;
        for (const k in changes) settings[k] = changes[k].newValue;
        apply();
      });
    } catch (e) {}
  }

  // ---------- SPA navigation ----------
  // A peek never leaks into the next video, and both sites lazy-render cards
  // after the URL changes, so we re-scan now + after late hydration.
  function onNavigated() {
    lastUrl = location.href;
    peeking = false;
    apply();
    runScan();
    setTimeout(runScan, 800);
    setTimeout(runScan, 2000);
  }
  function maybeNavigated() {
    if (location.href !== lastUrl) onNavigated();
  }

  function wireNavigation() {
    // YouTube dispatches these as real DOM events we can hear from the
    // isolated world.
    window.addEventListener("yt-navigate-finish", onNavigated, true);
    window.addEventListener("yt-page-data-updated", scheduleScan, true);
    // Back/forward.
    window.addEventListener("popstate", maybeNavigated);
    // A peek lasts only until the next navigation. Clicking a link IS that
    // navigation, so tear the reveal down at click time - before the next video
    // paints - instead of waiting up to 700ms for the URL poll (which would
    // briefly reveal the new VOD on Twitch, where there's no nav event).
    document.addEventListener(
      "click",
      (e) => {
        if (peeking && e.target && e.target.closest && e.target.closest("a[href]")) {
          peeking = false;
          apply();
        }
      },
      true
    );
    // Twitch (and YouTube pushState we don't otherwise hear): poll the URL.
    // history.pushState can't be intercepted from a content script's isolated
    // world, so polling is the reliable cross-site signal.
    setInterval(maybeNavigated, 700);
    // bfcache restore: the <html> gate classes survive but the observer does
    // not, and late nodes may be stale - re-apply and re-scan.
    window.addEventListener("pageshow", () => {
      apply();
      runScan();
    });
  }

  // ---------- peek (temporary reveal) ----------
  function wirePeek() {
    try {
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (!msg) return;
        if (msg.type === "anticip-peek") {
          peeking = true;
          apply();
        } else if (msg.type === "anticip-unpeek") {
          peeking = false;
          apply();
        }
        // "anticip-status" just falls through to the response below.
        sendResponse && sendResponse({ ok: true, peeking });
        return true;
      });
    } catch (e) {}
  }

  // ---------- public API: a site file calls this once ----------
  window.__anticip = {
    DUR_RE,
    boot(config) {
      site = config;
      apply(); // sets the VOD scope class immediately, before settings load
      loadSettings();
      wireNavigation();
      wirePeek();
    },
  };
})();
