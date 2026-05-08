import { Handle, Position } from "@xyflow/react";

/**
 * Invisible "couple connector" — sits on the spouse line so that parent→child
 * edges can originate from the midpoint between two married parents.
 */
export function CoupleNode() {
  return (
    <div
      style={{
        width: 8,
        height: 8,
        pointerEvents: "none",
        background: "transparent",
      }}
    >
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          opacity: 0,
          background: "transparent",
          border: "none",
        }}
      />
    </div>
  );
}
