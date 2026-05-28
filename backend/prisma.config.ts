import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // The Prisma CLI (migrations) requires a direct connection to Supabase (Port 5432).
    // The actual application uses DATABASE_URL (Port 6543) via the custom pg adapter in src/lib/prisma.ts
    url: env("DIRECT_URL"),
  },
});