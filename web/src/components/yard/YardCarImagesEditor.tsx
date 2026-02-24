import { useState, useRef, useEffect } from 'react';
import { getAuth } from 'firebase/auth';
import {
  listCarImages,
  uploadCarImage,
  deleteCarImage,
  updateCarImagesOrder,
  type YardCarImage,
} from '../../api/yardImagesApi';
import ImageConfirmDialog from '../common/ImageConfirmDialog';
import { preprocessImageForUpload } from '../../utils/imagePreprocess';
import './YardCarImagesEditor.css';

const IMAGE_MAX_LONG_EDGE = 1920;
const IMAGE_JPEG_QUALITY = 0.85;
const IMAGE_SKIP_RECOMPRESS_MAX_BYTES = 900 * 1024;

interface YardCarImagesEditorProps {
  yardCarId: string;
  yardId: string;
  onImagesChanged?: (images: YardCarImage[]) => void;
}

export default function YardCarImagesEditor({
  yardCarId,
  yardId,
  onImagesChanged,
}: YardCarImagesEditorProps) {
  const [images, setImages] = useState<YardCarImage[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imagesError, setImagesError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ total: 0, completed: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [draggingImageId, setDraggingImageId] = useState<string | null>(null);
  const [dragOverImageId, setDragOverImageId] = useState<string | null>(null);
  const [imagesNotice, setImagesNotice] = useState<string | null>(null);
  const [pendingCameraFile, setPendingCameraFile] = useState<File | null>(null);
  const [pendingCameraPreviewUrl, setPendingCameraPreviewUrl] = useState<string | null>(null);
  const [isCameraConfirmOpen, setIsCameraConfirmOpen] = useState(false);
  const [isCameraConfirmSubmitting, setIsCameraConfirmSubmitting] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadedFingerprintsRef = useRef<Set<string>>(new Set());

  // Load images on mount
  useEffect(() => {
    loadImages();
  }, [yardCarId, yardId]);

  // Cleanup pending camera preview URL on unmount or when dialog is closed elsewhere
  useEffect(() => {
    return () => {
      if (pendingCameraPreviewUrl) {
        URL.revokeObjectURL(pendingCameraPreviewUrl);
      }
    };
  }, [pendingCameraPreviewUrl]);

  // Helper: Convert ArrayBuffer to hex string
  const toHex = (buffer: ArrayBuffer): string => {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };

  // Helper: Compute file hash (SHA-256 preferred, fallback to name|size|lastModified)
  const hashFileSha256 = async (file: File): Promise<string> => {
    try {
      if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
        const arrayBuffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        return toHex(hashBuffer);
      }
    } catch (err) {
      console.warn('SHA-256 hashing failed, using fallback:', err);
    }
    // Fallback: name|size|lastModified
    return `${file.name}|${file.size}|${file.lastModified}`;
  };

  const loadImages = async () => {
    setImagesLoading(true);
    setImagesError(null);
    try {
      const loadedImages = await listCarImages(yardId, yardCarId);
      const sortedImages = [...loadedImages].sort((a, b) => a.order - b.order);
      setImages(sortedImages);
      if (onImagesChanged) {
        onImagesChanged(sortedImages);
      }
    } catch (err: any) {
      console.error('Error loading images:', err);
      setImagesError('שגיאה בטעינת התמונות');
    } finally {
      setImagesLoading(false);
    }
  };

  // Handle file upload (from button or drag & drop)
  const handleFilesUpload = async (files: FileList | File[]) => {
    const auth = getAuth();
    if (!auth.currentUser) {
      setImagesError('נדרשת התחברות להעלאת תמונות');
      return;
    }

    if (!yardCarId) {
      setImagesError('שגיאה: מזהה רכב לא תקין');
      return;
    }

    // Clear previous notice
    setImagesNotice(null);

    const fileArray = Array.from(files);
    const preprocessedFiles: File[] = [];
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      if (!file.type.startsWith('image/')) {
        preprocessedFiles.push(file);
        continue;
      }
      try {
        const out = await preprocessImageForUpload(file, {
          maxLongEdge: IMAGE_MAX_LONG_EDGE,
          jpegQuality: IMAGE_JPEG_QUALITY,
          skipRecompressMaxBytes: IMAGE_SKIP_RECOMPRESS_MAX_BYTES,
        });
        preprocessedFiles.push(out);
      } catch {
        preprocessedFiles.push(file);
      }
    }

    const validFiles: File[] = [];
    const errors: string[] = [];

    // First pass: validate files (type and size)
    for (const file of preprocessedFiles) {
      if (!file.type.startsWith('image/')) {
        errors.push(`הקובץ ${file.name} אינו קובץ תמונה`);
        continue;
      }

      if (file.size > 5 * 1024 * 1024) {
        errors.push(`הקובץ ${file.name} גדול מדי (מקסימום 5MB)`);
        continue;
      }

      validFiles.push(file);
    }

    if (errors.length > 0) {
      setImagesError(errors.join('; '));
      return;
    }

    if (validFiles.length === 0) {
      return;
    }

    // Second pass: compute hashes and deduplicate
    const validFilesWithHash: Array<{ file: File; hash: string }> = [];
    for (const file of validFiles) {
      const hash = await hashFileSha256(file);
      validFilesWithHash.push({ file, hash });
    }

    // Build set of existing image hashes (only those with hash populated)
    const existingHashes = new Set<string>();
    images.forEach(img => {
      if (img.hash) {
        existingHashes.add(img.hash);
      }
    });

    // Deduplicate: filter out duplicates within the new selection and against existing images
    const seenHashes = new Set<string>();
    const dedupedFiles: Array<{ file: File; hash: string }> = [];
    let skippedCount = 0;

    for (const { file, hash } of validFilesWithHash) {
      // Skip if duplicate within new selection
      if (seenHashes.has(hash)) {
        skippedCount++;
        continue;
      }
      // Skip if hash already exists in current images for this car
      if (existingHashes.has(hash)) {
        skippedCount++;
        continue;
      }
      seenHashes.add(hash);
      dedupedFiles.push({ file, hash });
    }

    // Show notice if duplicates were skipped
    if (skippedCount > 0) {
      setImagesNotice(`דילגנו על ${skippedCount} תמונה${skippedCount > 1 ? 'ות' : ''} זהות שכבר קיימות לרכב הזה`);
    }

    // If all files are duplicates, don't start uploading
    if (dedupedFiles.length === 0) {
      return;
    }

    setIsUploading(true);
    setUploadProgress({ total: dedupedFiles.length, completed: 0 });
    setImagesError(null);

    try {
      for (let i = 0; i < dedupedFiles.length; i++) {
        const { file, hash } = dedupedFiles[i];
        const newImage = await uploadCarImage(auth.currentUser!.uid, yardCarId, file);
        
        // Track hash after successful upload
        uploadedFingerprintsRef.current.add(hash);
        
        setImages((prev) => {
          // Check if image already exists (in case API returned existing duplicate)
          const alreadyExists = prev.some(img => img.id === newImage.id);
          if (alreadyExists) {
            return prev;
          }
          const updated = [...prev, newImage].sort((a, b) => a.order - b.order);
          if (onImagesChanged) {
            onImagesChanged(updated);
          }
          return updated;
        });
        setUploadProgress({ total: dedupedFiles.length, completed: i + 1 });
      }
    } catch (err: any) {
      console.error('Error uploading images:', err);
      setImagesError('שגיאה בהעלאת התמונות');
    } finally {
      setIsUploading(false);
      setUploadProgress({ total: 0, completed: 0 });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Handle button upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await handleFilesUpload(files);
  };

  // Handle mark as main
  const handleMarkAsMain = async (image: YardCarImage) => {
    const auth = getAuth();
    if (!auth.currentUser || !yardCarId) {
      setImagesError('שגיאה בסימון התמונה הראשית');
      return;
    }

    try {
      // Reorder images: move selected image to position 0
      const otherImages = images.filter((img) => img.id !== image.id);
      const reordered = [image, ...otherImages];
      
      await updateCarImagesOrder(auth.currentUser.uid, yardCarId, reordered);
      
      setImages(reordered);
      if (onImagesChanged) {
        onImagesChanged(reordered);
      }
    } catch (err: any) {
      console.error('Error marking as main:', err);
      setImagesError('שגיאה בסימון התמונה הראשית');
    }
  };

  // Handle image delete
  const handleImageDelete = async (image: YardCarImage) => {
    if (!window.confirm('למחוק את התמונה הזו?')) {
      return;
    }

    const auth = getAuth();
    if (!auth.currentUser || !yardCarId) {
      setImagesError('שגיאה במחיקת התמונה');
      return;
    }

    try {
      await deleteCarImage(auth.currentUser.uid, yardCarId, image);
      const filtered = images.filter((img) => img.id !== image.id);
      const sorted = filtered.sort((a, b) => a.order - b.order);
      setImages(sorted);
      if (onImagesChanged) {
        onImagesChanged(sorted);
      }
    } catch (err: any) {
      console.error('Error deleting image:', err);
      setImagesError('שגיאה במחיקת התמונה');
    }
  };

  // Drag & drop handlers for image reordering
  const handleDragStart = (e: React.DragEvent, image: YardCarImage) => {
    setDraggingImageId(image.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetImage: YardCarImage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggingImageId && draggingImageId !== targetImage.id) {
      setDragOverImageId(targetImage.id);
    }
  };

  const handleDragLeave = () => {
    setDragOverImageId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetImage: YardCarImage) => {
    e.preventDefault();
    setDragOverImageId(null);

    if (!draggingImageId || draggingImageId === targetImage.id) {
      setDraggingImageId(null);
      return;
    }

    const auth = getAuth();
    if (!auth.currentUser || !yardCarId) {
      setDraggingImageId(null);
      return;
    }

    try {
      const draggedImage = images.find((img) => img.id === draggingImageId);
      if (!draggedImage) {
        setDraggingImageId(null);
        return;
      }

      const otherImages = images.filter((img) => img.id !== draggingImageId);
      const targetIndex = otherImages.findIndex((img) => img.id === targetImage.id);
      
      const reordered = [
        ...otherImages.slice(0, targetIndex),
        draggedImage,
        ...otherImages.slice(targetIndex),
      ];

      await updateCarImagesOrder(auth.currentUser.uid, yardCarId, reordered);
      setImages(reordered);
      if (onImagesChanged) {
        onImagesChanged(reordered);
      }
    } catch (err: any) {
      console.error('Error reordering images:', err);
      setImagesError('שגיאה בסידור התמונות');
    } finally {
      setDraggingImageId(null);
    }
  };

  // Drag & drop handlers for file upload
  const handleDropZoneDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await handleFilesUpload(files);
    }
  };

  const handleDropZoneDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  };

  const handleDropZoneDragLeave = () => {
    setIsDragging(false);
  };

  const handleDropZoneClick = () => {
    fileInputRef.current?.click();
  };

  const handleCameraButtonClick = () => {
    cameraInputRef.current?.click();
  };

  const handleCameraFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setImagesError('נא לבחור קובץ תמונה');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImagesError('הקובץ גדול מדי (מקסימום 5MB)');
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setPendingCameraFile(file);
    setPendingCameraPreviewUrl(previewUrl);
    setIsCameraConfirmOpen(true);
  };

  const handleCameraConfirmNo = () => {
    if (isCameraConfirmSubmitting) return;
    setIsCameraConfirmSubmitting(false);
    if (pendingCameraPreviewUrl) {
      URL.revokeObjectURL(pendingCameraPreviewUrl);
    }
    setPendingCameraPreviewUrl(null);
    setPendingCameraFile(null);
    setIsCameraConfirmOpen(false);
    setTimeout(() => handleCameraButtonClick(), 0);
  };

  const handleCameraConfirmYes = async () => {
    if (isCameraConfirmSubmitting) return;
    const file = pendingCameraFile;
    if (!file) return;
    setIsCameraConfirmSubmitting(true);
    if (pendingCameraPreviewUrl) {
      URL.revokeObjectURL(pendingCameraPreviewUrl);
    }
    setPendingCameraPreviewUrl(null);
    setPendingCameraFile(null);
    setIsCameraConfirmOpen(false);
    try {
      await handleFilesUpload([file]);
    } finally {
      setIsCameraConfirmSubmitting(false);
    }
  };

  return (
    <div className="yard-car-images-editor">
      {/* Drag & Drop Zone */}
      <div
        className={`images-drop-zone ${isDragging ? 'dragging' : ''}`}
        onDrop={handleDropZoneDrop}
        onDragOver={handleDropZoneDragOver}
        onDragLeave={handleDropZoneDragLeave}
        onClick={handleDropZoneClick}
      >
        <div className="drop-zone-content">
          <div className="drop-zone-icon">📤</div>
          <div className="drop-zone-title">גרור ושחרר קבצים או לחץ להעלאה</div>
          <div className="drop-zone-note">אפשר לבחור כמה תמונות יחד</div>
        </div>
      </div>

      {/* Hidden file input (multi upload) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleImageUpload}
        disabled={isUploading}
        style={{ display: 'none' }}
      />

      {/* Hidden camera input (single image, capture on mobile) */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCameraFileSelected}
        disabled={isUploading}
        style={{ display: 'none' }}
      />

      {/* Upload bar: Upload Photos + Camera */}
      <div className="images-upload-bar">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading
            ? `מעלה תמונות... (${uploadProgress.completed}/${uploadProgress.total})`
            : 'העלה תמונות'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleCameraButtonClick}
          disabled={isUploading}
        >
          מצלמה
        </button>
      </div>

      {/* Camera capture confirm dialog */}
      {pendingCameraPreviewUrl && (
        <ImageConfirmDialog
          isOpen={isCameraConfirmOpen}
          title="אישור תמונה"
          previewUrl={pendingCameraPreviewUrl}
          questionText="התמונה יצאה טוב?"
          confirmLabel="כן"
          cancelLabel="לא"
          onConfirm={handleCameraConfirmYes}
          onCancel={handleCameraConfirmNo}
          isSubmitting={isCameraConfirmSubmitting}
        />
      )}

      {/* Error message */}
      {imagesError && (
        <div className="images-error-message">
          {imagesError}
        </div>
      )}

      {/* Notice message */}
      {imagesNotice && (
        <div className="images-notice-message">
          {imagesNotice}
        </div>
      )}

      {/* Loading state */}
      {imagesLoading ? (
        <div className="images-loading">
          <p>טוען תמונות...</p>
        </div>
      ) : (
        <>
          {/* Empty state */}
          {images.length === 0 && !isUploading && (
            <div className="images-empty">
              <p>אין תמונות עדיין</p>
            </div>
          )}

          {/* Images gallery */}
          {images.length > 0 && (
            <div className="images-gallery">
              {images.map((image) => (
                <div
                  key={image.id}
                  className={`image-thumbnail-wrapper ${
                    draggingImageId === image.id ? 'dragging' : ''
                  } ${dragOverImageId === image.id ? 'drag-over' : ''}`}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, image)}
                  onDragOver={(e) => handleDragOver(e, image)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, image)}
                >
                  {image.order === 0 && (
                    <div className="image-main-badge">תמונה ראשית</div>
                  )}
                  <img
                    src={image.originalUrl}
                    alt={`תמונה ${image.order + 1}`}
                    className="image-thumbnail"
                  />
                  <div className="image-actions">
                    {image.order !== 0 && (
                      <button
                        type="button"
                        className="image-mark-main-btn"
                        onClick={() => handleMarkAsMain(image)}
                        title="סמן כראשית"
                      >
                        ראשית
                      </button>
                    )}
                    <button
                      type="button"
                      className="image-delete-btn"
                      onClick={() => handleImageDelete(image)}
                      title="מחק תמונה"
                    >
                      מחק
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

