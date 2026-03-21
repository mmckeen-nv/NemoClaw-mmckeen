// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const CONFIG_DIR = join(process.env.HOME ?? "/tmp", ".nemoclaw");

export type EndpointType = "build" | "ncp" | "nim-local" | "vllm" | "ollama" | "custom";

export interface NemoClawOnboardConfig {
  endpointType: EndpointType;
  endpointUrl: string;
  ncpPartner: string | null;
  model: string;
  profile: string;
  credentialEnv: string;
  provider?: string;
  providerLabel?: string;
  availableModels?: string[];
  onboardedAt: string;
}

export function isLocalEndpointType(endpointType: EndpointType): boolean {
  return endpointType === "ollama" || endpointType === "vllm" || endpointType === "nim-local";
}

export function getConfiguredModelCatalog(config: NemoClawOnboardConfig): string[] {
  const catalog = [config.model, ...(config.availableModels ?? [])]
    .map((entry) => entry.trim())
    .filter(Boolean);
  return [...new Set(catalog)];
}

export interface LocalModelChoice {
  model: string;
  label: string;
  badges: Array<"default" | "active" | "outside-catalog">;
  summary: string;
  isDefault: boolean;
  isActive: boolean;
  isSelectable: boolean;
  inCatalog: boolean;
  source: "default" | "catalog" | "active-route";
  command: string;
  argv: string[];
  requiresAllowOutsideCatalog: boolean;
  targetProvider: string | null;
  targetProviderLabel: string;
  targetEndpoint: string | null;
  targetEndpointType: EndpointType | null;
}

export interface SetupConfigureAction {
  command: "openclaw nemoclaw onboard";
  argv: ["openclaw", "nemoclaw", "onboard"];
  description: string;
  mode: "initial-setup" | "reconfigure";
}

export interface LocalModelWorkflowActions {
  read: {
    command: "openclaw nemoclaw onboard-status --json";
    argv: ["openclaw", "nemoclaw", "onboard-status", "--json"];
    description: string;
    stateScope: "saved-onboarding-config";
  };
  setActiveModel: {
    command: "openclaw nemoclaw set-local-model <model> --json";
    argvTemplate: ["openclaw", "nemoclaw", "set-local-model", "<model>", "--json"];
    commandAllowOutsideCatalog: "openclaw nemoclaw set-local-model <model> --json --allow-outside-catalog";
    argvTemplateAllowOutsideCatalog: [
      "openclaw",
      "nemoclaw",
      "set-local-model",
      "<model>",
      "--json",
      "--allow-outside-catalog",
    ];
    description: string;
    supportsAllowOutsideCatalog: boolean;
    allowOutsideCatalogFlag: "--allow-outside-catalog";
    stateScope: "openshell-active-route";
    mutatesSavedDefault: false;
    targetProvider: string | null;
    targetProviderLabel: string;
    targetEndpoint: string | null;
    targetEndpointType: EndpointType | null;
  };
  restoreDefaultModel: {
    command: "openclaw nemoclaw restore-local-model --json";
    argv: ["openclaw", "nemoclaw", "restore-local-model", "--json"];
    description: string;
    enabled: boolean;
    reason: string | null;
    stateScope: "openshell-active-route";
    mutatesSavedDefault: false;
    targetModel: string;
    targetProvider: string | null;
    targetProviderLabel: string;
    targetEndpoint: string | null;
    targetEndpointType: EndpointType | null;
  };
}

export interface LocalModelWorkflowDrift {
  any: boolean;
  activeModelDiffersFromDefault: boolean;
  activeModelOutsideCatalog: boolean;
  providerDiffersFromOnboarding: boolean;
  endpointDiffersFromOnboarding: boolean;
}

export interface LocalModelWorkflow {
  enabled: true;
  provider: string | null;
  providerLabel: string;
  endpointType: EndpointType;
  endpoint: string;
  defaultModel: string;
  activeModel: string;
  activeModelSource: "inference" | "onboarding";
  activeModelMatchesDefault: boolean;
  activeModelInCatalog: boolean;
  drift: LocalModelWorkflowDrift;
  catalog: string[];
  choices: LocalModelChoice[];
  defaultChoice: LocalModelChoice | null;
  activeChoice: LocalModelChoice | null;
  actions: LocalModelWorkflowActions;
}

export interface SavedLocalModelWorkflow extends LocalModelWorkflow {
  activeModelSource: "onboarding";
  activeModelMatchesDefault: true;
}

export function describeLocalModelWorkflowDrift(
  workflow: Pick<LocalModelWorkflow, "drift">,
): string {
  const reasons: string[] = [];
  if (workflow.drift.activeModelDiffersFromDefault) {
    reasons.push("active model differs from saved default");
  }
  if (workflow.drift.activeModelOutsideCatalog) {
    reasons.push("active model is outside saved catalog");
  }
  if (workflow.drift.providerDiffersFromOnboarding) {
    reasons.push("provider differs from saved onboarding provider");
  }
  if (workflow.drift.endpointDiffersFromOnboarding) {
    reasons.push("endpoint differs from saved onboarding endpoint");
  }
  return reasons.length > 0 ? reasons.join("; ") : "none";
}

export function buildLocalModelChoices(
  defaultModel: string,
  activeModel: string,
  catalog: string[],
  targetProvider: string | null = null,
  targetProviderLabel = "Saved local provider",
  targetEndpoint: string | null = null,
  targetEndpointType: EndpointType | null = null,
): LocalModelChoice[] {
  const ordered = [defaultModel, ...catalog];
  if (!catalog.includes(activeModel)) {
    ordered.push(activeModel);
  }

  const seen = new Set<string>();
  return ordered
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => {
      if (seen.has(entry)) {
        return false;
      }
      seen.add(entry);
      return true;
    })
    .map((model) => {
      const inCatalog = catalog.includes(model);
      const requiresAllowOutsideCatalog = !inCatalog;
      const isDefault = model === defaultModel;
      const isActive = model === activeModel;
      const argv = ["openclaw", "nemoclaw", "set-local-model", model, "--json"];
      if (requiresAllowOutsideCatalog) {
        argv.push("--allow-outside-catalog");
      }
      const badges: Array<"default" | "active" | "outside-catalog"> = [];
      if (isDefault) {
        badges.push("default");
      }
      if (isActive) {
        badges.push("active");
      }
      if (!inCatalog) {
        badges.push("outside-catalog");
      }
      return {
        model,
        label: model,
        badges,
        summary: badges.length > 0 ? badges.join(", ") : "catalog",
        isDefault,
        isActive,
        isSelectable: !isActive,
        inCatalog,
        source: isActive && !inCatalog
          ? "active-route"
          : isDefault
            ? "default"
            : "catalog",
        command: `openclaw nemoclaw set-local-model ${JSON.stringify(model)} --json${requiresAllowOutsideCatalog ? " --allow-outside-catalog" : ""}`,
        argv,
        requiresAllowOutsideCatalog,
        targetProvider,
        targetProviderLabel,
        targetEndpoint,
        targetEndpointType,
      };
    });
}

export function getSetupConfigureAction(hasOnboardConfig: boolean): SetupConfigureAction {
  return {
    command: "openclaw nemoclaw onboard",
    argv: ["openclaw", "nemoclaw", "onboard"],
    description: hasOnboardConfig
      ? "Launch NemoClaw onboarding to create or update the saved inference configuration."
      : "Launch NemoClaw onboarding to create the first saved inference configuration.",
    mode: hasOnboardConfig ? "reconfigure" : "initial-setup",
  };
}

export function getLocalModelWorkflowActions(
  defaultModel: string,
  activeModel: string = defaultModel,
  provider: string | null = null,
  providerLabel = "Saved local provider",
  targetEndpoint: string | null = null,
  targetEndpointType: EndpointType | null = null,
  restoreReasonOverride?: string | null,
): LocalModelWorkflowActions {
  const restoreEnabled = restoreReasonOverride ? true : activeModel !== defaultModel;
  return {
    read: {
      command: "openclaw nemoclaw onboard-status --json",
      argv: ["openclaw", "nemoclaw", "onboard-status", "--json"],
      description: "Read saved onboarding and local-model workflow state without querying sandbox health.",
      stateScope: "saved-onboarding-config",
    },
    setActiveModel: {
      command: "openclaw nemoclaw set-local-model <model> --json",
      argvTemplate: ["openclaw", "nemoclaw", "set-local-model", "<model>", "--json"],
      commandAllowOutsideCatalog: "openclaw nemoclaw set-local-model <model> --json --allow-outside-catalog",
      argvTemplateAllowOutsideCatalog: [
        "openclaw",
        "nemoclaw",
        "set-local-model",
        "<model>",
        "--json",
        "--allow-outside-catalog",
      ],
      description: "Switch the active OpenShell local-model route without changing the saved onboarding default.",
      supportsAllowOutsideCatalog: true,
      allowOutsideCatalogFlag: "--allow-outside-catalog",
      stateScope: "openshell-active-route",
      mutatesSavedDefault: false,
      targetProvider: provider,
      targetProviderLabel: providerLabel,
      targetEndpoint,
      targetEndpointType,
    },
    restoreDefaultModel: {
      command: "openclaw nemoclaw restore-local-model --json",
      argv: ["openclaw", "nemoclaw", "restore-local-model", "--json"],
      description: "Restore the active OpenShell local-model route to the saved onboarding default.",
      enabled: restoreEnabled,
      reason: restoreEnabled
        ? (restoreReasonOverride ?? null)
        : "active route already matches the saved onboarding default.",
      stateScope: "openshell-active-route",
      mutatesSavedDefault: false,
      targetModel: defaultModel,
      targetProvider: provider,
      targetProviderLabel: providerLabel,
      targetEndpoint,
      targetEndpointType,
    },
  };
}

export function getLocalModelWorkflow(
  config: NemoClawOnboardConfig,
  inference?: {
    configured: boolean;
    provider: string | null;
    model: string | null;
    endpoint?: string | null;
  },
): LocalModelWorkflow | null {
  if (!isLocalEndpointType(config.endpointType)) {
    return null;
  }

  const catalog = getConfiguredModelCatalog(config);
  const defaultModel = config.model.trim();
  const inferenceModel = inference?.configured ? inference.model?.trim() ?? null : null;
  const activeModel = inferenceModel || defaultModel;

  const onboardingProvider = config.provider ?? null;
  const targetProvider = onboardingProvider;
  const targetProviderLabel = describeOnboardProvider(config);
  const targetEndpoint = config.endpointUrl;
  const targetEndpointType = config.endpointType;
  const choices = buildLocalModelChoices(
    defaultModel,
    activeModel,
    catalog,
    targetProvider,
    targetProviderLabel,
    targetEndpoint,
    targetEndpointType,
  );

  const activeProvider = inference?.configured ? inference.provider ?? onboardingProvider : onboardingProvider;
  const activeEndpoint = inference?.configured ? inference.endpoint?.trim() || config.endpointUrl : config.endpointUrl;
  const providerLabelOverride = inference?.configured
    ? activeProvider === "ollama-local"
      ? "Local Ollama"
      : activeProvider === "vllm-local"
        ? "Local vLLM"
        : activeProvider === "nim-local"
          ? "Local NIM"
          : activeProvider
    : null;
  const drift = {
    activeModelDiffersFromDefault: activeModel !== defaultModel,
    activeModelOutsideCatalog: !catalog.includes(activeModel),
    providerDiffersFromOnboarding: activeProvider !== (config.provider ?? null),
    endpointDiffersFromOnboarding: activeEndpoint !== config.endpointUrl,
  };

  const restoreReason = activeModel !== defaultModel
    ? null
    : drift.providerDiffersFromOnboarding
      ? "active route provider differs from the saved onboarding provider."
      : drift.endpointDiffersFromOnboarding
        ? "active route endpoint differs from the saved onboarding endpoint."
        : null;

  return {
    enabled: true,
    provider: activeProvider,
    providerLabel: providerLabelOverride ?? targetProviderLabel,
    endpointType: config.endpointType,
    endpoint: activeEndpoint,
    defaultModel,
    activeModel,
    activeModelSource: inferenceModel ? "inference" : "onboarding",
    activeModelMatchesDefault: activeModel === defaultModel,
    activeModelInCatalog: catalog.includes(activeModel),
    drift: {
      ...drift,
      any: Object.values(drift).some(Boolean),
    },
    catalog,
    choices,
    defaultChoice: choices.find((choice) => choice.isDefault) ?? null,
    activeChoice: choices.find((choice) => choice.isActive) ?? null,
    actions: getLocalModelWorkflowActions(
      defaultModel,
      activeModel,
      targetProvider,
      targetProviderLabel,
      targetEndpoint,
      targetEndpointType,
      restoreReason,
    ),
  };
}

export function getSavedLocalModelWorkflow(config: NemoClawOnboardConfig): SavedLocalModelWorkflow | null {
  const workflow = getLocalModelWorkflow(config);
  if (!workflow) {
    return null;
  }

  return {
    ...workflow,
    activeModelSource: "onboarding",
    activeModelMatchesDefault: true,
  };
}

export function describeOnboardEndpoint(config: NemoClawOnboardConfig): string {
  if (config.endpointUrl === "https://inference.local/v1") {
    return "Managed Inference Route (inference.local)";
  }

  return `${config.endpointType} (${config.endpointUrl})`;
}

export function describeOnboardProvider(config: NemoClawOnboardConfig): string {
  if (config.providerLabel) {
    return config.providerLabel;
  }

  switch (config.endpointType) {
    case "build":
      return "NVIDIA Cloud API";
    case "ollama":
      return "Local Ollama";
    case "vllm":
      return "Local vLLM";
    case "nim-local":
      return "Local NIM";
    case "ncp":
      return "NVIDIA Cloud Partner";
    case "custom":
      return "Managed Inference Route";
    default:
      return "Unknown";
  }
}

let configDirCreated = false;

function ensureConfigDir(): void {
  if (configDirCreated) return;
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  configDirCreated = true;
}

function configPath(): string {
  return join(CONFIG_DIR, "config.json");
}

export function loadOnboardConfig(): NemoClawOnboardConfig | null {
  ensureConfigDir();
  const path = configPath();
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(readFileSync(path, "utf-8")) as NemoClawOnboardConfig;
}

export function saveOnboardConfig(config: NemoClawOnboardConfig): void {
  ensureConfigDir();
  writeFileSync(configPath(), JSON.stringify(config, null, 2));
}

export function clearOnboardConfig(): void {
  const path = configPath();
  if (existsSync(path)) {
    unlinkSync(path);
  }
}
