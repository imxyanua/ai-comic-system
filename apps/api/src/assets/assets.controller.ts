import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUserId } from "../auth/current-user.decorator";
import { AssetsService } from "./assets.service";

@Controller("api/v1/assets")
@UseGuards(AuthGuard)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get(":assetId")
  get(@CurrentUserId() userId: string, @Param("assetId", ParseUUIDPipe) assetId: string) {
    return this.assets.getForUser(userId, assetId);
  }
}
