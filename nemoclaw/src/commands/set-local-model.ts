// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from "node:child_process";
import type { PluginLogger } from "../index.js";
import {
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
  ok: boolean;
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
    logger.error("Model is required.");
    return;
  }

  const onboard = loadOnboardConfig();
  if (!onboard) {
    logger.error("No onboarding configuration found. Run 'openclaw nemoclaw onboard' first.");
    return;
  }

  if (!isLocalEndpointType(onboard.endpointType)) {
    logger.error(
      `Saved onboarding uses '${onboard.endpointType}', not a local endpoint. This command only supports local workflows.`,
    );
    return;
  }

  const catalog = getConfiguredModelCatalog(onboard);
  const inCatalog = catalog.includes(trimmedModel);
  if (!inCatalog && !allowOutsideCatalog) {
    logger.error(`Model '${trimmedModel}' is outside the saved local catalog.`);
    if (catalog.length > 0) {
      logger.info(`Saved catalog: ${catalog.join(", ")}`);
      logger.info("Use --allow-outside-catalog to force a one-off route change.");
    }
    return;
  }

  const provider = resolveProviderName(onboard);
  try {
    setInferenceRoute(provider, trimmedModel);
  } catch (err) {
    const stderr =
      err instanceof Error && "stderr" in err ? String((err as { stderr: unknown }).stderr) : "";
    logger.error(`Failed to set inference route: ${stderr || String(err)}`);
    return;
  }

  const result: SetLocalModelResult = {
    ok: true,
    provider,
    providerLabel: describeOnboardProvider(onboard),
    endpointType: onboard.endpointType,
    endpoint: onboard.endpointUrl,
    defaultModel: onboard.model.trim(),
    activeModel: trimmedModel,
    activeModelSource: "inference",
    activeModelMatchesDefault: trimmedModel === onboard.model.trim(),
    activeModelInCatalog: inCatalog,
    catalog,
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
