import { useCallback, useEffect, useState, useSyncExternalStore } from '@sparq/react';
import { Button, Checkbox, SliderRow } from '@sparq/ui-kit';
import { LiveEngineBenchController } from './live-controller';
import styles from './VehicleEngineLabDocument.module.css';

export interface VehicleEngineLiveBenchProps {
  readonly source: string;
  readonly sourceValid: boolean;
}

function number(value: number | null, digits = 1): string {
  return value === null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
}

export function VehicleEngineLiveBench({ source, sourceValid }: VehicleEngineLiveBenchProps) {
  const [controller] = useState(() => new LiveEngineBenchController());
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );
  const active = snapshot.phase !== 'idle' && snapshot.phase !== 'failed';

  useEffect(() => () => controller.dispose(), [controller]);

  const start = useCallback(() => {
    void controller.start(source);
  }, [controller, source]);

  return (
    <div className={styles.livePane}>
      <section className={styles.liveHero}>
        <div>
          <span className={styles.eyebrow}>Engine Sim WASM · Editor bench</span>
          <div className={styles.rpmReadout}>
            {Math.round(snapshot.rpm).toLocaleString()}
            <small>rpm</small>
          </div>
          <p data-phase={snapshot.phase}>{snapshot.status}</p>
          {snapshot.error && <p className={styles.liveError}>{snapshot.error}</p>}
        </div>
        <div className={styles.liveActions}>
          <Button size="sm" fill="primary" disabled={!sourceValid} onClick={start}>
            {active ? 'Restart current source' : 'Start live bench'}
          </Button>
          <Button size="sm" fill="outline" disabled={!active} onClick={() => controller.stop()}>
            Stop
          </Button>
        </div>
      </section>

      <div className={styles.liveGrid}>
        <section className={styles.liveControls}>
          <h3>Controls</h3>
          <SliderRow
            label="Throttle"
            value={snapshot.controls.throttle}
            min={0}
            max={1}
            step={0.01}
            display={`${Math.round(snapshot.controls.throttle * 100)}%`}
            disabled={!active}
            onChange={(throttle) => controller.updateControls({ throttle })}
            ariaLabel="Live engine throttle"
            fillColor="var(--warning)"
          />
          <div className={styles.liveToggles}>
            <Checkbox
              label="Ignition"
              checked={snapshot.controls.ignition}
              disabled={!active}
              onChange={(ignition) => controller.updateControls({ ignition })}
            />
            <Checkbox
              label="Fuel"
              checked={snapshot.controls.fuel}
              disabled={!active}
              onChange={(fuel) => controller.updateControls({ fuel })}
            />
            <Checkbox
              label="Limiter"
              checked={snapshot.controls.limiter}
              disabled={!active}
              onChange={(limiter) => controller.updateControls({ limiter })}
            />
          </div>
          <p className={styles.liveHint}>
            The bench compiles the complete working JSON. Unsaved edits are allowed; switching tabs
            stops audio and releases the realtime worker.
          </p>
        </section>

        <section className={styles.outputCard}>
          <h3>Mechanical output</h3>
          <dl className={styles.liveMetrics}>
            <div>
              <dt>Cycle-mean torque</dt>
              <dd>{number(snapshot.torqueNm)} N·m</dd>
            </div>
            <div>
              <dt>Cycle-mean power</dt>
              <dd>{number(snapshot.powerKw)} kW</dd>
            </div>
            <div>
              <dt>Power</dt>
              <dd>
                {snapshot.powerKw === null ? '—' : number(snapshot.powerKw * 1.34102209)} hp
              </dd>
            </div>
            <div>
              <dt>Limiter cut</dt>
              <dd data-warning={snapshot.limiterCut ? 'true' : undefined}>
                {snapshot.limiterCut ? 'ACTIVE' : 'off'}
              </dd>
            </div>
          </dl>
        </section>

        <section className={styles.outputCard}>
          <h3>Realtime budget</h3>
          <dl className={styles.liveMetrics}>
            <div>
              <dt>Physics</dt>
              <dd>{snapshot.physicsRateHz.toLocaleString()} Hz</dd>
            </div>
            <div>
              <dt>WASM source</dt>
              <dd>{snapshot.sourceRateHz.toLocaleString()} Hz</dd>
            </div>
            <div>
              <dt>Audio device</dt>
              <dd>{snapshot.deviceRateHz?.toLocaleString() ?? '—'} Hz</dd>
            </div>
            <div>
              <dt>Mixer headroom</dt>
              <dd>{snapshot.mixerTrimDb} dB</dd>
            </div>
            <div>
              <dt>WASM block</dt>
              <dd>{number(snapshot.renderMs, 2)} ms / 20 ms</dd>
            </div>
            <div>
              <dt>Realtime headroom</dt>
              <dd>{number(snapshot.realtimeFactor)}×</dd>
            </div>
            <div>
              <dt>Native lead</dt>
              <dd>{number(snapshot.nativeLeadMs, 0)} ms</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
