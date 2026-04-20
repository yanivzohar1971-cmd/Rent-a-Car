/**
 * Setup (do not commit real keys):
 *
 * Local / shell:
 *   ANTHROPIC_API_KEY=<your_anthropic_api_key>
 *   (PowerShell: $env:ANTHROPIC_API_KEY="<your_anthropic_api_key>")
 *
 * Firebase (legacy runtime config — not process.env unless you map it yourself):
 *   firebase functions:config:set anthropic.key="<your_anthropic_api_key>"
 *
 * Prefer supplying ANTHROPIC_API_KEY to the Functions runtime (e.g. functions/.env for
 * supported toolchains, Secret Manager, or CI-injected env) so process.env.ANTHROPIC_API_KEY is set.
 */

import * as functions from "firebase-functions";
import { anthropicClient } from "../services/anthropicClient";

export async function testClaudeHandler(
  _data: unknown,
  context: functions.https.CallableContext
): Promise<{ text: string }> {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  try {
    const message = await anthropicClient.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: "Reply with a single short sentence in English confirming you are working.",
        },
      ],
    });

    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("")
      .trim();

    console.log("testClaude: Claude response", text);
    return { text };
  } catch (error) {
    console.error("testClaude: request failed", error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : "Unknown error calling Claude";
    throw new functions.https.HttpsError("internal", message, error);
  }
}
