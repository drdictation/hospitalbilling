import { db, logAudit } from '../db';
import type { Patient, PatientMatchStatus } from '../types';
import type { ParsedStickerData } from '../utils/stickerParser';

export interface MatchResult {
  patientId?: string;
  patientMatchStatus: PatientMatchStatus;
  patientName?: string;
  mrn?: string;
  dob?: string;
}

/**
 * Deterministically match an encounter to an existing patient or create a new one.
 * 
 * Strict Hierarchy:
 * 1. Strong Match (Automatic): Same Hospital + MRN -> Match/Link immediately.
 * 2. Probable Match: Name + DOB match an existing patient record -> Link with PROBABLE status.
 * 3. Uncertain / Conflict: Never guess. Mark MANUAL_REVIEW and surface in Needs Attention tab.
 */
export async function matchAndLinkPatient(
  encounterId: string,
  parsed: ParsedStickerData
): Promise<MatchResult> {
  const encounter = await db.encounters.get(encounterId);
  if (!encounter) {
    throw new Error(`Encounter ${encounterId} not found.`);
  }

  const nowIso = new Date().toISOString();
  let matchedPatient: Patient | undefined;
  let matchStatus: PatientMatchStatus = 'UNIDENTIFIED';

  // TIER 1: STRONG MATCH via Hospital + MRN
  if (parsed.mrn) {
    // Query db.patients for same hospital and MRN
    matchedPatient = await db.patients
      .where('[primaryHospital+mrn]')
      .equals([encounter.hospital, parsed.mrn])
      .first();

    if (!matchedPatient) {
      // Fallback query by mrn in case hospital string has minor variation
      matchedPatient = await db.patients.where('mrn').equals(parsed.mrn).first();
    }

    if (matchedPatient) {
      // Patient already exists! Link this encounter
      matchStatus = 'CONFIRMED';
      const updatedEncounterIds = Array.from(new Set([...matchedPatient.encounterIds, encounter.id]));
      
      const updates: Partial<Patient> = {
        encounterIds: updatedEncounterIds,
        updatedAt: nowIso,
      };

      // Backfill missing patient details if available from this scan
      if (!matchedPatient.dob && parsed.dob) updates.dob = parsed.dob;
      if (!matchedPatient.medicareNo && parsed.medicareNo) updates.medicareNo = parsed.medicareNo;
      if ((!matchedPatient.name || matchedPatient.name === 'UNKNOWN') && parsed.name) {
        updates.name = parsed.name;
      }

      await db.patients.update(matchedPatient.id, updates);
      await logAudit('PATIENT_MATCHED', encounterId, {
        patientId: matchedPatient.id,
        mrn: parsed.mrn,
        name: matchedPatient.name,
      });
    } else {
      // New Patient: Create deterministically from MRN
      matchStatus = 'CONFIRMED';
      const newPatient: Patient = {
        id: crypto.randomUUID(),
        primaryHospital: encounter.hospital,
        mrn: parsed.mrn,
        name: parsed.name || 'UNKNOWN PATIENT',
        dob: parsed.dob || '',
        medicareNo: parsed.medicareNo,
        encounterIds: [encounter.id],
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await db.patients.put(newPatient);
      matchedPatient = newPatient;

      await logAudit('PATIENT_CREATED', encounterId, {
        patientId: newPatient.id,
        mrn: newPatient.mrn,
        name: newPatient.name,
      });
    }
  }

  // TIER 2: PROBABLE MATCH via Name + DOB (when MRN missing or unreadable)
  if (!matchedPatient && parsed.name && parsed.dob) {
    const candidates = await db.patients
      .where('primaryHospital')
      .equals(encounter.hospital)
      .toArray();

    const normalizedParsedName = parsed.name.toLowerCase().replace(/[^a-z]/g, '');

    const probableCandidate = candidates.find((p) => {
      const pNameNorm = p.name.toLowerCase().replace(/[^a-z]/g, '');
      return pNameNorm === normalizedParsedName && p.dob === parsed.dob;
    });

    if (probableCandidate) {
      matchStatus = 'PROBABLE';
      matchedPatient = probableCandidate;

      const updatedEncounterIds = Array.from(new Set([...probableCandidate.encounterIds, encounter.id]));
      await db.patients.update(probableCandidate.id, {
        encounterIds: updatedEncounterIds,
        updatedAt: nowIso,
      });

      await logAudit('PATIENT_MATCHED', encounterId, {
        patientId: probableCandidate.id,
        status: 'PROBABLE',
        name: probableCandidate.name,
        dob: probableCandidate.dob,
      });
    }
  }

  // TIER 3: UNCERTAIN / MANUAL REVIEW
  if (!matchedPatient) {
    matchStatus = 'MANUAL_REVIEW';
    await logAudit('PATIENT_MANUAL_REVIEW', encounterId, {
      reason: parsed.matchReason || 'Missing MRN and demographic data',
      rawTextSample: parsed.rawText.slice(0, 100),
    });
  }

  // Update encounter record in IndexedDB
  await db.encounters.update(encounterId, {
    patientId: matchedPatient?.id,
    patientMatchStatus: matchStatus,
    extractedData: {
      mrn: parsed.mrn || matchedPatient?.mrn,
      patientName: parsed.name || matchedPatient?.name,
      dob: parsed.dob || matchedPatient?.dob,
      medicareNo: parsed.medicareNo || matchedPatient?.medicareNo,
      barcodeValue: parsed.barcodeValue,
      rawText: parsed.rawText,
      extractedAt: nowIso,
      isProcessing: false,
    },
    updatedAt: nowIso,
  });

  return {
    patientId: matchedPatient?.id,
    patientMatchStatus: matchStatus,
    patientName: parsed.name || matchedPatient?.name,
    mrn: parsed.mrn || matchedPatient?.mrn,
    dob: parsed.dob || matchedPatient?.dob,
  };
}
