# Spoiler Shield - Hide Video Durations

A Chrome/Edge extension (Manifest V3) that hides **video lengths, progress bars, thumbnail durations, chapter lengths, and timestamps** on **YouTube** and **Twitch** so you don't get spoiled about how much time is left.

Great for sports, esports, and other competitions where "5 minutes left" gives away the result.

## What it hides

**YouTube**
- Player progress/scrubber bar, the "most replayed" heatmap, chapter markers, and the time display (`0:42 / 12:00`).
- The hover seek-preview time tooltip.
- Duration badges on **every** thumbnail (home, search, sidebar/up-next, channels, playlists, history, end screen) - legacy and the modern view-model layout, desktop and mobile web.
- The red "watched" progress bar on thumbnails.
- **Chapters & timestamps:** chapter lengths in the Chapters panel/carousel, per-line transcript timecodes, and timestamp links in the **description and comments** - the time is replaced with a small ▶ you can still click to jump, while the title stays.

**Twitch**
- VOD player seekbar, scrubber, current-time / duration text, and the hover-preview timestamp.
- Duration pills and watched bars on VOD cards (channel Videos tab, directory, search, sidebar).
- **Chapter lengths:** the per-chapter lengths in a VOD's "Chapter Select" pop-up (and any inline segment lengths). The "Chapters" button and each chapter row stay clickable - only the length is hidden.
- Live streams are untouched (they have no seekbar).

Playback controls you still need - play/pause, volume, quality, captions, fullscreen - stay fully usable. You can still seek with the keyboard (← / →, or J/K/L on YouTube); you just can't *see* the position.

## Install (load unpacked)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this extension folder (the one containing `manifest.json`).
4. Pin the extension and open a YouTube/Twitch video. Durations should be gone.

No build step is required. (`tools/make-icons.mjs` only regenerates the icons; the PNGs are already committed.)

## Using it

Click the toolbar icon for the popup. The top level lists the **sites**; click a site to expand its own options:

- **Hide durations** - master on/off.
- **YouTube** → Thumbnail durations · Player progress & time · Chapters & timestamps.
- **Twitch** → VOD durations · Player seekbar & time · Chapter lengths.
- **Reveal current video** - temporarily *peek* (show times) on the current page until you open a different video.

Every toggle applies instantly, with no page reload. Settings sync across your Chrome profile via `chrome.storage.sync`.

## How it works

All hiding is gated behind classes on `<html>` that the content script toggles (the `anticip-` prefix is a deliberately obscure internal namespace, kept as-is so it can't collide with a real `spoiler`/`shield` class on YouTube or Twitch - it is not user-facing):

| class | hides |
| --- | --- |
| `anticip-on` | master (site enabled + not peeking) |
| `anticip-thumbs` | thumbnail / list durations & watched bars |
| `anticip-player` | player progress bar, scrubber & time |
| `anticip-chapters` | chapter lengths + in-video timestamps |
| `anticip-tw-vod` | (Twitch) page is a VOD - scopes player rules |

- **`content/core.js`** is the site-agnostic engine. It adds the gate classes **before first paint** (so durations never flash), reconciles against your saved per-site settings, and re-runs the active site's `scan()` on a debounced MutationObserver and on SPA navigation. It knows nothing about YouTube/Twitch markup.
- **`content/sites/<site>.js` + `<site>.css`** are the per-site modules. The CSS does the hiding (gated by the classes above); the JS only **tags** the few elements CSS can't express on its own.

A few things can't be done in pure CSS, so the scan tags them:

1. **Shared-class durations.** YouTube's modern `.badge-shape-wiz__text` is the same class for `12:34`, `LIVE`, `4K`, `MEMBERS`…; Twitch's `.tw-media-card-stat` is shared by the duration pill *and* the view-count/age line. The scan tags only the nodes whose **text** is a timecode (an anchored `MM:SS` / `H:MM:SS` regex) with `.anticip-dur`. (When even the text-span class is unknown - as on the home grid - the scan falls back to tagging any leaf inside the thumbnail box whose whole text is a timecode, so a class rename can't reintroduce the pill.)
2. **Timestamp links.** In a YouTube description/comment the time *is* the `<a>` and the title is a sibling outside it. The scan tags the anchor `.anticip-ts`; the CSS collapses its time text and drops a clickable ▶ in its place.
3. **Chapter lengths the markup won't isolate.** Twitch's "Chapter Select" pop-up exposes no stable hook for its per-chapter lengths and writes them as words (`47 minutes 55 seconds`), so the scan text-tags those length leaves `.anticip-chapter-dur` while leaving each row clickable. On YouTube the same marker is a rename-proof fallback for the Chapters-panel `#time`.

Why text-matching is the resilient choice: when a site renames a hashed class, only the cheap "locator" selector breaks - the regex still identifies the duration. **The regex is fully anchored on purpose** (it matches the *entire* trimmed text). Never loosen it to match a timecode inside a longer string, or it would hide "4:3", chat timestamps, or "Top 10 plays at 5:00".

## Maintenance - when a site changes its markup

YouTube and Twitch change their markup often. Because the engine is generic, a fix is almost always a **one-file edit** under `content/sites/`. Each site file's header comment lists, for every tricky selector, **how to re-find it via DevTools**. The short version:

1. Right-click the leaking element → **Inspect**.
2. Decide which kind of selector it needs:
   - **Stable** tag / attribute / id (e.g. `overlay-style`, `data-a-target`, `#time`) → add a selector to the matching section of `content/sites/<site>.css`, following the existing `html.anticip-on.anticip-… …` pattern.
   - **Shared / hashed** class, or text the CSS can't isolate → add the locator to the relevant `querySelectorAll` in `content/sites/<site>.js` so the scan text-tags it.
3. Reload the extension.

Tips for re-finding player controls: in DevTools open **Rendering → "Emulate a focused page"** so the controls don't auto-hide while you inspect.

The selectors were verified (2026) against community filter lists (uBlock Origin / AdGuard cosmetic filters) and the maintained spoiler extensions (`ky-is/twitch-vod-unspoiler`, `gijsdev/ublock-hide-yt-shorts`, the `tadwohlrapp` uBO gist). Each site file cites its sources inline.

### Known soft spots (most likely to break first)

- **YouTube modern badge** (`.badge-shape-wiz__text` / `.yt-badge-shape__text` / `ytBadgeShapeTypography`) - hashed view-model class, renamed without notice (the home grid already ships one the precise locator misses). A class-agnostic leaf pass over the thumbnail box (`ytd-thumbnail`, `yt-thumbnail-view-model`) catches the duration regardless, so a rename can't reintroduce the spoiler.
- **YouTube chapter panel `#time`** - the id is historically unstable, so `youtube.js` also text-tags the leaf timecode as a fallback.
- **Twitch "Chapter Select" pop-up** - Twitch exposes no stable attribute on it, so the panel is found by any `[class*="chapter"]` container with the "Chapter Select" header text as a backstop, and the lengths (rendered in word form, "47 minutes 55 seconds") are text-tagged. If Twitch ships a stable panel container, add it to `CHAPTER_SCOPES` in `content/sites/twitch.js` for tighter targeting.
- **Twitch VOD-card watch-progress bar** - the thin "resume" bar across a partly-watched thumbnail renders only for a logged-in account (it is read from your view history). Its hashed class and accent color drift, so it is targeted by stable progress-bar semantics (`role="progressbar"` / `"progress"` in the class) scoped to a VOD card, in both `content/sites/twitch.css` and `PROG` in `content/sites/twitch.js`. If a future bar carries neither hook, Inspect it (logged in) and add its real selector to `PROG`.

## Privacy

Spoiler Shield collects nothing. It stores only your toggle preferences (via `chrome.storage.sync`), makes no network requests, runs no remote code, and reads the page only on `youtube.com` and `twitch.tv` to hide on-screen times. The full policy is in **[PRIVACY.md](PRIVACY.md)**.

The public URL used for the Chrome Web Store privacy-policy field is:
`https://github.com/merttdikmen/spoiler-shield/blob/main/PRIVACY.md`

## Publishing to the Chrome Web Store

See **[STORE.md](STORE.md)** for the listing copy, the single-purpose statement, per-permission justifications, and the data-disclosure answers, and **[PRIVACY.md](PRIVACY.md)** for the privacy policy. The listing graphics (icon, tiles, screenshots) plus a one-command rebuild script and the full submission walkthrough live in **[store/](store/README.md)**. In short: the only permission is `storage` (local toggle prefs); host access is two narrow `content_scripts.matches` (`youtube.com`, `twitch.tv`) - no `<all_urls>`, no `host_permissions`, no remote code - which keeps you out of the broad-host in-depth review queue.

## Files

```
manifest.json                MV3 manifest (per-site injection, storage-only)
content/core.js              site-agnostic engine: gates, settings, observer, nav, peek
content/sites/youtube.js     YouTube text-tagging (badges, timestamp links, chapters)
content/sites/youtube.css    YouTube hiding rules
content/sites/twitch.js      Twitch text-tagging (cards, watch-progress bar, chapters)
content/sites/twitch.css     Twitch hiding rules
popup/                       toolbar popup UI (per-site, accordion)
icons/                       generated PNG icons
tools/make-icons.mjs         regenerate icons (optional)
STORE.md                     Chrome Web Store listing & review notes
PRIVACY.md                   privacy policy
store/                       Web Store graphics + reproducible build pipeline (see store/README.md)
```
