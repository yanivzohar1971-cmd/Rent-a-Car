import { useState, useRef, useCallback } from 'react';
import './LogoDropzone.css';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ACCEPTED_FORMATS = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const ACCEPTED_EXTENSIONS = ['.svg', '.png', '.jpg', '.jpeg', '.webp'];

interface LogoDropzoneProps {
  currentLogoUrl?: string;
  onFileSelect: (file: File | null) => void;
  onFileRemove?: () => void;
  disabled?: boolean;
  error?: string | null;
}

export default function LogoDropzone({
  currentLogoUrl,
  onFileSelect,
  onFileRemove,
  disabled = false,
  error: externalError,
}: LogoDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentLogoUrl || null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return `הקובץ גדול מדי. גודל מקסימלי: ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(1)}MB`;
    }

    // Check file type
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    const isValidType = 
      ACCEPTED_FORMATS.includes(file.type) || 
      ACCEPTED_EXTENSIONS.includes(fileExtension);

    if (!isValidType) {
      return `פורמט לא נתמך. נא לבחור קובץ: ${ACCEPTED_EXTENSIONS.join(', ')}`;
    }

    return null;
  };

  const handleFile = useCallback((file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSelectedFile(file);

    // Create preview URL
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    // Notify parent
    onFileSelect(file);
  }, [onFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, [disabled, handleFile]);

  const handleBrowseClick = useCallback(() => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [disabled]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  const handleRemove = useCallback(() => {
    if (selectedFile && previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(currentLogoUrl || null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onFileSelect(null);
    if (onFileRemove) {
      onFileRemove();
    }
  }, [selectedFile, previewUrl, currentLogoUrl, onFileSelect, onFileRemove]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleBrowseClick();
    }
  }, [handleBrowseClick]);

  const displayError = externalError || error;

  return (
    <div className="logo-dropzone-container">
      <div
        className={`logo-dropzone ${isDragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''} ${displayError ? 'error' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleBrowseClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="העלאת לוגו - גרור קובץ או לחץ לדפדוף"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(',')}
          onChange={handleFileInputChange}
          disabled={disabled}
          className="logo-dropzone-input"
          aria-hidden="true"
        />

        {previewUrl ? (
          <div className="logo-dropzone-preview">
            <img 
              src={previewUrl} 
              alt="תצוגה מקדימה של הלוגו"
              className="logo-preview-image"
            />
            {!disabled && (
              <div className="logo-dropzone-overlay">
                <button
                  type="button"
                  className="logo-dropzone-replace-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBrowseClick();
                  }}
                  aria-label="החלף קובץ"
                >
                  החלף קובץ
                </button>
                {selectedFile && (
                  <button
                    type="button"
                    className="logo-dropzone-remove-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove();
                    }}
                    aria-label="הסר קובץ"
                  >
                    הסר
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="logo-dropzone-empty">
            <div className="logo-dropzone-icon">📁</div>
            <p className="logo-dropzone-text">
              גרור קובץ לכאן או לחץ לדפדוף
            </p>
            <p className="logo-dropzone-hint">
              SVG, PNG, JPG, WEBP (עד 2MB)
            </p>
          </div>
        )}

        {selectedFile && (
          <div className="logo-dropzone-file-info">
            <span className="logo-dropzone-file-name">{selectedFile.name}</span>
            <span className="logo-dropzone-file-size">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </span>
          </div>
        )}
      </div>

      {displayError && (
        <div className="logo-dropzone-error-message" role="alert">
          {displayError}
        </div>
      )}
    </div>
  );
}
