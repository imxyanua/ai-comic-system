export type Env = {
  databaseUrl: string;
  redisUrl: string;
  jwtSecret: string;
  jwtTtlSeconds: number;
  internalServiceToken: string;
  minioPublicEndpoint: string;
  minioInternalEndpoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  minioBucket: string;
  inferenceWidth: number;
  inferenceHeight: number;
  inferenceSteps: number;
  corsOrigin: string;
  port: number;
  internalPort: number;
};

export const MIN_SECRET_LENGTH = 32;

const KNOWN_WEAK_SECRETS = new Set(["dev-only", "change-me", "secret", "changeme", "minioadmin"]);

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Thiếu biến môi trường ${name}`);
  }
  return value;
}

export function strongSecret(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Thiếu biến môi trường ${name}`);
  }
  if (value.length < MIN_SECRET_LENGTH || KNOWN_WEAK_SECRETS.has(value.toLowerCase())) {
    throw new Error(`${name} phải dài ít nhất ${MIN_SECRET_LENGTH} ký tự ngẫu nhiên. Chạy node scripts/init-env.mjs`);
  }
  return value;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} phải là số nguyên`);
  }
  return value;
}

export function loadEnv(): Env {
  const port = intEnv("API_PORT", 3000);
  const internalPort = intEnv("API_INTERNAL_PORT", 3001);
  if (port === internalPort) {
    throw new Error("API_INTERNAL_PORT phải khác API_PORT");
  }
  return {
    databaseUrl: required("DATABASE_URL"),
    redisUrl: required("REDIS_URL"),
    jwtSecret: strongSecret("JWT_SECRET", process.env.JWT_SECRET),
    jwtTtlSeconds: intEnv("JWT_TTL_SECONDS", 12 * 60 * 60),
    internalServiceToken: strongSecret("INTERNAL_SERVICE_TOKEN", process.env.INTERNAL_SERVICE_TOKEN),
    minioPublicEndpoint: required("MINIO_PUBLIC_ENDPOINT"),
    minioInternalEndpoint: process.env.MINIO_INTERNAL_ENDPOINT ?? required("MINIO_PUBLIC_ENDPOINT"),
    minioAccessKey: required("MINIO_ACCESS_KEY"),
    minioSecretKey: required("MINIO_SECRET_KEY"),
    minioBucket: required("MINIO_BUCKET"),
    inferenceWidth: intEnv("INFERENCE_WIDTH", 1024),
    inferenceHeight: intEnv("INFERENCE_HEIGHT", 1024),
    inferenceSteps: intEnv("INFERENCE_STEPS", 20),
    corsOrigin: required("CORS_ORIGIN"),
    port,
    internalPort,
  };
}
