import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUserId } from "../auth/current-user.decorator";
import { GeneratePanelDto } from "./generation.dto";
import { GenerationService } from "./generation.service";

@Controller("api/v1")
@UseGuards(AuthGuard)
export class GenerationController {
  constructor(private readonly generation: GenerationService) {}

  @Post("panels/:panelId/generate")
  async generate(
    @CurrentUserId() userId: string,
    @Param("panelId", ParseUUIDPipe) panelId: string,
    @Body() body: GeneratePanelDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.generation.generate(userId, panelId, body, idempotencyKey);
    response.status(result.httpStatus);
    return result.body;
  }

  @Get("jobs/:jobId")
  @HttpCode(200)
  getJob(@CurrentUserId() userId: string, @Param("jobId", ParseUUIDPipe) jobId: string) {
    return this.generation.getJob(userId, jobId);
  }

  @Post("jobs/:jobId/retry")
  async retry(
    @CurrentUserId() userId: string,
    @Param("jobId", ParseUUIDPipe) jobId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.generation.retry(userId, jobId);
    response.status(result.httpStatus);
    return result.body;
  }

  @Post("jobs/:jobId/cancel")
  @HttpCode(200)
  cancel(@CurrentUserId() userId: string, @Param("jobId", ParseUUIDPipe) jobId: string) {
    return this.generation.cancel(userId, jobId);
  }

  @Get("panels/:panelId/jobs")
  listPanelJobs(@CurrentUserId() userId: string, @Param("panelId", ParseUUIDPipe) panelId: string) {
    return this.generation.listPanelJobs(userId, panelId);
  }
}
