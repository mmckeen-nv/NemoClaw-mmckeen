// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Handler for the /nemoclaw slash command (chat interface).
 *
 * Supports subcommands:
 *   /nemoclaw status   - show sandbox/blueprint/inference state
 *   /nemoclaw eject    - rollback to host installation
 *   /nemoclaw          - show help
 */

import type {
  PluginCommandContext,
  PluginCommandResult,
  OpenClawPluginApi,
  PluginLogger,
} from "../index.js";
import { loadState } from "../blueprint/state.js";
import {
  describeOnboardEndpoint,
  describeOnboardProvider,
  getConfiguredModelCatalog,
  getLocalModelWorkflow,
  getSavedLocalModelWorkflow,
  isLocalEndpointType,
  loadOnboardConfig,
  type NemoClawOnboardConfig,
} from "../onboard/config.js";
import { getInferenceStatus } from "./onboard-status.js";
import { cliSetLocalModel } from "./set-local-model.js";

export async function handleSlashCommand(
  ctx: PluginCommandContext,
  _api: OpenClawPluginApi,
): Promise<PluginCommandResult> {
  const subcommand = ctx.args?.trim().split(/\s+/)[0] ?? "";

  switch (subcommand) {
    case "status":
      return await slashStatus();
    case "eject":
      return slashEject();
    case "onboard":
      return await slashOnboard();
    case "set-local-model":
      return slashSetLocalModel(ctx.args ?? "");
    default:
      return slashHelp();
  }
}

function slashHelp(): PluginCommandResult {
  return {
    text: [
      "**NemoClaw**",
      "",
      "Usage: `/nemoclaw <subcommand>`",
      "",
      "Subcommands:",
      "  `status`          - Show sandbox, blueprint, and inference state",
      "  `eject`           - Show rollback instructions",
      "  `onboard`         - Show onboarding status and instructions",
      "  `set-local-model` - Switch the active OpenShell local model route",
      "",
      "Examples:",
      "  `/nemoclaw set-local-model qwen3:32b`",
      "  `/nemoclaw set-local-model nemotron-3-nano:30b --allow-outside-catalog`",
      "",
      "For full management use the CLI:",
      "  `openclaw nemoclaw status`",
      "  `openclaw nemoclaw migrate`",
      "  `openclaw nemoclaw launch`",
      "  `openclaw nemoclaw connect`",
      "  `openclaw nemoclaw set-local-model <model>`",
      "  `openclaw nemoclaw eject --confirm`",
    ].join("\n"),
  };
}

function slashSetLocalModel(args: string): PluginCommandResult {
  const parsed = parseSetLocalModelArgs(args);
  if (!parsed.model) {
    return {
      text: [
        "**NemoClaw Local Model Route**",
        "",
        "Usage: `/nemoclaw set-local-model <model> [--allow-outside-catalog]`",
        "",
        "Example:",
        "  `/nemoclaw set-local-model qwen3:32b`",
      ].join("\n"),
    };
  }

  const capture = createCapturedLogger();
  cliSetLocalModel({
    model: parsed.model,
    allowOutsideCatalog: parsed.allowOutsideCatalog,
    json: false,
    logger: capture.logger,
  });

  return { text: capture.flush() };
}

function parseSetLocalModelArgs(args: string): { model: string; allowOutsideCatalog: boolean } {
  const tokens = args
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const [, ...rest] = tokens;
  let allowOutsideCatalog = false;
  const modelParts: string[] = [];

  for (const token of rest) {
    if (token === "--allow-outside-catalog") {
      allowOutsideCatalog = true;
      continue;
    }
    modelParts.push(token);
  }

  return {
    model: modelParts.join(" ").trim(),
    allowOutsideCatalog,
  };
}

function createCapturedLogger(): { logger: PluginLogger; flush: () => string } {
  const lines: string[] = [];
  const push = (message: string) => {
    lines.push(message);
  };

  return {
    logger: {
      info: push,
      warn: push,
      error: push,
      debug: () => undefined,
    },
    flush: () => lines.join("\n").trim(),
  };
}

async function slashStatus(): Promise<PluginCommandResult> {
  const state = loadState();
  const config = loadOnboardConfig();

  if (!state.lastAction) {
    return {
      text: "**NemoClaw**: No operations performed yet. Run `openclaw nemoclaw launch` or `openclaw nemoclaw migrate` to get started.",
    };
  }

  const lines = [
    "**NemoClaw Status**",
    "",
    `Last action: ${state.lastAction}`,
    `Blueprint: ${state.blueprintVersion ?? "unknown"}`,
    `Run ID: ${state.lastRunId ?? "none"}`,
    `Sandbox: ${state.sandboxName ?? "none"}`,
    `Updated: ${state.updatedAt}`,
  ];

  if (state.migrationSnapshot) {
    lines.push("", `Rollback snapshot: ${state.migrationSnapshot}`);
  }

  if (config) {
    lines.push(
      "",
      "**Onboarding**",
      `Endpoint: ${describeOnboardEndpoint(config)}`,
      `Provider: ${describeOnboardProvider(config)}`,
      `Model: ${config.model}`,
    );

    const catalog = getConfiguredModelCatalog(config);
    if (catalog.length > 1) {
      lines.push(`Catalog: ${catalog.join(", ")}`);
    }

    const localWorkflow = await formatLocalModelWorkflow(config, true);
    if (localWorkflow.length > 0) {
      lines.push("", "**Local Model Workflow**", ...localWorkflow);
    }
  }

  return { text: lines.join("\n") };
}

async function slashOnboard(): Promise<PluginCommandResult> {
  const config = loadOnboardConfig();
  if (config) {
    const catalog = getConfiguredModelCatalog(config);
    const localWorkflow = await formatLocalModelWorkflow(config, false);
    return {
      text: [
        "**NemoClaw Onboard Status**",
        "",
        `Endpoint: ${describeOnboardEndpoint(config)}`,
        `Provider: ${describeOnboardProvider(config)}`,
        config.ncpPartner ? `NCP Partner: ${config.ncpPartner}` : null,
        `Model: ${config.model}`,
        catalog.length > 1 ? `Catalog: ${catalog.join(", ")}` : null,
        `Credential: $${config.credentialEnv}`,
        `Profile: ${config.profile}`,
        `Onboarded: ${config.onboardedAt}`,
        ...(localWorkflow.length > 0 ? ["", "**Local Model Workflow**", ...localWorkflow] : []),
        "",
        "To reconfigure, run: `openclaw nemoclaw onboard`",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }
  return {
    text: [
      "**NemoClaw Onboarding**",
      "",
      "No configuration found. Run the onboard command to set up inference:",
      "",
      "```",
      "openclaw nemoclaw onboard",
      "```",
      "",
      "Or non-interactively:",
      "```",
      'openclaw nemoclaw onboard --api-key "$NVIDIA_API_KEY" --endpoint build --model nvidia/nemotron-3-super-120b-a12b',
      "```",
    ].join("\n"),
  };
}

async function formatLocalModelWorkflow(
  config: NemoClawOnboardConfig,
  includeLiveInference: boolean,
): Promise<string[]> {
  if (!isLocalEndpointType(config.endpointType)) {
    return [];
  }

  const workflow = includeLiveInference
    ? await getInferenceAwareLocalModelWorkflow(config)
    : getSavedLocalModelWorkflow(config);
  if (!workflow) {
    return [];
  }

  return [
    `Default: ${workflow.defaultModel}`,
    `Active: ${workflow.activeModel}${workflow.activeModelSource === "onboarding" ? " (saved default)" : ""}`,
    `Provider: ${workflow.providerLabel}${workflow.provider ? ` (${workflow.provider})` : ""}`,
    `Endpoint: ${workflow.endpoint}`,
    `Source: ${workflow.activeModelSource}`,
    `Drift: ${workflow.activeModelMatchesDefault ? "none" : "active route differs from saved default"}`,
    `Catalog: ${workflow.activeModelInCatalog ? "active route is in saved catalog" : "active route is outside saved catalog"}`,
    ...(workflow.catalog.length > 0 ? [`Saved Models: ${workflow.catalog.join(", ")}`] : []),
  ];
}

async function getInferenceAwareLocalModelWorkflow(config: NemoClawOnboardConfig) {
  const savedWorkflow = getSavedLocalModelWorkflow(config);
  if (!savedWorkflow) {
    return null;
  }

  try {
    const inference = await getInferenceStatus();
    return getLocalModelWorkflow(config, {
      configured: inference.configured,
      provider: inference.provider,
      model: inference.model,
      endpoint: inference.endpoint,
    }) ?? savedWorkflow;
  } catch {
    return savedWorkflow;
  }
}

function slashEject(): PluginCommandResult {
  const state = loadState();

  if (!state.lastAction) {
    return { text: "No NemoClaw deployment found. Nothing to eject from." };
  }

  if (!state.migrationSnapshot && !state.hostBackupPath) {
    return {
      text: "No migration snapshot found. Manual rollback required.",
    };
  }

  return {
    text: [
      "**Eject from NemoClaw**",
      "",
      "To rollback to your host OpenClaw installation, run:",
      "",
      "```",
      "openclaw nemoclaw eject --confirm",
      "```",
      "",
      `Snapshot: ${state.migrationSnapshot ?? state.hostBackupPath ?? "none"}`,
    ].join("\n"),
  };
}
