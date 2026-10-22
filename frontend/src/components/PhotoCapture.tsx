import { useState, useRef } from "react";
import { X, Camera, Upload } from "lucide-react";
import { Button } from "./ui";

interface PhotoCaptureProps {
  maxPhotos?: number;
  onChange: (files: File[]) => void;
}

export default function PhotoCapture({
  maxPhotos = 4,
  onChange,
}: PhotoCaptureProps) {
  const [photos, setPhotos] = useState<File[]>([]);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;

    const filesToAdd = Array.from(e.target.files);
    const availableSlots = maxPhotos - photos.length;
    const filesToProcess = filesToAdd.slice(0, availableSlots);

    const newPhotos = [...photos, ...filesToProcess];
    setPhotos(newPhotos);
    onChange(newPhotos);

    // Reset input so user can pick another file if desired
    e.target.value = "";
  };

  const removePhoto = (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    setPhotos(newPhotos);
    onChange(newPhotos);
  };

  const isFull = photos.length >= maxPhotos;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {/* Native Camera Trigger */}
        <Button
          variant="secondary"
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={isFull}
          className="text-sm px-3.5 py-2 flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg active:scale-95 transition-all"
        >
          <Camera className="w-4 h-4 text-emerald-600" />
          <span>Take Photo</span>
        </Button>

        {/* Gallery Picker Trigger */}
        <Button
          variant="secondary"
          type="button"
          disabled={isFull}
          onClick={() => galleryInputRef.current?.click()}
          className="text-sm px-3.5 py-2 flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg active:scale-95 transition-all"
        >
          <Upload className="w-4 h-4 text-blue-600" />
          <span>Choose from Gallery</span>
        </Button>

        {/* Hidden Native Camera Input - capture="environment" launches real mobile camera */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
          aria-label="Camera Input"
        />

        {/* Hidden Gallery Input */}
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          aria-label="Gallery Input"
        />
      </div>

      {isFull && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
          Maximum {maxPhotos} photos reached
        </p>
      )}

      {/* Thumbnails Preview */}
      {photos.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600">
            Attached Photos ({photos.length}/{maxPhotos})
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {photos.map((photo, index) => (
              <div
                key={index}
                className="relative aspect-square bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shadow-xs group"
              >
                <img
                  src={URL.createObjectURL(photo)}
                  alt={`Attached grievance photo ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(index)}
                  className="absolute top-1.5 right-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full p-1 shadow-md transition-transform active:scale-90"
                  title="Remove photo"
                  aria-label="Remove photo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
