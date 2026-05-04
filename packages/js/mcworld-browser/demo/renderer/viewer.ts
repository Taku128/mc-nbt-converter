import { mat4 } from 'gl-matrix';
import { Structure, StructureRenderer, type Resources } from 'deepslate/render';

interface OrbitCamera {
  rotX: number;
  rotY: number;
  distance: number;
  panX: number;
  panZ: number;
}

export interface PreviewViewer {
  setStructure(structure: Structure, resources: Resources): void;
  setSelectionBox(min: [number, number, number] | null, max: [number, number, number] | null, origin: [number, number, number]): void;
  destroy(): void;
}

export function createViewer(canvas: HTMLCanvasElement): PreviewViewer {
  const gl = canvas.getContext('webgl');
  if (!gl) throw new Error('WebGL not supported');

  const camera: OrbitCamera = { rotX: 30, rotY: 45, distance: 64, panX: 0, panZ: 0 };
  let renderer: StructureRenderer | null = null;
  let structure: Structure | null = null;
  let selectionMin: [number, number, number] | null = null;
  let selectionMax: [number, number, number] | null = null;
  let structureOrigin: [number, number, number] = [0, 0, 0];
  let rafId = 0;

  function setRendererTextureFiltering() {
    if (!renderer) return;
    const internal = renderer as unknown as { atlasTexture: WebGLTexture | null };
    if (internal.atlasTexture) {
      gl!.bindTexture(gl!.TEXTURE_2D, internal.atlasTexture);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.NEAREST);
      gl!.bindTexture(gl!.TEXTURE_2D, null);
    }
  }

  function draw() {
    rafId = requestAnimationFrame(draw);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      renderer?.setViewport(0, 0, w, h);
    }
    gl!.clearColor(0.08, 0.08, 0.10, 1);
    gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);
    if (!renderer || !structure) return;
    const s = structure.getSize();
    const vm = mat4.create();
    mat4.translate(vm, vm, [0, 0, -camera.distance]);
    mat4.rotateX(vm, vm, (camera.rotX * Math.PI) / 180);
    mat4.rotateY(vm, vm, (camera.rotY * Math.PI) / 180);
    mat4.translate(vm, vm, [-s[0] / 2 - camera.panX, -s[1] / 2, -s[2] / 2 - camera.panZ]);
    renderer.drawStructure(vm);
    renderer.drawGrid(vm);
  }
  rafId = requestAnimationFrame(draw);

  let dragging = false;
  let lastX = 0, lastY = 0;
  let panMode = false;
  canvas.addEventListener('mousedown', (e) => {
    dragging = true;
    panMode = e.button === 2 || e.shiftKey;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  canvas.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    if (panMode) {
      camera.panX -= dx * camera.distance / 400;
      camera.panZ -= dy * camera.distance / 400;
    } else {
      camera.rotY += dx * 0.5;
      camera.rotX += dy * 0.5;
    }
  });
  window.addEventListener('mouseup', () => { dragging = false; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    camera.distance = Math.max(2, Math.min(2000, camera.distance * factor));
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    setStructure(s: Structure, resources: Resources) {
      structure = s;
      renderer = new StructureRenderer(gl!, s, resources);
      setRendererTextureFiltering();
      const size = s.getSize();
      camera.distance = Math.max(size[0], size[1], size[2]) * 1.5;
    },
    setSelectionBox(min, max, origin) {
      selectionMin = min;
      selectionMax = max;
      structureOrigin = origin;
      void selectionMin; void selectionMax; void structureOrigin;
    },
    destroy() {
      cancelAnimationFrame(rafId);
      renderer = null;
      structure = null;
    },
  };
}
