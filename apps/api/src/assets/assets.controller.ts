import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { IsIn, IsInt, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUserId } from "../auth/current-user.decorator";
import { AssetsService, MAX_UPLOAD_BYTES } from "./assets.service";

export class UploadUrlDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  filename!: string;

  @IsString()
  mime_type!: string;

  @IsIn(["character_ref", "panel_image", "export"])
  kind!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES * 10)
  size_bytes!: number;
}

@Controller("api/v1")
@UseGuards(AuthGuard)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Post("comics/:comicId/assets/upload-url")
  createUpload(
    @CurrentUserId() userId: string,
    @Param("comicId", ParseUUIDPipe) comicId: string,
    @Body() body: UploadUrlDto,
  ) {
    return this.assets.createUpload(userId, comicId, {
      filename: body.filename,
      mimeType: body.mime_type,
      kind: body.kind,
      sizeBytes: body.size_bytes,
    });
  }

  @Post("assets/:assetId/complete")
  @HttpCode(200)
  complete(@CurrentUserId() userId: string, @Param("assetId", ParseUUIDPipe) assetId: string) {
    return this.assets.completeUpload(userId, assetId);
  }

  @Get("assets/:assetId")
  get(@CurrentUserId() userId: string, @Param("assetId", ParseUUIDPipe) assetId: string) {
    return this.assets.getForUser(userId, assetId);
  }
}
