export type Env = {
  databaseUrl: string;
  redisUrl: string;
  jwtSecret: string;
  internalServiceToken: string;
  minioPublicEndpoint: string;
  minioAccessKey: string;
  minioSecretKey: string;
  minioBucket: string;
  inferenceWidth: number;
  inferenceHeight: number;
  inferenceSteps: number;
  corsOrigin: string;
  port: number;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Thiếu biến môi trường ${name}`);
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
  return {
    databaseUrl: required("DATABASE_URL"),
    redisUrl: required("REDIS_URL"),
    jwtSecret: required("JWT_SECRET"),
    internalServiceToken: required("INTERNAL_SERVICE_TOKEN"),
    minioPublicEndpoint: required("MINIO_PUBLIC_ENDPOINT"),
    minioAccessKey: required("MINIO_ACCESS_KEY"),
    minioSecretKey: required("MINIO_SECRET_KEY"),
    minioBucket: required("MINIO_BUCKET"),
    inferenceWidth: intEnv("INFERENCE_WIDTH", 1024),
    inferenceHeight: intEnv("INFERENCE_HEIGHT", 1024),
    inferenceSteps: intEnv("INFERENCE_STEPS", 20),
    corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    port: intEnv("API_PORT", 3000),
  };
}
