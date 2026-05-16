import React from 'react';
import { FileText, GitCompare, PenTool, Clock } from 'lucide-react';
import { useAppStore, AppView } from '@/store';

interface QuickToolsProps {
  onNavigate: (view: AppView | string) => void;
}

const tools: {
  id: string;
  label: string;
  tooltip: string;
  icon: React.ElementType;
  color: string;
  view?: AppView;
}[] = [
  {
    id: 'ocr',
    label: 'OCR',
    tooltip: 'OCR Text Extraction',
    icon: FileText,
    color: 'text-[#0EA5E9]',
  },
  {
    id: 'diff',
    label: 'Diff',
    tooltip: 'Visual Comparison',
    icon: GitCompare,
    color: 'text-[#F59E0B]',
  },
  {
    id: 'annotate',
    label: 'Annotate',
    tooltip: 'Annotate',
    icon: PenTool,
    color: 'text-[#22C55E]',
    view: 'annotate',
  },
  {
    id: 'history',
    label: 'History',
    tooltip: 'Capture History',
    icon: Clock,
    color: 'text-[#94A3B8]',
    view: 'gallery',
  },
];

export function QuickTools({ onNavigate }: QuickToolsProps) {
  const handleToolClick = (tool: typeof tools[number]) => {
    if (tool.view) {
      onNavigate(tool.view);
    } else {
      // For tools without a dedicated view (OCR, Diff), show a toast or handle differently
      console.log(`Tool ${tool.id} clicked`);
    }
  };

  return (
    <div className="animate-slide-up" style={{ animationDelay: '50ms' }}>
      {/* Section Label */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className="text-[11px] font-semibold text-text-muted uppercase tracking-widest"
        >
          Quick Tools
        </span>
      </div>

      {/* Divider */}
      <div className="divider mb-3" />

      {/* Tool Buttons Row */}
      <div className="flex items-center gap-2 justify-center">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              onClick={() => handleToolClick(tool)}
              className="tooltip-wrapper flex flex-col items-center gap-1.5 cursor-pointer group"
              data-tooltip={tool.tooltip}
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center transition-smooth
                  bg-surface-card hover:bg-surface-elevated
                  border border-transparent hover:border-primary/30
                  group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-primary/10"
                style={{ borderColor: 'rgba(255,255,255,0.05)' }}
              >
                <Icon size={16} className={`${tool.color} group-hover:text-primary transition-colors`} />
              </div>
              <span className="text-[10px] text-text-muted group-hover:text-text-secondary transition-colors font-medium">
                {tool.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
