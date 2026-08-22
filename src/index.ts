export {
  ENGINE_MAX_SOURCE_BYTES,
  VEHICLE_ENGINE_PROJECT_DIRECTORY,
  VEHICLE_ENGINE_PROJECT_SUFFIX,
  VEHICLE_ENGINE_RUNTIME_SUFFIX,
  ENGINE_SOURCE_SCHEMA,
  vehicleEngineDocumentNameFromPath,
  formatEngineSource,
  isVehicleEngineProjectPath,
  isVehicleEngineRuntimePath,
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
export interface VehicleEngineRuntimeAsset {
  readonly kind: 'vehicle-engine.project-file';
  readonly engineId: string;
  readonly path: string;
}
