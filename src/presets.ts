import { GENERATED_ENGINE_PRESETS } from '../generated/presets';
import { parseEngineSource } from './model';

export interface EnginePresetResourceDependency {
  readonly kind: 'accessory-configuration' | 'impulse-response';
  readonly sha256: string;
}

export interface EnginePreset {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly sourceJson: string;
  readonly sourcePath: string;
  /**
   * Content-addressed dependencies consumed by the live and bake workflows.
   * Project JSON retains the original Engine Sim WASM URI and hash.
   */
  readonly resourceDependencies: readonly EnginePresetResourceDependency[];
}

const DEPENDENCIES: Readonly<Record<string, readonly EnginePresetResourceDependency[]>> =
  Object.freeze({
    'sequoia-3ur-fe-cleanroom': Object.freeze([
      Object.freeze({
        kind: 'accessory-configuration' as const,
        sha256: '58feca2e7b011a72a910be8a76dde71bdf53d3beedce5cdd54dbee583135f224',
      }),
      Object.freeze({
        kind: 'impulse-response' as const,
        sha256: '75de9db47063395665d36b6d4232f477aae385feaa9ba158353fbdaf122db5cc',
      }),
    ]),
    'bmw-m52tub28-cleanroom': Object.freeze([
      Object.freeze({
        kind: 'accessory-configuration' as const,
        sha256: 'a1bcdbf0edd62a92ceddecd537f475b17cf2c6503fd65c3d2cf1b5d0d6315ede',
      }),
      Object.freeze({
        kind: 'impulse-response' as const,
        sha256: '75de9db47063395665d36b6d4232f477aae385feaa9ba158353fbdaf122db5cc',
      }),
    ]),
    'honda-b18c5-cleanroom': Object.freeze([
      Object.freeze({
        kind: 'accessory-configuration' as const,
        sha256: 'f6a52933a69429ee00e48ff47de613c9effb3509215219ab7b1bdae5e8be9c9b',
      }),
      Object.freeze({
        kind: 'impulse-response' as const,
        sha256: '75de9db47063395665d36b6d4232f477aae385feaa9ba158353fbdaf122db5cc',
      }),
    ]),
    'subaru-ej25-cleanroom': Object.freeze([
      Object.freeze({
        kind: 'accessory-configuration' as const,
        sha256: 'e90f6127213f989e6d75a99eab5bfc15e02d730be7fec7a219007ddd19033f4e',
      }),
      Object.freeze({
        kind: 'impulse-response' as const,
        sha256: 'f2875947eba2ed98a15f45a5d62f6ae7b607b0a56389bad5882d75748ad374b9',
      }),
    ]),
  });

export const ENGINE_PRESETS: readonly EnginePreset[] = Object.freeze(
  GENERATED_ENGINE_PRESETS.map((preset) => {
    const summary = parseEngineSource(preset.sourceJson).summary;
    if (summary.id !== preset.id) {
      throw new Error(`Generated engine preset '${preset.id}' contains engine '${summary.id}'`);
    }
    return Object.freeze({
      ...preset,
      description: summary.description ?? summary.displayName,
      resourceDependencies: DEPENDENCIES[preset.id] ?? Object.freeze([]),
    });
  })
);

export function getEnginePreset(id: string): EnginePreset {
  const preset = ENGINE_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) {
    throw new Error(`Unknown engine preset '${id}'`);
  }
  return preset;
}
