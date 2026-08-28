import { type Edge, type Node } from 'ng-diagram';
import {
  findHoleCollisions,
  findOutOfBoundsHoleClaims,
  type BoardHoleClaim,
} from './board-geometry';
import { findTraceDefects, findTraceOverlaps } from './board-trace';
import { deviceHoleClaims } from './footprint-geometry';
import { resolveFootprint } from './footprint';
import { isBoardNode, isDeviceNode, isWireEdge } from './guards';
import { OPERATIONAL_LIMITS } from './operational-limits.mjs';
import { physicalEdgeNet, physicalEndpoint } from './physical-connectivity';

export type PhysicalDiagnosticSeverity = 'error' | 'warning';

export interface PhysicalDiagnostic {
  severity: PhysicalDiagnosticSeverity;
  code: string;
  path: string;
  message: string;
}

/**
 * Read-only physical audit for the live diagram.
 *
 * Diagnostics never decide whether a project can be saved. Structural schema
 * errors are still rejected by the canonical parser; authored net names that
 * disagree with copper stay savable and are reported here as warnings.
 */
export function inspectPhysicalLayout(
  nodes: readonly Node[],
  edges: readonly Edge[],
): PhysicalDiagnostic[] {
  const diagnostics: PhysicalDiagnostic[] = [];
  const boards = nodes.filter(isBoardNode);
  const boardsById = new Map(boards.map((board) => [board.data.boardId, board.data]));

  for (const board of boards) {
    const path = `layout.boards.${board.data.boardId}`;
    if (
      board.data.rows < 1 ||
      board.data.cols < 1 ||
      board.data.pitch <= 0 ||
      board.data.rows > OPERATIONAL_LIMITS.maxBoardRows ||
      board.data.cols > OPERATIONAL_LIMITS.maxBoardCols ||
      board.data.pitch > OPERATIONAL_LIMITS.maxBoardPitch
    ) {
      diagnostics.push({
        severity: 'error',
        code: 'board-limit',
        path,
        message: `A placa "${board.data.label}" excede os limites operacionais de dimensões ou pitch.`,
      });
      continue;
    }
    if (board.data.holeDiameter !== undefined && board.data.holeDiameter > board.data.pitch) {
      diagnostics.push({
        severity: 'error',
        code: 'board-hole-diameter',
        path: `${path}.holeDiameter`,
        message: `O diâmetro dos furos de "${board.data.label}" não pode exceder o pitch.`,
      });
      continue;
    }
    const segmentCount = (board.data.traces ?? []).reduce(
      (total, trace) => total + trace.segments.length,
      0,
    );
    if (
      (board.data.holes?.length ?? 0) > OPERATIONAL_LIMITS.maxBoardHoles ||
      (board.data.traces?.length ?? 0) > OPERATIONAL_LIMITS.maxBoardTraces ||
      segmentCount > OPERATIONAL_LIMITS.maxTraceSegmentsPerBoard
    ) {
      diagnostics.push({
        severity: 'error',
        code: 'board-collection-limit',
        path,
        message: `A placa "${board.data.label}" excede o limite de furos, trilhas ou segmentos.`,
      });
      continue;
    }
    if (
      board.data.holes === undefined &&
      board.data.rows * board.data.cols > OPERATIONAL_LIMITS.maxBoardHoles
    ) {
      diagnostics.push({
        severity: 'error',
        code: 'board-hole-limit',
        path,
        message: `A placa "${board.data.label}" excede ${OPERATIONAL_LIMITS.maxBoardHoles} furos implícitos; use uma lista esparsa de furos.`,
      });
      continue;
    }
    const traceExpansionIsSafe = (board.data.traces ?? []).every((trace) =>
      trace.segments.every(
        (segment) =>
          Math.abs(segment.from.row - segment.to.row) <= OPERATIONAL_LIMITS.maxBoardRows &&
          Math.abs(segment.from.col - segment.to.col) <= OPERATIONAL_LIMITS.maxBoardCols,
      ),
    );
    if (!traceExpansionIsSafe) {
      diagnostics.push({
        severity: 'error',
        code: 'trace-limit',
        path: `${path}.traces`,
        message: `Uma trilha de "${board.data.label}" excede a grade declarada.`,
      });
      continue;
    }
    for (const defect of findTraceDefects(board.data)) {
      diagnostics.push({
        severity: 'error',
        code: `trace-${defect.reason}`,
        path: `${path}.traces.${defect.traceId}.segments.${defect.segmentIndex}`,
        message: `A trilha "${defect.traceId}" tem cobre inválido em L${defect.hole.row + 1}-C${defect.hole.col + 1} (${defect.reason}).`,
      });
    }
    for (const overlap of findTraceOverlaps(board.data)) {
      diagnostics.push({
        severity: 'error',
        code: 'trace-overlap',
        path: `${path}.traces`,
        message: `As trilhas ${overlap.traceIds.join(', ')} se sobrepõem em L${overlap.hole.row + 1}-C${overlap.hole.col + 1}.`,
      });
    }
  }

  const claims: BoardHoleClaim[] = nodes
    .filter(isDeviceNode)
    .flatMap((node) => deviceHoleClaims(node.id, node.data));
  for (const claim of findOutOfBoundsHoleClaims(claims, boardsById)) {
    diagnostics.push({
      severity: 'error',
      code: 'placement-out-of-bounds',
      path: `layout.components.${claim.ownerId}`,
      message: `O componente "${claim.ownerId}" ocupa L${claim.hole.row + 1}-C${claim.hole.col + 1}, que não existe na placa "${claim.boardId}".`,
    });
  }
  for (const collision of findHoleCollisions(claims)) {
    const first = collision[0];
    if (!first) continue;
    diagnostics.push({
      severity: 'error',
      code: 'placement-collision',
      path: `layout.boards.${first.boardId}`,
      message: `O furo L${first.hole.row + 1}-C${first.hole.col + 1} está ocupado por ${collision.map((claim) => claim.ownerId).join(', ')}.`,
    });
  }

  for (const node of nodes.filter(isDeviceNode)) {
    if (node.data.placement && !resolveFootprint(node.data)) {
      diagnostics.push({
        severity: 'error',
        code: 'footprint-missing',
        path: `layout.components.${node.id}.footprint`,
        message: `O componente "${node.id}" está encaixado sem uma definição de footprint disponível.`,
      });
    }
  }

  for (const edge of edges.filter(isWireEdge)) {
    const physical = physicalEdgeNet(nodes, edge);
    if (physical.conflict.length > 0) {
      diagnostics.push({
        severity: 'error',
        code: 'copper-short',
        path: `layout.conductors.${edge.id}`,
        message: `O condutor "${edge.id}" une cobres incompatíveis: ${physical.conflict.join(', ')}.`,
      });
      continue;
    }
    if (edge.data.netName && physical.netLabel && edge.data.netName !== physical.netLabel) {
      diagnostics.push({
        severity: 'warning',
        code: 'net-copper-divergence',
        path: `electrical.nets.${edge.data.netId ?? edge.id}`,
        message: `O condutor "${edge.id}" mantém a rede autoral "${edge.data.netName}", mas está sobre o cobre "${physical.netLabel}". Revise a net ou a trilha; o salvamento preservará a autoria.`,
      });
    }
  }

  const authoredNamesByCopper = new Map<
    string,
    { path: string; label: string; names: Set<string>; conductorIds: Set<string> }
  >();
  for (const edge of edges.filter(isWireEdge)) {
    if (!edge.data.netName) continue;
    for (const [nodeId, portId] of [
      [edge.source, edge.sourcePort],
      [edge.target, edge.targetPort],
    ] as const) {
      const endpoint = physicalEndpoint(nodes, nodeId, portId);
      if (!endpoint) continue;
      const copperId = endpoint.traceId
        ? `trace:${endpoint.traceId}`
        : `hole:${endpoint.hole.row}:${endpoint.hole.col}`;
      const key = `${endpoint.boardId}/${copperId}`;
      const entry = authoredNamesByCopper.get(key) ?? {
        path: `layout.boards.${endpoint.boardId}.${copperId}`,
        label: endpoint.traceLabel ?? `L${endpoint.hole.row + 1}-C${endpoint.hole.col + 1}`,
        names: new Set<string>(),
        conductorIds: new Set<string>(),
      };
      entry.names.add(edge.data.netName);
      entry.conductorIds.add(edge.id);
      authoredNamesByCopper.set(key, entry);
    }
  }
  for (const entry of authoredNamesByCopper.values()) {
    if (entry.names.size < 2) continue;
    diagnostics.push({
      severity: 'warning',
      code: 'authored-net-merge',
      path: entry.path,
      message: `O cobre "${entry.label}" reúne nomes autorais distintos (${[...entry.names].sort().join(', ')}) nos condutores ${[...entry.conductorIds].sort().join(', ')}. O menor nome em ordem lexical será usado de modo determinístico; revise a autoria antes de salvar.`,
    });
  }

  return diagnostics;
}
