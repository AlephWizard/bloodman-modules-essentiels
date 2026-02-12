const api = game.modules.get("bloodman-modules-essentiels")?.api;
if (!api || typeof api.rollJetDestin !== "function") {
  ui.notifications?.warn("Module bloodman-modules-essentiels inactif ou API indisponible.");
} else {
  await api.rollJetDestin();
}

