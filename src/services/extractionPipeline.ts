import { db, logAudit } from '../db';
import { scanBarcode } from '../utils/barcodeScanner';
import { parseStickerText } from '../utils/stickerParser';
import { matchAndLinkPatient } from './patientMatcher';

let workerInstance: any = null;
let isWorkerInitializing = false;

/**
 * Lazily initialize singleton Tesseract worker so it does not delay app startup.
 */
async function getOcrWorker() {
  if (workerInstance) return workerInstance;
  if (isWorkerInitializing) {
    // Wait until initialized
    while (isWorkerInitializing) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return workerInstance;
  }

  isWorkerInitializing = true;
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    workerInstance = worker;
    return worker;
  } finally {
    isWorkerInitializing = false;
  }
}

/**
 * Asynchronously process patient identity from sticker photograph:
 * 1. Barcode scan (<15-50ms)
 * 2. Tesseract WASM OCR in Web Worker
 * 3. Calibrated Regex parsing
 * 4. Deterministic Patient matching / creation in Dexie
 * 
 * FAILURE OF OCR MUST NEVER CRASH OR BLOCK THE SAVED ENCOUNTER.
 */
export async function processEncounterIdentity(encounterId: string): Promise<void> {
  const encounter = await db.encounters.get(encounterId);
  if (!encounter) return;

  const imageBlob = await db.imageBlobs.get(encounter.imageBlobId);
  if (!imageBlob) return;

  // Mark status as processing so UI can show discrete indicator if viewed
  await db.encounters.update(encounterId, {
    extractedData: {
      ...encounter.extractedData,
      isProcessing: true,
    },
  });

  try {
    // Step 1: Scan for Barcodes (Native BarcodeDetector / ZXing fallback)
    const barcodeResult = await scanBarcode(imageBlob.blob);

    // Step 2: OCR Text Recognition
    let rawText = '';
    try {
      const worker = await getOcrWorker();
      const ocrResult = await worker.recognize(imageBlob.blob);
      rawText = ocrResult?.data?.text || '';
    } catch (ocrErr: any) {
      console.warn(`OCR execution warning for encounter ${encounterId}:`, ocrErr);
    }

    // Step 3: Calibrated Regex Extraction
    const parsed = parseStickerText(
      rawText,
      encounter.hospital,
      barcodeResult?.rawValue
    );

    // Step 4: Deterministic 3-Tier Patient Matching
    await matchAndLinkPatient(encounterId, parsed);
  } catch (err: any) {
    console.error(`Patient extraction pipeline error for encounter ${encounterId}:`, err);
    
    // Fallback safely to MANUAL_REVIEW without deleting or corrupting encounter
    await db.encounters.update(encounterId, {
      patientMatchStatus: 'MANUAL_REVIEW',
      extractedData: {
        isProcessing: false,
        rawText: 'Processing failed',
      },
      updatedAt: new Date().toISOString(),
    });

    await logAudit('PATIENT_MANUAL_REVIEW', encounterId, {
      error: err?.message || 'Pipeline failure',
    });
  }
}
