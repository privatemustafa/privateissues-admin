import { defineConfig } from "drizzle-kit";
import { readFileSync, existsSync } from "node:fs";

// drizzle-kit .env.local'ı kendisi okumaz
if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Vercel + Neon entegrasyonu havuzsuz adresi ayrıca verir; şema değişikliği için o daha sağlam
  dbCredentials: { url: (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL)! },
});
