// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  buildLocalModelChoices,
  describeLocalModelWorkflowDrift,
  getConfiguredModelCatalog,
  getLocalModelWorkflow,
  getSavedLocalModelWorkflow,
  isLocalEndpointType,
  type NemoClawOnboardConfig,
} from "./config.js";

function config(overrides: Partial<NemoClawOnboardConfig> = {}): NemoClawOnboardConfig {
  return {
    endpointType: "ollama",
    endpointUrl: "http://host.openshell.internal:11434/v1",
    ncpPartner: null,
    model: "nemotron-3-nano:30b",
    profile: "ollama",
    credentialEnv: "OPENAI_API_KEY",
    provider: "ollama-local",
    providerLabel: "Local Ollama",
    onboardedAt: "2026-03-20T22:08:00.000Z",
    ...overrides,
  };
}

describe("onboard config helpers", () => {
  it("identifies local endpoint types", () => {
    expect(isLocalEndpointType("ollama")).toBe(true);
    expect(isLocalEndpointType("vllm")).toBe(true);
    expect(isLocalEndpointType("nim-local")).toBe(true);
    expect(isLocalEndpointType("build")).toBe(false);
    expect(isLocalEndpointType("ncp")).toBe(false);
  });

  it("returns the selected model first and de-duplicates the catalog", () => {
    expect(
      getConfiguredModelCatalog(
        config({
          availableModels: ["llama3.3:70b", "nemotron-3-nano:30b", "llama3.3:70b", "qwen2.5:32b"],
        }),
      ),
    ).toEqual(["nemotron-3-nano:30b", "llama3.3:70b", "qwen2.5:32b"]);
  });

  it("falls back to the primary model when no catalog is stored", () => {
    expect(getConfiguredModelCatalog(config({ availableModels: undefined }))).toEqual([
      "nemotron-3-nano:30b",
    ]);
  });

  it("describes local workflow drift with all saved-vs-live reasons", () => {
    expect(
      describeLocalModelWorkflowDrift({
        drift: {
          any: true,
          activeModelDiffersFromDefault: true,
          activeModelOutsideCatalog: false,
          providerDiffersFromOnboarding: true,
          endpointDiffersFromOnboarding: true,
        },
      }),
    ).toBe(
      "active model differs from saved default; provider differs from saved onboarding provider; endpoint differs from saved onboarding endpoint",
    );
  });

  it("builds saved local workflow metadata for dashboard consumers", () => {
    expect(
      getSavedLocalModelWorkflow(
        config({
          availableModels: ["llama3.3:70b", "nemotron-3-nano:30b", "qwen2.5:32b"],
        }),
      ),
    ).toEqual({
      enabled: true,
      provider: "ollama-local",
      providerLabel: "Local Ollama",
      endpointType: "ollama",
      endpoint: "http://host.openshell.internal:11434/v1",
      defaultModel: "nemotron-3-nano:30b",
      activeModel: "nemotron-3-nano:30b",
      activeModelSource: "onboarding",
      activeModelMatchesDefault: true,
      activeModelInCatalog: true,
      drift: {
        any: false,
        activeModelDiffersFromDefault: false,
        activeModelOutsideCatalog: false,
        providerDiffersFromOnboarding: false,
        endpointDiffersFromOnboarding: false,
      },
      catalog: ["nemotron-3-nano:30b", "llama3.3:70b", "qwen2.5:32b"],
      choices: [
        {
          model: "nemotron-3-nano:30b",
          label: "nemotron-3-nano:30b",
          badges: ["default", "active"],
          summary: "default, active",
          isDefault: true,
          isActive: true,
          isSelectable: false,
          inCatalog: true,
          source: "default",
          command: 'openclaw nemoclaw set-local-model "nemotron-3-nano:30b" --json',
          argv: ["openclaw", "nemoclaw", "set-local-model", "nemotron-3-nano:30b", "--json"],
          requiresAllowOutsideCatalog: false,
        },
        {
          model: "llama3.3:70b",
          label: "llama3.3:70b",
          badges: [],
          summary: "catalog",
          isDefault: false,
          isActive: false,
          isSelectable: true,
          inCatalog: true,
          source: "catalog",
          command: 'openclaw nemoclaw set-local-model "llama3.3:70b" --json',
          argv: ["openclaw", "nemoclaw", "set-local-model", "llama3.3:70b", "--json"],
          requiresAllowOutsideCatalog: false,
        },
        {
          model: "qwen2.5:32b",
          label: "qwen2.5:32b",
          badges: [],
          summary: "catalog",
          isDefault: false,
          isActive: false,
          isSelectable: true,
          inCatalog: true,
          source: "catalog",
          command: 'openclaw nemoclaw set-local-model "qwen2.5:32b" --json',
          argv: ["openclaw", "nemoclaw", "set-local-model", "qwen2.5:32b", "--json"],
          requiresAllowOutsideCatalog: false,
        },
      ],
      defaultChoice: {
        model: "nemotron-3-nano:30b",
        label: "nemotron-3-nano:30b",
        badges: ["default", "active"],
        summary: "default, active",
        isDefault: true,
        isActive: true,
          isSelectable: false,
        inCatalog: true,
        source: "default",
        command: 'openclaw nemoclaw set-local-model "nemotron-3-nano:30b" --json',
        argv: ["openclaw", "nemoclaw", "set-local-model", "nemotron-3-nano:30b", "--json"],
        requiresAllowOutsideCatalog: false,
      },
      activeChoice: {
        model: "nemotron-3-nano:30b",
        label: "nemotron-3-nano:30b",
        badges: ["default", "active"],
        summary: "default, active",
        isDefault: true,
        isActive: true,
          isSelectable: false,
        inCatalog: true,
        source: "default",
        command: 'openclaw nemoclaw set-local-model "nemotron-3-nano:30b" --json',
        argv: ["openclaw", "nemoclaw", "set-local-model", "nemotron-3-nano:30b", "--json"],
        requiresAllowOutsideCatalog: false,
      },
      actions: {
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
          argvTemplateAllowOutsideCatalog: ["openclaw", "nemoclaw", "set-local-model", "<model>", "--json", "--allow-outside-catalog"],
          description: "Switch the active OpenShell local-model route without changing the saved onboarding default.",
          supportsAllowOutsideCatalog: true,
          allowOutsideCatalogFlag: "--allow-outside-catalog",
          stateScope: "openshell-active-route",
          mutatesSavedDefault: false,
          targetProvider: "ollama-local",
          targetProviderLabel: "Local Ollama",
        },
        restoreDefaultModel: {
          command: "openclaw nemoclaw set-local-model \"nemotron-3-nano:30b\" --json",
          argv: ["openclaw", "nemoclaw", "set-local-model", "nemotron-3-nano:30b", "--json"],
          description: "Restore the active OpenShell local-model route to the saved onboarding default.",
          enabled: false,
          reason: "active route already matches the saved onboarding default.",
          stateScope: "openshell-active-route",
          mutatesSavedDefault: false,
          targetModel: "nemotron-3-nano:30b",
          targetProvider: "ollama-local",
          targetProviderLabel: "Local Ollama",
        },
      },
    });
  });

  it("adds the active route as a dashboard choice when it drifts outside the saved catalog", () => {
    expect(buildLocalModelChoices("qwen3:32b", "nemotron-3-super-120b", ["qwen3:32b", "llama3.3:70b"]))
      .toEqual([
        {
          model: "qwen3:32b",
          label: "qwen3:32b",
          badges: ["default"],
          summary: "default",
          isDefault: true,
          isActive: false,
          isSelectable: true,
          inCatalog: true,
          source: "default",
          command: 'openclaw nemoclaw set-local-model "qwen3:32b" --json',
          argv: ["openclaw", "nemoclaw", "set-local-model", "qwen3:32b", "--json"],
          requiresAllowOutsideCatalog: false,
        },
        {
          model: "llama3.3:70b",
          label: "llama3.3:70b",
          badges: [],
          summary: "catalog",
          isDefault: false,
          isActive: false,
          isSelectable: true,
          inCatalog: true,
          source: "catalog",
          command: 'openclaw nemoclaw set-local-model "llama3.3:70b" --json',
          argv: ["openclaw", "nemoclaw", "set-local-model", "llama3.3:70b", "--json"],
          requiresAllowOutsideCatalog: false,
        },
        {
          model: "nemotron-3-super-120b",
          label: "nemotron-3-super-120b",
          badges: ["active", "outside-catalog"],
          summary: "active, outside-catalog",
          isDefault: false,
          isActive: true,
          isSelectable: false,
          inCatalog: false,
          source: "active-route",
          command: 'openclaw nemoclaw set-local-model "nemotron-3-super-120b" --json --allow-outside-catalog',
          argv: ["openclaw", "nemoclaw", "set-local-model", "nemotron-3-super-120b", "--json", "--allow-outside-catalog"],
          requiresAllowOutsideCatalog: true,
        },
      ]);
  });

  it("prefers the live OpenShell provider and endpoint when the active route drifts", () => {
    expect(
      getLocalModelWorkflow(
        config({
          endpointType: "ollama",
          endpointUrl: "http://host.openshell.internal:11434/v1",
          provider: "ollama-local",
          providerLabel: "Local Ollama",
          availableModels: ["qwen3:32b", "nemotron-3-nano:30b"],
        }),
        {
          configured: true,
          provider: "vllm-local",
          model: "qwen3:32b",
          endpoint: "http://host.openshell.internal:8000/v1",
        },
      ),
    ).toMatchObject({
      provider: "vllm-local",
      providerLabel: "Local vLLM",
      endpoint: "http://host.openshell.internal:8000/v1",
      activeModel: "qwen3:32b",
      activeModelSource: "inference",
      drift: {
        any: true,
        activeModelDiffersFromDefault: true,
        activeModelOutsideCatalog: false,
        providerDiffersFromOnboarding: true,
        endpointDiffersFromOnboarding: true,
      },
    });
  });

  it("keeps restore-default enabled when provider drift exists without model drift", () => {
    expect(
      getLocalModelWorkflow(
        config({
          endpointType: "ollama",
          endpointUrl: "http://host.openshell.internal:11434/v1",
          provider: "ollama-local",
          providerLabel: "Local Ollama",
          model: "qwen3:32b",
          availableModels: ["qwen3:32b", "nemotron-3-nano:30b"],
        }),
        {
          configured: true,
          provider: "vllm-local",
          model: "qwen3:32b",
          endpoint: "http://host.openshell.internal:8000/v1",
        },
      ),
    ).toMatchObject({
      activeModel: "qwen3:32b",
      activeModelMatchesDefault: true,
      drift: {
        any: true,
        activeModelDiffersFromDefault: false,
        providerDiffersFromOnboarding: true,
        endpointDiffersFromOnboarding: true,
      },
      actions: {
        restoreDefaultModel: {
          enabled: true,
          reason: "active route provider differs from the saved onboarding provider.",
          targetModel: "qwen3:32b",
          targetProvider: "vllm-local",
          targetProviderLabel: "Local vLLM",
        },
      },
    });
  });

  it("returns null saved workflow metadata for non-local endpoints", () => {
    expect(getSavedLocalModelWorkflow(config({ endpointType: "build" }))).toBeNull();
  });
});
