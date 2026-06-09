import { z } from "zod";

const ConfigSchema = z.object({
  KEEPING_TOKEN: z
    .string({ error: "KEEPING_TOKEN must not be empty" })
    .min(1, "KEEPING_TOKEN must not be empty"),
  KEEPING_REQUIRE_CONFIRM: z.stringbool().default(true),
  KEEPING_ORG_ID: z.string().optional(),
  KEEPING_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type KeepingConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(): KeepingConfig {
  const result = ConfigSchema.safeParse(process.env);
  if (!result.success) {
    const messages = result.error.issues.map((issue) => issue.message).join("; ");
    process.stderr.write(`[keeping-mcp] Configuration error: ${messages}\n`);
    process.exit(1);
  }
  return result.data;
}
