import React, { useState } from 'react';
import { 
  X, 
  Settings, 
  Cloud, 
  Building2, 
  WifiOff, 
  Check, 
  AlertCircle, 
  Plus, 
  Trash2,
  Lock,
  KeyRound,
  HelpCircle,
  ExternalLink
} from 'lucide-react';
import type { AppSettings } from '../types';
import { ensureMonthlyFolderHierarchy } from '../services/googleDrive';

// Declare Google global for Google Identity Services
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: any; expires_in?: number }) => void;
          }) => {
            requestAccessToken: () => void;
          };
        };
      };
    };
  }
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings | null;
  onUpdateSettings: (updates: Partial<AppSettings>) => Promise<void>;
  localEncountersCount?: number;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  const [clientIdInput, setClientIdInput] = useState(settings?.googleClientId || '');
  const [tokenInput, setTokenInput] = useState(settings?.googleAccessToken || '');
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isTestingToken, setIsTestingToken] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  const [newHospitalName, setNewHospitalName] = useState('');

  if (!isOpen || !settings) return null;

  // Handle saving Google Client ID
  const handleSaveClientId = async () => {
    const cleanId = clientIdInput.trim();
    await onUpdateSettings({ googleClientId: cleanId });
    setTestResult({ ok: true, message: 'Google Client ID saved.' });
  };

  // One-tap Google Sign-in popup via Google Identity Services
  const handleGoogleSignIn = () => {
    const activeClientId = clientIdInput.trim() || settings.googleClientId;
    if (!activeClientId) {
      setTestResult({
        ok: false,
        message: 'Please provide a Google OAuth Client ID first (see setup instructions below).',
      });
      return;
    }

    if (!window.google?.accounts?.oauth2) {
      setTestResult({
        ok: false,
        message: 'Google Identity Services script is loading. Please check internet connection or retry.',
      });
      return;
    }

    try {
      setIsAuthorizing(true);
      setTestResult(null);

      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: activeClientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: async (res) => {
          setIsAuthorizing(false);
          if (res.error) {
            setTestResult({
              ok: false,
              message: `Google authorization cancelled or failed: ${res.error}`,
            });
            return;
          }

          if (res.access_token) {
            const token = res.access_token;
            setTokenInput(token);
            const expiresAt = Date.now() + (res.expires_in || 3600) * 1000;

            try {
              // Immediately test and verify folder structure
              const hierarchy = await ensureMonthlyFolderHierarchy(token, new Date());
              await onUpdateSettings({
                googleAccessToken: token,
                googleTokenExpiresAt: expiresAt,
                googleDriveConnected: true,
                driveFolderId: hierarchy.rootId,
                googleClientId: activeClientId,
              });
              setTestResult({
                ok: true,
                message: `Connected successfully! Folder verified: "Private Hospital Billing/${new Date().getFullYear()}".`,
              });
            } catch (err: any) {
              setTestResult({
                ok: false,
                message: `Token received, but Drive folder check failed: ${err.message}`,
              });
            }
          }
        },
      });

      client.requestAccessToken();
    } catch (err: any) {
      setIsAuthorizing(false);
      setTestResult({
        ok: false,
        message: `Failed to initialize Google Sign-In: ${err.message}`,
      });
    }
  };

  const handleSaveTokenManual = async () => {
    const cleanToken = tokenInput.trim();
    await onUpdateSettings({
      googleAccessToken: cleanToken ? cleanToken : undefined,
      googleDriveConnected: Boolean(cleanToken),
      googleTokenExpiresAt: cleanToken ? Date.now() + 3600 * 1000 : undefined,
    });
    setTestResult(null);
  };

  const handleTestDriveConnection = async () => {
    const tokenToTest = tokenInput.trim() || settings.googleAccessToken;
    if (!tokenToTest) {
      setTestResult({ ok: false, message: 'Please connect Google Drive or paste an access token first.' });
      return;
    }

    try {
      setIsTestingToken(true);
      setTestResult(null);
      const hierarchy = await ensureMonthlyFolderHierarchy(tokenToTest, new Date());
      setTestResult({
        ok: true,
        message: `Connection confirmed! Folder "Private Hospital Billing/${new Date().getFullYear()}" is accessible.`,
      });
      await onUpdateSettings({
        googleAccessToken: tokenToTest,
        googleDriveConnected: true,
        driveFolderId: hierarchy.rootId,
      });
    } catch (err: any) {
      setTestResult({
        ok: false,
        message: `Connection test failed: ${err.message || err}`,
      });
    } finally {
      setIsTestingToken(false);
    }
  };

  const handleAddHospital = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newHospitalName.trim();
    if (!name) return;
    if (settings.hospitals.includes(name)) {
      alert('Hospital already in list');
      return;
    }

    const updated = [...settings.hospitals, name];
    await onUpdateSettings({ hospitals: updated });
    setNewHospitalName('');
  };

  const handleRemoveHospital = async (hospitalName: string) => {
    if (settings.hospitals.length <= 1) {
      alert('You must retain at least one hospital in the list');
      return;
    }
    const updated = settings.hospitals.filter((h) => h !== hospitalName);
    const newDefault =
      settings.defaultHospital === hospitalName ? updated[0] : settings.defaultHospital;
    await onUpdateSettings({ hospitals: updated, defaultHospital: newDefault });
  };

  const handleToggleOfflineSimulation = async () => {
    await onUpdateSettings({ offlineSimulation: !settings.offlineSimulation });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-slate-100">Settings & Sync</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-6 text-xs">
          {/* Google Drive Connection Section */}
          <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Google Drive Remote Backup
                </h3>
              </div>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  settings.googleDriveConnected
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}
              >
                {settings.googleDriveConnected ? 'CONNECTED' : 'DISCONNECTED'}
              </span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Uploads go directly from your phone to your personal Google Drive over TLS 1.3. 
              Zero patient health information passes through any intermediary server.
            </p>

            {/* Google Client ID Field */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                  <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Google OAuth Client ID</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowSetupGuide(!showSetupGuide)}
                  className="text-[11px] text-emerald-400 hover:underline flex items-center gap-0.5"
                >
                  <HelpCircle className="w-3 h-3" />
                  <span>What do I need?</span>
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. 12345-abc.apps.googleusercontent.com"
                  value={clientIdInput}
                  onChange={(e) => setClientIdInput(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono text-[11px] focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={handleSaveClientId}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-colors shrink-0"
                >
                  Save
                </button>
              </div>
            </div>

            {/* Setup Guidance Box */}
            {showSetupGuide && (
              <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-700 text-[11px] text-slate-300 space-y-2">
                <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>How to connect Google Drive (No hardcoded secrets)</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-400 leading-relaxed">
                  <li>Go to <strong>Google Cloud Console</strong> (console.cloud.google.com).</li>
                  <li>Enable <strong>Google Drive API</strong>.</li>
                  <li>In <strong>Credentials</strong>, create an <strong>OAuth 2.0 Client ID</strong> (Web Application).</li>
                  <li>
                    Add Authorized JavaScript origins:
                    <div className="font-mono text-[10px] bg-slate-950 p-1 rounded mt-0.5 text-slate-300">
                      http://localhost:5173<br />
                      https://your-vercel-domain.vercel.app
                    </div>
                  </li>
                  <li>Copy the Client ID and paste it above (or set <code className="text-emerald-300">VITE_GOOGLE_CLIENT_ID</code> on Vercel).</li>
                </ol>
              </div>
            )}

            {/* 1-Tap Google Sign-In Button */}
            <div className="pt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isAuthorizing}
                className="flex-1 py-2 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.36 24 12 24z"/>
                  <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                </svg>
                <span>{isAuthorizing ? 'Opening Google Sign-In...' : 'Authorize Google Drive'}</span>
              </button>

              <button
                type="button"
                onClick={handleTestDriveConnection}
                disabled={isTestingToken}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-colors flex items-center gap-1.5 border border-slate-700"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>{isTestingToken ? 'Testing...' : 'Verify'}</span>
              </button>
            </div>

            {/* Manual Token Fallback (collapsible) */}
            <details className="pt-2 text-slate-500">
              <summary className="text-[10px] cursor-pointer hover:text-slate-400">
                Alternative: Paste Access Token manually
              </summary>
              <div className="flex gap-2 mt-1.5">
                <input
                  type="password"
                  placeholder="Bearer ya29..."
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-mono text-[11px] focus:outline-none"
                />
                <button
                  onClick={handleSaveTokenManual}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold"
                >
                  Save
                </button>
              </div>
            </details>

            {testResult && (
              <div
                className={`p-2.5 rounded-lg border flex items-start gap-2 text-[11px] ${
                  testResult.ok
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                }`}
              >
                {testResult.ok ? (
                  <Check className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>

          {/* Hospital Management Section */}
          <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Hospital Locations
              </h3>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {settings.hospitals.map((h) => (
                <div
                  key={h}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900 border border-slate-800"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="defaultHospital"
                      checked={settings.defaultHospital === h}
                      onChange={() => onUpdateSettings({ defaultHospital: h })}
                      className="text-emerald-500 focus:ring-0"
                    />
                    <span className="text-slate-200 font-medium">{h}</span>
                    {settings.defaultHospital === h && (
                      <span className="text-[10px] text-emerald-400 font-bold uppercase">
                        (Default)
                      </span>
                    )}
                  </div>
                  {settings.hospitals.length > 1 && (
                    <button
                      onClick={() => handleRemoveHospital(h)}
                      className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                      title="Delete Location"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add Hospital */}
            <form onSubmit={handleAddHospital} className="flex gap-2 pt-1">
              <input
                type="text"
                placeholder="Add new location..."
                value={newHospitalName}
                onChange={(e) => setNewHospitalName(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </form>
          </div>

          {/* Offline Ward Simulation */}
          <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-800 flex items-center justify-between">
            <div className="pr-4">
              <div className="flex items-center gap-2">
                <WifiOff className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold text-slate-200">
                  Offline Ward Simulation
                </h3>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Simulates poor reception in hospital wards. 
                Encounters are saved locally and placed in the retry queue.
              </p>
            </div>
            <button
              onClick={handleToggleOfflineSimulation}
              className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                settings.offlineSimulation ? 'bg-amber-500' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform transform ${
                  settings.offlineSimulation ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Privacy & Security Guarantee */}
          <div className="bg-emerald-950/20 border border-emerald-800/30 rounded-xl p-3 flex items-start gap-2.5 text-[11px] text-emerald-300/90">
            <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-bold">Zero-PHI Privacy Guarantee:</span> Uploads connect directly to Google Drive via HTTPS. No patient names, MRNs, or photographs ever pass through Vercel or any third party.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
