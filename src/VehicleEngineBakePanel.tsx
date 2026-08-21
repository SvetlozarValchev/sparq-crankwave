import { useCallback, useSyncExternalStore } from '@sparq/react';
import { Button, notify } from '@sparq/ui-kit';
import type { VehicleEngineBakeController } from './bake-controller';
import styles from './VehicleEngineLabDocument.module.css';

export interface VehicleEngineBakePanelProps {
  readonly controller: VehicleEngineBakeController;
  readonly source: string;
  readonly sourceValid: boolean;
}

function mebibytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function duration(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

export function VehicleEngineBakePanel({
  controller,
  source,
  sourceValid,
}: VehicleEngineBakePanelProps) {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );
  const active =
    snapshot.phase === 'loading' ||
    snapshot.phase === 'baking' ||
    snapshot.phase === 'verifying';
  const current = controller.isCurrentSource(source);
  const ready = snapshot.phase === 'ready' || snapshot.phase === 'saving';
  const metadata = snapshot.metadata;

  const bake = useCallback(() => {
    void controller.bake(source);
  }, [controller, source]);

  const save = useCallback(() => {
    void controller
      .save()
      .then((path) => notify.success(`Saved ${path}`))
      .catch((error: unknown) =>
        notify.danger(error instanceof Error ? error.message : String(error))
      );
  }, [controller]);

  return (
    <div className={styles.bakePane}>
      <section className={styles.bakeHero} data-phase={snapshot.phase}>
        <div>
          <span className={styles.eyebrow}>Full-fidelity Engine Sim WASM baker</span>
          <h3>{ready && current ? 'Runtime carrier ready' : 'Bake the working source'}</h3>
          <p>{snapshot.status}</p>
          {ready && !current && (
            <p className={styles.bakeWarning}>
              The working JSON changed after this carrier was baked. Re-bake before saving it.
            </p>
          )}
          {snapshot.error && <p className={styles.liveError}>{snapshot.error}</p>}
        </div>
        <div className={styles.liveActions}>
          <Button size="sm" fill="primary" disabled={!sourceValid || active} onClick={bake}>
            {ready ? 'Bake current source again' : 'Bake current source'}
          </Button>
          <Button size="sm" fill="outline" disabled={!active} onClick={() => controller.cancel()}>
            Cancel
          </Button>
          <Button
            size="sm"
            fill="outline"
            loading={snapshot.phase === 'saving'}
            disabled={!ready || !current || snapshot.phase === 'saving'}
            onClick={save}
          >
            Save .vehicleengine
          </Button>
        </div>
      </section>

      <div className={styles.bakeGrid}>
        <section className={styles.outputCard}>
          <h3>Carrier</h3>
          <dl className={styles.liveMetrics}>
            <div>
              <dt>Engine</dt>
              <dd>{metadata?.engineId ?? '—'}</dd>
            </div>
            <div>
              <dt>Bake profile</dt>
              <dd>{metadata?.profileId ?? '—'}</dd>
            </div>
            <div>
              <dt>In-memory size</dt>
              <dd>{metadata ? mebibytes(metadata.byteCount) : '—'}</dd>
            </div>
            <div>
              <dt>Elapsed</dt>
              <dd>{metadata ? duration(metadata.elapsedMs) : '—'}</dd>
            </div>
            <div>
              <dt>Project path</dt>
              <dd title={snapshot.runtimePath ?? undefined}>{snapshot.runtimePath ?? '—'}</dd>
            </div>
          </dl>
        </section>

        <section className={styles.outputCard}>
          <h3>Full capture set</h3>
          <dl className={styles.liveMetrics}>
            <div>
              <dt>Held cells</dt>
              <dd>{metadata?.heldCellCount ?? '—'}</dd>
            </div>
            <div>
              <dt>Directional captures</dt>
              <dd>{metadata?.directionalCaptureCount ?? '—'}</dd>
            </div>
            <div>
              <dt>Lifecycle captures</dt>
              <dd>{metadata?.lifecycleCaptureCount ?? '—'}</dd>
            </div>
            <div>
              <dt>Package entries</dt>
              <dd>{metadata?.entryCount ?? '—'}</dd>
            </div>
            <div>
              <dt>Runtime-verified entries</dt>
              <dd>{metadata?.verifiedEntryCount ?? '—'}</dd>
            </div>
          </dl>
        </section>

        <section className={styles.outputCard}>
          <h3>Identity</h3>
          <dl className={styles.bakeIdentity}>
            <div>
              <dt>Carrier SHA-256</dt>
              <dd>{metadata?.containerSha256 ?? '—'}</dd>
            </div>
            <div>
              <dt>Cache identity</dt>
              <dd>{metadata?.cacheIdentitySha256 ?? '—'}</dd>
            </div>
            <div>
              <dt>Storage</dt>
              <dd>{snapshot.savedPath ? `Saved · ${snapshot.savedPath}` : 'Editor memory'}</dd>
            </div>
          </dl>
        </section>
      </div>

      <p className={styles.bakeHint}>
        This is the complete responsive bake, including held operation, acceleration and
        deceleration, start, stop, stall, and shared starter data. It can take several minutes.
        Nothing is written to the project until you explicitly save the verified carrier.
      </p>
    </div>
  );
}
