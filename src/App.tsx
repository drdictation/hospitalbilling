import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  db, 
  initializeSettings, 
  persistEncounterLocally, 
  logAudit 
} from './db';
import type { AppSettings, CompressedImageResult, Encounter, ImageBlob, Patient } from './types';
import { Header } from './components/Header';
import { CaptureSection } from './components/CaptureSection';
import { EncounterList } from './components/EncounterList';
import { ReconciliationModal } from './components/ReconciliationModal';
import { SettingsModal } from './components/SettingsModal';
import { ImageModal } from './components/ImageModal';
import { ExportModal } from './components/ExportModal';
import { 
  syncSingleEncounter, 
  processSyncQueue, 
  setupSyncLifecycleListeners 
} from './services/syncEngine';
import { processEncounterIdentity } from './services/extractionPipeline';

export const App: React.FC = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isReconcileOpen, setIsReconcileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [selectedImageModalUrl, setSelectedImageModalUrl] = useState<string | null>(null);

  // Live query for settings
  const settings = useLiveQuery<AppSettings | undefined>(() => 
    db.settings.get('current_settings')
  );

  // Live query for encounters
  const encounters = useLiveQuery<Encounter[]>(() => 
    db.encounters.orderBy('createdAt').reverse().toArray(), 
    []
  ) || [];

  // Live query for patients
  const patientsList = useLiveQuery<Patient[]>(() => 
    db.patients.toArray(), 
    []
  ) || [];

  const patientsMap = React.useMemo(() => {
    const map: Record<string, Patient> = {};
    for (const p of patientsList) {
      map[p.id] = p;
    }
    return map;
  }, [patientsList]);

  // Live query for image blobs
  const imageBlobsList = useLiveQuery<ImageBlob[]>(() => 
    db.imageBlobs.toArray(), 
    []
  ) || [];

  // Map image blobs by ID for fast lookup
  const imageBlobsMap = React.useMemo(() => {
    const map: Record<string, ImageBlob> = {};
    for (const b of imageBlobsList) {
      map[b.id] = b;
    }
    return map;
  }, [imageBlobsList]);

  // Live query for audit logs
  const auditLogs = useLiveQuery(() => 
    db.auditLogs.orderBy('timestamp').reverse().limit(30).toArray(),
    []
  ) || [];

  // Initialize defaults and lifecycle listeners
  useEffect(() => {
    initializeSettings().catch((err) => console.error('Settings init error:', err));
    setupSyncLifecycleListeners();
    // Request persistent storage on iOS WebKit
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then((persistent) => {
        console.log(`IndexedDB persistence granted: ${persistent}`);
      });
    }
  }, []);

  // Compute unsynced count
  const unsyncedCount = encounters.filter((e) => e.syncStatus !== 'SYNCED').length;

  // Handle sticky hospital change
  const handleUpdateHospital = async (newHospital: string) => {
    if (!settings) return;
    await db.settings.update('current_settings', { defaultHospital: newHospital });
  };

  // Handle saving new encounter (atomic local-first write)
  const handleSaveEncounter = async (data: {
    serviceDate: string;
    hospital: string;
    mbsCodes: string[];
    compressedImage: CompressedImageResult;
    notes?: string;
  }) => {
    const encounterId = crypto.randomUUID();
    const imageBlobId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const newEncounter: Encounter = {
      id: encounterId,
      capturedAt: nowIso,
      serviceDate: data.serviceDate,
      hospital: data.hospital,
      mbsCodes: data.mbsCodes,
      imageBlobId,
      syncStatus: 'LOCAL_ONLY',
      patientMatchStatus: 'UNIDENTIFIED',
      billingStatus: 'UNBILLED',
      notes: data.notes,
      extractedData: {
        isProcessing: true,
      },
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const newImageBlob: ImageBlob = {
      id: imageBlobId,
      encounterId,
      blob: data.compressedImage.blob,
      dataUrl: data.compressedImage.dataUrl,
      mimeType: 'image/jpeg',
      sizeBytes: data.compressedImage.sizeBytes,
      width: data.compressedImage.width,
      height: data.compressedImage.height,
      createdAt: nowIso,
    };

    // 1. Atomic write to IndexedDB (<50ms)
    const result = await persistEncounterLocally(newEncounter, newImageBlob);
    if (!result.success) {
      return result;
    }

    // 2. Asynchronous background patient extraction (Barcode + OCR)
    processEncounterIdentity(encounterId)
      .then(() => {
        // Once patient identity is linked, trigger sync to update remote Drive JSON
        syncSingleEncounter(encounterId).catch(() => {});
      })
      .catch((err) => console.warn('Background patient extraction error:', err));

    // 3. Eager background sync attempt (does not block UI)
    syncSingleEncounter(encounterId).catch((err) =>
      console.warn('Background sync error after save:', err)
    );

    return { success: true };
  };

  // Handle retry sync for a specific encounter
  const handleRetrySingleSync = async (encounterId: string) => {
    setIsSyncing(true);
    try {
      await syncSingleEncounter(encounterId);
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle retry sync for all pending
  const handleRetryAllSync = async () => {
    setIsSyncing(true);
    try {
      await processSyncQueue();
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle quick edit on an encounter
  const handleUpdateEncounter = async (encounterId: string, updates: Partial<Encounter>) => {
    await db.encounters.update(encounterId, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
    await logAudit('RECORD_EDITED', encounterId, updates);
    // If was edited, trigger eager re-sync
    syncSingleEncounter(encounterId).catch(() => {});
  };

  // Handle updating patient details directly
  const handleUpdatePatient = async (patientId: string, updates: Partial<Patient>) => {
    await db.patients.update(patientId, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  };

  // Handle settings update
  const handleUpdateSettings = async (updates: Partial<AppSettings>) => {
    await db.settings.update('current_settings', updates);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Sticky Top Header */}
      <Header
        settings={settings || null}
        onUpdateHospital={handleUpdateHospital}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenReconciliation={() => setIsReconcileOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        unsyncedCount={unsyncedCount}
        isSyncing={isSyncing}
        onRetrySync={handleRetryAllSync}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-lg mx-auto">
        {/* Capture Section: Native Camera -> MBS Code -> Save Locally */}
        <CaptureSection
          settings={settings || null}
          onSaveEncounter={handleSaveEncounter}
          isSyncing={isSyncing}
        />

        {/* Encounters Feed */}
        <EncounterList
          encounters={encounters}
          patients={patientsMap}
          imageBlobs={imageBlobsMap}
          onRetrySync={handleRetrySingleSync}
          onUpdateEncounter={handleUpdateEncounter}
          onUpdatePatient={handleUpdatePatient}
          onViewImage={(url) => setSelectedImageModalUrl(url)}
        />
      </main>

      {/* Modals */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        encounters={encounters}
        patients={patientsMap}
        imageBlobs={imageBlobsMap}
        googleAccessToken={settings?.googleAccessToken}
      />

      <ReconciliationModal
        isOpen={isReconcileOpen}
        onClose={() => setIsReconcileOpen(false)}
        localEncounters={encounters}
        auditLogs={auditLogs}
        googleAccessToken={settings?.googleAccessToken}
        onSyncPending={handleRetryAllSync}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings || null}
        onUpdateSettings={handleUpdateSettings}
        localEncountersCount={encounters.length}
      />

      <ImageModal
        imageUrl={selectedImageModalUrl}
        onClose={() => setSelectedImageModalUrl(null)}
      />
    </div>
  );
};

export default App;
