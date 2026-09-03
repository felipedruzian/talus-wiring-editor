import { Injectable, computed, signal } from '@angular/core';

export type RasterArtworkMimeType = 'image/png' | 'image/webp';

/** Inert, normalized raster bytes owned once and referenced by SHA-256. */
export interface RasterArtworkAsset {
  hash: string;
  mimeType: RasterArtworkMimeType;
  width: number;
  height: number;
  byteLength: number;
  dataUrl: string;
}

@Injectable({ providedIn: 'root' })
export class ArtworkAssetStore {
  private readonly assetsByHash = signal<ReadonlyMap<string, RasterArtworkAsset>>(new Map());
  readonly revision = computed(() => this.assetsByHash().size);

  replace(assets: readonly RasterArtworkAsset[]): void {
    this.assetsByHash.set(new Map(assets.map((asset) => [asset.hash, structuredClone(asset)])));
  }

  register(asset: RasterArtworkAsset): void {
    this.assetsByHash.update((current) => {
      const existing = current.get(asset.hash);
      if (existing) return current;
      const next = new Map(current);
      next.set(asset.hash, structuredClone(asset));
      return next;
    });
  }

  registerMany(assets: readonly RasterArtworkAsset[]): void {
    if (assets.length === 0) return;
    this.assetsByHash.update((current) => {
      const next = new Map(current);
      for (const asset of assets) {
        if (!next.has(asset.hash)) next.set(asset.hash, structuredClone(asset));
      }
      return next;
    });
  }

  asset(hash: string | undefined): RasterArtworkAsset | undefined {
    // Reading the signal makes callers' computed values react to registrations.
    return hash ? this.assetsByHash().get(hash) : undefined;
  }

  referenced(hashes: ReadonlySet<string>): RasterArtworkAsset[] {
    return [...hashes]
      .map((hash) => this.assetsByHash().get(hash))
      .filter((asset): asset is RasterArtworkAsset => asset !== undefined)
      .map((asset) => structuredClone(asset));
  }
}
