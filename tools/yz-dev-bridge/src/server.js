import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { BridgeStore } from './store.js';
import { E2eDebugStore } from './e2eDebug.js';
import { parseJsonBomSafe } from './jsonBom.js';

const prioritySchema = z.enum(['low', 'normal', 'high', 'critical']);
const statusSchema = z.enum(['READY', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'FAILED', 'CANCELLED']);

function textResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  };
}

function errorResult(error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

function parseResultJson(result) {
  const text = result?.content?.[0]?.text;
  if (!text) return null;
  try {
    return parseJsonBomSafe(text, { source: 'mcp-tool-result' });
  } catch {
    return null;
  }
}

export function createBridgeServer() {
  const store = new BridgeStore();
  const debug = new E2eDebugStore({ dataFile: store.filePath });
  const server = new McpServer({ name: 'yz-dev-bridge', version: '1.0.0' });

  function registerBridgeTool(name, config, handler) {
    server.registerTool(name, config, async (input = {}) => {
      const startedAt = new Date().toISOString();
      await debug.noteMcpToolStarted({ toolName: name, input }).catch(() => undefined);
      try {
        const result = await handler(input);
        await debug.noteMcpToolCompleted({ toolName: name, input, startedAt, success: !result?.isError }).catch(() => undefined);
        const payload = parseResultJson(result);
        if (payload && payload.id && payload.metadata?.githubIssueNumber) {
          await debug.noteTaskSnapshot(payload).catch(() => undefined);
        }
        return result;
      } catch (error) {
        await debug.noteMcpToolCompleted({ toolName: name, input, startedAt, success: false, error }).catch(() => undefined);
        return errorResult(error);
      }
    });
  }

  registerBridgeTool(
    'bridge_status',
    { description: 'Return YZ Dev Bridge health and task statistics.' },
    async () => {
      try { return textResult(await store.status()); } catch (error) { return errorResult(error); }
    },
  );

  registerBridgeTool(
    'bridge_create_task',
    {
      description: 'Create a development task for Cursor or another coding agent. Use this to hand work from ChatGPT to Cursor.',
      inputSchema: z.object({
        project: z.string().min(1),
        projectId: z.string().min(1).optional(),
        title: z.string().min(1),
        instructions: z.string().min(1),
        priority: prioritySchema.optional().default('normal'),
        createdBy: z.string().optional().default('chatgpt'),
        metadata: z.record(z.string(), z.unknown()).optional().default({}),
      }),
    },
    async (input) => {
      try { return textResult(await store.createTask(input)); } catch (error) { return errorResult(error); }
    },
  );

  registerBridgeTool(
    'bridge_list_tasks',
    {
      description: 'List bridge tasks, optionally filtered by project and status.',
      inputSchema: z.object({
        project: z.string().optional(),
        status: statusSchema.optional(),
        limit: z.number().int().min(1).max(200).optional().default(50),
      }),
    },
    async (input) => {
      try { return textResult(await store.listTasks(input)); } catch (error) { return errorResult(error); }
    },
  );

  registerBridgeTool(
    'bridge_get_task',
    {
      description: 'Get the full details and latest result of one bridge task.',
      inputSchema: z.object({ id: z.string().min(1) }),
    },
    async ({ id }) => {
      try {
        const task = await store.getTask(id);
        return task ? textResult(task) : errorResult(new Error(`Task not found: ${id}`));
      } catch (error) { return errorResult(error); }
    },
  );

  registerBridgeTool(
    'bridge_claim_task',
    {
      description: 'Claim a READY/BLOCKED bridge task before starting work. Cursor should call this before modifying code.',
      inputSchema: z.object({
        id: z.string().min(1),
        actor: z.string().optional().default('cursor'),
      }),
    },
    async (input) => {
      try { return textResult(await store.claimTask(input)); } catch (error) { return errorResult(error); }
    },
  );

  registerBridgeTool(
    'bridge_claim_next_task',
    {
      description: 'Atomically claim the highest-priority READY task, optionally restricted to one project. Preferred for Cursor autonomous task pickup.',
      inputSchema: z.object({
        project: z.string().optional(),
        actor: z.string().optional().default('cursor'),
      }),
    },
    async (input) => {
      try { return textResult(await store.claimNextTask(input)); } catch (error) { return errorResult(error); }
    },
  );

  registerBridgeTool(
    'bridge_update_task',
    {
      description: 'Update task progress or publish the coding result back to the bridge. Cursor should call this after analysis, tests, or implementation. Use COMPLETED only after successful verification; use FAILED when verification or implementation itself failed.',
      inputSchema: z.object({
        id: z.string().min(1),
        status: statusSchema.optional(),
        actor: z.string().optional().default('cursor'),
        summary: z.string().optional(),
        changedFiles: z.array(z.string()).optional(),
        tests: z.array(z.string()).optional(),
        note: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    },
    async (input) => {
      try { return textResult(await store.updateTask(input)); } catch (error) { return errorResult(error); }
    },
  );

  registerBridgeTool(
    'bridge_put_context',
    {
      description: 'Store durable project context such as business rules, repository paths, current diagnostics, or constraints shared between ChatGPT and Cursor.',
      inputSchema: z.object({
        project: z.string().min(1),
        key: z.string().min(1),
        value: z.unknown(),
        actor: z.string().optional().default('chatgpt'),
      }),
    },
    async (input) => {
      try { return textResult(await store.putContext(input)); } catch (error) { return errorResult(error); }
    },
  );

  registerBridgeTool(
    'bridge_get_context',
    {
      description: 'Read one project context key, or all context keys when key is omitted.',
      inputSchema: z.object({
        project: z.string().min(1),
        key: z.string().optional(),
      }),
    },
    async (input) => {
      try { return textResult(await store.getContext(input)); } catch (error) { return errorResult(error); }
    },
  );

  registerBridgeTool(
    'bridge_list_projects',
    { description: 'List trusted Project Registry entries with task/context counts.' },
    async () => {
      try { return textResult(await store.listProjects()); } catch (error) { return errorResult(error); }
    },
  );

  return server;
}
