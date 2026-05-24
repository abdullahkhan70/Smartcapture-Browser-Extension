import React from 'react';
import { Heart, Settings, Sparkles, User } from 'lucide-react';
import { useAppStore, AppView } from '@/store';

const PATREON_URL = 'https://www.patreon.com/15918496/join';

interface PopupFooterProps {
  onNavigate: (view: AppView | string) => void;
}

export function PopupFooter({ onNavigate }: PopupFooterProps) {
  const setView = useAppStore((s) => s.setView);

  return (
    <footer
      className="flex items-center justify-between h-12 px-3 shrink-0"
      style={{
        backgroundColor: '#1E293B',
        borderTop: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {/* Left: Settings */}
      <button
        onClick={() => setView('settings')}
        className="flex items-center justify-center w-8 h-8 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-smooth cursor-pointer"
        aria-label="Settings"
      >
        <Settings size={16} />
      </button>

      {/* Center: Coming Soon + Support Us */}
      <div className="flex items-center gap-2">
        <span
          className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold cursor-default"
          style={{
            backgroundColor: 'rgba(14, 165, 233, 0.15)',
            color: '#38BDF8',
            border: '1px solid rgba(14, 165, 233, 0.25)',
          }}
        >
          <Sparkles size={10} />
          <span>Coming Soon</span>
        </span>
        <a
          href={PATREON_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold cursor-pointer transition-smooth hover:opacity-90"
          style={{
            backgroundColor: 'rgba(249, 115, 22, 0.15)',
            color: '#FB923C',
            border: '1px solid rgba(249, 115, 22, 0.25)',
            textDecoration: 'none',
          }}
        >
          <Heart size={10} />
          <span>Support Us</span>
        </a>
      </div>

      {/* Right: User Avatar */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white cursor-pointer"
        style={{ backgroundColor: '#334155' }}
      >
        <User size={14} className="text-text-secondary" />
      </div>
    </footer>
  );
}
