import React, { useState, useCallback, useMemo } from 'react';
import { fabric } from 'fabric';
import {
  X,
  Trash2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  RotateCw,
  Type,
} from 'lucide-react';
import { AnnotationTool } from '@/lib/types';

// PDF Mockup color palette: white, red, orange, yellow, green, cyan, blue, purple
const DEFAULT_COLORS = [
  '#EF4444',
  '#F97316',
  '#FACC15',
  '#22C55E',
  '#06B6D4',
  '#0EA5E9',
  '#3B82F6',
  '#A855F7',
  '#FFFFFF',
  '#000000',
];

// Common web-safe font families
const FONT_FAMILY_OPTIONS = [
  { value: 'Inter, system-ui, sans-serif', label: 'Inter' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: 'Times New Roman, Times, serif', label: 'Times New Roman' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Courier New, Courier, monospace', label: 'Courier New' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: 'Trebuchet MS, sans-serif', label: 'Trebuchet MS' },
  { value: 'Impact, Charcoal, sans-serif', label: 'Impact' },
  { value: 'Comic Sans MS, cursive', label: 'Comic Sans MS' },
  { value: 'Lucida Console, Monaco, monospace', label: 'Lucida Console' },
];

interface ToolPropertiesProps {
  activeTool: AnnotationTool;
  activeColor: string;
  strokeWidth: number;
  fontSize: number;
  fontFamily: string;
  onColorChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  onFontSizeChange: (size: number) => void;
  onFontFamilyChange: (family: string) => void;
}

interface ObjectPropertiesProps {
  selectedObject: fabric.Object;
  onPropertyChange: (property: string, value: unknown) => void;
  onDelete: () => void;
}

interface PropertiesPanelProps {
  mode: 'tool' | 'object';
  // Tool mode props
  toolProps?: ToolPropertiesProps;
  // Object mode props
  objectProps?: ObjectPropertiesProps;
  // Common
  onClose?: () => void;
}

export function PropertiesPanel({ mode, toolProps, objectProps, onClose }: PropertiesPanelProps) {
  if (mode === 'tool' && toolProps) {
    return <ToolPropertiesPanel {...toolProps} onClose={onClose} />;
  }
  if (mode === 'object' && objectProps) {
    return <ObjectPropertiesPanel {...objectProps} onClose={onClose} />;
  }
  return null;
}

/* ============================================================
   TOOL PROPERTIES PANEL (pre-draw configuration)
   ============================================================ */

function ToolPropertiesPanel({
  activeTool,
  activeColor,
  strokeWidth,
  fontSize,
  fontFamily,
  onColorChange,
  onStrokeWidthChange,
  onFontSizeChange,
  onFontFamilyChange,
  onClose,
}: ToolPropertiesProps & { onClose?: () => void }) {
  const getToolLabel = () => {
    switch (activeTool) {
      case 'draw': return 'PEN';
      case 'rectangle': return 'RECTANGLE';
      case 'ellipse': return 'ELLIPSE';
      case 'arrow': return 'ARROW';
      case 'text': return 'TEXT';
      case 'highlight': return 'HIGHLIGHT';
      default: return 'TOOL';
    }
  };

  const showColor = ['draw', 'rectangle', 'ellipse', 'arrow', 'text', 'highlight'].includes(activeTool);
  const showStrokeWidth = ['draw', 'rectangle', 'ellipse', 'arrow'].includes(activeTool);
  const showFontSize = activeTool === 'text';
  const showFontFamily = activeTool === 'text';

  return (
    <div className="flex flex-col h-full ed-animate-slide-left shrink-0 w-[240px] bg-ed-bg-panel border-l border-ed-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-ed-border">
        <div>
          <h3 className="text-sm font-semibold text-ed-text-primary">Properties</h3>
          <p className="text-[10px] font-bold text-ed-text-muted mt-0.5 tracking-widest">{getToolLabel()}</p>
        </div>
        <button
          onClick={onClose}
          className="flex items-center justify-center w-7 h-7 rounded-ed cursor-pointer ed-transition
            text-ed-text-muted hover:text-ed-text-primary hover:bg-ed-bg-hover"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-ed-thin px-4 py-4 space-y-4">

        {/* Color */}
        {showColor && (
          <EdPropSection label="Color">
            <EdColorPicker
              value={activeColor}
              onChange={onColorChange}
            />
          </EdPropSection>
        )}

        {/* Stroke Width */}
        {showStrokeWidth && (
          <EdPropSection label="Stroke">
            <EdPropRow label="Thickness">
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={strokeWidth}
                  onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="text-[10px] text-ed-text-secondary w-8 text-right tabular-nums font-semibold">
                  {strokeWidth}px
                </span>
              </div>
            </EdPropRow>
          </EdPropSection>
        )}

        {/* Font Size (Text tool) */}
        {showFontSize && (
          <EdPropSection label="Font">
            <EdPropRow label="Size">
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={8}
                  max={96}
                  value={fontSize}
                  onChange={(e) => onFontSizeChange(Number(e.target.value))}
                  className="flex-1"
                />
                <input
                  type="number"
                  min={8}
                  max={200}
                  value={fontSize}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= 8) onFontSizeChange(v);
                  }}
                  className="w-14 text-[11px] text-ed-text-primary bg-ed-bg rounded-ed px-2 py-1
                    border border-ed-border text-center tabular-nums font-semibold
                    focus:outline-none focus:border-ed-accent/50"
                />
              </div>
            </EdPropRow>
          </EdPropSection>
        )}

        {/* Font Family (Text tool) */}
        {showFontFamily && (
          <EdPropSection label="Typography">
            <EdPropRow label="Family">
              <select
                value={fontFamily}
                onChange={(e) => onFontFamilyChange(e.target.value)}
                className="w-full text-[11px] text-ed-text-primary bg-ed-bg rounded-ed px-2.5 py-2
                  border border-ed-border cursor-pointer
                  focus:outline-none focus:border-ed-accent/50
                  [&>option]:bg-ed-bg-secondary [&>option]:text-ed-text-primary"
                style={{ colorScheme: 'dark' }}
              >
                {FONT_FAMILY_OPTIONS.map((font) => (
                  <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                    {font.label}
                  </option>
                ))}
              </select>
            </EdPropRow>
          </EdPropSection>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   OBJECT PROPERTIES PANEL (edit selected object)
   ============================================================ */

function ObjectPropertiesPanel({
  selectedObject,
  onPropertyChange,
  onDelete,
  onClose,
}: ObjectPropertiesProps & { onClose?: () => void }) {
  const objectId = selectedObject?.id || '';
  const objectType = selectedObject?.type || '';

  const [localAngle, setLocalAngle] = useState(() =>
    Math.round(((selectedObject as any).angle || 0) * 10) / 10
  );

  const initialValues = useMemo(() => {
    if (!selectedObject) {
      return {
        fillColor: '#000000',
        strokeColor: '#EF4444',
        strokeWidth: 2,
        opacity: 1,
        textSize: 20,
        fontWeight: 'normal' as string,
        textAlign: 'left' as string,
        fontFamily: 'Inter, system-ui, sans-serif',
        angle: 0,
      };
    }
    return {
      fillColor: (selectedObject.fill as string) || '#000000',
      strokeColor: (selectedObject.stroke as string) || '#EF4444',
      strokeWidth: (selectedObject.strokeWidth as number) || 2,
      opacity: selectedObject.opacity || 1,
      textSize: (selectedObject as any).fontSize || 20,
      fontWeight: (selectedObject as any).fontWeight || 'normal',
      textAlign: (selectedObject as any).textAlign || 'left',
      fontFamily: (selectedObject as any).fontFamily || 'Inter, system-ui, sans-serif',
      angle: (selectedObject as any).angle || 0,
    };
  }, [selectedObject, objectId]);

  // Sync local angle when selected object changes
  React.useEffect(() => {
    setLocalAngle(Math.round(((selectedObject as any).angle || 0) * 10) / 10);
  }, [selectedObject, objectId]);

  const isText = objectType === 'i-text' || objectType === 'text';
  const isShape = objectType === 'rect' || objectType === 'ellipse';
  const isHighlight = isShape && selectedObject?.opacity && selectedObject.opacity < 1 && selectedObject.strokeWidth === 0;
  const isLine = objectType === 'line' || objectType === 'group';

  const getObjectTypeLabel = () => {
    if (isHighlight) return 'HIGHLIGHT';
    if (isText) return 'TEXT';
    if (isLine) return 'ARROW';
    if (objectType === 'path') return 'PEN';
    if (isShape) return objectType === 'rect' ? 'RECTANGLE' : 'ELLIPSE';
    return objectType.toUpperCase();
  };

  const updateProperty = useCallback((property: string, value: unknown) => {
    onPropertyChange(property, value);
  }, [onPropertyChange]);

  const handleStrokeColorChange = useCallback((color: string) => {
    updateProperty('stroke', color);
  }, [updateProperty]);

  const handleFillColorChange = useCallback((color: string) => {
    updateProperty('fill', color);
  }, [updateProperty]);

  const handleStrokeWidthChange = useCallback((width: number) => {
    updateProperty('strokeWidth', width);
  }, [updateProperty]);

  const handleOpacityChange = useCallback((value: number) => {
    updateProperty('opacity', value);
  }, [updateProperty]);

  const handleFontSizeChange = useCallback((size: number) => {
    updateProperty('fontSize', size);
  }, [updateProperty]);

  const handleFontWeightToggle = useCallback(() => {
    const newWeight = initialValues.fontWeight === 'bold' ? 'normal' : 'bold';
    updateProperty('fontWeight', newWeight);
  }, [initialValues.fontWeight, updateProperty]);

  const handleTextAlignChange = useCallback((align: string) => {
    updateProperty('textAlign', align);
  }, [updateProperty]);

  const handleFontFamilyChange = useCallback((family: string) => {
    updateProperty('fontFamily', family);
  }, [updateProperty]);

  const handleAngleChange = useCallback((angle: number) => {
    setLocalAngle(angle);
    updateProperty('angle', angle);
  }, [updateProperty]);

  if (!selectedObject) return null;

  const showRotation = isShape || isLine;
  const showStrokeWidth = (isShape && !isHighlight) || isLine || objectType === 'path';

  return (
    <div className="flex flex-col h-full ed-animate-slide-left shrink-0 w-[240px] bg-ed-bg-panel border-l border-ed-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-ed-border">
        <div>
          <h3 className="text-sm font-semibold text-ed-text-primary">Properties</h3>
          <p className="text-[10px] font-bold text-ed-text-muted mt-0.5 tracking-widest">{getObjectTypeLabel()}</p>
        </div>
        <button
          onClick={onClose}
          className="flex items-center justify-center w-7 h-7 rounded-ed cursor-pointer ed-transition
            text-ed-text-muted hover:text-ed-text-primary hover:bg-ed-bg-hover"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-ed-thin px-4 py-4 space-y-4">
        {/* Text Properties */}
        {isText && (
          <EdPropSection label="Text">
            <EdPropRow label="Color">
              <EdColorPicker value={initialValues.fillColor} onChange={handleFillColorChange} />
            </EdPropRow>

            <EdPropRow label="Font Size">
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={8}
                  max={96}
                  value={initialValues.textSize}
                  onChange={(e) => handleFontSizeChange(Number(e.target.value))}
                  className="flex-1"
                />
                <input
                  type="number"
                  min={8}
                  max={200}
                  value={initialValues.textSize}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= 8) handleFontSizeChange(v);
                  }}
                  className="w-14 text-[11px] text-ed-text-primary bg-ed-bg rounded-ed px-2 py-1
                    border border-ed-border text-center tabular-nums font-semibold
                    focus:outline-none focus:border-ed-accent/50"
                />
              </div>
            </EdPropRow>

            <EdPropRow label="Font Family">
              <select
                value={initialValues.fontFamily}
                onChange={(e) => handleFontFamilyChange(e.target.value)}
                className="w-full text-[11px] text-ed-text-primary bg-ed-bg rounded-ed px-2.5 py-2
                  border border-ed-border cursor-pointer
                  focus:outline-none focus:border-ed-accent/50
                  [&>option]:bg-ed-bg-secondary [&>option]:text-ed-text-primary"
                style={{ colorScheme: 'dark' }}
              >
                {FONT_FAMILY_OPTIONS.map((font) => (
                  <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                    {font.label}
                  </option>
                ))}
              </select>
            </EdPropRow>

            <EdPropRow label="Style">
              <div className="flex items-center gap-1">
                <EdToggleBtn
                  active={initialValues.fontWeight === 'bold'}
                  onClick={handleFontWeightToggle}
                >
                  <Bold size={14} />
                </EdToggleBtn>
                <EdToggleBtn
                  active={initialValues.textAlign === 'left'}
                  onClick={() => handleTextAlignChange('left')}
                >
                  <AlignLeft size={14} />
                </EdToggleBtn>
                <EdToggleBtn
                  active={initialValues.textAlign === 'center'}
                  onClick={() => handleTextAlignChange('center')}
                >
                  <AlignCenter size={14} />
                </EdToggleBtn>
                <EdToggleBtn
                  active={initialValues.textAlign === 'right'}
                  onClick={() => handleTextAlignChange('right')}
                >
                  <AlignRight size={14} />
                </EdToggleBtn>
              </div>
            </EdPropRow>
          </EdPropSection>
        )}

        {/* Path (Pen) Properties */}
        {objectType === 'path' && (
          <EdPropSection label="Pen">
            <EdPropRow label="Color">
              <EdColorPicker value={initialValues.strokeColor} onChange={handleStrokeColorChange} />
            </EdPropRow>
            <EdPropRow label="Thickness">
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={initialValues.strokeWidth}
                  onChange={(e) => handleStrokeWidthChange(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="text-[10px] text-ed-text-secondary w-8 text-right tabular-nums font-semibold">
                  {initialValues.strokeWidth}px
                </span>
              </div>
            </EdPropRow>
          </EdPropSection>
        )}

        {/* Shape Properties */}
        {isShape && !isHighlight && (
          <EdPropSection label="Shape">
            <EdPropRow label="Border Color">
              <EdColorPicker value={initialValues.strokeColor} onChange={handleStrokeColorChange} />
            </EdPropRow>
            <EdPropRow label="Border Width">
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={20}
                  value={initialValues.strokeWidth}
                  onChange={(e) => handleStrokeWidthChange(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="text-[10px] text-ed-text-secondary w-8 text-right tabular-nums font-semibold">
                  {initialValues.strokeWidth}px
                </span>
              </div>
            </EdPropRow>
            <EdPropRow label="Fill Color">
              <EdColorPicker value={initialValues.fillColor} onChange={handleFillColorChange} includeTransparent />
            </EdPropRow>
          </EdPropSection>
        )}

        {/* Highlight Properties */}
        {isHighlight && (
          <EdPropSection label="Highlight">
            <EdPropRow label="Color">
              <EdColorPicker value={initialValues.fillColor} onChange={handleFillColorChange} />
            </EdPropRow>
            <EdPropRow label="Opacity">
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0.05}
                  max={0.8}
                  step={0.05}
                  value={initialValues.opacity}
                  onChange={(e) => handleOpacityChange(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="text-[10px] text-ed-text-secondary w-8 text-right tabular-nums font-semibold">
                  {Math.round(initialValues.opacity * 100)}%
                </span>
              </div>
            </EdPropRow>
          </EdPropSection>
        )}

        {/* Arrow Properties */}
        {isLine && (
          <EdPropSection label="Arrow">
            <EdPropRow label="Color">
              <EdColorPicker value={initialValues.strokeColor} onChange={handleStrokeColorChange} />
            </EdPropRow>
            <EdPropRow label="Width">
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={initialValues.strokeWidth}
                  onChange={(e) => handleStrokeWidthChange(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="text-[10px] text-ed-text-secondary w-8 text-right tabular-nums font-semibold">
                  {initialValues.strokeWidth}px
                </span>
              </div>
            </EdPropRow>
          </EdPropSection>
        )}

        {/* Rotation */}
        {showRotation && (
          <EdPropSection label="Transform">
            <EdPropRow label="Rotation">
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={360}
                  step={1}
                  value={localAngle}
                  onChange={(e) => handleAngleChange(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="text-[10px] text-ed-text-secondary w-10 text-right tabular-nums font-semibold">
                  {Math.round(localAngle)}°
                </span>
              </div>
            </EdPropRow>
          </EdPropSection>
        )}

        {/* Common Opacity */}
        {!isHighlight && !isText && (
          <EdPropSection label="Appearance">
            <EdPropRow label="Opacity">
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={initialValues.opacity}
                  onChange={(e) => handleOpacityChange(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="text-[10px] text-ed-text-secondary w-8 text-right tabular-nums font-semibold">
                  {Math.round(initialValues.opacity * 100)}%
                </span>
              </div>
            </EdPropRow>
          </EdPropSection>
        )}

        {/* Position & Size info */}
        <EdPropSection label="Position">
          <div className="grid grid-cols-2 gap-2">
            <EdInfoItem label="X" value={Math.round(selectedObject.left || 0)} />
            <EdInfoItem label="Y" value={Math.round(selectedObject.top || 0)} />
            {isShape && (
              <>
                <EdInfoItem label="W" value={Math.round((selectedObject as fabric.Rect).width || 0)} />
                <EdInfoItem label="H" value={Math.round((selectedObject as fabric.Rect).height || 0)} />
              </>
            )}
          </div>
        </EdPropSection>
      </div>

      {/* Delete Button */}
      <div className="p-3 shrink-0 border-t border-ed-border">
        <button
          onClick={onDelete}
          className="flex items-center justify-center gap-2 w-full py-2 px-3 rounded-ed cursor-pointer ed-transition
            text-ed-danger hover:bg-ed-danger/10 text-xs font-semibold border border-ed-danger/20"
        >
          <Trash2 size={14} />
          Delete
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   SHARED SUB-COMPONENTS
   ============================================================ */

function EdPropSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ed-prop-section">
      <h4 className="text-[10px] font-bold text-ed-text-muted uppercase tracking-widest mb-3">{label}</h4>
      <div className="space-y-3">
        {children}
      </div>
    </div>
  );
}

function EdPropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] text-ed-text-secondary font-medium">{label}</label>
      {children}
    </div>
  );
}

function EdToggleBtn({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center w-8 h-8 rounded-ed cursor-pointer ed-transition
        ${active
          ? 'bg-ed-accent text-white shadow-ed-glow-sm'
          : 'text-ed-text-muted hover:text-ed-text-secondary hover:bg-ed-bg-hover'
        }`}
    >
      {children}
    </button>
  );
}

function EdColorPicker({ value, onChange, includeTransparent }: {
  value: string;
  onChange: (color: string) => void;
  includeTransparent?: boolean;
}) {
  const colors = includeTransparent ? ['transparent', ...DEFAULT_COLORS] : DEFAULT_COLORS;

  return (
    <div className="space-y-2">
      {/* Color swatches */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {colors.map((color) => (
          <button
            key={color}
            onClick={() => onChange(color)}
            className={`rounded-md cursor-pointer ed-transition
              ${value === color
                ? 'ring-2 ring-ed-accent ring-offset-1.5 ring-offset-ed-bg-panel scale-110'
                : 'hover:scale-110 opacity-50 hover:opacity-100'
              }`}
            style={{
              width: 22,
              height: 22,
              backgroundColor: color === 'transparent' ? 'transparent' : color,
              border: color === 'transparent'
                ? '2px dashed #475569'
                : color === '#FFFFFF'
                  ? '1px solid rgba(255,255,255,0.15)'
                  : 'none',
              boxShadow: color === '#000000' ? 'inset 0 0 0 1px rgba(255,255,255,0.12)' : 'none',
            }}
          />
        ))}
        {/* Custom color picker */}
        <label className="relative cursor-pointer group">
          <div
            className="w-[22px] h-[22px] rounded-md flex items-center justify-center ed-transition hover:scale-110"
            style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
          >
            <span className="text-[7px] text-white font-bold drop-shadow-sm">+</span>
          </div>
          <input
            type="color"
            value={value === 'transparent' ? '#000000' : value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
      </div>
      {/* Current color value display */}
      <div className="flex items-center gap-2">
        <div
          className="w-5 h-5 rounded-md shrink-0 border border-ed-border"
          style={{
            backgroundColor: value === 'transparent' ? 'transparent' : value,
            border: value === 'transparent' ? '2px dashed #475569' : '1px solid rgba(255,255,255,0.1)',
          }}
        />
        <span className="text-[10px] text-ed-text-muted font-mono uppercase">
          {value === 'transparent' ? 'transparent' : value}
        </span>
      </div>
    </div>
  );
}

function EdInfoItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-ed px-2.5 py-1.5 bg-ed-bg/80">
      <span className="text-[9px] text-ed-text-muted font-medium">{label}</span>
      <span className="text-[11px] text-ed-text-primary ml-1.5 tabular-nums font-semibold">{value}</span>
    </div>
  );
}
