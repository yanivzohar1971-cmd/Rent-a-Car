#!/usr/bin/env node
// AGENT-132: stdio launcher for the `rentcar-cloud-dev` Claude Code connector.
// Starts the isolated cloud read gateway in-process (Firebase emulator, demo-* project only) on an
// ephemeral loopback port with a per-process random connector token, then runs the standard MCP host
// against it, labelled DEVELOPMENT_DATA. If the emulators are not running the host still starts and
// reports the connector as unavailable (no business tools, connection.status explains why).
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createCloudGateway } from "./cloud-gateway.mjs";
import { DEV_USERS } from "./seed.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const gateway = createCloudGateway({
  projectId: process.env.RENTACAR_CLOUD_DEV_PROJECT || "demo-rentacar-agent",
  firestoreHost: process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:18080",
  authHost: process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:19099",
  email: DEV_USERS.owner.email,
  password: DEV_USERS.owner.password,
});
const port = await gateway.listen(0);

process.env.RENTACAR_EXECUTION_MODE = "FIXTURE_TEST";
process.env.RENTACAR_GATEWAY_URL = `http://127.0.0.1:${port}`;
process.env.RENTACAR_DEVICE_TOKEN = gateway.token;
process.env.RENTACAR_DATA_ENVIRONMENT = "DEVELOPMENT_DATA";
delete process.env.RENTACAR_TOKEN_FILE;

await import(pathToFileURL(path.resolve(here, "../mcp-host/src/index.mjs")).href);
