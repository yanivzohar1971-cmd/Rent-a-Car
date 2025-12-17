import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, getDocFromServer } from 'firebase/firestore';
import type { FirebaseError } from 'firebase/app';
import { db } from '../firebase/firebaseClient';
import { useYardPublic } from '../context/YardPublicContext';
import CarsSearchPage from './CarsSearchPage';
import './YardPublicPage.css';

interface YardInfo {
  id: string;
  name: string;
  city?: string;
  logoUrl?: string;
}

export default function YardPublicPage() {
  const { yardId } = useParams<{ yardId: string }>();
  const navigate = useNavigate();
  const { setActiveYard } = useYardPublic();
  const [yardInfo, setYardInfo] = useState<YardInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!yardId) {
      setError('מזהה מגרש לא תקין');
      setLoading(false);
      return;
    }

    async function loadYard() {
      if (!yardId) return;

      try {
        // Load yard info from users/{uid} document
        const yardDocRef = doc(db, 'users', yardId);
        const yardDoc = await getDocFromServer(yardDocRef);

        if (!yardDoc.exists()) {
          console.warn('[YardPublicPage] Yard document does not exist', { yardId });
          setError('המגרש לא נמצא. ייתכן שהקישור אינו תקף.');
          return;
        }

        const data = yardDoc.data();
        const yard: YardInfo = {
          id: yardId, // yardId is guaranteed to be string here
          name: data.yardName || data.displayName || data.fullName || 'מגרש רכבים',
          city: data.yardCity || data.city || undefined,
          logoUrl: data.yardLogoUrl || undefined,
        };

        setYardInfo(yard);
        setActiveYard(yardId, yard.name);
      } catch (err) {
        const firebaseError = err as FirebaseError | undefined;
        const errorCode = firebaseError?.code || '';
        const errorMessage = firebaseError?.message || String(err);

        console.error('[YardPublicPage] Error loading yard', {
          yardId,
          code: errorCode,
          message: errorMessage,
          fullError: err,
        });

        // Detect permission-denied: check code and message for various formats
        const isPermissionDenied =
          errorCode === 'permission-denied' ||
          errorCode === 'PERMISSION_DENIED' ||
          errorMessage.toLowerCase().includes('permission') ||
          errorMessage.toLowerCase().includes('missing or insufficient permissions');

        // If we are not allowed to read the users/{yardId} document (private profile),
        // fall back to a generic public view but still show the yard's cars.
        if (isPermissionDenied) {
          const fallbackYard: YardInfo = {
            id: yardId,
            name: 'מגרש רכבים',
          };

          console.warn(
            '[YardPublicPage] Permission denied for users doc. Using generic yard header and continuing to show cars.',
            { yardId, errorCode, errorMessage }
          );

          setYardInfo(fallbackYard);
          setActiveYard(yardId, fallbackYard.name);
          setError(null); // ensure we do NOT render the error screen
        } else {
          console.error('[YardPublicPage] Non-permission error, showing error UI', { yardId, errorCode });
          setError('שגיאה בטעינת פרטי המגרש');
        }
      } finally {
        setLoading(false);
      }
    }

    loadYard();

    // Cleanup: clear yard context when leaving
    return () => {
      setActiveYard(null);
    };
  }, [yardId, setActiveYard]);

  const handleExitToGlobal = () => {
    setActiveYard(null);
    navigate('/cars');
  };

  if (loading) {
    return (
      <div className="yard-public-page">
        <div className="loading-container">
          <p>טוען פרטי מגרש...</p>
        </div>
      </div>
    );
  }

  if (error || !yardInfo) {
    return (
      <div className="yard-public-page">
        <div className="error-container">
          <h2>המגרש לא נמצא</h2>
          <p>{error || 'המגרש המבוקש לא נמצא במערכת.'}</p>
          <Link to="/cars" className="btn btn-primary">
            לעבור לחיפוש הכללי של האתר
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="yard-public-page">
      <div className="yard-header">
        <div className="yard-header-content">
          {yardInfo.logoUrl && (
            <img src={yardInfo.logoUrl} alt={yardInfo.name} className="yard-logo" />
          )}
          <div className="yard-header-text">
            <h1 className="yard-name">{yardInfo.name}</h1>
            {yardInfo.city && <p className="yard-city">{yardInfo.city}</p>}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary exit-to-global-btn"
          onClick={handleExitToGlobal}
        >
          צפייה בכל הרכבים באתר
        </button>
      </div>

      <div className="yard-cars-section">
        <CarsSearchPage lockedYardId={yardId} />
      </div>
    </div>
  );
}

