import React, { useState, useMemo } from 'react';
import { 
  X, 
  FileSpreadsheet, 
  Download, 
  AlertTriangle, 
  CheckCircle2, 
  Cloud, 
  Users, 
  Calendar,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import type { Encounter, ImageBlob, Patient } from '../types';
import { 
  validateBillingEncounters, 
  executeMonthlyBillingExport 
} from '../services/billingExporter';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  encounters: Encounter[];
  patients: Record<string, Patient>;
  imageBlobs: Record<string, ImageBlob>;
  googleAccessToken?: string;
  onExportComplete?: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  encounters,
  patients,
  imageBlobs,
  googleAccessToken,
  onExportComplete,
}) => {
  const [filterMode, setFilterMode] = useState<'current_month' | 'unbilled_all'>('current_month');
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccessInfo, setExportSuccessInfo] = useState<{
    fileName: string;
    driveUploaded: boolean;
  } | null>(null);

  const currentDate = new Date();
  const currentMonthPrefix = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Filter encounters for billing
  const eligibleEncounters = useMemo(() => {
    return encounters.filter((e) => {
      if (e.billingStatus === 'EXPORTED') return false;
      if (filterMode === 'current_month') {
        return e.serviceDate.startsWith(currentMonthPrefix);
      }
      return true;
    });
  }, [encounters, filterMode, currentMonthPrefix]);

  // Validation report
  const validation = useMemo(() => {
    return validateBillingEncounters(eligibleEncounters, patients);
  }, [eligibleEncounters, patients]);

  if (!isOpen) return null;

  const handleRunExport = async () => {
    if (eligibleEncounters.length === 0) {
      alert('No unbilled encounters found for this period.');
      return;
    }

    try {
      setIsExporting(true);
      const res = await executeMonthlyBillingExport(
        eligibleEncounters,
        patients,
        imageBlobs,
        monthName,
        googleAccessToken
      );

      setExportSuccessInfo({
        fileName: `Billing_Export_${monthName.replace(/\s+/g, '_')}.docx`,
        driveUploaded: Boolean(res.driveFileId),
      });

      if (onExportComplete) onExportComplete();
    } catch (err: any) {
      console.error('Export error:', err);
      alert(`Export failed: ${err.message || err}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-slate-100">Monthly Billing Export</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {exportSuccessInfo ? (
            <div className="py-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-100">
                Billing Export Completed!
              </h3>
              <p className="text-slate-400 text-xs max-w-sm mx-auto">
                Downloaded document <span className="text-emerald-300 font-mono font-semibold">{exportSuccessInfo.fileName}</span> to your device.
              </p>

              {exportSuccessInfo.driveUploaded ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Also archived to Google Drive (exports folder)</span>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">
                  (Google Drive not connected — saved locally on phone)
                </p>
              )}

              <div className="pt-4">
                <button
                  onClick={onClose}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Filter Selector */}
              <div className="flex rounded-xl bg-slate-800/80 p-1 border border-slate-700/80">
                <button
                  type="button"
                  onClick={() => setFilterMode('current_month')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filterMode === 'current_month'
                      ? 'bg-slate-700 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {monthName} (Current Month)
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('unbilled_all')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filterMode === 'unbilled_all'
                      ? 'bg-slate-700 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All Unbilled Encounters
                </button>
              </div>

              {/* Summary Metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                      Patients Grouped
                    </span>
                    <span className="text-lg font-bold text-slate-100">
                      {validation.totalPatients}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/60 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                      Total Encounters
                    </span>
                    <span className="text-lg font-bold text-slate-100">
                      {validation.totalEncounters}
                    </span>
                  </div>
                </div>
              </div>

              {/* Pre-Export Integrity Audit */}
              <div className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-800 space-y-2">
                <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                  Pre-Export Integrity Check
                </div>

                {validation.unverifiedCount > 0 ? (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">{validation.unverifiedCount} encounter(s)</span> are unverified or need patient review. You can still export, but check the "Needs Attention" tab first.
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>All encounters have identified patient records.</span>
                  </div>
                )}

                {validation.duplicateWarnings.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] space-y-1">
                    <div className="font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>Potential Duplicate Claims Flagged:</span>
                    </div>
                    {validation.duplicateWarnings.map((w, i) => (
                      <div key={i} className="text-amber-200/90 pl-5">
                        • {w}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Document Layout Preview Details */}
              <div className="bg-slate-800/20 p-3 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 space-y-1.5">
                <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Compilation Format (Australian Standard):</span>
                </div>
                <ul className="list-disc list-inside space-y-1 leading-relaxed text-slate-400">
                  <li>Header: <strong>A-Prof C. Basnayake</strong> Inpatient Gastroenterology Billing</li>
                  <li>1 dedicated section per patient with embedded <strong>sticker photo</strong></li>
                  <li>Itemized table: Service Date, Hospital, MBS Codes, Notes</li>
                  <li>Directly compatible with Microsoft Word & billing agent software</li>
                </ul>
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={handleRunExport}
                disabled={isExporting || eligibleEncounters.length === 0}
                className={`w-full py-3.5 px-4 rounded-xl font-bold text-xs tracking-tight transition-all flex items-center justify-center gap-2 ${
                  eligibleEncounters.length > 0 && !isExporting
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-950 active:scale-[0.98] cursor-pointer'
                    : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed'
                }`}
              >
                {isExporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Compiling Billing Document...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>
                      {eligibleEncounters.length === 0
                        ? 'No Encounters to Export'
                        : `Generate & Download Billing .DOCX (${eligibleEncounters.length} encounters)`}
                    </span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
