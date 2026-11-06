import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __piDb?: DB };

function create(): DB {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL tanımlı değil (.env.local)");
  // prepare:false → Neon/Supabase pooler ile uyumlu
  const client = postgres(url, { prepare: false, max: 5 });
  return drizzle(client, { schema });
}

export function db(): DB {
  if (!globalForDb.__piDb) globalForDb.__piDb = create();
  return globalForDb.__piDb;
}

export { schema };

// ---- küçük kv yardımcıları ----

export async function kvGet<T>(key: string): Promise<T | null> {
  const rows = await db().select().from(schema.kv).where(eq(schema.kv.key, key)).limit(1);
  return (rows[0]?.value as T) ?? null;
}

export async function kvSet(key: string, value: unknown) {
  await db()
    .insert(schema.kv)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.kv.key, set: { value, updatedAt: new Date() } });
}
