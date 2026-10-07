import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUserId } from "../auth/current-user.decorator";
import { CreatePanelDto, CreateSceneDto, PanelOrderDto, UpdatePanelDto, UpdateSceneDto } from "./comics.dto";
import { ScenesService } from "./scenes.service";

@Controller("api/v1")
@UseGuards(AuthGuard)
export class ScenesController {
  constructor(private readonly scenes: ScenesService) {}

  @Get("comics/:comicId/scenes")
  listScenes(@CurrentUserId() userId: string, @Param("comicId", ParseUUIDPipe) comicId: string) {
    return this.scenes.listScenes(userId, comicId);
  }

  @Post("comics/:comicId/scenes")
  createScene(
    @CurrentUserId() userId: string,
    @Param("comicId", ParseUUIDPipe) comicId: string,
    @Body() body: CreateSceneDto,
  ) {
    return this.scenes.createScene(userId, comicId, {
      sortOrder: body.sort_order,
      title: body.title,
      summary: body.summary,
    });
  }

  @Patch("scenes/:sceneId")
  updateScene(
    @CurrentUserId() userId: string,
    @Param("sceneId", ParseUUIDPipe) sceneId: string,
    @Body() body: UpdateSceneDto,
  ) {
    return this.scenes.updateScene(userId, sceneId, {
      sortOrder: body.sort_order,
      title: body.title,
      summary: body.summary,
    });
  }

  @Delete("scenes/:sceneId")
  @HttpCode(204)
  deleteScene(@CurrentUserId() userId: string, @Param("sceneId", ParseUUIDPipe) sceneId: string) {
    return this.scenes.deleteScene(userId, sceneId);
  }

  @Get("scenes/:sceneId/panels")
  listPanels(@CurrentUserId() userId: string, @Param("sceneId", ParseUUIDPipe) sceneId: string) {
    return this.scenes.listPanels(userId, sceneId);
  }

  @Post("scenes/:sceneId/panels")
  createPanel(
    @CurrentUserId() userId: string,
    @Param("sceneId", ParseUUIDPipe) sceneId: string,
    @Body() body: CreatePanelDto,
  ) {
    return this.scenes.createPanel(userId, sceneId, {
      sortOrder: body.sort_order,
      imagePrompt: body.image_prompt,
      negativePrompt: body.negative_prompt,
      dialog: body.dialog,
    });
  }

  @Put("scenes/:sceneId/panel-order")
  reorderPanels(
    @CurrentUserId() userId: string,
    @Param("sceneId", ParseUUIDPipe) sceneId: string,
    @Body() body: PanelOrderDto,
  ) {
    return this.scenes.reorderPanels(userId, sceneId, body.panel_ids);
  }

  @Patch("panels/:panelId")
  updatePanel(
    @CurrentUserId() userId: string,
    @Param("panelId", ParseUUIDPipe) panelId: string,
    @Body() body: UpdatePanelDto,
  ) {
    return this.scenes.updatePanel(userId, panelId, {
      imagePrompt: body.image_prompt,
      negativePrompt: body.negative_prompt,
      dialog: body.dialog,
    });
  }

  @Delete("panels/:panelId")
  @HttpCode(204)
  deletePanel(@CurrentUserId() userId: string, @Param("panelId", ParseUUIDPipe) panelId: string) {
    return this.scenes.deletePanel(userId, panelId);
  }
}
