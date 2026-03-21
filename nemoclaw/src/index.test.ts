// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileSyncMock = vi.fn();
const registerCliCommandsMock = vi.fn();
const handleSlashCommandMock = vi.fn();
const loadOnboardConfigMock = vi.fn();

vi.mock("node:child_process", () => ({
  execFileSync: execFileSyncMock,
}));

vi.mock("./cli.js", () => ({
  registerCliCommands: registerCliCommandsMock,
}));

vi.mock("./commands/slash.js", () => ({
  handleSlashCommand: handleSlashCommandMock,
}));

vi.mock("./onboard/config.js", async () => {
  const actual = await vi.importActual<typeof import("./onboard/config.js")>("./onboard/config.js");
  return {
    ...actual,
    loadOnboardConfig: loadOnboardConfigMock,
  };
});

describe("NemoClaw plugin registration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    loadOnboardConfigMock.mockReturnValue(null);
    execFileSyncMock.mockImplementation(() => {
      throw new Error("openshell unavailable");
    });
  });

  it("registers local workflow provider models with live-route badges for dashboard consumers", async () => {
    loadOnboardConfigMock.mockReturnValue({
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
    execFileSyncMock.mockReturnValue(
      JSON.stringify({
        provider: "ollama-local",
        model: "llama3.3:70b",
        endpoint: "http://host.openshell.internal:11434/v1",
      }),
    );

    const { default: register } = await import("./index.js");

    const registerProvider = vi.fn();
    register({
      id: "nemoclaw",
      name: "NemoClaw",
      config: {},
      pluginConfig: {},
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      registerCommand: vi.fn(),
      registerCli: vi.fn(),
      registerProvider,
      registerService: vi.fn(),
      resolvePath: vi.fn(),
      on: vi.fn(),
    });

    const provider = registerProvider.mock.calls[0]?.[0];
    expect(provider?.models?.chat).toEqual([
      {
        id: "inference/qwen3:32b",
        label: "qwen3:32b (default)",
        contextWindow: 131072,
        maxOutput: 8192,
      },
      {
        id: "inference/nemotron-3-nano:30b",
        label: "nemotron-3-nano:30b",
        contextWindow: 131072,
        maxOutput: 8192,
      },
      {
        id: "inference/llama3.3:70b",
        label: "llama3.3:70b (active, outside-catalog)",
        contextWindow: 131072,
        maxOutput: 8192,
      },
    ]);
  });

  it("falls back to saved local workflow metadata when the live route cannot be queried", async () => {
    loadOnboardConfigMock.mockReturnValue({
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

    const { default: register } = await import("./index.js");

    const registerProvider = vi.fn();
    register({
      id: "nemoclaw",
      name: "NemoClaw",
      config: {},
      pluginConfig: {},
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      registerCommand: vi.fn(),
      registerCli: vi.fn(),
      registerProvider,
      registerService: vi.fn(),
      resolvePath: vi.fn(),
      on: vi.fn(),
    });

    const provider = registerProvider.mock.calls[0]?.[0];
    expect(provider?.models?.chat).toEqual([
      {
        id: "inference/qwen3:32b",
        label: "qwen3:32b (default, active)",
        contextWindow: 131072,
        maxOutput: 8192,
      },
      {
        id: "inference/nemotron-3-nano:30b",
        label: "nemotron-3-nano:30b",
        contextWindow: 131072,
        maxOutput: 8192,
      },
    ]);
  });
});
