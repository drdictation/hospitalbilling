# Private Hospital Billing Capture (Local-First PWA)

A personal, single-user Progressive Web Application (PWA) designed for an Australian gastroenterologist to capture private-hospital inpatient billing encounters on an iPhone. 

Replaces a manual workflow (iOS Shortcut $\rightarrow$ photograph sticker $\rightarrow$ Apple Notes $\rightarrow$ manual monthly Word compilation) with an atomic local-first capture, deterministic patient matching, and programmatic monthly billing compilation.

---

## 🎯 Overriding Priorities (In Order)

1. **Never silently lose a billing encounter**
2. **Never incorrectly merge two different patients**
3. **Never silently omit an encounter from the monthly billing output**
4. **Capture must take only 5–10 seconds on ward rounds on an iPhone**
5. **Patient information must be handled securely (Zero-PHI on host/Vercel)**
6. **Monthly billing compilation must be deterministic and automated**

---

## ⚡ Tech Stack

* **Frontend:** React 19 + TypeScript + Vite 8
* **Styling:** Tailwind CSS v4 (configured for iOS standalone PWA, notch/safe-areas, and dark mode)
* **Local Persistence:** `Dexie.js` (IndexedDB wrapper with atomic transaction guarantees)
* **PWA & Offline:** `vite-plugin-pwa` with Workbox offline precaching
* **Icons:** `lucide-react`
* **Remote Durable Store:** Google Drive API v3 (Direct-to-Drive zero-PHI uploads over TLS 1.3)
* **Authentication:** Google Identity Services (GIS) OAuth 2.0 Web Client (scope: `drive.file`)
* **Upcoming (Phase 3 & 4):** `@zxing/library` (Barcode/MRN extraction), `tesseract.js` (WASM OCR), `docx`, `jspdf`.

---

## 🔒 Security & Privacy Model (Zero-PHI Intermediary)

* **Vercel Role:** Vercel serves only static application bundles. **No patient data, names, MRNs, or photographs ever traverse or reside on Vercel servers.**
* **Direct-to-Drive:** The PWA streams uploads directly from the iPhone browser to `https://www.googleapis.com/upload/drive/v3/files` over TLS 1.3.
* **Least-Privilege OAuth:** Uses `https://www.googleapis.com/auth/drive.file`. The app can only see and touch files it creates. It has zero access to personal Drive files or Gmail.
* **No Telemetry:** Zero Google Analytics, Sentry, or third-party tracking scripts.
* **Local Encryption:** Encrypted at rest behind the iPhone passcode / Face ID via iOS Secure Enclave.

---

## 📱 Implemented Features (Phase 1 & 2)

* **Sub-50ms Atomic Save:** Encounter metadata, compressed sticker photo, and audit logs are persisted in a single IndexedDB transaction.
* **Native Camera Capture:** Directly invokes the iOS camera viewfinder with macro-focus, flash, and exposure controls.
* **Client-Side Compression:** Downscales 8–12 MB iPhone camera photos to max 1600×1200 px @ 82% JPEG (~200–350 KB). Barcodes and tiny 6pt fonts remain razor-sharp.
* **Sticky Hospital Locations:**
  1. St Vincent's Private (Default)
  2. St Vincent's Public (Private in Public)
  3. Epworth Freemasons
  4. Hobson's Bay Sydenham
* **Current Gastroenterology MBS Schedule:**
  * Consultations: `110` (Initial), `116` (Subsequent Inpatient, default), `132`, `133`.
  * Colonoscopy: `32222` (Diagnostic / Surveillance), `32229` (Colonoscopy + Polypectomy).
  * Gastroscopy: `30473` (Diagnostic), `30478` (Gastroscopy + Biopsy).
  * Flexible Sigmoidoscopy: `32084` (Diagnostic), `32087` (Flex Sig + Biopsy/Polyp).
* **Two-Way Store Reconciliation:** Compares local IndexedDB UUIDs against Google Drive filenames and provides an internal audit log.
* **Ward Offline Simulation Mode:** Allows testing dead-zone behavior with an unmissable top warning banner (`⚠️ X ENCOUNTERS NOT SYNCED`).

---

## 🚀 Getting Started

### Local Development
```bash
npm install
npm run dev
```
Open `http://localhost:5173`.

### Production Build
```bash
npm run build
```

### Google Drive Setup (OAuth 2.0 Client ID)
1. In [Google Cloud Console](https://console.cloud.google.com/), enable the **Google Drive API**.
2. Under **Credentials**, create an **OAuth 2.0 Client ID** (Type: **Web application**).
3. Add Authorized JavaScript origins:
   * `http://localhost:5173` (local dev)
   * `https://your-app.vercel.app` (production)
4. Add the Client ID to your `.env` (or Vercel Environment Variables):
   ```env
   VITE_GOOGLE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
   ```
   *(Alternatively, paste it directly in the PWA Settings screen).*
5. In the PWA Settings, tap **Authorize Google Drive**.

---

## 📖 AI Agent Handoff & Roadmap
For incoming AI agents continuing development on Phase 3, 4, or 5, please read **[HANDOFF.md](./HANDOFF.md)**.
