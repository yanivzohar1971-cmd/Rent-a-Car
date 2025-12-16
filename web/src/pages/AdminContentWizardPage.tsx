/**
 * Admin Content Wizard Page
 * Monster Wizard for generating SEO/blog content briefs
 */

import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { optionBank, getAllSecondaryKeywords } from '../assets/contentWizardOptionBank.he';
import { saveDraft, updateDraft, publishDraft } from '../api/adminContentWizardApi';
import type { WizardBrief, GeneratedContent } from '../types/contentWizard';
import './AdminContentWizardPage.css';

export default function AdminContentWizardPage() {
  const { firebaseUser, userProfile, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const isAdmin = userProfile?.isAdmin === true;

  // Redirect if not admin
  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser || !isAdmin) {
      navigate('/account');
    }
  }, [authLoading, firebaseUser, isAdmin, navigate]);

  // Wizard state
  const [type, setType] = useState<string>('');
  const [typeOther, setTypeOther] = useState<string>('');
  const [audience, setAudience] = useState<string[]>([]);
  const [audienceOther, setAudienceOther] = useState<string>('');
  const [goal, setGoal] = useState<string>('');
  const [goalOther, setGoalOther] = useState<string>('');
  const [primaryKeyword, setPrimaryKeyword] = useState<string>('');
  const [primaryKeywordOther, setPrimaryKeywordOther] = useState<string>('');
  const [secondaryKeywords, setSecondaryKeywords] = useState<string[]>([]);
  const [secondaryKeywordsCustom, setSecondaryKeywordsCustom] = useState<string[]>([]);
  const [secondaryKeywordsSearch, setSecondaryKeywordsSearch] = useState<string>('');
  const [location, setLocation] = useState<string[]>([]);
  const [locationOther, setLocationOther] = useState<string>('');
  const [vehicleSegments, setVehicleSegments] = useState<string[]>([]);
  const [vehicleSegmentsOther, setVehicleSegmentsOther] = useState<string>('');
  const [structureBlocks, setStructureBlocks] = useState<string[]>([]);
  const [structureBlocksOther, setStructureBlocksOther] = useState<string>('');
  const [tone, setTone] = useState<string>('');
  const [toneOther, setToneOther] = useState<string>('');
  const [lengthPreset, setLengthPreset] = useState<'short' | 'medium' | 'long' | 'custom'>('medium');
  const [lengthCustom, setLengthCustom] = useState<number | null>(null);
  const [notes, setNotes] = useState<string>('');

  // UI state
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pastedContent, setPastedContent] = useState<string>('');
  const [pastedContentError, setPastedContentError] = useState<string | null>(null);

  // Generate brief JSON
  const briefJson = useMemo((): WizardBrief | null => {
    if (!type || !goal || !primaryKeyword || !tone) {
      return null;
    }

    const finalType = type === 'Other…' ? typeOther : type;
    const finalGoal = goal === 'Other…' ? goalOther : goal;
    const finalPrimaryKeyword = primaryKeyword === 'Other keyword…' ? primaryKeywordOther : primaryKeyword;
    const finalTone = tone === 'Other…' ? toneOther : tone;

    const finalAudience = [
      ...audience.filter((a) => a !== 'Other…'),
      ...(audience.includes('Other…') && audienceOther ? [audienceOther] : []),
    ];

    const finalSecondaryKeywords = [...secondaryKeywords, ...secondaryKeywordsCustom];

    const finalLocation = [
      ...location.filter((l) => l !== 'Other city…' && l !== 'כל הארץ'),
      ...(location.includes('Other city…') && locationOther ? [locationOther] : []),
      ...(location.includes('כל הארץ') ? ['כל הארץ'] : []),
    ];

    const finalVehicleSegments = [
      ...vehicleSegments.filter((v) => v !== 'Other…'),
      ...(vehicleSegments.includes('Other…') && vehicleSegmentsOther ? [vehicleSegmentsOther] : []),
    ];

    const finalStructureBlocks = [
      ...structureBlocks.filter((s) => s !== 'Other…'),
      ...(structureBlocks.includes('Other…') && structureBlocksOther ? [structureBlocksOther] : []),
    ];

    return {
      version: 'wizardBrief.v1',
      createdAt: new Date().toISOString(),
      type: finalType,
      audience: finalAudience,
      goal: finalGoal,
      primaryKeyword: finalPrimaryKeyword,
      secondaryKeywords: finalSecondaryKeywords,
      location: finalLocation,
      vehicleSegments: finalVehicleSegments,
      structureBlocks: finalStructureBlocks,
      tone: finalTone,
      length: {
        preset: lengthPreset,
        customWords: lengthPreset === 'custom' ? lengthCustom : null,
      },
      notes,
    };
  }, [
    type,
    typeOther,
    audience,
    audienceOther,
    goal,
    goalOther,
    primaryKeyword,
    primaryKeywordOther,
    secondaryKeywords,
    secondaryKeywordsCustom,
    location,
    locationOther,
    vehicleSegments,
    vehicleSegmentsOther,
    structureBlocks,
    structureBlocksOther,
    tone,
    toneOther,
    lengthPreset,
    lengthCustom,
    notes,
  ]);

  // Filter secondary keywords by search
  const filteredSecondaryKeywords = useMemo(() => {
    const all = getAllSecondaryKeywords();
    if (!secondaryKeywordsSearch) return all;
    const searchLower = secondaryKeywordsSearch.toLowerCase();
    return all.filter((kw) => kw.toLowerCase().includes(searchLower));
  }, [secondaryKeywordsSearch]);

  // Handlers
  const handleCopyBrief = async () => {
    if (!briefJson) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(briefJson, null, 2));
      alert('Brief JSON copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
      alert('Failed to copy to clipboard');
    }
  };

  const handleDownloadBrief = () => {
    if (!briefJson) return;
    const blob = new Blob([JSON.stringify(briefJson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `content-brief-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveDraft = async () => {
    if (!briefJson) {
      alert('Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      if (currentDraftId) {
        await updateDraft(currentDraftId, { brief: briefJson });
        alert('Draft updated!');
      } else {
        const id = await saveDraft(briefJson);
        setCurrentDraftId(id);
        alert('Draft saved!');
      }
    } catch (err) {
      console.error('Error saving draft:', err);
      alert('Failed to save draft');
    } finally {
      setSaving(false);
    }
  };

  const handlePasteGenerated = () => {
    setShowPasteModal(true);
    setPastedContent('');
    setPastedContentError(null);
  };

  const handleProcessPastedContent = async () => {
    if (!pastedContent.trim()) {
      setPastedContentError('Please paste content');
      return;
    }

    if (!currentDraftId) {
      setPastedContentError('Please save draft first');
      return;
    }

    try {
      // Try to parse as JSON first
      let generated: GeneratedContent | string;
      try {
        const parsed = JSON.parse(pastedContent);
        if (parsed.contentMarkdown || parsed.title) {
          // Validate required fields
          if (!parsed.title || !parsed.slug || !parsed.contentMarkdown) {
            throw new Error('Missing required fields: title, slug, contentMarkdown');
          }
          generated = parsed as GeneratedContent;
        } else {
          // Not a valid GeneratedContent JSON, treat as markdown
          generated = pastedContent;
        }
      } catch {
        // Not JSON, treat as markdown
        generated = pastedContent;
      }

      await updateDraft(currentDraftId, { generated });
      setShowPasteModal(false);
      setPastedContent('');
      alert('Generated content saved!');
    } catch (err: any) {
      setPastedContentError(err.message || 'Failed to process content');
    }
  };

  const handlePublish = async () => {
    if (!currentDraftId) {
      alert('Please save draft first');
      return;
    }

    try {
      await publishDraft(currentDraftId);
      alert('Draft marked as PUBLISHED!');
    } catch (err) {
      console.error('Error publishing:', err);
      alert('Failed to publish draft');
    }
  };

  const toggleMultiSelect = (value: string, current: string[], setter: (v: string[]) => void) => {
    if (current.includes(value)) {
      setter(current.filter((v) => v !== value));
    } else {
      setter([...current, value]);
    }
  };

  const addCustomSecondaryKeyword = () => {
    const input = prompt('Enter custom keyword:');
    if (input && input.trim()) {
      setSecondaryKeywordsCustom([...secondaryKeywordsCustom, input.trim()]);
    }
  };

  if (authLoading) {
    return <div className="admin-content-wizard-page">טוען...</div>;
  }

  return (
    <div className="admin-content-wizard-page">
      <div className="wizard-container">
        <div className="wizard-header">
          <h1>מחולל תוכן - Monster Wizard</h1>
          <p className="subtitle">מלא את השאלון כדי ליצור Brief JSON עבור ChatGPT</p>
        </div>

        <div className="wizard-layout">
          {/* Left: Wizard Form */}
          <div className="wizard-form">
            {/* Q1: Content Type */}
            <div className="question-block">
              <label className="question-label">1. סוג תוכן (חובה)</label>
              <div className="radio-group">
                {optionBank.contentTypes.map((opt) => (
                  <label key={opt} className="radio-option">
                    <input
                      type="radio"
                      name="type"
                      value={opt}
                      checked={type === opt}
                      onChange={(e) => setType(e.target.value)}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
              {type === 'Other…' && (
                <input
                  type="text"
                  className="other-input"
                  placeholder="Specify other type..."
                  value={typeOther}
                  onChange={(e) => setTypeOther(e.target.value)}
                />
              )}
            </div>

            {/* Q2: Audience */}
            <div className="question-block">
              <label className="question-label">2. קהל יעד (רב-בחירה)</label>
              <div className="checkbox-group">
                {optionBank.audiences.map((opt) => (
                  <label key={opt} className="checkbox-option">
                    <input
                      type="checkbox"
                      checked={audience.includes(opt)}
                      onChange={() => toggleMultiSelect(opt, audience, setAudience)}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
              {audience.includes('Other…') && (
                <input
                  type="text"
                  className="other-input"
                  placeholder="Specify other audience..."
                  value={audienceOther}
                  onChange={(e) => setAudienceOther(e.target.value)}
                />
              )}
            </div>

            {/* Q3: Primary Goal */}
            <div className="question-block">
              <label className="question-label">3. מטרה עיקרית (חובה)</label>
              <div className="radio-group">
                {optionBank.goals.map((opt) => (
                  <label key={opt} className="radio-option">
                    <input
                      type="radio"
                      name="goal"
                      value={opt}
                      checked={goal === opt}
                      onChange={(e) => setGoal(e.target.value)}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
              {goal === 'Other…' && (
                <input
                  type="text"
                  className="other-input"
                  placeholder="Specify other goal..."
                  value={goalOther}
                  onChange={(e) => setGoalOther(e.target.value)}
                />
              )}
            </div>

            {/* Q4: Primary Keyword */}
            <div className="question-block">
              <label className="question-label">4. מילת מפתח עיקרית (חובה)</label>
              <div className="radio-group">
                {optionBank.primaryKeywords.map((opt) => (
                  <label key={opt} className="radio-option">
                    <input
                      type="radio"
                      name="primaryKeyword"
                      value={opt}
                      checked={primaryKeyword === opt}
                      onChange={(e) => setPrimaryKeyword(e.target.value)}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
              {primaryKeyword === 'Other keyword…' && (
                <input
                  type="text"
                  className="other-input"
                  placeholder="Enter custom keyword..."
                  value={primaryKeywordOther}
                  onChange={(e) => setPrimaryKeywordOther(e.target.value)}
                />
              )}
            </div>

            {/* Q5: Secondary Keywords */}
            <div className="question-block">
              <label className="question-label">5. מילות מפתח משניות (רב-בחירה)</label>
              <div className="search-box">
                <input
                  type="text"
                  placeholder="חיפוש מילות מפתח..."
                  value={secondaryKeywordsSearch}
                  onChange={(e) => setSecondaryKeywordsSearch(e.target.value)}
                  className="search-input"
                />
              </div>
              <div className="checkbox-group">
                {filteredSecondaryKeywords.map((opt) => (
                  <label key={opt} className="checkbox-option">
                    <input
                      type="checkbox"
                      checked={secondaryKeywords.includes(opt)}
                      onChange={() => toggleMultiSelect(opt, secondaryKeywords, setSecondaryKeywords)}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
              <button type="button" onClick={addCustomSecondaryKeyword} className="add-custom-btn">
                + הוסף מילת מפתח מותאמת
              </button>
              {secondaryKeywordsCustom.length > 0 && (
                <div className="custom-items">
                  {secondaryKeywordsCustom.map((kw, idx) => (
                    <span key={idx} className="custom-chip">
                      {kw}
                      <button
                        type="button"
                        onClick={() => setSecondaryKeywordsCustom(secondaryKeywordsCustom.filter((_, i) => i !== idx))}
                        className="remove-chip"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Q6: Location */}
            <div className="question-block">
              <label className="question-label">6. מיקום (רב-בחירה)</label>
              <div className="checkbox-group">
                {optionBank.locations.map((opt) => (
                  <label key={opt} className="checkbox-option">
                    <input
                      type="checkbox"
                      checked={location.includes(opt)}
                      onChange={() => toggleMultiSelect(opt, location, setLocation)}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
              {location.includes('Other city…') && (
                <input
                  type="text"
                  className="other-input"
                  placeholder="Enter city name..."
                  value={locationOther}
                  onChange={(e) => setLocationOther(e.target.value)}
                />
              )}
            </div>

            {/* Q7: Vehicle Segments */}
            <div className="question-block">
              <label className="question-label">7. קטגוריית רכב (רב-בחירה)</label>
              <div className="checkbox-group">
                {optionBank.vehicleSegments.map((opt) => (
                  <label key={opt} className="checkbox-option">
                    <input
                      type="checkbox"
                      checked={vehicleSegments.includes(opt)}
                      onChange={() => toggleMultiSelect(opt, vehicleSegments, setVehicleSegments)}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
              {vehicleSegments.includes('Other…') && (
                <input
                  type="text"
                  className="other-input"
                  placeholder="Specify other segment..."
                  value={vehicleSegmentsOther}
                  onChange={(e) => setVehicleSegmentsOther(e.target.value)}
                />
              )}
            </div>

            {/* Q8: Structure Blocks */}
            <div className="question-block">
              <label className="question-label">8. בלוקי מבנה (רב-בחירה)</label>
              <div className="checkbox-group">
                {optionBank.structureBlocks.map((opt) => (
                  <label key={opt} className="checkbox-option">
                    <input
                      type="checkbox"
                      checked={structureBlocks.includes(opt)}
                      onChange={() => toggleMultiSelect(opt, structureBlocks, setStructureBlocks)}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
              {structureBlocks.includes('Other…') && (
                <input
                  type="text"
                  className="other-input"
                  placeholder="Specify other block..."
                  value={structureBlocksOther}
                  onChange={(e) => setStructureBlocksOther(e.target.value)}
                />
              )}
            </div>

            {/* Q9: Tone */}
            <div className="question-block">
              <label className="question-label">9. טון (חובה)</label>
              <div className="radio-group">
                {optionBank.tones.map((opt) => (
                  <label key={opt} className="radio-option">
                    <input
                      type="radio"
                      name="tone"
                      value={opt}
                      checked={tone === opt}
                      onChange={(e) => setTone(e.target.value)}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
              {tone === 'Other…' && (
                <input
                  type="text"
                  className="other-input"
                  placeholder="Specify other tone..."
                  value={toneOther}
                  onChange={(e) => setToneOther(e.target.value)}
                />
              )}
            </div>

            {/* Q10: Length */}
            <div className="question-block">
              <label className="question-label">10. אורך (חובה)</label>
              <div className="radio-group">
                {optionBank.lengthPresets.map((preset) => (
                  <label key={preset.value} className="radio-option">
                    <input
                      type="radio"
                      name="length"
                      value={preset.value}
                      checked={lengthPreset === preset.value}
                      onChange={(e) => setLengthPreset(e.target.value as any)}
                    />
                    <span>{preset.label}</span>
                  </label>
                ))}
              </div>
              {lengthPreset === 'custom' && (
                <input
                  type="number"
                  className="other-input"
                  placeholder="Enter word count..."
                  value={lengthCustom || ''}
                  onChange={(e) => setLengthCustom(e.target.value ? parseInt(e.target.value, 10) : null)}
                />
              )}
            </div>

            {/* Bonus: Notes */}
            <div className="question-block">
              <label className="question-label">הערות / עובדות לכלול</label>
              <textarea
                className="notes-textarea"
                placeholder="Enter any additional notes or facts to include..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={5}
              />
            </div>
          </div>

          {/* Right: Preview & Actions */}
          <div className="wizard-preview">
            <div className="preview-header">
              <h2>Brief JSON Preview</h2>
            </div>
            <div className="preview-content">
              {briefJson ? (
                <pre className="json-preview">{JSON.stringify(briefJson, null, 2)}</pre>
              ) : (
                <p className="preview-placeholder">Fill in required fields to see preview...</p>
              )}
            </div>
            <div className="preview-actions">
              <button
                type="button"
                onClick={handleCopyBrief}
                disabled={!briefJson}
                className="action-btn primary"
              >
                Copy Brief
              </button>
              <button
                type="button"
                onClick={handleDownloadBrief}
                disabled={!briefJson}
                className="action-btn"
              >
                Download Brief .json
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={!briefJson || saving}
                className="action-btn"
              >
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
              <button
                type="button"
                onClick={handlePasteGenerated}
                disabled={!currentDraftId}
                className="action-btn"
              >
                Paste Generated Content
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={!currentDraftId}
                className="action-btn publish-btn"
              >
                Publish
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Paste Modal */}
      {showPasteModal && (
        <div className="modal-overlay" onClick={() => setShowPasteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Paste Generated Content</h3>
            <p>Paste either Markdown content or JSON with GeneratedContent format</p>
            <textarea
              className="paste-textarea"
              value={pastedContent}
              onChange={(e) => {
                setPastedContent(e.target.value);
                setPastedContentError(null);
              }}
              placeholder="Paste content here..."
              rows={15}
            />
            {pastedContentError && (
              <div className="error-message">{pastedContentError}</div>
            )}
            <div className="modal-actions">
              <button type="button" onClick={handleProcessPastedContent} className="action-btn primary">
                Save
              </button>
              <button type="button" onClick={() => setShowPasteModal(false)} className="action-btn">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
