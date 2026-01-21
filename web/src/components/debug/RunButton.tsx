/**
 * ▶️ RUN Button / ⏳ PROCESSING Button
 * 
 * Unified run button component that shows:
 * - ▶️ RUN when idle
 * - ⏳ PROCESSING when running
 * 
 * Used across Admin Debug Console for all "Run Checks" actions.
 */

import React from 'react';

export interface RunButtonProps {
  onClick: () => void;
  isRunning: boolean;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'admin' | 'primary' | 'secondary';
  style?: React.CSSProperties;
  label?: string; // Custom label (default: "▶️ RUN" or "⏳ PROCESSING")
}

export function RunButton({
  onClick,
  isRunning,
  disabled = false,
  className = '',
  size = 'sm',
  variant = 'admin',
  style = {},
  label,
}: RunButtonProps) {
  const getVariantStyles = (): React.CSSProperties => {
    if (variant === 'admin') {
      return {
        background: isRunning ? '#666' : '#2f80ed',
        color: '#ffffff',
      };
    } else if (variant === 'primary') {
      return {
        background: isRunning ? '#666' : 'var(--color-primary)',
        color: '#ffffff',
      };
    } else {
      return {
        background: isRunning ? '#e0e0e0' : 'transparent',
        color: isRunning ? '#666' : 'var(--color-text)',
        border: '1px solid var(--color-border)',
      };
    }
  };

  const baseStyle: React.CSSProperties = {
    border: 'none',
    borderRadius: '6px',
    padding: size === 'sm' ? '0.375rem 0.75rem' : size === 'md' ? '0.5rem 1rem' : '0.75rem 1.25rem',
    fontSize: size === 'sm' ? '0.75rem' : size === 'md' ? '0.875rem' : '1rem',
    fontWeight: 600,
    cursor: disabled || isRunning ? 'not-allowed' : 'pointer',
    fontFamily: 'Heebo, sans-serif',
    opacity: disabled ? 0.6 : 1,
    ...getVariantStyles(),
    ...style,
  };

  const displayLabel = label || (isRunning ? '⏳ PROCESSING' : '▶️ RUN');

  return (
    <button
      onClick={onClick}
      disabled={disabled || isRunning}
      className={`run-button ${isRunning ? 'is-running' : ''} ${className}`}
      style={baseStyle}
    >
      {displayLabel}
    </button>
  );
}
