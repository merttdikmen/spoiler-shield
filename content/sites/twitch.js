/*
 * Spoiler Shield - Twitch site module
 * ============================================================================
 * Registers Twitch's scan() with the engine (content/core.js). Twitch ships
 * hashed React class names (Sc…) but keeps stable data-a-target /
 * data-test-selector attributes, so the CSS prefers those; this file handles
 * the cases that need text-matching.
 *
 * WHAT NEEDS JS HERE:
 *   A. VOD-card duration pill shares .tw-media-card-stat / [class*=MediaCardStat]
 *      with the view-count and "x days ago" lines → tag only timecodes.
 *   B. The card watch-progress / "resume" bar (the thin bar across the bottom of
 *      a partly-watched VOD thumbnail). Twitch renders it ONLY for a logged-in
 *      account - it is read from your view history - so it cannot be reproduced
 *      logged out. Its hashed class and accent color drift, so we tag it by
 *      stable progress-bar SEMANTICS (role="progressbar" / "progress" in the
 *      class / a progress data-attr), scoped to a VOD card so the player is never
 *      touched. The legacy seekbar-segment node is kept as one extra catch.
 *   C. CHAPTERS in video lists. The per-card "Chapters N" button opens a
 *      "Chapter Select" panel of rows (thumbnail + title + length). We KEEP the
 *      button and its rows clickable - only the per-chapter LENGTH is hidden.
 *      Twitch renders those lengths in WORD form ("47 minutes 55 seconds"), not
 *      as a timecode, so the engine's timecode regex never matches them; we
 *      pass a word-form regex (WORD_DUR_RE) to tagLeafDurations instead, scoped
 *      to the panel.
 *
 * HOW TO RE-FIND THESE (DevTools → Inspect):
 *   A. Inspect a VOD thumbnail's corner time pill → it carries
 *      data-a-target="video-time"; the "views • ago" line under the title uses
 *      the SAME .tw-media-card-stat class - that's why we match text, not class.
 *      (Log in first - the bar is invisible to logged-out viewers.)
 *   B. On your channel's Videos tab, find a VOD you have partly watched: a thin
 *      bar sits at the bottom of its thumbnail. Inspect it - it lives inside the
 *      card's a[data-a-target="preview-card-image-link"]. If it ever carries
 *      neither a progressbar role nor "progress" in its class, add its real hook
 *      to PROG below; the CSS in twitch.css mirrors the same selectors.
 *   C. On a channel's Videos tab, click a multi-game VOD's "Chapters N" button.
 *      The pop-up is headed "Chapter Select"; each row's grey sub-line is the
 *      length ("47 minutes 55 seconds"). Twitch gives the pop-up no stable
 *      attribute, so we locate it by (1) any [class*="chapter"] container and
 *      (2) the "Chapter Select" header text as a backstop, then text-tag only
 *      leaves whose WHOLE text is a word-form length. The row anchor/title are
 *      untouched, so the chapter stays clickable.
 * ============================================================================
 */
(() => {
  "use strict";
  const A = window.__anticip;
  if (!A) return;

  // (A) VOD-card duration pill (shared class → text-gated).
  const CARD_DUR =
    '[data-a-target="video-time"], .tw-media-card-stat, [class*="MediaCardStat"]';

  // (B) Card watch-progress / "resume" bar; tagged by progress-bar semantics and
  //     scoped to a card, so the player's seekbar is never caught. [class*=… i]
  //     matches Twitch's hashed "ScProgressBar-sc-…" regardless of the hash.
  const PROG =
    '[role="progressbar"], [class*="progress" i], ' +
    '[data-test-selector*="progress" i], [data-a-target*="progress" i], ' +
    'span[data-test-selector="seekbar-segment__segment"]';
  const CARD_SCOPE =
    'a[href^="/videos/"], [data-a-target="preview-card-image-link"], [data-a-target="preview-card-image"], .tw-media-card-image, article';

  // (C) Chapter-length containers. Broad on purpose - tagLeafDurations only
  //     tags a node whose ENTIRE text is a length, so a wide scope is still safe
  //     (nothing but a length is ever hidden). Tighten by appending the real
  //     panel selector once you've Inspected it.
  const CHAPTER_SCOPES =
    '[class*="chapter" i], [aria-label*="chapter" i], ' +
    '[data-a-target*="chapter" i], [data-test-selector*="chapter" i]';

  // Word-form chapter length, e.g. "47 minutes 55 seconds", "1 hour 3 minutes",
  // "45 seconds". FULLY ANCHORED. Because chapterScopes() spans whole rows, a
  // chapter TITLE leaf is in range too - so we DON'T match a bare single unit
  // ("24 Hours", "7 Minutes" are real titles). A real length always carries
  // seconds OR more than one unit, so we require either a seconds component
  // (with optional leading hours/minutes) OR an hours+minutes pair. The timecode
  // alternative covers panels that render "47:55" instead of words.
  const WORD_DUR_RE =
    /^\s*(?:\(?\s*(?:\d{1,3}:)?\d{1,3}:\d{2}\s*\)?|(?:\d+\s*(?:hours?|hrs?)\b\s*)?(?:\d+\s*(?:minutes?|mins?)\b\s*)?\d+\s*(?:seconds?|secs?)\b|\d+\s*(?:hours?|hrs?)\b\s*\d+\s*(?:minutes?|mins?)\b)\s*$/i;

  // Popup containers we climb to from the header (Twitch portals the pop-up to a
  // balloon/dialog layer with a hashed class, so match generously).
  const PANEL_ANCESTOR =
    '[role="dialog"], [class*="dialog" i], [class*="balloon" i], [class*="modal" i], [class*="popover" i]';

  // Locate the open "Chapter Select" pop-up. The class/attr scopes catch it when
  // Twitch names the container with "chapter"; the header backstop catches it
  // when they don't - we find the element whose WHOLE text is "Chapter Select"
  // (allowing no inner space, since the title may be split across inline spans →
  // textContent "ChapterSelect") and take its enclosing dialog/balloon, falling
  // back to a small parent climb. Overshooting is safe: tagLeafDurations only
  // ever tags a leaf that is itself a length, so a larger scope hides nothing
  // extra. Limited to heading/paragraph tags so the sweep stays cheap.
  function chapterScopes() {
    const roots = Array.from(document.querySelectorAll(CHAPTER_SCOPES));
    document.querySelectorAll("h1,h2,h3,h4,h5,h6,p").forEach((el) => {
      if (!/^chapter\s*select$/i.test((el.textContent || "").trim())) return;
      const panel = el.closest(PANEL_ANCESTOR);
      if (panel) {
        roots.push(panel);
        return;
      }
      let box = el;
      for (let i = 0; i < 4 && box.parentElement && box.parentElement !== document.body; i++) {
        box = box.parentElement;
      }
      roots.push(box);
    });
    return roots;
  }

  function scan(c) {
    // (A) card durations
    c.tagByText(document.querySelectorAll(CARD_DUR), c.DUR_RE, "anticip-dur");

    // (B) watch-progress / resume bar on a card (logged-in only). Tag by
    // progress-bar semantics within a card scope - resilient to Twitch's hashed
    // class and accent-color changes. The player is excluded by the card scope.
    document.querySelectorAll(CARD_SCOPE).forEach((card) => {
      card
        .querySelectorAll(PROG)
        .forEach((el) => el.classList.add("anticip-dur-fill"));
    });

    // (C) chapters: KEEP the "Chapters" button & its rows clickable; hide only
    // the per-chapter length. Twitch writes those in word form, so we pass
    // WORD_DUR_RE (timecode OR words) instead of the engine's timecode default.
    c.tagLeafDurations(chapterScopes(), "anticip-chapter-dur", WORD_DUR_RE);
  }

  A.boot({
    key: "twitch",
    // A VOD lives at /videos/… - scope player rules to it so live-stream
    // controls (which have no seekbar) are never touched.
    vodScope: () => location.pathname.startsWith("/videos/"),
    scan,
  });
})();
