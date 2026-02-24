/**
 * ImageConfirmDialog - Confirmation dialog with image preview (e.g. after camera capture).
 * Esc key treats as cancel (discard).
 */

import { useEffect } from 'react';
import './ImageConfirmDialog.css';

interface ImageConfirmDialogProps {
  isOpen: boolean;
  title: string;
  previewUrl: string;
  questionText: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export default function ImageConfirmDialog({
  isOpen,
  title,
  previewUrl,
  questionText,
  confirmLabel = 'כן',
  cancelLabel = 'לא',
  onConfirm,
  onCancel,
  isSubmitting = false,
}: ImageConfirmDialogProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!isSubmitting) onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onCancel]);

  if (!isOpen) return null;

  const handleOverlayClick = () => {
    if (!isSubmitting) onCancel();
  };

  return (
    <div className="image-confirm-dialog-overlay" onClick={handleOverlayClick}>
      <div
        className="image-confirm-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-confirm-title"
      >
        <h3 id="image-confirm-title" className="image-confirm-dialog-title">{title}</h3>
        <div className="image-confirm-dialog-preview">
          <img src={previewUrl} alt="" className="image-confirm-dialog-img" />
        </div>
        <p className="image-confirm-dialog-question">{questionText}</p>
        <div className="image-confirm-dialog-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
