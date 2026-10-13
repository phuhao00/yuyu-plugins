/**
 * Yuyu bundle for DeepSeek Harness.
 *
 * Mounts the skills shipped in this repository and the hosted Yuyu MCP server
 * (streamable HTTP), authenticated with the agent key from the managed
 * credential store. `/yuyu-login <key>` stores the key.
 */

import { fileURLToPath } from "node:url";
import * as McpClient from "@deepseek-ai/dsh-mcp-client";
import * as SkillFilesystem from "@deepseek-ai/dsh-skill-filesystem";

const AGENT_KEY = "YUYU_AGENT_KEY";
const MCP_URL = "https://wushiyu.fun/mcp";
const SKILLS_DIR = fileURLToPath(new URL("../skills", import.meta.url));

export const name = "yuyu";
export const inject = ["skills", "credentials", "commands"];

export function apply(ctx) {
  // Own root only, so the default project and user skill roots are not scanned twice.
  ctx.plugin(SkillFilesystem, {
    providerName: "yuyu",
    includeDefaultRoots: false,
    customSkillDirs: [SKILLS_DIR],
  });

  let fiber;
  let queue = Promise.resolve();

  const remount = async () => {
    await fiber?.dispose();
    fiber = undefined;

    const key = await ctx.credentials.resolve(AGENT_KEY);
    if (!key) {
      ctx.logger.info(`yuyu: ${AGENT_KEY} is not configured - MCP server not started. Run /yuyu-login <agent-key>.`);
      return;
    }
    fiber = ctx.plugin(McpClient, {
      serverName: "yuyu",
      transport: "streamable-http",
      url: MCP_URL,
      headers: { Authorization: `Bearer ${key.value}` },
    });
  };

  // Serialized so overlapping credential events cannot leave two live clients.
  const refresh = () => {
    queue = queue.then(remount).catch((error) => {
      ctx.logger.error(`yuyu: failed to connect the MCP server: ${String(error)}`);
    });
  };

  ctx.on("credentials/updated", (ref) => {
    if (ref === AGENT_KEY) refresh();
  });
  refresh();

  // `recordInput: false` keeps the key out of the session log and model history.
  ctx.commands.register({
    name: "yuyu-login",
    description: "Store the Yuyu agent API key for the Yuyu MCP server",
    input: { hint: "<agent-key>" },
    recordInput: false,
    handler: async ({ rawInput }) => {
      const [key, ...rest] = rawInput.trim().split(/\s+/);
      if (!key || rest.length > 0 || !key.startsWith("yuyu_")) {
        return { kind: "error", text: "Usage: /yuyu-login yuyu_..." };
      }
      // A value inherited from the launching environment outranks the store,
      // so writing one would silently have no effect.
      const info = await ctx.credentials.describe(AGENT_KEY);
      if (!info.writable) {
        return {
          kind: "error",
          text: `${AGENT_KEY} is supplied by the environment dsh was launched with (source: ${info.source}). Unset it there and retry.`,
        };
      }
      await ctx.credentials.set(AGENT_KEY, key);
      return { kind: "success", text: "Yuyu agent key stored. The MCP server is connecting." };
    },
  });
}
