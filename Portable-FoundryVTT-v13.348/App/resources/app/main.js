#!/usr/bin/env node

/**
 * Bootstrap the Node.js loader to support ESM imports
 * Required until https://github.com/electron/electron/issues/21457#issuecomment-815770296 is resolved
 * @returns {Promise<void>}
 */
(async function() {
  await import("./main.mjs");
})();
