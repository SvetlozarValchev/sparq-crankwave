import { describe, expect, it } from 'engine:test';
import {
  VehicleEngineDocumentService,
  createVehicleEngineDocumentIdentity,
  type VehicleEngineFileChange,
  type VehicleEngineProjectBackend,
} from '../src/document-service';

function source(id: string, extra = ''): string {
  return `{"schema":"engine-sim-offline/engine","engine":{"identity":{"id":"${id}","display_name":"${id}"}${extra}}}`;
}

class Project {
  readonly files = new Map<string, { data: string; version: string }>();
  readonly writes: string[] = [];
  private revision = 1;
  private readonly listeners = new Set<(event: VehicleEngineFileChange) => void>();

  readonly backend: VehicleEngineProjectBackend = {
    read: async (path) => {
      const file = this.files.get(path);
      if (!file) {
        throw new Error(`ENOENT: ${path}`);
      }
      return file;
    },
    writeVersioned: async (path, data, expectedVersion) => {
      const file = this.files.get(path);
      if (!file || file.version !== expectedVersion) {
        throw new Error(`version conflict: ${path}`);
      }
      const version = `v${++this.revision}`;
      this.files.set(path, { data, version });
      this.writes.push(data);
      return version;
    },
    watch: (listener) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    },
    notifyFileChanged: async () => undefined,
  };

  emit(path: string, type: VehicleEngineFileChange['type']): void {
    for (const listener of this.listeners) {
      listener({ path, type });
    }
  }
}

async function settleExternalRead(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('Vehicle Engine Lab document service', () => {
  it('keeps the React external-store snapshot stable between actual updates', async () => {
    const project = new Project();
    const path = 'vehicle-engines/fixture.vehicle-engine.json';
    project.files.set(path, { data: source('fixture'), version: 'v1' });
    const service = new VehicleEngineDocumentService(
      createVehicleEngineDocumentIdentity('project-a', path),
      project.backend
    );

    const loading = service.getSnapshot();
    expect(service.getSnapshot()).toBe(loading);
    await service.open();
    const ready = service.getSnapshot();
    expect(ready === loading).toBe(false);
    expect(service.getSnapshot()).toBe(ready);
    service.dispose();
  });

  it('preserves exact source text and every unknown field through persistence', async () => {
    const project = new Project();
    const path = 'vehicle-engines/fixture.vehicle-engine.json';
    const original = `${source('fixture-v8', ',"future":{"precision":1.2345678901234567}')}\n`;
    project.files.set(path, { data: original, version: 'v1' });
    const service = new VehicleEngineDocumentService(
      createVehicleEngineDocumentIdentity('project-a', path),
      project.backend
    );

    await service.open();
    expect(service.getSnapshot().workingCopy?.content).toBe(original);
    service.updateSource(original.replace('fixture-v8', 'fixture-v8-edited'));
    const edited = service.getSnapshot().workingCopy!.content;
    const result = await service.save();

    expect(result.status).toBe('saved');
    expect(project.writes).toEqual([edited]);
    expect(project.writes[0]?.includes('future')).toBe(true);
    service.dispose();
  });

  it('keeps invalid edits in memory but blocks their persistence', async () => {
    const project = new Project();
    const path = 'vehicle-engines/fixture.vehicle-engine.json';
    project.files.set(path, { data: source('fixture'), version: 'v1' });
    const service = new VehicleEngineDocumentService(
      createVehicleEngineDocumentIdentity('project-a', path),
      project.backend
    );

    await service.open();
    service.updateSource('{');
    const result = await service.save();

    expect(result.status).toBe('failed');
    expect(service.getSnapshot().workingCopy?.content).toBe('{');
    expect(service.getSnapshot().diagnostic?.severity).toBe('error');
    expect(project.writes).toEqual([]);
    service.dispose();
  });

  it('adopts clean external changes and preserves dirty conflicts', async () => {
    const project = new Project();
    const path = 'vehicle-engines/fixture.vehicle-engine.json';
    project.files.set(path, { data: source('original'), version: 'v1' });
    const service = new VehicleEngineDocumentService(
      createVehicleEngineDocumentIdentity('project-a', path),
      project.backend
    );
    await service.open();

    project.files.set(path, { data: source('external'), version: 'v2' });
    project.emit(path, 'modified');
    await settleExternalRead();
    expect(service.getSnapshot().summary?.id).toBe('external');

    service.updateSource(source('local'));
    project.files.set(path, { data: source('external-again'), version: 'v3' });
    project.emit(path, 'modified');
    await settleExternalRead();
    expect(service.getSnapshot().workingCopy?.status).toBe('conflict');
    expect(service.getSnapshot().summary?.id).toBe('local');
    service.dispose();
  });
});
