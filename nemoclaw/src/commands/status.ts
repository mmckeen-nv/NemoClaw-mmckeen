// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import type { PluginLogger, NemoClawConfig } from "../index.js";
import { loadState } from "../blueprint/state.js";
import {
  describeLocalModelWorkflowDrift,
  describeOnboardEndpoint,
  describeOnboardProvider,
  getConfiguredModelCatalog,
  getLocalModelWorkflow,
  getLocalModelWorkflowRecommendedActions,
  getSetupConfigureAction,
  withLocalModelWorkflowMutationAvailability,
  isLocalEndpointType,
  loadOnboardConfig,
} from "../onboard/config.js";

const execAsync = promisify(exec);

function isOpenShellUnavailable(error: unknown, message: string): boolean {
  if (error instanceof Error && "code" in error && error.code === "ENOENT") {
    return true;
  }

  return /(?:^|\b)(?:openshell: )?(?:command not found|not found)\b/i.test(message);
}

/**
 * Detect whether the plugin is running inside an OpenShell sandbox.
 * Inside sandboxes the root filesystem is mounted at /sandbox and openshell
 * host commands are not available, so querying `openshell sandbox status`
 * would always fail — producing false-negative "not running" reports.
 */
function isInsideSandbox(): boolean {
  return existsSync("/sandbox/.openclaw") || existsSync("/sandbox/.nemoclaw");
}

export interface StatusOptions {
  json: boolean;
  logger: PluginLogger;
  pluginConfig: NemoClawConfig;
}

export async function cliStatus(opts: StatusOptions): Promise<void> {
  const { json: jsonOutput, logger } = opts;
  const state = loadState();
  const onboard = loadOnboardConfig();
  const sandboxName = state.sandboxName ?? "openclaw";
  const insideSandbox = isInsideSandbox();

  const [sandbox, inference] = await Promise.all([
    getSandboxStatus(sandboxName, insideSandbox),
    getInferenceStatus(insideSandbox),
  ]);

  const localModelCatalog =
    onboard && isLocalEndpointType(onboard.endpointType) ? getConfiguredModelCatalog(onboard) : [];
  const localModelWorkflowBase = getLocalModelWorkflowStatus(onboard, inference);
  const localModelWorkflow = localModelWorkflowBase
    ? withLocalModelWorkflowMutationAvailability(
        localModelWorkflowBase,
        insideSandbox
          ? {
              enabled: false,
              reason:
                "Live OpenShell route changes must run on the host because this command is inside the sandbox.",
              reasonCode: "inside-sandbox",
            }
          : inference.query.code === "openshell-unavailable"
            ? {
                enabled: false,
                reason:
                  "OpenShell CLI is unavailable, so NemoClaw cannot retarget the live local-model route from this context.",
                reasonCode: "openshell-cli-unavailable",
              }
            : { enabled: true },
      )
    : null;
  const localModelWorkflowWithRecommendations = localModelWorkflow
    ? {
        ...localModelWorkflow,
        recommendedActions: getLocalModelWorkflowRecommendedActions(localModelWorkflow),
      }
    : null;

  const configureAction = getSetupConfigureAction(!!onboard);

  const statusData = {
    generatedAt: new Date().toISOString(),
    executionContext: {
      insideSandbox,
      openshellCliAvailable:
        sandbox.query.code !== "openshell-unavailable" || inference.query.code !== "openshell-unavailable",
      canQueryLiveSandbox: sandbox.query.ok,
      canQueryLiveInference: inference.query.ok,
      canMutateLiveInferenceRoute: !insideSandbox && inference.query.code !== "openshell-unavailable",
    },
    nemoclaw: {
      lastAction: state.lastAction,
      lastRunId: state.lastRunId,
      blueprintVersion: state.blueprintVersion,
      sandboxName: state.sandboxName,
      migrationSnapshot: state.migrationSnapshot,
      updatedAt: state.updatedAt,
    },
    sandbox,
    inference,
    setup: {
      configure: configureAction,
    },
    onboarding: onboard
      ? {
          endpoint: describeOnboardEndpoint(onboard),
          endpointUrl: onboard.endpointUrl,
          provider: describeOnboardProvider(onboard),
          providerName: onboard.provider ?? null,
          endpointType: onboard.endpointType,
          model: onboard.model,
          credentialEnv: onboard.credentialEnv,
          profile: onboard.profile,
          ncpPartner: onboard.ncpPartner,
          localModelCatalog,
          isLocalEndpoint: isLocalEndpointType(onboard.endpointType),
          onboardedAt: onboard.onboardedAt,
          actions: {
            configure: getSetupConfigureAction(true),
          },
        }
      : null,
    localModelWorkflow: localModelWorkflowWithRecommendations,
    insideSandbox,
  };

  if (jsonOutput) {
    logger.info(JSON.stringify(statusData, null, 2));
    return;
  }

  logger.info("NemoClaw Status");
  logger.info("===============");
  logger.info("");

  if (insideSandbox) {
    logger.info("Context: running inside an active OpenShell sandbox");
    logger.info("  Host sandbox state is not inspectable from inside the sandbox.");
    logger.info("  Run 'openshell sandbox status' on the host for full details.");
    logger.info("");
  }

  logger.info("Plugin State:");
  if (state.lastAction) {
    logger.info(`  Last action:      ${state.lastAction}`);
    logger.info(`  Blueprint:        ${state.blueprintVersion ?? "unknown"}`);
    logger.info(`  Run ID:           ${state.lastRunId ?? "none"}`);
    logger.info(`  Updated:          ${state.updatedAt}`);
  } else {
    logger.info("  No operations have been performed yet.");
  }
  logger.info("");

  logger.info("Sandbox:");
  if (sandbox.running) {
    logger.info(`  Name:    ${sandbox.name}`);
    logger.info("  Status:  running");
    logger.info(`  Uptime:  ${sandbox.uptime ?? "unknown"}`);
  } else if (sandbox.insideSandbox) {
    logger.info(`  Name:    ${sandbox.name}`);
    logger.info("  Status:  active (inside sandbox)");
    logger.info("  Note:    Cannot query host sandbox state from within the sandbox.");
  } else if (sandbox.query.code === "openshell-unavailable") {
    logger.info("  Status:  OpenShell CLI unavailable");
    if (sandbox.query.message) {
      logger.info(`  Error:   ${sandbox.query.message}`);
    }
  } else if (sandbox.query.code === "query-failed" && sandbox.query.message) {
    logger.info("  Status:  unable to query live sandbox state");
    logger.info(`  Error:   ${sandbox.query.message}`);
  } else {
    logger.info("  Status:  not running");
  }
  logger.info("");

  if (onboard) {
    logger.info("Onboarding:");
    logger.info(`  Endpoint:  ${describeOnboardEndpoint(onboard)}`);
    logger.info(`  Provider:  ${describeOnboardProvider(onboard)}`);
    logger.info(`  Model:     ${onboard.model}`);
    if (localModelCatalog.length > 0) {
      logger.info(`  Catalog:   ${localModelCatalog.join(", ")}`);
      logger.info(
        "  Note:      Saved as the local default/catalog for future dashboard control-plane reads.",
      );
    }
    logger.info(`  Onboarded: ${onboard.onboardedAt}`);
    logger.info("");
  }

  if (localModelWorkflow) {
    logger.info("Local Model Workflow:");
    logger.info(`  Default:   ${localModelWorkflow.defaultModel}`);
    logger.info(`  Active:    ${localModelWorkflow.activeModel}`);
    logger.info(`  Source:    ${localModelWorkflow.activeModelSource}`);
    logger.info(`  Live:      ${localModelWorkflow.liveRouteStatus}`);
    logger.info(`  Drift:     ${describeLocalModelWorkflowDrift(localModelWorkflow)}`);
    logger.info(
      `  Catalog:   ${localModelWorkflow.activeModelInCatalog ? "active route is in saved catalog" : "active route is outside saved catalog"}`,
    );
    if (localModelWorkflow.catalog.length > 0) {
      logger.info(`            ${localModelWorkflow.catalog.join(", ")}`);
    }
    if (
      localModelWorkflow.drift.providerDiffersFromOnboarding ||
      localModelWorkflow.drift.endpointDiffersFromOnboarding
    ) {
      logger.info(
        `  Saved:     ${localModelWorkflow.savedProviderLabel}${localModelWorkflow.savedProvider ? ` (${localModelWorkflow.savedProvider})` : ""} -> ${localModelWorkflow.savedEndpoint}`,
      );
    }
    logger.info("");
  }

  logger.info("Inference:");
  if (inference.configured) {
    logger.info(`  Provider:  ${inference.provider ?? "unknown"}`);
    logger.info(`  Model:     ${inference.model ?? "unknown"}`);
    logger.info(`  Endpoint:  ${inference.endpoint ?? "unknown"}`);
  } else if (inference.insideSandbox) {
    logger.info("  Status:  unable to query from inside sandbox");
    logger.info("  Note:    Run 'openshell inference get' on the host to check.");
  } else if (inference.query.code === "openshell-unavailable") {
    logger.info("  Status:  OpenShell CLI unavailable");
    if (inference.query.message) {
      logger.info(`  Error:   ${inference.query.message}`);
    }
  } else if (inference.query.code === "query-failed" && inference.query.message) {
    if (/no inference configured/i.test(inference.query.message)) {
      logger.info("  Not configured");
    } else {
      logger.info("  Status:  unable to query live route");
      logger.info(`  Error:   ${inference.query.message}`);
    }
  } else {
    logger.info("  Not configured");
  }

  if (state.migrationSnapshot) {
    logger.info("");
    logger.info("Rollback:");
    logger.info(`  Snapshot:  ${state.migrationSnapshot}`);
    logger.info("  Run 'openclaw nemoclaw eject' to restore host installation.");
  }
}

interface SandboxStatus {
  name: string;
  running: boolean;
  uptime: string | null;
  insideSandbox: boolean;
  query: {
    ok: boolean;
    code: "ok" | "inside-sandbox" | "openshell-unavailable" | "query-failed";
    message: string | null;
  };
}

interface SandboxStatusResponse {
  state?: string;
  uptime?: string;
}

async function getSandboxStatus(
  sandboxName: string,
  insideSandbox: boolean,
): Promise<SandboxStatus> {
  if (insideSandbox) {
    return {
      name: sandboxName,
      running: false,
      uptime: null,
      insideSandbox: true,
      query: {
        ok: false,
        code: "inside-sandbox",
        message: "Run 'openshell sandbox status' on the host to query the live sandbox state.",
      },
    };
  }
  try {
    const { stdout } = await execAsync(`openshell sandbox status ${sandboxName} --json`, {
      timeout: 5000,
    });
    const parsed = JSON.parse(stdout) as SandboxStatusResponse;
    return {
      name: sandboxName,
      running: parsed.state === "running",
      uptime: parsed.uptime ?? null,
      insideSandbox: false,
      query: {
        ok: true,
        code: "ok",
        message: null,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? ("stderr" in error && typeof error.stderr === "string" && error.stderr.trim()) ||
          error.message
        : String(error);
    return {
      name: sandboxName,
      running: false,
      uptime: null,
      insideSandbox: false,
      query: {
        ok: false,
        code: isOpenShellUnavailable(error, message)
          ? "openshell-unavailable"
          : "query-failed",
        message: message.trim() || null,
      },
    };
  }
}

interface InferenceStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
  endpoint: string | null;
  insideSandbox: boolean;
  query: {
    ok: boolean;
    code: "ok" | "inside-sandbox" | "openshell-unavailable" | "query-failed";
    message: string | null;
  };
}

interface InferenceStatusResponse {
  provider?: string;
  model?: string;
  endpoint?: string;
}

type LocalModelWorkflowStatus = ReturnType<typeof getLocalModelWorkflow>;

function getLocalModelWorkflowStatus(
  onboard: ReturnType<typeof loadOnboardConfig>,
  inference: InferenceStatus,
): LocalModelWorkflowStatus | null {
  if (!onboard) {
    return null;
  }

  return getLocalModelWorkflow(onboard, {
    configured: inference.configured,
    provider: inference.provider,
    model: inference.model,
    endpoint: inference.endpoint,
  });
}

async function getInferenceStatus(insideSandbox: boolean): Promise<InferenceStatus> {
  if (insideSandbox) {
    return {
      configured: false,
      provider: null,
      model: null,
      endpoint: null,
      insideSandbox: true,
      query: {
        ok: false,
        code: "inside-sandbox",
        message: "Run 'openshell inference get' on the host to query the live route.",
      },
    };
  }
  try {
    const { stdout } = await execAsync("openshell inference get --json", {
      timeout: 5000,
    });
    const parsed = JSON.parse(stdout) as InferenceStatusResponse;
    return {
      configured: true,
      provider: parsed.provider ?? null,
      model: parsed.model ?? null,
      endpoint: parsed.endpoint ?? null,
      insideSandbox: false,
      query: {
        ok: true,
        code: "ok",
        message: null,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? ("stderr" in error && typeof error.stderr === "string" && error.stderr.trim()) ||
          error.message
        : String(error);
    return {
      configured: false,
      provider: null,
      model: null,
      endpoint: null,
      insideSandbox: false,
      query: {
        ok: false,
        code: isOpenShellUnavailable(error, message)
          ? "openshell-unavailable"
          : "query-failed",
        message: message.trim() || null,
      },
    };
  }
}
