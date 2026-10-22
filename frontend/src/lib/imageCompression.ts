/**
 * Client-side image compression utility using HTML Canvas.
 * Resizes large camera photos to a max dimension of 1280px and applies 80% JPEG/WebP quality.
 * Prevents bandwidth waste and speeds up vision verification.
 */
export interface CompressionResult {
  file: File;
  dataUrl: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  reductionPercentage: number;
}

export async function compressImage(
  inputFile: File,
  options: { maxDimension?: number; quality?: number } = {}
): Promise<CompressionResult> {
  const maxDimension = options.maxDimension || 1280;
  const quality = options.quality || 0.8;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read input image file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Invalid image format"));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return reject(new Error("Canvas 2D context unavailable"));
        }

        // Draw image on canvas with high-quality smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        const mimeType = "image/jpeg";
        const dataUrl = canvas.toDataURL(mimeType, quality);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return reject(new Error("Image compression failed"));
            }

            const compressedFile = new File([blob], inputFile.name.replace(/\.[^.]+$/, ".jpg"), {
              type: mimeType,
              lastModified: Date.now(),
            });

            const originalSizeBytes = inputFile.size;
            const compressedSizeBytes = blob.size;
            const reductionPercentage = Math.round(
              ((originalSizeBytes - compressedSizeBytes) / Math.max(originalSizeBytes, 1)) * 100
            );

            console.log(
              `[IMAGE_COMPRESSION] Compressed ${inputFile.name}: ${(originalSizeBytes / 1024).toFixed(1)}KB -> ${(compressedSizeBytes / 1024).toFixed(1)}KB (-${reductionPercentage}%)`
            );

            resolve({
              file: compressedFile,
              dataUrl,
              originalSizeBytes,
              compressedSizeBytes,
              reductionPercentage,
            });
          },
          mimeType,
          quality
        );
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(inputFile);
  });
}
