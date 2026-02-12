# Bloodman - Jet du destin

Module Foundry independant pour l'automate de voyance (jet du destin).

## Installation

1. Verifier que le dossier existe: `Data/modules/bloodman-jet-destin`
2. Activer le module dans le panneau Modules.

## Macro

Creer une macro de type Script et coller:

```js
const api = game.modules.get("bloodman-jet-destin")?.api;
if (!api || typeof api.rollJetDestin !== "function") {
  ui.notifications?.warn("Module bloodman-jet-destin inactif ou API indisponible.");
} else {
  await api.rollJetDestin();
}
```

## API

Le module expose aussi:

- `game.modules.get("bloodman-jet-destin").api.rollJetDestin(options)`
- `game.modules.get("bloodman-jet-destin").api.emitVoyanceOverlayRequest(payload)`
- `game.modules.get("bloodman-jet-destin").api.showVoyanceOverlay(payload)`

Exemple:

```js
await game.modules.get("bloodman-jet-destin")?.api?.rollJetDestin({
  threshold: 10,
  autoCloseMs: 6500,
  answerDelayMs: 240
});
```

