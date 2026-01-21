/**
 * 🐞 DEBUG Action Button
 * 
 * Unified debug button component with standard emoji vocabulary.
 * Used across Admin Debug Console and public car cards.
 */

import React from 'react';

export interface DebugActionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  style?: React.CSSProperties;
  title?: string;
}

export function DebugActionButton({
  onClick,
  disabled = false,
  className = '',
  size = 'sm',
  style = {},
  title = 'Debug',
}: DebugActionButtonProps) {
  const baseStyle: React.CSSProperties = {
    background: '#2f80ed',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    padding: size === 'sm' ? '0.375rem 0.75rem' : size === 'md' ? '0.5rem 1rem' : '0.75rem 1.25rem',
    fontSize: size === 'sm' ? '0.75rem' : size === 'md' ? '0.875rem' : '1rem',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
    fontFamily: 'Heebo, sans-serif',
    opacity: disabled ? 0.6 : 1,
    ...style,
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`debug-action-button ${className}`}
      style={baseStyle}
      title={title}
    >
      🐞 DEBUG
    </button>
  );
}
