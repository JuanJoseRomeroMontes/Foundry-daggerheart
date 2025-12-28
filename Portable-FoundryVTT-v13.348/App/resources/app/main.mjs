#!/usr/bin/env node

// Require Node.js Version
const main = fileURLToPath(import.meta.url);
const root = path.dirname(main);
const pkg = JSON.parse(fs.readFileSync(`${root}/package.json`, "utf8"));
const startupMessages = [];
const nodeVer = process.versions.node;
startupMessages.push({level: "info", message: `Running on Node.js - Version ${nodeVer}`});
if ( nodeVer.split(".").shift() < pkg.release.node_version ) {
  console.error(`You are using Node.js version ${nodeVer}. Foundry Virtual Tabletop requires Node.js version`
    + ` ${pkg.release.node_version} or greater.`);
  process.exit(1);
}

// Import Initial Modules
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Bootstrap Foundry Commons
import "./common/primitives/_module.mjs";
import "./common/server.mjs";

/**
 * Invoke application initialization workflow
 * @returns {Promise<void>}
 */
(async function() {
  const isDebug = process.argv.includes("--debug") && fs.existsSync("./server");
  const init = await import(isDebug ? "./server/init.mjs" : "./dist/init.mjs");
  init.default({
    args: process.argv,
    root: root,
    messages: startupMessages,
    debug: isDebug
  });
})();
