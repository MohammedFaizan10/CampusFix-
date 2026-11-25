import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import * as complaintService from '../../services/complaintService';
import { analyzeImage, checkVisionHealth } from '../../services/visionService';
import realtimeService from '../../services/realtimeService';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { CATEGORIES, CATEGORY_META } from '../../constants/categories';
import { PRIORITIES, PRIORITY_META } from '../../constants/priorities';
import { CAMPUS } from '../../constants/campus';
import {
  Camera,
  Upload,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Eye,
  ShieldAlert,
  ArrowRight,
  ArrowLeft,
  Check,
  Building,
  MapPin,
  Maximize2,
  XCircle,
  Sliders
} from 'lucide-react';

export default function StudentAiReport() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Stages: 'capture' | 'analyzing' | 'report' | 'success'
  const [stage, setStage] = useState('capture');

  // Vision service status
  const [visionOnline, setVisionOnline] = useState(null);

  // Image handling
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [showAnnotated, setShowAnnotated] = useState(true);

  // Live Camera states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  // Analysis result
  const [analysis, setAnalysis] = useState(null);
  const [analysisError, setAnalysisError] = useState(null);

  // Form submission state
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: CATEGORIES.CIVIL,
    priority: PRIORITIES.MEDIUM,
    location: {
      building: CAMPUS.buildings[0].name,
      floor: CAMPUS.buildings[0].floors[0].label,
      room: CAMPUS.buildings[0].floors[0].rooms[0],
      landmark: '',
    },
  });

  const [submitting, setSubmitting] = useState(false);
  const [createdComplaint, setCreatedComplaint] = useState(null);

  // Check vision service status on mount
  useEffect(() => {
    async function checkHealth() {
      const res = await checkVisionHealth();
      setVisionOnline(res.isOnline);
    }
    checkHealth();
  }, []);

  // Ensure camera streams are stopped on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Camera controls
  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      setIsCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Camera access error:', err);
      let msg = 'Could not access device camera. Please check camera permissions.';
      if (err.name === 'NotAllowedError') msg = 'Camera access was denied. Please allow permissions in browser settings.';
      if (err.name === 'NotFoundError') msg = 'No camera found on your device. Please use Image Upload instead.';
      setCameraError(msg);
      toast.error(msg);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const captureFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `camera_capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
        applySelectedFile(file);
        stopCamera();
      }
    }, 'image/jpeg', 0.92);
  };

  // Image Selection Handler
  const handleFileChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      applySelectedFile(files[0]);
    }
  };

  const applySelectedFile = (file) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast.error('Invalid image type. Please choose a JPG, PNG, or WebP photo.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size exceeds 5 MB. Please select a smaller image.');
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(url);
    setAnalysis(null);
    setAnalysisError(null);
  };

  const clearSelectedImage = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setAnalysis(null);
    setAnalysisError(null);
  };

  // Analyze with FastAPI Vision microservice
  const handleStartAnalysis = async () => {
    if (!selectedFile) {
      toast.error('Please capture or upload an evidence image first.');
      return;
    }

    setStage('analyzing');
    setAnalysisError(null);

    try {
      const data = await analyzeImage(selectedFile);
      setAnalysis(data);

      // Synthesize smart complaint title & description based on genuine detections
      const detectedLabels = (data.object_detection?.detections || []).map((d) => d.label);
      const damageLabels = (data.damage_analysis?.indicators || []).map((i) => i.label);
      const allLabels = [...new Set([...damageLabels, ...detectedLabels])];

      let generatedTitle = '';
      if (damageLabels.length > 0) {
        const primary = damageLabels[0].replace(/_/g, ' ');
        generatedTitle = `Visible ${primary.charAt(0).toUpperCase() + primary.slice(1)} detected on campus`;
      } else if (detectedLabels.length > 0) {
        const primary = detectedLabels[0].replace(/_/g, ' ');
        generatedTitle = `Damaged/Malfunctioning ${primary.charAt(0).toUpperCase() + primary.slice(1)}`;
      } else {
        generatedTitle = `Campus Maintenance Issue (${data.recommendation?.suggested_category || 'General'})`;
      }

      const rec = data.recommendation;
      const quality = data.image_quality;

      const descParts = [
        `Automated AI inspection performed via YOLOv8 and OpenCV vision heuristics.`,
        rec?.reasoning ? `Analysis: ${rec.reasoning}` : '',
        allLabels.length > 0 ? `Identified visual markers: ${allLabels.join(', ')}.` : 'No distinct COCO damage classes localized.',
        quality ? `Image Quality: ${quality.quality_status} (Sharpness: ${Math.round(quality.blur_score)}, Exposure: ${quality.brightness_status}).` : '',
        `Human verification requested prior to physical dispatch.`
      ].filter(Boolean);

      setForm((prev) => ({
        ...prev,
        title: generatedTitle,
        description: descParts.join('\n\n'),
        category: rec?.suggested_category && CATEGORIES[rec.suggested_category] ? rec.suggested_category : CATEGORIES.CIVIL,
        priority: rec?.suggested_priority && PRIORITIES[rec.suggested_priority] ? rec.suggested_priority : PRIORITIES.MEDIUM,
      }));

      setStage('report');
      toast.success('AI Vision inspection completed successfully!');
    } catch (err) {
      console.error('Vision analysis error:', err);
      setAnalysisError(err.message || 'Inspection failed.');
      setStage('capture');
      toast.error(err.message || 'Vision microservice analysis failed.');
    }
  };

  // Submit verified complaint
  const handleSubmitComplaint = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error('Complaint title is mandatory.');
      return;
    }
    if (!form.description.trim()) {
      toast.error('Complaint description is mandatory.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Upload original photograph to InsForge Storage bucket 'complaint-evidence'
      let uploadedEvidence = [];
      if (selectedFile) {
        const uploaded = await complaintService.uploadEvidenceFile(selectedFile);
        if (uploaded) {
          uploadedEvidence.push(uploaded);
        } else {
          toast.error('Failed to upload image to storage. Please check connection and retry.');
          setSubmitting(false);
          return;
        }
      }

      // 2. Prepare payload for PostgreSQL persistence
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        priority: form.priority,
        location: form.location,
        reportedBy: user.id,
        reportedByName: user.name,
        reportedByEmail: user.email,
        evidence: uploadedEvidence,
        aiAnalysis: analysis
          ? {
              success: analysis.success,
              processing_time_ms: analysis.processing_time_ms,
              image_quality: analysis.image_quality,
              object_detection: analysis.object_detection,
              damage_analysis: analysis.damage_analysis,
              recommendation: analysis.recommendation,
              annotated_image: analysis.annotated_image ? 'included_in_report' : null,
            }
          : null,
      };

      const created = await complaintService.createComplaint(payload);
      setCreatedComplaint(created);
      setStage('success');
      toast.success(`Complaint #${created.id} registered on campus network!`);

      // 3. Emit real-time notification to campus maintenance and administrators
      if (realtimeService?.emitComplaintUpdate) {
        realtimeService.emitComplaintUpdate({
          id: created.id,
          title: created.title,
          category: created.category,
          priority: created.priority,
          status: 'SUBMITTED',
          reported_by: user.id,
        });
      }
    } catch (err) {
      console.error('Complaint creation error:', err);
      toast.error(err.message || 'Failed to submit complaint to InsForge database.');
    } finally {
      setSubmitting(false);
    }
  };

  // Reset workflow
  const resetWorkflow = () => {
    clearSelectedImage();
    stopCamera();
    setStage('capture');
    setAnalysis(null);
    setAnalysisError(null);
    setCreatedComplaint(null);
    setForm({
      title: '',
      description: '',
      category: CATEGORIES.CIVIL,
      priority: PRIORITIES.MEDIUM,
      location: {
        building: CAMPUS.buildings[0].name,
        floor: CAMPUS.buildings[0].floors[0].label,
        room: CAMPUS.buildings[0].floors[0].rooms[0],
        landmark: '',
      },
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI-Powered Issue Reporting"
        subtitle="Upload or capture visual evidence for automated YOLOv8 damage detection, OpenCV quality verification, and triage recommendation."
        actions={
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                visionOnline
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                  : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${visionOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              FastAPI Vision: {visionOnline ? 'Online (Port 8000)' : 'Offline / Checking'}
            </span>
            <Link to="/student/report">
              <Button variant="outline" size="sm">
                Manual Reporting
              </Button>
            </Link>
          </div>
        }
      />

      {/* STAGE: SUCCESS */}
      {stage === 'success' && createdComplaint && (
        <Card className="p-8 text-center max-w-xl mx-auto space-y-5">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Complaint Successfully Registered!</h2>
            <p className="text-sm text-slate-500 mt-1">
              Ticket ID: <span className="font-mono font-bold text-indigo-600">{createdComplaint.id}</span>
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Category:</span>
              <span className="font-semibold text-slate-800">{createdComplaint.category}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Priority SLA:</span>
              <span className="font-semibold text-slate-800">{createdComplaint.priority}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Location:</span>
              <span className="font-semibold text-slate-800">
                {createdComplaint.location?.building}, {createdComplaint.location?.floor} ({createdComplaint.location?.room})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">AI Inspection:</span>
              <span className="font-semibold text-emerald-600 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Logged & Linked
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button variant="outline" onClick={resetWorkflow}>
              Inspect Another Issue
            </Button>
            <Link to={`/student/complaints`}>
              <Button variant="primary" icon={<ArrowRight className="w-4 h-4" />}>
                View My Complaints
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* STAGE: CAPTURE & UPLOAD */}
      {stage === 'capture' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-4">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Camera className="w-4 h-4 text-red-600" /> Image Evidence Capture
                </h2>
                {selectedFile && (
                  <Button variant="ghost" size="sm" onClick={clearSelectedImage} className="text-slate-400 hover:text-rose-600">
                    <XCircle className="w-4 h-4 mr-1" /> Remove Photo
                  </Button>
                )}
              </div>

              {/* Live Camera View */}
              {isCameraActive && (
                <div className="space-y-3">
                  <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-slate-800 shadow-md">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    <div className="absolute top-3 left-3 bg-red-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1.5 animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-white" /> LIVE CAMERA
                    </div>
                  </div>
                  <canvas ref={canvasRef} className="hidden" />

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <Button variant="secondary" size="sm" onClick={stopCamera}>
                      Cancel Camera
                    </Button>
                    <Button
                      variant="primary"
                      className="bg-red-600 hover:bg-red-700 text-white flex-1"
                      onClick={captureFrame}
                      icon={<Camera className="w-4 h-4" />}
                    >
                      Capture Photo
                    </Button>
                  </div>
                </div>
              )}

              {/* Normal Selection Area (when camera is inactive) */}
              {!isCameraActive && (
                <div>
                  {!selectedFile ? (
                    <div className="border-2 border-dashed border-slate-200 hover:border-red-300 rounded-2xl p-8 text-center transition-colors bg-slate-50/50">
                      <div className="w-12 h-12 bg-red-50 text-red-600 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-xs">
                        <Sparkles className="w-6 h-6" />
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">Select Campus Evidence Photo</h3>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                        Take a live photo or upload an image of structural damage, water seepage, electrical issues, or furniture faults.
                      </p>

                      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-5">
                        <Button
                          variant="primary"
                          className="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto"
                          icon={<Camera className="w-4 h-4" />}
                          onClick={startCamera}
                        >
                          Open Camera
                        </Button>

                        <Button
                          variant="outline"
                          className="w-full sm:w-auto"
                          icon={<Upload className="w-4 h-4" />}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Upload Image File
                        </Button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={handleFileChange}
                        />
                      </div>
                      <p className="text-[11px] text-slate-400 mt-3">Supported formats: JPG, PNG, WebP (Max 5 MB)</p>
                    </div>
                  ) : (
                    /* Image Selected Preview */
                    <div className="space-y-4">
                      <div className="relative rounded-xl overflow-hidden bg-slate-900 aspect-video flex items-center justify-center border border-slate-200 shadow-sm">
                        <img src={previewUrl} alt="Selected preview" className="w-full h-full object-contain" />
                        <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-xs text-white text-[11px] px-2.5 py-1 rounded-md">
                          {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Replace Image
                          </Button>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={handleFileChange}
                          />
                        </div>

                        <Button
                          variant="primary"
                          className="bg-red-600 hover:bg-red-700 text-white shadow-sm font-semibold"
                          icon={<Sparkles className="w-4 h-4" />}
                          onClick={handleStartAnalysis}
                        >
                          Analyze with AI Vision
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {cameraError && (
                <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{cameraError}</span>
                </div>
              )}
            </Card>
          </div>

          {/* Guidelines Sidebar */}
          <div className="lg:col-span-5 space-y-4">
            <Card className="p-5 border-l-4 border-l-red-500 bg-red-50/30">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-600" /> AI Vision Capabilities
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                The Computer Vision service uses a dual-engine architecture:
              </p>
              <ul className="text-xs text-slate-600 mt-3 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-red-700">1.</span>
                  <span><strong>YOLOv8 Localization:</strong> Detects physical objects like plumbing fixtures, electrical panels, appliances, and furniture.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-red-700">2.</span>
                  <span><strong>OpenCV Heuristics:</strong> Performs Laplace edge detection for wall cracks and moisture stain HSV thresholding.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-red-700">3.</span>
                  <span><strong>Quality Assurance:</strong> Evaluates sharpness, luminance, and contrast to prevent ambiguous tickets.</span>
                </li>
              </ul>
            </Card>

            <Card className="p-5 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Photography Tips</h4>
              <div className="text-xs text-slate-600 space-y-2">
                <p>💡 <strong>Adequate Light:</strong> Avoid dark or heavily backlit environments.</p>
                <p>🔍 <strong>Clear Framing:</strong> Center the damaged area (e.g., crack or leak) in the frame.</p>
                <p>📐 <strong>Context:</strong> Capture some surrounding context so maintenance technicians can locate the issue quickly.</p>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* STAGE: ANALYZING */}
      {stage === 'analyzing' && (
        <Card className="p-12 text-center max-w-lg mx-auto space-y-5">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-red-200 animate-ping opacity-50" />
            <div className="w-16 h-16 rounded-full border-4 border-red-600 border-t-transparent animate-spin flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-red-600 animate-pulse" />
            </div>
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Running Computer Vision Inspection...</h3>
            <p className="text-xs text-slate-500 mt-1">
              Executing YOLOv8 inference, edge-variance analysis, and triage recommendation on FastAPI microservice.
            </p>
          </div>
        </Card>
      )}

      {/* STAGE: REPORT & EDITABLE COMPLAINT FORM */}
      {stage === 'report' && analysis && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Interactive Inspection Report */}
          <div className="lg:col-span-5 space-y-4">
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-red-600" /> AI Visual Inspection Report
                </h3>
                <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                  {analysis.processing_time_ms} ms
                </span>
              </div>

              {/* Image Toggle (Annotated vs Original) */}
              <div className="relative rounded-xl overflow-hidden bg-slate-900 aspect-video flex items-center justify-center border border-slate-200">
                <img
                  src={showAnnotated && analysis.annotated_image ? analysis.annotated_image : previewUrl}
                  alt="Inspection visual"
                  className="w-full h-full object-contain"
                />
                {analysis.annotated_image && (
                  <button
                    type="button"
                    onClick={() => setShowAnnotated(!showAnnotated)}
                    className="absolute top-2 right-2 bg-black/75 hover:bg-black text-white text-[10px] font-semibold px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    <Eye className="w-3 h-3" />
                    {showAnnotated ? 'Show Original' : 'Show AI Overlays'}
                  </button>
                )}
              </div>

              {/* Quality & Damage Indicators Badges */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Image Quality</span>
                  <span className="font-bold text-slate-800">
                    {analysis.image_quality?.quality_status || 'ACCEPTABLE'} ({Math.round((analysis.image_quality?.quality_score || 0.8) * 100)}%)
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    {analysis.image_quality?.brightness_status} exposure
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Assessed Severity</span>
                  <span className="font-bold text-red-700">
                    {analysis.recommendation?.damage_severity || 'MEDIUM'}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Confidence: {Math.round((analysis.recommendation?.confidence || 0.7) * 100)}%
                  </span>
                </div>
              </div>

              {/* Detected Entities List */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Localized Observations</h4>
                <div className="space-y-1.5">
                  {(analysis.damage_analysis?.indicators || []).map((ind, i) => (
                    <div key={`ind-${i}`} className="text-xs p-2 rounded-lg bg-orange-50 border border-orange-200 text-orange-900 flex items-center justify-between">
                      <span className="font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-orange-600" />
                        {ind.label.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[11px] font-mono font-bold text-orange-700">
                        {Math.round(ind.confidence * 100)}% Heuristic
                      </span>
                    </div>
                  ))}

                  {(analysis.object_detection?.detections || []).map((det, i) => (
                    <div key={`det-${i}`} className="text-xs p-2 rounded-lg bg-cyan-50 border border-cyan-200 text-cyan-900 flex items-center justify-between">
                      <span className="font-semibold">{det.label}</span>
                      <span className="text-[11px] font-mono text-cyan-700">
                        {Math.round(det.confidence * 100)}% YOLO
                      </span>
                    </div>
                  ))}

                  {(!analysis.damage_analysis?.indicators?.length && !analysis.object_detection?.detections?.length) && (
                    <p className="text-xs text-slate-500 italic p-2 bg-slate-50 rounded">
                      No structural cracks or specialized objects localized above confidence threshold.
                    </p>
                  )}
                </div>
              </div>

              {/* Triage Reasoning */}
              {analysis.recommendation?.reasoning && (
                <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-800 block mb-1">Triage Rationale:</span>
                  {analysis.recommendation.reasoning}
                </div>
              )}

              {/* Preliminary Findings Disclaimer */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <span>
                  <strong>Preliminary Findings:</strong> Computer Vision predictions are heuristic suggestions to accelerate triage. Final category and priority are confirmed by dispatch staff.
                </span>
              </div>
            </Card>
          </div>

          {/* Right Column: Editable Complaint & Campus Location */}
          <div className="lg:col-span-7">
            <Card className="p-6">
              <h3 className="text-base font-bold text-slate-900 mb-1">Verify & Submit Maintenance Ticket</h3>
              <p className="text-xs text-slate-500 mb-6">
                Review the AI-generated ticket information below. You may edit any field and confirm your campus location.
              </p>

              <form onSubmit={handleSubmitComplaint} className="space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Complaint Title *</label>
                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2.5 focus:ring-2 focus:ring-red-500"
                  />
                </div>

                {/* Category & Priority */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Assigned Category <span className="text-slate-400 font-normal">(AI Suggested)</span>
                    </label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="w-full text-xs rounded-lg border border-slate-300 p-2.5 bg-white focus:ring-2 focus:ring-red-500"
                    >
                      {Object.keys(CATEGORIES).map((key) => (
                        <option key={key} value={key}>
                          {CATEGORY_META[key]?.label || key}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Priority SLA <span className="text-slate-400 font-normal">(AI Suggested)</span>
                    </label>
                    <select
                      value={form.priority}
                      onChange={(e) => setForm({ ...form, priority: e.target.value })}
                      className="w-full text-xs rounded-lg border border-slate-300 p-2.5 bg-white focus:ring-2 focus:ring-red-500"
                    >
                      {Object.keys(PRIORITIES).map((key) => (
                        <option key={key} value={key}>
                          {PRIORITY_META[key]?.label || key}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Detailed Description *</label>
                  <textarea
                    rows={4}
                    required
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full text-xs rounded-lg border border-slate-300 p-2.5 focus:ring-2 focus:ring-red-500"
                  />
                </div>

                {/* Campus Location Selection */}
                <div className="pt-2 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5 mb-3">
                    <MapPin className="w-3.5 h-3.5 text-red-600" /> Campus Location Details
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Building *</label>
                      <select
                        value={form.location.building}
                        onChange={(e) => {
                          const newBuilding = e.target.value;
                          const bObj = CAMPUS.buildings.find((b) => b.name === newBuilding) || CAMPUS.buildings[0];
                          setForm({
                            ...form,
                            location: {
                              ...form.location,
                              building: newBuilding,
                              floor: bObj.floors[0]?.label || '',
                              room: bObj.floors[0]?.rooms[0] || '',
                            },
                          });
                        }}
                        className="w-full text-xs rounded-lg border border-slate-300 p-2 bg-white focus:ring-2 focus:ring-red-500"
                      >
                        {CAMPUS.buildings.map((b) => (
                          <option key={b.name} value={b.name}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Floor *</label>
                      <select
                        value={form.location.floor}
                        onChange={(e) => {
                          const newFloor = e.target.value;
                          const bObj = CAMPUS.buildings.find((b) => b.name === form.location.building);
                          const fObj = bObj?.floors.find((f) => f.label === newFloor);
                          setForm({
                            ...form,
                            location: {
                              ...form.location,
                              floor: newFloor,
                              room: fObj?.rooms[0] || '',
                            },
                          });
                        }}
                        className="w-full text-xs rounded-lg border border-slate-300 p-2 bg-white focus:ring-2 focus:ring-red-500"
                      >
                        {CAMPUS.buildings
                          .find((b) => b.name === form.location.building)
                          ?.floors.map((f) => (
                            <option key={f.label} value={f.label}>
                              {f.label}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Room / Hall *</label>
                      <select
                        value={form.location.room}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            location: { ...form.location, room: e.target.value },
                          })
                        }
                        className="w-full text-xs rounded-lg border border-slate-300 p-2 bg-white focus:ring-2 focus:ring-red-500"
                      >
                        {CAMPUS.buildings
                          .find((b) => b.name === form.location.building)
                          ?.floors.find((f) => f.label === form.location.floor)
                          ?.rooms.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Specific Landmark / Room Reference</label>
                    <input
                      type="text"
                      placeholder="e.g. Near window on north wall, laboratory desk #4"
                      value={form.location.landmark}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          location: { ...form.location, landmark: e.target.value },
                        })
                      }
                      className="w-full text-xs rounded-lg border border-slate-300 p-2 focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-5 border-t border-slate-100">
                  <Button variant="outline" type="button" onClick={() => setStage('capture')} icon={<ArrowLeft className="w-4 h-4" />}>
                    Back to Photo
                  </Button>
                  <Button
                    variant="primary"
                    type="submit"
                    loading={submitting}
                    className="bg-red-600 hover:bg-red-700 text-white font-semibold"
                    icon={<Check className="w-4 h-4" />}
                  >
                    Confirm & Submit Complaint
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
