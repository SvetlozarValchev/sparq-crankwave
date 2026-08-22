import { describe, expect, it } from 'engine:test';
import {
  ENGINE_SOURCE_SCHEMA,
  formatEngineSource,
  isCrankwaveSourcePath,
  isCrankwavePath,
  parseEngineSource,
  crankwaveRuntimePath,
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

describe('Crankwave engine source model', () => {
  it('inspects the closed Crankwave authoring envelope', () => {
    const parsed = parseEngineSource(SOURCE);

    expect(parsed.summary.id).toBe('fixture-v8');
    expect(parsed.summary.cylinders).toBe(8);
    expect(parsed.summary.redlineRpm).toBe(7000);
  });

  it('formats the complete parsed document and admits only project engine paths', () => {
    const formatted = formatEngineSource(SOURCE);

    expect(formatted.includes('"display_name": "Fixture V8"')).toBe(true);
    expect(formatted.endsWith('\n')).toBe(true);
    expect(isCrankwaveSourcePath('crankwave-engines/fixture.crankwave.json')).toBe(true);
    expect(isCrankwaveSourcePath('crankwave-engines/v8/fixture.crankwave.json')).toBe(true);
    expect(isCrankwaveSourcePath('data/fixture.crankwave.json')).toBe(false);
    expect(isCrankwaveSourcePath('crankwave-engines/../fixture.crankwave.json')).toBe(false);
    expect(isCrankwaveSourcePath('crankwave-engines/fixture.engine.json')).toBe(false);
    expect(isCrankwavePath('crankwave-engines/fixture.crankwave')).toBe(true);
    expect(isCrankwavePath('../fixture.crankwave')).toBe(false);
    expect(crankwaveRuntimePath('fixture-v8')).toBe(
      'crankwave-engines/fixture-v8.crankwave'
    );
    expect(() => crankwaveRuntimePath('../fixture')).toThrow(/portable runtime filename/);
  });

  it('rejects invalid JSON and incompatible Crankwave envelopes', () => {
    expect(() => parseEngineSource('{')).toThrow(/valid JSON/i);
    expect(() => parseEngineSource('{"schema":"studio/engine","engine":{}}')).toThrow(
      /crankwave\/engine/
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

  it('ships every exact full-schema Crankwave preset', () => {
    expect(ENGINE_PRESETS.length).toBe(15);
    for (const preset of ENGINE_PRESETS) {
      const parsed = parseEngineSource(preset.sourceJson);
      expect(parsed.summary.id).toBe(preset.engineId);
      expect(preset.sourcePath.startsWith('crankwave/data/engines/')).toBe(true);
      expect(preset.resourceDependencies.length > 0).toBe(true);
    }
  });
});
