import { optimize } from 'svgo/browser';

/**
 * Runs SVGO with presets that keep geometry intact: shapes stay shapes,
 * paths are not merged, and viewBox/accessibility attributes are kept.
 */
export function optimizeSvg(svg: string): string {
  const result = optimize(svg, {
    multipass: true,
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            convertShapeToPath: false,
            // Keep hex colors (no 'red'/'tan' names) so output stays predictable.
            convertColors: { shortname: false },
            mergePaths: false,
            // Inlining animation rules into style="" drops the class and with it the
            // prefers-reduced-motion override, so keep stylesheet rules where they are.
            inlineStyles: false,
            removeUnknownsAndDefaults: { keepRoleAttr: true, keepAriaAttrs: true },
            convertPathData: { floatPrecision: 3, transformPrecision: 5 },
          },
        },
      },
    ],
  });
  return result.data;
}
