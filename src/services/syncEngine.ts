import { db, logAudit, updateSyncStatus } from '../db';
import { uploadEncounterToDrive } from './googleDrive';

let isSyncInProgress = false;

/**
 * Attempt to upload a single encounter to Google Drive.
 * Fails safely if offline or if no valid access token exists.
 */
export async function syncSingleEncounter(encounterId: string): Promise<boolean> {
  const encounter = await db.encounters.get(encounterId);
  if (!encounter) return false;

  const settings = await db.settings.get('current_settings');
  const token = settings?.googleAccessToken;

  // If simulated offline or no network or no token, mark as LOCAL_ONLY and exit
  if (settings?.offlineSimulation || !navigator.onLine || !token) {
    if (encounter.syncStatus === 'SYNCING') {
      await updateSyncStatus(encounterId, 'LOCAL_ONLY');
    }
    return false;
  }

  // Check token expiry
  if (settings.googleTokenExpiresAt && Date.now() > settings.googleTokenExpiresAt) {
    await updateSyncStatus(
      encounterId,
      'SYNC_ERROR',
      undefined,
      'Google Drive token expired. Please reconnect.'
    );
    await logAudit('UPLOAD_FAILED', encounterId, { reason: 'Token expired' });
    return false;
  }

  try {
    await updateSyncStatus(encounterId, 'SYNCING');
    await logAudit('UPLOAD_ATTEMPTED', encounterId);

    const imageBlob = await db.imageBlobs.get(encounter.imageBlobId);
    if (!imageBlob) {
      throw new Error(`Associated image blob ${encounter.imageBlobId} not found locally.`);
    }

    const { remoteJsonId, remoteImageId } = await uploadEncounterToDrive(
      token,
      encounter,
      imageBlob
    );

    await updateSyncStatus(encounterId, 'SYNCED', { remoteJsonId, remoteImageId });
    await logAudit('UPLOAD_SUCCESSFUL', encounterId, { remoteJsonId, remoteImageId });
    return true;
  } catch (err: any) {
    console.error(`Sync failed for encounter ${encounterId}:`, err);
    const errorMessage = err?.message || 'Network or upload failure';
    await updateSyncStatus(encounterId, 'SYNC_ERROR', undefined, errorMessage);
    await logAudit('UPLOAD_FAILED', encounterId, { error: errorMessage });
    return false;
  }
}

/**
 * Process all unsynced encounters in the queue.
 * Runs eagerly and sequentially to prevent race conditions on mobile.
 */
export async function processSyncQueue(): Promise<{ total: number; succeeded: number; failed: number }> {
  if (isSyncInProgress) {
    return { total: 0, succeeded: 0, failed: 0 };
  }

  isSyncInProgress = true;
  let succeeded = 0;
  let failed = 0;

  try {
    const unsyncedEncounters = await db.encounters
      .where('syncStatus')
      .anyOf(['LOCAL_ONLY', 'SYNC_ERROR'])
      .toArray();

    for (const enc of unsyncedEncounters) {
      const ok = await syncSingleEncounter(enc.id);
      if (ok) {
        succeeded++;
      } else {
        failed++;
      }
    }

    return { total: unsyncedEncounters.length, succeeded, failed };
  } finally {
    isSyncInProgress = false;
  }
}

/**
 * Attach global event listeners to resume synchronisation eagerly:
 * - On app visibility (unlocking phone, switching back to PWA)
 * - On network reconnect
 */
export function setupSyncLifecycleListeners() {
  const triggerSync = () => {
    if (navigator.onLine && !document.hidden) {
      processSyncQueue().catch((err) => console.warn('Background sync trigger error:', err));
    }
  };

  window.addEventListener('online', triggerSync);
  window.addEventListener('pageshow', triggerSync);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      triggerSync();
    }
  });
}
