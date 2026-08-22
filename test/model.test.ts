import { describe, expect, it } from 'engine:test';
import {
  ENGINE_SOURCE_SCHEMA,
  formatEngineSource,
  isVehicleEngineProjectPath,
  isVehicleEngineRuntimePath,
  parseEngineSource,
  vehicleEngineRuntimePath,
} from '../src/model';
import { ENGINE_PRESETS } from '../src/presets';

const SOURCE = `{
  "schema": "${ENGINE_SOURCE_SCHEMA}",
  "engine": {
    "identity": {"id": "fixture-v8", "display_name": "Fixture V8"},
    "layout": "v_engine",
    "limits": {"redline": {"value": 7000, "unit": "rpm"}},
    "cylinders": [{}, {}, {}, {}, {}, {}, {}, {}]
  },
  "presentation": {}
}`;

describe('Vehicle Engine Lab engine source model', () => {
  it('inspects the closed Vehicle Engine authoring envelope', () => {
    const parsed = parseEngineSource(SOURCE);

    expect(parsed.summary.id).toBe('fixture-v8');
    expect(parsed.summary.cylinders).toBe(8);
    expect(parsed.summary.redlineRpm).toBe(7000);
  });

  it('formats the complete parsed document and admits only project engine paths', () => {
    const formatted = formatEngineSource(SOURCE);

    expect(formatted.includes('"display_name": "Fixture V8"')).toBe(true);
    expect(formatted.endsWith('\n')).toBe(true);
    expect(isVehicleEngineProjectPath('vehicle-engines/fixture.vehicle-engine.json')).toBe(true);
    expect(isVehicleEngineProjectPath('vehicle-engines/v8/fixture.vehicle-engine.json')).toBe(true);
    expect(isVehicleEngineProjectPath('data/fixture.vehicle-engine.json')).toBe(false);
    expect(isVehicleEngineProjectPath('vehicle-engines/../fixture.vehicle-engine.json')).toBe(false);
    expect(isVehicleEngineProjectPath('vehicle-engines/fixture.engine.json')).toBe(false);
    expect(isVehicleEngineRuntimePath('vehicle-engines/fixture.vehicleengine')).toBe(true);
    expect(isVehicleEngineRuntimePath('../fixture.vehicleengine')).toBe(false);
    expect(vehicleEngineRuntimePath('fixture-v8')).toBe(
      'vehicle-engines/fixture-v8.vehicleengine'
    );
    expect(() => vehicleEngineRuntimePath('../fixture')).toThrow(/portable runtime filename/);
  });

  it('rejects invalid JSON and incompatible Engine Sim envelopes', () => {
    expect(() => parseEngineSource('{')).toThrow(/valid JSON/i);
    expect(() => parseEngineSource('{"schema":"studio/engine","engine":{}}')).toThrow(
      /engine-sim-offline\/engine/
    );
    expect(() =>
      parseEngineSource(SOURCE.replace('"presentation": {}', '"presentation": {}, "other": 1'))
    ).toThrow(/unsupported field 'other'/);
    expect(() =>
      parseEngineSource(
        SOURCE.replace('"cylinders":', '"not_an_engine_field": 1, "cylinders":')
      )
    ).toThrow(/unsupported field 'not_an_engine_field'/);
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
