import createEngineSimModule from '../vendor/engine-sim-wasm/engine-sim-offline';
import { SessionExecutionKind } from '../vendor/engine-sim-wasm/live-runtime/c-api-abi';
import { EngineSimCapiClient } from '../vendor/engine-sim-wasm/live-runtime/c-api-client';
import { DeviceRateResampler } from '../vendor/engine-sim-wasm/runtime/device-resampler';
import type {
  LiveEngineControls,
  LiveInitializeMessage,
  LiveWorkerInboundMessage,
  LiveWorkerOutboundMessage,
} from './live-protocol';

const LIVE_MIX_GAIN = 0.5011872336272722; // -6 dBFS mix headroom.

let client: EngineSimCapiClient | null = null;
let program: ReturnType<EngineSimCapiClient['compile']> | null = null;
let resampler: DeviceRateResampler | null = null;
let rendering = false;
let preparationBlocks = 0;
let lastTorqueNm: number | null = null;
let lastPowerKw: number | null = null;

let desiredControls: LiveEngineControls = {
  throttle: 0.1,
  selectedGearOrdinal: 0,
  clutchEngagement: 0,
  serviceBrake: 0,
  ignition: true,
  fuel: true,
  limiter: true,
};
let appliedControls: LiveEngineControls = { ...desiredControls };

function post(message: LiveWorkerOutboundMessage, transfer: Transferable[] = []): void {
  const scope = globalThis as unknown as {
    postMessage(value: LiveWorkerOutboundMessage, transferables?: Transferable[]): void;
  };
  scope.postMessage(message, transfer);
}

function errorText(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const diagnosticError = error as Error & {
    readonly diagnostics?: readonly {
      readonly jsonPointer?: string;
      readonly message?: string;
    }[];
  };
  const diagnostic = diagnosticError.diagnostics?.find((entry) => entry.message);
  if (!diagnostic?.message) {
    return `${error.name}: ${error.message}`;
  }
  const subject = diagnostic.jsonPointer ? `${diagnostic.jsonPointer}: ` : '';
  return `${error.name}: ${error.message} · ${subject}${diagnostic.message}`;
}

function applyPendingControls(): void {
  if (program === null) {
    return;
  }
  const controls: Array<{ deliveryFrame: bigint; kind: string; value: number | boolean }> = [];
  const session = program.session;
  const deliveryFrame =
    session.nextDeliveryFrame > session.firstAudibleDeliveryFrame
      ? session.nextDeliveryFrame
      : session.firstAudibleDeliveryFrame;

  if (desiredControls.throttle !== appliedControls.throttle) {
    controls.push({ deliveryFrame, kind: 'throttle', value: desiredControls.throttle });
  }
  if (desiredControls.selectedGearOrdinal !== appliedControls.selectedGearOrdinal) {
    controls.push({ deliveryFrame, kind: 'vehicle-selected-forward-gear', value: desiredControls.selectedGearOrdinal });
  }
  if (desiredControls.clutchEngagement !== appliedControls.clutchEngagement) {
    controls.push({ deliveryFrame, kind: 'vehicle-clutch-engagement', value: desiredControls.clutchEngagement });
  }
  if (desiredControls.serviceBrake !== appliedControls.serviceBrake) {
    controls.push({ deliveryFrame, kind: 'vehicle-service-brake-application', value: desiredControls.serviceBrake });
  }
  if (desiredControls.ignition !== appliedControls.ignition) {
    controls.push({ deliveryFrame, kind: 'ignition', value: desiredControls.ignition });
  }
  if (desiredControls.fuel !== appliedControls.fuel) {
    controls.push({ deliveryFrame, kind: 'fuel', value: desiredControls.fuel });
  }
  if (desiredControls.limiter !== appliedControls.limiter) {
    controls.push({ deliveryFrame, kind: 'limiter', value: desiredControls.limiter });
  }
  if (controls.length > 0) {
    program.session.enqueueControls(controls);
    appliedControls = { ...desiredControls };
  }
}

async function initialize(message: LiveInitializeMessage): Promise<void> {
  if (program !== null) {
    throw new Error('Engine simulation worker is already initialized');
  }
  const wasmBytes = new Uint8Array(message.wasmBinary);
  if (wasmBytes.byteLength === 0) {
    throw new Error('Transferred Engine Sim WASM module is empty');
  }
  // The editor worker is intentionally not a browser: it has WebAssembly but no
  // URL/fetch globals. Supplying locateFile keeps Emscripten from resolving its
  // unused sidecar path through URL while wasmBinary remains the sole authority.
  const module = await createEngineSimModule({
    wasmBinary: wasmBytes,
    noInitialRun: true,
    locateFile: (path) => path,
  });
  client = new EngineSimCapiClient(module);
  program = client.compile(
    message.engineJson,
    message.scenarioJson,
    message.assets.map((asset) => ({
      kind: asset.kind,
      id: asset.id,
      bytes: new Uint8Array(asset.bytes),
    })),
    SessionExecutionKind.openEnded
  );
  resampler = new DeviceRateResampler({
    inputSampleRate: program.session.auditionBus.sampleRateHz,
    outputSampleRate: message.outputSampleRate,
    channelCount: program.session.auditionBus.channelCount,
  });

  const descriptor = program.session.descriptor;
  post({
    type: 'ready',
    engineId: program.engineId,
    scenarioId: program.scenarioId,
    physicsRateHz: descriptor.physicsRateHz,
    deliveryRateHz: descriptor.deliveryRateHz,
    preparationBlockCount: descriptor.preparationBlockCount,
    outputSampleRate: message.outputSampleRate,
    forwardGears: program.session.forwardGears.map((gear) => ({ ordinal: gear.authoredOrdinal, id: gear.semanticId, ratio: gear.ratio })),
  });
}

function available(value: { readonly availability: number; readonly value: number }): number | null {
  return value.availability !== 0 && Number.isFinite(value.value) ? value.value : null;
}

function renderNext(requestedBlockCount: number): void {
  if (program === null || resampler === null) {
    throw new Error('Render requested before initialization');
  }
  if (rendering) {
    throw new Error('Overlapping render requests are not allowed');
  }
  if (!Number.isSafeInteger(requestedBlockCount) || requestedBlockCount < 1 || requestedBlockCount > 16) {
    throw new RangeError('Render blockCount must be an integer in [1, 16]');
  }
  rendering = true;
  const started = performance.now();
  try {
    applyPendingControls();
    const pcmParts: Float32Array[] = [];
    let pcmLength = 0;
    let processedDeliveryFrames = 0;
    let latestRpm = 0;
    let latestLimiterCut = false;
    let latestVehicleSpeedKmh = 0;
    let latestGearOrdinal = desiredControls.selectedGearOrdinal;
    let latestClutchEngagement = desiredControls.clutchEngagement;

    for (let index = 0; index < requestedBlockCount; ++index) {
      const block = program.session.processBlock();
      processedDeliveryFrames += block.process.deliveryFrameCount;
      if (!block.audible) {
        ++preparationBlocks;
        continue;
      }

      const pcm = resampler.push(block.samples);
      for (let sample = 0; sample < pcm.length; ++sample) {
        pcm[sample] = (pcm[sample] ?? 0) * LIVE_MIX_GAIN;
      }
      if (pcm.length > 0) {
        pcmParts.push(pcm);
        pcmLength += pcm.length;
      }

      const telemetry = block.telemetry.at(-1) ?? null;
      const cycle = block.completedCycles.at(-1) ?? null;
      const cycleTorque = cycle?.instantaneousNetShaft;
      const torqueNm =
        cycleTorque && cycleTorque.availability !== 0 && Number.isFinite(cycleTorque.cycleMeanTorqueNm)
          ? cycleTorque.cycleMeanTorqueNm
          : telemetry
            ? available({
                availability: telemetry.torque.cycleMeanNetShaft.availability,
                value: telemetry.torque.cycleMeanNetShaft.valueNm,
              })
            : null;
      const powerW = telemetry ? available(telemetry.torque.cycleMeanPowerW) : null;
      if (torqueNm !== null) {
        lastTorqueNm = torqueNm;
      }
      if (powerW !== null) {
        lastPowerKw = powerW / 1000;
      }
      latestRpm = telemetry?.engineSpeedRpm ?? cycle?.meanEngineSpeedRpm ?? latestRpm;
      latestLimiterCut = telemetry?.limiterCutActive ?? latestLimiterCut;
      if (telemetry?.freeVehicle) {
        latestVehicleSpeedKmh = telemetry.freeVehicle.vehicleSpeedMS * 3.6;
        latestGearOrdinal = telemetry.freeVehicle.selectedForwardGearOrdinal ?? 0;
        latestClutchEngagement = telemetry.freeVehicle.clutchEngagement01;
      }
    }
    const renderMs = performance.now() - started;

    if (pcmLength === 0) {
      post({
        type: 'preparing',
        completedBlocks: preparationBlocks,
        totalBlocks: program.session.descriptor.preparationBlockCount,
        renderMs,
      });
      return;
    }

    const samples = new Float32Array(pcmLength);
    let offset = 0;
    for (const part of pcmParts) {
      samples.set(part, offset);
      offset += part.length;
    }
    const simulatedSeconds =
      processedDeliveryFrames / program.session.descriptor.deliveryRateHz;
    post(
      {
        type: 'pcm',
        samples,
        rpm: latestRpm,
        torqueNm: lastTorqueNm,
        powerKw: lastPowerKw,
        vehicleSpeedKmh: latestVehicleSpeedKmh,
        selectedGearOrdinal: latestGearOrdinal,
        clutchEngagement: latestClutchEngagement,
        limiterCut: latestLimiterCut,
        renderMs,
        processedBlocks: requestedBlockCount,
        realtimeFactor: renderMs > 0 ? simulatedSeconds / (renderMs / 1000) : 0,
      },
      [samples.buffer as ArrayBuffer]
    );
  } finally {
    rendering = false;
  }
}

function dispose(): void {
  program?.dispose();
  client?.dispose();
  program = null;
  client = null;
  resampler = null;
  close();
}

addEventListener('message', (event: MessageEvent<LiveWorkerInboundMessage>) => {
  try {
    const message = event.data;
    switch (message.type) {
      case 'initialize':
        void initialize(message).catch((error: unknown) =>
          post({ type: 'error', error: errorText(error) })
        );
        break;
      case 'render':
        renderNext(message.blockCount);
        break;
      case 'controls':
        desiredControls = {
          throttle: Math.min(1, Math.max(0, message.throttle)),
          selectedGearOrdinal: Math.max(0, Math.round(message.selectedGearOrdinal)),
          clutchEngagement: Math.min(1, Math.max(0, message.clutchEngagement)),
          serviceBrake: Math.min(1, Math.max(0, message.serviceBrake)),
          ignition: message.ignition,
          fuel: message.fuel,
          limiter: message.limiter,
        };
        break;
      case 'dispose':
        dispose();
        break;
    }
  } catch (error) {
    post({ type: 'error', error: errorText(error) });
  }
});
