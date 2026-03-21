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
  isDefault: boolean;
  isActive: boolean;
  inCatalog: boolean;
  source: "default" | "catalog" | "active-route";
  command: string;
  requiresAllowOutsideCatalog: boolean;
}

export interface LocalModelWorkflowActions {
  read: {
    command: "openclaw nemoclaw onboard-status --json";
    description: string;
  };
  setActiveModel: {
    command: "openclaw nemoclaw set-local-model <model> --json";
    description: string;
    supportsAllowOutsideCatalog: boolean;
    allowOutsideCatalogFlag: "--allow-outside-catalog";
  };
}

export interface SavedLocalModelWorkflow {
  enabled: true;
  provider: string | null;
  providerLabel: string;
  endpointType: EndpointType;
  endpoint: string;
  defaultModel: string;
  activeModel: string;
  activeModelSource: "onboarding";
  activeModelMatchesDefault: true;
  activeModelInCatalog: boolean;
  catalog: string[];
  choices: LocalModelChoice[];
  actions: LocalModelWorkflowActions;
}

export function buildLocalModelChoices(
  defaultModel: string,
  activeModel: string,
  catalog: string[],
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
      return {
        model,
        label: model,
        isDefault: model === defaultModel,
        isActive: model === activeModel,
        inCatalog,
        source: model === activeModel && !inCatalog
          ? "active-route"
          : model === defaultModel
            ? "default"
            : "catalog",
        command: `openclaw nemoclaw set-local-model ${JSON.stringify(model)} --json${requiresAllowOutsideCatalog ? " --allow-outside-catalog" : ""}`,
        requiresAllowOutsideCatalog,
      };
    });
}

export function getLocalModelWorkflowActions(): LocalModelWorkflowActions {
  return {
    read: {
      command: "openclaw nemoclaw onboard-status --json",
      description: "Read saved onboarding and local-model workflow state without querying sandbox health.",
    },
    setActiveModel: {
      command: "openclaw nemoclaw set-local-model <model> --json",
      description: "Switch the active OpenShell local-model route without changing the saved onboarding default.",
      supportsAllowOutsideCatalog: true,
      allowOutsideCatalogFlag: "--allow-outside-catalog",
    },
  };
}

export function getSavedLocalModelWorkflow(config: NemoClawOnboardConfig): SavedLocalModelWorkflow | null {
  if (!isLocalEndpointType(config.endpointType)) {
    return null;
  }

  const catalog = getConfiguredModelCatalog(config);
  const defaultModel = config.model.trim();

  return {
    enabled: true,
    provider: config.provider ?? null,
    providerLabel: describeOnboardProvider(config),
    endpointType: config.endpointType,
    endpoint: config.endpointUrl,
    defaultModel,
    activeModel: defaultModel,
    activeModelSource: "onboarding",
    activeModelMatchesDefault: true,
    activeModelInCatalog: catalog.includes(defaultModel),
    catalog,
    choices: buildLocalModelChoices(defaultModel, defaultModel, catalog),
    actions: getLocalModelWorkflowActions(),
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
