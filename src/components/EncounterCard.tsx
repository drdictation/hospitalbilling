import React, { useState } from 'react';
import { 
  Building2, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Edit2, 
  ExternalLink
} from 'lucide-react';
import type { Encounter, ImageBlob } from '../types';

interface EncounterCardProps {
  encounter: Encounter;
  imageBlob?: ImageBlob;
  onRetrySync: (encounterId: string) => void;
  onUpdateEncounter: (encounterId: string, updates: Partial<Encounter>) => void;
  onViewImage: (dataUrl: string) => void;
}

export const EncounterCard: React.FC<EncounterCardProps> = ({
  encounter,
  imageBlob,
  onRetrySync,
  onUpdateEncounter,
  onViewImage,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editCodes, setEditCodes] = useState(encounter.mbsCodes.join(', '));
  const [editHospital, setEditHospital] = useState(encounter.hospital);

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

    onUpdateEncounter(encounter.id, {
      hospital: editHospital,
      mbsCodes: codes,
      syncStatus: encounter.syncStatus === 'SYNCED' ? 'LOCAL_ONLY' : encounter.syncStatus,
    });
    setIsEditing(false);
  };

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
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200 truncate">
                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{encounter.hospital}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {encounter.serviceDate}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
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

          {/* Status Row */}
          <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {encounter.syncStatus === 'SYNCED' ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Synced to Drive
                </span>
              ) : encounter.syncStatus === 'SYNCING' ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-400">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Syncing to Drive...
                </span>
              ) : encounter.syncStatus === 'SYNC_ERROR' ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Upload Failed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400">
                  <Clock className="w-3.5 h-3.5" />
                  Saved Locally (Pending Sync)
                </span>
              )}
            </div>

            {/* Retry Button if not synced */}
            {encounter.syncStatus !== 'SYNCED' && (
              <button
                onClick={() => onRetrySync(encounter.id)}
                className="text-[11px] font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded border border-slate-700 transition-colors"
              >
                Retry
              </button>
            )}
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
          <div className="text-[11px] font-semibold text-slate-300">Quick Edit Metadata</div>
          <div>
            <label className="text-[10px] text-slate-400">Hospital</label>
            <input
              type="text"
              value={editHospital}
              onChange={(e) => setEditHospital(e.target.value)}
              className="w-full px-2 py-1 text-xs bg-slate-800 rounded border border-slate-700 text-slate-200"
            />
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
