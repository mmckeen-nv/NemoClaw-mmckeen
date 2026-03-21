// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { PluginLogger } from "../index.js";
import { isLocalEndpointType, loadOnboardConfig } from "../onboard/config.js";
import { cliSetLocalModel } from "./set-local-model.js";

export interface RestoreLocalModelOptions {
  json: boolean;
  logger: PluginLogger;
}

export function cliRestoreLocalModel(opts: RestoreLocalModelOptions): void {
  const onboard = loadOnboardConfig();

  if (onboard && isLocalEndpointType(onboard.endpointType)) {
    cliSetLocalModel({
      model: onboard.model,
      allowOutsideCatalog: false,
      json: opts.json,
      logger: opts.logger,
    });
    return;
  }

  cliSetLocalModel({
    model: "",
    allowOutsideCatalog: false,
    json: opts.json,
    logger: opts.logger,
  });
}
