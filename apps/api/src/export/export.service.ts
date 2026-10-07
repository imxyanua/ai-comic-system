import { randomUUID } from "crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ownedComic } from "../comics/ownership";
import { apiError } from "../http";
import { PrismaService } from "../prisma.service";
import { StorageService } from "../storage.service";
import { buildZip } from "./zip";

export const MAX_EXPORT_PANELS = 30;

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async exportZip(userId: string, comicId: string) {
    const comic = await ownedComic(this.prisma, userId, comicId);
    const scenes = await this.prisma.scene.findMany({
      where: { story: { comicId: comic.id } },
      orderBy: { sortOrder: "asc" },
      include: {
        panels: {
          orderBy: { sortOrder: "asc" },
          include: { imageAsset: true },
        },
      },
    });

    const files: { name: string; storageKey: string }[] = [];
    scenes.forEach((scene, sceneIndex) => {
      scene.panels.forEach((panel, panelIndex) => {
        if (panel.imageAsset?.status === "ready") {
          files.push({
            name: `${pad(sceneIndex + 1)}-${pad(panelIndex + 1)}.png`,
            storageKey: panel.imageAsset.storageKey,
          });
        }
      });
    });
    if (files.length === 0) {
      throw apiError(400, "VALIDATION_ERROR", "Chưa có panel nào có ảnh để export");
    }
    if (files.length > MAX_EXPORT_PANELS) {
      throw apiError(400, "VALIDATION_ERROR", `Export tối đa ${MAX_EXPORT_PANELS} ảnh`);
    }

    const entries = [];
    for (const file of files) {
      entries.push({ name: file.name, data: await this.storage.getBytes(file.storageKey) });
    }
    const zip = buildZip(entries);
    const assetId = randomUUID();
    const storageKey = `exports/${comic.id}/${assetId}.zip`;
    await this.storage.put(storageKey, zip, "application/zip");
    await this.prisma.asset.create({
      data: {
        id: assetId,
        comicId: comic.id,
        kind: "export",
        status: "ready",
        storageKey,
        mimeType: "application/zip",
        sizeBytes: BigInt(zip.length),
      },
    });
    this.logger.log(`export ready comic_id=${comic.id} asset_id=${assetId} files=${files.length}`);
    return {
      asset_id: assetId,
      download_url: await this.storage.presignGet(storageKey),
      files: files.map((file) => file.name),
    };
  }
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
