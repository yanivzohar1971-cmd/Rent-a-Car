import { useState, useRef, useEffect } from 'react';
import { getAuth } from 'firebase/auth';
import {
  listCarImages,
  uploadCarImage,
  deleteCarImage,
  updateCarImagesOrder,
  type YardCarImage,
} from '../../api/yardImagesApi';
import './YardCarImagesEditor.css';

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
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load images on mount
  useEffect(() => {
    loadImages();
  }, [yardCarId, yardId]);

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

    const fileArray = Array.from(files);
    const validFiles: File[] = [];
    const errors: string[] = [];

    for (const file of fileArray) {
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

    setIsUploading(true);
    setUploadProgress({ total: validFiles.length, completed: 0 });
    setImagesError(null);

    try {
      for (let i = 0; i < validFiles.length; i++) {
        const newImage = await uploadCarImage(auth.currentUser!.uid, yardCarId, validFiles[i]);
        setImages((prev) => {
          const updated = [...prev, newImage].sort((a, b) => a.order - b.order);
          if (onImagesChanged) {
            onImagesChanged(updated);
          }
          return updated;
        });
        setUploadProgress({ total: validFiles.length, completed: i + 1 });
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

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleImageUpload}
        disabled={isUploading}
        style={{ display: 'none' }}
      />

      {/* Upload button (alternative to drag & drop) */}
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
      </div>

      {/* Error message */}
      {imagesError && (
        <div className="images-error-message">
          {imagesError}
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

