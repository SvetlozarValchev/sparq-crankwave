export interface CrankwaveAudioPoint {
  readonly rpm: number;
  readonly throttle01: number;
  readonly load01: number;
}

export type CrankwaveAudioWorkerInbound =
  | {
      readonly type: 'initialize';
      readonly carrier: ArrayBuffer;
      readonly outputSampleRate: number;
      readonly sessionSeed: string;
      readonly initialPoint: CrankwaveAudioPoint;
      readonly targetLeadSeconds: number;
      readonly outputGainLinear: number;
    }
  | { readonly type: 'attach'; readonly streamId: number }
  | { readonly type: 'point'; readonly point: CrankwaveAudioPoint }
  | { readonly type: 'dispose' };

export type CrankwaveAudioWorkerOutbound =
  | {
      readonly type: 'ready';
      readonly engineId: string;
      readonly minimumRpm: number;
      readonly maximumRpm: number;
      readonly outputSampleRate: number;
    }
  | {
      readonly type: 'playing';
    }
  | {
      readonly type: 'telemetry';
      readonly realtimeFactor: number;
      readonly queuedAudioMs: number;
      readonly underrunCount: number;
      readonly underrunAudioMs: number;
    }
  | { readonly type: 'error'; readonly error: string };
