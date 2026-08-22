/**
 * Closed wire contract for `crankwave/engine` documents.
 *
 * Property names intentionally match the authored JSON. The editor presents
 * these values through semantic controls; this module is not a generic JSON
 * value model.
 */

export type VehicleEngineId = string;

export type QuantityDimension =
  | 'dimensionless'
  | 'angle'
  | 'angular_speed'
  | 'area'
  | 'density'
  | 'duration'
  | 'energy_per_mass'
  | 'force'
  | 'frequency'
  | 'length'
  | 'mass'
  | 'mass_flow_rate'
  | 'molar_mass'
  | 'moment_of_inertia'
  | 'power'
  | 'pressure'
  | 'pressure_per_speed'
  | 'pressure_per_speed_squared'
  | 'speed'
  | 'temperature'
  | 'torque'
  | 'volume'
  | 'volume_flow_rate';

export type QuantityUnitByDimension = Readonly<{
  dimensionless: '1';
  angle: 'deg' | 'rad';
  angular_speed: 'rpm' | 'rad/s';
  area: 'm2' | 'cm2' | 'mm2' | 'in2';
  density: 'kg/m3' | 'g/cm3';
  duration: 's' | 'ms';
  energy_per_mass: 'J/kg' | 'kJ/kg' | 'MJ/kg';
  force: 'N';
  frequency: 'Hz' | 'kHz';
  length: 'm' | 'cm' | 'mm' | 'in';
  mass: 'kg' | 'g' | 'lb';
  mass_flow_rate: 'kg/s' | 'g/s';
  molar_mass: 'kg/mol' | 'g/mol';
  moment_of_inertia: 'kg*m2';
  power: 'W' | 'kW';
  pressure: 'Pa' | 'kPa' | 'bar' | 'atm' | 'psi' | 'inHg' | 'inH2O';
  pressure_per_speed: 'Pa*s/m' | 'kPa*s/m' | 'bar*s/m';
  pressure_per_speed_squared: 'Pa*s2/m2' | 'kPa*s2/m2' | 'bar*s2/m2';
  speed: 'm/s' | 'km/h' | 'mph';
  temperature: 'K' | 'degC';
  torque: 'N*m' | 'lb*ft';
  volume: 'm3' | 'L' | 'cm3';
  volume_flow_rate: 'm3/s' | 'L/s' | 'cfm';
}>;

export type QuantityUnit<D extends QuantityDimension = QuantityDimension> =
  QuantityUnitByDimension[D];

export type FlowCalibrationStandard = 'carburetor_1p5_inhg' | 'port_28_inh2o';

export interface Quantity<D extends QuantityDimension = QuantityDimension> {
  value: number;
  unit: QuantityUnit<D>;
  standard?: D extends 'volume_flow_rate' ? FlowCalibrationStandard | null : never;
}

export interface CurveSample<I extends QuantityDimension, O extends QuantityDimension> {
  input: Quantity<I>;
  output: Quantity<O>;
}

export type CurveEvaluation =
  | 'linear'
  | 'right_continuous_hold'
  | 'triangle_weighted_samples';
export type CurveBoundaryBehavior = 'clamp' | 'zero' | 'reject';

export interface CurveDefinition<
  I extends QuantityDimension = QuantityDimension,
  O extends QuantityDimension = QuantityDimension,
> {
  id: VehicleEngineId;
  input_dimension: I;
  output_dimension: O;
  evaluation: CurveEvaluation;
  triangle_filter_radius?: Quantity<I> | null;
  below_domain: CurveBoundaryBehavior;
  above_domain: CurveBoundaryBehavior;
  samples: CurveSample<I, O>[];
}

export interface FlowBenchRestriction {
  type: 'flow_bench';
  rated_flow: Quantity<'volume_flow_rate'> & { standard: FlowCalibrationStandard };
  pressure_drop: Quantity<'pressure'>;
}

export interface OrificeRestriction {
  type: 'orifice';
  effective_area: Quantity<'area'>;
  discharge_coefficient_01: number;
}

export interface CurveRestriction {
  type: 'curve';
  pressure_drop_to_flow: VehicleEngineId;
}

export type FlowRestriction =
  | FlowBenchRestriction
  | OrificeRestriction
  | CurveRestriction;

export interface EngineIdentity {
  id: VehicleEngineId;
  display_name: string;
  description?: string | null;
}

export interface EngineLimits {
  redline: Quantity<'angular_speed'>;
}

export interface CrankshaftDefinition {
  id: VehicleEngineId;
  throw_radius: Quantity<'length'>;
  mass: Quantity<'mass'>;
  flywheel_mass: Quantity<'mass'>;
  moment_of_inertia: Quantity<'moment_of_inertia'>;
  friction_torque: Quantity<'torque'>;
  tdc_reference_angle: Quantity<'angle'>;
}

export interface CrankshaftJournalDefinition {
  id: VehicleEngineId;
  type: 'crankshaft';
  crankshaft: VehicleEngineId;
  phase: Quantity<'angle'>;
}

export interface MasterRodJournalDefinition {
  id: VehicleEngineId;
  type: 'master_rod';
  master_cylinder: VehicleEngineId;
  throw_radius: Quantity<'length'>;
  phase: Quantity<'angle'>;
}

export type JournalDefinition = CrankshaftJournalDefinition | MasterRodJournalDefinition;

export interface ConnectingRodDefinition {
  id: VehicleEngineId;
  length: Quantity<'length'>;
  mass: Quantity<'mass'>;
  moment_of_inertia: Quantity<'moment_of_inertia'>;
  center_of_mass_from_crank_pin?: Quantity<'length'> | null;
}

export interface PistonDefinition {
  id: VehicleEngineId;
  mass: Quantity<'mass'>;
  compression_height: Quantity<'length'>;
  wrist_pin_position?: Quantity<'length'> | null;
  displacement_volume: Quantity<'volume'>;
  blowby?: FlowRestriction | null;
}

export interface BankDefinition {
  id: VehicleEngineId;
  angle: Quantity<'angle'>;
  bore: Quantity<'length'>;
  deck_height: Quantity<'length'>;
  head: VehicleEngineId;
}

export interface IntakeDefinition {
  id: VehicleEngineId;
  plenum_volume: Quantity<'volume'>;
  plenum_cross_section_area: Quantity<'area'>;
  runner_length: Quantity<'length'>;
  main_restriction: FlowRestriction;
  idle_bypass_restriction: FlowRestriction;
  runner_restriction: FlowRestriction;
  idle_throttle_position_01: number;
  runner_velocity_decay_01: number;
  main_mixture_lambda: number;
}

export interface ExhaustDefinition {
  id: VehicleEngineId;
  collector_cross_section_area: Quantity<'area'>;
  collector_length?: Quantity<'length'> | null;
  collector_volume?: Quantity<'volume'> | null;
  primary_tube_length: Quantity<'length'>;
  outlet_restriction: FlowRestriction;
  primary_restriction: FlowRestriction;
  velocity_decay_01: number;
}

export type PortKind = 'intake' | 'exhaust';

export interface PortDefinition {
  id: VehicleEngineId;
  head: VehicleEngineId;
  kind: PortKind;
  runner_volume: Quantity<'volume'>;
  runner_cross_section_area: Quantity<'area'>;
  flow_curve: VehicleEngineId;
}

interface CamLobeBase {
  id: VehicleEngineId;
  cylinder: VehicleEngineId;
  port_kind: PortKind;
  centerline: Quantity<'angle'>;
}

export interface SampledCamLobeDefinition extends CamLobeBase {
  type: 'sampled';
  lift_curve: VehicleEngineId;
}

export interface HarmonicCamLobeDefinition extends CamLobeBase {
  type: 'harmonic';
  duration_at_reference_lift: Quantity<'angle'>;
  reference_lift: Quantity<'length'>;
  maximum_lift: Quantity<'length'>;
  gamma: number;
  sample_count: number;
}

export type CamLobeDefinition = SampledCamLobeDefinition | HarmonicCamLobeDefinition;

export interface CamshaftDefinition {
  id: VehicleEngineId;
  advance: Quantity<'angle'>;
  base_radius: Quantity<'length'>;
  lobes: VehicleEngineId[];
}

export interface StandardValvetrainDefinition {
  id: VehicleEngineId;
  type: 'standard';
  intake_camshaft: VehicleEngineId;
  exhaust_camshaft: VehicleEngineId;
}

export interface VtecActivation {
  minimum_engine_speed: Quantity<'angular_speed'>;
  minimum_manifold_pressure_abs: Quantity<'pressure'>;
  minimum_throttle_linkage_opening_01: number;
}

export interface VtecValvetrainDefinition {
  id: VehicleEngineId;
  type: 'vtec';
  base_intake_camshaft: VehicleEngineId;
  base_exhaust_camshaft: VehicleEngineId;
  alternate_intake_camshaft: VehicleEngineId;
  alternate_exhaust_camshaft: VehicleEngineId;
  activation: VtecActivation;
}

export type ValvetrainDefinition =
  | StandardValvetrainDefinition
  | VtecValvetrainDefinition;

export interface HeadDefinition {
  id: VehicleEngineId;
  chamber_volume: Quantity<'volume'>;
  valvetrain: VehicleEngineId;
  ports: VehicleEngineId[];
}

export interface CombustionDefinition {
  maximum_efficiency_01: number;
  cycle_variation_01: number;
  low_efficiency_attenuation_01: number;
  maximum_turbulence_effect: number;
  maximum_dilution_effect: number;
}

export interface FuelDefinition {
  id: VehicleEngineId;
  display_name: string;
  molecular_mass: Quantity<'molar_mass'>;
  density?: Quantity<'density'> | null;
  lower_heating_value: Quantity<'energy_per_mass'>;
  stoichiometric_air_fuel_molar_ratio: number;
  turbulence_to_flame_speed: VehicleEngineId;
  combustion: CombustionDefinition;
}

export interface IgnitionWireDefinition {
  id: VehicleEngineId;
}

export interface FiringEventDefinition {
  wire: VehicleEngineId;
  crank_angle: Quantity<'angle'>;
}

export interface IgnitionDefinition {
  timing_curve: VehicleEngineId;
  wires: IgnitionWireDefinition[];
  firing_order: FiringEventDefinition[];
  limiter: {
    activation_speed: Quantity<'angular_speed'>;
    cut_duration: Quantity<'duration'>;
  };
}

export interface DirectThrottleControllerDefinition {
  id: VehicleEngineId;
  type: 'direct';
  gamma: number;
}

export interface GovernorThrottleControllerDefinition {
  id: VehicleEngineId;
  type: 'governor';
  minimum_engine_speed: Quantity<'angular_speed'>;
  maximum_engine_speed: Quantity<'angular_speed'>;
  minimum_velocity: number;
  maximum_velocity: number;
  k_s: number;
  k_d: number;
  gamma: number;
}

export type ThrottleControllerDefinition =
  | DirectThrottleControllerDefinition
  | GovernorThrottleControllerDefinition;

export type StarterDefinition =
  | { type: 'mechanically_disengaged' }
  | {
      type: 'cranking';
      torque: Quantity<'torque'>;
      target_speed: Quantity<'angular_speed'>;
    };

export interface CylinderDefinition {
  id: VehicleEngineId;
  bank: VehicleEngineId;
  journal: VehicleEngineId;
  connecting_rod: VehicleEngineId;
  piston: VehicleEngineId;
  intake: VehicleEngineId;
  exhaust: VehicleEngineId;
  ignition_wire: VehicleEngineId;
  intake_port: VehicleEngineId;
  exhaust_port: VehicleEngineId;
  exhaust_header_primary_length: Quantity<'length'>;
}

export type SourceRouteDefinition =
  | { id: VehicleEngineId; type: 'exhaust'; exhaust: VehicleEngineId }
  | { id: VehicleEngineId; type: 'mechanical'; component: string };

export interface AccessoryConfigurationDefinition {
  id: VehicleEngineId;
  uri: string;
  sha256?: string | null;
}

export interface ChenFlynnLossDefinition {
  type: 'chen_flynn_cycle_mean';
  constant_fmep: Quantity<'pressure'>;
  peak_pressure_coefficient: number;
  mean_piston_speed_coefficient: Quantity<'pressure_per_speed'>;
  mean_piston_speed_squared_coefficient: Quantity<'pressure_per_speed_squared'>;
  required_oil_temperature: Quantity<'temperature'>;
  accessory_configuration_id: VehicleEngineId;
}

export interface EngineDefinition {
  identity: EngineIdentity;
  cycle: 'four_stroke';
  layout: 'inline' | 'v_engine' | 'opposed' | 'custom';
  limits: EngineLimits;
  curves: CurveDefinition[];
  crankshafts: CrankshaftDefinition[];
  output_crankshaft: VehicleEngineId;
  journals: JournalDefinition[];
  connecting_rods: ConnectingRodDefinition[];
  pistons: PistonDefinition[];
  banks: BankDefinition[];
  intakes: IntakeDefinition[];
  exhausts: ExhaustDefinition[];
  ports: PortDefinition[];
  cam_lobes: CamLobeDefinition[];
  camshafts: CamshaftDefinition[];
  valvetrains: ValvetrainDefinition[];
  heads: HeadDefinition[];
  fuels: FuelDefinition[];
  default_fuel: VehicleEngineId;
  accessory_configurations: AccessoryConfigurationDefinition[];
  losses: ChenFlynnLossDefinition;
  ignition: IgnitionDefinition;
  throttle_controllers?: ThrottleControllerDefinition[] | null;
  throttle_controller?: VehicleEngineId | null;
  starter: StarterDefinition;
  cylinders: CylinderDefinition[];
  source_routes: SourceRouteDefinition[];
}

export interface AudioAssetDefinition {
  id: VehicleEngineId;
  kind: 'impulse_response' | 'audio_sample';
  uri: string;
  sha256?: string | null;
}

export interface CylinderRoutePresentation {
  cylinder: VehicleEngineId;
  route: VehicleEngineId;
  gain_linear: number;
}

export interface RoutePresentation {
  route: VehicleEngineId;
  source_gain_linear: number;
  impulse_response?: VehicleEngineId | null;
  impulse_response_gain_linear: number;
  wet_mix_01: number;
}

export interface PresentationConditioning {
  jitter_scale: number;
  jitter_modulation_cutoff_frequency: Quantity<'frequency'>;
  derivative_mix_01: number;
  air_noise_mix_01: number;
  air_noise_cutoff_frequency: Quantity<'frequency'>;
}

export interface AudioBusDefinition {
  id: VehicleEngineId;
  routes: VehicleEngineId[];
  gain_linear: number;
  publish: boolean;
}

export interface AuditionMixDefinition {
  buses: VehicleEngineId[];
  volume_linear: number;
  fade_in: Quantity<'duration'>;
  fade_out: Quantity<'duration'>;
}

export interface PresentationDefinition {
  assets: AudioAssetDefinition[];
  cylinder_routes: CylinderRoutePresentation[];
  routes: RoutePresentation[];
  conditioning: PresentationConditioning;
  buses: AudioBusDefinition[];
  audition: AuditionMixDefinition;
  publication_gain_linear: number;
}

export interface VehicleDefinition {
  id: VehicleEngineId;
  mass: Quantity<'mass'>;
  drag_coefficient: number;
  frontal_area: Quantity<'area'>;
  differential_ratio: number;
  tire_radius: Quantity<'length'>;
  rolling_resistance_force: Quantity<'force'>;
  maximum_service_brake_force?: Quantity<'force'> | null;
}

export interface GearDefinition {
  id: VehicleEngineId;
  ratio: number;
}

export interface TransmissionDefinition {
  id: VehicleEngineId;
  maximum_clutch_torque: Quantity<'torque'>;
  gears: GearDefinition[];
}

/** Recognized upstream metadata, intentionally not exposed by Crankwave. */
export interface DynoDefaultsDefinition {
  minimum_engine_speed: Quantity<'angular_speed'>;
  maximum_engine_speed: Quantity<'angular_speed'>;
  hold_step: Quantity<'angular_speed'>;
}

export interface RigDefinition {
  id: VehicleEngineId;
  vehicle?: VehicleDefinition | null;
  transmission?: TransmissionDefinition | null;
  dyno_defaults?: DynoDefaultsDefinition | null;
}

export interface VehicleEngineDocument {
  schema: 'crankwave/engine';
  engine: EngineDefinition;
  presentation: PresentationDefinition;
  rig?: RigDefinition | null;
}
