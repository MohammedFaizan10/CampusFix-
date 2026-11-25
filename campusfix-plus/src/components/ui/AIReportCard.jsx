import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Camera, ArrowRight } from 'lucide-react';
import Card from './Card';
import Button from './Button';

export default function AIReportCard() {
  return (
    <Card className="border border-red-200 bg-red-50/60 shadow-sm hover:border-red-300 transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white shadow-sm ring-4 ring-red-100">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 tracking-wide uppercase">
                <Camera className="h-3 w-3" /> AI Vision Inspection
              </span>
            </div>
            <h3 className="text-base font-bold text-slate-900 mt-1">Report an Issue with AI</h3>
            <p className="mt-0.5 text-xs text-slate-600">
              Snap or upload a photo of cracks, water leaks, or damaged campus assets. Our Computer Vision pipeline auto-detects damage, suggests categories, and drafts your ticket instantly.
            </p>
          </div>
        </div>

        <div className="sm:shrink-0">
          <Link to="/student/report-ai">
            <Button
              size="md"
              className="bg-red-600 hover:bg-red-700 text-white shadow-sm font-semibold w-full sm:w-auto"
              icon={<ArrowRight className="h-4 w-4" />}
            >
              Start AI Inspection
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}
