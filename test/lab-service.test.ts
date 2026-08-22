import { describe, expect, it } from 'engine:test';
import {
  VehicleEngineDocumentService,
  createVehicleEngineDocumentIdentity,
  type VehicleEngineProjectBackend,
} from '../src/document-service';
import {
  VehicleEngineLabService,
  crankwaveSourcePathForName,
  type VehicleEngineProjectLibrary,
} from '../src/lab-service';

function source(id: string): string {
  return `{"schema":"crankwave/engine","engine":{"identity":{"id":"${id}","display_name":"${id}"}},"presentation":{}}`;
}

class Project {
  readonly files = new Map<string, { data: string; version: string }>();
  private revision = 1;

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
      return version;
    },
  };

  readonly library: VehicleEngineProjectLibrary = {
    list: async () => [...this.files.keys()].sort(),
    createExclusive: async (path, data) => {
      if (this.files.has(path)) {
        throw new Error(`EEXIST: ${path}`);
      }
      this.files.set(path, { data, version: `v${++this.revision}` });
    },
  };

  createLab(): VehicleEngineLabService {
    return new VehicleEngineLabService('project-a', this.library, (projectId, path) =>
      new VehicleEngineDocumentService(
        createVehicleEngineDocumentIdentity(projectId, path),
        this.backend
      )
    );
  }
}

describe('Crankwave project service', () => {
  it('uses one lab snapshot while switching clean project engines inside it', async () => {
    const project = new Project();
    const first = crankwaveSourcePathForName('first');
    const second = crankwaveSourcePathForName('second');
    project.files.set(first, { data: source('first'), version: 'v1' });
    project.files.set(second, { data: source('second'), version: 'v2' });
    const lab = project.createLab();

    await lab.requestOpen(first);
    expect(lab.getSnapshot().activePath).toBe(first);
    expect(lab.getSnapshot().document?.summary?.id).toBe('first');
    await lab.requestOpen(second);
    expect(lab.getSnapshot().activePath).toBe(second);
    expect(lab.getSnapshot().document?.summary?.id).toBe('second');
    expect(lab.getSnapshot().projectPaths).toEqual([first, second]);
    lab.dispose();
  });

  it('keeps a dirty engine active until the user confirms an internal open', async () => {
    const project = new Project();
    const first = crankwaveSourcePathForName('first');
    const second = crankwaveSourcePathForName('second');
    project.files.set(first, { data: source('first'), version: 'v1' });
    project.files.set(second, { data: source('second'), version: 'v2' });
    const lab = project.createLab();

    await lab.requestOpen(first);
    lab.updateSource(source('dirty'));
    const result = await lab.requestOpen(second);
    expect(result).toBe('confirmation-required');
    expect(lab.getSnapshot().activePath).toBe(first);
    expect(lab.getSnapshot().pendingOpenPath).toBe(second);
    await lab.discardAndOpenPending();
    expect(lab.getSnapshot().activePath).toBe(second);
    expect(lab.getSnapshot().document?.summary?.id).toBe('second');
    lab.dispose();
  });

  it('creates a complete preset source as a project engine and opens it in place', async () => {
    const project = new Project();
    const lab = project.createLab();
    const path = await lab.createFromSource('new-v8', source('new-v8'));

    expect(path).toBe('crankwave-engines/new-v8.crankwave.json');
    expect(project.files.get(path)?.data).toBe(source('new-v8'));
    expect(lab.getSnapshot().activePath).toBe(path);
    expect(lab.getSnapshot().document?.summary?.id).toBe('new-v8');
    lab.dispose();
  });

  it('rejects ambiguous or traversing file names', () => {
    expect(() => crankwaveSourcePathForName('../engine')).toThrow();
    expect(() => crankwaveSourcePathForName('engine/name')).toThrow();
  });
});
