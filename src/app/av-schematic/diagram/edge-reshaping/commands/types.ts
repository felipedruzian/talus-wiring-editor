import { type ReshapeEdgeCommand } from './reshape-edge';
import {
  type ReshapeEdgeStartCommand,
  type ReshapeEdgeStopCommand,
} from './reshape-edge-lifecycle';

export type ReshapeCommand =
  | ReshapeEdgeCommand
  | ReshapeEdgeStartCommand
  | ReshapeEdgeStopCommand;
