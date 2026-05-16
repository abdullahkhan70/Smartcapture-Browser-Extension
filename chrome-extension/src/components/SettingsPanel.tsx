import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  Camera,
  Clock,
  Trash2,
  Download,
  Upload,
  HardDrive,
  Info,
  RotateCcw,
} from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { storage } from '@/lib/storage';
import { useAppStore } from '@/store';
import { Button } from './ui/Button';

export function SettingsPanel() {
  const { settings, isLoading, updateSettings, resetSettings } = useSettings();
  const setStoreSettings = useAppStore((s) => s.setSettings);
  const [storageUsed, setStorageUsed] = useState<string>('Calculating...');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Estimate storage usage
  React.useEffect(() => {
    const estimateStorage = async () => {
      try {
        if (navigator.storage && navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          const used = estimate.usage ?? 0;
          if (used < 1024) setStorageUsed(`${used} B`);
          else if (used < 1048576) setStorageUsed(`${(used / 1024).toFixed(1)} KB`);
          else setStorageUsed(`${(used / 1048576).toFixed(1)} MB`);
        } else {
          setStorageUsed('Unknown');
        }
      } catch {
        setStorageUsed('Unknown');
      }
    };
    estimateStorage();
  }, []);

  const handleUpdateSettings = async (updates: Record<string, unknown>) => {
    await updateSettings(updates as any);
    setStoreSettings(updates as any);
  };

  const handleExportAll = async () => {
    try {
      const allCaptures = await storage.getAllCaptures();
      const data = JSON.stringify(allCaptures, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `smartcapture-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const captures = JSON.parse(text);
        if (Array.isArray(captures)) {
          for (const capture of captures) {
            await storage.addCapture(capture);
          }
          alert(`Imported ${captures.length} captures`);
        }
      } catch (err) {
        console.error('Import failed:', err);
      }
    };
    input.click();
  };

  const handleClearAll = async () => {
    if (!showClearConfirm) {
      setShowClearConfirm(true);
      setTimeout(() => setShowClearConfirm(false), 3000);
      return;
    }
    try {
      await storage.clearAllCaptures();
      useAppStore.getState().setCaptures([]);
      setShowClearConfirm(false);
    } catch (err) {
      console.error('Clear failed:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl animate-shimmer" style={{ backgroundColor: '#1E293B' }} />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* ===== Capture Settings ===== */}
      <SettingsSection title="Capture" icon={<Camera size={13} />}>
        {/* Default Format */}
        <SettingRow label="Default Format">
          <select
            value={settings.defaultFormat}
            onChange={(e) => handleUpdateSettings({ defaultFormat: e.target.value })}
            className="text-xs rounded-lg px-2.5 py-1.5 text-text-primary focus:outline-none focus:border-primary/50"
            style={{
              backgroundColor: '#334155',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
          </select>
        </SettingRow>

        {/* Quality */}
        <div className="py-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-text-primary font-medium">Quality</span>
            <span className="text-xs text-primary font-mono tabular-nums font-semibold">
              {settings.defaultQuality}%
            </span>
          </div>
          <input
            type="range"
            min="10"
            max="100"
            step="5"
            value={settings.defaultQuality}
            onChange={(e) => handleUpdateSettings({ defaultQuality: parseInt(e.target.value, 10) })}
            className="w-full"
          />
        </div>

        {/* Capture Delay */}
        <SettingRow label="Capture Delay">
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={settings.captureDelay}
              onChange={(e) => handleUpdateSettings({ captureDelay: parseInt(e.target.value, 10) || 100 })}
              className="w-16 text-xs text-right rounded-lg px-2 py-1.5 text-text-primary focus:outline-none focus:border-primary/50 font-mono"
              style={{
                backgroundColor: '#334155',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
              min={50}
              max={2000}
              step={50}
            />
            <span className="text-[10px] text-text-muted">ms</span>
          </div>
        </SettingRow>

        {/* Pre-scroll toggle */}
        <SettingRow label="Pre-scroll to top">
          <ToggleSwitch
            checked={settings.preScrollEnabled}
            onChange={(v) => handleUpdateSettings({ preScrollEnabled: v })}
          />
        </SettingRow>

        {/* Smart Scroll toggle */}
        <SettingRow label="Smart Scroll">
          <ToggleSwitch
            checked={settings.smartScrollEnabled}
            onChange={(v) => handleUpdateSettings({ smartScrollEnabled: v })}
          />
        </SettingRow>

        {/* Auto Crop toggle */}
        <SettingRow label="Auto Crop">
          <ToggleSwitch
            checked={settings.autoCropEnabled}
            onChange={(v) => handleUpdateSettings({ autoCropEnabled: v })}
          />
        </SettingRow>

        {/* Fixed Element Handling toggle */}
        <SettingRow label="Hide Fixed Elements">
          <ToggleSwitch
            checked={settings.fixedElementHandling}
            onChange={(v) => handleUpdateSettings({ fixedElementHandling: v })}
          />
        </SettingRow>
      </SettingsSection>

      {/* ===== Data Management ===== */}
      <SettingsSection title="Data Management" icon={<HardDrive size={13} />}>
        {/* Storage Usage */}
        <SettingRow label="Storage Used">
          <span className="text-xs text-text-muted font-mono">{storageUsed}</span>
        </SettingRow>

        {/* Actions */}
        <div className="grid grid-cols-3 gap-2 mt-1">
          <button
            onClick={handleExportAll}
            className="flex items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-medium
              bg-surface-elevated text-text-secondary hover:text-text-primary hover:bg-surface-hover
              transition-smooth cursor-pointer"
          >
            <Download size={11} />
            Export All
          </button>
          <button
            onClick={handleImport}
            className="flex items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-medium
              bg-surface-elevated text-text-secondary hover:text-text-primary hover:bg-surface-hover
              transition-smooth cursor-pointer"
          >
            <Upload size={11} />
            Import
          </button>
          <button
            onClick={handleClearAll}
            className={`flex items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-medium
              transition-smooth cursor-pointer
              ${showClearConfirm
                ? 'bg-error text-white'
                : 'bg-surface-elevated text-error hover:bg-error/20'
              }`}
          >
            <Trash2 size={11} />
            {showClearConfirm ? 'Confirm?' : 'Clear All'}
          </button>
        </div>
      </SettingsSection>

      {/* ===== About ===== */}
      <SettingsSection title="About" icon={<Info size={13} />}>
        <SettingRow label="Version">
          <span className="text-xs text-text-muted font-mono">v1.0.0</span>
        </SettingRow>
        <div className="pt-1">
          <button
            onClick={resetSettings}
            className="flex items-center gap-1.5 text-[10px] text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
          >
            <RotateCcw size={11} />
            Reset to defaults
          </button>
        </div>
      </SettingsSection>
    </div>
  );
}

/* ===== Helper Components ===== */

function SettingsSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-text-muted">{icon}</span>
        <h4 className="text-[11px] font-semibold text-text-muted uppercase tracking-widest">
          {title}
        </h4>
      </div>
      <div
        className="rounded-xl p-3 space-y-3"
        style={{
          backgroundColor: 'rgba(30, 41, 59, 0.5)',
          border: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        {children}
      </div>
    </section>
  );
}

function SettingRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-text-primary font-medium">{label}</span>
      {children}
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="relative w-9 h-5 rounded-full transition-smooth flex-shrink-0 cursor-pointer"
      style={{ backgroundColor: checked ? '#0EA5E9' : '#334155' }}
      role="switch"
      aria-checked={checked}
    >
      <span
        className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform"
        style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }}
      />
    </button>
  );
}
