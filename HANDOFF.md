# AI AGENT HANDOFF: Private Hospital Billing Capture PWA

> [!IMPORTANT]
> **READ THIS BEFORE WRITING CODE**
> This file is the primary handoff document for any AI agent or engineer taking over this repository. It summarizes the architecture, completed phases, hard user rules, codebase structure, and step-by-step instructions for implementing the remaining phases.

---

## 1. User Persona & Non-Negotiable Rules

* **The User:** A busy gastroenterologist in Australia capturing inpatient billing encounters while walking around hospital wards.
* **The Application:** A single-user, personal, local-first PWA on an iPhone.
* **Priorities in Strict Order:**
  1. Never silently lose a billing encounter.
  2. Never incorrectly merge two different patients.
  3. Never silently omit an encounter from monthly billing.
  4. Capture must take only 5–10 seconds on an iPhone.
  5. Patient health information (PHI) must be handled securely (Zero PHI on host/Vercel).
  6. Monthly billing compilation must be deterministic and automated.
* **Strict Model / Agent Rules:**
  * NEVER EVER SUGGEST GEMINI MODELS BEFORE 2.5, LLAMA MODELS BEFORE 4, OR OPEN AI MODELS BEFORE 4o.
  * NEVER DO BROWSER USE TESTING UNLESS EXPLICITLY REQUESTED BY THE USER.
  * NEVER SEND PATIENT HEALTH INFORMATION TO AN LLM. (Use deterministic regex/barcodes).
  * Respect disk space and avoid cluttering temporary directories.

---

## 2. Technical Realities & Constraints (Do Not Violate)

1. **iOS WebKit Background Sync Impossibility:**
   * iOS Safari/WebKit **does not support `SyncManager` or background sync**. When the phone locks or is pocketed, JS halts within 5–30 seconds.
   * *Requirement:* Never rely on background workers when the phone is locked. Sync is eager (starts immediately on Save) and opportunistic (resumes on `visibilitychange` when unlocking, `pageshow`, and `online`).
2. **Zero-PHI Intermediary:**
   * Vercel serves static code and OAuth token helpers only.
   * Encounters and images upload **directly from the iPhone to Google Drive via HTTPS over TLS 1.3**. Vercel NEVER sees or logs patient health information.
3. **Primary Source Record vs Metadata:**
   * The original photograph is the durable source of truth.
   * OCR data is secondary metadata. **Failure of OCR must NEVER block saving an encounter.**

---

## 3. Codebase Map

```text
/Users/cbasnayake/Documents/Microsaas/Hospital Billing/
├── index.html                   # PWA entry, iOS meta tags (notch, standalone), GIS script
├── package.json                 # Dependencies (Dexie, lucide-react, tailwind v4, vite-plugin-pwa)
├── vite.config.ts               # Vite 8 + Tailwind v4 + VitePWA config
├── .env.example                 # VITE_GOOGLE_CLIENT_ID template
├── src/
│   ├── types/index.ts           # Types: Encounter, ImageBlob, Patient, AuditLog, AppSettings
│   ├── db/index.ts              # Dexie.js schema, persistEncounterLocally (atomic tx), settings
│   ├── utils/
│   │   └── imageCompressor.ts   # Canvas downscaler (max 1600x1200 @ 82% JPEG, ~200-350KB)
│   ├── services/
│   │   ├── googleDrive.ts       # Zero-PHI Drive REST API client, folder hierarchy, reconciliation
│   │   └── syncEngine.ts        # Eager upload queue, lifecycle listeners (visibilitychange, online)
│   ├── components/
│   │   ├── Header.tsx           # Sticky hospital selector, network pill, unsynced alert banner
│   │   ├── CaptureSection.tsx   # Native camera trigger, fast MBS buttons, atomic Save
│   │   ├── EncounterCard.tsx    # Sticker thumbnail, sync status pill, inline quick-editor
│   │   ├── EncounterList.tsx    # Tabs: Today, This Month, Needs Attention
│   │   ├── ReconciliationModal.tsx # Two-way store audit report and internal audit log
│   │   ├── SettingsModal.tsx    # GIS Google Sign-in popup, Client ID, hospital manager, offline toggle
│   │   └── ImageModal.tsx       # Fullscreen high-resolution sticker lightbox
│   ├── App.tsx                  # Main state orchestrator, live queries, lifecycle mounting
│   ├── main.tsx                 # React DOM mount
│   └── index.css                # Tailwind v4 setup + iOS safe-area utilities
```

---

## 4. Current State: Phase 1 & 2 Completed

* **Phase 1 (Architecture & Feasibility):** Complete and approved.
* **Phase 2 (Local-First Core Engine Proof of Concept):** Complete and verified.
  * Atomic local persistence via `Dexie.js` (<50ms).
  * Native iPhone camera trigger + client-side Canvas compressor (~250 KB JPEG).
  * Configured Locations:
    1. `St Vincent's Private` (Default)
    2. `St Vincent's Public (Private in Public)`
    3. `Epworth Freemasons`
    4. `Hobson's Bay Sydenham`
  * Configured MBS Codes (Current MBS Schedule):
    * `110`, `116` (Default), `132`, `133` (Consults)
    * `32222` (Colonoscopy Diag/Surv), `32229` (Colonoscopy + Polypectomy)
    * `30473` (Gastroscopy Diag), `30478` (Gastroscopy + Biopsy)
    * `32084` (Flex Sig Diag), `32087` (Flex Sig + Biopsy/Polyp)
  * Direct-to-Drive zero-PHI upload client + Google Identity Services 1-tap popup.
  * Two-way reconciliation engine + offline ward simulation mode.
  * Verified: `npm run build` passes with zero errors.

---

## 5. Next Steps: Phase 3 Implementation Guide

### Phase 3: Patient Identity & Deterministic OCR
**Goal:** Extract patient identifiers (MRN, Name, DOB) deterministically from sticker images to group encounters under Patients without guessing.

#### Step 3.1: Barcode / QR Detection (<50ms, 100% Deterministic)
* Most Australian hospital stickers (St Vincent's, Epworth, Ramsay, Healthscope) encode the UR / MRN in a Code 128 or Code 39 barcode.
* Implement a barcode scanning utility (`src/utils/barcodeScanner.ts`) using the native `BarcodeDetector` API (supported in Safari 17+) with a fallback to `@zxing/library` or `@zxing/browser`.
* If a barcode is decoded, extract the MRN directly. This is **100% deterministic with 0% OCR spelling error**.

#### Step 3.2: Asynchronous In-Browser OCR (Web Worker)
* Set up `tesseract.js` inside a dedicated Web Worker (`src/workers/ocrWorker.ts`) so OCR runs in the background and **never freezes the UI or blocks saving**.
* The save flow remains:
  `Photo Taken -> Persist Photo & Encounter Locally (<50ms) -> Spawn Async Worker -> Barcode Scan -> Tesseract OCR -> Match Patient`.

#### Step 3.3: Deterministic Regex Heuristics
* Write regex parsers for Australian medical formats:
  * **DOB:** `\b(0?[1-9]|[12][0-9]|3[01])[\/\-\.](0?[1-9]|1[012])[\/\-\.](19\d\d|20\d\d)\b`
  * **UR / MRN:** Look for `UR[:\s]*([A-Z0-9]{6,10})` or `MRN[:\s]*([0-9]{6,8})`.
  * **Name:** Typical sticker format: `SURNAME, GivenNames`.
* If the user provides sample stickers, calibrate regex and barcode coordinates to match the 4 specific hospitals.

#### Step 3.4: Patient Matching Hierarchy
Implement in `src/services/patientMatcher.ts`:
1. **Strong Match (Automatic):** Same Hospital + identical MRN/UR $\rightarrow$ Automatically link encounter to existing patient record in `db.patients`.
2. **Probable Match (Confirmation Required):** MRN unreadable, but Name + DOB match an existing patient exactly $\rightarrow$ Link, but set `patientMatchStatus: 'PROBABLE'` and display a discrete badge: *"Matched by Name & DOB — Tap to confirm"*.
3. **Uncertain / Conflict (Exception Queue):** Conflicting DOB, unreadable sticker, or low confidence.
   * **STRICT RULE:** DO NOT GUESS. Never merge automatically.
   * Mark `patientMatchStatus: 'MANUAL_REVIEW'`.
   * Display under the `Needs Attention` tab for doctor review.

---

## 6. Upcoming: Phase 4 & 5 Roadmap

### Phase 4: Monthly Billing & Deterministic Document Compilation
1. **Pre-Export Integrity Check:** Verify 100% of encounters are synced to Drive, 0 unidentified patients, 0 unbilled duplicates.
2. **Duplicate Billing Protection:** Mark exported encounters with `billingStatus: 'EXPORTED'` and an immutable `exportId`.
3. **Programmatic DOCX & PDF Export:**
   * Use client-side `docx` and `jspdf`.
   * Group encounters by patient: 1 page/section per patient with patient sticker image at the top and a table of dates + MBS codes below.
   * Save compiled documents into Google Drive under `Private Hospital Billing / YYYY / MM Month / exports/`.

### Phase 5: Hardening & Field Readiness
1. Simulated offline and network drop recovery tests.
2. Rehydration test (downloading remote encounters from Drive to restore IndexedDB on a new phone).
3. Field test on physical iPhone via iOS Safari "Add to Home Screen".
