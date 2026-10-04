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

### 4. Current State: Phases 1, 2, & 3 Completed

* **Phase 1 (Architecture & Feasibility):** Complete and approved.
* **Phase 2 (Local-First Core Engine Proof of Concept):** Complete and verified.
  * Atomic local persistence via `Dexie.js` (<50ms).
  * Native iPhone camera trigger + client-side Canvas compressor (~250 KB JPEG).
  * Configured Locations:
    1. `St Vincent's Private` (Default)
    2. `St Vincent's Public (Private in Public)`
    3. `Epworth Freemasons`
    4. `Hobson's Bay Sydenham`
  * Configured MBS Codes (Consults: 110, 116, 132, 133; Endoscopy: 32222, 32229, 30473, 30478, 32084, 32087).
  * Direct-to-Drive zero-PHI upload client + Google Identity Services 1-tap popup.
  * Two-way reconciliation engine + offline ward simulation mode.
* **Phase 3 (Patient Identity & Deterministic OCR):** Complete and verified against real clinical stickers.
  * Native hardware `BarcodeDetector` (Safari 17+ on iPhone) + lazy-loaded `@zxing/library` fallback.
  * Asynchronous background Tesseract WASM OCR in Web Worker (non-blocking save).
  * Calibrated regex parser for Victorian hospital formats:
    * **St Vincent's Private:** `UR: 581670`, `MARINIER`, `MR GLEN ANTHONY`, `DOB: 12/02/1963`, Medicare.
    * **Epworth Freemasons:** `EPW UR: 2320677`, `Burne, Ms Tanya`, `DOB:02/11/1974`, Medicare.
    * **Hobson's Bay Sydenham:** `CREMONA, MS DIJANA`, `UR: 174079`, `30/05/83`, Medicare.
    * **St Vincent's Public:** Barcode/UR `1522498`, `O’BRYAN`, `SUZANNE GAEL`, `DoB:27/07/1950`.
    * **Patient Registration Forms & EMR screens:** Parsed and normalized.
  * Deterministic 3-tier patient matching (`src/services/patientMatcher.ts`):
    * Compound Dexie index: `[primaryHospital+mrn]`.
    * Automatic patient linking and zero-guess exception queue (`MANUAL_REVIEW`).
  * Verified: 100% of real-world hospital tests pass, `npm run build` succeeds cleanly in <500ms with optimized code splitting.

---

## 5. Next Steps: Phase 4 Implementation Guide

### Phase 4: Monthly Billing & Deterministic Document Compilation
**Goal:** Compile monthly billing encounters grouped by patient into professional documents (DOCX & PDF) and export to Google Drive.

#### Step 4.1: Pre-Export Integrity Check
* Ensure 100% of encounters for the billing period are backed up to Google Drive.
* Ensure 0 encounters remain in `MANUAL_REVIEW` / unidentified status.
* Flag any potential double-billing (same patient, same MBS code on the exact same date).

* **Phase 4 (Monthly Billing & Programmatic DOCX Compilation):** Complete and verified.
  * Deterministic billing aggregation engine (`src/services/billingExporter.ts`).
  * Grouping by patient with chronological ordering of inpatient service dates.
  * Embedded high-resolution patient sticker images directly in each patient section.
  * Formatted tables with Service Date, Hospital, MBS Codes, and Clinical Notes.
  * Direct browser file download (`.docx`) for mobile/desktop.
  * Direct Google Drive export archiving under `Private Hospital Billing / YYYY / MM Month / exports / Billing_Export_YYYY_MM.docx`.
  * Pre-export integrity check: flags unverified encounters and detects duplicate billing attempts (same patient + same MBS item on the same date).
  * UI Export Modal (`src/components/ExportModal.tsx`) accessible via the Header Export button.
  * Production bundle: `docx` library is dynamically code-split into a separate lazy chunk (403 KB) with sub-400ms builds.

---

## 5. Current State: Phases 1, 2, 3, & 4 Complete

All core functional workflows are now operational:
1. **Ward Capture:** Direct camera $\rightarrow$ canvas downscaler $\rightarrow$ sub-50ms atomic save to IndexedDB.
2. **Deterministic Extraction:** Hardware `BarcodeDetector` + background WASM OCR $\rightarrow$ calibrated Victorian hospital regex $\rightarrow$ automatic patient linking.
3. **Zero-PHI Durability:** Direct-to-Drive REST sync over TLS 1.3 with opportunistic sync on phone unlock.
4. **Monthly Billing Compilation:** One-click DOCX generation grouped by patient with sticker photo and itemized MBS codes, archived directly to Drive and downloaded to device.

---

## 6. Next Steps: Phase 5 Roadmap (Field Readiness & Hardening)
1. **Simulated Offline & Recovery Verification:** Test capturing multiple encounters while disconnected and verifying that reconnecting cleanly flushes the sync queue and reconciles with Drive.
2. **Rehydration (Restore from Drive):** Tool to re-download remote encounter JSON files and rebuild the local IndexedDB if opening the PWA on a new iPhone.
3. **Field Verification:** Physical iPhone test via Safari "Add to Home Screen" verifying notch padding, camera launch speed, and export download.


