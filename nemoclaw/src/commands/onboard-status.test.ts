// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadOnboardConfig } from "../onboard/config.js";
import * as onboardStatus from "./onboard-status.js";
import type { PluginLogger } from "../index.js";

vi.mock("../onboard/config.js", async () => {
  const actual =
    await vi.importActual<typeof import("../onboard/config.js")>("../onboard/config.js");
  return {
    ...actual,
    loadOnboardConfig: vi.fn(() => null),
  };
});

function captureLogger(): { lines: string[]; logger: PluginLogger } {
  const lines: string[] = [];
  return {
    lines,
    logger: {
      info: (msg: string) => lines.push(msg),
      warn: (msg: string) => lines.push(`WARN: ${msg}`),
      error: (msg: string) => lines.push(`ERROR: ${msg}`),
      debug: (_msg: string) => {},
    },
  };
}

describe("cliOnboardStatus", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(loadOnboardConfig).mockReturnValue(null);
  });

  it("returns not-configured JSON when no onboarding config exists", async () => {
    await expect(
      onboardStatus.getOnboardStatusData({
        configured: false,
        provider: null,
        model: null,
        endpoint: null,
        query: { ok: false, code: "query-failed", message: null },
      }),
    ).resolves.toEqual({
      configured: false,
      setup: {
        configure: {
          command: "openclaw nemoclaw onboard",
          argv: ["openclaw", "nemoclaw", "onboard"],
          description:
            "Launch NemoClaw onboarding to create the first saved inference configuration.",
          mode: "initial-setup",
        },
      },
      inference: {
        configured: false,
        provider: null,
        model: null,
        endpoint: null,
        query: { ok: false, code: "query-failed", message: null },
      },
      onboarding: null,
      localModelWorkflow: null,
    });
  });

  it("prints a setup hint when no onboarding config exists", async () => {
    const { lines, logger } = captureLogger();

    await onboardStatus.cliOnboardStatus({ json: false, logger });

    const output = lines.join("\n");
    expect(output).toContain("No onboarding configuration found.");
    expect(output).toContain("openclaw nemoclaw onboard");
  });

  it("returns dashboard-friendly onboarding JSON for local workflows", async () => {
    vi.mocked(loadOnboardConfig).mockReturnValue({
      endpointType: "ollama",
      endpointUrl: "http://host.openshell.internal:11434/v1",
      ncpPartner: null,
      model: "qwen3:32b",
      profile: "ollama",
      credentialEnv: "OPENAI_API_KEY",
      provider: "ollama-local",
      providerLabel: "Local Ollama",
      availableModels: ["nemotron-3-nano:30b", "qwen3:32b"],
      onboardedAt: "2026-03-20T22:00:00.000Z",
    });

    await expect(
      onboardStatus.getOnboardStatusData({
        configured: true,
        provider: "ollama-local",
        model: "qwen3:32b",
        endpoint: "http://host.openshell.internal:11434/v1",
        query: { ok: true, code: "ok", message: null },
      }),
    ).resolves.toEqual({
      configured: true,
      setup: {
        configure: {
          command: "openclaw nemoclaw onboard",
          argv: ["openclaw", "nemoclaw", "onboard"],
          description:
            "Launch NemoClaw onboarding to create or update the saved inference configuration.",
          mode: "reconfigure",
        },
      },
      inference: {
        configured: true,
        provider: "ollama-local",
        model: "qwen3:32b",
        endpoint: "http://host.openshell.internal:11434/v1",
        query: { ok: true, code: "ok", message: null },
      },
      onboarding: {
        endpoint: "ollama (http://host.openshell.internal:11434/v1)",
        endpointUrl: "http://host.openshell.internal:11434/v1",
        provider: "Local Ollama",
        providerName: "ollama-local",
        endpointType: "ollama",
        model: "qwen3:32b",
        credentialEnv: "OPENAI_API_KEY",
        profile: "ollama",
        ncpPartner: null,
        localModelCatalog: ["qwen3:32b", "nemotron-3-nano:30b"],
        isLocalEndpoint: true,
        onboardedAt: "2026-03-20T22:00:00.000Z",
        actions: {
          configure: {
            command: "openclaw nemoclaw onboard",
            argv: ["openclaw", "nemoclaw", "onboard"],
            description:
              "Launch NemoClaw onboarding to create or update the saved inference configuration.",
            mode: "reconfigure",
          },
        },
      },
      localModelWorkflow: {
        enabled: true,
        provider: "ollama-local",
        providerLabel: "Local Ollama",
        endpointType: "ollama",
        endpoint: "http://host.openshell.internal:11434/v1",
        defaultModel: "qwen3:32b",
        activeModel: "qwen3:32b",
        activeModelSource: "inference",
        activeModelMatchesDefault: true,
        activeModelInCatalog: true,
        drift: {
          any: false,
          activeModelDiffersFromDefault: false,
          activeModelOutsideCatalog: false,
          providerDiffersFromOnboarding: false,
          endpointDiffersFromOnboarding: false,
        },
        catalog: ["qwen3:32b", "nemotron-3-nano:30b"],
        choices: [
          {
            model: "qwen3:32b",
            label: "qwen3:32b",
            badges: ["default", "active"],
            summary: "default, active",
            isDefault: true,
            isActive: true,
            isSelectable: false,
            inCatalog: true,
            source: "default",
            command: 'openclaw nemoclaw set-local-model "qwen3:32b" --json',
            argv: ["openclaw", "nemoclaw", "set-local-model", "qwen3:32b", "--json"],
            requiresAllowOutsideCatalog: false,
          },
          {
            model: "nemotron-3-nano:30b",
            label: "nemotron-3-nano:30b",
            badges: [],
            summary: "catalog",
            isDefault: false,
            isActive: false,
            isSelectable: true,
            inCatalog: true,
            source: "catalog",
            command: 'openclaw nemoclaw set-local-model "nemotron-3-nano:30b" --json',
            argv: ["openclaw", "nemoclaw", "set-local-model", "nemotron-3-nano:30b", "--json"],
            requiresAllowOutsideCatalog: false,
          },
        ],
        defaultChoice: {
          model: "qwen3:32b",
          label: "qwen3:32b",
          badges: ["default", "active"],
          summary: "default, active",
          isDefault: true,
          isActive: true,
          isSelectable: false,
          inCatalog: true,
          source: "default",
          command: 'openclaw nemoclaw set-local-model "qwen3:32b" --json',
          argv: ["openclaw", "nemoclaw", "set-local-model", "qwen3:32b", "--json"],
          requiresAllowOutsideCatalog: false,
        },
        activeChoice: {
          model: "qwen3:32b",
          label: "qwen3:32b",
          badges: ["default", "active"],
          summary: "default, active",
          isDefault: true,
          isActive: true,
          isSelectable: false,
          inCatalog: true,
          source: "default",
          command: 'openclaw nemoclaw set-local-model "qwen3:32b" --json',
          argv: ["openclaw", "nemoclaw", "set-local-model", "qwen3:32b", "--json"],
          requiresAllowOutsideCatalog: false,
        },
        actions: {
          read: {
            command: "openclaw nemoclaw onboard-status --json",
            argv: ["openclaw", "nemoclaw", "onboard-status", "--json"],
            description:
              "Read saved onboarding and local-model workflow state without querying sandbox health.",
            stateScope: "saved-onboarding-config",
          },
          setActiveModel: {
            command: "openclaw nemoclaw set-local-model <model> --json",
            argvTemplate: ["openclaw", "nemoclaw", "set-local-model", "<model>", "--json"],
            commandAllowOutsideCatalog:
              "openclaw nemoclaw set-local-model <model> --json --allow-outside-catalog",
            argvTemplateAllowOutsideCatalog: [
              "openclaw",
              "nemoclaw",
              "set-local-model",
              "<model>",
              "--json",
              "--allow-outside-catalog",
            ],
            description:
              "Switch the active OpenShell local-model route without changing the saved onboarding default.",
            supportsAllowOutsideCatalog: true,
            allowOutsideCatalogFlag: "--allow-outside-catalog",
            stateScope: "openshell-active-route",
            mutatesSavedDefault: false,
            targetProvider: "ollama-local",
            targetProviderLabel: "Local Ollama",
          },
          restoreDefaultModel: {
            command: 'openclaw nemoclaw set-local-model "qwen3:32b" --json',
            argv: ["openclaw", "nemoclaw", "set-local-model", "qwen3:32b", "--json"],
            description:
              "Restore the active OpenShell local-model route to the saved onboarding default.",
            enabled: false,
            reason: "active route already matches the saved onboarding default.",
            stateScope: "openshell-active-route",
            mutatesSavedDefault: false,
            targetModel: "qwen3:32b",
            targetProvider: "ollama-local",
            targetProviderLabel: "Local Ollama",
          },
        },
      },
    });
  });

  it("prints local catalog/workflow hints for dashboard consumers", async () => {
    vi.mocked(loadOnboardConfig).mockReturnValue({
      endpointType: "ollama",
      endpointUrl: "http://host.openshell.internal:11434/v1",
      ncpPartner: null,
      model: "qwen3:32b",
      profile: "ollama",
      credentialEnv: "OPENAI_API_KEY",
      provider: "ollama-local",
      providerLabel: "Local Ollama",
      availableModels: ["nemotron-3-nano:30b", "qwen3:32b"],
      onboardedAt: "2026-03-20T22:00:00.000Z",
    });

    const { lines, logger } = captureLogger();

    await onboardStatus.cliOnboardStatus({ json: false, logger });

    const output = lines.join("\n");
    expect(output).toContain("Catalog:    qwen3:32b, nemotron-3-nano:30b");
    expect(output).toContain("Saved local catalog/default for dashboard control-plane reads.");
    expect(output).toContain("Local Model Workflow:");
    expect(output).toContain("Default:    qwen3:32b");
    expect(output).toContain("Active:     qwen3:32b");
  });

  it("surfaces live local route drift when inference differs from onboarding default", async () => {
    vi.mocked(loadOnboardConfig).mockReturnValue({
      endpointType: "ollama",
      endpointUrl: "http://host.openshell.internal:11434/v1",
      ncpPartner: null,
      model: "qwen3:32b",
      profile: "ollama",
      credentialEnv: "OPENAI_API_KEY",
      provider: "ollama-local",
      providerLabel: "Local Ollama",
      availableModels: ["nemotron-3-nano:30b", "qwen3:32b"],
      onboardedAt: "2026-03-20T22:00:00.000Z",
    });
    vi.spyOn(onboardStatus, "getInferenceStatus").mockResolvedValue({
      configured: true,
      provider: "vllm-local",
      model: "nemotron-3-nano:30b",
      endpoint: "http://host.openshell.internal:8000/v1",
      query: { ok: true, code: "ok", message: null },
    });

    const data = await onboardStatus.getOnboardStatusData({
      configured: true,
      provider: "vllm-local",
      model: "nemotron-3-nano:30b",
      endpoint: "http://host.openshell.internal:8000/v1",
      query: { ok: true, code: "ok", message: null },
    });

    expect(data.inference).toEqual({
      configured: true,
      provider: "vllm-local",
      model: "nemotron-3-nano:30b",
      endpoint: "http://host.openshell.internal:8000/v1",
      query: { ok: true, code: "ok", message: null },
    });
    expect(data.localModelWorkflow).toMatchObject({
      provider: "vllm-local",
      providerLabel: "Local vLLM",
      endpoint: "http://host.openshell.internal:8000/v1",
      defaultModel: "qwen3:32b",
      activeModel: "nemotron-3-nano:30b",
      activeModelSource: "inference",
      activeModelMatchesDefault: false,
      activeModelInCatalog: true,
      drift: {
        any: true,
        activeModelDiffersFromDefault: true,
        activeModelOutsideCatalog: false,
        providerDiffersFromOnboarding: true,
        endpointDiffersFromOnboarding: true,
      },
    });
  });

  it("prints JSON when requested", async () => {
    vi.mocked(loadOnboardConfig).mockReturnValue({
      endpointType: "build",
      endpointUrl: "https://integrate.api.nvidia.com/v1",
      ncpPartner: null,
      model: "nvidia/nemotron-3-super-120b-a12b",
      profile: "build",
      credentialEnv: "NVIDIA_API_KEY",
      provider: "nvidia",
      providerLabel: "NVIDIA Cloud API",
      onboardedAt: "2026-03-20T22:00:00.000Z",
    });

    const { lines, logger } = captureLogger();

    await onboardStatus.cliOnboardStatus({ json: true, logger });

    const data = JSON.parse(lines.join(""));
    expect(data.configured).toBe(true);
    expect(data.inference).toMatchObject({
      configured: false,
      provider: null,
      model: null,
      endpoint: null,
    });
    expect(data.onboarding.provider).toBe("NVIDIA Cloud API");
    expect(data.onboarding.providerName).toBe("nvidia");
    expect(data.onboarding.endpointUrl).toBe("https://integrate.api.nvidia.com/v1");
    expect(data.localModelWorkflow).toBeNull();
  });
});
