// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from "node:child_process";
import type { PluginLogger } from "../index.js";
import {
  buildLocalModelChoices,
  describeOnboardProvider,
  getConfiguredModelCatalog,
  isLocalEndpointType,
  loadOnboardConfig,
} from "../onboard/config.js";

export interface SetLocalModelOptions {
  model: string;
  allowOutsideCatalog: boolean;
  json: boolean;
  logger: PluginLogger;
}

interface SetLocalModelResult {
  ok: true;
  provider: string;
  providerLabel: string;
  endpointType: string;
  endpoint: string;
  defaultModel: string;
  activeModel: string;
  activeModelSource: "inference";
  activeModelMatchesDefault: boolean;
  activeModelInCatalog: boolean;
  catalog: string[];
  choices: ReturnType<typeof buildLocalModelChoices>;
}

interface SetLocalModelErrorResult {
  ok: false;
  code:
    | "MODEL_REQUIRED"
    | "ONBOARDING_REQUIRED"
    | "NON_LOCAL_WORKFLOW"
    | "MODEL_OUTSIDE_CATALOG"
    | "INFERENCE_SET_FAILED";
  message: string;
  model?: string;
  endpointType?: string;
  endpoint?: string;
  provider?: string;
  providerLabel?: string;
  defaultModel?: string;
  catalog?: string[];
  choices?: ReturnType<typeof buildLocalModelChoices>;
  hint?: string;
  details?: string;
}

function emitError(
  logger: PluginLogger,
  json: boolean,
  message: string,
  payload: Omit<SetLocalModelErrorResult, "ok" | "message">,
): void {
  if (json) {
    logger.info(
      JSON.stringify(
        {
          ok: false,
          message,
          ...payload,
        } satisfies SetLocalModelErrorResult,
        null,
        2,
      ),
    );
    return;
  }

  logger.error(message);
  if (payload.hint) {
    logger.info(payload.hint);
  }
}

function resolveProviderName(config: ReturnType<typeof loadOnboardConfig>): string {
  if (!config) {
    throw new Error("No onboarding config found.");
  }

  if (config.provider) {
    return config.provider;
  }

  switch (config.endpointType) {
    case "ollama":
      return "ollama-local";
    case "vllm":
      return "vllm-local";
    case "nim-local":
      return "nim-local";
    default:
      return "inference";
  }
}

function setInferenceRoute(provider: string, model: string): void {
  execFileSync("openshell", ["inference", "set", "--provider", provider, "--model", model], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

export function cliSetLocalModel(opts: SetLocalModelOptions): void {
  const { model, allowOutsideCatalog, json, logger } = opts;
  const trimmedModel = model.trim();

  if (!trimmedModel) {
    emitError(logger, json, "Model is required.", {
      code: "MODEL_REQUIRED",
    });
    return;
  }

  const onboard = loadOnboardConfig();
  if (!onboard) {
    emitError(logger, json, "No onboarding configuration found. Run 'openclaw nemoclaw onboard' first.", {
      code: "ONBOARDING_REQUIRED",
      model: trimmedModel,
      hint: "Run 'openclaw nemoclaw onboard' first.",
    });
    return;
  }

  if (!isLocalEndpointType(onboard.endpointType)) {
    emitError(
      logger,
      json,
      `Saved onboarding uses '${onboard.endpointType}', not a local endpoint. This command only supports local workflows.`,
      {
        code: "NON_LOCAL_WORKFLOW",
        model: trimmedModel,
        endpointType: onboard.endpointType,
        endpoint: onboard.endpointUrl,
        provider: onboard.provider,
        providerLabel: describeOnboardProvider(onboard),
      },
    );
    return;
  }

  const catalog = getConfiguredModelCatalog(onboard);
  const defaultModel = onboard.model.trim();
  const provider = resolveProviderName(onboard);
  const providerLabel = describeOnboardProvider(onboard);
  const inCatalog = catalog.includes(trimmedModel);
  if (!inCatalog && !allowOutsideCatalog) {
    emitError(logger, json, `Model '${trimmedModel}' is outside the saved local catalog.`, {
      code: "MODEL_OUTSIDE_CATALOG",
      model: trimmedModel,
      endpointType: onboard.endpointType,
      endpoint: onboard.endpointUrl,
      provider,
      providerLabel,
      defaultModel,
      catalog,
      choices: buildLocalModelChoices(defaultModel, defaultModel, catalog),
      hint: catalog.length > 0
        ? `Saved catalog: ${catalog.join(", ")}\nUse --allow-outside-catalog to force a one-off route change.`
        : "Use --allow-outside-catalog to force a one-off route change.",
    });
    return;
  }

  try {
    setInferenceRoute(provider, trimmedModel);
  } catch (err) {
    const stderr =
      err instanceof Error && "stderr" in err ? String((err as { stderr: unknown }).stderr) : "";
    emitError(logger, json, `Failed to set inference route: ${stderr || String(err)}`, {
      code: "INFERENCE_SET_FAILED",
      model: trimmedModel,
      endpointType: onboard.endpointType,
      endpoint: onboard.endpointUrl,
      provider,
      providerLabel,
      defaultModel,
      catalog,
      choices: buildLocalModelChoices(defaultModel, trimmedModel, catalog),
      details: stderr || String(err),
    });
    return;
  }

  const result: SetLocalModelResult = {
    ok: true,
    provider,
    providerLabel,
    endpointType: onboard.endpointType,
    endpoint: onboard.endpointUrl,
    defaultModel,
    activeModel: trimmedModel,
    activeModelSource: "inference",
    activeModelMatchesDefault: trimmedModel === defaultModel,
    activeModelInCatalog: inCatalog,
    catalog,
    choices: buildLocalModelChoices(defaultModel, trimmedModel, catalog),
  };

  if (json) {
    logger.info(JSON.stringify(result, null, 2));
    return;
  }

  logger.info("NemoClaw Local Model Route");
  logger.info("=========================");
  logger.info("");
  logger.info(`Provider: ${result.providerLabel} (${result.provider})`);
  logger.info(`Endpoint: ${result.endpointType} (${result.endpoint})`);
  logger.info(`Default:  ${result.defaultModel}`);
  logger.info(`Active:   ${result.activeModel}`);
  logger.info(
    `Drift:    ${result.activeModelMatchesDefault ? "none" : "active route differs from saved default"}`,
  );
  logger.info(
    `Catalog:  ${result.activeModelInCatalog ? "active route is in saved catalog" : "active route is outside saved catalog"}`,
  );
  if (result.catalog.length > 0) {
    logger.info(`         ${result.catalog.join(", ")}`);
  }
}
