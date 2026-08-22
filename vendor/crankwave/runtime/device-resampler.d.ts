export interface DeviceRateResamplerOptions {
  readonly inputSampleRate: number;
  readonly outputSampleRate: number;
  readonly channelCount: number;
}

export class DeviceRateResampler {
  constructor(options: DeviceRateResamplerOptions);
  push(interleaved: Float32Array): Float32Array;
  finish(): Float32Array;
}
