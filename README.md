# Auto Ad Skipper

A lightweight Firefox extension that automatically clicks the **Skip Ad** button on YouTube the moment it becomes available. It also mutes ad audio while waiting for the skip button to appear and handles YouTube's single-page navigation correctly.

---

## How it works

```
YouTube tab loads
       │
       ▼
content.js injected by Firefox
       │
       ▼
startWatcher() waits for #movie_player
       │
       ├─── MutationObserver watches player DOM changes
       │         (fires instantly when ad overlay appears)
       │
       └─── setInterval polls every 700 ms
                 (safety net for timing edge cases)
       │
       ▼ (ad detected)
muteAdAudio()  →  findSkipButton()  →  btn.click()
       │
       ▼ (ad ended)
restoreAudio()
```

### Key design decisions

| Problem | Solution |
|---|---|
| `dispatchEvent(new MouseEvent('click'))` is ignored by YouTube | `HTMLElement.click()` — browsers set `isTrusted = true` for content-script programmatic clicks |
| `<script>` injection to call `click()` from page context | Blocked by YouTube's Content Security Policy — removed entirely |
| YouTube is a SPA; page never reloads between videos | Listen for `yt-navigate-finish` event and restart watcher |
| Ad audio plays for 5 s before skip button appears | `video.muted = true` immediately on ad detection, restored after skip |
| YouTube renames CSS classes periodically | Multiple selector fallbacks + text-content scan as last resort |

---

## Installation (Firefox)

### Temporary (for testing)
1. Open Firefox and navigate to `about:debugging`
2. Click **This Firefox** in the left panel
3. Click **Load Temporary Add-on...**
4. Navigate to the project folder and select `manifest.json`
5. The extension is now active — open any YouTube video with ads

The extension stays loaded until Firefox is restarted. Repeat these steps each session when testing.

### Permanent (self-signed XPI)
Firefox requires add-ons to be signed by Mozilla for permanent installation unless you use Firefox Developer Edition or Nightly.

**Option A — Firefox Developer Edition / Nightly (recommended for development):**
1. Open `about:config`
2. Set `xpinstall.signatures.required` to `false`
3. Zip the project folder: `cd auto-ad-skipper && zip -r ../auto-ad-skipper.xpi .`
4. In Firefox: `about:addons` → gear icon → **Install Add-on From File** → select `.xpi`

**Option B — Sign via addons.mozilla.org:**
1. Create a free account at https://addons.mozilla.org/developers/
2. Submit the `.xpi` for signing (can be unlisted/private)
3. Mozilla returns a signed `.xpi` within minutes

---

## Project structure

```
auto-ad-skipper/
├── manifest.json       # Extension manifest (permissions, entry points)
├── src/
│   └── content.js      # All extension logic (runs inside YouTube tabs)
├── icons/
│   ├── icon-48.png     # Toolbar icon (48×48)
│   └── icon-96.png     # Toolbar icon retina (96×96)
└── README.md
```

---

## Code walkthrough (`src/content.js`)

### Configuration constants

```js
const POLL_INTERVAL_MS = 700;
```
The polling fallback fires every 700 ms. Lower = faster response, higher = less CPU. 700 ms is a good balance; the skip button rarely appears faster than this.

```js
const COOLDOWN_MS = 1500;
```
After clicking skip, we wait 1.5 s before allowing another skip attempt. This prevents double-clicks and gives YouTube time to remove the ad overlay.

```js
const SKIP_BUTTON_SELECTORS = [ ... ];
```
An ordered list of CSS selectors for the skip button. We try each one in sequence. The last-resort path scans all `<button>` elements for the word "skip" in their text.

```js
const AD_PLAYING_SELECTORS = [ ... ];
```
CSS selectors that are present in the DOM only while an ad is playing. Checking these first is cheap and avoids unnecessary button searches during normal video playback.

---

### `isAdPlaying()`
Checks whether any of the known ad-indicator elements exist in the document. Returns `true` if an ad is currently playing.

### `findSkipButton()`
Searches for the skip button using the selector list, falling back to a text scan. Returns the button element if found and visible, `null` otherwise.

### `muteAdAudio()` / `restoreAudio()`
Temporarily mutes the `<video>` element when an ad starts. Saves the user's original muted state and restores it once the ad is gone.

### `trySkipAd()`
The main skip routine:
1. Guard check — bail if already in progress or no ad detected
2. Find the skip button; if not visible yet, mute and return (poll will try again)
3. Call `btn.click()` — this produces a trusted click event
4. Wait 1.5 s, then verify the ad is gone
5. If the ad is still playing, try one more click
6. If still playing after retry, treat as non-skippable and wait it out muted

### `startWatcher()`
Waits for `#movie_player` to appear in the DOM (retries every 1 s, up to 15 s), then attaches both the MutationObserver and the polling interval. Also runs an immediate check in case an ad is already playing when the watcher starts.

### SPA navigation handling
```js
document.addEventListener('yt-navigate-finish', () => { ... });
```
YouTube fires this custom event after every client-side page transition. We restart the watcher on each navigation to ensure we're observing the refreshed player element.

---

## Troubleshooting

**Extension loads but ads aren't skipped**
- Open the browser console on a YouTube tab (F12 → Console) and filter for `[Auto Ad Skipper]`
- You should see `👀 Watching for ads...` on load
- If you see `Could not find #movie_player`, the page structure has changed — open a GitHub issue

**The skip button is clicked but nothing happens**
- YouTube may have changed the player's event handling. Check the console for any CSP errors.
- Try refreshing the page — sometimes the player element gets into a bad state

**Audio stays muted after an ad**
- This can happen if the browser crashes or the tab is force-closed during an ad. Simply click the mute button in the YouTube player to toggle it back.

---

## Permissions

This extension requests **no special permissions**. The `host_permissions` entry for `*://*.youtube.com/*` is required to inject the content script — it grants no access to your browsing history, cookies, or any other data.

---

## License

MIT