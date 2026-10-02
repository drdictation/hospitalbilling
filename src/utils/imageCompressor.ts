export interface CompressedImageResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * Compresses an image file captured by the camera to a maximum bounding box of 1600x1200
 * at 80% JPEG quality. Preserves extreme clarity of text and barcodes while reducing
 * file size from ~8-12MB down to ~200-350KB.
 */
export async function compressStickerImage(
  file: File | Blob,
  maxWidth = 1600,
  maxHeight = 1200,
  quality = 0.82
): Promise<CompressedImageResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onerror = () => reject(new Error('Failed to read image file'));
    
    reader.onload = () => {
      const img = new Image();
      
      img.onerror = () => reject(new Error('Failed to decode image data'));
      
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate aspect ratio preserving dimensions
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          return reject(new Error('Could not get 2D canvas context'));
        }

        // Use high quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return reject(new Error('Canvas toBlob failed'));
            }

            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            
            resolve({
              blob,
              dataUrl,
              width,
              height,
              sizeBytes: blob.size,
            });
          },
          'image/jpeg',
          quality
        );
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}
