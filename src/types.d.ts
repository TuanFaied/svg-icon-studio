declare module 'imagetracerjs' {
  interface ImageTracerApi {
    imagedataToSVG(imgd: { width: number; height: number; data: Uint8ClampedArray }, options?: Record<string, number | string | boolean>): string;
  }
  const ImageTracer: ImageTracerApi;
  export default ImageTracer;
}
