// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadOnboardConfig } from "../onboard/config.js";
import { cliSetLocalModel } from "./set-local-model.js";
import { cliRestoreLocalModel } from "./restore-local-model.js";
import type { PluginLogger } from "../index.js";

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

function createLogger(): PluginLogger {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  };
}

describe("cliRestoreLocalModel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(loadOnboardConfig).mockReturnValue(null);
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

  it("falls back to the shared local-model error path when onboarding is missing", () => {
    cliRestoreLocalModel({ json: false, logger: createLogger() });

    expect(cliSetLocalModel).toHaveBeenCalledWith({
      model: "",
      allowOutsideCatalog: false,
      json: false,
      logger: expect.any(Object),
    });
  });

  it("falls back to the shared local-model error path for non-local onboarding", () => {
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

    cliRestoreLocalModel({ json: false, logger: createLogger() });

    expect(cliSetLocalModel).toHaveBeenCalledWith({
      model: "",
      allowOutsideCatalog: false,
      json: false,
      logger: expect.any(Object),
    });
  });
});
