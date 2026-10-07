import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ArrayMaxSize, ArrayUnique, IsArray, IsOptional, IsUUID } from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUserId } from "../auth/current-user.decorator";
import { WorkflowService } from "./workflow.service";

export class BatchPanelImagesDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsUUID("all", { each: true })
  scene_ids?: string[];
}

@Controller("api/v1")
@UseGuards(AuthGuard)
export class WorkflowController {
  constructor(private readonly workflows: WorkflowService) {}

  @Post("comics/:comicId/workflows/batch-panel-images")
  @HttpCode(202)
  start(
    @CurrentUserId() userId: string,
    @Param("comicId", ParseUUIDPipe) comicId: string,
    @Body() body: BatchPanelImagesDto,
  ) {
    return this.workflows.startBatch(userId, comicId, body.scene_ids);
  }

  @Get("workflows/:workflowId")
  get(@CurrentUserId() userId: string, @Param("workflowId", ParseUUIDPipe) workflowId: string) {
    return this.workflows.get(userId, workflowId);
  }

  @Post("workflows/:workflowId/cancel")
  @HttpCode(200)
  cancel(@CurrentUserId() userId: string, @Param("workflowId", ParseUUIDPipe) workflowId: string) {
    return this.workflows.cancel(userId, workflowId);
  }
}
