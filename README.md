# LookLine

**Recommend what to buy. Enable what to wear.**

LookLine connects apparel discovery, a digital wardrobe, outfit creation and social sharing. Built for the **2026 Meichu Hackathon × Makalot**, it explores how a single purchase can grow into an ongoing relationship with the clothes people own.

The product follows two connected loops:

- **Acquisition:** express a need, find the missing item, purchase it and add it to the wardrobe.
- **Creation:** compose with wardrobe items, explore a persona and occasion, create a Card, and share or collect the result.

The digital wardrobe connects both loops. Shopping uses existing clothes as context, while full outfit composition gives users room to experiment. Generated previews run separately from the fast search interaction.

## Presentation

The ten-slide pitch is designed for a 3–5 minute presentation:

| Format     | File                                              | Usage                                                                                                                        |
| ---------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| HTML       | [LookLine.html](presentation/LookLine.html)       | Open directly in a browser; images, styles and navigation are bundled for offline use.                                       |
| PDF        | [LookLine.pdf](presentation/LookLine.pdf)         | Read or share the slides as a static document.                                                                               |
| PowerPoint | [LookLine-v2.pptx](presentation/LookLine-v2.pptx) | Play the slides with the updated Card artwork. Each slide is a single image, so text and images are not separately editable. |

See the [presentation README](presentation/README.md) for controls, source files and publishing instructions.

## Product areas

| Area                    | Entry point                      | Purpose                                                       |
| ----------------------- | -------------------------------- | ------------------------------------------------------------- |
| Discovery               | `/` and `/shop`                  | Browse catalog articles and refine shopping intent.           |
| Conversational shopping | `/shop-talk`                     | Use conversation to update product filters and results.       |
| Wardrobe                | `/me`                            | Return to owned items and personal creations.                 |
| Personas                | `/me/personas`                   | Manage the people and visual identities used in compositions. |
| Card studio             | `/studio`                        | Select garments and create a durable outfit Card.             |
| Friends and Collections | `/me/friends` and `/collections` | Work with shared items and group compositions.                |
| Demand analytics        | `/trends`                        | Explore aggregated demand signals for product development.    |

This is a hackathon prototype. Seeded people, friendships and purchase activity are simulated. Catalog presence does not establish current retail inventory. The pitch's sub-0.5-second interaction figure is a design target, not a verified end-to-end benchmark.

## Run locally

### Prerequisites

- Node.js **24 or later**.
- pnpm **11.27.0**, matching the repository's `packageManager` field.
- `uv`, used by the H&M transaction aggregation script to run DuckDB.
- The H&M dataset files described below.

### 1. Install dependencies and configure the environment

```bash
pnpm install --frozen-lockfile
cp .env.example .env
cp apps/web/.dev.vars.example apps/web/.dev.vars
```

Set a long random `SESSION_SECRET` in `apps/web/.dev.vars`. Replace placeholder API keys with real values for the services you use, or leave them empty.

The two environment files serve different runtimes:

| File                 | Used by                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| `.env`               | Local Node scripts for catalog import, seeding, analytics and evaluation. |
| `apps/web/.dev.vars` | The local Cloudflare Worker serving the web application.                  |

`OPENAI_API_KEY` and `GEMINI_API_KEY` configure generation providers. `TYPESAFE_API_KEY` configures Jev decisions for live filters. Voice sessions require `GEMINI_API_KEY`. Provider-backed functionality requires the corresponding credentials; a missing provider is not evidence that generation or live voice succeeded.

### 2. Prepare the catalog

Obtain the [H&M Personalized Fashion Recommendations dataset](https://www.kaggle.com/competitions/h-and-m-personalized-fashion-recommendations/data) under its applicable access terms, then place these files in `data/hm/`:

```text
data/hm/
├── articles.csv
└── transactions_train.csv
```

The dataset and generated databases are not included in Git. Run:

```bash
pnpm --filter @lookline/hm aggregate
pnpm db:migrate
pnpm seed
pnpm d1:migrate:local
pnpm d1:local
pnpm dev
```

Open [localhost:3000](http://localhost:3000). The development server uses local D1 and R2 emulation, so this setup does not require Cloudflare account credentials. Visit `/login` to choose a seeded profile.

Aggregation produces sales statistics, seasonality and product-type affinities. Seeding imports the catalog, creates simulated social activity and computes analytics. Re-running the catalog import replaces catalog records; use these steps with a development database.

Catalog photography is a separate asset pipeline. See the [catalog specification](docs/specs/CATALOG_SPEC.md) and the scripts in [packages/hm](packages/hm/package.json) for image processing and upload. The CSV-only setup does not bundle product photos.

For optional image-derived attributes, run `pnpm --filter @lookline/hm vision`, then `pnpm --filter @lookline/hm materialize` and `pnpm d1:local` again. The vision step requires provider credentials and access to the article images.

## Development commands

| Command             | Purpose                                           |
| ------------------- | ------------------------------------------------- |
| `pnpm dev`          | Run the application against local D1 and R2.      |
| `pnpm build`        | Build workspace packages and the web application. |
| `pnpm typecheck`    | Check TypeScript across the workspace.            |
| `pnpm test`         | Run the workspace test suites.                    |
| `pnpm lint`         | Run Oxlint.                                       |
| `pnpm format:check` | Check formatting with Oxfmt.                      |
| `pnpm check`        | Run formatting, lint, typecheck, tests and build. |
| `pnpm analytics`    | Recompute demand analytics.                       |
| `pnpm evaluate`     | Run the simulation evaluation.                    |

## Architecture

The web application uses **React and vinext's Next.js-compatible App Router**, deployed to **Cloudflare Workers**. **Drizzle** defines the schema, **SQLite/D1** stores application data, and **R2** stores generated images and persona photos.

```text
apps/web/          Web UI, API routes, authentication and provider integration
packages/catalog/  Clothing taxonomy and catalog utilities
packages/db/       Schema, migrations and SQLite/D1 adapters
packages/engine/   Intent parsing, ranking, feedback, creation and analytics
packages/hm/       H&M import, aggregation and image-attribute pipelines
packages/sim/      Simulated activity and evaluation
presentation/      Pitch source and exported presentation files
docs/              Architecture, contracts and feature specifications
```

Accepted friendships and explicit sharing determine social access. Cards preserve article and participant snapshots. Demand analytics aggregates application activity; external social-platform propagation is part of the product direction, not a measured analytics capability.

## Deployment and documentation

Application deployment uses the Cloudflare configuration in `apps/web/`. See [Onboarding](docs/ONBOARDING.md) for resource setup, secrets and deployment commands. `pnpm dev:remote` connects development to real Cloudflare resources and can write production data; it is not needed for local setup.

- [Architecture](docs/ARCHITECTURE.md)
- [Product journey](docs/PRODUCT_JOURNEY.md)
- [Data model](docs/DATA_MODEL.md)
- [Contracts](docs/CONTRACTS.md)
- [Conversational shopping](docs/specs/SHOP_TALK_SPEC.md)
- [Realtime filters](docs/specs/REALTIME_FILTER_SPEC.md)
- [Latency verification](docs/LATENCY_VERIFICATION.md)

## License

The repository includes the [GNU Affero General Public License v3.0](LICENSE). Dataset access and bundled third-party assets retain their own terms; the presentation font license is included with its assets.
