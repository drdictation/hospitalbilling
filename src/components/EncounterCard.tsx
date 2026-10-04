import React, { useState } from 'react';
import { 
  Building2, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  RefreshCw, 
  Edit2, 
  ExternalLink,
  User,
  Sparkles
} from 'lucide-react';
import type { Encounter, ImageBlob, Patient } from '../types';

interface EncounterCardProps {
  encounter: Encounter;
  patient?: Patient;
  imageBlob?: ImageBlob;
  onRetrySync: (encounterId: string) => void;
  onUpdateEncounter: (encounterId: string, updates: Partial<Encounter>) => void;
  onUpdatePatient?: (patientId: string, updates: Partial<Patient>) => void;
  onViewImage: (dataUrl: string) => void;
}

export const EncounterCard: React.FC<EncounterCardProps> = ({
  encounter,
  patient,
  imageBlob,
  onRetrySync,
  onUpdateEncounter,
  onUpdatePatient,
  onViewImage,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editCodes, setEditCodes] = useState(encounter.mbsCodes.join(', '));
  const [editHospital, setEditHospital] = useState(encounter.hospital);
  const [editPatientName, setEditPatientName] = useState(patient?.name || encounter.extractedData?.patientName || '');
  const [editMrn, setEditMrn] = useState(patient?.mrn || encounter.extractedData?.mrn || '');
  const [editDob, setEditDob] = useState(patient?.dob || encounter.extractedData?.dob || '');

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const handleSaveEdit = () => {
    const codes = editCodes
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    if (codes.length === 0) {
      alert('Must have at least one MBS code');
      return;
    }

    // Update encounter
    onUpdateEncounter(encounter.id, {
      hospital: editHospital,
      mbsCodes: codes,
      syncStatus: encounter.syncStatus === 'SYNCED' ? 'LOCAL_ONLY' : encounter.syncStatus,
      patientMatchStatus: editMrn ? 'CONFIRMED' : encounter.patientMatchStatus,
      extractedData: {
        ...encounter.extractedData,
        patientName: editPatientName,
        mrn: editMrn,
        dob: editDob,
      },
    });

    // Update patient if linked
    if (patient && onUpdatePatient) {
      onUpdatePatient(patient.id, {
        name: editPatientName,
        mrn: editMrn,
        dob: editDob,
      });
    }

    setIsEditing(false);
  };

  const displayName = patient?.name || encounter.extractedData?.patientName;
  const displayMrn = patient?.mrn || encounter.extractedData?.mrn;
  const displayDob = patient?.dob || encounter.extractedData?.dob;
  const isProcessing = encounter.extractedData?.isProcessing;

  return (
    <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-3.5 shadow-sm transition-all hover:border-slate-700">
      <div className="flex items-start gap-3">
        {/* Sticker Thumbnail */}
        <div
          onClick={() => imageBlob?.dataUrl && onViewImage(imageBlob.dataUrl)}
          className="relative w-16 h-20 rounded-lg overflow-hidden bg-slate-800 shrink-0 border border-slate-700/80 cursor-pointer group"
        >
          {imageBlob?.dataUrl ? (
            <>
              <img
                src={imageBlob.dataUrl}
                alt="Sticker thumbnail"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <ExternalLink className="w-4 h-4 text-white drop-shadow" />
              </div>
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500">
              No Photo
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              {/* Patient Banner */}
              {isProcessing ? (
                <div className="flex items-center gap-1.5 text-xs text-sky-400 font-medium">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Extracting patient sticker...</span>
                </div>
              ) : displayName ? (
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-bold text-slate-100 truncate">
                    <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate">{displayName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                    {displayMrn && (
                      <span className="font-mono text-emerald-300 font-semibold">
                        UR: {displayMrn}
                      </span>
                    )}
                    {displayDob && (
                      <>
                        <span>•</span>
                        <span>DOB: {displayDob}</span>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-xs text-amber-400 font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Unidentified Patient</span>
                </div>
              )}

              {/* Hospital & Time */}
              <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                <span className="flex items-center gap-1 truncate max-w-[150px]">
                  <Building2 className="w-3 h-3 text-slate-500 shrink-0" />
                  <span className="truncate">{encounter.hospital}</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-500" />
                  {encounter.serviceDate}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-500" />
                  {formatTime(encounter.capturedAt)}
                </span>
              </div>
            </div>

            {/* Edit Button */}
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              title="Edit Encounter"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* MBS Badges */}
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {encounter.mbsCodes.map((code) => (
              <span
                key={code}
                className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold tracking-tight"
              >
                MBS {code}
              </span>
            ))}
            {encounter.notes && (
              <span className="text-[11px] text-slate-400 italic truncate max-w-[140px]">
                "{encounter.notes}"
              </span>
            )}
          </div>

          {/* Patient Match & Sync Status Row */}
          <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Patient Match Status Pill */}
              {encounter.patientMatchStatus === 'CONFIRMED' ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/50 text-[10px] font-semibold text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" />
                  Matched
                </span>
              ) : encounter.patientMatchStatus === 'PROBABLE' ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-800/50 text-[10px] font-semibold text-amber-300">
                  <Sparkles className="w-3 h-3" />
                  Probable
                </span>
              ) : encounter.patientMatchStatus === 'MANUAL_REVIEW' ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-950/60 border border-rose-800/50 text-[10px] font-semibold text-rose-300">
                  <AlertTriangle className="w-3 h-3" />
                  Review Needed
                </span>
              ) : null}

              {/* Sync Status */}
              {encounter.syncStatus === 'SYNCED' ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400/90">
                  <CheckCircle2 className="w-3 h-3" />
                  Synced
                </span>
              ) : encounter.syncStatus === 'SYNCING' ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-400">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Syncing...
                </span>
              ) : encounter.syncStatus === 'SYNC_ERROR' ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400">
                  <AlertCircle className="w-3 h-3" />
                  Sync Failed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400">
                  <Clock className="w-3 h-3" />
                  Saved Locally
                </span>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-1">
              {encounter.patientMatchStatus === 'MANUAL_REVIEW' && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-[10px] font-bold text-rose-300 hover:text-white bg-rose-950/50 hover:bg-rose-900/60 px-2 py-0.5 rounded border border-rose-800/60 transition-colors"
                >
                  Resolve
                </button>
              )}
              {encounter.syncStatus !== 'SYNCED' && (
                <button
                  onClick={() => onRetrySync(encounter.id)}
                  className="text-[10px] font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded border border-slate-700 transition-colors"
                >
                  Retry
                </button>
              )}
            </div>
          </div>

          {encounter.syncErrorMessage && (
            <p className="mt-1 text-[10px] text-rose-400 truncate">
              {encounter.syncErrorMessage}
            </p>
          )}
        </div>
      </div>

      {/* Edit Drawer */}
      {isEditing && (
        <div className="mt-3 pt-3 border-t border-slate-700/60 space-y-2">
          <div className="text-[11px] font-semibold text-slate-300">Edit Encounter & Patient Details</div>
          
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400">Patient Name</label>
              <input
                type="text"
                placeholder="SURNAME, Given"
                value={editPatientName}
                onChange={(e) => setEditPatientName(e.target.value)}
                className="w-full px-2 py-1 text-xs bg-slate-800 rounded border border-slate-700 text-slate-200"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400">MRN / UR Number</label>
              <input
                type="text"
                placeholder="e.g. 581670"
                value={editMrn}
                onChange={(e) => setEditMrn(e.target.value)}
                className="w-full px-2 py-1 text-xs bg-slate-800 rounded border border-slate-700 text-slate-200 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-400">Date of Birth</label>
              <input
                type="text"
                placeholder="DD/MM/YYYY"
                value={editDob}
                onChange={(e) => setEditDob(e.target.value)}
                className="w-full px-2 py-1 text-xs bg-slate-800 rounded border border-slate-700 text-slate-200"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400">Hospital</label>
              <input
                type="text"
                value={editHospital}
                onChange={(e) => setEditHospital(e.target.value)}
                className="w-full px-2 py-1 text-xs bg-slate-800 rounded border border-slate-700 text-slate-200"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-400">MBS Codes (comma separated)</label>
            <input
              type="text"
              value={editCodes}
              onChange={(e) => setEditCodes(e.target.value)}
              className="w-full px-2 py-1 text-xs bg-slate-800 rounded border border-slate-700 text-slate-200"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setIsEditing(false)}
              className="px-2.5 py-1 rounded text-xs text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
            >
              Save Changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
