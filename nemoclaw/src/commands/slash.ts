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

import type { PluginCommandContext, PluginCommandResult, OpenClawPluginApi } from "../index.js";
import { loadState } from "../blueprint/state.js";
import {
  describeOnboardEndpoint,
  describeOnboardProvider,
  getConfiguredModelCatalog,
  getSavedLocalModelWorkflow,
  isLocalEndpointType,
  loadOnboardConfig,
  type NemoClawOnboardConfig,
} from "../onboard/config.js";

export function handleSlashCommand(
  ctx: PluginCommandContext,
  _api: OpenClawPluginApi,
): PluginCommandResult {
  const subcommand = ctx.args?.trim().split(/\s+/)[0] ?? "";

  switch (subcommand) {
    case "status":
      return slashStatus();
    case "eject":
      return slashEject();
    case "onboard":
      return slashOnboard();
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
      "  `status`  - Show sandbox, blueprint, and inference state",
      "  `eject`   - Show rollback instructions",
      "  `onboard` - Show onboarding status and instructions",
      "",
      "For full management use the CLI:",
      "  `openclaw nemoclaw status`",
      "  `openclaw nemoclaw migrate`",
      "  `openclaw nemoclaw launch`",
      "  `openclaw nemoclaw connect`",
      "  `openclaw nemoclaw eject --confirm`",
    ].join("\n"),
  };
}

function slashStatus(): PluginCommandResult {
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

    const localWorkflow = formatLocalModelWorkflow(config);
    if (localWorkflow.length > 0) {
      lines.push("", "**Local Model Workflow**", ...localWorkflow);
    }
  }

  return { text: lines.join("\n") };
}

function slashOnboard(): PluginCommandResult {
  const config = loadOnboardConfig();
  if (config) {
    const catalog = getConfiguredModelCatalog(config);
    const localWorkflow = formatLocalModelWorkflow(config);
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

function formatLocalModelWorkflow(config: NemoClawOnboardConfig): string[] {
  if (!isLocalEndpointType(config.endpointType)) {
    return [];
  }

  const workflow = getSavedLocalModelWorkflow(config);
  if (!workflow) {
    return [];
  }

  return [
    `Default: ${workflow.defaultModel}`,
    `Active: ${workflow.activeModel} (saved default)`,
    `Source: ${workflow.activeModelSource}`,
    `Drift: ${workflow.activeModelMatchesDefault ? "none" : "active route differs from saved default"}`,
    `Catalog: ${workflow.activeModelInCatalog ? "active route is in saved catalog" : "active route is outside saved catalog"}`,
    ...(workflow.catalog.length > 0 ? [`Saved Models: ${workflow.catalog.join(", ")}`] : []),
  ];
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
