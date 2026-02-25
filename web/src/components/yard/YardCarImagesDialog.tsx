import { useState, useEffect } from 'react';
import YardCarImagesEditor from './YardCarImagesEditor';
import type { YardCarImage } from '../../api/yardImagesApi';
import LicensePlateBadge from '../common/LicensePlateBadge';
import './YardCarImagesDialog.css';

interface YardCarImagesDialogProps {
  open: boolean;
  yardId: string;
  carId: string;
  carTitle?: string;
  licensePlatePartial?: string | null;
  initialImageCount?: number;
  onClose: () => void;
  onImagesUpdated?: (count: number) => void;
}

export default function YardCarImagesDialog({
  open,
  yardId,
  carId,
  carTitle,
  licensePlatePartial,
  initialImageCount = 0,
  onClose,
  onImagesUpdated,
}: YardCarImagesDialogProps) {
  const [, setImageCount] = useState(initialImageCount);

  useEffect(() => {
    if (open) {
      setImageCount(initialImageCount);
    }
  }, [open, initialImageCount]);

  const handleImagesChanged = (images: YardCarImage[]) => {
    const newCount = images.length;
    setImageCount(newCount);
    if (onImagesUpdated) {
      onImagesUpdated(newCount);
    }
  };

  const handleClose = () => {
    onClose();
  };

  if (!open) return null;

  return (
    <div className="yard-car-images-dialog-overlay" onClick={handleClose}>
      <div className="yard-car-images-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="yard-car-images-dialog-header">
          <div>
            <h2>תמונות הרכב</h2>
            <div className="dialog-subtitle-row">
              {carTitle && (
                <p className="dialog-subtitle">{carTitle}</p>
              )}
              {licensePlatePartial && (
                <LicensePlateBadge plate={licensePlatePartial} size="md" />
              )}
            </div>
            <p className="yard-car-images-dialog-build-stamp" aria-hidden="true">
              build: 2026-02-24-CAR-IMAGES-NOCONFIRM
            </p>
          </div>
          <button
            className="yard-car-images-dialog-close"
            onClick={handleClose}
            aria-label="סגור"
          >
            ×
          </button>
          <span
            aria-hidden="true"
            style={{
              fontSize: '12px',
              padding: '4px 8px',
              border: '1px solid #ccc',
              background: '#f5f5f5',
              borderRadius: '4px',
              flexShrink: 0,
              alignSelf: 'flex-start',
            }}
          >
            BUILD 2026-02-24 NOCONFIRM
          </span>
        </div>

        <div className="yard-car-images-dialog-body">
          <YardCarImagesEditor
            yardCarId={carId}
            yardId={yardId}
            onImagesChanged={handleImagesChanged}
          />
        </div>

        <div className="yard-car-images-dialog-footer">
          <button
            className="btn btn-primary"
            onClick={handleClose}
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}

