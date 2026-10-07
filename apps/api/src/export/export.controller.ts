import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { IsIn, IsOptional } from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUserId } from "../auth/current-user.decorator";
import { ExportService } from "./export.service";

export class ExportDto {
  @IsOptional()
  @IsIn(["zip"])
  format?: "zip";
}

@Controller("api/v1")
@UseGuards(AuthGuard)
export class ExportController {
  constructor(private readonly exports: ExportService) {}

  @Post("comics/:comicId/export")
  @HttpCode(200)
  export(@CurrentUserId() userId: string, @Param("comicId", ParseUUIDPipe) comicId: string, @Body() _body: ExportDto) {
    return this.exports.exportZip(userId, comicId);
  }
}
