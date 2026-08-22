import { describe, expect, it } from 'engine:test';
import type { VehicleEngineDocument } from '../src/authoring-contract';
import { parseEngineSource } from '../src/model';
import { ENGINE_PRESETS } from '../src/presets';
import { VehicleEngineDrivetrainRuntime } from '../src/runtime';

describe('Vehicle engine drivetrain runtime', () => {
  const toyota = parseEngineSource(ENGINE_PRESETS[0]!.sourceJson).document;

  it('maps the authored Toyota rig into gears, rpm, and reflected clutch capacity', () => {
    const drivetrain = new VehicleEngineDrivetrainRuntime(toyota, 650, 6_000, 4);
    const stopped = drivetrain.sample(0, 0.12);
    expect(stopped.gearId).toBe('gear-1');
    expect(stopped.rpm).toBe(650);
    expect(stopped.maximumDriveTorqueNm).toBeCloseTo(
      800 * 3.333 * 4.3,
      8
    );

    const moving = drivetrain.sample(30, 0.7);
    expect(moving.gearId).toBe('gear-2');
    expect(moving.rpm).toBeGreaterThan(5_000);
    expect(moving.rpm).toBeLessThanOrEqual(6_000);
    expect(moving.throttle01).toBe(0.7);
    expect(moving.load01).toBe(0.7);
  });

  it('requires the finite vehicle and transmission definition', () => {
    const withoutRig = { ...toyota, rig: null } as VehicleEngineDocument;
    expect(() => new VehicleEngineDrivetrainRuntime(withoutRig, 650, 6_000)).toThrow();
  });
});
