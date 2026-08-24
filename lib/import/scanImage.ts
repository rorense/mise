import type { LlmImageMediaType } from '@/lib/llm';
import * as ImageManipulator from 'expo-image-manipulator';

export type ScanImage = {
  base64: string;
  mediaType: LlmImageMediaType;
};

/** A captured photo as ImagePicker hands it back. */
export type ScanPhoto = {
  uri: string;
  width: number;
  height: number;
};

/**
 * Long edge, in pixels, of an image sent to a vision model.
 *
 * Deliberately larger than the 1200px used for stored cook photos in
 * `lib/media.ts`: that size is right for a thumbnail and too small to read a
 * recipe off a page. Claude bills images as ceil(w/28) * ceil(h/28) visual
 * tokens and caps a high-resolution image at 4784 of them, so a 4:3 photo at
 * 1650x2200 lands at 4661 — the largest size that is not downscaled again
 * server-side. Going bigger costs upload time and buys nothing.
 */
export const SCAN_LONG_EDGE = 2200;

/**
 * Kept high on purpose. Heavy JPEG compression is exactly what makes small
 * printed text unreadable, which is the whole job here.
 */
const SCAN_QUALITY = 0.85;

/** Most photos a recipe scan will ever need; more costs more than it finds. */
export const MAX_SCAN_IMAGES = 4;

/**
 * Resizes a captured photo for a vision request and returns it as base64.
 *
 * `manipulateAsync` resizes on whichever dimension you name and derives the
 * other from the aspect ratio, so constraining the *long* edge means choosing
 * the dimension per photo. Naming width unconditionally would under-sample a
 * portrait page, which is the common case for a cookbook.
 */
export async function prepareScanImage(
  uri: string,
  // ImagePicker already reports these. Passing them skips a measuring pass that
  // would fully decode and re-encode a 12MP photo just to read two numbers —
  // worth avoiding once per page on a four-page scan.
  size?: { width: number; height: number }
): Promise<ScanImage> {
  const measured =
    size ??
    (await ImageManipulator.manipulateAsync(uri, [], {
      compress: 1,
      format: ImageManipulator.SaveFormat.JPEG,
    }));
  const isLandscape = measured.width >= measured.height;
  const longEdge = isLandscape ? measured.width : measured.height;

  // Never upscale: enlarging a small photo adds bytes without adding detail.
  const actions: ImageManipulator.Action[] =
    longEdge > SCAN_LONG_EDGE
      ? [
          {
            resize: isLandscape
              ? { width: SCAN_LONG_EDGE }
              : { height: SCAN_LONG_EDGE },
          },
        ]
      : [];

  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: SCAN_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  if (!result.base64) {
    throw new Error('Could not read that photo. Try taking it again.');
  }
  return { base64: result.base64, mediaType: 'image/jpeg' };
}
