export interface BarcodeResult {
  rawValue: string;
  format: string;
}

/**
 * Scan an image Blob, canvas, or image element for 1D or 2D barcodes.
 * 
 * 1. Checks native 'BarcodeDetector' API first (supported in Safari 17+ on iPhone, running at native GPU/NE speed <15ms).
 * 2. Falls back to @zxing/library if native API is absent or yields no result.
 */
export async function scanBarcode(
  source: Blob | HTMLCanvasElement | HTMLImageElement | string
): Promise<BarcodeResult | null> {
  // Convert source to Blob or HTMLImageElement if string dataURL
  let blob: Blob | null = null;
  let imgElement: HTMLImageElement | null = null;

  if (source instanceof Blob) {
    blob = source;
  } else if (typeof source === 'string') {
    // Data URL
    const res = await fetch(source);
    blob = await res.blob();
  } else if (source instanceof HTMLImageElement) {
    imgElement = source;
  }

  // 1. Try Native BarcodeDetector (iOS Safari 17+)
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const formats = ['code_128', 'code_39', 'qr_code', 'itf', 'data_matrix', 'codabar', 'ean_13', 'upc_a'];
      const BarcodeDetectorClass = (window as any).BarcodeDetector;
      const detector = new BarcodeDetectorClass({ formats });

      let detected: any[] = [];
      if (blob && typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(blob);
        try {
          detected = await detector.detect(bitmap);
        } finally {
          bitmap.close();
        }
      } else if (imgElement) {
        detected = await detector.detect(imgElement);
      } else if (source instanceof HTMLCanvasElement) {
        detected = await detector.detect(source);
      }

      if (detected && detected.length > 0) {
        // Return the first barcode decoded
        const bc = detected[0];
        const rawValue = (bc.rawValue || '').trim();
        if (rawValue) {
          return {
            rawValue,
            format: bc.format || 'BARCODE',
          };
        }
      }
    } catch (nativeErr) {
      console.warn('Native BarcodeDetector failed or format unsupported, trying ZXing fallback:', nativeErr);
    }
  }

  // 2. ZXing Fallback
  try {
    const { BrowserMultiFormatReader } = await import('@zxing/library');
    const reader = new BrowserMultiFormatReader();
    
    // Prepare an HTMLImageElement
    let targetImg = imgElement;
    let objectUrlToRevoke: string | null = null;

    if (!targetImg && blob) {
      targetImg = new Image();
      objectUrlToRevoke = URL.createObjectURL(blob);
      await new Promise<void>((resolve, reject) => {
        if (!targetImg) return reject(new Error('No image'));
        targetImg.onload = () => resolve();
        targetImg.onerror = (e) => reject(e);
        targetImg.src = objectUrlToRevoke!;
      });
    }

    if (targetImg) {
      try {
        const result = reader.decode(targetImg);
        if (result && result.getText()) {
          return {
            rawValue: result.getText().trim(),
            format: result.getBarcodeFormat() ? result.getBarcodeFormat().toString() : 'ZXING_1D',
          };
        }
      } finally {
        if (objectUrlToRevoke) {
          URL.revokeObjectURL(objectUrlToRevoke);
        }
      }
    }
  } catch (_zxingErr) {
    // Normal when image contains no barcode or low contrast
  }

  return null;
}
