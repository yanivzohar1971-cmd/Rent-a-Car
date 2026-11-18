#!/usr/bin/env node
// stdio entry point (see stdio.mjs). Logs go to stderr only; stdout is the protocol channel.
import { runStdioHost } from "./stdio.mjs";

await runStdioHost();
