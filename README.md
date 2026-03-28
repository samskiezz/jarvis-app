**Welcome to your Base44 project** 

**About**

View and Edit  your app on [Base44.com](http://Base44.com) 

This project contains everything you need to run your app locally.

**Edit the code in your local development environment**

Any change pushed to the repo will also be reflected in the Base44 Builder.

**Prerequisites:** 

1. Clone the repository using the project's Git URL 
2. Navigate to the project directory
3. Install dependencies: `npm install`
4. Create an `.env.local` file and set the right environment variables

```
VITE_BASE44_APP_ID=your_app_id
VITE_BASE44_APP_BASE_URL=your_backend_url

e.g.
VITE_BASE44_APP_ID=cbef744a8545c389ef439ea6
VITE_BASE44_APP_BASE_URL=https://my-to-do-list-81bfaad7.base44.app
```

Run the app: `npm run dev`

**Publish your changes**

Open [Base44.com](http://Base44.com) and click on Publish.

**Docs & Support**

Documentation: [https://docs.base44.com/Integrations/Using-GitHub](https://docs.base44.com/Integrations/Using-GitHub)

Support: [https://app.base44.com/support](https://app.base44.com/support)

## Temporal Causal Intelligence System (TCIS)

This repository now includes a modular reference implementation of a 9-layer Temporal Causal Intelligence System under `src/lib/temporal-intel`.

### Included components

- Streaming signal acquisition connectors (22 top source connectors + connector abstraction).
- Normalization & harmonization (UTC nanoseconds, source reliability, deduplication, canonical values).
- Entity registry with alias matching and fuzzy resolution.
- Entity/event resolution output for signals, risk events, relationships, and hypothesis seeds.
- Temporal graph with versioned snapshots and time-travel query support.
- Seven anomaly detectors: statistical, temporal, spatial, behavioral, relational, cascade, confidence.
- Cross-domain hypothesis generation with anomaly clustering and competing hypotheses.
- Layered prediction engine with contextual and graph-pressure adjustments and 4-branch scenarios.
- Decision intelligence ranking for MONITOR/INVESTIGATE/HEDGE/DIVERSIFY/MITIGATE/ESCALATE/WAIT.
- Learning loop feedback hooks for source reliability and retraining cadence.

### Running the integration test

```bash
npm run test:temporal
```
