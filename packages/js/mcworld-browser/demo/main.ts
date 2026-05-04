import { openMcworld, type WorldHandle } from '../src/index.js';
import { createViewer, type PreviewViewer } from './renderer/viewer.js';
import { buildResources } from './renderer/buildResources.js';
import { buildPreviewStructure } from './renderer/structureFromBlocks.js';

const PREVIEW_HALF_EXTENT = 25;
const PREVIEW_AXIS_LIMIT = 256;
const PREVIEW_BLOCK_LIMIT = 5_000_000;

const $file = document.getElementById('file') as HTMLInputElement;
const $dim = document.getElementById('dim') as HTMLSelectElement;
const $minX = document.getElementById('min-x') as HTMLInputElement;
const $minY = document.getElementById('min-y') as HTMLInputElement;
const $minZ = document.getElementById('min-z') as HTMLInputElement;
const $maxX = document.getElementById('max-x') as HTMLInputElement;
const $maxY = document.getElementById('max-y') as HTMLInputElement;
const $maxZ = document.getElementById('max-z') as HTMLInputElement;
const $scanInfo = document.getElementById('scan-info') as HTMLParagraphElement;
const $rangeInfo = document.getElementById('range-info') as HTMLParagraphElement;
const $convertInfo = document.getElementById('convert-info') as HTMLParagraphElement;
const $convertBtn = document.getElementById('convert') as HTMLButtonElement;
const $placeholder = document.getElementById('placeholder') as HTMLDivElement;
const $stage = document.getElementById('stage') as HTMLElement;

let handle: WorldHandle | null = null;
let lastFileName = 'world';
let viewer: PreviewViewer | null = null;
let canvas: HTMLCanvasElement | null = null;
let previewSeq = 0;
let knownBlockNames = new Set<string>();

function ensureCanvas() {
  if (canvas) return canvas;
  canvas = document.createElement('canvas');
  canvas.id = 'preview-canvas';
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none;';
  $stage.insertBefore(canvas, $placeholder);
  viewer = createViewer(canvas);
  return canvas;
}

$file.addEventListener('change', async () => {
  const f = $file.files?.[0];
  if (!f) return;
  lastFileName = f.name.replace(/\.mcworld$/i, '');
  $scanInfo.textContent = `${f.name} を読込中…`;
  try {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const t0 = performance.now();
    handle = openMcworld(bytes);
    const t1 = performance.now();
    knownBlockNames = new Set();
    onWorldOpened(t1 - t0);
  } catch (err) {
    $scanInfo.innerHTML = `<span class="warn">読込失敗: ${escapeHtml(String((err as Error).message))}</span>`;
    handle = null;
    $convertBtn.disabled = true;
  }
});

function onWorldOpened(scanMs: number) {
  if (!handle) return;
  const lines: string[] = [];
  lines.push(`scan: ${scanMs.toFixed(0)} ms`);
  for (const [dim, ds] of handle.scan.dimensions) {
    if (!ds.bbox) continue;
    const { minCX, maxCX, minCZ, maxCZ, minSY, maxSY } = ds.bbox;
    lines.push(
      `dim ${dim}: ${ds.chunks.size} chunks, ` +
      `X[${minCX * 16}..${maxCX * 16 + 15}] ` +
      `Z[${minCZ * 16}..${maxCZ * 16 + 15}] ` +
      `Y[${minSY * 16}..${maxSY * 16 + 15}]`,
    );
  }
  if (lines.length === 1) lines.push('(チャンクが見つかりません)');
  $scanInfo.textContent = lines.join('\n');
  pickInitialRange();
  refreshRangeInfo();
  $convertBtn.disabled = false;
  void rebuildPreview();
}

function pickInitialRange() {
  if (!handle) return;
  const dim = parseInt($dim.value, 10);
  const ds = handle.scan.dimensions.get(dim);
  let centerX = 0, centerZ = 0;
  if (ds && ds.bbox) {
    centerX = Math.round(((ds.bbox.minCX + ds.bbox.maxCX) / 2) * 16 + 8);
    centerZ = Math.round(((ds.bbox.minCZ + ds.bbox.maxCZ) / 2) * 16 + 8);
  }
  const probe = handle.readBlocks({
    minX: centerX - PREVIEW_HALF_EXTENT,
    maxX: centerX + PREVIEW_HALF_EXTENT,
    minY: -64, maxY: 320,
    minZ: centerZ - PREVIEW_HALF_EXTENT,
    maxZ: centerZ + PREVIEW_HALF_EXTENT,
    dimension: dim,
  });
  let minY = -2, maxY = 2;
  if (probe.bounds) {
    minY = probe.bounds.minY - 2;
    maxY = probe.bounds.maxY + 2;
  }
  $minX.value = String(centerX - PREVIEW_HALF_EXTENT);
  $maxX.value = String(centerX + PREVIEW_HALF_EXTENT);
  $minY.value = String(minY);
  $maxY.value = String(maxY);
  $minZ.value = String(centerZ - PREVIEW_HALF_EXTENT);
  $maxZ.value = String(centerZ + PREVIEW_HALF_EXTENT);
}

function refreshRangeInfo() {
  const sx = num($maxX) - num($minX) + 1;
  const sy = num($maxY) - num($minY) + 1;
  const sz = num($maxZ) - num($minZ) + 1;
  const total = sx * sy * sz;
  const overAxis = Math.max(sx, sy, sz) > PREVIEW_AXIS_LIMIT;
  const overBlocks = total > PREVIEW_BLOCK_LIMIT;
  const previewable = !overAxis && !overBlocks;
  let msg = `範囲サイズ: ${sx}×${sy}×${sz} (${total.toLocaleString()} cells)`;
  if (!previewable) {
    msg += `\n範囲が大きすぎるため 3D プレビューは無効です。変換は可能です。`;
  }
  $rangeInfo.textContent = msg;
  return previewable;
}

let rebuildTimer: number | null = null;
function scheduleRebuild() {
  if (rebuildTimer !== null) clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => { rebuildTimer = null; void rebuildPreview(); }, 250) as unknown as number;
}

async function rebuildPreview(): Promise<void> {
  if (!handle) return;
  const previewable = refreshRangeInfo();
  if (!previewable) {
    $placeholder.style.display = 'grid';
    $placeholder.classList.add('warn');
    $placeholder.textContent = '範囲が大きいためプレビュー無効 (変換は可能)';
    if (canvas) canvas.style.display = 'none';
    return;
  }
  const seq = ++previewSeq;
  ensureCanvas();
  $placeholder.style.display = 'grid';
  $placeholder.classList.remove('warn');
  $placeholder.textContent = 'プレビューを生成中…';
  if (canvas) canvas.style.display = 'block';
  let preview: ReturnType<typeof buildPreviewStructure>;
  try {
    preview = buildPreviewStructure(handle, {
      minX: num($minX), maxX: num($maxX),
      minY: num($minY), maxY: num($maxY),
      minZ: num($minZ), maxZ: num($maxZ),
      dimension: parseInt($dim.value, 10),
    });
  } catch (err) {
    if (seq !== previewSeq) return;
    $placeholder.textContent = `プレビュー失敗: ${(err as Error).message}`;
    return;
  }
  if (seq !== previewSeq) return;
  if (!preview) {
    $placeholder.textContent = '範囲内にブロックがありません';
    return;
  }
  for (const n of preview.blockNames) knownBlockNames.add(n);
  $placeholder.textContent = `テクスチャ取得中… (${[...knownBlockNames].length} ブロック種)`;
  let resources;
  try {
    resources = await buildResources([...knownBlockNames]);
  } catch (err) {
    if (seq !== previewSeq) return;
    $placeholder.textContent = `テクスチャ取得失敗: ${(err as Error).message}`;
    return;
  }
  if (seq !== previewSeq) return;
  viewer?.setStructure(preview.structure, resources);
  $placeholder.style.display = 'none';
}

for (const el of [$minX, $minY, $minZ, $maxX, $maxY, $maxZ]) {
  el.addEventListener('input', () => { refreshRangeInfo(); scheduleRebuild(); });
}
$dim.addEventListener('change', () => {
  if (!handle) return;
  knownBlockNames = new Set();
  pickInitialRange();
  void rebuildPreview();
});

$convertBtn.addEventListener('click', () => {
  if (!handle) return;
  $convertInfo.textContent = '変換中…';
  try {
    const t0 = performance.now();
    const result = handle.convertRange({
      minX: num($minX), maxX: num($maxX),
      minY: num($minY), maxY: num($maxY),
      minZ: num($minZ), maxZ: num($maxZ),
      dimension: parseInt($dim.value, 10),
    });
    const t1 = performance.now();
    const blob = new Blob([result.nbt], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${lastFileName}.nbt`;
    a.click();
    URL.revokeObjectURL(url);
    $convertInfo.textContent =
      `変換完了 (${(t1 - t0).toFixed(0)} ms): ` +
      `size ${result.size.join('×')}, ${result.blockCount.toLocaleString()} blocks, ` +
      `palette ${result.paletteCount}`;
  } catch (err) {
    $convertInfo.innerHTML = `<span class="warn">変換失敗: ${escapeHtml(String((err as Error).message))}</span>`;
  }
});

function num(el: HTMLInputElement): number {
  const v = parseInt(el.value, 10);
  return Number.isFinite(v) ? v : 0;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
