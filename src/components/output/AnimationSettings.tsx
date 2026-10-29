'use client';

import {
  type AnimationKind, type AnimationTiming, defaultAnimation, type Direction, type Easing, LIMITS, timingOf,
} from '@/core/svg/animation';
import { NumberField, Section, Select, Slider, Toggle } from '@/components/ui/primitives';
import { useDocument } from '@/store/document';

const KINDS: Array<{ value: AnimationKind; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'spin', label: 'Spin' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'fade', label: 'Fade' },
  { value: 'bounce', label: 'Bounce' },
];

const seconds = (v: number) => `${Math.round(v * 100) / 100}s`;

export function AnimationSettings() {
  const anim = useDocument((s) => s.svg.animation);
  const setSvgOptions = useDocument((s) => s.setSvgOptions);
  const timing = timingOf(anim);

  const setTiming = (patch: Partial<AnimationTiming>) => {
    if (anim.kind === 'none') return;
    setSvgOptions({ animation: { ...anim, ...patch } });
  };

  return (
    <Section title="Animation">
      <Select<AnimationKind>
        label="Preset"
        value={anim.kind}
        // Switching presets keeps the timing the user already tuned.
        onChange={(kind) => setSvgOptions({ animation: defaultAnimation(kind, timing) })}
        options={KINDS}
      />

      {anim.kind === 'none' || !timing ? (
        <p className="py-1 text-[11px] leading-snug text-muted">
          Animate the whole icon with CSS keyframes, e.g. a stepped spin for a pixel loading spinner. The canvas stays still while you draw.
        </p>
      ) : (
        <div className="space-y-1">
          {anim.kind === 'spin' && (
            <Toggle label="Clockwise" checked={anim.clockwise} onChange={(clockwise) => setSvgOptions({ animation: { ...anim, clockwise } })} />
          )}
          {anim.kind === 'pulse' && (
            <Slider
              label="Grow to"
              value={anim.scale}
              min={LIMITS.scale[0]}
              max={LIMITS.scale[1]}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(scale) => setSvgOptions({ animation: { ...anim, scale } })}
            />
          )}
          {anim.kind === 'fade' && (
            <Slider
              label="Fade to"
              value={anim.minOpacity}
              min={LIMITS.minOpacity[0]}
              max={LIMITS.minOpacity[1]}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(minOpacity) => setSvgOptions({ animation: { ...anim, minOpacity } })}
            />
          )}
          {anim.kind === 'bounce' && (
            <Slider
              label="Height"
              value={anim.height}
              min={LIMITS.height[0]}
              max={LIMITS.height[1]}
              step={0.5}
              format={(v) => `${v} ${v === 1 ? 'cell' : 'cells'}`}
              onChange={(height) => setSvgOptions({ animation: { ...anim, height } })}
            />
          )}

          <Slider label="Duration" value={timing.duration} min={LIMITS.duration[0]} max={LIMITS.duration[1]} step={0.1} format={seconds} onChange={(duration) => setTiming({ duration })} />
          <Select<Easing>
            label="Easing"
            value={timing.easing}
            onChange={(easing) => setTiming({ easing })}
            options={[
              { value: 'steps', label: 'Stepped (pixel)' },
              { value: 'linear', label: 'Linear' },
              { value: 'ease-in-out', label: 'Ease in-out' },
            ]}
          />
          {timing.easing === 'steps' && (
            <Slider label="Steps" value={timing.steps} min={LIMITS.steps[0]} max={LIMITS.steps[1]} onChange={(steps) => setTiming({ steps })} />
          )}
          <Select<Direction>
            label="Direction"
            value={timing.direction}
            onChange={(direction) => setTiming({ direction })}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'reverse', label: 'Reverse' },
              { value: 'alternate', label: 'Alternate' },
            ]}
          />
          <Toggle label="Loop forever" checked={timing.iterations === 0} onChange={(loop) => setTiming({ iterations: loop ? 0 : 3 })} />
          {timing.iterations > 0 && (
            <NumberField
              label="Play count"
              min={1}
              max={LIMITS.iterations[1]}
              value={timing.iterations}
              onChange={(n) => setTiming({ iterations: Math.max(1, Math.min(LIMITS.iterations[1], Math.round(n) || 1)) })}
              className="pb-1"
            />
          )}
          <Slider label="Delay" value={timing.delay} min={LIMITS.delay[0]} max={LIMITS.delay[1]} step={0.1} format={seconds} onChange={(delay) => setTiming({ delay })} />
          <p className="text-[11px] leading-snug text-muted">
            Stopped for people who turn on “reduce motion”. PNG exports show the first frame.
          </p>
        </div>
      )}
    </Section>
  );
}
