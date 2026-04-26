# Auto Ad Skipper

A lightweight Firefox extension that automatically skips YouTube ads by seeking the video to its end the moment an ad is detected. No clicking, no UI interaction — just instant skipping.

---

## How it works

```
YouTube tab loads
       │
       ▼
content.js injected by Firefox
       │
       ▼
MutationObserver watches document.body for class changes
       +
setInterval polls every 700 ms as a safety net
       │
       ▼ (ad detected via .ad-showing on #movie_player)
Check video.duration < 300s  ──✗──▶  Abort (main video, not ad)
       │ ✓
       ▼
video.currentTime = video.duration  →  Ad ends instantly
       │
       ▼
Cooldown 2s → resume watching
```

### Key design decisions

| Problem | Solution |
|---|---|
| `dispatchEvent(new MouseEvent('click'))` is ignored by YouTube | Firefox content scripts produce `isTrusted = false` clicks — YouTube's skip button handler rejects these silently |
| `<script>` tag injection to call `click()` from page context | Blocked by YouTube's Content Security Policy |
| `HTMLElement.click()` from content script | Also produces `isTrusted = false` in Firefox — button found, clicked, nothing happened |
| Seeking `video.currentTime = duration` skips the ad | No click event needed — YouTube can't block this |
| Seeking also ends the main video | Added a duration guard: only seek if `video.duration < 300s` (ads are never longer than 5 min) |
| `ad-showing` class briefly persists after ad ends | By the time the seek fires, YouTube has swapped video src to main video — duration guard catches this |
| YouTube is a SPA; page never reloads between videos | Listen for `yt-navigate-finish` event to reset state on each navigation |

---

## Problems we ran into (and how we solved them)

### 1. Clicks were being silently ignored
The original code used `dispatchEvent(new MouseEvent('click'))` and injected a `<script>` tag to simulate a click. Both approaches produce `isTrusted = false` events, which YouTube's skip button handler explicitly rejects. The button was being found correctly every time — the clicks just did nothing. We confirmed this by watching the console show "Clicking skip button" dozens of times with no result.

### 2. `HTMLElement.click()` also didn't work in Firefox
Unlike Chrome, Firefox content scripts do not produce trusted click events via `btn.click()`. We verified this by watching the console log the click repeatedly with no effect on the ad. This ruled out the button-clicking approach entirely.

### 3. Seeking the video ended the main video too
Switching to `video.currentTime = video.duration` worked for skipping ads, but also ended the main video after the ad finished. The root cause: YouTube reuses the same `<video>` element for both ads and main content. When the ad ended and the main video loaded, `ad-showing` was still briefly present on the player, causing a seek on the main video.

### 4. Duration was the giveaway
The console showed durations of 1372s and 1403s (~23 minutes) being seeked — clearly the main video, not an ad. The fix was simple: refuse to seek anything longer than 300 seconds. YouTube ads are never that long, so the main video is always protected.

### 5. Ad audio muting broke normal playback
An early version muted the video while waiting for the skip button to appear. Due to a state bug, `originalMutedState` wasn't always restored, leaving users permanently muted. The muting feature was removed entirely since the seek approach skips ads fast enough that muting isn't needed.

---

## Installation (Firefox)

### Step 1 — Get the files
Clone the repo or download and extract the ZIP:
```bash
git clone https://github.com/Abdallah72730/auto-ad-skipper.git
```

### Step 2 — Load in Firefox (temporary, for testing)
1. Open Firefox and go to `about:debugging`
2. Click **This Firefox** in the left sidebar
3. Click **Load Temporary Add-on...**
4. Navigate to the project folder and select `manifest.json`
5. The extension is now active — open any YouTube video

> The extension stays active until Firefox is restarted. Repeat from Step 2 each session.

### Step 3 — Verify it's working
1. Open a YouTube video that plays an ad
2. Press **F12** to open DevTools → **Console** tab
3. Filter by `Auto Ad Skipper`
4. You should see `Running.` on load, then `Ad detected — seeking to end` when an ad plays

### Permanent installation (optional)
Firefox requires extensions to be signed by Mozilla for permanent installation.

**Option A — Firefox Developer Edition or Nightly:**
1. Go to `about:config` and set `xpinstall.signatures.required` to `false`
2. Package the extension: `cd auto-ad-skipper && zip -r ../auto-ad-skipper.xpi .`
3. Go to `about:addons` → gear icon → **Install Add-on From File** → select the `.xpi`

**Option B — Sign via Mozilla (free):**
1. Create an account at https://addons.mozilla.org/developers/
2. Submit the `.xpi` as an unlisted/private add-on
3. Mozilla returns a signed `.xpi` within minutes that can be permanently installed

---

## Project structure

```
auto-ad-skipper/
├── manifest.json       # Extension manifest — permissions, entry points, Firefox ID
├── src/
│   └── content.js      # All extension logic (injected into every YouTube tab)
├── icons/
│   ├── icon-48.png     # Toolbar icon (48×48 px)
│   └── icon-96.png     # Toolbar icon retina (96×96 px)
└── README.md
```

---

## Code walkthrough (`src/content.js`)

### Constants

```js
const POLL_INTERVAL_MS = 700;
```
How often the polling fallback checks for an ad. 700 ms is fast enough to catch an ad within one second of it starting, without hammering the DOM unnecessarily.

```js
const COOLDOWN_MS = 2000;
```
After a successful seek, we wait 2 seconds before allowing another skip. This prevents repeated seeks while YouTube transitions from ad to main video.

```js
const MAX_AD_DURATION_S = 300;
```
The maximum duration we will seek. Anything longer than 5 minutes is treated as the main video and left alone. YouTube ads are never longer than this.

---

### `isAdPlaying()`
Checks if `#movie_player` has the class `ad-showing`. YouTube adds this class exclusively during ad playback and removes it the instant the main video starts. This is the most reliable ad signal available.

### `skipAd()`
The main routine:
1. Bail if on cooldown or no ad detected
2. Get the `<video>` element
3. Check `video.duration` — if unknown or over 300s, abort to protect the main video
4. Set `video.currentTime = video.duration` to end the ad instantly
5. Start the 2s cooldown

### MutationObserver
Watches `document.body` for any DOM or class changes. Fires instantly when YouTube adds or removes `ad-showing`, giving near-zero reaction time when an ad starts.

### Polling fallback (`setInterval`)
Runs `skipAd()` every 700 ms as a safety net for cases where the MutationObserver fires before the video element has loaded its duration.

### `yt-navigate-finish` listener
YouTube fires this event after every client-side navigation (clicking a video, pressing Back, etc.). We reset the cooldown so the next video's ads can be caught cleanly.

---

## Troubleshooting

**"Running." appears but ads aren't skipped**
The console should show `Ad detected — seeking to end (Xs)` when an ad plays. If it shows `exceeds max ad length`, the ad duration guard triggered — this means `ad-showing` is present but the video src has already switched to the main video. This is a timing edge case; the ad will play out normally in this scenario.

**Extension not loading**
Make sure you're selecting `manifest.json` (not a folder or another file) in the Load Temporary Add-on dialog.

**Stops working after Firefox restart**
Temporary add-ons don't survive restarts. Re-load via `about:debugging`, or follow the permanent installation steps above.

---

## Permissions

This extension requests no special permissions. The `host_permissions` entry for `*://*.youtube.com/*` only allows the content script to be injected into YouTube tabs — it grants no access to browsing history, cookies, or any other data.

---

## License

MIT