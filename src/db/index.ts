import Dexie, { type EntityTable } from 'dexie';
import type { Encounter, ImageBlob, AuditLog, AppSettings, Patient } from '../types';

// Default initial settings for an Australian Gastroenterologist
const DEFAULT_HOSPITALS = [
  "St Vincent's Private",
  "St Vincent's Public (Private in Public)",
  "Epworth Freemasons",
  "Hobson's Bay Sydenham"
];

const DEFAULT_MBS_PRESETS = [
  { code: '110', label: 'Initial Inpatient Consult', category: 'consult' as const, common: true },
  { code: '116', label: 'Subsequent Inpatient Consult', category: 'consult' as const, common: true },
  { code: '32222', label: 'Colonoscopy (Diag / Surv)', category: 'procedure' as const, common: true },
  { code: '32229', label: 'Colonoscopy + Polypectomy', category: 'procedure' as const, common: true },
  { code: '30473', label: 'Gastroscopy Diagnostic', category: 'procedure' as const, common: true },
  { code: '30478', label: 'Gastroscopy + Biopsy', category: 'procedure' as const, common: true },
  { code: '32084', label: 'Flexible Sigmoidoscopy', category: 'procedure' as const, common: false },
  { code: '32087', label: 'Flex Sig + Biopsy/Polyp', category: 'procedure' as const, common: false },
  { code: '132', label: 'Complex Initial Consult', category: 'consult' as const, common: false },
  { code: '133', label: 'Complex Subsequent Consult', category: 'consult' as const, common: false },
];

export class HospitalBillingDB extends Dexie {
  encounters!: EntityTable<Encounter, 'id'>;
  imageBlobs!: EntityTable<ImageBlob, 'id'>;
  patients!: EntityTable<Patient, 'id'>;
  auditLogs!: EntityTable<AuditLog, 'id'>;
  settings!: EntityTable<AppSettings, 'id'>;

  constructor() {
    super('HospitalBillingDB');
    
    this.version(1).stores({
      encounters: '&id, serviceDate, hospital, syncStatus, billingStatus, patientMatchStatus, createdAt',
      imageBlobs: '&id, encounterId',
      patients: '&id, mrn, primaryHospital',
      auditLogs: '&id, timestamp, action, encounterId',
      settings: '&id'
    });
  }
}

export const db = new HospitalBillingDB();

/**
 * Initialize default settings if not present, and auto-migrate outdated presets
 */
export async function initializeSettings(): Promise<AppSettings> {
  const existing = await db.settings.get('current_settings');
  if (existing) {
    // If settings contain outdated sample hospitals or old MBS codes (e.g. 32090), migrate them
    const hasOldCodes = existing.mbsPresets.some((p) => p.code === '32090');
    const hasOldHospitals = existing.hospitals.some((h) => h.includes('Richmond') || h.includes('Knox'));

    if (hasOldCodes || hasOldHospitals) {
      existing.hospitals = DEFAULT_HOSPITALS;
      if (!DEFAULT_HOSPITALS.includes(existing.defaultHospital)) {
        existing.defaultHospital = DEFAULT_HOSPITALS[0];
      }
      existing.mbsPresets = DEFAULT_MBS_PRESETS;
      await db.settings.put(existing);
    }
    return existing;
  }

  const envClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  const initialSettings: AppSettings = {
    id: 'current_settings',
    defaultHospital: DEFAULT_HOSPITALS[0],
    hospitals: DEFAULT_HOSPITALS,
    mbsPresets: DEFAULT_MBS_PRESETS,
    googleClientId: envClientId,
    offlineSimulation: false,
    googleDriveConnected: false,
  };

  await db.settings.put(initialSettings);
  return initialSettings;
}

/**
 * Atomic local persistence: saves encounter + image blob + audit log in ONE transaction.
 * If anything fails, the entire transaction rolls back.
 */
export async function persistEncounterLocally(
  encounter: Encounter,
  imageBlob: ImageBlob
): Promise<{ success: boolean; error?: string }> {
  try {
    await db.transaction('rw', [db.encounters, db.imageBlobs, db.auditLogs], async () => {
      await db.encounters.put(encounter);
      await db.imageBlobs.put(imageBlob);
      
      const logEntry: AuditLog = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        action: 'LOCAL_PERSIST_CONFIRMED',
        encounterId: encounter.id,
        details: {
          hospital: encounter.hospital,
          mbsCodes: encounter.mbsCodes,
          imageSizeBytes: imageBlob.sizeBytes,
          syncStatus: encounter.syncStatus
        }
      };
      await db.auditLogs.put(logEntry);
    });

    return { success: true };
  } catch (err: any) {
    console.error('Failed to persist encounter locally:', err);
    return { success: false, error: err?.message || 'Database write error' };
  }
}

/**
 * Log an audit action to IndexedDB
 */
export async function logAudit(
  action: AuditLog['action'],
  encounterId?: string,
  details?: Record<string, any>
): Promise<void> {
  try {
    await db.auditLogs.put({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action,
      encounterId,
      details
    });
  } catch (err) {
    console.warn('Audit logging failed:', err);
  }
}

/**
 * Update encounter sync status atomically
 */
export async function updateSyncStatus(
  encounterId: string,
  status: Encounter['syncStatus'],
  remoteDetails?: { remoteJsonId?: string; remoteImageId?: string },
  errorMessage?: string
): Promise<void> {
  const updates: Partial<Encounter> = {
    syncStatus: status,
    lastSyncAttempt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (remoteDetails?.remoteJsonId) updates.remoteJsonId = remoteDetails.remoteJsonId;
  if (remoteDetails?.remoteImageId) updates.remoteImageId = remoteDetails.remoteImageId;
  if (errorMessage !== undefined) updates.syncErrorMessage = errorMessage;

  await db.encounters.update(encounterId, updates);
}
