import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { getNodesBounds, getViewportForBounds, type Node } from "@xyflow/react";

// Pixel padding around the rendered tree's bounding box. Generous so the
// outer nodes don't touch the export edge.
const PADDING = 60;
const SCALE = 2;
const FALLBACK_WIDTH = 1200;
const FALLBACK_HEIGHT = 800;

// Frame around the tree image — title bar, footer, side margins, hairline
// border. All in *output* pixels (post-scale, since we compose on a 1x
// canvas). Felt sized in proportion to a roughly A3-ish printout.
const FRAME = {
  marginH: 96,
  marginV: 56,
  headerHeight: 110,
  footerHeight: 50,
  borderInset: 24,
  // washi cream
  bg: "#FCF9F2",
  borderColor: "#D9D2C2",
  titleColor: "#1A1716",
  metaColor: "#6B655F",
  footerColor: "#A89D87",
  serif: '"Shippori Mincho", "Yu Mincho", serif',
};

const PAPER_BG = FRAME.bg;

type RenderedImage = {
  dataUrl: string;
  width: number;
  height: number;
};

async function renderTreeImage(
  flowWrapper: HTMLElement,
  nodes: Node[],
): Promise<RenderedImage> {
  const viewportEl = flowWrapper.querySelector<HTMLElement>(
    ".react-flow__viewport",
  );
  if (!viewportEl) {
    throw new Error("家系図のキャンバスが見つかりませんでした");
  }

  const bounds =
    nodes.length > 0
      ? getNodesBounds(nodes)
      : { x: 0, y: 0, width: FALLBACK_WIDTH, height: FALLBACK_HEIGHT };

  const width = Math.max(bounds.width + PADDING * 2, FALLBACK_WIDTH);
  const height = Math.max(bounds.height + PADDING * 2, FALLBACK_HEIGHT);

  const transform = getViewportForBounds(bounds, width, height, 0.5, 2, 0);

  const dataUrl = await toPng(viewportEl, {
    backgroundColor: PAPER_BG,
    width,
    height,
    pixelRatio: SCALE,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
    },
    skipFonts: true,
    imagePlaceholder:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56"><rect width="56" height="56" fill="#F0EBE0"/><text x="28" y="36" text-anchor="middle" font-family="serif" font-size="28" fill="#BFB6A6">?</text></svg>`,
      ),
    filter: (node) => {
      if (!(node instanceof HTMLElement)) return true;
      if (node.classList?.contains("react-flow__minimap")) return false;
      if (node.classList?.contains("react-flow__controls")) return false;
      if (node.classList?.contains("react-flow__attribution")) return false;
      return true;
    },
  });

  return { dataUrl, width, height };
}

const formatDateJa = (d: Date): string =>
  `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;

/**
 * Composite the tree image into a framed page: title centered at the top,
 * generation date at the right, footer attribution at the bottom, plus
 * generous margins all around.
 */
async function composeFramed(
  tree: RenderedImage,
  treeName: string,
): Promise<RenderedImage> {
  const canvasWidth = tree.width + FRAME.marginH * 2;
  const canvasHeight =
    tree.height + FRAME.headerHeight + FRAME.footerHeight + FRAME.marginV * 2;

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context が取得できませんでした");

  // background
  ctx.fillStyle = FRAME.bg;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // outer hairline border
  ctx.strokeStyle = FRAME.borderColor;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(
    FRAME.borderInset,
    FRAME.borderInset,
    canvasWidth - FRAME.borderInset * 2,
    canvasHeight - FRAME.borderInset * 2,
  );

  // title (家系図名), centered
  const titleY = FRAME.marginV + FRAME.headerHeight / 2 - 6;
  ctx.fillStyle = FRAME.titleColor;
  ctx.font = `600 48px ${FRAME.serif}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(treeName, canvasWidth / 2, titleY);

  // date, right-aligned just under the title
  ctx.fillStyle = FRAME.metaColor;
  ctx.font = `400 20px ${FRAME.serif}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(
    formatDateJa(new Date()),
    canvasWidth - FRAME.marginH,
    titleY + 38,
  );

  // hairline divider between header and tree
  ctx.strokeStyle = FRAME.borderColor;
  ctx.lineWidth = 1;
  const dividerY = FRAME.marginV + FRAME.headerHeight + 8;
  ctx.beginPath();
  ctx.moveTo(FRAME.marginH, dividerY);
  ctx.lineTo(canvasWidth - FRAME.marginH, dividerY);
  ctx.stroke();

  // tree image
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("ツリー画像の読み込みに失敗"));
    img.src = tree.dataUrl;
  });
  ctx.drawImage(
    img,
    FRAME.marginH,
    FRAME.marginV + FRAME.headerHeight + 16,
    tree.width,
    tree.height,
  );

  // footer
  ctx.fillStyle = FRAME.footerColor;
  ctx.font = `400 14px ${FRAME.serif}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    "家系図 — kakeizu",
    canvasWidth / 2,
    canvasHeight - FRAME.marginV - FRAME.footerHeight / 2,
  );

  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: canvasWidth,
    height: canvasHeight,
  };
}

function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const safeFilename = (s: string): string =>
  s.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");

export async function exportTreeAsPng(
  flowWrapper: HTMLElement,
  nodes: Node[],
  treeName: string,
): Promise<void> {
  const tree = await renderTreeImage(flowWrapper, nodes);
  const framed = await composeFramed(tree, treeName);
  const date = new Date().toISOString().slice(0, 10);
  downloadDataUrl(framed.dataUrl, `${safeFilename(treeName)}_${date}.png`);
}

export async function exportTreeAsPdf(
  flowWrapper: HTMLElement,
  nodes: Node[],
  treeName: string,
): Promise<void> {
  const tree = await renderTreeImage(flowWrapper, nodes);
  const framed = await composeFramed(tree, treeName);

  const pdf = new jsPDF({
    orientation: framed.width >= framed.height ? "landscape" : "portrait",
    unit: "px",
    format: [framed.width, framed.height],
    hotfixes: ["px_scaling"],
  });
  pdf.addImage(framed.dataUrl, "PNG", 0, 0, framed.width, framed.height);
  const date = new Date().toISOString().slice(0, 10);
  pdf.save(`${safeFilename(treeName)}_${date}.pdf`);
}
