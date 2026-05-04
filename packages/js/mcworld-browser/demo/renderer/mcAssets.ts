const MC_VERSION = '1.21.4'

// blockstates・models は PrismarineJS の一括 JSON（2 リクエストで全量取得）
const PRISMARINE_BASE = `https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/${MC_VERSION}`

// テクスチャは misode/mcmeta（Java Edition モデルの参照パスと完全一致）
export const MCMETA_BASE = 'https://raw.githubusercontent.com/misode/mcmeta/assets/assets/minecraft'

// 一括 JSON キャッシュ（ページ内で複数の構造体をロードする場合も再取得しない）
let blockStatesCache: Record<string, unknown> | null = null
let blockModelsCache: Record<string, unknown> | null = null

export async function getBlockStates(): Promise<Record<string, unknown>> {
  if (!blockStatesCache) {
    const res = await fetch(`${PRISMARINE_BASE}/blocks_states.json`)
    if (!res.ok) throw new Error(`Failed to fetch blocks_states.json: ${res.status}`)
    blockStatesCache = await res.json() as Record<string, unknown>
  }
  return blockStatesCache
}

export async function getBlockModels(): Promise<Record<string, unknown>> {
  if (!blockModelsCache) {
    const res = await fetch(`${PRISMARINE_BASE}/blocks_models.json`)
    if (!res.ok) throw new Error(`Failed to fetch blocks_models.json: ${res.status}`)
    blockModelsCache = await res.json() as Record<string, unknown>
  }
  return blockModelsCache
}

/**
 * アニメーションテクスチャ（縦長 PNG）を先頭フレームだけに切り出す。
 * TextureAtlas.fromBlobs 内でも 16×16 クロップは行われるが、
 * Blob サイズを事前に削減しておくことで atlas 構築を高速化する。
 */
async function cropFirstFrame(blob: Blob): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      URL.revokeObjectURL(url)
      if (img.height > img.width) {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.width
        canvas.getContext('2d')!.drawImage(img, 0, 0)
        canvas.toBlob((b) => resolve(b ?? blob), 'image/png')
      } else {
        resolve(blob)
      }
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(blob) }
    img.src = url
  })
}

/**
 * テクスチャパスから Blob を取得する。
 * 1. mcmeta を優先（Java Edition アセットと完全一致）
 * 2. block/ テクスチャは PrismarineJS にフォールバック
 * 取得できなかった場合は null を返す。
 */
export async function fetchTexture(path: string): Promise<Blob | null> {
  const mcmetaRes = await fetch(`${MCMETA_BASE}/textures/${path}.png`)
  if (mcmetaRes.ok) {
    return cropFirstFrame(await mcmetaRes.blob())
  }

  // entity/ テクスチャは mcmeta にしか存在しないためフォールバック不要
  if (path.startsWith('block/')) {
    const name = path.replace(/^block\//, '')
    const fallbackRes = await fetch(`${PRISMARINE_BASE}/blocks/${name}.png`)
    if (fallbackRes.ok) {
      return cropFirstFrame(await fallbackRes.blob())
    }
  }

  return null
}
