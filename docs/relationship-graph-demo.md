# Local Relationship Graph demo data

The normal backend configuration points at a remote Atlas cluster. Never use it
for this demo. These commands run a separate MongoDB server bound to loopback on
port `27018` and use only the database `fit4002_relationship_graph_demo`.

The demo script refuses Atlas/SRV hosts, non-loopback hosts, other database
names, non-development environments, and write commands without explicit
confirmation. It never reads the normal `MONGO_URI`.

## 1. Start the isolated MongoDB server

In a dedicated terminal:

```bash
mkdir -p /tmp/fit4002-relationship-graph-mongo
mongod --dbpath /tmp/fit4002-relationship-graph-mongo --port 27018 --bind_ip 127.0.0.1
```

## 2. Preview without writing

From `backend/`:

```bash
NODE_ENV=development \
DEMO_MONGO_URI='mongodb://127.0.0.1:27018/fit4002_relationship_graph_demo' \
node scripts/relationshipGraphDemo.js preview
```

The preview prints the host, database, tenant, teams, and planned record counts.
It does not write anything.

## 3. Seed explicitly

```bash
NODE_ENV=development \
DEMO_MONGO_URI='mongodb://127.0.0.1:27018/fit4002_relationship_graph_demo' \
RG_DEMO_PASSWORD='LocalGraphDemo123!' \
node scripts/relationshipGraphDemo.js seed --confirm fit4002_relationship_graph_demo
```

Repeating the command finds the completed manifest and creates nothing new.

## 4. Start the backend against only this database

In another terminal, from `backend/`:

```bash
NODE_ENV=development \
DEMO_MONGO_URI='mongodb://127.0.0.1:27018/fit4002_relationship_graph_demo' \
JWT_SECRET='local-relationship-graph-demo-secret' \
PORT=5001 \
node scripts/startRelationshipGraphDemo.js
```

The wrapper validates and displays the target host/database before replacing
`MONGO_URI` in that process. It does not edit `.env`, so ordinary backend start
commands still use the team's normal configuration.

Start the frontend normally and log in with:

- Email: `rg-demo-supervisor@local.test`
- Password: the value supplied as `RG_DEMO_PASSWORD`

Open the customer named **RG Demo - Avery Focus**, then open its Relationship
Graph.

## What to inspect

- **G4:** Contact ownership is shared across the supervisor and two reps;
  **RG Demo - Jordan Unowned** has no owner. The three main-account deals have
  different creators.
- **G5:** Avery and Gray are frequent, several contacts are in the 1–4 band,
  and Emery/Jordan have no activity. Devon has only a 125-day-old call, so the
  edge is in the no-contact band while hover still shows the older date. Casey's
  task is represented once in `Customer.interactions`; its matching Task
  document is not counted a second time.
- **G6:** **Single Contact Renewal** has one visible contact and is highlighted.
  **Two Contact Expansion** connects to Avery through `Deal.customer` and Casey
  through the task's `deal` and `customer` references, so it is not highlighted.
  **Unmatched Opportunity** appears under Deals not drawn.
- **G7:** In normal mode, click a contact or deal once to open it. Use **Inspect
  connections** to select nodes without navigating. Dragging, pan, zoom and
  reset remain available.
- **G9:** The demo supervisor sees the Lighthouse team's account, owners and
  deals. The customer **RG Demo - Outside Team Contact** belongs to the separate
  outside team. The seed output prints its customer ID; opening
  `/customers/<outside-team-customer-id>` while logged in as the Lighthouse
  supervisor should return access denied.

## Cleanup

Stop the demo backend first, then run from `backend/`:

```bash
NODE_ENV=development \
DEMO_MONGO_URI='mongodb://127.0.0.1:27018/fit4002_relationship_graph_demo' \
node scripts/relationshipGraphDemo.js cleanup --confirm fit4002_relationship_graph_demo
```

Cleanup reads the manifest and deletes only its recorded task, deal, customer,
user and team IDs. Embedded interactions are removed with their demo customers.
It does not drop the database or use name-pattern deletion.
