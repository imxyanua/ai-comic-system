import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUserId } from "../auth/current-user.decorator";
import { CreateComicDto, CreatePanelDto, CreateSceneDto } from "./comics.dto";
import { ComicsService } from "./comics.service";

@Controller("api/v1")
@UseGuards(AuthGuard)
export class ComicsController {
  constructor(private readonly comics: ComicsService) {}

  @Get("comics")
  list(@CurrentUserId() userId: string) {
    return this.comics.listComics(userId);
  }

  @Post("comics")
  create(@CurrentUserId() userId: string, @Body() body: CreateComicDto) {
    return this.comics.createComic(userId, {
      title: body.title,
      description: body.description,
      styleGuide: body.style_guide,
    });
  }

  @Get("comics/:comicId")
  get(@CurrentUserId() userId: string, @Param("comicId", ParseUUIDPipe) comicId: string) {
    return this.comics.getComic(userId, comicId);
  }

  @Get("comics/:comicId/scenes")
  listScenes(@CurrentUserId() userId: string, @Param("comicId", ParseUUIDPipe) comicId: string) {
    return this.comics.listScenes(userId, comicId);
  }

  @Post("comics/:comicId/scenes")
  createScene(
    @CurrentUserId() userId: string,
    @Param("comicId", ParseUUIDPipe) comicId: string,
    @Body() body: CreateSceneDto,
  ) {
    return this.comics.createScene(userId, comicId, {
      sortOrder: body.sort_order,
      title: body.title,
      summary: body.summary,
    });
  }

  @Get("scenes/:sceneId/panels")
  listPanels(@CurrentUserId() userId: string, @Param("sceneId", ParseUUIDPipe) sceneId: string) {
    return this.comics.listPanels(userId, sceneId);
  }

  @Post("scenes/:sceneId/panels")
  createPanel(
    @CurrentUserId() userId: string,
    @Param("sceneId", ParseUUIDPipe) sceneId: string,
    @Body() body: CreatePanelDto,
  ) {
    return this.comics.createPanel(userId, sceneId, {
      sortOrder: body.sort_order,
      imagePrompt: body.image_prompt,
      negativePrompt: body.negative_prompt,
    });
  }
}
