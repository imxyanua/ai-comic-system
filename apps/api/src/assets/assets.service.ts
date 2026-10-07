import { randomUUID } from "crypto";
import { Injectable } from "@nestjs/common";
import { Asset } from "@prisma/client";
import { ownedComic } from "../comics/ownership";
import { apiError } from "../http";
import { PrismaService } from "../prisma.service";
import { StorageService } from "../storage.service";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async createUpload(
    userId: string,
    comicId: string,
    input: { filename: string; mimeType: string; kind: string; sizeBytes: number },
  ) {
    const comic = await ownedComic(this.prisma, userId, comicId);
    if (input.kind !== "character_ref") {
      throw apiError(400, "VALIDATION_ERROR", "Trình duyệt chỉ được upload ảnh tham chiếu nhân vật", [
        { field: "kind", issue: "unsupported" },
      ]);
    }
    const extension = EXTENSION_BY_MIME[input.mimeType];
    if (!extension) {
      throw apiError(400, "VALIDATION_ERROR", "Chỉ nhận PNG, JPEG hoặc WebP", [{ field: "mime_type", issue: "unsupported" }]);
    }
    if (input.sizeBytes > MAX_UPLOAD_BYTES) {
      throw apiError(400, "VALIDATION_ERROR", "Ảnh vượt quá 5 MB", [{ field: "size_bytes", issue: "too_large" }]);
    }
    const assetId = randomUUID();
    const asset = await this.prisma.asset.create({
      data: {
        id: assetId,
        comicId: comic.id,
        kind: "character_ref",
        status: "pending",
        storageKey: `characters/${comic.id}/${assetId}.${extension}`,
        mimeType: input.mimeType,
        sizeBytes: BigInt(input.sizeBytes),
      },
    });
    return {
      asset_id: asset.id,
      upload_url: await this.storage.presignPut(asset.storageKey, asset.mimeType, input.sizeBytes),
      method: "PUT",
      headers: { "Content-Type": asset.mimeType },
      expires_in: this.storage.presignSeconds,
    };
  }

  async completeUpload(userId: string, assetId: string) {
    const asset = await this.ownedAsset(userId, assetId);
    if (asset.status === "ready") {
      return this.toResponse(asset);
    }
    if (asset.kind !== "character_ref") {
      throw apiError(409, "CONFLICT", "Asset này do server ghi");
    }
    const object = await this.storage.head(asset.storageKey);
    if (!object) {
      throw apiError(400, "VALIDATION_ERROR", "Chưa có file trên storage", [{ field: "asset_id", issue: "not_uploaded" }]);
    }
    if (object.sizeBytes > MAX_UPLOAD_BYTES || object.contentType !== asset.mimeType) {
      throw apiError(400, "VALIDATION_ERROR", "File không khớp kích thước hoặc định dạng đã khai báo", [
        { field: "asset_id", issue: "mismatch" },
      ]);
    }
    const ready = await this.prisma.asset.update({
      where: { id: asset.id },
      data: { status: "ready", sizeBytes: BigInt(object.sizeBytes) },
    });
    return this.toResponse(ready);
  }

  async getForUser(userId: string, assetId: string) {
    return this.toResponse(await this.ownedAsset(userId, assetId));
  }

  private async ownedAsset(userId: string, assetId: string): Promise<Asset> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, comic: { ownerId: userId } },
    });
    if (!asset) {
      throw apiError(404, "NOT_FOUND", "Không tìm thấy asset");
    }
    return asset;
  }

  private async toResponse(asset: Asset) {
    return {
      asset_id: asset.id,
      kind: asset.kind,
      status: asset.status,
      mime_type: asset.mimeType,
      size_bytes: asset.sizeBytes === null ? null : Number(asset.sizeBytes),
      download_url: asset.status === "ready" ? await this.storage.presignGet(asset.storageKey) : null,
    };
  }
}
