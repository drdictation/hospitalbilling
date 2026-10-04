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
  RefreshCw,
  CheckSquare,
  Square,
  RotateCcw
} from 'lucide-react';
import type { Encounter, ImageBlob, Patient } from '../types';
import { 
  validateBillingEncounters, 
  executeMonthlyBillingExport,
  formatDocxDate
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

interface PatientExportItem {
  key: string;
  name: string;
  mrn: string;
  hospital: string;
  encounters: Encounter[];
  isFullyExported: boolean;
  unbilledCount: number;
  formattedDates: string[];
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
  const [filterMode, setFilterMode] = useState<'current_month' | 'all'>('current_month');
  
  // Check if any unbilled encounters exist
  const hasUnbilled = useMemo(() => {
    return encounters.some((e) => e.billingStatus !== 'EXPORTED');
  }, [encounters]);

  // If no unbilled encounters exist, default includeExported to true so the user is never locked out
  const [includeExported, setIncludeExported] = useState<boolean>(() => !hasUnbilled && encounters.length > 0);
  
  // Track explicitly deselected keys so visible patients are selected by default without useEffect cascades
  const [deselectedPatientKeys, setDeselectedPatientKeys] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccessInfo, setExportSuccessInfo] = useState<{
    fileName: string;
    driveUploaded: boolean;
  } | null>(null);

  const currentDate = new Date();
  const currentMonthPrefix = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  // 1. Filter encounters by date and export status
  const candidateEncounters = useMemo(() => {
    return encounters.filter((e) => {
      if (!includeExported && e.billingStatus === 'EXPORTED') {
        return false;
      }
      if (filterMode === 'current_month') {
        return e.serviceDate.startsWith(currentMonthPrefix);
      }
      return true;
    });
  }, [encounters, filterMode, includeExported, currentMonthPrefix]);

  // 2. Group candidate encounters by patient for individual selection
  const patientGroups = useMemo<PatientExportItem[]>(() => {
    const map = new Map<string, PatientExportItem>();

    for (const enc of candidateEncounters) {
      const key = enc.patientId || enc.extractedData?.mrn || enc.id;
      if (!map.has(key)) {
        const pat = enc.patientId && patients[enc.patientId] ? patients[enc.patientId] : undefined;
        map.set(key, {
          key,
          name: pat?.name || enc.extractedData?.patientName || 'UNIDENTIFIED PATIENT',
          mrn: pat?.mrn || enc.extractedData?.mrn || 'N/A',
          hospital: pat?.primaryHospital || enc.hospital,
          encounters: [],
          isFullyExported: true,
          unbilledCount: 0,
          formattedDates: [],
        });
      }

      const item = map.get(key)!;
      item.encounters.push(enc);
      if (enc.billingStatus !== 'EXPORTED') {
        item.isFullyExported = false;
        item.unbilledCount += 1;
      }
      const formattedDate = formatDocxDate(enc.serviceDate);
      if (!item.formattedDates.includes(formattedDate)) {
        item.formattedDates.push(formattedDate);
      }
    }

    // Sort by name alphabetically
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [candidateEncounters, patients]);

  // Encounters specifically selected by the doctor for export
  const selectedEncounters = useMemo(() => {
    const selected: Encounter[] = [];
    for (const group of patientGroups) {
      if (!deselectedPatientKeys.has(group.key)) {
        selected.push(...group.encounters);
      }
    }
    return selected;
  }, [patientGroups, deselectedPatientKeys]);

  const selectedPatientCount = useMemo(() => {
    return patientGroups.filter((p) => !deselectedPatientKeys.has(p.key)).length;
  }, [patientGroups, deselectedPatientKeys]);

  // Validation report on the selected encounters
  const validation = useMemo(() => {
    return validateBillingEncounters(selectedEncounters, patients);
  }, [selectedEncounters, patients]);

  if (!isOpen) return null;

  const togglePatientSelection = (key: string) => {
    setDeselectedPatientKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAll = () => {
    setDeselectedPatientKeys(new Set());
  };

  const deselectAll = () => {
    setDeselectedPatientKeys(new Set(patientGroups.map((p) => p.key)));
  };

  const handleRunExport = async () => {
    if (selectedEncounters.length === 0) {
      alert('Please select at least one patient to export.');
      return;
    }

    try {
      setIsExporting(true);
      const res = await executeMonthlyBillingExport(
        selectedEncounters,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
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
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
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

              <div className="pt-4 flex gap-2 justify-center">
                <button
                  onClick={() => setExportSuccessInfo(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Export Another</span>
                </button>
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
              {/* Filter Controls */}
              <div className="space-y-2">
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
                    onClick={() => setFilterMode('all')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      filterMode === 'all'
                        ? 'bg-slate-700 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All Dates
                  </button>
                </div>

                {/* Include Already Exported Checkbox Toggle */}
                <label className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-800/40 border border-slate-800 cursor-pointer hover:bg-slate-800/60 transition-colors">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeExported}
                      onChange={(e) => setIncludeExported(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-slate-300 font-medium text-xs">
                      Include already exported patients (Re-export / Re-download)
                    </span>
                  </div>
                  {includeExported && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                      Re-export Enabled
                    </span>
                  )}
                </label>
              </div>

              {/* Patient Selection Header */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-emerald-400" />
                  <span className="font-semibold text-slate-200 text-xs">
                    Choose Patients to Export ({selectedPatientCount} of {patientGroups.length} selected)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 underline-offset-2 hover:underline"
                  >
                    Select All
                  </button>
                  <span className="text-slate-600">•</span>
                  <button
                    type="button"
                    onClick={deselectAll}
                    className="text-[11px] font-semibold text-slate-400 hover:text-slate-300 underline-offset-2 hover:underline"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Patient Selection List */}
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 -mr-1">
                {patientGroups.length === 0 ? (
                  <div className="p-6 text-center rounded-xl bg-slate-800/40 border border-slate-800 text-slate-400 space-y-2">
                    <p>No encounters match the selected filter.</p>
                    {!includeExported && (
                      <button
                        type="button"
                        onClick={() => setIncludeExported(true)}
                        className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 underline"
                      >
                        Show previously exported encounters
                      </button>
                    )}
                  </div>
                ) : (
                  patientGroups.map((pat) => {
                    const isSelected = !deselectedPatientKeys.has(pat.key);
                    return (
                      <div
                        key={pat.key}
                        onClick={() => togglePatientSelection(pat.key)}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-slate-800/90 border-emerald-500/50 shadow-sm'
                            : 'bg-slate-800/30 border-slate-800/80 opacity-60 hover:opacity-90'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-500 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-slate-100 truncate text-xs">
                              {pat.name}
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-1.5 truncate">
                              <span>UR: {pat.mrn}</span>
                              <span>•</span>
                              <span>{pat.hospital}</span>
                              <span>•</span>
                              <span className="text-slate-300 font-medium">
                                {pat.formattedDates.join(', ')}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-1.5">
                          {pat.isFullyExported ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 border border-slate-600 font-medium">
                              Exported ({pat.encounters.length})
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                              {pat.unbilledCount} Unbilled
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Summary Metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                      Patients Selected
                    </span>
                    <span className="text-base font-bold text-slate-100">
                      {validation.totalPatients}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                      Total Encounters
                    </span>
                    <span className="text-base font-bold text-slate-100">
                      {validation.totalEncounters}
                    </span>
                  </div>
                </div>
              </div>

              {/* Pre-Export Integrity Audit */}
              {selectedEncounters.length > 0 && (
                <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Pre-Export Integrity Check
                  </div>

                  {validation.unverifiedCount > 0 ? (
                    <div className="flex items-start gap-2 p-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold">{validation.unverifiedCount} encounter(s)</span> need patient review.
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>All selected encounters have verified patient details.</span>
                    </div>
                  )}

                  {validation.duplicateWarnings.length > 0 && (
                    <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] space-y-1">
                      <div className="font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Potential Duplicate Claims:</span>
                      </div>
                      {validation.duplicateWarnings.map((w, i) => (
                        <div key={i} className="text-amber-200/90 pl-5">
                          • {w}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Document Layout Preview Details */}
              <div className="bg-slate-800/20 p-2.5 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Compilation Highlights:</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-slate-400">
                  <li>Dates formatted in unambiguous <strong>Day - Month - Year</strong> (e.g. 04 - October - 2026)</li>
                  <li>Proportional patient sticker photo embedding (zero squashing)</li>
                  <li>Itemized MBS code claims and clinical notes table</li>
                </ul>
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={handleRunExport}
                disabled={isExporting || selectedEncounters.length === 0}
                className={`w-full py-3.5 px-4 rounded-xl font-bold text-xs tracking-tight transition-all flex items-center justify-center gap-2 ${
                  selectedEncounters.length > 0 && !isExporting
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
                      {selectedEncounters.length === 0
                        ? 'Select at least 1 patient to export'
                        : `Generate & Download Billing .DOCX (${selectedEncounters.length} encounters • ${selectedPatientCount} patients)`}
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
