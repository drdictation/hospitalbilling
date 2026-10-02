import React, { useState } from 'react';
import { 
  X, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  Database, 
  Cloud 
} from 'lucide-react';
import type { AuditLog, Encounter } from '../types';
import { performReconciliation, type DriveReconciliationReport } from '../services/googleDrive';
import { logAudit } from '../db';

interface ReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  localEncounters: Encounter[];
  auditLogs: AuditLog[];
  googleAccessToken?: string;
  onSyncPending: () => void;
}

export const ReconciliationModal: React.FC<ReconciliationModalProps> = ({
  isOpen,
  onClose,
  localEncounters,
  auditLogs,
  googleAccessToken,
  onSyncPending,
}) => {
  const [report, setReport] = useState<DriveReconciliationReport | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRunAudit = async () => {
    if (!googleAccessToken) {
      setAuditError('Google Drive is not connected. Connect in Settings first.');
      return;
    }

    try {
      setIsAuditing(true);
      setAuditError(null);
      const rep = await performReconciliation(googleAccessToken, localEncounters, new Date());
      setReport(rep);
      await logAudit('RECONCILIATION_RUN', undefined, rep);
    } catch (err: any) {
      setAuditError(err?.message || 'Reconciliation failed');
    } finally {
      setIsAuditing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-slate-100">
              Reconciliation & Integrity Audit
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-700/60 flex items-center justify-center text-slate-300">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-400">
                  IndexedDB Local
                </span>
                <div className="text-lg font-bold text-slate-100">
                  {localEncounters.length} records
                </div>
              </div>
            </div>

            <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-700/60 flex items-center justify-center text-slate-300">
                <Cloud className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-400">
                  Drive Status
                </span>
                <div className="text-lg font-bold text-slate-100">
                  {report ? `${report.totalRemote} records` : googleAccessToken ? 'Connected' : 'Not Connected'}
                </div>
              </div>
            </div>
          </div>

          {/* Audit Action Banner */}
          <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-200">
                  Two-Way Store Verification
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Verifies that every local UUID exists on Google Drive, and identifies any missing files.
                </p>
              </div>
              <button
                onClick={handleRunAudit}
                disabled={isAuditing}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors flex items-center gap-1.5 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isAuditing ? 'animate-spin' : ''}`} />
                <span>{isAuditing ? 'Auditing...' : 'Run Audit'}</span>
              </button>
            </div>

            {auditError && (
              <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{auditError}</span>
              </div>
            )}

            {/* Audit Results */}
            {report && (
              <div className="mt-3 pt-3 border-t border-slate-700/60 space-y-2">
                <div className="flex items-center justify-between font-medium">
                  <span className="text-slate-300">Audit Status:</span>
                  {report.isClean ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 100% IN SYNC
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-400 font-bold">
                      <AlertTriangle className="w-3.5 h-3.5" /> DISCREPANCIES DETECTED
                    </span>
                  )}
                </div>

                <div className="space-y-1 text-[11px] text-slate-400">
                  <div>Synced: {report.syncedCount} encounters</div>
                  {report.localOnlyIds.length > 0 && (
                    <div className="text-amber-400 font-semibold flex items-center justify-between">
                      <span>Local only (needs upload): {report.localOnlyIds.length}</span>
                      <button
                        onClick={onSyncPending}
                        className="underline hover:text-amber-300"
                      >
                        Upload Now
                      </button>
                    </div>
                  )}
                  {report.remoteOnlyIds.length > 0 && (
                    <div className="text-sky-400">
                      Remote only (on Drive, not on phone): {report.remoteOnlyIds.length}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Audit Log Timeline */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-2">
              <FileText className="w-4 h-4 text-slate-400" />
              <span>Internal Audit Log (Last 15 Events)</span>
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1.5 rounded-xl bg-slate-950/80 p-2.5 border border-slate-800 font-mono text-[10px]">
              {auditLogs.length === 0 ? (
                <div className="text-slate-500 py-3 text-center">No audit entries yet.</div>
              ) : (
                auditLogs.slice(0, 15).map((log) => (
                  <div
                    key={log.id}
                    className="p-1.5 rounded bg-slate-900 border border-slate-850 flex items-start justify-between gap-2"
                  >
                    <div>
                      <span className="text-emerald-400 font-semibold">{log.action}</span>
                      {log.encounterId && (
                        <span className="text-slate-400 ml-1.5">
                          id: {log.encounterId.slice(0, 8)}...
                        </span>
                      )}
                    </div>
                    <span className="text-slate-500 shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
