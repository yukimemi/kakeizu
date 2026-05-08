import { type EdgeProps } from "@xyflow/react";

/**
 * Spouse / 婚姻線: traditional double-line marker between two married
 * persons. Drawn as two parallel hairline paths offset by a small distance,
 * in the brand 朱 color.
 */
export function SpouseEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, style, markerEnd } = props;
  const offset = 2; // px between the two parallel lines
  // Compute perpendicular offset direction
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.hypot(dx, dy) || 1;
  const ox = (-dy / len) * offset;
  const oy = (dx / len) * offset;

  const stroke =
    (style as React.CSSProperties | undefined)?.stroke ?? "#A52A1F";
  const opacity =
    (style as React.CSSProperties | undefined)?.opacity ?? 0.85;

  const d1 = `M ${sourceX + ox} ${sourceY + oy} L ${targetX + ox} ${targetY + oy}`;
  const d2 = `M ${sourceX - ox} ${sourceY - oy} L ${targetX - ox} ${targetY - oy}`;

  return (
    <g style={{ pointerEvents: "all" }}>
      <path
        d={d1}
        stroke={stroke}
        strokeWidth={1.1}
        fill="none"
        opacity={opacity}
        markerEnd={markerEnd}
      />
      <path
        d={d2}
        stroke={stroke}
        strokeWidth={1.1}
        fill="none"
        opacity={opacity}
      />
    </g>
  );
}
