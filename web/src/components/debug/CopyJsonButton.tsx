/**
 * 🗐 COPY JSON Button
 * 
 * Unified copy JSON button component wrapping SmartCopyButton
 * with standard emoji vocabulary.
 */

import type { SmartCopyButtonProps } from '../common/SmartCopyButton';
import { SmartCopyButton } from '../common/SmartCopyButton';

export interface CopyJsonButtonProps extends Omit<SmartCopyButtonProps, 'label'> {
  label?: string; // Override default "🗐 COPY JSON" if needed
}

export function CopyJsonButton({
  label = '🗐 COPY JSON',
  ...smartCopyProps
}: CopyJsonButtonProps) {
  return (
    <SmartCopyButton
      {...smartCopyProps}
      label={label}
      mode={smartCopyProps.mode || 'json'}
    />
  );
}
