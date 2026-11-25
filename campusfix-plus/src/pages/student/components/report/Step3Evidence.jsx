import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  X,
  AlertCircle,
  Sparkles,
  Loader2,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import Button from '../../../../components/ui/Button';
import AIAnalysisCard from '../../../../components/ui/AIAnalysisCard';
import { analyzeImage } from '../../../../services/visionService';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export default function Step3Evidence({
  evidence = [],
  onAddImages,
  onRemoveImage,
  error,
  currentCategory,
  currentPriority,
  onApplyRecommendations,
  aiAnalysis,
  setAiAnalysis,
}) {
  const fileInputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [analyzingIdx, setAnalyzingIdx] = useState(null);
  const [aiError, setAiError] = useState('');
  const [selectedImgIdx, setSelectedImgIdx] = useState(0);
  const [isApplied, setIsApplied] = useState(false);

  function processFiles(files) {
    setUploadError('');
    setAiError('');
    const valid = [];
    const countRemaining = 3 - evidence.length;

    if (files.length > countRemaining) {
      setUploadError(`Maximum 3 images allowed. Only adding the first ${countRemaining}.`);
    }

    const filesToInspect = Array.from(files).slice(0, countRemaining);

    for (const f of filesToInspect) {
      if (!ALLOWED_TYPES.includes(f.type)) {
        setUploadError('Only JPG, PNG, or WebP images are allowed.');
        return;
      }
      if (f.size > MAX_FILE_SIZE) {
        setUploadError(`File "${f.name}" exceeds the 5MB size limit.`);
        return;
      }
      const previewUrl = URL.createObjectURL(f);
      valid.push({ file: f, url: previewUrl, name: f.name });
    }

    if (valid.length > 0) {
      onAddImages(valid);
      setSelectedImgIdx(evidence.length);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  }

  async function handleRunAIAnalysis(idx) {
    const target = evidence[idx];
    if (!target || !target.file) {
      setAiError('Please select a valid uploaded image file to analyze.');
      return;
    }

    setAnalyzingIdx(idx);
    setAiError('');

    try {
      const result = await analyzeImage(target.file);
      if (setAiAnalysis) {
        setAiAnalysis(result);
      }
      setSelectedImgIdx(idx);
      setIsApplied(false);
    } catch (err) {
      console.warn('Vision analysis failed:', err);
      setAiError(
        err.isServiceUnavailable
          ? 'AI Vision service is offline or unreachable at http://localhost:8000. Complaint submission remains fully functional—you may proceed manually.'
          : err.message || 'Failed to analyze image with AI.'
      );
    } finally {
      setAnalyzingIdx(null);
    }
  }

  function handleAcceptRecommendations(rec) {
    if (onApplyRecommendations) {
      onApplyRecommendations(rec);
    }
    setIsApplied(true);
  }

  function handleRejectRecommendations() {
    if (setAiAnalysis) {
      setAiAnalysis(null);
    }
    setIsApplied(false);
    setAiError('');
  }

  return (
    <div className="space-y-5">
      {/* Informational Header */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs text-slate-600">
        <p className="font-semibold text-slate-800">Visual Evidence (Optional, Up to 3)</p>
        <p className="mt-0.5">
          Uploading photographs of the damaged area enables automatic AI defect assessment, image quality validation, and SLA urgency recommendation.
        </p>
      </div>

      {(error || uploadError) && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error || uploadError}</span>
        </div>
      )}

      {/* Drag & Drop Upload Area */}
      {evidence.length < 3 && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
            dragActive
              ? 'border-primary-500 bg-primary-50/50'
              : 'border-slate-300 hover:border-primary-400 bg-white'
          }`}
        >
          <UploadCloud className="h-9 w-9 text-slate-400 mb-2" />
          <p className="text-xs font-bold text-slate-800">
            Click to upload or drag & drop files here
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            JPG, PNG, or WebP up to 5MB each ({3 - evidence.length} remaining)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) processFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {/* Uploaded Evidence Grid & AI Trigger */}
      {evidence.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-slate-500" />
              Uploaded Photographs ({evidence.length}/3)
            </span>
            <span className="text-[11px] text-slate-400">
              Select an image to analyze with AI
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {evidence.map((img, idx) => {
              const isSelected = selectedImgIdx === idx;
              const isAnalyzingThis = analyzingIdx === idx;

              return (
                <div
                  key={idx}
                  className={`relative group rounded-xl border overflow-hidden transition-all bg-slate-50 flex flex-col ${
                    isSelected
                      ? 'border-indigo-500 ring-2 ring-indigo-200 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Image Thumbnail */}
                  <div
                    className="relative aspect-video w-full cursor-pointer bg-slate-900"
                    onClick={() => setSelectedImgIdx(idx)}
                  >
                    <img
                      src={img.url}
                      alt={img.name}
                      className="h-full w-full object-cover"
                    />

                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveImage(idx);
                        if (selectedImgIdx === idx) {
                          setSelectedImgIdx(0);
                          if (setAiAnalysis) setAiAnalysis(null);
                        }
                      }}
                      className="absolute right-1.5 top-1.5 rounded-full bg-slate-950/70 p-1 text-white hover:bg-rose-600 transition-colors"
                      aria-label={`Remove image ${img.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>

                    <div className="absolute inset-x-0 bottom-0 bg-slate-950/75 p-1 px-2 text-[9px] text-white truncate backdrop-blur-2xs">
                      {img.name}
                    </div>
                  </div>

                  {/* Analyze with AI Action */}
                  <div className="p-2 bg-white flex items-center justify-between border-t border-slate-100">
                    <span className="text-[10px] text-slate-400 font-medium">
                      Photo {idx + 1}
                    </span>

                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      loading={isAnalyzingThis}
                      onClick={() => handleRunAIAnalysis(idx)}
                      icon={
                        isAnalyzingThis ? (
                          <Loader2 className="h-3 w-3 animate-spin text-indigo-600" />
                        ) : (
                          <Sparkles className="h-3 w-3 text-indigo-600" />
                        )
                      }
                      className="text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800 border-indigo-200"
                    >
                      {isAnalyzingThis ? 'Analyzing...' : 'Analyze with AI'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Error / Offline Notice */}
      {aiError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-bold text-amber-950">AI Microservice Notice</p>
            <p className="text-amber-800 leading-relaxed">{aiError}</p>
          </div>
        </div>
      )}

      {/* AI Analysis Result Card */}
      {aiAnalysis && evidence[selectedImgIdx] && (
        <AIAnalysisCard
          analysis={aiAnalysis}
          originalImage={evidence[selectedImgIdx].url}
          onAccept={handleAcceptRecommendations}
          onReject={handleRejectRecommendations}
          isApplied={isApplied}
          currentCategory={currentCategory}
          currentPriority={currentPriority}
        />
      )}

      {/* AI Prompt Banner when no analysis yet */}
      {!aiAnalysis && evidence.length > 0 && !analyzingIdx && !aiError && (
        <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/60 to-white p-3.5 text-xs text-indigo-900 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <div>
              <p className="font-bold text-indigo-950">AI-Powered Defect Inspection Available</p>
              <p className="text-[11px] text-indigo-700">
                Click "Analyze with AI" to inspect crack candidates, blur, exposure, and triage priority.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="primary"
            onClick={() => handleRunAIAnalysis(selectedImgIdx || 0)}
            icon={<Sparkles className="h-3.5 w-3.5" />}
            className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-xs font-bold"
          >
            Analyze Photo {selectedImgIdx + 1}
          </Button>
        </div>
      )}
    </div>
  );
}
