export {
  ENGINE_MAX_SOURCE_BYTES,
  CRANKWAVE_SOURCE_DIRECTORY,
  CRANKWAVE_SOURCE_SUFFIX,
  CRANKWAVE_RUNTIME_SUFFIX,
  ENGINE_SOURCE_SCHEMA,
  crankwaveDocumentNameFromPath,
  formatEngineSource,
  isCrankwaveSourcePath,
  isCrankwavePath,
  parseEngineSource,
  type EngineSourceSummary,
  type ParsedEngineSource,
} from './model';
export * from './authoring-contract';
export * from './authoring-semantics';
export * from './resources';
export * from './runtime';
export {
  ENGINE_PRESETS,
  getEnginePreset,
  type EnginePreset,
  type EnginePresetResourceDependency,
} from './presets';

/** Baked runtime carrier stored as a project file. */
export interface CrankwaveRuntimeAsset {
  readonly kind: 'crankwave.project-file';
  readonly engineId: string;
  readonly path: string;
}
