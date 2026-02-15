# Bloodman - Modules Essentiels

Module Foundry limite aux fonctionnalites suivantes:

- Redimensionnement de token
- Macro automatique du destin
- Macro de visibilite des tuiles
- Macro automatique des notes

## Installation

1. Verifier que le dossier existe: `Data/modules/bloodman-modules-essentiels`
2. Verifier que le dossier des PNG de tokens existe: `Data/modules/bloodman-modules-essentiels-token-resize`
3. Activer le module dans le panneau Modules.

## Token Resize

Les PNG utilises par le redimensionnement de token sont desormais stockes hors du module principal, dans:

`modules/bloodman-modules-essentiels-token-resize`

Le module gere automatiquement la migration logique des anciens chemins `modules/bloodman-modules-essentiels/images/token-resize/...`.

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
- `game.modules.get("bloodman-modules-essentiels").api.toggleCurrentSceneTilesVisibility()`
- `game.modules.get("bloodman-modules-essentiels").api.openGmNotesWindow()`

Exemple:

```js
await game.modules.get("bloodman-modules-essentiels")?.api?.rollJetDestin({
  threshold: 10,
  autoCloseMs: 6500,
  answerDelayMs: 240
});
```

