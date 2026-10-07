-- CreateEnum
CREATE TYPE "ComicStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('idle', 'queued', 'running', 'succeeded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('character_ref', 'panel_image', 'export');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('pending', 'ready');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('pending', 'queued', 'running', 'succeeded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "WorkflowType" AS ENUM ('batch_panel_images');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('running', 'completed', 'completed_with_errors', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comics" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "style_guide" TEXT,
    "status" "ComicStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "comics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stories" (
    "id" UUID NOT NULL,
    "comic_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "synopsis" TEXT,
    "content" TEXT,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenes" (
    "id" UUID NOT NULL,
    "story_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "title" TEXT,
    "summary" TEXT,

    CONSTRAINT "scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "panels" (
    "id" UUID NOT NULL,
    "scene_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "image_prompt" TEXT,
    "negative_prompt" TEXT,
    "image_asset_id" UUID,
    "generation_status" "GenerationStatus" NOT NULL DEFAULT 'idle',
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "panels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dialog_lines" (
    "id" UUID NOT NULL,
    "panel_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "speaker" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "dialog_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "characters" (
    "id" UUID NOT NULL,
    "comic_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reference_asset_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "comic_id" UUID NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'pending',
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_jobs" (
    "id" UUID NOT NULL,
    "panel_id" UUID NOT NULL,
    "workflow_run_id" UUID,
    "celery_task_id" TEXT,
    "status" "JobStatus" NOT NULL,
    "prompt_snapshot" JSONB NOT NULL,
    "result_asset_id" UUID NOT NULL,
    "error_code" TEXT,
    "error_message" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "idempotency_key" TEXT,
    "queued_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_runs" (
    "id" UUID NOT NULL,
    "comic_id" UUID NOT NULL,
    "type" "WorkflowType" NOT NULL,
    "status" "WorkflowStatus" NOT NULL,
    "current_step" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "error_summary" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "comics_owner_id_idx" ON "comics"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "stories_comic_id_key" ON "stories"("comic_id");

-- CreateIndex
CREATE UNIQUE INDEX "scenes_story_id_sort_order_key" ON "scenes"("story_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "panels_scene_id_sort_order_key" ON "panels"("scene_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "assets_storage_key_key" ON "assets"("storage_key");

-- CreateIndex
CREATE INDEX "generation_jobs_panel_id_status_idx" ON "generation_jobs"("panel_id", "status");

-- CreateIndex
CREATE INDEX "workflow_runs_comic_id_status_idx" ON "workflow_runs"("comic_id", "status");

-- AddForeignKey
ALTER TABLE "comics" ADD CONSTRAINT "comics_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_comic_id_fkey" FOREIGN KEY ("comic_id") REFERENCES "comics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "panels" ADD CONSTRAINT "panels_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "panels" ADD CONSTRAINT "panels_image_asset_id_fkey" FOREIGN KEY ("image_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dialog_lines" ADD CONSTRAINT "dialog_lines_panel_id_fkey" FOREIGN KEY ("panel_id") REFERENCES "panels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_comic_id_fkey" FOREIGN KEY ("comic_id") REFERENCES "comics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_reference_asset_id_fkey" FOREIGN KEY ("reference_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_comic_id_fkey" FOREIGN KEY ("comic_id") REFERENCES "comics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_panel_id_fkey" FOREIGN KEY ("panel_id") REFERENCES "panels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_workflow_run_id_fkey" FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_result_asset_id_fkey" FOREIGN KEY ("result_asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_comic_id_fkey" FOREIGN KEY ("comic_id") REFERENCES "comics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One queued or running job per panel.
CREATE UNIQUE INDEX "generation_job_one_active_per_panel"
ON "generation_jobs" ("panel_id")
WHERE "status" IN ('queued'::"JobStatus", 'running'::"JobStatus");

-- Active jobs cannot share an idempotency key. Finished jobs may keep the same key.
CREATE UNIQUE INDEX "generation_job_idempotency_active"
ON "generation_jobs" ("idempotency_key")
WHERE "idempotency_key" IS NOT NULL
  AND "status" IN ('pending'::"JobStatus", 'queued'::"JobStatus", 'running'::"JobStatus");


