Relationship Graph: local demo setup

Use this guide to run the G4-G9 Relationship Graph demo after pulling the branch. The demo creates sample users, customers, deals, tasks, and interactions in a separate local MongoDB database. It does not require anyone to create test accounts by hand.

Database safety: The normal backend configuration may point to the team's MongoDB Atlas cluster. Use only the commands below for the demo. Do not run a normal backend start command against Atlas while testing demo data. The demo scripts validate that the database is local (127.0.0.1:27018/fit4002_relationship_graph_demo), and seeding/cleanup require explicit confirmation.

Prerequisites

Pull the branch containing backend/scripts/relationshipGraphDemo.js, backend/scripts/relationshipGraphDemoConfig.js, backend/scripts/startRelationshipGraphDemo.js, and this guide.

Install Node.js and npm compatible with the project's backend/package.json and frontend/package.json.

Install MongoDB Community Server so that mongod is available, or use an existing local MongoDB server bound to 127.0.0.1 on port 27018.

Run the following commands in separate terminals, or keep services running in the background. Leave MongoDB, backend, and frontend running while using the website.

From the repository root, install the dependencies once (and again after dependency changes):

cd backend
npm ci
cd ../frontend
npm ci
cd ..

npm ci installs the already declared frontend dependencies, including Cytoscape. Do not run npm test as part of the demo startup.

1. Start the local database

In a terminal at any location:

mkdir -p /tmp/fit4002-relationship-graph-mongo
mongod --dbpath /tmp/fit4002-relationship-graph-mongo --port 27018 --bind_ip 127.0.0.1

Keep this terminal open. If the port is already in use, check whether your local demo MongoDB is already running before starting another instance. /tmp is temporary storage; if the operating system removes this directory, seed the demo again.

2. Create the sample data

Open another terminal and change to backend/. The scripts live in backend/scripts/, so node scripts/... will fail from the repository root.

cd /path/to/FIT4002_CRM_Platform/backend

Optional read-only preview:

NODE_ENV=development \
DEMO_MONGO_URI='mongodb://127.0.0.1:27018/fit4002_relationship_graph_demo' \
node scripts/relationshipGraphDemo.js preview

Seed the local database:

NODE_ENV=development \
DEMO_MONGO_URI='mongodb://127.0.0.1:27018/fit4002_relationship_graph_demo' \
RG_DEMO_PASSWORD='LocalGraphDemo123!' \
node scripts/relationshipGraphDemo.js seed --confirm fit4002_relationship_graph_demo

Save the outside-team customer ID printed by the seed command; it is needed for the G9 access test. The seed records its created IDs in a manifest. If a completed seed already exists, repeating the command does not create duplicates. If you have not cleaned up since your last run, you can skip this step and use the existing demo data.

The password above is an example local demo password. If you change RG_DEMO_PASSWORD, use your chosen value to log in. Do not use a real personal or team password.

3. Start the demo backend

From backend/, leave this command running in its own terminal:

NODE_ENV=development \
DEMO_MONGO_URI='mongodb://127.0.0.1:27018/fit4002_relationship_graph_demo' \
JWT_SECRET='local-relationship-graph-demo-secret' \
PORT=5001 \
node scripts/startRelationshipGraphDemo.js

Confirm that the startup message shows the local host and demo database, not the Atlas host. This wrapper sets the backend's MongoDB target for this process; it does not change the team's .env file.

4. Start the frontend and log in

From the repository root, use another terminal:

cd frontend
npm run dev

Open the local URL printed by Vite (normally http://127.0.0.1:5173/). Sign in with:

Email: rg-demo-supervisor@local.test

Password: the value of RG_DEMO_PASSWORD used when the demo was seeded (the example above is LocalGraphDemo123!).

Go to Customers -> RG Demo - Avery Focus -> Relationship Graph. The account title should say RG Demo - Lighthouse Account. This supervisor sees only records available to their team.

Quick manual checks

G4 - ownership: In Inspect connections mode, select a contact to see its owner and salesperson connection. RG Demo - Jordan Unowned should still render without a salesperson connection. Deal nodes show their creators.

G5 - recent contact: Compare company-to-contact lines: Avery/Gray have frequent contact; several other contacts have 1-4 interactions; Emery/Devon have none in the last 90 days. Hover a line to see its count and most recent contact date. Devon's older contact must not increase the 90-day count.

G6 - single-contact deals: RG Demo - Single Contact Renewal has a warning and appears in the single-contact list. RG Demo - Two Contact Expansion links to Avery and Casey and must not be warned. RG Demo - Unmatched Opportunity appears under deals not drawn.

G7 - navigation: In normal mode, click a contact/deal once to open its CRM record. Turn on Inspect connections to select and highlight neighbours without navigating. Check drag, pan, zoom, and Reset view.

G9 - team access: Open the graph from Avery's and Blake's customer profiles as the demo supervisor. Check team contacts, deals, and salespeople. Search for the outside-team customer, then visit /customers/<outside-team-customer-id> using the ID printed by the seed. Access should be denied. A failed link alone is inconclusive if the ID is stale; verify the ID against the latest seed output.

Record your actual results and screenshots in the team's manual test sheet. A result observed only in code is not a completed browser test.

Stop and clean up

Stop the frontend and backend using Ctrl+C in their terminals. Stopping services does not delete demo data; the next run can skip seeding while the local database still contains the manifest.

When you are finished and want to delete only records created by this demo seed, run from backend/:

NODE_ENV=development \
DEMO_MONGO_URI='mongodb://127.0.0.1:27018/fit4002_relationship_graph_demo' \
node scripts/relationshipGraphDemo.js cleanup --confirm fit4002_relationship_graph_demo

Cleanup uses the manifest's recorded IDs. It does not drop the database or delete records by name. After cleanup, run the seed command again if you want to repeat the demo. Stop mongod with Ctrl+C in its terminal when you are done.

Common startup problems

Cannot find module .../scripts/startRelationshipGraphDemo.js: You ran the command from the repository root. Run cd backend first.

Failed to resolve import "cytoscape": Run npm ci in frontend/, then restart npm run dev.

Website opens but login fails: Check that the local database, demo backend, and frontend are running; check the backend startup target is the local demo database; use the password supplied during the successful seed.

27018 or 5001 already in use: A previous local process may still be running. Check its identity before starting another copy or stopping it.

Only one terminal was used last time: Some services may have been started in the background. Three terminals are convenient for viewing logs, not a requirement.