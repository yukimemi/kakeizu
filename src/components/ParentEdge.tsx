import { BaseEdge, type EdgeProps } from "@xyflow/react";

/**
 * Parent → child edge as a clean 3-segment polyline:
 *   source ↓ → horizontal at `horizY` → ↓ target
 *
 * `horizY` comes from edge.data and is staggered per parent so two parents'
 * horizontal segments don't share a y level (which would make them look like
 * one line).
 */
export function ParentEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, data, style, markerEnd } = props;
  const fallbackY = (sourceY + targetY) / 2;
  const horizY = (data as { horizY?: number } | undefined)?.horizY ?? fallbackY;
  const path = `M ${sourceX} ${sourceY} L ${sourceX} ${horizY} L ${targetX} ${horizY} L ${targetX} ${targetY}`;
  return <BaseEdge path={path} style={style} markerEnd={markerEnd} />;
}
