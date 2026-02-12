const api = game.modules.get("bloodman-jet-destin")?.api;
if (!api || typeof api.rollJetDestin !== "function") {
  ui.notifications?.warn("Module bloodman-jet-destin inactif ou API indisponible.");
} else {
  await api.rollJetDestin();
}

