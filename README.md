# Bloodman - Modules Essentiels

Module Foundry contenant les fonctionnalites essentielles Bloodman (incluant le jet du destin).

## Installation

1. Verifier que le dossier existe: `Data/modules/bloodman-modules-essentiels`
2. Activer le module dans le panneau Modules.

## Macro

Creer une macro de type Script et coller:

```js
const api = game.modules.get("bloodman-modules-essentiels")?.api;
if (!api || typeof api.rollJetDestin !== "function") {
  ui.notifications?.warn("Module bloodman-modules-essentiels inactif ou API indisponible.");
} else {
  await api.rollJetDestin();
}
```

## API

Le module expose aussi:

- `game.modules.get("bloodman-modules-essentiels").api.rollJetDestin(options)`
- `game.modules.get("bloodman-modules-essentiels").api.emitVoyanceOverlayRequest(payload)`
- `game.modules.get("bloodman-modules-essentiels").api.showVoyanceOverlay(payload)`

Exemple:

```js
await game.modules.get("bloodman-modules-essentiels")?.api?.rollJetDestin({
  threshold: 10,
  autoCloseMs: 6500,
  answerDelayMs: 240
});
```

