import React from 'react';

type ProgressVariant = 'default' | 'primary' | 'success' | 'warning' | 'error';

interface ProgressProps {
  value: number; // 0-100
  variant?: ProgressVariant;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  label?: string;
  animated?: boolean;
  className?: string;
}

const barColors: Record<ProgressVariant, string> = {
  default: 'bg-surface-elevated',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
};

const trackColors: Record<ProgressVariant, string> = {
  default: 'bg-surface-card',
  primary: 'bg-primary/20',
  success: 'bg-success/20',
  warning: 'bg-warning/20',
  error: 'bg-error/20',
};

const sizeStyles = {
  sm: 'h-1',
  md: 'h-2',
};

export function Progress({
  value,
  variant = 'primary',
  size = 'md',
  showLabel = false,
  label,
  animated = true,
  className = '',
}: ProgressProps) {
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div className={`w-full ${className}`}>
      {(showLabel || label) && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-text-secondary font-medium">
            {label ?? 'Progress'}
          </span>
          <span className="text-xs text-text-muted tabular-nums">
            {Math.round(clampedValue)}%
          </span>
        </div>
      )}
      <div
        className={`w-full rounded-full overflow-hidden ${trackColors[variant]} ${sizeStyles[size]}`}
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${
            barColors[variant]
          } ${animated && clampedValue < 100 ? 'animate-shimmer' : ''}`}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    </div>
  );
}
