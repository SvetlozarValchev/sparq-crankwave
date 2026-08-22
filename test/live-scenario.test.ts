import { describe, expect, it } from 'engine:test';
import {
  collectVehicleEngineSourceAssets,
  createLiveEngineProgram,
  LIVE_BLOCK_DURATION_MS,
  LIVE_PHYSICS_RATE_HZ,
  LIVE_SOURCE_RATE_HZ,
} from '../src/live-scenario';
import { ENGINE_PRESETS } from '../src/presets';

describe('Crankwave live scenario', () => {
  it('creates a 10 kHz open-ended bench source with fixed 192 kHz delivery', () => {
    const preset = ENGINE_PRESETS[0]!;
    const program = createLiveEngineProgram(preset.sourceJson);
    const scenario = JSON.parse(program.scenarioJson) as {
      engine: string;
      fuel: string;
      mode: { type: string; initial_service_brake_application_01: number };
      rates: Record<string, { numerator: string }>;
      quality: { process_block_capacity_frames: number };
    };

    expect(program.engineId).toBe(preset.engineId);
    expect(scenario.engine).toBe(preset.engineId);
    expect(scenario.fuel).toBe('regular-unleaded-gasoline');
    expect(scenario.mode.type).toBe('free_vehicle');
    expect(program.serviceBrakeAvailable).toBe(false);
    expect(scenario.mode.initial_service_brake_application_01).toBe(0);
    expect(scenario.rates.physics!.numerator).toBe(String(LIVE_PHYSICS_RATE_HZ));
    expect(scenario.rates.capture!.numerator).toBe(String(LIVE_PHYSICS_RATE_HZ));
    expect(scenario.rates.source_processing!.numerator).toBe(String(LIVE_SOURCE_RATE_HZ));
    expect(scenario.rates.acoustics!.numerator).toBe(String(LIVE_SOURCE_RATE_HZ));
    expect(scenario.rates.delivery!.numerator).toBe(String(LIVE_SOURCE_RATE_HZ));
    expect(scenario.quality.process_block_capacity_frames).toBe(
      (LIVE_SOURCE_RATE_HZ * LIVE_BLOCK_DURATION_MS) / 1000
    );
  });

  it('maps every preset dependency to a content-addressed vendored payload', () => {
    for (const preset of ENGINE_PRESETS) {
      const assets = collectVehicleEngineSourceAssets(preset.sourceJson);
      expect(assets.length).toBe(preset.resourceDependencies.length);
      for (const asset of assets) {
        expect(asset.packagePath).toBe(
          `modules/@svalchev/crankwave/vendor/resources/${asset.sha256}`
        );
      }
    }
  });
});
