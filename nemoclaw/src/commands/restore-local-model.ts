// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { PluginLogger } from "../index.js";
import {
  describeOnboardProvider,
  getConfiguredModelCatalog,
  getSetupConfigureAction,
  isLocalEndpointType,
  loadOnboardConfig,
} from "../onboard/config.js";
import { cliSetLocalModel } from "./set-local-model.js";

export interface RestoreLocalModelOptions {
  json: boolean;
  logger: PluginLogger;
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

  cliSetLocalModel({
    model: onboard.model,
    allowOutsideCatalog: false,
    json: opts.json,
    logger: opts.logger,
  });
}
