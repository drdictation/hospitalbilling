import React, { useRef, useState } from 'react';
import { Camera, Check, Plus, X, Calendar, Sparkles } from 'lucide-react';
import type { AppSettings, CompressedImageResult } from '../types';
import { compressStickerImage } from '../utils/imageCompressor';

interface CaptureSectionProps {
  settings: AppSettings | null;
  onSaveEncounter: (data: {
    serviceDate: string;
    hospital: string;
    mbsCodes: string[];
    compressedImage: CompressedImageResult;
    notes?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  isSyncing: boolean;
}

export const CaptureSection: React.FC<CaptureSectionProps> = ({
  settings,
  onSaveEncounter,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [compressedImage, setCompressedImage] = useState<CompressedImageResult | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [serviceDate, setServiceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedCodes, setSelectedCodes] = useState<string[]>(['116']); // default to 116 (subsequent consult)
  const [customCodeInput, setCustomCodeInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessNotification, setSaveSuccessNotification] = useState<string | null>(null);

  // Trigger native camera
  const handleTriggerCamera = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Handle image capture
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressing(true);
      const result = await compressStickerImage(file);
      setCompressedImage(result);
    } catch (err: any) {
      alert(`Error compressing photo: ${err.message || err}`);
    } finally {
      setIsCompressing(false);
      // Reset file input so re-taking photo works
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Toggle MBS Code selection (allows multiple)
  const handleToggleCode = (code: string) => {
    setSelectedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  // Add custom manual MBS code
  const handleAddCustomCode = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customCodeInput.trim().toUpperCase();
    if (clean && !selectedCodes.includes(clean)) {
      setSelectedCodes((prev) => [...prev, clean]);
      setCustomCodeInput('');
      setShowCustomInput(false);
    }
  };

  // Save Encounter Locally
  const handleSave = async () => {
    if (!compressedImage) {
      alert('Please photograph a patient sticker first.');
      return;
    }
    if (selectedCodes.length === 0) {
      alert('Please select at least one MBS code.');
      return;
    }

    try {
      setIsSaving(true);
      const currentHospital = settings?.defaultHospital || "St Vincent's Private Hospital";

      const res = await onSaveEncounter({
        serviceDate,
        hospital: currentHospital,
        mbsCodes: selectedCodes,
        compressedImage,
        notes: notes.trim() ? notes.trim() : undefined,
      });

      if (res.success) {
        // Visual confirmation of local write
        setSaveSuccessNotification(`Persisted locally in <50ms. Syncing in background...`);
        setTimeout(() => setSaveSuccessNotification(null), 3500);

        // Reset capture form for next patient (maintains default 116 for speed)
        setCompressedImage(null);
        setSelectedCodes(['116']);
        setNotes('');
      } else {
        alert(`Failed to save locally: ${res.error}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const presets = settings?.mbsPresets || [];

  return (
    <section className="p-4 max-w-lg mx-auto">
      {/* Hidden native camera input: capture="environment" launches the rear camera directly on iOS */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Success Notification Flash */}
      {saveSuccessNotification && (
        <div className="mb-3 px-3 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top duration-200">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>{saveSuccessNotification}</span>
        </div>
      )}

      {/* Step 1: Camera Trigger or Image Preview */}
      {!compressedImage ? (
        <button
          type="button"
          onClick={handleTriggerCamera}
          disabled={isCompressing}
          className="w-full relative overflow-hidden group bg-gradient-to-br from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 active:scale-[0.98] text-white p-5 rounded-2xl shadow-lg shadow-emerald-950/40 border border-emerald-500/30 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer"
        >
          <div className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center backdrop-blur-sm group-hover:scale-110 transition-transform">
            <Camera className="w-7 h-7 text-white" />
          </div>
          <span className="text-base font-bold tracking-tight">
            {isCompressing ? 'Processing Photo...' : 'SNAP PATIENT STICKER'}
          </span>
          <span className="text-xs text-emerald-100/80 font-normal">
            Launches native iPhone camera directly
          </span>
        </button>
      ) : (
        <div className="relative rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-900 shadow-md">
          <img
            src={compressedImage.dataUrl}
            alt="Captured Sticker Preview"
            className="w-full max-h-48 object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent flex items-end justify-between p-3">
            <div className="text-[11px] text-slate-300 font-mono">
              <span>{Math.round(compressedImage.sizeBytes / 1024)} KB</span> •{' '}
              <span>{compressedImage.width}×{compressedImage.height}</span>
            </div>
            <button
              onClick={handleTriggerCamera}
              className="px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-600/80 flex items-center gap-1.5 backdrop-blur-sm transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Retake</span>
            </button>
          </div>
        </div>
      )}

      {/* Capture Details Form */}
      <div className="mt-4 bg-slate-900/80 rounded-2xl p-4 border border-slate-800/90 shadow-sm space-y-4">
        {/* Date Selector */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <span>Service Date</span>
          </div>
          <input
            type="date"
            value={serviceDate}
            onChange={(e) => setServiceDate(e.target.value)}
            className="bg-slate-800 text-slate-200 text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-700 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* MBS Code Quick Selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              MBS Item Numbers
            </span>
            <span className="text-[11px] text-slate-400">
              {selectedCodes.length > 0 ? `${selectedCodes.length} selected` : 'Select code'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {presets.map((preset) => {
              const isSelected = selectedCodes.includes(preset.code);
              return (
                <button
                  key={preset.code}
                  type="button"
                  onClick={() => handleToggleCode(preset.code)}
                  className={`p-2.5 rounded-xl border text-left transition-all active:scale-[0.97] cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-emerald-600/20 border-emerald-500/80 text-emerald-200 shadow-sm shadow-emerald-950'
                      : 'bg-slate-800/70 hover:bg-slate-800 border-slate-700/60 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold tracking-tight">
                      MBS {preset.code}
                    </span>
                    {isSelected && <Check className="w-4 h-4 text-emerald-400" />}
                  </div>
                  <span className="text-[11px] text-slate-400 truncate mt-0.5">
                    {preset.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Custom Codes & Selected Badges */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {selectedCodes
              .filter((code) => !presets.some((p) => p.code === code))
              .map((custom) => (
                <span
                  key={custom}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600/30 border border-emerald-500/70 text-emerald-200 text-xs font-bold"
                >
                  MBS {custom}
                  <X
                    className="w-3.5 h-3.5 cursor-pointer hover:text-emerald-100"
                    onClick={() => handleToggleCode(custom)}
                  />
                </span>
              ))}

            {showCustomInput ? (
              <form onSubmit={handleAddCustomCode} className="inline-flex items-center gap-1">
                <input
                  type="text"
                  placeholder="e.g. 132"
                  value={customCodeInput}
                  onChange={(e) => setCustomCodeInput(e.target.value)}
                  autoFocus
                  className="w-20 px-2 py-1 text-xs bg-slate-800 border border-emerald-500 rounded-lg text-slate-100 focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-2 py-1 bg-emerald-600 text-white rounded-lg text-xs font-semibold"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setShowCustomInput(false)}
                  className="p-1 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowCustomInput(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Other MBS Code</span>
              </button>
            )}
          </div>
        </div>

        {/* Optional Clinical Note */}
        <div>
          <input
            type="text"
            placeholder="Optional quick note (e.g. Bed 4, Dr Smith refer)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-slate-800/60 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Big Save Button */}
        <button
          type="button"
          onClick={handleSave}
          disabled={!compressedImage || selectedCodes.length === 0 || isSaving}
          className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm tracking-tight transition-all flex items-center justify-center gap-2 ${
            compressedImage && selectedCodes.length > 0 && !isSaving
              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-950 active:scale-[0.98] cursor-pointer'
              : 'bg-slate-800 text-slate-500 border border-slate-700/50 cursor-not-allowed'
          }`}
        >
          <Check className="w-4 h-4" />
          <span>
            {isSaving
              ? 'Persisting Locally...'
              : !compressedImage
              ? '1. Take Photo First'
              : selectedCodes.length === 0
              ? '2. Select MBS Code'
              : 'SAVE ENCOUNTER LOCALLY'}
          </span>
        </button>
      </div>
    </section>
  );
};
