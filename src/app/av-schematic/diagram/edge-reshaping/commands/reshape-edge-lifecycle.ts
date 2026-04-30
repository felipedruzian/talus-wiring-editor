export interface ReshapeEdgeStartCommand {
  type: 'reshapeEdgeStart';
  edgeId: string;
}

export interface ReshapeEdgeStopCommand {
  type: 'reshapeEdgeStop';
  edgeId: string;
}
