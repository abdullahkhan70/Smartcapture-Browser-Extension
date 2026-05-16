import React from 'react';
import {
  MousePointer2,
  Hand,
  Pen,
  Square,
  Circle,
  ArrowRight,
  Type,
  Highlighter,
  Undo2,
  Redo2,
  Trash2,
  Eraser,
} from 'lucide-react';
import { AnnotationTool } from '@/lib/types';
import { ANNOTATION_COLORS } from '@/lib/constants';

interface AnnotationToolbarProps {
  activeTool: AnnotationTool;
  onToolChange: (tool: AnnotationTool) => void;
  activeColor: string;
  onColorChange: (color: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onDeleteSelected: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

interface ToolDef {
  id: AnnotationTool;
  label: string;
  shortcut: string;
  icon: React.ElementType;
}

const toolDefs: ToolDef[] = [
  { id: 'select', label: 'Select', shortcut: 'V', icon: MousePointer2 },
  { id: 'pan', label: 'Hand', shortcut: 'H', icon: Hand },
  { id: 'draw', label: 'Pen', shortcut: 'D', icon: Pen },
  { id: 'rectangle', label: 'Rectangle', shortcut: 'R', icon: Square },
  { id: 'ellipse', label: 'Ellipse', shortcut: 'E', icon: Circle },
  { id: 'arrow', label: 'Arrow', shortcut: 'A', icon: ArrowRight },
  { id: 'text', label: 'Text', shortcut: 'T', icon: Type },
  { id: 'highlight', label: 'Highlight', shortcut: 'L', icon: Highlighter },
];

export function AnnotationToolbar({
  activeTool,
  onToolChange,
  activeColor,
  onColorChange,
  onUndo,
  onRedo,
  onClear,
  onDeleteSelected,
  canUndo,
  canRedo,
}: AnnotationToolbarProps) {
  return (
    <div className="flex flex-col items-center py-2.5 px-1 gap-0.5 overflow-y-auto scrollbar-ed-thin shrink-0
      w-[52px] bg-ed-bg-secondary border-r border-ed-border">
      
      {/* ===== Drawing Tools ===== */}
      <div className="flex flex-col items-center gap-0.5 py-1 px-1 rounded-ed-lg bg-ed-bg/60">
        {toolDefs.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => onToolChange(tool.id)}
              className={`ed-tooltip ${isActive ? 'ed-tool-btn-active' : 'ed-tool-btn'}`}
              data-tooltip={`${tool.label} (${tool.shortcut})`}
              title={`${tool.label} (${tool.shortcut})`}
            >
              <Icon size={18} strokeWidth={isActive ? 2.2 : 1.6} />
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="my-2 w-7 h-px bg-ed-border" />

      {/* ===== Color Presets ===== */}
      <div className="flex flex-col items-center gap-1 py-1 px-0.5 rounded-ed-lg bg-ed-bg/60">
        {ANNOTATION_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => onColorChange(color)}
            className={`rounded-full cursor-pointer ed-transition
              ${activeColor === color
                ? 'ring-2 ring-ed-accent ring-offset-1.5 ring-offset-ed-bg-secondary scale-110'
                : 'hover:scale-110 opacity-50 hover:opacity-100'
              }`}
            style={{
              width: 20,
              height: 20,
              backgroundColor: color,
              border: color === '#FFFFFF' ? '1px solid rgba(255,255,255,0.15)' : 'none',
              boxShadow: color === '#000000' ? 'inset 0 0 0 1px rgba(255,255,255,0.12)' : 'none',
            }}
          />
        ))}
      </div>

      {/* Divider */}
      <div className="my-2 w-7 h-px bg-ed-border" />

      {/* ===== Action Buttons ===== */}
      <div className="flex flex-col items-center gap-0.5 py-1 px-1 rounded-ed-lg bg-ed-bg/60">
        {/* Undo */}
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={`ed-tooltip ed-tool-btn ${!canUndo ? '!opacity-30 !cursor-not-allowed' : ''}`}
          data-tooltip="Undo (Ctrl+Z)"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={15} />
        </button>

        {/* Redo */}
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className={`ed-tooltip ed-tool-btn ${!canRedo ? '!opacity-30 !cursor-not-allowed' : ''}`}
          data-tooltip="Redo (Ctrl+Shift+Z)"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 size={15} />
        </button>

        {/* Separator */}
        <div className="w-5 h-px bg-ed-border my-0.5" />

        {/* Delete */}
        <button
          onClick={onDeleteSelected}
          className="ed-tooltip ed-tool-btn hover:!text-ed-danger hover:!bg-ed-danger/10"
          data-tooltip="Delete (Del)"
          title="Delete (Del)"
        >
          <Trash2 size={15} />
        </button>

        {/* Clear */}
        <button
          onClick={onClear}
          className="ed-tooltip ed-tool-btn hover:!text-ed-danger hover:!bg-ed-danger/10"
          data-tooltip="Clear All"
          title="Clear All"
        >
          <Eraser size={15} />
        </button>
      </div>
    </div>
  );
}
