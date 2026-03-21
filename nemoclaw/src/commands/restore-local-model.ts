// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from "node:child_process";
import type { PluginLogger } from "../index.js";
import {
  buildLocalModelChoices,
  describeOnboardProvider,
  getConfiguredModelCatalog,
  getLocalModelWorkflowActions,
  getSetupConfigureAction,
  isLocalEndpointType,
  loadOnboardConfig,
  type LocalModelWorkflowDrift,
} from "../onboard/config.js";
import { cliSetLocalModel } from "./set-local-model.js";

export interface RestoreLocalModelOptions {
  json: boolean;
  logger: PluginLogger;
}

interface RestoreLocalModelResult {
  ok: true;
  noop: boolean;
  setup: {
    configure: ReturnType<typeof getSetupConfigureAction>;
  };
  selectionScope: "sandbox-global";
  selectionMode: "single-active-route";
  provider: string;
  providerLabel: string;
  endpointType: string;
  endpoint: string;
  defaultModel: string;
  activeModel: string;
  activeModelSource: "inference";
  activeModelMatchesDefault: boolean;
  activeModelInCatalog: boolean;
  drift: LocalModelWorkflowDrift;
  catalog: string[];
  choices: ReturnType<typeof buildLocalModelChoices>;
  defaultChoice: ReturnType<typeof buildLocalModelChoices>[number] | null;
  activeChoice: ReturnType<typeof buildLocalModelChoices>[number] | null;
  actions: ReturnType<typeof getLocalModelWorkflowActions>;
}

interface RestoreLocalModelErrorResult {
  ok: false;
  code: "ONBOARDING_REQUIRED" | "NON_LOCAL_WORKFLOW";
  message: string;
  endpointType?: string;
  endpoint?: string;
  provider?: string;
  providerLabel?: string;
  defaultModel?: string;
  catalog?: string[];
  hint?: string;
  setup: {
    configure: ReturnType<typeof getSetupConfigureAction>;
  };
}

function emitError(
  logger: PluginLogger,
  json: boolean,
  message: string,
  payload: Omit<RestoreLocalModelErrorResult, "ok" | "message">,
): void {
  if (json) {
    logger.info(
      JSON.stringify(
        {
          ok: false,
          message,
          ...payload,
        } satisfies RestoreLocalModelErrorResult,
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

function resolveProviderName(config: NonNullable<ReturnType<typeof loadOnboardConfig>>): string {
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

function getCurrentInferenceRoute(): { provider: string | null; model: string | null; endpoint: string | null } | null {
  try {
    const stdout = execFileSync("openshell", ["inference", "get", "--json"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const parsed = JSON.parse(stdout) as {
      provider?: string;
      model?: string;
      endpoint?: string;
    };
    return {
      provider: parsed.provider ?? null,
      model: parsed.model ?? null,
      endpoint: parsed.endpoint ?? null,
    };
  } catch {
    return null;
  }
}

function emitSuccess(logger: PluginLogger, json: boolean, result: RestoreLocalModelResult): void {
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
  logger.info(`Drift:    ${result.noop ? "none (already matches saved default)" : "none"}`);
}

export function cliRestoreLocalModel(opts: RestoreLocalModelOptions): void {
  const onboard = loadOnboardConfig();
  const setup = {
    configure: getSetupConfigureAction(!!onboard),
  };

  if (!onboard) {
    emitError(opts.logger, opts.json, "No onboarding configuration found. Run 'openclaw nemoclaw onboard' first.", {
      code: "ONBOARDING_REQUIRED",
      hint: "Run 'openclaw nemoclaw onboard' first.",
      setup,
    });
    return;
  }

  if (!isLocalEndpointType(onboard.endpointType)) {
    emitError(
      opts.logger,
      opts.json,
      `Saved onboarding uses '${onboard.endpointType}', not a local endpoint. This command only supports local workflows.`,
      {
        code: "NON_LOCAL_WORKFLOW",
        endpointType: onboard.endpointType,
        endpoint: onboard.endpointUrl,
        provider: onboard.provider,
        providerLabel: describeOnboardProvider(onboard),
        defaultModel: onboard.model,
        catalog: getConfiguredModelCatalog(onboard),
        setup,
      },
    );
    return;
  }

  const provider = resolveProviderName(onboard);
  const providerLabel = describeOnboardProvider(onboard);
  const defaultModel = onboard.model.trim();
  const catalog = getConfiguredModelCatalog(onboard);
  const liveRoute = getCurrentInferenceRoute();
  if (
    liveRoute?.provider === provider &&
    liveRoute.model?.trim() === defaultModel &&
    liveRoute.endpoint?.trim() === onboard.endpointUrl
  ) {
    const choices = buildLocalModelChoices(
      defaultModel,
      defaultModel,
      catalog,
      provider,
      providerLabel,
      onboard.endpointUrl,
      onboard.endpointType,
    );
    emitSuccess(opts.logger, opts.json, {
      ok: true,
      noop: true,
      setup,
      selectionScope: "sandbox-global",
      selectionMode: "single-active-route",
      provider,
      providerLabel,
      endpointType: onboard.endpointType,
      endpoint: onboard.endpointUrl,
      defaultModel,
      activeModel: defaultModel,
      activeModelSource: "inference",
      activeModelMatchesDefault: true,
      activeModelInCatalog: catalog.includes(defaultModel),
      drift: {
        any: false,
        activeModelDiffersFromDefault: false,
        activeModelOutsideCatalog: false,
        providerDiffersFromOnboarding: false,
        endpointDiffersFromOnboarding: false,
      },
      catalog,
      choices,
      defaultChoice: choices.find((choice) => choice.isDefault) ?? null,
      activeChoice: choices.find((choice) => choice.isActive) ?? null,
      actions: getLocalModelWorkflowActions(
        defaultModel,
        defaultModel,
        provider,
        providerLabel,
        onboard.endpointUrl,
        onboard.endpointType,
      ),
    });
    return;
  }

  cliSetLocalModel({
    model: onboard.model,
    allowOutsideCatalog: false,
    json: opts.json,
    logger: opts.logger,
  });
}
