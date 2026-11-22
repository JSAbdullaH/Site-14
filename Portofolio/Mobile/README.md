# SITE14 for iPhone and Apple Watch

Shares the wearer's location with SITE14, in the background, and shows them where their site is.
It is a client of the device API in [../Backend/DEVICES.md](../Backend/DEVICES.md), the same one the web tracker uses.

| | iPhone | Apple Watch |
|---|---|---|
| Pairs with the company | Yes: QR scan, typed code, or the `/pair/XXXX` link | Gets the key from the iPhone, no code |
| Sends location | In the background, also with the app closed | While "Share from watch" is on, also in the background |
| Shows the site | Map with the boundary and zones, where you are, shift, directions | Status ring with distance and an arrow to the site, map page |

## How it fits the system

1. The admin opens **Devices → Connect a device** and shows the QR code.
2. On the iPhone, the QR code (or the link) opens the SITE14 app. If the app is not installed, the `/pair` page says to get it. The app can also scan the code itself.
3. The app claims the code (`POST /pairing/:code/claim`). The server sees `SITE14/1.0 (iPhone; iOS 17.5; …)` and records the device as a phone, model from the app, browser "SITE14 app 1.0".
4. The key goes to the Keychain and, through WatchConnectivity, to the watch. Both send as **one device**: the server allows one device per employee.
5. Readings: one every 5 s, sent every 10 s (`POST /ingest/readings`), heartbeat every 30 s, `GET /ingest/site` for the boundary and zones whenever the heartbeat's `site.id` changes.

Only one of the two sends at a time. While the watch shares, it tells the iPhone every 30 s and the iPhone holds back (it keeps a coarse fix, sends nothing). If the iPhone hears nothing for 150 s it takes over, before the server would mark the wearer offline (3 min).

Errors follow DEVICES.md: `401/403` stop and show the reason; `409` (unassigned, no consent, no site) and `422` drop the batch; offline, `429` and `5xx` keep the buffer (on disk, up to 6 h) and retry.

Battery: full accuracy near the site; more than 2 km away, or while the watch is the one sending, a coarse position (100 m) is enough.

## Build

Xcode 26 or later to upload (15.4 builds locally), iOS 17, watchOS 10.

```bash
open SITE14.xcodeproj
```

1. Select the **SITE14** project → Build Settings, and set:
   - `DEVELOPMENT_TEAM`: your Apple team.
   - `SITE14_API_URL`: the API (same value as the web app's `VITE_API_URL`). For a local server on a real phone use a tunnel over https.
   - `SITE14_IOS_BUNDLE_ID`: change it if `sa.site14.tracker` is taken in your team. The watch app is `<that>.watchkitapp`.
2. Run the **SITE14** scheme on an iPhone. The watch app installs with it (Watch app on the iPhone → SITE14 → Install).

The project file is generated. After adding or removing a Swift file, or to change the defaults above for everyone:

```bash
python3 scripts/generate_project.py
```

Edit the settings at the top of that script rather than the project file, or they are lost on the next run.

### Upload to TestFlight

One-time setup:

1. **Xcode 26 or later.** Since 28 April 2026 App Store Connect refuses builds from older Xcode. Install it from the Mac App Store, open it once, and add the watchOS platform (Settings → Components, or `xcodebuild -downloadPlatform watchOS`).
2. **Apple Developer Program** membership for your team (the free account cannot use TestFlight). Note the Team ID (developer.apple.com → Account → Membership details).
3. **Bundle IDs**: developer.apple.com → Identifiers → +, App IDs: `sa.site14.tracker` and `sa.site14.tracker.watchkitapp` (or your own, then set `BUNDLE_ID`). The script can also register them, but step 4 needs them first.
4. **App record**: App Store Connect → Apps → + New App, platform iOS, name SITE14, bundle ID `sa.site14.tracker`, SKU of your choice.
5. **API key**: App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys → +, role **App Manager**. Download the `.p8` (only once) and note the Key ID and Issuer ID.
6. `cp scripts/testflight.env.example scripts/testflight.env` and fill it in. That file and `.p8` keys are git-ignored.

Each upload:

```bash
scripts/testflight.sh
```

It archives with a new build number (the UTC time), signs automatically with the API key, and uploads. When the build has processed, in App Store Connect → TestFlight:

- **Internal testers** (people in your team, up to 100): add them to a group. No review.
- **External testers** (anyone by email or public link): needs Beta App Review the first time. Fill in Test Information, and explain that the app shares location in the background to record time on a work site, with a demo pairing code and how to get one.
- Answer the export-compliance question once if asked; the app declares it uses no non-exempt encryption (`ITSAppUsesNonExemptEncryption = NO`, HTTPS only).

Testers install **TestFlight** from the App Store, accept the invite, and install SITE14. The watch app installs from the Watch app on the iPhone.

### Opening the app straight from the QR code (universal links)

Without this, scanning with the Camera opens the `/pair` page, which has an **Open in SITE14** button (`site14://pair/XXXX`). With it, the Camera opens the app directly.

1. Web app: set `VITE_IOS_APP_ID=<TEAM ID>.sa.site14.tracker` and rebuild. The build then contains `/.well-known/apple-app-site-association`. Serve it over https as `application/json`.
2. Web app: set `VITE_IOS_APP_URL` to the App Store or TestFlight link, for the "Install the app" step.
3. iOS: set `SITE14_APP_DOMAIN` to the web app's host (for example `app.site14.sa`), and `CODE_SIGN_ENTITLEMENTS = iOS/SITE14.entitlements` on the SITE14 target (in `generate_project.py`, then run it).

## Files

| Folder | What |
|---|---|
| `Shared/` | Both apps: API client, models, Keychain, offline buffer, `LocationStreamer` (the GPS and send loop), site geometry, `WatchLink` (iPhone ⇄ watch). |
| `iOS/` | iPhone app: pairing (code, QR scanner, deep links), tracker screen, site map. |
| `Watch/` | Watch app: status and direction to the site, map. |
| `scripts/` | Project generator, icon generator, `testflight.sh`. |

## Limits to know

- If the watch shares while it is out of reach of the iPhone (no Bluetooth or shared Wi-Fi) for more than 150 s, and the iPhone is still sharing somewhere else, both send. The server keeps whichever is newer, so the position can jump between them. Stop sharing on the iPhone when leaving it behind.
- iOS lets the wearer choose **While Using** instead of **Always**. Sharing then continues in the background but stops if iOS ends the app; the app shows a warning with a shortcut to Settings.
- Heart rate is not sent yet (the API accepts `heart_rate_bpm`; it needs HealthKit on the watch).
- There is no Android app. Android phones keep using the browser tracker at `/tracker`.
