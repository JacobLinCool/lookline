# LookLine

**Recommend what to buy. Enable what to wear.**

We are proud to present **LookLine**, a complete fashion experience that connects acquisition and creation in one continuous loop. Find the piece you need, make it part of your wardrobe, create a look that feels like you, and share it with your world.

Built for the **2026 Meichu Hackathon × Makalot**.

## Concept: Point, Line, and Plane

**A purchase creates a point. Continuous personal creation draws a line. Creating together expands those lines into a shared plane.**

Each level serves a distinct purpose:

- **Point: make acquisition better.** Help customers find the right product through a seamless, responsive shopping conversation.
- **Line: give customers a reason to keep coming back.** Turn their wardrobes into an ongoing experience of styling, learning and play, with something worth creating even when they have nothing to buy.
- **Plane: enable trends to take shape and spread.** Give users the tools to create new looks together, build momentum within LookLine, and carry those trends into existing social platforms.

We designed LookLine at all three levels. Acquisition brings new pieces into the wardrobe. Creation gives those pieces lasting value. Sharing brings fresh inspiration back into discovery, completing the loop.

### Point: acquisition

Shopping begins with an idea: an occasion, a feeling, or a piece that needs something to go with it. Our acquisition experience helps people turn that idea into the right product through a natural conversation with a fashion expert.

We invert the delegation pattern in which a live model hands tasks to a stronger reasoning model. In LookLine, the **live model owns the conversation**, while a separate **System 1 model, Jev, drives the visual catalog state**. The live model can focus on listening, responding and exploring the customer's preferences without making tool calls to update the catalog.

Jev translates the evolving conversation into structured decisions that update filters and matching products. When matching requires concepts beyond the structured attribute space, the system selectively invokes a generative LLM for advanced matching. The initial catalog update proceeds independently of that refinement.

This division of work keeps conversation and visual discovery moving together. **The customer stays in the conversation; the catalog keeps pace with their intent.**

### Line: personal creation

The purchase begins a lasting creative experience. Each acquired garment enters the digital wardrobe, ready to become part of the next outfit, the next occasion and the next idea.

Image generation becomes the rendering engine for that experience. People combine their clothes, explore personas, experiment with styles and turn their compositions into **outfit Cards**. They can create freely, invite AI suggestions when useful, and keep refining what they make.

The result is a playful, personal way to learn and enjoy fashion. Real garments become reusable creative material, and each new composition gives people another reason to return. **AI supports the craft; the customer is the creator.**

### Plane: shared creation

Our card-based experience gives social interaction something tangible to build on. Friends can explore shared wardrobes, exchange styling ideas, co-design outfits and bring their creations together in **Collections**. A group outing becomes a shared composition; a friend's look becomes the starting point for something new.

Trends can begin inside LookLine as people create, collect and reinterpret each other's looks. Sharing carries those ideas into the social platforms people already use, including Instagram and TikTok, where they can inspire wider communities. LookLine provides the creative tools and the connection to real garments; its users give the ideas momentum and reach.

Our ambition is to **make trends together with our users**. By connecting personal creativity, shared experiences and social distribution, LookLine gives people a way to shape what others discover and wear.

**From a point to a line to a plane: every purchase opens a creative journey, and every shared creation opens the next one.**

## Presentation

The ten-slide pitch is designed for a 3–5 minute presentation:

| Format     | File                                              | Usage                                                                                                                |
| ---------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| HTML       | [LookLine.html](presentation/LookLine.html)       | Open directly in a browser; images, styles and navigation are bundled for offline use.                               |
| PDF        | [LookLine.pdf](presentation/LookLine.pdf)         | Read or share the slides as a static document.                                                                       |
| PowerPoint | [LookLine-v2.pptx](presentation/LookLine-v2.pptx) | Presentation-ready slides with updated Card artwork, exported as full-slide images. Edit content in the HTML source. |

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

`OPENAI_API_KEY` and `GEMINI_API_KEY` configure generation providers. `TYPESAFE_API_KEY` configures Jev decisions for live filters. Voice sessions require `GEMINI_API_KEY`. Configure the providers you want to use in the Worker environment.

### 2. Prepare the catalog

Obtain the [H&M Personalized Fashion Recommendations dataset](https://www.kaggle.com/competitions/h-and-m-personalized-fashion-recommendations/data) under its applicable access terms, then place these files in `data/hm/`:

```text
data/hm/
├── articles.csv
└── transactions_train.csv
```

Build the catalog and initialize the local application:

```bash
pnpm --filter @lookline/hm aggregate
pnpm db:migrate
pnpm seed
pnpm d1:migrate:local
pnpm d1:local
pnpm dev
```

Open [localhost:3000](http://localhost:3000). The development server runs with local D1 and R2 emulation. Visit `/login` to choose a seeded profile.

Aggregation produces sales statistics, seasonality and product-type affinities. Seeding imports the catalog, creates simulated social activity and computes analytics. Re-running the catalog import replaces catalog records; use these steps with a development database.

Catalog photography is a separate asset pipeline. See the [catalog specification](docs/specs/CATALOG_SPEC.md) and the scripts in [packages/hm](packages/hm/package.json) for image processing and upload. Process and upload the dataset images to populate product photography.

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

Accepted friendships and explicit sharing determine social access. Cards preserve article and participant snapshots. Demand analytics turns intent, feedback, purchases and Card compositions into signals for future product development.

## Deployment and documentation

Application deployment uses the Cloudflare configuration in `apps/web/`. See [Onboarding](docs/ONBOARDING.md) for resource setup, secrets and deployment commands. Use `pnpm dev` for local D1 and R2, or `pnpm dev:remote` to work directly with production Cloudflare data. Remote mode performs real reads and writes.

- [Architecture](docs/ARCHITECTURE.md)
- [Product journey](docs/PRODUCT_JOURNEY.md)
- [Data model](docs/DATA_MODEL.md)
- [Contracts](docs/CONTRACTS.md)
- [Conversational shopping](docs/specs/SHOP_TALK_SPEC.md)
- [Realtime filters](docs/specs/REALTIME_FILTER_SPEC.md)
- [Latency verification](docs/LATENCY_VERIFICATION.md)

## License

The repository includes the [GNU Affero General Public License v3.0](LICENSE). Dataset access and bundled third-party assets retain their own terms; the presentation font license is included with its assets.
