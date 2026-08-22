import { GENERATED_ENGINE_PRESETS } from '../generated/presets';
import { parseEngineSource } from './model';

export interface EnginePresetResourceDependency {
  readonly kind: 'accessory-configuration' | 'impulse-response';
  readonly sha256: string;
}

export interface EnginePreset {
  readonly id: string;
  readonly engineId: string;
  readonly label: string;
  readonly description: string;
  readonly sourceJson: string;
  readonly sourcePath: string;
  /**
   * Content-addressed dependencies consumed by the live and bake workflows.
   * Project JSON retains the authoritative Crankwave URI and content hash.
   */
  readonly resourceDependencies: readonly EnginePresetResourceDependency[];
}

type JsonRecord = Readonly<Record<string, unknown>>;

function records(value: unknown): readonly JsonRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is JsonRecord =>
          entry !== null && typeof entry === 'object' && !Array.isArray(entry)
      )
    : [];
}

function dependencies(sourceJson: string): readonly EnginePresetResourceDependency[] {
  const document = parseEngineSource(sourceJson).document as unknown as JsonRecord;
  const engine = document.engine as JsonRecord;
  const presentation = document.presentation as JsonRecord;
  const result: EnginePresetResourceDependency[] = [];
  for (const resource of records(engine.accessory_configurations)) {
    if (typeof resource.sha256 === 'string') {
      result.push({ kind: 'accessory-configuration', sha256: resource.sha256 });
    }
  }
  for (const resource of records(presentation.assets)) {
    if (resource.kind === 'impulse_response' && typeof resource.sha256 === 'string') {
      result.push({ kind: 'impulse-response', sha256: resource.sha256 });
    }
  }
  return Object.freeze(result.map((resource) => Object.freeze(resource)));
}

export const ENGINE_PRESETS: readonly EnginePreset[] = Object.freeze(
  GENERATED_ENGINE_PRESETS.map((preset) => {
    const summary = parseEngineSource(preset.sourceJson).summary;
    if (summary.id !== preset.engineId) {
      throw new Error(`Generated engine preset '${preset.id}' contains engine '${summary.id}'`);
    }
    return Object.freeze({
      ...preset,
      description: summary.description ?? summary.displayName,
      resourceDependencies: dependencies(preset.sourceJson),
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
