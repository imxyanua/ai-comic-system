import { Module } from "@nestjs/common";
import { AssetsController } from "./assets/assets.controller";
import { AssetsService } from "./assets/assets.service";
import { AuthRateLimitGuard } from "./auth/auth-rate-limit.guard";
import { AuthController } from "./auth/auth.controller";
import { AuthGuard } from "./auth/auth.guard";
import { AuthService } from "./auth/auth.service";
import { CharactersController } from "./comics/characters.controller";
import { CharactersService } from "./comics/characters.service";
import { ComicsController } from "./comics/comics.controller";
import { ComicsService } from "./comics/comics.service";
import { ScenesController } from "./comics/scenes.controller";
import { ScenesService } from "./comics/scenes.service";
import { loadEnv } from "./env";
import { ExportController } from "./export/export.controller";
import { ExportService } from "./export/export.service";
import { CeleryPublisher } from "./generation/celery-publisher";
import { GenerationController } from "./generation/generation.controller";
import { GenerationService } from "./generation/generation.service";
import { InternalJobsController } from "./generation/internal.controller";
import { HealthController } from "./health.controller";
import { PrismaService } from "./prisma.service";
import { StorageService } from "./storage.service";
import { APP_ENV } from "./tokens";
import { WorkflowProgressService } from "./workflow/workflow-progress.service";
import { WorkflowController } from "./workflow/workflow.controller";
import { WorkflowService } from "./workflow/workflow.service";

@Module({
  controllers: [
    HealthController,
    AuthController,
    ComicsController,
    ScenesController,
    CharactersController,
    GenerationController,
    InternalJobsController,
    AssetsController,
    WorkflowController,
    ExportController,
  ],
  providers: [
    { provide: APP_ENV, useFactory: () => loadEnv() },
    PrismaService,
    StorageService,
    AuthService,
    AuthGuard,
    AuthRateLimitGuard,
    ComicsService,
    ScenesService,
    CharactersService,
    CeleryPublisher,
    WorkflowProgressService,
    GenerationService,
    WorkflowService,
    AssetsService,
    ExportService,
  ],
})
export class AppModule {}
