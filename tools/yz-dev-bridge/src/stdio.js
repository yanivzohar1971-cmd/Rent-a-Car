import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createBridgeServer } from './server.js';

console.error('YZ Dev Bridge MCP running on stdio');
void serveStdio(createBridgeServer);
