// Create .env from .env.example with fresh random secrets. Refuses to overwrite unless --force.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, ".env");
const SECRETS = ["POSTGRES_PASSWORD", "MINIO_ROOT_PASSWORD", "JWT_SECRET", "INTERNAL_SERVICE_TOKEN"];

if (existsSync(target) && !process.argv.includes("--force")) {
  console.error(".env đã tồn tại. Dùng --force để tạo lại (secret cũ sẽ mất, có thể cần docker compose down -v).");
  process.exit(1);
}

const lines = readFileSync(join(root, ".env.example"), "utf8").split(/\r?\n/);
const output = lines.map((line) => {
  const key = line.split("=", 1)[0];
  return SECRETS.includes(key) ? `${key}=${randomBytes(32).toString("hex")}` : line;
});
writeFileSync(target, output.join("\n"), { mode: 0o600 });
console.log(`Đã tạo ${target} với secret ngẫu nhiên cho ${SECRETS.join(", ")}`);
