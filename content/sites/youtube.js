/*
 * Spoiler Shield - YouTube site module
 * ============================================================================
 * Registers YouTube's scan() with the engine (content/core.js). The engine
 * runs scan() at document_start, on every debounced DOM mutation, and on SPA
 * navigation. scan() only TAGS nodes (adds marker classes); the actual hiding
 * is in content/sites/youtube.css, gated by the <html> classes.
 *
 * Everything CSS can do on its own (stable tags/attrs/ids) lives in the CSS
 * file. This file handles only the three cases CSS can't express:
 *
 *   A. Modern thumbnail duration badges share .badge-shape-wiz__text with
 *      LIVE / SHORTS / 4K / MEMBERS / PREMIERES badges → tag only timecodes.
 *      The home rich-grid ships a badge whose text-span class the precise list
 *      below misses, so a class-agnostic leaf pass (scoped to the thumbnail box,
 *      never the title) is the resilient catch-all.
 *   B. Description & comment timestamp links share their class with every
 *      other link → tag only the anchors whose text is a timecode.
 *   C. Chapters-panel timecode (#time) - CSS targets the id, but the id is
 *      historically unstable, so we also text-tag the leaf timecode as a
 *      fallback that survives a rename.
 *
 * HOW TO RE-FIND THESE WHEN YOUTUBE CHANGES (DevTools → Inspect):
 *   A. Right-click a duration pill on any thumbnail → Inspect. Walk up from the
 *      "12:34" text: span.badge-shape-wiz__text < badge-shape.badge-shape-wiz
 *      < yt-thumbnail-overlay-badge-view-model(.ytThumbnailOverlayBadgeViewModelHost)
 *      < yt-thumbnail-view-model. A LIVE/4K badge has the SAME classes but
 *      different text - that's why we match text, not class. (Some A/B builds
 *      use yt-badge-shape / .yt-badge-shape__text instead - both are queried.)
 *   B. Expand a description with chapters, or a comment like "2:34 great part".
 *      The blue "2:34" is an <a> whose ONLY text is the timecode and whose href
 *      contains &t=NNs; the title is the NEXT text node, OUTSIDE the <a>. So we
 *      tag the <a> and the CSS hides just its text (keeping it clickable).
 *   C. Open a chaptered video, click "Chapters". A row is
 *      ytd-macro-markers-list-item-renderer > a#endpoint > #details
 *      (h4 title + #time). We hide #time and, as a fallback, any leaf node in
 *      the row whose whole text is a timecode.
 * ============================================================================
 */
(() => {
  "use strict";
  const A = window.__anticip;
  if (!A) return;

  // (A) Modern view-model duration badges, scoped to thumbnail/lockup overlays
  // so we never touch unrelated badges elsewhere on the page. Tag-agnostic
  // where possible to survive YouTube's frequent view-model renames.
  const BADGE_TEXT =
    "ytd-thumbnail .badge-shape-wiz__text," +
    "yt-lockup-view-model .badge-shape-wiz__text," +
    "ytd-compact-video-renderer .badge-shape-wiz__text," +
    "yt-thumbnail-overlay-badge-view-model .badge-shape-wiz__text," +
    ".ytThumbnailOverlayBadgeViewModelHost .badge-shape-wiz__text," +
    // yt-badge-shape A/B variant of the same overlay badge:
    "yt-thumbnail-overlay-badge-view-model .yt-badge-shape__text," +
    ".ytThumbnailOverlayBadgeViewModelHost .yt-badge-shape__text";
  const PILL = "badge-shape, .badge-shape-wiz, yt-badge-shape, .yt-badge-shape";

  // (A, resilient) Thumbnail boxes whose overlay badge is the bottom-right time.
  // We scan their LEAF nodes for a bare timecode regardless of the badge's
  // text-span class - this is what catches the home grid, whose badge text class
  // (ytBadgeShapeTypography in current builds) the precise BADGE_TEXT list above
  // does not know. Each host is the thumbnail box only (image + overlays), NOT
  // the surrounding lockup, so the title/metadata are out of scope and a title
  // that happens to read like a timecode is never hidden. The anchored DUR_RE
  // keeps LIVE/SHORTS/4K labels (same hosts, different text) safe.
  // Only these two: the overlay-badge view-model lives INSIDE yt-thumbnail-view-model,
  // so listing it too would just re-walk the same subtree.
  const BADGE_HOSTS = "ytd-thumbnail, yt-thumbnail-view-model";

  function badgeLeaves() {
    const seen = new Set();
    const out = [];
    document.querySelectorAll(BADGE_HOSTS).forEach((host) => {
      host.querySelectorAll("*").forEach((el) => {
        if (el.firstElementChild || seen.has(el)) return; // leaf nodes only, deduped
        seen.add(el);
        out.push(el);
      });
    });
    return out;
  }

  // (B) Timestamp links in the description and comments. The href filter is a
  // cheap locator (a jump link carries ?t= / &t=); the anchored text regex is
  // the authority. Both legacy (yt-simple-endpoint) and modern
  // (yt-core-attributed-string__link) render paths are covered by the href hook.
  const TS_LINKS =
    "#description a[href*='t=']," +
    "ytd-text-inline-expander a[href*='t=']," +
    "ytd-watch-metadata a[href*='t=']," +
    "#content-text a[href*='t=']," + // comments
    "ytd-comment-view-model a[href*='t=']," +
    "a.yt-core-attributed-string__link[href*='t=']";

  // (C) Chapters panel / carousel rows (the #time id is hidden by CSS; here we
  // add the resilient leaf fallback).
  const CHAPTER_ROWS = "ytd-macro-markers-list-item-renderer, ytm-macro-markers-list-item-renderer";

  function scan(c) {
    // (A) duration pills - land the class on the whole pill so it fully hides.
    // First the precise text-class pass, then the class-agnostic leaf pass that
    // covers the home grid (and any future badge rename). Both land .anticip-dur
    // on the same PILL ancestor, so the result is idempotent.
    c.tagByText(document.querySelectorAll(BADGE_TEXT), c.DUR_RE, "anticip-dur", PILL);
    c.tagByText(badgeLeaves(), c.DUR_RE, "anticip-dur", PILL);

    // (B) timestamp links - tag the <a> itself (CSS keeps it clickable).
    c.tagByText(document.querySelectorAll(TS_LINKS), c.DUR_RE, "anticip-ts");

    // (C) chapters-panel timecode fallback (id-independent). Uses the
    // chapters-only marker so it stays gated by the Chapters toggle and is not
    // caught by the global thumbnail rule.
    c.tagLeafDurations(document.querySelectorAll(CHAPTER_ROWS), "anticip-chapter-dur");
  }

  A.boot({ key: "youtube", scan });
})();
