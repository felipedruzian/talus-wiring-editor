// Server tests for the tracer-bullet local persistence service (issue #1).
//
// Uses the project's existing vitest devDependency directly — this file is
// NOT wired into `ng test` (Angular's unit-test builder only discovers
// specs under src/), so run it through the dedicated package script:
//
//   npm run test:server
//
// Never starts the module's own listener (config.host/config.port): each
// test builds its own server via createWiringEditorServer(cfg) and calls
// server.listen(0, '127.0.0.1') itself for an ephemeral loopback port, torn
// down in afterEach. A fresh temp directory backs storageDir per test file
// run so tests never touch the real ~/.local/share/talus-wiring-editor path.

import { request as httpRequest } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createWiringEditorServer } from './wiring-editor-server.mjs';

const HOST = '127.0.0.1';

/**
 * Sends a raw HTTP request via node:http instead of fetch(). Needed for the
 * Host/Origin/Sec-Fetch-Site tests: those are all on the Fetch spec's
 * "forbidden header name" list (Host, Origin, and any `Sec-*` header), so
 * fetch() silently drops them and can't actually exercise this server's
 * header checks — node:http has no such restriction.
 */
function rawRequest(baseUrl, path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolvePromise, reject) => {
    const target = new URL(path, baseUrl);
    const req = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname + target.search,
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolvePromise({ status: res.statusCode }));
      },
    );
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function baseConfig(storageDir, staticDir) {
  return {
    host: HOST,
    port: 0,
    staticDir,
    storageDir,
    allowedHosts: new Set([`${HOST}:PORT_PLACEHOLDER`]),
  };
}

/** Starts a fresh server on an ephemeral port and returns its base URL + close(). */
async function startServer(cfg) {
  const server = createWiringEditorServer(cfg);
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, HOST, () => resolvePromise(undefined));
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  // allowedHosts is keyed by host:port, and the port is only known after listen() resolves.
  cfg.allowedHosts = new Set([`${HOST}:${port}`]);
  const baseUrl = `http://${HOST}:${port}`;
  return {
    baseUrl,
    port,
    close: () => new Promise((resolveClose) => server.close(() => resolveClose(undefined))),
  };
}

function validProjectPayload() {
  return {
    formatVersion: 2,
    electrical: {
      components: [
        {
          id: 'source',
          deviceId: 'SOURCE',
          manufacturer: '',
          model: '',
          pins: [{ id: 'out', label: 'OUT', direction: 'output' }],
        },
        {
          id: 'load-a',
          deviceId: 'LOAD-A',
          manufacturer: '',
          model: '',
          pins: [{ id: 'in', label: 'IN', direction: 'input' }],
        },
        {
          id: 'load-b',
          deviceId: 'LOAD-B',
          manufacturer: '',
          model: '',
          pins: [{ id: 'in', label: 'IN', direction: 'input' }],
        },
      ],
      junctions: [{ id: 'rail', label: '5 V rail', kind: 'rail' }],
      cables: [
        {
          name: 'HARNESS',
          wireCount: 3,
          colors: ['RD', 'YE', 'BU'],
          wireLabels: ['feed', 'sensor', 'motor'],
          gauge: '0.50 mm2',
        },
        {
          name: 'SPARE',
          wireCount: 2,
          colors: ['#a1b2c3', 'GY'],
          wireLabels: ['unused-a', 'unused-b'],
          notes: 'Disconnected spare cable',
        },
      ],
      nets: [
        {
          id: 'net-5v',
          name: '5V',
          endpoints: [
            { kind: 'pin', componentId: 'source', pinId: 'out' },
            { kind: 'junction', junctionId: 'rail' },
            { kind: 'pin', componentId: 'load-a', pinId: 'in' },
            { kind: 'pin', componentId: 'load-b', pinId: 'in' },
          ],
          conductors: [
            {
              id: 'feed',
              from: { kind: 'pin', componentId: 'source', pinId: 'out' },
              to: { kind: 'junction', junctionId: 'rail' },
              cable: { name: 'HARNESS', wireIndex: 1 },
            },
            {
              id: 'branch-a',
              from: { kind: 'junction', junctionId: 'rail' },
              to: { kind: 'pin', componentId: 'load-a', pinId: 'in' },
              cable: { name: 'HARNESS', wireIndex: 2 },
            },
            {
              id: 'branch-b',
              from: { kind: 'junction', junctionId: 'rail' },
              to: { kind: 'pin', componentId: 'load-b', pinId: 'in' },
              cable: { name: 'HARNESS', wireIndex: 3 },
            },
          ],
        },
      ],
    },
    layout: {
      boards: [],
      components: [
        { componentId: 'source', position: { x: 0, y: 0 } },
        { componentId: 'load-a', position: { x: 200, y: 0 } },
        { componentId: 'load-b', position: { x: 200, y: 100 } },
      ],
      junctions: [{ junctionId: 'rail', position: { x: 100, y: 50 }, taps: 3 }],
      conductors: [
        { conductorId: 'feed', toTap: 0 },
        { conductorId: 'branch-a', fromTap: 1 },
        { conductorId: 'branch-b', fromTap: 2 },
      ],
    },
  };
}

function legacyProjectPayload() {
  return { formatVersion: 1, boards: [], components: [], nets: [] };
}

function legacyConnectedProjectPayload() {
  return {
    formatVersion: 1,
    boards: [],
    components: [
      {
        id: 'source',
        deviceId: 'SOURCE',
        manufacturer: '',
        model: '',
        position: { x: 0, y: 0 },
        pins: [{ id: 'out', label: 'OUT', direction: 'output' }],
      },
      {
        id: 'load',
        deviceId: 'LOAD',
        manufacturer: '',
        model: '',
        position: { x: 100, y: 0 },
        pins: [{ id: 'in', label: 'IN', direction: 'input' }],
      },
    ],
    nets: [
      {
        id: 'wire-a',
        wireId: 'W1',
        colorCode: 'RD',
        source: { componentId: 'source', pinId: 'out' },
        target: { componentId: 'load', pinId: 'in' },
      },
    ],
  };
}

describe('wiring-editor-server', () => {
  let storageDir;
  let staticDir;
  let cfg;
  let server;

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), 'wiring-editor-storage-'));
    staticDir = await mkdtemp(join(tmpdir(), 'wiring-editor-static-'));
    cfg = baseConfig(storageDir, staticDir);
    server = await startServer(cfg);
  });

  afterEach(async () => {
    await server.close();
    await rm(storageDir, { recursive: true, force: true });
    await rm(staticDir, { recursive: true, force: true });
  });

  describe('PUT/GET/list round trip', () => {
    it('creates a project on PUT, then reads it back with GET, then lists it', async () => {
      const project = validProjectPayload();

      const putRes = await fetch(`${server.baseUrl}/api/projects/my-project`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      });
      expect(putRes.status).toBe(200);
      expect(await putRes.json()).toEqual({ id: 'my-project', saved: true });

      const getRes = await fetch(`${server.baseUrl}/api/projects/my-project`);
      expect(getRes.status).toBe(200);
      expect(await getRes.json()).toEqual(project);

      const listRes = await fetch(`${server.baseUrl}/api/projects`);
      expect(listRes.status).toBe(200);
      const { projects } = await listRes.json();
      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe('my-project');

      // Written atomically via a scratch file that gets renamed away.
      const onDisk = await readFile(join(storageDir, 'my-project.json'), 'utf8');
      expect(JSON.parse(onDisk)).toEqual(project);
    });

    it('serves the same current project version to two independent clients', async () => {
      const project = validProjectPayload();
      await fetch(`${server.baseUrl}/api/projects/shared`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      });

      const [clientA, clientB] = await Promise.all([
        fetch(`${server.baseUrl}/api/projects/shared`),
        fetch(`${server.baseUrl}/api/projects/shared`),
      ]);
      expect(await clientA.json()).toEqual(project);
      expect(await clientB.json()).toEqual(project);
    });

    it('continues accepting legacy v1 snapshots for older clients', async () => {
      const res = await fetch(`${server.baseUrl}/api/projects/legacy`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(legacyProjectPayload()),
      });
      expect(res.status).toBe(200);
    });

    it('returns 404 for GET of a project id that was never saved', async () => {
      const res = await fetch(`${server.baseUrl}/api/projects/does-not-exist`);
      expect(res.status).toBe(404);
    });

    it('deletes a project and then 404s on it', async () => {
      await fetch(`${server.baseUrl}/api/projects/to-delete`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validProjectPayload()),
      });

      const delRes = await fetch(`${server.baseUrl}/api/projects/to-delete`, { method: 'DELETE' });
      expect(delRes.status).toBe(200);

      const getRes = await fetch(`${server.baseUrl}/api/projects/to-delete`);
      expect(getRes.status).toBe(404);
    });
  });

  describe('invalid project id', () => {
    it('routes an empty id segment to the list endpoint instead of rejecting it', async () => {
      const res = await fetch(`${server.baseUrl}/api/projects/`);
      expect(res.status).toBe(200);
    });

    it('normalizes ".." out of the URL before routing sees it, landing on the static 404 fallback', async () => {
      // WHATWG URL parsing (new URL(req.url, base) in handleRequest) collapses
      // "/api/projects/.." to "/api/" before segment-based routing runs, so
      // this never reaches the :id validation at all — it's not a bypass,
      // just a different (still safe) code path.
      const res = await fetch(`${server.baseUrl}/api/projects/..`);
      expect(res.status).toBe(404);
    });

    it.each(['.hidden', 'a/b', 'has space', 'x'.repeat(200)])('rejects %j with 400', async (rawId) => {
      const res = await fetch(`${server.baseUrl}/api/projects/${encodeURIComponent(rawId)}`);
      expect(res.status).toBe(400);
    });
  });

  describe('extra route segments', () => {
    it('rejects /api/projects/:id/extra with 404', async () => {
      const res = await fetch(`${server.baseUrl}/api/projects/my-project/extra`);
      expect(res.status).toBe(404);
    });

    it('does not treat /api/projectsFOO as the projects API', async () => {
      // Falls through to static serving, which 404s with no static dir contents.
      const res = await fetch(`${server.baseUrl}/api/projectsFOO`);
      expect(res.status).toBe(404);
    });
  });

  describe('path traversal containment', () => {
    it('normalizes ../ so it never resolves outside staticDir (safe 404, never a leaked file)', async () => {
      const res = await fetch(`${server.baseUrl}/../../../etc/passwd`);
      expect(res.status).toBe(404);
    });
  });

  describe('malformed request URI', () => {
    it('returns 400 for an unterminated percent-escape in the path', async () => {
      const res = await fetch(`${server.baseUrl}/%`);
      expect(res.status).toBe(400);
    });
  });

  describe('malformed JSON body', () => {
    it('returns 400, not 500, for invalid JSON on PUT', async () => {
      const res = await fetch(`${server.baseUrl}/api/projects/broken`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{ this is not json',
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for a structurally invalid CanonicalProjectV2', async () => {
      const res = await fetch(`${server.baseUrl}/api/projects/broken`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formatVersion: 2,
          electrical: { components: [], junctions: [], cables: [], nets: [] },
          layout: { boards: [], components: [], junctions: [] },
        }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 415 when Content-Type is not application/json', async () => {
      const res = await fetch(`${server.baseUrl}/api/projects/broken`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(validProjectPayload()),
      });
      expect(res.status).toBe(415);
    });
  });

  describe('canonical v1/v2 validation parity', () => {
    it('normalizes unused cable color and wirelabel slots before storage', async () => {
      const project = validProjectPayload();
      const spare = project.electrical.cables.find((cable) => cable.name === 'SPARE');
      spare.colors = ['#a1b2c3'];
      spare.wireLabels = ['unused-a'];

      const putRes = await fetch(`${server.baseUrl}/api/projects/normalized`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      });
      expect(putRes.status).toBe(200);

      const getRes = await fetch(`${server.baseUrl}/api/projects/normalized`);
      const stored = await getRes.json();
      expect(stored.electrical.cables.find((cable) => cable.name === 'SPARE')).toMatchObject({
        colors: ['#a1b2c3', ''],
        wireLabels: ['unused-a', ''],
      });
    });

    it('rejects a legacy wire whose two ends are the same endpoint', async () => {
      const project = legacyConnectedProjectPayload();
      project.nets[0].target = { componentId: 'source', pinId: 'out' };

      const res = await fetch(`${server.baseUrl}/api/projects/legacy-self-loop`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      });
      expect(res.status).toBe(400);
    });

    it('rejects conflicting effective colors for a reused legacy wire id', async () => {
      const project = legacyConnectedProjectPayload();
      project.nets.push({ ...structuredClone(project.nets[0]), id: 'wire-b', colorCode: 'BU' });

      const res = await fetch(`${server.baseUrl}/api/projects/legacy-color-conflict`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      });
      expect(res.status).toBe(400);
    });

    it('accepts an internal loop and rejects the same loop when backed by a cable', async () => {
      const project = validProjectPayload();
      const source = project.electrical.components.find((component) => component.id === 'source');
      source.pins.push(
        { id: 'loop-a', label: 'LOOP-A', direction: 'output' },
        { id: 'loop-b', label: 'LOOP-B', direction: 'output' },
      );
      project.electrical.nets.push({
        id: 'internal-loop-net',
        name: '',
        endpoints: [
          { kind: 'pin', componentId: 'source', pinId: 'loop-a' },
          { kind: 'pin', componentId: 'source', pinId: 'loop-b' },
        ],
        conductors: [
          {
            id: 'internal-loop',
            from: { kind: 'pin', componentId: 'source', pinId: 'loop-a' },
            to: { kind: 'pin', componentId: 'source', pinId: 'loop-b' },
            wirevizLoop: true,
          },
        ],
      });
      project.layout.conductors.push({ conductorId: 'internal-loop' });

      const accepted = await fetch(`${server.baseUrl}/api/projects/internal-loop`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      });
      expect(accepted.status).toBe(200);

      project.electrical.nets.at(-1).conductors[0].cable = { name: 'HARNESS', wireIndex: 1 };
      const rejected = await fetch(`${server.baseUrl}/api/projects/cable-loop`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      });
      expect(rejected.status).toBe(400);
    });

    it('rejects canonical and dangerous keys inside preserved extras', async () => {
      const reserved = validProjectPayload();
      reserved.electrical.components[0].wirevizExtras = { type: 'override' };
      const reservedRes = await fetch(`${server.baseUrl}/api/projects/reserved-extra`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reserved),
      });
      expect(reservedRes.status).toBe(400);

      const dangerous = validProjectPayload();
      dangerous.electrical.cables[0].wirevizExtras = JSON.parse(
        '{"x":{"__proto__":"bad"}}',
      );
      const dangerousRes = await fetch(`${server.baseUrl}/api/projects/dangerous-extra`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dangerous),
      });
      expect(dangerousRes.status).toBe(400);
    });
  });

  describe('oversized payload', () => {
    it('returns 413 for a body over the 5 MB limit', async () => {
      const hugeBody = JSON.stringify({ padding: 'x'.repeat(6 * 1024 * 1024) });
      const res = await fetch(`${server.baseUrl}/api/projects/too-big`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: hugeBody,
      });
      expect(res.status).toBe(413);
      expect(await res.json()).toMatchObject({ error: 'payload_too_large' });
    });
  });

  describe('Host / Origin allowlisting', () => {
    // fetch() cannot set Host/Origin/Sec-Fetch-* (Fetch spec "forbidden header
    // names"), so these use rawRequest (node:http) to actually control them.

    it('rejects a request whose Host header is not on the allowlist (DNS rebinding)', async () => {
      const res = await rawRequest(server.baseUrl, '/api/projects', {
        headers: { Host: 'attacker.example:1234' },
      });
      expect(res.status).toBe(400);
    });

    it('rejects a PUT whose Origin header does not match the request Host', async () => {
      const res = await rawRequest(server.baseUrl, '/api/projects/x', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example' },
        body: JSON.stringify(validProjectPayload()),
      });
      expect(res.status).toBe(403);
    });

    it('rejects a PUT whose Sec-Fetch-Site is cross-site', async () => {
      const res = await rawRequest(server.baseUrl, '/api/projects/x', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' },
        body: JSON.stringify(validProjectPayload()),
      });
      expect(res.status).toBe(403);
    });

    it('accepts a PUT with no Origin/Sec-Fetch-Site header at all (documented curl workflow)', async () => {
      const res = await rawRequest(server.baseUrl, '/api/projects/x', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validProjectPayload()),
      });
      expect(res.status).toBe(200);
    });

    it('accepts a PUT with a matching same-origin Origin header', async () => {
      const res = await rawRequest(server.baseUrl, '/api/projects/x', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Origin: server.baseUrl },
        body: JSON.stringify(validProjectPayload()),
      });
      expect(res.status).toBe(200);
    });
  });
});
