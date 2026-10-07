import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { Env } from "../env";
import { APP_ENV } from "../tokens";

export const PANEL_TASK_NAME = "panel.generate_image";
export const TASK_SCHEMA_VERSION = 1;

export type PanelTaskPayload = {
  task_schema_version: number;
  job_id: string;
  storage_key: string;
  prompt: string;
  negative_prompt: string;
  seed: number;
  width: number;
  height: number;
  steps: number;
};

@Injectable()
export class CeleryPublisher implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(@Inject(APP_ENV) env: Env) {
    this.redis = new Redis(env.redisUrl, { maxRetriesPerRequest: 2 });
  }

  async publish(taskId: string, payload: PanelTaskPayload): Promise<void> {
    const message = JSON.stringify(celeryMessage(taskId, payload));
    await this.redis.lpush("celery", message);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}

export function celeryMessage(taskId: string, payload: PanelTaskPayload): Record<string, unknown> {
  const body = Buffer.from(JSON.stringify([[], payload, { callbacks: null, errbacks: null, chain: null, chord: null }])).toString(
    "base64",
  );
  return {
    body,
    "content-encoding": "utf-8",
    "content-type": "application/json",
    headers: {
      lang: "py",
      task: PANEL_TASK_NAME,
      id: taskId,
      shadow: null,
      eta: null,
      expires: null,
      group: null,
      group_index: null,
      retries: 0,
      timelimit: [600, null],
      root_id: taskId,
      parent_id: null,
      argsrepr: "()",
      kwargsrepr: JSON.stringify(payload),
      origin: "comic-api",
      ignore_result: true,
      replaced_task_nesting: 0,
      stamped_headers: null,
      stamps: {},
    },
    properties: {
      correlation_id: taskId,
      reply_to: "",
      delivery_mode: 2,
      delivery_info: { exchange: "", routing_key: "celery" },
      priority: 0,
      body_encoding: "base64",
      delivery_tag: taskId,
    },
  };
}
