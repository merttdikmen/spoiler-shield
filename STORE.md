# Chrome Web Store - listing & review notes

Everything you need to fill in the Web Store dashboard, plus the choices that keep this extension out of the slow review queue.

## Single purpose (paste into the "Single purpose" field)

> Hides video durations, timestamps, progress bars, and chapter lengths on YouTube and Twitch so users avoid spoilers about how much of a video or VOD remains.

Keep this one sentence consistent across the Single-purpose field, the description, and the permission justifications. Don't bundle unrelated features - a second purpose is the most common rejection.

## Short description / summary (the `manifest.json` `description`, ≤132 chars)

> Hide YouTube & Twitch video durations, progress bars, thumbnail times & chapter lengths so the clock never spoils the result.

This is the one-liner shown under the name in search results. It mirrors the manifest `description` field (Chrome caps that at 132 characters - keep any edits under the limit).

## Detailed description (paste into the listing "Description" field)

```
Spoiler Shield hides how much time is left in a video or stream, so the clock never spoils the ending. Great for sports, esports, speedruns, awards shows, and reaction videos - anything where "5 minutes left" gives away the result.

Flip it on and the timers disappear instantly, with no page reload. Everything you actually need to watch keeps working.

WHAT IT HIDES
• Thumbnail durations and the "watched"/resume progress bars across YouTube and Twitch - home, search, channels, playlists, sidebar/up-next, and history.
• The player's progress and scrubber bar, the time readout (0:42 / 12:00), and YouTube's "most replayed" heatmap.
• Chapter lengths and chapter markers, transcript timecodes, and the hover seek-preview time.
• Timestamp links in descriptions and comments - the time is replaced with a clickable ▶, so you can still jump to it without seeing where it lands.
• On Twitch: the VOD seekbar, scrubber, and duration on /videos pages. Live streams are left untouched.

STILL FULLY USABLE
Play/pause, volume, quality, captions, and fullscreen work normally. You can still seek with the keyboard (← / → on both sites, J / K / L on YouTube) - you just can't see the position.

YOU'RE IN CONTROL
• Master on/off switch, plus independent toggles per site (thumbnails, player, chapters).
• A "Reveal current video" button to peek at the times on the page you're on, until you open something else.
• Your preferences sync across your devices through your own Chrome profile.

PRIVACY
No accounts, no tracking, no analytics, no remote code, and nothing leaves your device. Spoiler Shield runs only on youtube.com and twitch.tv, and the only thing it stores is your on/off toggle preferences.
```

## Permissions & host access

The manifest requests the **minimum** that still hides durations *before first paint*:

- `permissions`: **`storage`** only.
- Host access: two **narrow** `content_scripts.matches` - `https://*.youtube.com/*` and `https://*.twitch.tv/*`. (The `*.youtube.com` wildcard already covers `m.youtube.com`.)
- **No** `host_permissions` key, **no** `<all_urls>` / `*://*/*`, **no** `activeTab`, **no** `scripting`, **no** remote code.

Why these choices:

- **`activeTab` was removed deliberately.** It only grants access *after* a toolbar click, so it cannot auto-hide on page load - the declarative `content_scripts` entry is what does that. The popup's "peek" talks to the already-injected content script via `chrome.tabs.sendMessage`, which needs no permission. Requesting `activeTab` would be an extra thing to justify for zero benefit.
- **Narrow named match patterns** (two specific domains) do **not** trigger the broad-host-permissions in-depth review that `<all_urls>` / `*://*/*` do - which can add 1-2 weeks. Keep `matches` to exactly these two sites.

### Permission justifications (paste into each field)

- **storage** - "Persists the user's on/off and per-site (thumbnails / player / chapters) toggle preferences locally and syncs them across the user's own Chrome profile. No browsing data is read or stored."
- **Host access to youtube.com / twitch.tv** - "Injects the CSS/JS that hides duration, progress-bar, chapter, and timestamp UI on the two sites this extension supports. It runs only on these domains."

## Data disclosure & Limited Use (dashboard "Privacy" tab)

This extension collects **no** user data. Answer the disclosure form accordingly:

- For every data category (PII, health, financial, authentication, personal communications, location, web history, user activity, website content): **not collected**.
- Certify the Limited Use statements: data use is limited to the single purpose; no transfer except as required; no sale; no use for personalized advertising or creditworthiness; no human reads the data. (All trivially true - nothing is collected.)
- Privacy policy URL: host **[PRIVACY.md](PRIVACY.md)** somewhere public (e.g. a GitHub Pages/Gist URL) and paste the link in the dedicated **Privacy policy** field - not in the description (that placement is a listed rejection cause). A policy isn't strictly required for a zero-data, local-prefs-only extension, but it's cheap insurance and removes ambiguity.

## Remotely-hosted code

MV3 bans executing remotely-fetched logic. This extension ships everything in the package - selectors and regexes are static `.js`/`.css`. Ship selector updates as normal versioned releases (do **not** add a self-updating remote selector list). Declare **"does not use remote code"** in the dashboard.

## Listing metadata

- Real icon (already in `icons/`) + a few before/after screenshots showing durations hidden on YouTube and Twitch.
- Describe actual behavior; don't keyword-stuff the description with sports/esports/team/league names (Keyword Stuffing flag).

## Pre-submit checklist

- [ ] `manifest.json` version bumped.
- [ ] Loads unpacked with no console errors on youtube.com and twitch.tv.
- [ ] Master toggle + every per-site sub-toggle works live (no reload).
- [ ] "Peek" reveals on the current video and re-hides on navigation.
- [ ] Keyboard seeking still works with the seekbar hidden (← / → and J/K/L).
- [ ] Single-purpose sentence, permission justifications, and privacy answers entered.
- [ ] Privacy policy URL set in the Privacy tab.
