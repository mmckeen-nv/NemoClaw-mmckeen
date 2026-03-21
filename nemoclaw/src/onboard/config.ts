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
  argv: string[];
  requiresAllowOutsideCatalog: boolean;
}

export interface LocalModelWorkflowActions {
  read: {
    command: "openclaw nemoclaw onboard-status --json";
    argv: ["openclaw", "nemoclaw", "onboard-status", "--json"];
    description: string;
  };
  setActiveModel: {
    command: "openclaw nemoclaw set-local-model <model> --json";
    argvTemplate: ["openclaw", "nemoclaw", "set-local-model", "<model>", "--json"];
    description: string;
    supportsAllowOutsideCatalog: boolean;
    allowOutsideCatalogFlag: "--allow-outside-catalog";
  };
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
  catalog: string[];
  choices: LocalModelChoice[];
  actions: LocalModelWorkflowActions;
}

export interface SavedLocalModelWorkflow extends LocalModelWorkflow {
  activeModelSource: "onboarding";
  activeModelMatchesDefault: true;
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
      const argv = ["openclaw", "nemoclaw", "set-local-model", model, "--json"];
      if (requiresAllowOutsideCatalog) {
        argv.push("--allow-outside-catalog");
      }
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
        argv,
        requiresAllowOutsideCatalog,
      };
    });
}

export function getLocalModelWorkflowActions(): LocalModelWorkflowActions {
  return {
    read: {
      command: "openclaw nemoclaw onboard-status --json",
      argv: ["openclaw", "nemoclaw", "onboard-status", "--json"],
      description: "Read saved onboarding and local-model workflow state without querying sandbox health.",
    },
    setActiveModel: {
      command: "openclaw nemoclaw set-local-model <model> --json",
      argvTemplate: ["openclaw", "nemoclaw", "set-local-model", "<model>", "--json"],
      description: "Switch the active OpenShell local-model route without changing the saved onboarding default.",
      supportsAllowOutsideCatalog: true,
      allowOutsideCatalogFlag: "--allow-outside-catalog",
    },
  };
}

export function getLocalModelWorkflow(
  config: NemoClawOnboardConfig,
  inference?: {
    configured: boolean;
    provider: string | null;
    model: string | null;
  },
): LocalModelWorkflow | null {
  if (!isLocalEndpointType(config.endpointType)) {
    return null;
  }

  const catalog = getConfiguredModelCatalog(config);
  const defaultModel = config.model.trim();
  const inferenceModel = inference?.configured ? inference.model?.trim() ?? null : null;
  const activeModel = inferenceModel || defaultModel;

  return {
    enabled: true,
    provider: config.provider ?? inference?.provider ?? null,
    providerLabel: describeOnboardProvider(config),
    endpointType: config.endpointType,
    endpoint: config.endpointUrl,
    defaultModel,
    activeModel,
    activeModelSource: inferenceModel ? "inference" : "onboarding",
    activeModelMatchesDefault: activeModel === defaultModel,
    activeModelInCatalog: catalog.includes(activeModel),
    catalog,
    choices: buildLocalModelChoices(defaultModel, activeModel, catalog),
    actions: getLocalModelWorkflowActions(),
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
