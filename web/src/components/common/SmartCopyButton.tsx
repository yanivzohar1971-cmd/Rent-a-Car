/**
 * SmartCopyButton - Reusable Copy Button Component
 * 
 * Matches ADMIN copy behavior exactly:
 * - Click → immediate clipboard write
 * - Button text changes to "Copied" for 1750ms
 * - Button disabled during "Copied" state
 * - No popups/toasts/modals by default
 * - Silent error handling (console.error only)
 * 
 * Supports both plain text and JSON modes.
 * 
 * Source of Truth: web/src/pages/admin/DebugConsolePage.tsx (lines 658-677)
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { safeStringify } from '../../adminDebug/safeStringify';

export interface SmartCopyButtonProps {
  // Content to copy (choose one strategy)
  getText?: () => string | Promise<string>;  // Build on click (preferred)
  text?: string;                             // Direct text
  getValue?: () => unknown | Promise<unknown>; // Build JSON on click
  value?: unknown;                          // Direct JSON value
  
  // Mode
  mode?: 'text' | 'json';  // Default: 'json'
  
  // Labels (ADMIN defaults)
  label?: string;          // Default: "Copy JSON" for json mode, "Copy" for text mode
  copiedLabel?: string;    // Default: "Copied"
  failedLabel?: string;    // Default: "Copy Failed" (shown briefly if enabled)
  
  // Appearance
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';        // Default: undefined (use className)
  variant?: 'admin' | 'primary' | 'secondary' | 'icon';  // Default: undefined
  style?: React.CSSProperties;      // Inline styles
  
  // Callbacks
  onCopied?: (text: string) => void;
  onError?: (err: unknown) => void;
  
  // Extras (MUST default OFF to match ADMIN)
  enablePopupOnFailure?: boolean;  // Default: false
  enableDevLog?: boolean;          // Default: false
  
  // Advanced
  resetDelayMs?: number;  // Default: 1750 (ADMIN "ChatGPT-style timing")
}

/**
 * SmartCopyButton Component
 * 
 * Default behavior matches ADMIN exactly:
 * - "Copy JSON" → clipboard → "Copied" → reset after 1750ms
 */
export function SmartCopyButton({
  getText,
  text,
  getValue,
  value,
  mode = 'json',
  label,
  copiedLabel = 'Copied',
  failedLabel = 'Copy Failed',
  disabled = false,
  className,
  size,
  variant,
  style,
  onCopied,
  onError,
  enablePopupOnFailure = false,
  enableDevLog = false,
  resetDelayMs = 1750,
}: SmartCopyButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  // Determine default label based on mode
  const defaultLabel = mode === 'json' ? 'Copy JSON' : 'Copy';
  const displayLabel = label ?? defaultLabel;
  
  // Handle copy click
  const handleCopy = useCallback(async () => {
    if (disabled || state === 'copied') return;
    
    // Clear any existing timeout (debounce)
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    try {
      // Build text to copy
      let textToCopy: string;
      
      if (mode === 'json') {
        // JSON mode: stringify value (with Firestore Timestamp support)
        const jsonValue = getValue ? await getValue() : value;
        if (jsonValue === undefined || jsonValue === null) {
          throw new Error('No value to copy');
        }
        textToCopy = safeStringify(jsonValue, 2);
      } else {
        // Text mode: use text directly
        textToCopy = getText ? await getText() : (text ?? '');
        if (!textToCopy) {
          throw new Error('No text to copy');
        }
      }
      
      // Copy to clipboard (ADMIN uses only modern API, no fallback)
      await navigator.clipboard.writeText(textToCopy);
      
      if (enableDevLog) {
        console.log('[SmartCopyButton] Copied to clipboard:', textToCopy.substring(0, 100));
      }
      
      // Set success state
      setState('copied');
      
      // Callback
      if (onCopied) {
        onCopied(textToCopy);
      }
      
      // Reset after delay (ADMIN default: 1750ms)
      timeoutRef.current = setTimeout(() => {
        setState('idle');
        timeoutRef.current = null;
      }, resetDelayMs);
      
    } catch (err) {
      console.error('[SmartCopyButton] Failed to copy:', err);
      
      // Set failed state briefly (if enabled)
      if (enablePopupOnFailure) {
        setState('failed');
        timeoutRef.current = setTimeout(() => {
          setState('idle');
          timeoutRef.current = null;
        }, 2000);
      }
      
      // Callback
      if (onError) {
        onError(err);
      }
      
      // Optional popup (ADMIN does NOT use this by default)
      if (enablePopupOnFailure) {
        alert('Failed to copy to clipboard');
      }
    }
  }, [
    disabled,
    state,
    mode,
    getValue,
    value,
    getText,
    text,
    enableDevLog,
    onCopied,
    onError,
    enablePopupOnFailure,
    resetDelayMs,
  ]);
  
  // Compute button classes
  const computedClassName = [
    className,
    size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '',
    variant === 'admin' ? 'debug-btn debug-btn-small' : 
    variant === 'primary' ? 'debug-action-btn debug-btn-primary' : 
    variant === 'secondary' ? 'debug-action-btn debug-btn-secondary' :
    variant === 'icon' ? 'debug-tech-copy' : '',
  ].filter(Boolean).join(' ');
  
  // Button content based on state
  const buttonContent = state === 'copied' ? copiedLabel : 
                        state === 'failed' ? failedLabel : 
                        displayLabel;
  
  // Title attribute
  const title = state === 'copied' ? 'Copied' : 
                state === 'failed' ? 'Copy failed' : 
                'Copy';
  
  return (
    <button
      className={computedClassName || undefined}
      onClick={handleCopy}
      disabled={disabled || state === 'copied'}
      title={title}
      type="button"
      style={style}
    >
      {buttonContent}
    </button>
  );
}

/**
 * SmartCopyIconButton - Icon-only variant (for ADMIN tech copy buttons)
 * 
 * Shows emoji: 📋 (idle) → ✓ (copied)
 */
export function SmartCopyIconButton({
  getText,
  text,
  getValue,
  value,
  mode = 'text',
  disabled = false,
  className = 'debug-tech-copy',
  onCopied,
  onError,
  enableDevLog = false,
}: Pick<SmartCopyButtonProps, 'getText' | 'text' | 'getValue' | 'value' | 'mode' | 'disabled' | 'className' | 'onCopied' | 'onError' | 'enableDevLog'>) {
  const [state, setState] = useState<'idle' | 'copied'>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  const handleCopy = useCallback(async () => {
    if (disabled || state === 'copied') return;
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    try {
      let textToCopy: string;
      
      if (mode === 'json') {
        const jsonValue = getValue ? await getValue() : value;
        if (jsonValue === undefined || jsonValue === null) {
          throw new Error('No value to copy');
        }
        textToCopy = safeStringify(jsonValue, 2);
      } else {
        textToCopy = getText ? await getText() : (text ?? '');
        if (!textToCopy) {
          throw new Error('No text to copy');
        }
      }
      
      await navigator.clipboard.writeText(textToCopy);
      
      if (enableDevLog) {
        console.log('[SmartCopyIconButton] Copied:', textToCopy.substring(0, 50));
      }
      
      setState('copied');
      
      if (onCopied) {
        onCopied(textToCopy);
      }
      
      timeoutRef.current = setTimeout(() => {
        setState('idle');
        timeoutRef.current = null;
      }, 1750);
      
    } catch (err) {
      console.error('[SmartCopyIconButton] Failed to copy:', err);
      if (onError) {
        onError(err);
      }
    }
  }, [disabled, state, mode, getValue, value, getText, text, enableDevLog, onCopied, onError]);
  
  return (
    <button
      className={className}
      onClick={handleCopy}
      disabled={disabled || state === 'copied'}
      title={state === 'copied' ? 'Copied' : 'Copy'}
      type="button"
    >
      {state === 'copied' ? '✓' : '📋'}
    </button>
  );
}
