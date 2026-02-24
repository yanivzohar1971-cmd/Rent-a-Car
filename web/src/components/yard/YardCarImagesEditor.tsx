import { useState, useRef, useEffect } from 'react';
import { getAuth } from 'firebase/auth';
import {
  listCarImages,
  uploadCarImageWithProgress,
  deleteCarImage,
  updateCarImagesOrder,
  type YardCarImage,
} from '../../api/yardImagesApi';
import ImageConfirmDialog from '../common/ImageConfirmDialog';
import ConfirmDialog from '../common/ConfirmDialog';
import { preprocessImageForUpload } from '../../utils/imagePreprocess';
import './YardCarImagesEditor.css';

const IMAGE_MAX_LONG_EDGE = 1920;
const IMAGE_JPEG_QUALITY = 0.85;
const IMAGE_SKIP_RECOMPRESS_MAX_BYTES = 900 * 1024;

type UploadStatus = 'uploading' | 'done' | 'error';
type UploadEntry = {
  id: string;
  file: File;
  localPreviewUrl: string;
  progress: number;
  status: UploadStatus;
  error?: string | null;
};

type SerialQueueStatus = 'queued' | 'uploading' | 'error';
type SerialQueueItem = {
  id: string;
  file: File;
  previewUrl: string;
  status: SerialQueueStatus;
  error?: string | null;
  progress?: number;
};

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
  const [uploadEntries, setUploadEntries] = useState<Record<string, UploadEntry>>({});
  const [serialQueue, setSerialQueue] = useState<SerialQueueItem[]>([]);
  const [isSerialMode, setIsSerialMode] = useState(false);
  const [serialPendingFile, setSerialPendingFile] = useState<File | null>(null);
  const [serialPendingPreviewUrl, setSerialPendingPreviewUrl] = useState<string | null>(null);
  const [isSerialConfirmOpen, setIsSerialConfirmOpen] = useState(false);
  const [isSerialConfirmSubmitting, setIsSerialConfirmSubmitting] = useState(false);
  const [isClearQueueConfirmOpen, setIsClearQueueConfirmOpen] = useState(false);
  const [isSerialUploading, setIsSerialUploading] = useState(false);
  const [serialUploadTotal, setSerialUploadTotal] = useState(0);
  const [serialUploadDone, setSerialUploadDone] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadedFingerprintsRef = useRef<Set<string>>(new Set());
  const uploadEntryIdRef = useRef(0);
  const uploadEntriesRef = useRef<Record<string, UploadEntry>>({});
  uploadEntriesRef.current = uploadEntries;
  const serialQueueRef = useRef<SerialQueueItem[]>([]);
  serialQueueRef.current = serialQueue;
  const serialPendingPreviewUrlRef = useRef<string | null>(null);
  serialPendingPreviewUrlRef.current = serialPendingPreviewUrl;

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

  // Revoke upload entry object URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(uploadEntriesRef.current).forEach((e) => {
        URL.revokeObjectURL(e.localPreviewUrl);
      });
    };
  }, []);

  // Revoke serial queue and serial pending URLs on unmount
  useEffect(() => {
    return () => {
      serialQueueRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      const pending = serialPendingPreviewUrlRef.current;
      if (pending) URL.revokeObjectURL(pending);
    };
  }, []);

  const updateUploadProgress = (entryId: string, progress: number) => {
    setUploadEntries((prev) => {
      const e = prev[entryId];
      if (!e) return prev;
      return { ...prev, [entryId]: { ...e, progress } };
    });
  };

  const markUploadError = (entryId: string, error: string) => {
    setUploadEntries((prev) => {
      const e = prev[entryId];
      if (!e) return prev;
      return { ...prev, [entryId]: { ...e, status: 'error', error } };
    });
  };

  const removeUploadEntry = (entryId: string) => {
    setUploadEntries((prev) => {
      const e = prev[entryId];
      if (e) URL.revokeObjectURL(e.localPreviewUrl);
      const next = { ...prev };
      delete next[entryId];
      return next;
    });
  };

  const retryUploadEntry = async (entryId: string) => {
    const entry = uploadEntries[entryId];
    if (!entry || entry.status !== 'error') return;
    const auth = getAuth();
    if (!auth.currentUser || !yardCarId) return;
    setUploadEntries((prev) => ({
      ...prev,
      [entryId]: { ...entry, status: 'uploading', progress: 0, error: null },
    }));
    try {
      const newImage = await uploadCarImageWithProgress(
        auth.currentUser.uid,
        yardCarId,
        entry.file,
        (p) => updateUploadProgress(entryId, p)
      );
      uploadedFingerprintsRef.current.add(await hashFileSha256(entry.file));
      removeUploadEntry(entryId);
      setImages((prev) => {
        const alreadyExists = prev.some((img) => img.id === newImage.id);
        if (alreadyExists) return prev;
        const updated = [...prev, newImage].sort((a, b) => a.order - b.order);
        if (onImagesChanged) onImagesChanged(updated);
        return updated;
      });
    } catch (err: any) {
      markUploadError(entryId, err?.message || 'שגיאה בהעלאה');
    }
  };

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

    const newEntries: Record<string, UploadEntry> = {};
    const entryIds: string[] = [];
    for (const { file } of dedupedFiles) {
      const id = `upload_${++uploadEntryIdRef.current}_${Date.now()}`;
      newEntries[id] = {
        id,
        file,
        localPreviewUrl: URL.createObjectURL(file),
        progress: 0,
        status: 'uploading',
        error: null,
      };
      entryIds.push(id);
    }
    setUploadEntries((prev) => ({ ...prev, ...newEntries }));

    let completedCount = 0;
    try {
      for (let i = 0; i < dedupedFiles.length; i++) {
        const { file, hash } = dedupedFiles[i];
        const entryId = entryIds[i];
        try {
          const newImage = await uploadCarImageWithProgress(
            auth.currentUser!.uid,
            yardCarId,
            file,
            (p) => updateUploadProgress(entryId, p)
          );
          uploadedFingerprintsRef.current.add(hash);
          removeUploadEntry(entryId);
          completedCount++;
          setUploadProgress({ total: dedupedFiles.length, completed: completedCount });
          setImages((prev) => {
            const alreadyExists = prev.some((img) => img.id === newImage.id);
            if (alreadyExists) return prev;
            const updated = [...prev, newImage].sort((a, b) => a.order - b.order);
            if (onImagesChanged) onImagesChanged(updated);
            return updated;
          });
        } catch (err: any) {
          console.error('Error uploading image:', err);
          markUploadError(entryId, err?.message || 'שגיאה בהעלאת התמונות');
        }
      }
    } finally {
      setIsUploading(false);
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
    if (isSerialMode) {
      const previewUrl = URL.createObjectURL(file);
      setSerialPendingFile(file);
      setSerialPendingPreviewUrl(previewUrl);
      setIsSerialConfirmOpen(true);
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setPendingCameraFile(file);
    setPendingCameraPreviewUrl(previewUrl);
    setIsCameraConfirmOpen(true);
  };

  const handleSerialConfirmNo = () => {
    if (isSerialConfirmSubmitting) return;
    if (serialPendingPreviewUrl) URL.revokeObjectURL(serialPendingPreviewUrl);
    setSerialPendingPreviewUrl(null);
    setSerialPendingFile(null);
    setIsSerialConfirmOpen(false);
    setTimeout(() => handleCameraButtonClick(), 0);
  };

  const handleSerialConfirmYes = () => {
    if (isSerialConfirmSubmitting) return;
    const file = serialPendingFile;
    const previewUrl = serialPendingPreviewUrl;
    if (!file || !previewUrl) return;
    setIsSerialConfirmSubmitting(true);
    setSerialPendingPreviewUrl(null);
    setSerialPendingFile(null);
    setIsSerialConfirmOpen(false);
    const id = `serial_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setSerialQueue((prev) => [...prev, { id, file, previewUrl, status: 'queued', progress: 0 }]);
    setTimeout(() => handleCameraButtonClick(), 0);
    setTimeout(() => setIsSerialConfirmSubmitting(false), 0);
  };

  const removeFromSerialQueue = (id: string) => {
    setSerialQueue((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleClearQueueClick = () => {
    if (isSerialUploading) return;
    setIsClearQueueConfirmOpen(true);
  };

  const handleClearQueueConfirm = () => {
    setSerialQueue((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return [];
    });
    setIsClearQueueConfirmOpen(false);
    setSerialUploadTotal(0);
    setSerialUploadDone(0);
  };

  const updateSerialQueueItem = (id: string, patch: Partial<SerialQueueItem>) => {
    setSerialQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const uploadOneSerialItem = async (item: SerialQueueItem): Promise<boolean> => {
    const auth = getAuth();
    if (!auth.currentUser || !yardCarId) return false;
    let file = item.file;
    if (file.type.startsWith('image/')) {
      try {
        file = await preprocessImageForUpload(file, {
          maxLongEdge: IMAGE_MAX_LONG_EDGE,
          jpegQuality: IMAGE_JPEG_QUALITY,
          skipRecompressMaxBytes: IMAGE_SKIP_RECOMPRESS_MAX_BYTES,
        });
      } catch {
        // keep original
      }
    }
    if (file.size > 5 * 1024 * 1024) {
      updateSerialQueueItem(item.id, { status: 'error', error: 'הקובץ גדול מדי (מקסימום 5MB)' });
      return false;
    }
    const hash = await hashFileSha256(file);
    const existingHashes = new Set(images.map((img) => img.hash).filter(Boolean));
    if (existingHashes.has(hash)) {
      removeFromSerialQueue(item.id);
      setSerialUploadDone((d) => d + 1);
      return true;
    }
    updateSerialQueueItem(item.id, { status: 'uploading', progress: 0, error: null });
    try {
      const newImage = await uploadCarImageWithProgress(
        auth.currentUser.uid,
        yardCarId,
        file,
        (p) => updateSerialQueueItem(item.id, { progress: p })
      );
      uploadedFingerprintsRef.current.add(hash);
      removeFromSerialQueue(item.id);
      setSerialUploadDone((d) => d + 1);
      setImages((prev) => {
        const alreadyExists = prev.some((img) => img.id === newImage.id);
        if (alreadyExists) return prev;
        const updated = [...prev, newImage].sort((a, b) => a.order - b.order);
        if (onImagesChanged) onImagesChanged(updated);
        return updated;
      });
      return true;
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'שגיאה בהעלאה';
      updateSerialQueueItem(item.id, { status: 'error', error: message, progress: 0 });
      return false;
    }
  };

  const handleUploadSerialQueue = async () => {
    const queue = serialQueue.filter((s) => s.status === 'queued' || s.status === 'error');
    if (queue.length === 0) return;
    const auth = getAuth();
    if (!auth.currentUser || !yardCarId) {
      setImagesError('נדרשת התחברות להעלאת תמונות');
      return;
    }
    setImagesError(null);
    setImagesNotice(null);
    setIsSerialUploading(true);
    const total = serialQueue.length;
    setSerialUploadTotal(total);
    setSerialUploadDone(0);
    try {
      const idsToProcess = queue.map((s) => s.id);
      for (const id of idsToProcess) {
        const item = serialQueueRef.current.find((s) => s.id === id);
        if (!item || (item.status !== 'queued' && item.status !== 'error')) continue;
        await uploadOneSerialItem(item);
      }
    } finally {
      setIsSerialUploading(false);
      if (serialQueueRef.current.length === 0) {
        setIsSerialMode(false);
      }
    }
  };

  const retrySerialItem = async (id: string) => {
    const item = serialQueue.find((s) => s.id === id);
    if (!item || item.status !== 'error') return;
    const auth = getAuth();
    if (!auth.currentUser || !yardCarId) return;
    const success = await uploadOneSerialItem(item);
    if (success) {
      setSerialQueue((prev) => {
        if (prev.length === 0) setIsSerialMode(false);
        return prev;
      });
    }
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
          onClick={() => {
            setIsSerialMode(false);
            handleCameraButtonClick();
          }}
          disabled={isUploading || isSerialUploading}
        >
          מצלמה
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setIsSerialMode(true);
            handleCameraButtonClick();
          }}
          disabled={isUploading || isSerialUploading}
        >
          צילום סדרתי
        </button>
        {isSerialMode && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setIsSerialMode(false)}
          >
            סיים צילום
          </button>
        )}
      </div>

      {/* Serial queue section */}
      {serialQueue.length > 0 && (
        <div className="serial-queue">
          <div className="serial-queue-header">תמונות לצילום סדרתי</div>
          <div className="serial-queue-count">
            {isSerialUploading
              ? `מעלה ${serialUploadDone} מתוך ${serialUploadTotal}`
              : serialQueue.some((s) => s.status === 'error')
                ? `הועלו ${serialUploadDone} מתוך ${serialUploadTotal}. ${serialQueue.filter((s) => s.status === 'error').length} נכשלו`
                : `נבחרו ${serialQueue.length} תמונות`}
          </div>
          <div className="serial-queue-grid">
            {serialQueue.map((item) => (
              <div key={item.id} className={`serial-queue-thumb ${item.status === 'error' ? 'serial-queue-thumb-error' : ''}`}>
                <img src={item.previewUrl} alt="" />
                {item.status === 'uploading' && (
                  <div className="serial-queue-overlay">
                    <div className="upload-bar-track">
                      <div className="upload-bar-fill" style={{ width: `${item.progress ?? 0}%` }} />
                    </div>
                    <span className="serial-queue-progress-pct">{item.progress ?? 0}%</span>
                  </div>
                )}
                {item.status === 'error' && (
                  <div className="serial-queue-overlay serial-queue-error-state">
                    <span className="upload-error-text">שגיאה</span>
                    <button type="button" className="upload-retry-btn" onClick={() => retrySerialItem(item.id)}>
                      נסה שוב
                    </button>
                  </div>
                )}
                {!isSerialUploading && item.status !== 'uploading' && (
                  <button
                    type="button"
                    className="serial-queue-remove"
                    onClick={() => removeFromSerialQueue(item.id)}
                    aria-label="הסר"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="serial-queue-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleUploadSerialQueue}
              disabled={isUploading || isSerialUploading}
            >
              העלה {serialQueue.length} תמונות
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClearQueueClick}
              disabled={isSerialUploading}
            >
              נקה הכל
            </button>
          </div>
        </div>
      )}

      {/* Camera capture confirm dialog (single) */}
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

      {/* Serial capture confirm dialog */}
      {serialPendingPreviewUrl && (
        <ImageConfirmDialog
          isOpen={isSerialConfirmOpen}
          title="אישור תמונה"
          previewUrl={serialPendingPreviewUrl}
          questionText="התמונה יצאה טוב?"
          confirmLabel="כן"
          cancelLabel="לא"
          onConfirm={handleSerialConfirmYes}
          onCancel={handleSerialConfirmNo}
          isSubmitting={isSerialConfirmSubmitting}
        />
      )}

      {/* Clear queue confirm */}
      <ConfirmDialog
        isOpen={isClearQueueConfirmOpen}
        title="ניקוי תור"
        message="לנקות את כל התמונות בתור?"
        confirmLabel="נקה"
        cancelLabel="ביטול"
        onConfirm={handleClearQueueConfirm}
        onCancel={() => setIsClearQueueConfirmOpen(false)}
      />

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

      {/* Overall upload progress bar */}
      {Object.keys(uploadEntries).length > 0 && (() => {
        const entries = Object.values(uploadEntries);
        const uploading = entries.filter((e) => e.status === 'uploading');
        const doneCount = uploadProgress.completed;
        const totalCount = uploadProgress.total || entries.length;
        const overallPercent = uploading.length > 0
          ? uploading.reduce((s, e) => s + e.progress, 0) / uploading.length
          : (totalCount > 0 ? (doneCount / totalCount) * 100 : 0);
        return (
          <div className="upload-overall-bar">
            <div className="upload-overall-text">
              מעלה {doneCount} מתוך {totalCount}
            </div>
            <div className="upload-overall-track">
              <div
                className="upload-overall-fill"
                style={{ width: `${overallPercent}%` }}
              />
            </div>
          </div>
        );
      })()}

      {/* Loading state */}
      {imagesLoading ? (
        <div className="images-loading">
          <p>טוען תמונות...</p>
        </div>
      ) : (
        <>
          {/* Empty state */}
          {images.length === 0 && Object.keys(uploadEntries).length === 0 && (
            <div className="images-empty">
              <p>אין תמונות עדיין</p>
            </div>
          )}

          {/* Images gallery: pending uploads first, then stored images */}
          {(Object.keys(uploadEntries).length > 0 || images.length > 0) && (
            <div className="images-gallery">
              {Object.values(uploadEntries).map((entry) => (
                <div key={entry.id} className="image-thumbnail-wrapper upload-thumb">
                  <img
                    src={entry.localPreviewUrl}
                    alt=""
                    className="image-thumbnail"
                  />
                  <div className="upload-overlay">
                    {entry.status === 'uploading' && (
                      <>
                        <div className="upload-bar-track">
                          <div
                            className="upload-bar-fill"
                            style={{ width: `${entry.progress}%` }}
                          />
                        </div>
                        <div className="upload-percent">
                          מעלה… {entry.progress}%
                        </div>
                      </>
                    )}
                    {entry.status === 'error' && (
                      <div className="upload-error-state">
                        <span className="upload-error-text">שגיאה</span>
                        <button
                          type="button"
                          className="upload-retry-btn"
                          onClick={() => retryUploadEntry(entry.id)}
                        >
                          נסה שוב
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
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

