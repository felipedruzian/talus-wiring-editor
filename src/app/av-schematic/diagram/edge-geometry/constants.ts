// Coordinate equality slack in px. Two points within this count as coincident —
// absorbs sub-pixel float drift from snap math without merging distinct points.
export const POSITION_TOLERANCE_PX = 1;

// Looser slack for "is this interior point on the line between its neighbours",
// used when folding nearly-straight runs after a reshape/relink.
export const ALIGNMENT_TOLERANCE = 5;

// Link-snap gravity: how close the cursor gets before a relink snaps to a port.
export const PORT_SNAP_PX = 24;
