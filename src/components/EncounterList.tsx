import { useState } from 'react';
import { CheckCircle, Clock } from 'lucide-react';
import type { Encounter, ImageBlob } from '../types';
import { EncounterCard } from './EncounterCard';

interface EncounterListProps {
  encounters: Encounter[];
  imageBlobs: Record<string, ImageBlob>;
  onRetrySync: (encounterId: string) => void;
  onUpdateEncounter: (encounterId: string, updates: Partial<Encounter>) => void;
  onViewImage: (dataUrl: string) => void;
}

type FilterTab = 'today' | 'month' | 'attention';

export const EncounterList: React.FC<EncounterListProps> = ({
  encounters,
  imageBlobs,
  onRetrySync,
  onUpdateEncounter,
  onViewImage,
}) => {
  const [activeTab, setActiveTab] = useState<FilterTab>('today');

  const todayStr = new Date().toISOString().split('T')[0];

  const todayEncounters = encounters.filter((e) => e.serviceDate === todayStr);
  const attentionEncounters = encounters.filter(
    (e) => e.syncStatus !== 'SYNCED' || e.patientMatchStatus === 'MANUAL_REVIEW'
  );

  const displayedEncounters =
    activeTab === 'today'
      ? todayEncounters
      : activeTab === 'attention'
      ? attentionEncounters
      : encounters;

  const todaySyncedCount = todayEncounters.filter((e) => e.syncStatus === 'SYNCED').length;

  return (
    <div className="max-w-lg mx-auto px-4 pb-20">
      {/* Daily Summary Card */}
      <div className="mb-4 bg-slate-900/60 rounded-2xl p-3.5 border border-slate-800 flex items-center justify-between">
        <div>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Today's Activity
          </span>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-xl font-bold text-slate-100">
              {todayEncounters.length}
            </span>
            <span className="text-xs text-slate-400">
              {todayEncounters.length === 1 ? 'patient capture' : 'patient captures'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700/80 text-xs font-medium">
            {todaySyncedCount === todayEncounters.length && todayEncounters.length > 0 ? (
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Clock className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="text-slate-300">
              {todaySyncedCount} / {todayEncounters.length} Synced
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl bg-slate-900 p-1 border border-slate-800 mb-3 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('today')}
          className={`flex-1 py-1.5 rounded-lg transition-colors ${
            activeTab === 'today'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Today ({todayEncounters.length})
        </button>
        <button
          onClick={() => setActiveTab('month')}
          className={`flex-1 py-1.5 rounded-lg transition-colors ${
            activeTab === 'month'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          This Month ({encounters.length})
        </button>
        <button
          onClick={() => setActiveTab('attention')}
          className={`flex-1 py-1.5 rounded-lg transition-colors relative ${
            activeTab === 'attention'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Attention</span>
          {attentionEncounters.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 text-[10px] border border-amber-500/40">
              {attentionEncounters.length}
            </span>
          )}
        </button>
      </div>

      {/* Encounters List */}
      <div className="space-y-2.5">
        {displayedEncounters.length === 0 ? (
          <div className="text-center py-10 px-4 rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 text-slate-500 text-xs">
            {activeTab === 'today'
              ? 'No captures yet today. Tap the green camera button above to capture a patient sticker.'
              : activeTab === 'attention'
              ? 'All encounters are backed up and healthy. Zero attention items.'
              : 'No billing records found.'}
          </div>
        ) : (
          displayedEncounters.map((enc) => (
            <EncounterCard
              key={enc.id}
              encounter={enc}
              imageBlob={imageBlobs[enc.imageBlobId]}
              onRetrySync={onRetrySync}
              onUpdateEncounter={onUpdateEncounter}
              onViewImage={onViewImage}
            />
          ))
        )}
      </div>
    </div>
  );
};
