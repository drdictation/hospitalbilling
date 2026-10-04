export type SyncStatus = 'LOCAL_ONLY' | 'SYNCING' | 'SYNCED' | 'SYNC_ERROR';

export type PatientMatchStatus = 'UNIDENTIFIED' | 'PROBABLE' | 'CONFIRMED' | 'MANUAL_REVIEW';

export type BillingStatus = 'UNBILLED' | 'EXPORTED';

export interface Encounter {
  id: string; // UUIDv4
  capturedAt: string; // ISO string
  serviceDate: string; // YYYY-MM-DD
  hospital: string;
  mbsCodes: string[];
  imageBlobId: string; // Reference to ImageBlob.id
  syncStatus: SyncStatus;
  syncErrorMessage?: string;
  lastSyncAttempt?: string;
  remoteJsonId?: string; // Google Drive file ID for JSON
  remoteImageId?: string; // Google Drive file ID for Image
  patientId?: string;
  patientMatchStatus: PatientMatchStatus;
  billingStatus: BillingStatus;
  exportId?: string;
  notes?: string;
  extractedData?: {
    mrn?: string;
    patientName?: string;
    dob?: string;
    medicareNo?: string;
    rawText?: string;
    barcodeValue?: string;
    extractedAt?: string;
    isProcessing?: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ImageBlob {
  id: string; // UUIDv4 (matches imageBlobId)
  encounterId: string;
  dataUrl: string; // Compressed preview data URL
  blob: Blob; // Compressed JPEG binary blob (~200-350KB)
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  createdAt: string;
}

export interface Patient {
  id: string;
  primaryHospital: string;
  mrn: string; // Medical Record Number / UR
  name: string;
  dob: string; // DD/MM/YYYY or YYYY-MM-DD
  gender?: string;
  medicareNo?: string;
  encounterIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  action: 
    | 'ENCOUNTER_CREATED'
    | 'LOCAL_PERSIST_CONFIRMED'
    | 'UPLOAD_ATTEMPTED'
    | 'UPLOAD_SUCCESSFUL'
    | 'UPLOAD_FAILED'
    | 'RETRY_SUCCESSFUL'
    | 'RECORD_EDITED'
    | 'RECONCILIATION_RUN'
    | 'RECONCILIATION_REPAIR'
    | 'PATIENT_MATCHED'
    | 'PATIENT_CREATED'
    | 'PATIENT_MANUAL_REVIEW';
  encounterId?: string;
  details?: Record<string, any>;
}

export interface MbsPreset {
  code: string;
  label: string;
  category: 'consult' | 'procedure' | 'other';
  common: boolean;
}

export interface CompressedImageResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
}

export interface AppSettings {
  id: string; // 'current_settings'
  defaultHospital: string;
  hospitals: string[];
  mbsPresets: MbsPreset[];
  googleClientId?: string;
  googleAccessToken?: string;
  googleTokenExpiresAt?: number;
  googleDriveConnected: boolean;
  driveFolderId?: string;
  offlineSimulation: boolean;
  lastReconciliationAt?: string;
}
