import { inject, Injectable } from '@angular/core';
import {
  NgDiagramModelService,
  NgDiagramService,
  type Edge,
  type Node,
  type Point,
} from 'ng-diagram';
import { ModelApplyService } from '../diagram/model/model-apply.service';
import { ModelChanges } from '../diagram/model/model-changes';
import {
  type DevicePort,
  type DeviceNodeData,
  type WireEdgeData,
} from '../diagram/model/interfaces';
import {
  formDataToDeviceData,
  type DeviceFieldChange,
} from '../shared/device-form/device-form.mappers';
import {
  formDataToWireData,
  type WireFieldChange,
} from './components/wire-form/wire-form.mappers';

/** Handles node and edge removal and live field edits from the sidebar forms. */
@Injectable()
export class ElementMutationService {
  private readonly modelService = inject(NgDiagramModelService);
  private readonly diagramService = inject(NgDiagramService);
  private readonly modelApplyService = inject(ModelApplyService);

  async removeNode(nodeId: string): Promise<void> {
    const changes = new ModelChanges();
    changes.addDeleteNodeIds(nodeId);
    await this.modelApplyService.apply(changes);
  }

  async removeEdge(edgeId: string): Promise<void> {
    const changes = new ModelChanges();
    changes.addDeleteEdgeIds(edgeId);
    await this.modelApplyService.apply(changes);
  }

  handleDeviceFieldChange(change: DeviceFieldChange): void {
    const node = this.modelService.getNodeById<DeviceNodeData>(change.entityId);
    if (!node) return;
    const updatedData = formDataToDeviceData(change.formData, node.data);
    const portsChanged = change.fields.includes('ports');

    if (!portsChanged) {
      this.modelService.updateNodeData(change.entityId, updatedData);
      return;
    }

    const orphanedEdgeIds = this.findOrphanedEdgeIds(
      change.entityId,
      node.data.ports,
      updatedData.ports,
    );
    const flippedPortIds = findDirectionFlippedPortIds(node.data.ports, updatedData.ports);
    const orphanedSet = new Set(orphanedEdgeIds);
    const affectedEdgeIds = flippedPortIds.size
      ? this.modelService
          .getConnectedEdges(change.entityId)
          .filter(
            (edge) =>
              !orphanedSet.has(edge.id) &&
              ((edge.source === change.entityId && flippedPortIds.has(edge.sourcePort ?? '')) ||
                (edge.target === change.entityId && flippedPortIds.has(edge.targetPort ?? ''))),
          )
          .map((edge) => edge.id)
      : [];

    // Port `side` in `measuredPorts` lags behind the direction switch — read
    // the new side directly from the form data so synthesis uses the correct
    // outward direction without waiting for a remeasure.
    const overrideSides = new Map<string, 'left' | 'right'>(
      updatedData.ports.map((p) => [p.id, p.direction === 'input' ? 'left' : 'right']),
    );

    const changes = new ModelChanges();
    changes.addNodeUpdates({ id: change.entityId, data: updatedData });
    if (orphanedEdgeIds.length > 0) changes.addDeleteEdgeIds(...orphanedEdgeIds);

    void this.modelApplyService.apply(changes).then(async () => {
      if (affectedEdgeIds.length === 0) return;

      const before = affectedEdgeIds.map((id) => {
        const e = this.modelService.getEdgeById(id);
        const n = this.modelService.getNodeById(change.entityId);
        return {
          id,
          sourcePort: e?.sourcePort,
          targetPort: e?.targetPort,
          routingMode: e?.routingMode,
          pointsCount: e?.points?.length,
          firstPoint: e?.points?.[0],
          lastPoint: e?.points && e.points.length > 0 ? e.points[e.points.length - 1] : undefined,
          sourcePosition: e?.sourcePosition,
          targetPosition: e?.targetPosition,
          measuredPorts: n?.measuredPorts?.map((p) => ({
            id: p.id,
            side: p.side,
            position: p.position,
            size: p.size,
          })),
          nodePosition: n?.position,
          nodeSize: n?.size,
        };
      });
      console.warn('[port-flip] BEFORE invalidate', JSON.parse(JSON.stringify(before)));

      this.diagramService.invalidateMeasurements({ nodes: [{ nodeId: change.entityId }] });
      await this.diagramService.transaction(() => {}, { waitForMeasurements: true });

      const afterSettle = affectedEdgeIds.map((id) => {
        const e = this.modelService.getEdgeById(id);
        const n = this.modelService.getNodeById(change.entityId);
        return {
          id,
          sourcePosition: e?.sourcePosition,
          targetPosition: e?.targetPosition,
          measuredPorts: n?.measuredPorts?.map((p) => ({
            id: p.id,
            side: p.side,
            position: p.position,
            size: p.size,
          })),
        };
      });
      console.warn('[port-flip] AFTER settle', JSON.parse(JSON.stringify(afterSettle)));

      this.reflowFlippedPortEdges(change.entityId, flippedPortIds, affectedEdgeIds, overrideSides);
    });
  }

  private reflowFlippedPortEdges(
    nodeId: string,
    flippedPortIds: ReadonlySet<string>,
    edgeIds: readonly string[],
    overrideSides: ReadonlyMap<string, 'left' | 'right'>,
  ): void {
    const updates: Array<{
      id: string;
      points: Point[] | undefined;
      routingMode: 'manual' | 'auto';
    }> = [];
    for (const edgeId of edgeIds) {
      const edge = this.modelService.getEdgeById(edgeId);
      if (!edge) continue;
      const next = this.computeFlippedPath(edge, nodeId, flippedPortIds, overrideSides);
      if (!next) continue;
      if (next === 'reset') {
        updates.push({ id: edgeId, points: undefined, routingMode: 'auto' });
      } else {
        updates.push({ id: edgeId, points: next, routingMode: 'manual' });
      }
    }
    if (updates.length === 0) return;
    console.warn(
      '[port-flip] writing updates',
      JSON.parse(JSON.stringify(updates)),
    );
    void this.diagramService.transaction(() => {
      for (const update of updates) {
        this.modelService.updateEdge(update.id, {
          points: update.points,
          routingMode: update.routingMode,
        });
      }
    });

    // Re-read after one frame so we can see what ng-diagram did with our writes
    queueMicrotask(() => {
      setTimeout(() => {
        const post = updates.map((u) => {
          const e = this.modelService.getEdgeById(u.id);
          return {
            id: u.id,
            wroteFirstPoint: u.points?.[0],
            wroteLastPoint: u.points && u.points.length > 0 ? u.points[u.points.length - 1] : undefined,
            wroteRoutingMode: u.routingMode,
            currentFirstPoint: e?.points?.[0],
            currentLastPoint: e?.points && e.points.length > 0 ? e.points[e.points.length - 1] : undefined,
            currentSourcePosition: e?.sourcePosition,
            currentTargetPosition: e?.targetPosition,
            currentRoutingMode: e?.routingMode,
            currentPointsCount: e?.points?.length,
          };
        });
        console.warn('[port-flip] POST write (after raf)', JSON.parse(JSON.stringify(post)));
      }, 50);
    });
  }

  private computeFlippedPath(
    edge: Edge,
    nodeId: string,
    flippedPortIds: ReadonlySet<string>,
    overrideSides: ReadonlyMap<string, 'left' | 'right'>,
  ): Point[] | 'reset' | null {
    const node = this.modelService.getNodeById(nodeId);
    if (!node) return null;

    const sourceFlipped =
      edge.source === nodeId && flippedPortIds.has(edge.sourcePort ?? '');
    const targetFlipped =
      edge.target === nodeId && flippedPortIds.has(edge.targetPort ?? '');
    if (!sourceFlipped && !targetFlipped) return null;

    const sourceNode = edge.source === nodeId ? node : this.modelService.getNodeById(edge.source);
    const targetNode = edge.target === nodeId ? node : this.modelService.getNodeById(edge.target);
    if (!sourceNode || !targetNode) return 'reset';

    const srcSide =
      (edge.source === nodeId ? overrideSides.get(edge.sourcePort ?? '') : null) ??
      getHorizontalPortSide(sourceNode, edge.sourcePort);
    const tgtSide =
      (edge.target === nodeId ? overrideSides.get(edge.targetPort ?? '') : null) ??
      getHorizontalPortSide(targetNode, edge.targetPort);
    if (!srcSide || !tgtSide) return 'reset';

    // `measuredPorts.side` lags after a direction flip, so `edge.sourcePosition`
    // computed by ng-diagram applies the wrong-side formula to the new port
    // position. Recompute the anchor ourselves using the authoritative side.
    const srcPos = computePortAnchor(sourceNode, edge.sourcePort, srcSide);
    const tgtPos = computePortAnchor(targetNode, edge.targetPort, tgtSide);
    console.warn('[port-flip] compute', {
      edgeId: edge.id,
      sourceFlipped,
      targetFlipped,
      srcPos,
      tgtPos,
      srcSide,
      tgtSide,
      hasPoints: !!edge.points,
      routingMode: edge.routingMode,
    });
    if (!srcPos || !tgtPos) return 'reset';

    const hasManualPath =
      edge.routingMode === 'manual' && edge.points && edge.points.length >= 3;

    if (hasManualPath) {
      const nodeCenterX = node.position.x + (node.size?.width ?? 0) / 2;
      let next: Point[] = edge.points!.slice();
      if (sourceFlipped) next = flipEndpointAcrossNode(next, 'source', srcPos, nodeCenterX);
      if (targetFlipped) next = flipEndpointAcrossNode(next, 'target', tgtPos, nodeCenterX);
      return next;
    }

    // Auto-routed edge: ng-diagram's orthogonal router doesn't reliably
    // adapt when a port moves to the opposite side, so synthesize a manual
    // path with a stub on each end pointing outwards from the new port side.
    return synthesizeOrthogonalPath(srcPos, srcSide, tgtPos, tgtSide);
  }

  private findOrphanedEdgeIds(
    nodeId: string,
    oldPorts: readonly DevicePort[],
    newPorts: readonly DevicePort[],
  ): string[] {
    const newIds = new Set(newPorts.map((p) => p.id));
    const removedIds = new Set(oldPorts.filter((p) => !newIds.has(p.id)).map((p) => p.id));
    if (removedIds.size === 0) return [];

    return this.modelService
      .getConnectedEdges(nodeId)
      .filter(
        (edge) =>
          (edge.source === nodeId && removedIds.has(edge.sourcePort ?? '')) ||
          (edge.target === nodeId && removedIds.has(edge.targetPort ?? '')),
      )
      .map((edge) => edge.id);
  }

  handleWireFieldChange(change: WireFieldChange): void {
    const edge = this.modelService.getEdgeById<WireEdgeData>(change.edgeId);
    if (!edge) return;
    const updatedData = formDataToWireData(change.formData, edge.data);
    this.modelService.updateEdgeData(change.edgeId, updatedData);
  }

  resetEdgeRouting(edgeId: string): void {
    this.modelService.updateEdge(edgeId, {
      points: undefined,
      routingMode: 'auto',
    });
  }
}

const findDirectionFlippedPortIds = (
  oldPorts: readonly DevicePort[],
  newPorts: readonly DevicePort[],
): Set<string> => {
  const oldByid = new Map(oldPorts.map((p) => [p.id, p]));
  const flipped = new Set<string>();
  for (const next of newPorts) {
    const prev = oldByid.get(next.id);
    if (prev && prev.direction !== next.direction) flipped.add(next.id);
  }
  return flipped;
};

/**
 * Stub length for synthesized orthogonal segments. Matches
 * `firstLastSegmentLength` in the diagram routing config so the manually
 * synthesized path lines up with the rest of the diagram visually.
 */
const ORTHOGONAL_STUB_PX = 80;


const getHorizontalPortSide = (
  node: Node | null | undefined,
  portId: string | undefined,
): 'left' | 'right' | null => {
  if (!node || !portId) return null;
  const port = node.measuredPorts?.find((p) => p.id === portId);
  if (!port) return null;
  return port.side === 'left' || port.side === 'right' ? port.side : null;
};

/**
 * Recreates ng-diagram's port-attachment formula with an authoritative side.
 * For left ports the anchor is the port-shape's left (outer) edge, for right
 * ports it's the right (outer) edge — matching where ng-diagram natively
 * lands edges when `measuredPorts.side` is current. We have to recompute
 * because immediately after a direction flip `measuredPorts.side` lags
 * (still reports the old side) even though `position`/`size` have refreshed,
 * which leaves `edge.sourcePosition` applying the wrong-side formula.
 */
const computePortAnchor = (
  node: Node,
  portId: string | undefined,
  side: 'left' | 'right',
): Point | null => {
  if (!portId) return null;
  const port = node.measuredPorts?.find((p) => p.id === portId);
  if (!port || !port.position || !port.size) return null;
  const x =
    side === 'left'
      ? port.position.x + node.position.x
      : port.position.x + node.position.x + port.size.width;
  const y = port.position.y + node.position.y + port.size.height / 2;
  return { x, y };
};

/**
 * Builds a 6-point orthogonal path between two horizontal ports. Each end
 * gets a horizontal stub pointing outward from the port side; the two stubs
 * are joined by a vertical middle segment at the average Y. When both ports
 * share Y the middle segment collapses to zero length and the path renders
 * as a flat line with stubs at each end.
 */
const synthesizeOrthogonalPath = (
  src: Point,
  srcSide: 'left' | 'right',
  tgt: Point,
  tgtSide: 'left' | 'right',
): Point[] => {
  const srcStubX = src.x + (srcSide === 'right' ? ORTHOGONAL_STUB_PX : -ORTHOGONAL_STUB_PX);
  const tgtStubX = tgt.x + (tgtSide === 'right' ? ORTHOGONAL_STUB_PX : -ORTHOGONAL_STUB_PX);
  const midY = (src.y + tgt.y) / 2;
  return [
    { x: src.x, y: src.y },
    { x: srcStubX, y: src.y },
    { x: srcStubX, y: midY },
    { x: tgtStubX, y: midY },
    { x: tgtStubX, y: tgt.y },
    { x: tgt.x, y: tgt.y },
  ];
};

/**
 * Mirrors the stub of an orthogonal manual edge across the node's vertical
 * centerline when the port flips left↔right. The endpoint snaps to the new
 * port position, the immediate neighbour mirrors so the stub exits the new
 * port outwards, and the bend beyond the neighbour mirrors too when its
 * segment to the neighbour was vertical — otherwise that segment would turn
 * diagonal. Interior bends further along stay where the user put them.
 */
const flipEndpointAcrossNode = (
  points: readonly Point[],
  side: 'source' | 'target',
  newPortPosition: Point,
  nodeCenterX: number,
): Point[] => {
  const next = points.slice();
  const endpointIndex = side === 'source' ? 0 : next.length - 1;
  const neighbourIndex = side === 'source' ? 1 : next.length - 2;
  const beyondIndex = side === 'source' ? 2 : next.length - 3;
  const oldNeighbour = points[neighbourIndex];
  const newNeighbourX = 2 * nodeCenterX - oldNeighbour.x;

  next[endpointIndex] = { x: newPortPosition.x, y: newPortPosition.y };
  next[neighbourIndex] = { x: newNeighbourX, y: newPortPosition.y };

  if (beyondIndex >= 0 && beyondIndex < next.length) {
    const beyond = points[beyondIndex];
    if (beyond.x === oldNeighbour.x) {
      next[beyondIndex] = { x: newNeighbourX, y: beyond.y };
    }
  }
  return next;
};
