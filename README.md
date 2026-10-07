# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Marées et coefficient (gratuit, hors ligne)

Les marées et le coefficient sont calculés dans l'appli par prédiction harmonique (`src/lib/tides.ts`) à partir des constantes de jauges REFMAR
(`src/data/tide-stations.json`, régénérable avec `scripts/extract-tide-stations.mjs`). Aucun abonnement ni appel réseau.
Le coefficient suit la définition officielle (marnage à Brest / 6,10 m × 100). Vérifié : 21 mars 2015 → 121 / 120 (officiel : 119).
Données : TICON-4 (CC BY 4.0) via Neaps tide-database (MIT).

## Clés d'API (variables d'environnement Vercel, jamais dans le code)

- `METEOFRANCE_API_KEY` : alertes de vigilance (`api/vigilance.ts`, clé « API Key » du portail Météo-France).
- `WINDY_WEBCAMS_KEY` : webcams proches (`api/webcams.ts`).
- `JWT_SECRET` : signature des connexions. La base Neon est reliée par l'intégration Vercel.
- `GMAIL_USER`, `GMAIL_APP_PASSWORD` : envoi du code de vérification à la création d'un compte (compte Gmail dédié + mot de passe d'application ; 500 e-mails/jour, gratuit).
