/// <reference lib="webworker" />
import { autoDigitize, type AutoDigitizeOptions, type RasterImage } from './autoDigitize';

export interface TraceRequest {
  id: number;
  image: RasterImage;
  opts: AutoDigitizeOptions;
}

self.onmessage = (e: MessageEvent<TraceRequest>) => {
  const { id, image, opts } = e.data;
  try {
    const result = autoDigitize(image, opts);
    (self as unknown as Worker).postMessage({ id, result }, [result.preview.data.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
