/**
 * JsonView Component
 * 
 * Forces JSON to render LTR (left-to-right) regardless of parent RTL context.
 * Ensures code-like readability for JSON data.
 */

import React from 'react';

export interface JsonViewProps {
  value: any;
  className?: string;
  maxHeight?: number;
  style?: React.CSSProperties;
}

export function JsonView({ value, className = '', maxHeight, style = {} }: JsonViewProps) {
  const jsonString = JSON.stringify(value, null, 2);
  
  const baseStyle: React.CSSProperties = {
    direction: 'ltr',
    unicodeBidi: 'embed',
    textAlign: 'left',
    whiteSpace: 'pre',
    overflow: 'auto',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    background: '#f5f5f5',
    padding: '1rem',
    borderRadius: '8px',
    fontSize: '0.875rem',
    wordBreak: 'break-word',
    ...(maxHeight ? { maxHeight: `${maxHeight}px` } : {}),
    ...style,
  };

  return (
    <pre className={className} style={baseStyle}>
      {jsonString}
    </pre>
  );
}
