// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import type { PluginLogger } from "../index.js";
import {
  buildLocalModelChoices,
  describeLocalModelWorkflowDrift,
  describeOnboardEndpoint,
  describeOnboardProvider,
  getConfiguredModelCatalog,
  getLocalModelWorkflow,
  getLocalModelWorkflowActions,
  getSetupConfigureAction,
  isLocalEndpointType,
  loadOnboardConfig,
} from "../onboard/config.js";

const execAsync = promisify(exec);

export interface OnboardStatusOptions {
  json: boolean;
  logger: PluginLogger;
}

export interface InferenceStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
  endpoint: string | null;
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

function isInsideSandbox(): boolean {
  return existsSync("/sandbox/.openclaw") || existsSync("/sandbox/.nemoclaw");
}

export async function getInferenceStatus(): Promise<InferenceStatus> {
  if (isInsideSandbox()) {
    return {
      configured: false,
      provider: null,
      model: null,
      endpoint: null,
      query: {
        ok: false,
        code: "inside-sandbox",
        message: "Run 'openshell inference get' on the host to query the live inference route.",
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
      query: {
        ok: false,
        code:
          error instanceof Error && "code" in error && error.code === "ENOENT"
            ? "openshell-unavailable"
            : "query-failed",
        message: message.trim() || null,
      },
    };
  }
}

export async function getOnboardStatusData(inferenceOverride?: InferenceStatus): Promise<{
  configured: boolean;
  setup: {
    configure: {
      command: string;
      argv: string[];
      description: string;
      mode: "initial-setup" | "reconfigure";
    };
  };
  onboarding: {
    endpoint: string;
    endpointUrl: string;
    provider: string;
    providerName: string | null;
    endpointType: string;
    model: string;
    credentialEnv: string;
    profile: string;
    ncpPartner: string | null;
    localModelCatalog: string[];
    isLocalEndpoint: boolean;
    onboardedAt: string;
    actions: {
      configure: {
        command: string;
        argv: string[];
        description: string;
        mode: "initial-setup" | "reconfigure";
      };
    };
  } | null;
  localModelWorkflow: {
    enabled: boolean;
    provider: string | null;
    providerLabel: string;
    endpointType: string;
    endpoint: string;
    defaultModel: string;
    activeModel: string;
    activeModelSource: "inference" | "onboarding";
    activeModelMatchesDefault: boolean;
    activeModelInCatalog: boolean;
    drift: {
      any: boolean;
      activeModelDiffersFromDefault: boolean;
      activeModelOutsideCatalog: boolean;
      providerDiffersFromOnboarding: boolean;
      endpointDiffersFromOnboarding: boolean;
    };
    catalog: string[];
    choices: ReturnType<typeof buildLocalModelChoices>;
    defaultChoice: ReturnType<typeof buildLocalModelChoices>[number] | null;
    activeChoice: ReturnType<typeof buildLocalModelChoices>[number] | null;
    actions: ReturnType<typeof getLocalModelWorkflowActions>;
  } | null;
  inference: {
    configured: boolean;
    provider: string | null;
    model: string | null;
    endpoint: string | null;
    query: {
      ok: boolean;
      code: "ok" | "inside-sandbox" | "openshell-unavailable" | "query-failed";
      message: string | null;
    };
  };
}> {
  const onboard = loadOnboardConfig();
  const localModelCatalog =
    onboard && isLocalEndpointType(onboard.endpointType) ? getConfiguredModelCatalog(onboard) : [];
  const inference = inferenceOverride ?? (await getInferenceStatus());
  const configureAction = getSetupConfigureAction(!!onboard);

  return {
    configured: !!onboard,
    setup: {
      configure: configureAction,
    },
    inference,
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
    localModelWorkflow: onboard
      ? getLocalModelWorkflow(onboard, {
          configured: inference.configured,
          provider: inference.provider,
          model: inference.model,
          endpoint: inference.endpoint,
        })
      : null,
  };
}

export async function cliOnboardStatus(opts: OnboardStatusOptions): Promise<void> {
  const { json, logger } = opts;
  const data = await getOnboardStatusData();

  if (json) {
    logger.info(JSON.stringify(data, null, 2));
    return;
  }

  if (!data.onboarding) {
    logger.info("NemoClaw Onboarding");
    logger.info("===================");
    logger.info("");
    logger.info("No onboarding configuration found.");
    logger.info("Run 'openclaw nemoclaw onboard' to set up inference.");
    return;
  }

  logger.info("NemoClaw Onboarding");
  logger.info("===================");
  logger.info("");
  logger.info(`Endpoint:   ${data.onboarding.endpoint}`);
  logger.info(`Provider:   ${data.onboarding.provider}`);
  if (data.onboarding.ncpPartner) {
    logger.info(`NCP:        ${data.onboarding.ncpPartner}`);
  }
  logger.info(`Model:      ${data.onboarding.model}`);
  if (data.onboarding.localModelCatalog.length > 0) {
    logger.info(`Catalog:    ${data.onboarding.localModelCatalog.join(", ")}`);
    logger.info("Note:       Saved local catalog/default for dashboard control-plane reads.");
  }
  logger.info(`Credential: $${data.onboarding.credentialEnv}`);
  logger.info(`Profile:    ${data.onboarding.profile}`);
  logger.info(`Onboarded:  ${data.onboarding.onboardedAt}`);

  if (data.localModelWorkflow) {
    logger.info("");
    logger.info("Local Model Workflow:");
    logger.info(`Default:    ${data.localModelWorkflow.defaultModel}`);
    logger.info(`Active:     ${data.localModelWorkflow.activeModel}`);
    logger.info(`Source:     ${data.localModelWorkflow.activeModelSource}`);
    logger.info(`Drift:      ${describeLocalModelWorkflowDrift(data.localModelWorkflow)}`);
    logger.info(
      `Catalog:    ${data.localModelWorkflow.activeModelInCatalog ? "active route is in saved catalog" : "active route is outside saved catalog"}`,
    );
    if (data.localModelWorkflow.catalog.length > 0) {
      logger.info(`            ${data.localModelWorkflow.catalog.join(", ")}`);
    }
    if (data.inference.query.ok) {
      logger.info("Live route: OpenShell inference query succeeded.");
    } else if (data.inference.query.code === "inside-sandbox") {
      logger.info("Live route: inside sandbox; showing saved onboarding state.");
      if (data.inference.query.message) {
        logger.info(`Reason:     ${data.inference.query.message}`);
      }
    } else if (data.inference.query.code === "openshell-unavailable") {
      logger.info("Live route: OpenShell CLI unavailable; showing saved onboarding state.");
    } else if (data.inference.query.code === "query-failed") {
      logger.info("Live route: unable to query OpenShell; showing saved onboarding state.");
      if (data.inference.query.message) {
        logger.info(`Reason:     ${data.inference.query.message}`);
      }
    }
  }
}
