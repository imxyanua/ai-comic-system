import { GetObjectCommand, HeadObjectCommand, NotFound, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Inject, Injectable } from "@nestjs/common";
import { Env } from "./env";
import { APP_ENV } from "./tokens";

const PRESIGN_SECONDS = 15 * 60;

@Injectable()
export class StorageService {
  private readonly publicClient: S3Client;
  private readonly internalClient: S3Client;
  private readonly bucket: string;

  constructor(@Inject(APP_ENV) env: Env) {
    this.bucket = env.minioBucket;
    this.publicClient = s3Client(env, env.minioPublicEndpoint);
    this.internalClient = s3Client(env, env.minioInternalEndpoint);
  }

  presignGet(key: string, downloadName?: string): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: downloadName ? `attachment; filename="${downloadName}"` : undefined,
      }),
      { expiresIn: PRESIGN_SECONDS },
    );
  }

  presignPut(key: string, contentType: string, contentLength: number): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType, ContentLength: contentLength }),
      { expiresIn: PRESIGN_SECONDS, signableHeaders: new Set(["content-type", "content-length"]) },
    );
  }

  async head(key: string): Promise<{ sizeBytes: number; contentType: string | undefined } | null> {
    try {
      const result = await this.internalClient.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: result.ContentLength ?? 0, contentType: result.ContentType };
    } catch (error) {
      if (error instanceof NotFound || (error as { name?: string }).name === "NotFound") {
        return null;
      }
      throw error;
    }
  }

  async getBytes(key: string): Promise<Buffer> {
    const result = await this.internalClient.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) {
      throw new Error(`empty object ${key}`);
    }
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.internalClient.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  get presignSeconds(): number {
    return PRESIGN_SECONDS;
  }
}

function s3Client(env: Env, endpoint: string): S3Client {
  return new S3Client({
    region: "us-east-1",
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: env.minioAccessKey, secretAccessKey: env.minioSecretKey },
  });
}
