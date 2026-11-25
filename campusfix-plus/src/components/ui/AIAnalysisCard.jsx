/**
 * AIAnalysisCard.jsx
 * Reusable component displaying Ultralytics YOLOv8 object detections,
 * OpenCV image quality assessments, and conservative damage triage recommendations.
 */

import React, { useState } from 'react';
import {
  Sparkles,
  Check,
  X,
  AlertTriangle,
  Zap,
  Eye,
  Layers,
  ShieldCheck,
  CheckCircle2,
  Info,
  Maximize2,
} from 'lucide-react';
import Button from './Button';
import PriorityBadge from './PriorityBadge';
import { CATEGORY_META } from '../../constants/categories';

export default function AIAnalysisCard({
  analysis,
  originalImage,
  onAccept,
  onReject,
  isApplied = false,
  currentCategory,
  currentPriority,
}) {
  const [activeView, setActiveView] = useState('annotated'); // 'annotated' | 'original'
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  if (!analysis) return null;

  const {
    image_quality: quality = {},
    object_detection: objDet = {},
    damage_analysis: damage = {},
    recommendations = {},
    recommendation = {},
    annotated_image: annotatedImg,
    processing_time_ms: latency = 0,
    confidence: overallConf = 0,
    suggested_category: topCat,
    suggested_priority: topPrio,
    summary = '',
  } = analysis;

  const rec = recommendations.suggested_category ? recommendations : recommendation;
  const targetCategory = rec.suggested_category || topCat || 'OTHER';
  const targetPriority = rec.suggested_priority || topPrio || 'MEDIUM';
  const effectiveSummary = rec.summary || summary || '';
  const categoryMeta = CATEGORY_META[targetCategory] || { label: targetCategory, color: 'text-slate-700' };

  const detections = objDet.detections || [];
  const crack = damage.crack_candidate || {};
  const seepage = damage.water_seepage_candidate || {};
  const confPercent = Math.round(overallConf * 100);

  const displayImage = activeView === 'annotated' && annotatedImg ? annotatedImg : originalImage;

  return (
    <div className="overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-sm ring-1 ring-indigo-50 transition-all">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 bg-gradient-to-r from-indigo-50/80 via-white to-indigo-50/40 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-950">
              CampusFix Vision AI Analysis
            </h3>
            <p className="text-[11px] text-indigo-600 font-medium">
              YOLOv8 Nano & OpenCV Damage Triage
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100/70 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-800">
            <Zap className="h-3 w-3 text-indigo-600" />
            {latency ? `${latency.toFixed(1)} ms` : 'Local AI'}
          </span>
          {isApplied ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Applied
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
              Review Needed
            </span>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {/* Core Recommendations Box */}
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                AI Recommendation
              </span>
              <div className="mt-1 flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-slate-800 shadow-2xs border border-indigo-100">
                  <span className="text-[11px] font-medium text-slate-400">Category:</span>
                  <span className={categoryMeta.color}>{categoryMeta.label}</span>
                </div>

                <div className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-slate-800 shadow-2xs border border-indigo-100">
                  <span className="text-[11px] font-medium text-slate-400">Priority:</span>
                  <PriorityBadge priority={targetPriority} size="sm" />
                </div>

                <div className="flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-semibold text-slate-700 shadow-2xs border border-indigo-100">
                  <span className="text-[11px] text-slate-400">Confidence:</span>
                  <span className="font-bold text-indigo-600">{confPercent}%</span>
                </div>
              </div>
            </div>

            {/* Accept / Reject Action Buttons */}
            <div className="flex items-center gap-2 pt-1 sm:pt-0">
              {!isApplied ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={() => onAccept && onAccept({ category: targetCategory, priority: targetPriority })}
                    icon={<Check className="h-3.5 w-3.5" />}
                    className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 shadow-xs text-xs font-bold"
                  >
                    Accept Recommendation
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onReject}
                    icon={<X className="h-3.5 w-3.5" />}
                    className="text-xs text-slate-600 hover:text-slate-800"
                  >
                    Reject
                  </Button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    Applied to complaint
                  </span>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={onReject}
                    className="text-[11px] text-slate-400 hover:text-slate-600"
                  >
                    Undo
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Context Summary */}
          {effectiveSummary && (
            <p className="mt-2.5 text-xs text-slate-600 leading-relaxed border-t border-indigo-100/60 pt-2">
              {effectiveSummary}
            </p>
          )}

          {/* Change indicator if different from current selection */}
          {(!isApplied && (currentCategory !== targetCategory || currentPriority !== targetPriority)) && (
            <div className="mt-2.5 text-[11px] text-indigo-700/80 bg-white/70 rounded-md p-1.5 px-2 flex items-center gap-1.5 border border-indigo-100/50">
              <Info className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
              <span>
                Accepting will update: Category ({currentCategory || 'None'} → <strong>{targetCategory}</strong>) & Priority ({currentPriority || 'None'} → <strong>{targetPriority}</strong>).
              </span>
            </div>
          )}
        </div>

        {/* Human Verification Notice */}
        <div className="flex items-start gap-2 rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
          <span>
            <strong>Human Verification Required:</strong> AI visual analysis provides preliminary recommendations. Facility estate technicians inspect physical infrastructure onsite before issuing work orders.
          </span>
        </div>

        {/* Image Preview & Toggle */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5 text-indigo-600" />
              Visual Inspection Preview
            </span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setActiveView('annotated')}
                className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-all ${
                  activeView === 'annotated'
                    ? 'bg-white text-indigo-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Annotated Detections
              </button>
              <button
                type="button"
                onClick={() => setActiveView('original')}
                className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-all ${
                  activeView === 'original'
                    ? 'bg-white text-indigo-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Original Photo
              </button>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900/95 aspect-video sm:aspect-[21/9] flex items-center justify-center">
            {displayImage ? (
              <img
                src={displayImage}
                alt="AI Analysis View"
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="text-slate-400 text-xs">No image preview available</div>
            )}

            <div className="absolute bottom-2 left-2 flex items-center gap-2 rounded-md bg-slate-950/75 px-2 py-1 text-[10px] text-white backdrop-blur-xs">
              <Layers className="h-3 w-3 text-cyan-400" />
              <span>
                {activeView === 'annotated'
                  ? `YOLOv8 + CV Overlay (${detections.length} objects, ${crack.detected ? '1 crack' : '0 cracks'})`
                  : 'Original Student Photograph'}
              </span>
            </div>
          </div>
        </div>

        {/* Technical Details Toggle */}
        <div className="border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setShowTechnicalDetails((prev) => !prev)}
            className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            <Maximize2 className="h-3 w-3" />
            {showTechnicalDetails ? 'Hide Detailed Vision Metrics' : 'View Detailed Vision Metrics (Quality, Objects, Heuristics)'}
          </button>

          {showTechnicalDetails && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
              {/* Image Quality Card */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-1.5">
                <span className="font-bold text-slate-800 flex items-center justify-between">
                  Image Quality
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                    quality.quality_status === 'EXCELLENT' ? 'bg-emerald-100 text-emerald-800' :
                    quality.quality_status === 'ACCEPTABLE' ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {quality.quality_status || 'UNKNOWN'}
                  </span>
                </span>
                <div className="space-y-1 text-[11px] text-slate-600">
                  <p>Blur: {quality.blur_detected ? <span className="font-semibold text-amber-600">Blurry</span> : <span className="text-emerald-700 font-semibold">Sharp</span>}</p>
                  <p>Exposure: <span className="font-semibold text-slate-700">{quality.exposure_status || 'Normal'}</span></p>
                  <p>Contrast: <span className="font-semibold text-slate-700">{quality.contrast_status || 'Normal'}</span></p>
                  <p>Resolution: <span className="font-semibold text-slate-700">{quality.resolution?.width}x{quality.resolution?.height}</span></p>
                </div>
              </div>

              {/* Detected Objects Card */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-1.5">
                <span className="font-bold text-slate-800 flex items-center justify-between">
                  Detected Objects
                  <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-bold">
                    {detections.length}
                  </span>
                </span>
                <div className="space-y-1 text-[11px] text-slate-600 max-h-24 overflow-y-auto">
                  {detections.length > 0 ? (
                    detections.map((d, i) => (
                      <div key={i} className="flex justify-between items-center bg-white p-1 rounded border border-slate-100">
                        <span className="font-semibold text-slate-800 capitalize">{d.class_name || d.label}</span>
                        <span className="text-indigo-600 font-bold">{Math.round((d.confidence || 0) * 100)}%</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-400 italic">No generic room objects detected.</p>
                  )}
                </div>
              </div>

              {/* Damage Heuristics Card */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-1.5">
                <span className="font-bold text-slate-800 flex items-center justify-between">
                  Damage Indicators
                  <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">
                    Heuristic
                  </span>
                </span>
                <div className="space-y-1 text-[11px] text-slate-600">
                  <div className="flex justify-between">
                    <span>Wall Crack:</span>
                    <span className={crack.detected ? 'font-bold text-orange-600' : 'text-slate-400'}>
                      {crack.detected ? `Yes (${Math.round((crack.confidence || 0) * 100)}%)` : 'None'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Moisture / Seepage:</span>
                    <span className={seepage.detected ? 'font-bold text-blue-600' : 'text-slate-400'}>
                      {seepage.detected ? `Yes (${Math.round((seepage.confidence || 0) * 100)}%)` : 'None'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 italic">
                    Method: {damage.method || 'OpenCV Heuristics'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
