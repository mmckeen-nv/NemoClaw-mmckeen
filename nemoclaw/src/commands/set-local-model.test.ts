// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { loadOnboardConfig } from "../onboard/config.js";
import { cliSetLocalModel } from "./set-local-model.js";
import type { PluginLogger } from "../index.js";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

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

describe("cliSetLocalModel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(loadOnboardConfig).mockReturnValue(null);
  });

  it("requires onboarding config", async () => {
    const { lines, logger } = captureLogger();

    await cliSetLocalModel({
      model: "qwen3:32b",
      allowOutsideCatalog: false,
      json: false,
      logger,
    });

    expect(lines.join("\n")).toContain("No onboarding configuration found");
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("rejects non-local onboarding configs", async () => {
    vi.mocked(loadOnboardConfig).mockReturnValue({
      endpointType: "build",
      endpointUrl: "https://integrate.api.nvidia.com/v1",
      ncpPartner: null,
      model: "nvidia/nemotron-3-super-120b-a12b",
      profile: "build",
      credentialEnv: "NVIDIA_API_KEY",
      provider: "nvidia-nim",
      providerLabel: "NVIDIA Cloud API",
      onboardedAt: "2026-03-20T22:00:00.000Z",
    });

    const { lines, logger } = captureLogger();

    await cliSetLocalModel({
      model: "qwen3:32b",
      allowOutsideCatalog: false,
      json: false,
      logger,
    });

    expect(lines.join("\n")).toContain("not a local endpoint");
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("returns structured JSON when onboarding is missing", async () => {
    const { lines, logger } = captureLogger();

    await cliSetLocalModel({
      model: "qwen3:32b",
      allowOutsideCatalog: false,
      json: true,
      logger,
    });

    expect(JSON.parse(lines.join(""))).toEqual({
      ok: false,
      code: "ONBOARDING_REQUIRED",
      message: "No onboarding configuration found. Run 'openclaw nemoclaw onboard' first.",
      model: "qwen3:32b",
      hint: "Run 'openclaw nemoclaw onboard' first.",
    });
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("rejects models outside the saved catalog by default", async () => {
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

    const { lines, logger } = captureLogger();

    await cliSetLocalModel({
      model: "llama3.3:70b",
      allowOutsideCatalog: false,
      json: false,
      logger,
    });

    const output = lines.join("\n");
    expect(output).toContain("outside the saved local catalog");
    expect(output).toContain("Saved catalog: qwen3:32b, nemotron-3-nano:30b");
    expect(output).toContain("Use --allow-outside-catalog");
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("returns structured JSON when the requested model is outside the saved catalog", async () => {
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

    const { lines, logger } = captureLogger();

    await cliSetLocalModel({
      model: "llama3.3:70b",
      allowOutsideCatalog: false,
      json: true,
      logger,
    });

    expect(JSON.parse(lines.join(""))).toEqual({
      ok: false,
      code: "MODEL_OUTSIDE_CATALOG",
      message: "Model 'llama3.3:70b' is outside the saved local catalog.",
      model: "llama3.3:70b",
      endpointType: "ollama",
      endpoint: "http://host.openshell.internal:11434/v1",
      provider: "ollama-local",
      providerLabel: "Local Ollama",
      defaultModel: "qwen3:32b",
      catalog: ["qwen3:32b", "nemotron-3-nano:30b"],
      choices: [
        {
          model: "qwen3:32b",
          label: "qwen3:32b",
          badges: ["default", "active"],
          summary: "default, active",
          isDefault: true,
          isActive: true,
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
          inCatalog: true,
          source: "catalog",
          command: 'openclaw nemoclaw set-local-model "nemotron-3-nano:30b" --json',
          argv: ["openclaw", "nemoclaw", "set-local-model", "nemotron-3-nano:30b", "--json"],
          requiresAllowOutsideCatalog: false,
        },
      ],
      actions: {
        read: {
          command: "openclaw nemoclaw onboard-status --json",
          argv: ["openclaw", "nemoclaw", "onboard-status", "--json"],
          description: "Read saved onboarding and local-model workflow state without querying sandbox health.",
        },
        setActiveModel: {
          command: "openclaw nemoclaw set-local-model <model> --json",
          argvTemplate: ["openclaw", "nemoclaw", "set-local-model", "<model>", "--json"],
          commandAllowOutsideCatalog: "openclaw nemoclaw set-local-model <model> --json --allow-outside-catalog",
          argvTemplateAllowOutsideCatalog: ["openclaw", "nemoclaw", "set-local-model", "<model>", "--json", "--allow-outside-catalog"],
          description: "Switch the active OpenShell local-model route without changing the saved onboarding default.",
          supportsAllowOutsideCatalog: true,
          allowOutsideCatalogFlag: "--allow-outside-catalog",
        },
        restoreDefaultModel: {
          command: "openclaw nemoclaw set-local-model \"qwen3:32b\" --json",
          argv: ["openclaw", "nemoclaw", "set-local-model", "qwen3:32b", "--json"],
          description: "Restore the active OpenShell local-model route to the saved onboarding default.",
        },
      },
      hint: "Saved catalog: qwen3:32b, nemotron-3-nano:30b\nUse --allow-outside-catalog to force a one-off route change.",
    });
    expect(execFileSync).not.toHaveBeenCalled();
  });

  it("switches to a saved local model and prints summary text", async () => {
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
    vi.mocked(execFileSync).mockReturnValue("");

    const { lines, logger } = captureLogger();

    await cliSetLocalModel({
      model: "nemotron-3-nano:30b",
      allowOutsideCatalog: false,
      json: false,
      logger,
    });

    expect(execFileSync).toHaveBeenCalledWith(
      "openshell",
      ["inference", "set", "--provider", "ollama-local", "--model", "nemotron-3-nano:30b"],
      expect.anything(),
    );
    const output = lines.join("\n");
    expect(output).toContain("NemoClaw Local Model Route");
    expect(output).toContain("Default:  qwen3:32b");
    expect(output).toContain("Active:   nemotron-3-nano:30b");
    expect(output).toContain("active route differs from saved default");
    expect(output).toContain("active route is in saved catalog");
  });

  it("allows one-off routes outside the saved catalog when forced and returns JSON", async () => {
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
    vi.mocked(execFileSync).mockReturnValue("");

    const { lines, logger } = captureLogger();

    await cliSetLocalModel({
      model: "llama3.3:70b",
      allowOutsideCatalog: true,
      json: true,
      logger,
    });

    const data = JSON.parse(lines.join(""));
    expect(data).toEqual({
      ok: true,
      provider: "ollama-local",
      providerLabel: "Local Ollama",
      endpointType: "ollama",
      endpoint: "http://host.openshell.internal:11434/v1",
      defaultModel: "qwen3:32b",
      activeModel: "llama3.3:70b",
      activeModelSource: "inference",
      activeModelMatchesDefault: false,
      activeModelInCatalog: false,
      catalog: ["qwen3:32b", "nemotron-3-nano:30b"],
      choices: [
        {
          model: "qwen3:32b",
          label: "qwen3:32b",
          badges: ["default"],
          summary: "default",
          isDefault: true,
          isActive: false,
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
          inCatalog: true,
          source: "catalog",
          command: 'openclaw nemoclaw set-local-model "nemotron-3-nano:30b" --json',
          argv: ["openclaw", "nemoclaw", "set-local-model", "nemotron-3-nano:30b", "--json"],
          requiresAllowOutsideCatalog: false,
        },
        {
          model: "llama3.3:70b",
          label: "llama3.3:70b",
          badges: ["active", "outside-catalog"],
          summary: "active, outside-catalog",
          isDefault: false,
          isActive: true,
          inCatalog: false,
          source: "active-route",
          command: 'openclaw nemoclaw set-local-model "llama3.3:70b" --json --allow-outside-catalog',
          argv: ["openclaw", "nemoclaw", "set-local-model", "llama3.3:70b", "--json", "--allow-outside-catalog"],
          requiresAllowOutsideCatalog: true,
        },
      ],
      defaultChoice: {
        model: "qwen3:32b",
        label: "qwen3:32b",
        badges: ["default"],
        summary: "default",
        isDefault: true,
        isActive: false,
        inCatalog: true,
        source: "default",
        command: 'openclaw nemoclaw set-local-model "qwen3:32b" --json',
        argv: ["openclaw", "nemoclaw", "set-local-model", "qwen3:32b", "--json"],
        requiresAllowOutsideCatalog: false,
      },
      activeChoice: {
        model: "llama3.3:70b",
        label: "llama3.3:70b",
        badges: ["active", "outside-catalog"],
        summary: "active, outside-catalog",
        isDefault: false,
        isActive: true,
        inCatalog: false,
        source: "active-route",
        command: 'openclaw nemoclaw set-local-model "llama3.3:70b" --json --allow-outside-catalog',
        argv: ["openclaw", "nemoclaw", "set-local-model", "llama3.3:70b", "--json", "--allow-outside-catalog"],
        requiresAllowOutsideCatalog: true,
      },
      actions: {
        read: {
          command: "openclaw nemoclaw onboard-status --json",
          argv: ["openclaw", "nemoclaw", "onboard-status", "--json"],
          description: "Read saved onboarding and local-model workflow state without querying sandbox health.",
        },
        setActiveModel: {
          command: "openclaw nemoclaw set-local-model <model> --json",
          argvTemplate: ["openclaw", "nemoclaw", "set-local-model", "<model>", "--json"],
          commandAllowOutsideCatalog: "openclaw nemoclaw set-local-model <model> --json --allow-outside-catalog",
          argvTemplateAllowOutsideCatalog: ["openclaw", "nemoclaw", "set-local-model", "<model>", "--json", "--allow-outside-catalog"],
          description: "Switch the active OpenShell local-model route without changing the saved onboarding default.",
          supportsAllowOutsideCatalog: true,
          allowOutsideCatalogFlag: "--allow-outside-catalog",
        },
        restoreDefaultModel: {
          command: "openclaw nemoclaw set-local-model \"qwen3:32b\" --json",
          argv: ["openclaw", "nemoclaw", "set-local-model", "qwen3:32b", "--json"],
          description: "Restore the active OpenShell local-model route to the saved onboarding default.",
        },
      },
    });
  });
});
