import { 
  Building2, 
  Wifi, 
  WifiOff, 
  AlertTriangle, 
  CheckCircle2, 
  Settings, 
  RefreshCw,
  ChevronDown,
  FileSpreadsheet
} from 'lucide-react';
import type { AppSettings } from '../types';

interface HeaderProps {
  settings: AppSettings | null;
  onUpdateHospital: (hospital: string) => void;
  onOpenSettings: () => void;
  onOpenReconciliation: () => void;
  onOpenExport?: () => void;
  unsyncedCount: number;
  isSyncing: boolean;
  onRetrySync: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  onUpdateHospital,
  onOpenSettings,
  onOpenReconciliation,
  onOpenExport,
  unsyncedCount,
  isSyncing,
  onRetrySync,
}) => {
  const isOnline = navigator.onLine && !settings?.offlineSimulation;

  return (
    <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 pt-safe px-4 pb-3">
      {/* Top row: Brand + Network + Actions */}
      <div className="flex items-center justify-between gap-2 max-w-lg mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm">
            HB
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-100 tracking-tight leading-none">
              Hospital Billing
            </h1>
            <span className="text-[11px] text-slate-400">Local-First Capture</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Export Monthly Billing Button */}
          {onOpenExport && (
            <button
              onClick={onOpenExport}
              title="Export Monthly Billing (.docx)"
              className="p-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span className="text-[11px] font-bold hidden sm:inline">Export</span>
            </button>
          )}

          {/* Network Pill */}
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border ${
              settings?.offlineSimulation
                ? 'bg-amber-950/60 border-amber-800/80 text-amber-300'
                : isOnline
                ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-300'
                : 'bg-rose-950/50 border-rose-800/60 text-rose-300'
            }`}
          >
            {settings?.offlineSimulation ? (
              <>
                <WifiOff className="w-3 h-3" />
                <span>Simulated Offline</span>
              </>
            ) : isOnline ? (
              <>
                <Wifi className="w-3 h-3" />
                <span>Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3" />
                <span>Offline</span>
              </>
            )}
          </div>

          {/* Audit / Reconciliation Button */}
          <button
            onClick={onOpenReconciliation}
            title="Reconciliation & Audit"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          {/* Settings Button */}
          <button
            onClick={onOpenSettings}
            title="Settings & Google Drive"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Hospital Sticky Selector */}
      <div className="mt-2.5 max-w-lg mx-auto">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/70">
          <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] uppercase font-semibold text-slate-400 block leading-tight tracking-wider">
              Current Hospital (Sticky)
            </span>
            <select
              value={settings?.defaultHospital || ''}
              onChange={(e) => onUpdateHospital(e.target.value)}
              aria-label="Current Hospital Selection"
              className="w-full bg-transparent text-xs font-medium text-slate-100 focus:outline-none truncate cursor-pointer"
            >
              {settings?.hospitals.map((h) => (
                <option key={h} value={h} className="bg-slate-900 text-slate-200">
                  {h}
                </option>
              ))}
            </select>
          </div>
          <ChevronDown className="w-4 h-4 text-slate-400 pointer-events-none shrink-0" />
        </div>
      </div>

      {/* Critical Unsynced Warning Banner */}
      {unsyncedCount > 0 && (
        <div className="mt-2.5 max-w-lg mx-auto">
          {settings?.googleTokenExpiresAt && Date.now() > settings.googleTokenExpiresAt ? (
            <div
              onClick={onOpenSettings}
              className="flex items-center justify-between px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 cursor-pointer hover:bg-rose-500/25 transition-all shadow-sm shadow-rose-950/50"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 animate-pulse shrink-0" />
                <span className="text-xs font-semibold tracking-tight">
                  Drive session expired ({unsyncedCount} pending)
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenSettings();
                }}
                className="text-[11px] font-bold uppercase tracking-wider bg-rose-500/30 hover:bg-rose-500/40 text-rose-200 px-2 py-0.5 rounded border border-rose-500/40 transition-colors"
              >
                Reconnect
              </button>
            </div>
          ) : (
            <div 
              onClick={onRetrySync}
              className="flex items-center justify-between px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 cursor-pointer hover:bg-amber-500/25 transition-all shadow-sm shadow-amber-950/50"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
                <span className="text-xs font-semibold tracking-tight">
                  {unsyncedCount} {unsyncedCount === 1 ? 'ENCOUNTER' : 'ENCOUNTERS'} NOT SYNCED
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRetrySync();
                }}
                disabled={isSyncing}
                className="text-[11px] font-bold uppercase tracking-wider bg-amber-500/30 hover:bg-amber-500/40 text-amber-200 px-2 py-0.5 rounded border border-amber-500/40 transition-colors"
              >
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* All Synced Indicator */}
      {unsyncedCount === 0 && (
        <div className="mt-1.5 max-w-lg mx-auto flex items-center justify-end gap-1 text-[11px] text-emerald-400/90 font-medium">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>All encounters backed up locally & remotely</span>
        </div>
      )}
    </header>
  );
};
