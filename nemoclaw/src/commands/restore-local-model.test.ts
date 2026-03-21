// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { loadOnboardConfig } from "../onboard/config.js";
import { cliSetLocalModel } from "./set-local-model.js";
import { cliRestoreLocalModel } from "./restore-local-model.js";
import type { PluginLogger } from "../index.js";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(() => {
    throw new Error("openshell unavailable");
  }),
}));

vi.mock("../onboard/config.js", async () => {
  const actual = await vi.importActual<typeof import("../onboard/config.js")>(
    "../onboard/config.js",
  );
  return {
    ...actual,
    loadOnboardConfig: vi.fn(() => null),
  };
});

vi.mock("./set-local-model.js", () => ({
  cliSetLocalModel: vi.fn(),
}));

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } satisfies PluginLogger;
}

describe("cliRestoreLocalModel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(loadOnboardConfig).mockReturnValue(null);
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("openshell unavailable");
    });
  });

  it("routes local onboarding back to the saved default model", () => {
    vi.mocked(loadOnboardConfig).mockReturnValue({
      endpointType: "ollama",
      endpointUrl: "http://host.openshell.internal:11434/v1",
      ncpPartner: null,
      model: "qwen3:32b",
      profile: "ollama",
      credentialEnv: "OPENAI_API_KEY",
      provider: "ollama-local",
      providerLabel: "Local Ollama",
      availableModels: ["qwen3:32b", "nemotron-3-nano:30b"],
      onboardedAt: "2026-03-20T22:00:00.000Z",
    });

    cliRestoreLocalModel({ json: true, logger: createLogger() });

    expect(cliSetLocalModel).toHaveBeenCalledWith({
      model: "qwen3:32b",
      allowOutsideCatalog: false,
      json: true,
      logger: expect.any(Object),
    });
  });

  it("returns a no-op success when the live route already matches the saved default", () => {
    const logger = createLogger();
    vi.mocked(loadOnboardConfig).mockReturnValue({
      endpointType: "ollama",
      endpointUrl: "http://host.openshell.internal:11434/v1",
      ncpPartner: null,
      model: "qwen3:32b",
      profile: "ollama",
      credentialEnv: "OPENAI_API_KEY",
      provider: "ollama-local",
      providerLabel: "Local Ollama",
      availableModels: ["qwen3:32b", "nemotron-3-nano:30b"],
      onboardedAt: "2026-03-20T22:00:00.000Z",
    });
    vi.mocked(execFileSync).mockReturnValue(
      JSON.stringify({
        provider: "ollama-local",
        model: "qwen3:32b",
        endpoint: "http://host.openshell.internal:11434/v1",
      }),
    );

    cliRestoreLocalModel({ json: true, logger });

    expect(cliSetLocalModel).not.toHaveBeenCalled();
    expect(JSON.parse(vi.mocked(logger.info).mock.calls[0]?.[0] as string)).toMatchObject({
      generatedAt: expect.any(String),
      ok: true,
      noop: true,
      selectionScope: "sandbox-global",
      selectionMode: "single-active-route",
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
      actions: {
        restoreDefaultModel: {
          enabled: false,
          reason: "active route already matches the saved onboarding default.",
          reasonCode: "active-route-already-matches-saved-default",
        },
      },
    });
  });

  it("returns a restore-specific onboarding error when onboarding is missing", () => {
    const logger = createLogger();

    cliRestoreLocalModel({ json: true, logger });

    expect(cliSetLocalModel).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(JSON.parse(vi.mocked(logger.info).mock.calls[0]?.[0] as string)).toMatchObject({
      generatedAt: expect.any(String),
      ok: false,
      code: "ONBOARDING_REQUIRED",
      message: "No onboarding configuration found. Run 'openclaw nemoclaw onboard' first.",
      hint: "Run 'openclaw nemoclaw onboard' first.",
      setup: {
        configure: {
          command: "openclaw nemoclaw onboard",
          argv: ["openclaw", "nemoclaw", "onboard"],
          description: "Launch NemoClaw onboarding to create the first saved inference configuration.",
          mode: "initial-setup",
          stateScope: "saved-onboarding-config",
          mutatesSavedDefault: true,
        },
      },
    });
  });

  it("returns a restore-specific non-local workflow error", () => {
    const logger = createLogger();
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

    cliRestoreLocalModel({ json: true, logger });

    expect(cliSetLocalModel).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(JSON.parse(vi.mocked(logger.info).mock.calls[0]?.[0] as string)).toMatchObject({
      generatedAt: expect.any(String),
      ok: false,
      code: "NON_LOCAL_WORKFLOW",
      message: "Saved onboarding uses 'build', not a local endpoint. This command only supports local workflows.",
      endpointType: "build",
      endpoint: "https://integrate.api.nvidia.com/v1",
      provider: "nvidia",
      providerLabel: "NVIDIA Cloud API",
      defaultModel: "nvidia/nemotron-3-super-120b-a12b",
      catalog: ["nvidia/nemotron-3-super-120b-a12b"],
      setup: {
        configure: {
          command: "openclaw nemoclaw onboard",
          argv: ["openclaw", "nemoclaw", "onboard"],
          description: "Launch NemoClaw onboarding to create or update the saved inference configuration.",
          mode: "reconfigure",
          stateScope: "saved-onboarding-config",
          mutatesSavedDefault: true,
        },
      },
    });
  });
});
