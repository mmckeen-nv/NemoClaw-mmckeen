# Multi-model local inference direction

## Problem

NemoClaw can onboard against local inference, but the current OpenShell-managed
`inference.local` flow is still effectively centered on a single gateway-scoped
active provider/model pair.

That makes local model switching awkward for users who want to:
- compare models quickly
- keep multiple models available at once
- use different models for different workflows
- let higher-level UI/control surfaces present a model picker instead of a
  single mutable global setting

## Desired user experience

For single-user local operator workflows, NemoClaw should eventually treat local
inference more like OpenClaw treats general model routing:
- visible local model catalog
- default local model
- optional aliases / friendly labels
- per-session or per-task model choice
- optional fallback chain

## Short-term guidance

Until OpenShell exposes a real multi-model local routing surface, treat the
current local inference configuration as a global default rather than a complete
model-selection system.

## Integration implication

The dashboard/control-plane work for NemoClaw should plan around a future local
model router, not around repeated config mutation whenever the operator wants to
change models.
