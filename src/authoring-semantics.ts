import type { QuantityDimension, QuantityUnit } from './authoring-contract';

export type VehicleEngineSectionId =
  | 'overview'
  | 'cylinders'
  | 'rotating-assembly'
  | 'airflow'
  | 'valvetrain'
  | 'fuel-combustion'
  | 'ignition-controls'
  | 'losses-vehicle'
  | 'audio-character';

export interface VehicleEngineSection {
  readonly id: VehicleEngineSectionId;
  readonly label: string;
  readonly purpose: string;
  readonly sourcePaths: readonly string[];
}

/**
 * Stable product organization. Curves are edited beside the mechanism that
 * consumes them instead of being exposed as an unrelated global JSON array.
 */
export const VEHICLE_ENGINE_SECTIONS: readonly VehicleEngineSection[] = Object.freeze([
  Object.freeze({
    id: 'overview' as const,
    label: 'Engine',
    purpose: 'Identity, architecture, cycle, and operating limit.',
    sourcePaths: Object.freeze([
      'engine.identity',
      'engine.cycle',
      'engine.layout',
      'engine.limits',
    ]),
  }),
  Object.freeze({
    id: 'cylinders' as const,
    label: 'Cylinders & banks',
    purpose: 'Physical cylinders, bank geometry, and each cylinder’s component bindings.',
    sourcePaths: Object.freeze(['engine.banks', 'engine.cylinders']),
  }),
  Object.freeze({
    id: 'rotating-assembly' as const,
    label: 'Rotating assembly',
    purpose: 'Crankshafts, journals, connecting-rod definitions, and piston definitions.',
    sourcePaths: Object.freeze([
      'engine.crankshafts',
      'engine.output_crankshaft',
      'engine.journals',
      'engine.connecting_rods',
      'engine.pistons',
    ]),
  }),
  Object.freeze({
    id: 'airflow' as const,
    label: 'Airflow & exhaust',
    purpose: 'Intake manifolds, heads, ports, flow tables, and exhaust geometry.',
    sourcePaths: Object.freeze([
      'engine.intakes',
      'engine.heads',
      'engine.ports',
      'engine.exhausts',
      'engine.curves[port.flow_curve]',
    ]),
  }),
  Object.freeze({
    id: 'valvetrain' as const,
    label: 'Cams & valvetrain',
    purpose: 'Cam timing and lift, camshaft assignments, and standard or VTEC switching.',
    sourcePaths: Object.freeze([
      'engine.cam_lobes',
      'engine.camshafts',
      'engine.valvetrains',
      'engine.curves[cam_lobe.lift_curve]',
    ]),
  }),
  Object.freeze({
    id: 'fuel-combustion' as const,
    label: 'Fuel & combustion',
    purpose: 'Fuel energy, mixture chemistry, burn behavior, and flame-speed response.',
    sourcePaths: Object.freeze([
      'engine.fuels',
      'engine.default_fuel',
      'engine.curves[fuel.turbulence_to_flame_speed]',
    ]),
  }),
  Object.freeze({
    id: 'ignition-controls' as const,
    label: 'Ignition & controls',
    purpose: 'Firing sequence, timing, limiter, throttle behavior, and starter hardware.',
    sourcePaths: Object.freeze([
      'engine.ignition',
      'engine.curves[ignition.timing_curve]',
      'engine.throttle_controllers',
      'engine.throttle_controller',
      'engine.starter',
    ]),
  }),
  Object.freeze({
    id: 'losses-vehicle' as const,
    label: 'Losses & vehicle',
    purpose: 'Mechanical loss model and the vehicle/transmission used by the live bench.',
    sourcePaths: Object.freeze([
      'engine.losses',
      'engine.accessory_configurations',
      'rig.vehicle',
      'rig.transmission',
    ]),
  }),
  Object.freeze({
    id: 'audio-character' as const,
    label: 'Audio character',
    purpose: 'Cylinder routing, packaged exhaust responses, conditioning, and output mix.',
    sourcePaths: Object.freeze(['engine.source_routes', 'presentation']),
  }),
]);

export const QUANTITY_UNITS = Object.freeze({
  dimensionless: Object.freeze(['1']),
  angle: Object.freeze(['deg', 'rad']),
  angular_speed: Object.freeze(['rpm', 'rad/s']),
  area: Object.freeze(['m2', 'cm2', 'mm2', 'in2']),
  density: Object.freeze(['kg/m3', 'g/cm3']),
  duration: Object.freeze(['s', 'ms']),
  energy_per_mass: Object.freeze(['J/kg', 'kJ/kg', 'MJ/kg']),
  force: Object.freeze(['N']),
  frequency: Object.freeze(['Hz', 'kHz']),
  length: Object.freeze(['m', 'cm', 'mm', 'in']),
  mass: Object.freeze(['kg', 'g', 'lb']),
  mass_flow_rate: Object.freeze(['kg/s', 'g/s']),
  molar_mass: Object.freeze(['kg/mol', 'g/mol']),
  moment_of_inertia: Object.freeze(['kg*m2']),
  power: Object.freeze(['W', 'kW']),
  pressure: Object.freeze(['Pa', 'kPa', 'bar', 'atm', 'psi', 'inHg', 'inH2O']),
  pressure_per_speed: Object.freeze(['Pa*s/m', 'kPa*s/m', 'bar*s/m']),
  pressure_per_speed_squared: Object.freeze(['Pa*s2/m2', 'kPa*s2/m2', 'bar*s2/m2']),
  speed: Object.freeze(['m/s', 'km/h', 'mph']),
  temperature: Object.freeze(['K', 'degC']),
  torque: Object.freeze(['N*m', 'lb*ft']),
  volume: Object.freeze(['m3', 'L', 'cm3']),
  volume_flow_rate: Object.freeze(['m3/s', 'L/s', 'cfm']),
} satisfies { [D in QuantityDimension]: readonly QuantityUnit<D>[] });

export type AuthoringCapabilityState =
  | 'live-and-bake'
  | 'schema-only'
  | 'package-managed'
  | 'lab-excluded';

export interface AuthoringCapability {
  readonly sourcePath: string;
  readonly state: AuthoringCapabilityState;
  readonly reason: string;
}

/** Parser-known edges that need an explicit product policy. Everything else is live-and-bake. */
export const AUTHORING_CAPABILITY_EXCEPTIONS: readonly AuthoringCapability[] =
  Object.freeze([
    Object.freeze({
      sourcePath: 'engine.curves[].evaluation: linear | right_continuous_hold',
      state: 'schema-only' as const,
      reason: 'The current engine compiler executes clamped triangle-weighted curves.',
    }),
    Object.freeze({
      sourcePath: 'engine.curves[].below_domain | above_domain: zero | reject',
      state: 'schema-only' as const,
      reason: 'The current engine compiler executes clamped curve boundaries.',
    }),
    Object.freeze({
      sourcePath: 'engine.*_restriction: orifice | curve',
      state: 'schema-only' as const,
      reason: 'The current gas path executes calibrated flow-bench restrictions.',
    }),
    Object.freeze({
      sourcePath: 'engine.fuels[].density',
      state: 'schema-only' as const,
      reason: 'The parser recognizes fuel density but the low-order executor does not consume it.',
    }),
    Object.freeze({
      sourcePath: 'engine.source_routes[]: mechanical',
      state: 'schema-only' as const,
      reason: 'The current presentation executes exhaust source routes only.',
    }),
    Object.freeze({
      sourcePath: 'presentation.assets[].kind: audio_sample',
      state: 'schema-only' as const,
      reason: 'The current presentation accepts impulse-response payloads only.',
    }),
    Object.freeze({
      sourcePath: 'engine.accessory_configurations[].uri | sha256',
      state: 'package-managed' as const,
      reason: 'The lab resolves packaged loss evidence from a semantic resource choice.',
    }),
    Object.freeze({
      sourcePath: 'presentation.assets[].uri | sha256',
      state: 'package-managed' as const,
      reason: 'The lab resolves packaged audio bytes from a semantic impulse-response choice.',
    }),
    Object.freeze({
      sourcePath: 'rig.dyno_defaults',
      state: 'lab-excluded' as const,
      reason: 'Crankwave uses its live geared vehicle bench and does not author dyno defaults.',
    }),
  ]);
