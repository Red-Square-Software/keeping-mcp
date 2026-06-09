import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";

const config = loadConfig(); // exits with non-zero code on missing/invalid config
const log = createLogger(config.KEEPING_TOKEN, config.KEEPING_LOG_LEVEL);
log.info("config loaded, server boot deferred to Phase 2");
process.exit(0);
