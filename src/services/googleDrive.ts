import type { Encounter, ImageBlob } from '../types';

export interface RemoteSyncResult {
  remoteJsonId: string;
  remoteImageId: string;
}

export interface DriveReconciliationReport {
  timestamp: string;
  totalLocal: number;
  totalRemote: number;
  syncedCount: number;
  localOnlyIds: string[];
  remoteOnlyIds: string[];
  errorIds: string[];
  isClean: boolean;
}

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

/**
 * Helper to execute authorized Google Drive REST queries
 */
async function driveFetch(url: string, token: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    let errorDetail = '';
    try {
      const errJson = await res.json();
      errorDetail = errJson.error?.message || JSON.stringify(errJson);
    } catch {
      errorDetail = await res.text();
    }
    throw new Error(`Google Drive API Error (${res.status}): ${errorDetail}`);
  }
  return res.json();
}

/**
 * Find or create a folder on Google Drive
 */
export async function getOrCreateFolder(
  token: string,
  folderName: string,
  parentId?: string
): Promise<string> {
  const parentQuery = parentId ? `'${parentId}' in parents and ` : '';
  const query = `${parentQuery}name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  
  const searchUrl = `${DRIVE_API}?q=${encodeURIComponent(query)}&fields=files(id,name)`;
  const result = await driveFetch(searchUrl, token);

  if (result.files && result.files.length > 0) {
    return result.files[0].id;
  }

  // Folder doesn't exist, create it
  const createRes = await driveFetch(DRIVE_API, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    }),
  });

  return createRes.id;
}

/**
 * Ensure the full monthly folder structure exists:
 * Private Hospital Billing/YYYY/MM MonthName/encounters & images
 */
export async function ensureMonthlyFolderHierarchy(
  token: string,
  date: Date = new Date()
): Promise<{ rootId: string; monthId: string; encountersFolderId: string; imagesFolderId: string }> {
  const rootId = await getOrCreateFolder(token, 'Private Hospital Billing');
  
  const yearStr = date.getFullYear().toString();
  const yearId = await getOrCreateFolder(token, yearStr, rootId);

  const monthNames = [
    '01 January', '02 February', '03 March', '04 April', '05 May', '06 June',
    '07 July', '08 August', '09 September', '10 October', '11 November', '12 December'
  ];
  const monthStr = monthNames[date.getMonth()];
  const monthId = await getOrCreateFolder(token, monthStr, yearId);

  const [encountersFolderId, imagesFolderId] = await Promise.all([
    getOrCreateFolder(token, 'encounters', monthId),
    getOrCreateFolder(token, 'images', monthId),
  ]);

  return { rootId, monthId, encountersFolderId, imagesFolderId };
}

/**
 * Search if a file with exact name already exists in a given folder
 */
async function findFileByName(token: string, name: string, folderId: string): Promise<string | null> {
  const query = `'${folderId}' in parents and name = '${name}' and trashed = false`;
  const searchUrl = `${DRIVE_API}?q=${encodeURIComponent(query)}&fields=files(id,name)`;
  const result = await driveFetch(searchUrl, token);
  return result.files && result.files.length > 0 ? result.files[0].id : null;
}

/**
 * Multipart file upload to Google Drive.
 * Supports idempotent overwrite if the file already exists.
 */
async function uploadOrUpdateFile(
  token: string,
  fileName: string,
  mimeType: string,
  folderId: string,
  content: Blob | string
): Promise<string> {
  const existingId = await findFileByName(token, fileName, folderId);

  const metadata = {
    name: fileName,
    mimeType,
    parents: existingId ? undefined : [folderId],
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  const metaPart = `Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
  
  let mediaPart: Blob;
  if (typeof content === 'string') {
    mediaPart = new Blob([content], { type: mimeType });
  } else {
    mediaPart = content;
  }

  const body = new Blob([
    delimiter,
    metaPart,
    delimiter,
    `Content-Type: ${mimeType}\r\n\r\n`,
    mediaPart,
    closeDelim
  ]);

  let uploadUrl = UPLOAD_API;
  let method = 'POST';

  if (existingId) {
    // Overwrite existing file idempotently
    uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`;
    method = 'PATCH';
  }

  const headers = new Headers({
    'Authorization': `Bearer ${token}`,
    'Content-Type': `multipart/related; boundary=${boundary}`,
  });

  const res = await fetch(uploadUrl, { method, headers, body });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Drive Upload Failed (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  return data.id;
}

/**
 * Upload an encounter and its compressed image directly to Google Drive.
 * 100% Zero PHI passes through any intermediary server.
 */
export async function uploadEncounterToDrive(
  token: string,
  encounter: Encounter,
  imageBlob: ImageBlob
): Promise<RemoteSyncResult> {
  const serviceDate = new Date(encounter.serviceDate);
  const { encountersFolderId, imagesFolderId } = await ensureMonthlyFolderHierarchy(token, serviceDate);

  // 1. Upload sticker image (idempotent name: img_{encounter.id}.jpg)
  const imageFileName = `img_${encounter.id}.jpg`;
  const remoteImageId = await uploadOrUpdateFile(
    token,
    imageFileName,
    'image/jpeg',
    imagesFolderId,
    imageBlob.blob
  );

  // 2. Upload encounter JSON payload (idempotent name: enc_{encounter.id}.json)
  const encounterRecord = {
    ...encounter,
    remoteImageId,
    syncedAt: new Date().toISOString(),
  };
  const jsonFileName = `enc_${encounter.id}.json`;
  const remoteJsonId = await uploadOrUpdateFile(
    token,
    jsonFileName,
    'application/json',
    encountersFolderId,
    JSON.stringify(encounterRecord, null, 2)
  );

  return { remoteJsonId, remoteImageId };
}

/**
 * Reconcile local IndexedDB encounters against remote Google Drive files for a given month.
 */
export async function performReconciliation(
  token: string,
  localEncounters: Encounter[],
  date: Date = new Date()
): Promise<DriveReconciliationReport> {
  const { encountersFolderId } = await ensureMonthlyFolderHierarchy(token, date);

  // Query all remote encounter JSON files
  const query = `'${encountersFolderId}' in parents and mimeType = 'application/json' and trashed = false`;
  const searchUrl = `${DRIVE_API}?q=${encodeURIComponent(query)}&pageSize=1000&fields=files(id,name)`;
  const remoteRes = await driveFetch(searchUrl, token);

  const remoteFiles: { id: string; name: string }[] = remoteRes.files || [];
  
  // Extract UUIDs from remote filenames (e.g. enc_uuid.json -> uuid)
  const remoteUuidMap = new Map<string, string>();
  for (const file of remoteFiles) {
    const match = file.name.match(/^enc_([a-f0-9\-]+)\.json$/i);
    if (match) {
      remoteUuidMap.set(match[1], file.id);
    }
  }

  const localMap = new Map<string, Encounter>();
  localEncounters.forEach((enc) => localMap.set(enc.id, enc));

  const localOnlyIds: string[] = [];
  const errorIds: string[] = [];
  let syncedCount = 0;

  for (const [id, enc] of localMap.entries()) {
    if (remoteUuidMap.has(id)) {
      if (enc.syncStatus === 'SYNCED') {
        syncedCount++;
      } else {
        // Exists on Drive but local marked not synced -> can be repaired immediately
        errorIds.push(id);
      }
    } else {
      localOnlyIds.push(id);
    }
  }

  const remoteOnlyIds: string[] = [];
  for (const [id] of remoteUuidMap.entries()) {
    if (!localMap.has(id)) {
      remoteOnlyIds.push(id);
    }
  }

  const isClean = localOnlyIds.length === 0 && remoteOnlyIds.length === 0 && errorIds.length === 0;

  return {
    timestamp: new Date().toISOString(),
    totalLocal: localEncounters.length,
    totalRemote: remoteFiles.length,
    syncedCount,
    localOnlyIds,
    remoteOnlyIds,
    errorIds,
    isClean,
  };
}
