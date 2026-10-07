import { Module } from "@nestjs/common";
import { AssetsController } from "./assets/assets.controller";
import { AssetsService } from "./assets/assets.service";
import { AuthController } from "./auth/auth.controller";
import { AuthGuard } from "./auth/auth.guard";
import { AuthService } from "./auth/auth.service";
import { ComicsController } from "./comics/comics.controller";
import { ComicsService } from "./comics/comics.service";
import { loadEnv } from "./env";
import { CeleryPublisher } from "./generation/celery-publisher";
import { GenerationController } from "./generation/generation.controller";
import { GenerationService } from "./generation/generation.service";
import { InternalJobsController } from "./generation/internal.controller";
import { HealthController } from "./health.controller";
import { PrismaService } from "./prisma.service";
import { APP_ENV } from "./tokens";

@Module({
  controllers: [
    HealthController,
    AuthController,
    ComicsController,
    GenerationController,
    InternalJobsController,
    AssetsController,
  ],
  providers: [
    { provide: APP_ENV, useFactory: () => loadEnv() },
    PrismaService,
    AuthService,
    AuthGuard,
    ComicsService,
    CeleryPublisher,
    GenerationService,
    AssetsService,
  ],
})
export class AppModule {}
