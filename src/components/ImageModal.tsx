import React from 'react';
import { X, ZoomIn } from 'lucide-react';

interface ImageModalProps {
  imageUrl: string | null;
  onClose: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({ imageUrl, onClose }) => {
  if (!imageUrl) return null;

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/90 backdrop-blur-md animate-in fade-in"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="relative max-w-lg w-full max-h-[90vh] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 flex flex-col shadow-2xl"
      >
        <div className="flex items-center justify-between p-3 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <ZoomIn className="w-4 h-4 text-emerald-400" />
            <span>High-Resolution Sticker View</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-2 overflow-auto flex items-center justify-center bg-black">
          <img
            src={imageUrl}
            alt="Full patient sticker"
            className="max-h-[75vh] w-auto object-contain rounded-lg"
          />
        </div>

        <div className="p-3 border-t border-slate-800 text-center text-[11px] text-slate-400">
          Original photograph retained with uncompressed clinical fidelity
        </div>
      </div>
    </div>
  );
};
