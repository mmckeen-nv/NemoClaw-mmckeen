// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { PluginLogger } from "../index.js";
import {
  describeOnboardEndpoint,
  describeOnboardProvider,
  getConfiguredModelCatalog,
  getSavedLocalModelWorkflow,
  isLocalEndpointType,
  loadOnboardConfig,
} from "../onboard/config.js";

export interface OnboardStatusOptions {
  json: boolean;
  logger: PluginLogger;
}

export function getOnboardStatusData(): {
  configured: boolean;
  onboarding: {
    endpoint: string;
    provider: string;
    endpointType: string;
    model: string;
    credentialEnv: string;
    profile: string;
    ncpPartner: string | null;
    localModelCatalog: string[];
    isLocalEndpoint: boolean;
    onboardedAt: string;
  } | null;
  localModelWorkflow: ReturnType<typeof getSavedLocalModelWorkflow>;
} {
  const onboard = loadOnboardConfig();
  const localModelCatalog = onboard && isLocalEndpointType(onboard.endpointType)
    ? getConfiguredModelCatalog(onboard)
    : [];

  return {
    configured: !!onboard,
    onboarding: onboard
      ? {
          endpoint: describeOnboardEndpoint(onboard),
          provider: describeOnboardProvider(onboard),
          endpointType: onboard.endpointType,
          model: onboard.model,
          credentialEnv: onboard.credentialEnv,
          profile: onboard.profile,
          ncpPartner: onboard.ncpPartner,
          localModelCatalog,
          isLocalEndpoint: isLocalEndpointType(onboard.endpointType),
          onboardedAt: onboard.onboardedAt,
        }
      : null,
    localModelWorkflow: onboard ? getSavedLocalModelWorkflow(onboard) : null,
  };
}

export async function cliOnboardStatus(opts: OnboardStatusOptions): Promise<void> {
  const { json, logger } = opts;
  const data = getOnboardStatusData();

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
    logger.info(
      `Drift:      ${data.localModelWorkflow.activeModelMatchesDefault ? "none" : "active route differs from saved default"}`,
    );
    logger.info(
      `Catalog:    ${data.localModelWorkflow.activeModelInCatalog ? "active route is in saved catalog" : "active route is outside saved catalog"}`,
    );
    if (data.localModelWorkflow.catalog.length > 0) {
      logger.info(`            ${data.localModelWorkflow.catalog.join(", ")}`);
    }
  }
}
