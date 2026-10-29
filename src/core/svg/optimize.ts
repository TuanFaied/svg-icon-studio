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
            // The generator's animation CSS is already minimal, and csso would rewrite
            // hex colors to names (#ff0000 → red), which the sanitizer rejects for fill.
            minifyStyles: false,
            // Animation frames rest at opacity:0 until their turn; don't treat them as invisible.
            removeHiddenElems: { opacity0: false },
            removeUnknownsAndDefaults: { keepRoleAttr: true, keepAriaAttrs: true },
            convertPathData: { floatPrecision: 3, transformPrecision: 5 },
          },
        },
      },
    ],
  });
  return result.data;
}
