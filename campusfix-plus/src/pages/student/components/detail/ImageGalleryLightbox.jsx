import React, { useState } from 'react';
import Modal from '../../../../components/ui/Modal';
import { Image as ImageIcon, ZoomIn, AlertCircle, Loader2 } from 'lucide-react';
import insforge from '../../../../lib/insforge';

export default function ImageGalleryLightbox({ evidence = [], images = [] }) {
  const [activeImage, setActiveImage] = useState(null);
  const [failedImages, setFailedImages] = useState({});
  const [loadingImages, setLoadingImages] = useState({});

  // Support both 'evidence' and 'images' prop names for compatibility
  const rawList = (evidence && evidence.length > 0 ? evidence : images) || [];
  if (!rawList || rawList.length === 0) return null;

  // Resolve permanent storage URL from item
  const resolveImageUrl = (img) => {
    if (!img) return null;
    if (typeof img === 'string') {
      if (img.startsWith('blob:')) return null; // Ignore stale browser blobs
      return img;
    }

    if (img.url && !img.url.startsWith('blob:')) {
      return img.url;
    }

    if (img.key) {
      const { data } = insforge.storage.from('complaint-evidence').getPublicUrl(img.key);
      return data?.publicUrl || null;
    }

    return null;
  };

  const handleImageLoad = (idx) => {
    setLoadingImages((prev) => ({ ...prev, [idx]: false }));
  };

  const handleImageError = (idx) => {
    setLoadingImages((prev) => ({ ...prev, [idx]: false }));
    setFailedImages((prev) => ({ ...prev, [idx]: true }));
  };

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
        <ImageIcon className="h-4 w-4 text-primary-600" />
        <span>Photographic Evidence ({rawList.length})</span>
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
        {rawList.map((img, idx) => {
          const resolvedUrl = resolveImageUrl(img);
          const hasFailed = failedImages[idx] || !resolvedUrl;
          const isLoading = loadingImages[idx] !== false && !hasFailed;
          const imageName = img?.name || `Evidence ${idx + 1}`;

          return (
            <div
              key={idx}
              className="group relative rounded-xl border border-slate-200 overflow-hidden aspect-video bg-slate-100 flex items-center justify-center shadow-2xs"
            >
              {hasFailed ? (
                <div className="p-3 text-center flex flex-col items-center justify-center text-slate-400">
                  <AlertCircle className="w-5 h-5 text-slate-300 mb-1" />
                  <span className="text-[10px] font-medium leading-tight text-slate-400">Photo Unavailable</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveImage({ url: resolvedUrl, name: imageName })}
                  className="w-full h-full relative focus:outline-none focus:ring-2 focus:ring-primary-600 cursor-pointer"
                >
                  {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-100 z-10">
                      <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                    </div>
                  )}
                  <img
                    src={resolvedUrl}
                    alt={imageName}
                    onLoad={() => handleImageLoad(idx)}
                    onError={() => handleImageError(idx)}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                    <ZoomIn className="h-5 w-5" />
                  </div>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {activeImage && (
        <Modal
          open={Boolean(activeImage)}
          isOpen={Boolean(activeImage)}
          onClose={() => setActiveImage(null)}
          title={activeImage.name || 'Photographic Evidence Preview'}
          maxWidth="max-w-4xl"
        >
          <div className="flex flex-col items-center p-2">
            <div className="relative max-h-[75vh] w-full flex items-center justify-center bg-slate-950 rounded-xl overflow-hidden p-2 shadow-2xl border border-slate-800">
              <img
                src={activeImage.url}
                alt={activeImage.name || 'Full view'}
                className="max-h-[70vh] max-w-full rounded-lg object-contain shadow-md"
              />
            </div>
            {activeImage.name && (
              <p className="mt-2.5 text-xs text-slate-500 font-mono text-center">{activeImage.name}</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
