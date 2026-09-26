# ONIONIQ

**AI-Powered Onion Quality Assessment & Digital Grading**
`AI VISION • DEMO MODE`

A frontend-only, installable Progressive Web App built for Problem Statement 26031 (Ministry of Consumer Affairs, Food & Public Distribution — Department of Consumer Affairs): *quality assessment and grading of onions are often subjective and vary across procurement centers, resulting in disputes and inconsistencies.*

ONIONIQ demonstrates an end-to-end AI vision workflow — capture, validate, analyze, grade, and report — running **entirely in the browser**, with no backend, no server, no database, and no external API.

---

## 1. Project structure

```text
onioniq/
│
├── index.html            Single-page app shell (hash-routed views)
├── style.css              Full design system + responsive layout
├── app.js                 Application logic (state, router, storage,
│                           vision engine, grading, reporting, UI)
├── manifest.json           PWA manifest
├── service-worker.js       Offline caching (app shell + demo asset)
│
├── assets/
│   ├── icons/
│   │   ├── icon-192.png
│   │   └── icon-512.png
│   └── demo/
│       └── onion-batch.jpg   Bundled sample used by "Try Demo Sample"
│
└── README.md
```

Everything runs from static files — HTML, CSS, and vanilla JavaScript only. No build step, no framework, no `node_modules`.

---

## 2. How the "AI" works (important — read this)

There is **no real trained neural network** running in this app. ONIONIQ implements a **client-side AI vision simulation** (`OnionVisionEngine` in `app.js`) that:

1. Uses the Canvas API to genuinely read pixel data from your uploaded image (brightness, contrast/edge-energy as a sharpness proxy, dimensions).
2. Derives a **deterministic seed** from those real measurements plus file metadata, so the **same image always produces the same result**, while different images produce different results.
3. Uses a seeded pseudo-random generator to simulate onion detection, classification (Healthy / Damaged / Rotten / Sprouted / Undersized), confidence scores, and size estimates — with category odds nudged by the real brightness/sharpness measurements (e.g. darker or blurrier images bias slightly toward more defects/undersized detections, just as a real vision pipeline might struggle with poor image quality).
4. Calculates Grade A / URS / Reject percentages and an overall Quality Score **dynamically from the generated detections** — nothing is hardcoded.

This is clearly labeled throughout the app as **"AI Vision • Demo Mode"**, and every report carries a disclaimer that grades are demonstration outputs, not an official certified grading instrument.

---

## 3. Running it locally

Because this is a real PWA (service worker + manifest), it must be served over **HTTP**, not opened directly as a `file://` URL — browsers block service worker registration and some fetch calls on `file://`.

Pick any one of these:

**Option A — VS Code Live Server**
1. Open the `onioniq` folder in VS Code.
2. Install the "Live Server" extension if you don't have it.
3. Right-click `index.html` → **Open with Live Server**.

**Option B — Python (built into most systems)**
```bash
cd onioniq
python3 -m http.server 8080
```
Then open `http://localhost:8080` in your browser.

**Option C — Node**
```bash
cd onioniq
npx serve .
```

> If you open `index.html` directly via `file://`, the app's core screens still work, but the service worker won't register, so offline support and the demo sample fetch may not function. Always serve it locally for the full experience.

---

## 4. Installing it as a PWA

1. Serve the app locally (see above) and open it in Chrome, Edge, or another PWA-capable browser.
2. **Desktop (Chrome/Edge):** click the install icon (⊕) in the address bar, or open the browser menu → **Install ONIONIQ…**
3. **Android (Chrome):** open the ⋮ menu → **Add to Home screen** / **Install app**.
4. **iOS (Safari):** tap the Share icon → **Add to Home Screen**.
5. Once installed, ONIONIQ launches in its own standalone window/icon, and works fully **offline** after the first load (try turning off Wi-Fi and reopening it).

---

## 5. Two-minute judge demonstration flow

1. **Dashboard** — point out the KPI cards (populated from local inspection history) and the "AI Vision • Demo Mode" badge.
2. Tap **+ New Inspection**.
3. Tap **Try Demo Sample** — no need to find a file; the bundled batch image loads instantly.
4. Tap **Continue to Validation** — show the automatic image quality checklist (resolution, lighting, sharpness, framing), all computed from real pixel analysis.
5. Tap **Start AI Analysis** — watch the animated scanning pipeline (Scanning → Detecting → Analyzing defects → Estimating size → Calculating quality) and the live progress bar.
6. Once complete, show the **detection overlay** on the image — colored bounding boxes per category — and tap one box to open **Onion #N** details (classification, confidence, size, AI reasoning).
7. Tap **Continue to Grading** — show the animated Quality Score ring, the Grade A / URS / Reject donut chart, the quality breakdown bars, size histogram, and defect cards, plus the **Quality Grading Engine** flow diagram and disclaimer.
8. Tap **Generate Digital Report** — the success screen and full digital report appear, with visual evidence (original + overlay images) and the defect classification table.
9. Tap **Download Report** (opens the print-formatted report — "Save as PDF" from the print dialog) and/or **Download JSON** to show data portability.
10. Navigate to **History** — show the newly saved batch, search/filter it, then open it again from a **completely fresh page load** to prove persistence via `localStorage`.
11. Turn off your device's internet connection and reload the app — it keeps working, demonstrating full offline PWA support.

---

## 6. Notes on icons

`assets/icons/icon-192.png` and `assets/icons/icon-512.png` are generated placeholder app icons (a stylized onion mark on an agricultural-green gradient) so the manifest is valid out of the box. Swap them for your own artwork at the same file names/sizes if you want a custom brand mark — no code changes are required.

---

## 7. Data & privacy

All inspection records, settings, and history are stored only in this browser's `localStorage`. Nothing is uploaded, transmitted, or shared with any server. Clearing your browser data (or using **Settings → Clear inspection history**) permanently removes it.
