import { timingSafeEqual } from "crypto";
import { Body, Controller, Headers, Inject, Param, ParseUUIDPipe, Patch } from "@nestjs/common";
import { Env } from "../env";
import { apiError } from "../http";
import { APP_ENV } from "../tokens";
import { JobCallbackDto } from "./generation.dto";
import { GenerationService } from "./generation.service";

@Controller("internal/v1")
export class InternalJobsController {
  constructor(
    private readonly generation: GenerationService,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  @Patch("jobs/:jobId")
  async update(
    @Param("jobId", ParseUUIDPipe) jobId: string,
    @Headers("x-service-token") token: string | undefined,
    @Body() body: JobCallbackDto,
  ): Promise<{ ok: true }> {
    this.assertServiceToken(token);
    await this.generation.applyCallback(jobId, {
      status: body.status,
      sizeBytes: body.size_bytes,
      errorCode: body.error_code,
      errorMessage: body.error_message,
    });
    return { ok: true };
  }

  private assertServiceToken(token: string | undefined): void {
    const expected = Buffer.from(this.env.internalServiceToken);
    const received = Buffer.from(token ?? "");
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw apiError(401, "UNAUTHORIZED", "Sai service token");
    }
  }
}
