import { useEffect, useState } from "react";
import { Client } from "./api";
import { Asset } from "./types";

const PRESIGN_REUSE_MS = 10 * 60 * 1000;
const cache = new Map<string, { url: string; fetchedAt: number }>();

export function useAssetUrl(http: Client, assetId: string | null): string | null {
  const cached = assetId ? cache.get(assetId) : undefined;
  const [url, setUrl] = useState<string | null>(cached?.url ?? null);

  useEffect(() => {
    if (!assetId) {
      setUrl(null);
      return;
    }
    const hit = cache.get(assetId);
    if (hit && Date.now() - hit.fetchedAt < PRESIGN_REUSE_MS) {
      setUrl(hit.url);
      return;
    }
    let active = true;
    http
      .get<Asset>(`/assets/${assetId}`)
      .then((asset) => {
        if (asset.download_url) {
          cache.set(assetId, { url: asset.download_url, fetchedAt: Date.now() });
        }
        if (active) {
          setUrl(asset.download_url);
        }
      })
      .catch(() => {
        if (active) {
          setUrl(null);
        }
      });
    return () => {
      active = false;
    };
  }, [http, assetId]);

  return url;
}
