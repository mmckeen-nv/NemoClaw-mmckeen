---
title:
  page: "Switch NemoClaw Inference Models at Runtime"
  nav: "Switch Inference Models"
description: "Change the active inference model without restarting the sandbox."
keywords: ["switch nemoclaw inference model", "change inference runtime"]
topics: ["generative_ai", "ai_agents"]
tags: ["openclaw", "openshell", "inference_routing"]
content:
  type: how_to
  difficulty: technical_beginner
  audience: ["developer", "engineer"]
status: published
---

<!--
  SPDX-FileCopyrightText: Copyright (c) 2025-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
  SPDX-License-Identifier: Apache-2.0
-->

# Switch Inference Models at Runtime

Change the active inference model while the sandbox is running.
No restart is required.

## Prerequisites

- A running NemoClaw sandbox.
- The OpenShell CLI on your `PATH`.

## Switch to a Different Model

Set the provider to `nvidia-nim` and specify a model from [build.nvidia.com](https://build.nvidia.com):

```console
$ openshell inference set --provider nvidia-nim --model nvidia/nemotron-3-super-120b-a12b
```

This requires the `NVIDIA_API_KEY` environment variable.
The `nemoclaw onboard` command stores this key in `~/.nemoclaw/credentials.json` on first run.

For local-model workflows onboarded through NemoClaw, use the higher-level command instead:

```console
$ openclaw nemoclaw set-local-model qwen3:32b
```

This switches the active OpenShell route without mutating the saved onboarding default model.
By default it only accepts models from the saved local catalog. Add `--allow-outside-catalog` for a one-off route change.

To reset the active route back to the saved default local model, use:

```console
$ openclaw nemoclaw restore-local-model
```

## Verify the Active Model

Run the status command to confirm the change:

```console
$ openclaw nemoclaw status
```

Add the `--json` flag for machine-readable output:

```console
$ openclaw nemoclaw status --json
```

The output includes the active provider, model, and endpoint. For local inference workflows, the JSON payload also includes `localModelWorkflow.choices`, which can be used by a local dashboard or control surface to render the saved catalog, default model, any active-route drift, and exact per-choice CLI metadata (`command`, `argv`, `requiresAllowOutsideCatalog`) plus `badges` / `summary` state for model-picker actions. Each choice also exposes `isSelectable`, which lets a dashboard disable the already-active model button without comparing the choice list manually. It also includes `localModelWorkflow.defaultChoice` and `localModelWorkflow.activeChoice` so a single-user dashboard can bind the currently selected/default buttons without rescanning the full list. `localModelWorkflow.drift` precomputes whether the live route differs from the saved default/catalog/provider/endpoint so a control surface can show warnings without re-diffing the payload. It now also includes `localModelWorkflow.actions`, so a dashboard that is already polling `status --json` can discover the supported read/write command templates from the same payload, including structured argv forms (`argv`, `argvTemplate`, the explicit `--allow-outside-catalog` variants, and a pre-resolved `restoreDefaultModel` action with `enabled` / `reason` state) that avoid shell parsing.

If your dashboard only needs the saved onboarding/control-plane state, use the narrower command instead:

```console
$ openclaw nemoclaw onboard-status --json
```

This returns the saved endpoint/provider/model configuration plus any local-model catalog metadata without requiring OpenShell sandbox status reads. The saved `onboarding` payload includes both human-readable labels (`endpoint`, `provider`) and machine-stable fields (`endpointUrl`, `providerName`) so a local dashboard can call the right OpenShell-backed workflow without parsing display text. For local workflows, the payload also includes `localModelWorkflow.defaultChoice`, `localModelWorkflow.activeChoice`, and `localModelWorkflow.actions`, which describe the current selections plus the supported control-plane read/write commands for a single-user dashboard. When the live OpenShell route drifts to a different local provider, the action metadata continues to point at the saved onboarding provider that `set-local-model` will actually target, so confirmation dialogs and audit trails do not inherit stale live-route provider labels. The `restoreDefaultModel` action resolves to `openclaw nemoclaw restore-local-model --json`, so dashboards can use the dedicated reset entrypoint instead of reconstructing a `set-local-model` call with the saved default. The top-level `inference` block reports whether NemoClaw successfully queried the live OpenShell route (`query.ok/code/message`) or had to fall back to the saved onboarding state, so a dashboard can label stale/live active-route state without scraping stderr.

For write actions, `openclaw nemoclaw set-local-model --json` now also returns structured JSON on rejected writes (for example `ONBOARDING_REQUIRED` or `MODEL_OUTSIDE_CATALOG`) so a local dashboard can surface the failure without scraping human-oriented stderr. Success and recoverable error payloads include the same `actions` block so the UI does not need to hardcode command templates. Each action now also reports `stateScope` plus `mutatesSavedDefault` (for write actions), which lets a single-user dashboard distinguish between reads of saved onboarding state and writes that only retarget the live OpenShell route.

## Available Models

The following table lists the models registered with the `nvidia-nim` provider.
You can switch to any of these models at runtime.

| Model ID | Label | Context Window | Max Output |
|---|---|---|---|
| `nvidia/nemotron-3-super-120b-a12b` | Nemotron 3 Super 120B | 131,072 | 8,192 |
| `nvidia/llama-3.1-nemotron-ultra-253b-v1` | Nemotron Ultra 253B | 131,072 | 4,096 |
| `nvidia/llama-3.3-nemotron-super-49b-v1.5` | Nemotron Super 49B v1.5 | 131,072 | 4,096 |
| `nvidia/nemotron-3-nano-30b-a3b` | Nemotron 3 Nano 30B | 131,072 | 4,096 |

## Related Topics

- [Inference Profiles](../reference/inference-profiles.md) for full profile configuration details.
