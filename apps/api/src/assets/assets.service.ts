import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Inject, Injectable } from "@nestjs/common";
import { Env } from "../env";
import { apiError } from "../http";
import { PrismaService } from "../prisma.service";
import { APP_ENV } from "../tokens";

@Injectable()
export class AssetsService {
  private readonly s3: S3Client;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_ENV) private readonly env: Env,
  ) {
    this.s3 = new S3Client({
      region: "us-east-1",
      endpoint: env.minioPublicEndpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.minioAccessKey,
        secretAccessKey: env.minioSecretKey,
      },
    });
  }

  async getForUser(userId: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, comic: { ownerId: userId } },
    });
    if (!asset) {
      throw apiError(404, "NOT_FOUND", "Không tìm thấy asset");
    }
    const downloadUrl =
      asset.status === "ready"
        ? await getSignedUrl(
            this.s3,
            new GetObjectCommand({ Bucket: this.env.minioBucket, Key: asset.storageKey }),
            { expiresIn: 3600 },
          )
        : null;
    return {
      asset_id: asset.id,
      kind: asset.kind,
      status: asset.status,
      mime_type: asset.mimeType,
      size_bytes: asset.sizeBytes === null ? null : Number(asset.sizeBytes),
      download_url: downloadUrl,
    };
  }
}
