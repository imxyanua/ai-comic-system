import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUserId } from "../auth/current-user.decorator";
import { CreateComicDto, PutStoryDto, UpdateComicDto } from "./comics.dto";
import { ComicsService } from "./comics.service";

@Controller("api/v1/comics")
@UseGuards(AuthGuard)
export class ComicsController {
  constructor(private readonly comics: ComicsService) {}

  @Get()
  list(@CurrentUserId() userId: string) {
    return this.comics.listComics(userId);
  }

  @Post()
  create(@CurrentUserId() userId: string, @Body() body: CreateComicDto) {
    return this.comics.createComic(userId, {
      title: body.title,
      description: body.description,
      styleGuide: body.style_guide,
    });
  }

  @Get(":comicId")
  get(@CurrentUserId() userId: string, @Param("comicId", ParseUUIDPipe) comicId: string) {
    return this.comics.getComic(userId, comicId);
  }

  @Patch(":comicId")
  update(
    @CurrentUserId() userId: string,
    @Param("comicId", ParseUUIDPipe) comicId: string,
    @Body() body: UpdateComicDto,
  ) {
    return this.comics.updateComic(userId, comicId, {
      title: body.title,
      description: body.description,
      styleGuide: body.style_guide,
      status: body.status,
    });
  }

  @Delete(":comicId")
  archive(@CurrentUserId() userId: string, @Param("comicId", ParseUUIDPipe) comicId: string) {
    return this.comics.archiveComic(userId, comicId);
  }

  @Get(":comicId/story")
  getStory(@CurrentUserId() userId: string, @Param("comicId", ParseUUIDPipe) comicId: string) {
    return this.comics.getStory(userId, comicId);
  }

  @Put(":comicId/story")
  putStory(
    @CurrentUserId() userId: string,
    @Param("comicId", ParseUUIDPipe) comicId: string,
    @Body() body: PutStoryDto,
  ) {
    return this.comics.putStory(userId, comicId, body);
  }
}
