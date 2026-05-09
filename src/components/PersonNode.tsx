import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Person } from "../types";
import { NODE_HEIGHT, NODE_WIDTH } from "../layout/treeLayout";
import { computeAge } from "../lib/age";

export type PersonNodeData = {
  person: Person;
  selected?: boolean;
};

const genderTheme: Record<
  string,
  { ring: string; sealBg: string; sealColor: string }
> = {
  male: {
    ring: "rgba(31, 47, 84, 0.18)",
    sealBg: "linear-gradient(135deg, #2A416E, #1F2F54)",
    sealColor: "#F8F3E7",
  },
  female: {
    ring: "rgba(165, 42, 31, 0.18)",
    sealBg: "linear-gradient(135deg, #C73B2C, #A52A1F)",
    sealColor: "#F8F3E7",
  },
  other: {
    ring: "rgba(140, 106, 47, 0.20)",
    sealBg: "linear-gradient(135deg, #B58A4A, #8C6A2F)",
    sealColor: "#F8F3E7",
  },
  none: {
    ring: "rgba(107, 101, 95, 0.18)",
    sealBg: "linear-gradient(135deg, #6B655F, #3F3A36)",
    sealColor: "#F8F3E7",
  },
};

export function PersonNode({ data, selected }: NodeProps) {
  const { person } = data as unknown as PersonNodeData;
  const fullName = `${person.lastName} ${person.firstName}`.trim();
  const kana =
    person.lastNameKana || person.firstNameKana
      ? `${person.lastNameKana ?? ""} ${person.firstNameKana ?? ""}`.trim()
      : null;
  const theme = genderTheme[person.gender ?? "none"] ?? genderTheme.none;

  return (
    <div
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        background: "#FCF9F2",
        border: selected ? "1px solid #A52A1F" : "1px solid #D9D2C2",
        borderRadius: 10,
        padding: "12px 14px",
        boxShadow: selected
          ? "0 0 0 3px rgba(165, 42, 31, 0.12), 0 8px 24px -8px rgba(165, 42, 31, 0.25)"
          : "0 1px 0 rgba(26, 23, 22, 0.02), 0 4px 14px -6px rgba(26, 23, 22, 0.10)",
        position: "relative",
        transition: "box-shadow 200ms, border-color 200ms",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: "transparent",
          border: "none",
          width: 8,
          height: 8,
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: "transparent",
          border: "none",
          width: 8,
          height: 8,
        }}
      />
      {/* Spouse edges: right = source, left = target. */}
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        style={{
          background: "transparent",
          border: "none",
          width: 8,
          height: 8,
        }}
      />
      <Handle
        id="left"
        type="target"
        position={Position.Left}
        style={{
          background: "transparent",
          border: "none",
          width: 8,
          height: 8,
        }}
      />

      {/* Decorative top hairline accent */}
      <div
        style={{
          position: "absolute",
          top: 6,
          left: 14,
          right: 14,
          height: 1,
          background:
            "linear-gradient(90deg, transparent, #C2BAA9 25%, #C2BAA9 75%, transparent)",
          opacity: 0.5,
        }}
      />

      <div
        style={{
          display: "flex",
          height: "100%",
          alignItems: "center",
          gap: 12,
        }}
      >
        {person.photoUrl ? (
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              overflow: "hidden",
              flex: "none",
              boxShadow: `inset 0 0 0 2px ${theme.ring}, 0 1px 2px rgba(26, 23, 22, 0.10)`,
            }}
          >
            <img
              src={person.photoUrl}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transform: person.photoTransform
                  ? `translate(${person.photoTransform.x}%, ${person.photoTransform.y}%) scale(${person.photoTransform.scale})`
                  : undefined,
                transformOrigin: "center center",
              }}
            />
          </div>
        ) : (
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: theme.sealBg,
              color: theme.sealColor,
              fontSize: 22,
              fontFamily: '"Shippori Mincho", serif',
              fontWeight: 600,
              flex: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow:
                "inset 0 0 0 1px rgba(0, 0, 0, 0.08), inset 0 -2px 4px rgba(0, 0, 0, 0.15), 0 1px 2px rgba(26, 23, 22, 0.10)",
              letterSpacing: "0.02em",
            }}
          >
            {person.lastName?.[0] ?? "?"}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: '"Shippori Mincho", "Yu Mincho", serif',
              fontSize: 17,
              fontWeight: 600,
              color: "#1A1716",
              letterSpacing: "0.02em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: 1.25,
            }}
          >
            {fullName || "(無名)"}
          </div>
          {kana && (
            <div
              style={{
                fontSize: 11,
                color: "#6B655F",
                marginTop: 3,
                letterSpacing: "0.04em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {kana}
            </div>
          )}
          {person.birthDate && (
            <div
              style={{
                fontSize: 11,
                color: "#3F3A36",
                marginTop: 6,
                fontFamily: '"JetBrains Mono", monospace',
                letterSpacing: "0.02em",
              }}
            >
              {person.birthDate}
            </div>
          )}
          {person.deathDate && (
            <>
              <div
                style={{
                  fontSize: 11,
                  color: "#6B655F",
                  marginTop: 1,
                  fontFamily: '"JetBrains Mono", monospace',
                  letterSpacing: "0.02em",
                  whiteSpace: "nowrap",
                }}
              >
                没 {person.deathDate}
              </div>
              {(() => {
                const age = computeAge(person.birthDate, person.deathDate);
                if (age == null) return null;
                return (
                  <div
                    style={{
                      fontSize: 10,
                      color: "#6B655F",
                      marginTop: 1,
                      fontFamily: '"Shippori Mincho", serif',
                      letterSpacing: "0.04em",
                    }}
                  >
                    享年 {age}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>
      {person.deathDate && (
        <span
          style={{
            position: "absolute",
            top: 8,
            right: 10,
            fontFamily: '"Shippori Mincho", serif',
            fontSize: 10,
            color: "#A52A1F",
            letterSpacing: "0.1em",
            opacity: 0.85,
          }}
          aria-label="故人"
          title="故人"
        >
          故
        </span>
      )}
    </div>
  );
}
