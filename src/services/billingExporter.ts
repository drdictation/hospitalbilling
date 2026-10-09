import { db, logAudit } from '../db';
import type { Encounter, ImageBlob, Patient } from '../types';
import { uploadExportDocumentToDrive } from './googleDrive';

export interface BillingExportSummary {
  totalPatients: number;
  totalEncounters: number;
  unverifiedCount: number;
  duplicateWarnings: string[];
}

export interface PatientBillingGroup {
  patient: Partial<Patient>;
  encounters: Encounter[];
  primaryStickerBlob?: Blob;
  primaryImageWidth?: number;
  primaryImageHeight?: number;
}

/**
 * Format any date string into 'DD - MMMM - YYYY' (e.g., '04 - October - 2026').
 * Guarantees standard Day - Month - Year order across all encounters, DOB, and tables.
 */
export function formatDocxDate(dateStr?: string): string {
  if (!dateStr || dateStr.trim() === '') return 'N/A';

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Match YYYY-MM-DD
  const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = parseInt(isoMatch[2], 10) - 1;
    const d = String(parseInt(isoMatch[3], 10)).padStart(2, '0');
    if (m >= 0 && m < 12) {
      return `${d} - ${months[m]} - ${y}`;
    }
  }

  // Match DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = dateStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
  if (dmyMatch) {
    const d = String(parseInt(dmyMatch[1], 10)).padStart(2, '0');
    const m = parseInt(dmyMatch[2], 10) - 1;
    let y = dmyMatch[3];
    if (y.length === 2) {
      const numY = parseInt(y, 10);
      y = numY > 30 ? `19${y}` : `20${y}`;
    }
    if (m >= 0 && m < 12) {
      return `${d} - ${months[m]} - ${y}`;
    }
  }

  // Fallback to JS Date if parseable
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    const d = String(parsed.getDate()).padStart(2, '0');
    const m = months[parsed.getMonth()];
    const y = parsed.getFullYear();
    return `${d} - ${m} - ${y}`;
  }

  return dateStr;
}

/**
 * Measure image dimensions to guarantee 100% preservation of aspect ratio.
 */
async function getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      const width = bitmap.width;
      const height = bitmap.height;
      bitmap.close();
      if (width > 0 && height > 0) {
        return { width, height };
      }
    } catch {
      // Fallback to Image element
    }
  }

  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return resolve({ width: 1200, height: 900 });
    }
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || 1200;
      const height = img.naturalHeight || 900;
      URL.revokeObjectURL(url);
      resolve({ width, height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 1200, height: 900 });
    };
    img.src = url;
  });
}

/**
 * Audit and validate encounters ready for monthly billing export.
 */
export function validateBillingEncounters(
  encounters: Encounter[],
  patients: Record<string, Patient>
): BillingExportSummary {
  const patientMap = new Map<string, Encounter[]>();
  const duplicateWarnings: string[] = [];
  let unverifiedCount = 0;

  for (const enc of encounters) {
    if (enc.patientMatchStatus === 'MANUAL_REVIEW') {
      unverifiedCount++;
    }

    const key = enc.patientId || enc.extractedData?.mrn || enc.id;
    if (!patientMap.has(key)) {
      patientMap.set(key, []);
    }
    patientMap.get(key)!.push(enc);
  }

  // Check for duplicate billing (same patient, same MBS code on same service date)
  for (const [key, encList] of patientMap.entries()) {
    const seenCombos = new Set<string>();
    const patName = patients[key]?.name || encList[0].extractedData?.patientName || 'Unknown Patient';

    for (const enc of encList) {
      for (const code of enc.mbsCodes) {
        const comboKey = `${enc.serviceDate}_${code}`;
        if (seenCombos.has(comboKey)) {
          duplicateWarnings.push(
            `Duplicate: ${patName} has multiple claims for MBS ${code} on ${enc.serviceDate}`
          );
        }
        seenCombos.add(comboKey);
      }
    }
  }

  return {
    totalPatients: patientMap.size,
    totalEncounters: encounters.length,
    unverifiedCount,
    duplicateWarnings,
  };
}

/**
 * Convert a Blob into an ArrayBuffer for embedding into DOCX
 */
async function blobToArrayBuffer(blob: Blob): Promise<Uint8Array> {
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Group encounters by patient and sort chronologically.
 */
export function groupEncountersByPatient(
  encounters: Encounter[],
  patients: Record<string, Patient>,
  imageBlobs: Record<string, ImageBlob>
): PatientBillingGroup[] {
  const groupMap = new Map<string, PatientBillingGroup>();

  for (const enc of encounters) {
    const pId = enc.patientId || enc.extractedData?.mrn || enc.id;
    const imgRecord = imageBlobs[enc.imageBlobId];

    if (!groupMap.has(pId)) {
      const pat = enc.patientId && patients[enc.patientId]
        ? patients[enc.patientId]
        : {
            name: enc.extractedData?.patientName || 'UNIDENTIFIED PATIENT',
            mrn: enc.extractedData?.mrn || 'N/A',
            dob: enc.extractedData?.dob || '',
            medicareNo: enc.extractedData?.medicareNo,
            primaryHospital: enc.hospital,
          };

      groupMap.set(pId, {
        patient: pat,
        encounters: [],
        primaryStickerBlob: imgRecord?.blob,
        primaryImageWidth: imgRecord?.width,
        primaryImageHeight: imgRecord?.height,
      });
    }

    const grp = groupMap.get(pId)!;
    grp.encounters.push(enc);

    // If initial encounter lacked image, populate from subsequent encounter
    if (!grp.primaryStickerBlob && imgRecord?.blob) {
      grp.primaryStickerBlob = imgRecord.blob;
      grp.primaryImageWidth = imgRecord.width;
      grp.primaryImageHeight = imgRecord.height;
    }
  }

  // Sort each group's encounters chronologically
  const groups = Array.from(groupMap.values());
  for (const g of groups) {
    g.encounters.sort((a, b) => a.serviceDate.localeCompare(b.serviceDate));
  }

  // Sort groups by patient surname
  groups.sort((a, b) => (a.patient.name || '').localeCompare(b.patient.name || ''));

  return groups;
}

/**
 * Generate a deterministic, formatted Word Document (.docx) for monthly inpatient billing.
 */
export async function generateBillingDocx(
  encounters: Encounter[],
  patients: Record<string, Patient>,
  imageBlobs: Record<string, ImageBlob>,
  monthLabel: string = 'Current Month'
): Promise<Blob> {
  const {
    Document,
    Packer,
    Paragraph,
    Table,
    TableRow,
    TableCell,
    TextRun,
    ImageRun,
    HeadingLevel,
    AlignmentType,
    WidthType,
    BorderStyle,
  } = await import('docx');

  const groups = groupEncountersByPatient(encounters, patients, imageBlobs);
  const docSections: any[] = [];

  // Header Title
  const headerParagraphs = [
    new Paragraph({
      text: 'Gastroenterology Inpatient Billing Compilation',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Clinician: ', bold: true }),
        new TextRun('A-Prof C. Basnayake'),
        new TextRun({ text: '    •    Billing Period: ', bold: true }),
        new TextRun(monthLabel),
        new TextRun({ text: `    •    Patients: `, bold: true }),
        new TextRun(`${groups.length}`),
        new TextRun({ text: `    •    Total Encounters: `, bold: true }),
        new TextRun(`${encounters.length}`),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    }),
  ];

  docSections.push(...headerParagraphs);

  // Per Patient Section
  for (let idx = 0; idx < groups.length; idx++) {
    const group = groups[idx];
    const pat = group.patient;

    // Patient Banner
    docSections.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${idx + 1}. ${pat.name || 'UNKNOWN PATIENT'}`,
            bold: true,
            size: 26,
            color: '1E293B',
          }),
        ],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 },
      })
    );

    // Patient Demographics Row
    docSections.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'UR / MRN: ', bold: true }),
          new TextRun(pat.mrn || 'N/A'),
          new TextRun({ text: '   |   DOB: ', bold: true }),
          new TextRun(formatDocxDate(pat.dob)),
          new TextRun({ text: '   |   Medicare: ', bold: true }),
          new TextRun(pat.medicareNo || 'N/A'),
          new TextRun({ text: '   |   Hospital: ', bold: true }),
          new TextRun(pat.primaryHospital || group.encounters[0]?.hospital || 'N/A'),
        ],
        spacing: { after: 120 },
      })
    );

    // Sticker Photo Embedding (if available) - strictly preserves natural aspect ratio
    if (group.primaryStickerBlob) {
      try {
        const imageBytes = await blobToArrayBuffer(group.primaryStickerBlob);

        let origWidth = group.primaryImageWidth;
        let origHeight = group.primaryImageHeight;

        if (!origWidth || !origHeight || origWidth <= 0 || origHeight <= 0) {
          const dims = await getImageDimensions(group.primaryStickerBlob);
          origWidth = dims.width;
          origHeight = dims.height;
        }

        // Standard A4 printable area width is ~450pt with standard margins.
        // Cap max width at 450pt and max height at 260pt while strictly preserving aspect ratio.
        const maxPtWidth = 450;
        const maxPtHeight = 260;

        const scale = Math.min(maxPtWidth / origWidth, maxPtHeight / origHeight);
        const finalWidth = Math.round(origWidth * scale);
        const finalHeight = Math.round(origHeight * scale);

        docSections.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: imageBytes,
                transformation: {
                  width: finalWidth,
                  height: finalHeight,
                },
              } as any),
            ],
            spacing: { before: 120, after: 200 },
          })
        );
      } catch (imgErr) {
        console.warn('Failed to embed sticker image into DOCX:', imgErr);
      }
    }

    // Encounters Table
    const tableHeader = new TableRow({
      tableHeader: true,
      children: [
        new TableCell({
          width: { size: 24, type: WidthType.PERCENTAGE },
          shading: { fill: 'F1F5F9' },
          children: [new Paragraph({ children: [new TextRun({ text: 'Service Date', bold: true })] })],
        }),
        new TableCell({
          width: { size: 26, type: WidthType.PERCENTAGE },
          shading: { fill: 'F1F5F9' },
          children: [new Paragraph({ children: [new TextRun({ text: 'Hospital', bold: true })] })],
        }),
        new TableCell({
          width: { size: 22, type: WidthType.PERCENTAGE },
          shading: { fill: 'F1F5F9' },
          children: [new Paragraph({ children: [new TextRun({ text: 'MBS Codes', bold: true })] })],
        }),
        new TableCell({
          width: { size: 28, type: WidthType.PERCENTAGE },
          shading: { fill: 'F1F5F9' },
          children: [new Paragraph({ children: [new TextRun({ text: 'Clinical Notes', bold: true })] })],
        }),
      ],
    });

    const encounterRows = group.encounters.map((enc) => {
      return new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph(formatDocxDate(enc.serviceDate))],
          }),
          new TableCell({
            children: [new Paragraph(enc.hospital)],
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: enc.mbsCodes.map((c) => `MBS ${c}`).join(', '),
                    bold: true,
                    color: '047857',
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            children: [new Paragraph(enc.notes || '—')],
          }),
        ],
      });
    });

    const encounterTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
        insideVertical: { style: BorderStyle.NONE },
      },
      rows: [tableHeader, ...encounterRows],
    });

    docSections.push(encounterTable);

    // Separator between patients
    docSections.push(
      new Paragraph({
        text: '',
        spacing: { before: 200, after: 200 },
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: docSections,
      },
    ],
  });

  const docxBlob = await Packer.toBlob(doc);
  return docxBlob;
}

/**
 * Execute full export: generate DOCX, trigger browser download, optionally upload to Drive, and mark exported.
 */
import { getLocalDateString } from '../utils/dateUtils';

export async function executeMonthlyBillingExport(
  encounters: Encounter[],
  patients: Record<string, Patient>,
  imageBlobs: Record<string, ImageBlob>,
  monthLabel: string,
  googleAccessToken?: string
): Promise<{ success: boolean; docxBlob: Blob; driveFileId?: string; exportId: string }> {
  const exportId = crypto.randomUUID();
  const dateStamp = getLocalDateString();
  const safeMonth = monthLabel.replace(/[^A-Za-z0-9_-]/g, '_');
  const fileName = `Billing_Export_${safeMonth}_${dateStamp}.docx`;

  // 1. Generate DOCX Blob
  const docxBlob = await generateBillingDocx(encounters, patients, imageBlobs, monthLabel);

  // 2. Trigger instant browser download on phone
  const downloadUrl = URL.createObjectURL(docxBlob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

  // 3. Upload directly to Google Drive if connected
  let driveFileId: string | undefined;
  if (googleAccessToken) {
    try {
      const exportDate = encounters[0]?.serviceDate || new Date();
      driveFileId = await uploadExportDocumentToDrive(googleAccessToken, fileName, docxBlob, exportDate);
    } catch (driveErr) {
      console.warn('Drive upload of export failed:', driveErr);
    }
  }

  // 4. Atomically mark encounters as EXPORTED in IndexedDB
  const encounterIds = encounters.map((e) => e.id);
  await db.transaction('rw', [db.encounters, db.auditLogs], async () => {
    for (const id of encounterIds) {
      await db.encounters.update(id, {
        billingStatus: 'EXPORTED',
        exportId,
        updatedAt: new Date().toISOString(),
      });
    }

    await logAudit('RECORD_EDITED', undefined, {
      action: 'MONTHLY_BILLING_EXPORT',
      exportId,
      fileName,
      totalEncounters: encounters.length,
      driveFileId,
    });
  });

  return {
    success: true,
    docxBlob,
    driveFileId,
    exportId,
  };
}
