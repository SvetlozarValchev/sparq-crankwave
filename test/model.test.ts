import { describe, expect, it } from 'engine:test';
import {
  ENGINE_SOURCE_SCHEMA,
  formatEngineSource,
  isVehicleEngineProjectPath,
  isVehicleEngineRuntimePath,
  parseEngineSource,
} from '../src/model';
import { ENGINE_PRESETS } from '../src/presets';

const SOURCE = `{
  "schema": "${ENGINE_SOURCE_SCHEMA}",
  "engine": {
    "identity": {"id": "fixture-v8", "display_name": "Fixture V8"},
    "layout": "v_engine",
    "limits": {"redline": {"value": 7000, "unit": "rpm"}},
    "cylinders": [{}, {}, {}, {}, {}, {}, {}, {}],
    "future_executor_field": {"kept": [1, 2, 3]}
  },
  "future_root_field": "also-kept"
}`;

describe('Vehicle Engine Lab engine source model', () => {
  it('inspects the complete Engine Sim envelope without projecting persistence fields', () => {
    const parsed = parseEngineSource(SOURCE);

    expect(parsed.summary.id).toBe('fixture-v8');
    expect(parsed.summary.cylinders).toBe(8);
    expect(parsed.summary.redlineRpm).toBe(7000);
    expect(JSON.stringify(parsed.document).includes('future_executor_field')).toBe(true);
    expect(JSON.stringify(parsed.document).includes('future_root_field')).toBe(true);
  });

  it('formats the complete parsed document and admits only project engine paths', () => {
    const formatted = formatEngineSource(SOURCE);

    expect(formatted.includes('future_executor_field')).toBe(true);
    expect(formatted.includes('future_root_field')).toBe(true);
    expect(formatted.endsWith('\n')).toBe(true);
    expect(isVehicleEngineProjectPath('vehicle-engines/fixture.vehicle-engine.json')).toBe(true);
    expect(isVehicleEngineProjectPath('vehicle-engines/v8/fixture.vehicle-engine.json')).toBe(true);
    expect(isVehicleEngineProjectPath('data/fixture.vehicle-engine.json')).toBe(false);
    expect(isVehicleEngineProjectPath('vehicle-engines/../fixture.vehicle-engine.json')).toBe(false);
    expect(isVehicleEngineProjectPath('vehicle-engines/fixture.engine.json')).toBe(false);
    expect(isVehicleEngineRuntimePath('vehicle-engines/fixture.vehicleengine')).toBe(true);
    expect(isVehicleEngineRuntimePath('../fixture.vehicleengine')).toBe(false);
  });

  it('rejects invalid JSON and incompatible Engine Sim envelopes', () => {
    expect(() => parseEngineSource('{')).toThrow(/valid JSON/i);
    expect(() => parseEngineSource('{"schema":"studio/engine","engine":{}}')).toThrow(
      /engine-sim-offline\/engine/
    );
  });

  it('ships multiple exact full-schema presets from Engine Sim WASM', () => {
    expect(ENGINE_PRESETS.length).toBe(4);
    for (const preset of ENGINE_PRESETS) {
      const parsed = parseEngineSource(preset.sourceJson);
      expect(parsed.summary.id).toBe(preset.id);
      expect(preset.sourcePath.startsWith('engine-sim-wasm/data/engines/')).toBe(true);
      expect(preset.resourceDependencies.length > 0).toBe(true);
    }
  });
});
