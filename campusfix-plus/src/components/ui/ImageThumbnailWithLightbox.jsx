import React, { useState } from 'react';
import Modal from './Modal';
import { ZoomIn, AlertCircle, Loader2 } from 'lucide-react';
import insforge from '../../lib/insforge';

/**
 * ImageThumbnailWithLightbox
 * Renders an image thumbnail anywhere (table, card, list) and on click
 * opens a high-resolution, full-size image preview in a modal without navigating away.
 */
export default function ImageThumbnailWithLightbox({
  src,
  alt = 'Evidence Thumbnail',
  className = 'w-9 h-9 rounded-lg',
  containerClassName = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  if (!src || hasError) return null;

  // Resolve permanent public URL if key or full url
  const resolvedUrl = src.startsWith('blob:')
    ? null
    : src.startsWith('http')
    ? src
    : insforge.storage.from('complaint-evidence').getPublicUrl(src).data?.publicUrl;

  if (!resolvedUrl) return null;

  const handleClick = (e) => {
    e.stopPropagation(); // Prevent row click or parent link trigger
    e.preventDefault();
    setIsOpen(true);
  };

  return (
    <>
      <div
        className={`relative inline-block overflow-hidden bg-slate-100 border border-slate-200 shrink-0 cursor-pointer group shadow-2xs ${containerClassName}`}
        onClick={handleClick}
        title="Click to view full photo"
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100 z-5">
            <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
          </div>
        )}
        <img
          src={resolvedUrl}
          alt={alt}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
          className={`object-cover group-hover:scale-110 transition-transform duration-200 ${className}`}
        />
        <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
          <ZoomIn className="w-3.5 h-3.5" />
        </div>
      </div>

      <Modal
        open={isOpen}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={alt || 'Photographic Evidence Full View'}
        maxWidth="max-w-4xl"
      >
        <div
          className="flex flex-col items-center justify-center p-1"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative max-h-[75vh] w-full flex items-center justify-center bg-slate-950 rounded-xl overflow-hidden p-2 shadow-2xl border border-slate-800">
            <img
              src={resolvedUrl}
              alt={alt}
              className="max-h-[70vh] max-w-full rounded-lg object-contain shadow-md"
            />
          </div>
          {alt && (
            <p className="mt-3 text-xs text-slate-500 font-mono text-center">{alt}</p>
          )}
        </div>
      </Modal>
    </>
  );
}
