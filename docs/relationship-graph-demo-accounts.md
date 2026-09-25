# Relationship Graph demo accounts

These accounts are only for the isolated local demo database:

`127.0.0.1:27018/fit4002_relationship_graph_demo`

Do not use these credentials with the team Atlas database or any production environment.

## Main login

- Email: `rg-demo-supervisor@local.test`
- Password: `LocalGraphDemo123!`
- Role: `Supervisor`
- Customer to open: **RG Demo - Avery Focus**

## Other demo users

All seeded demo users use the same password: `LocalGraphDemo123!`

- **RG Demo Supervisor**
  - Email: `rg-demo-supervisor@local.test`
  - Role: `Supervisor`
  - Team: Lighthouse team

- **RG Demo Rep One**
  - Email: `rg-demo-rep-one@local.test`
  - Role: `User`
  - Team: Lighthouse team

- **RG Demo Rep Two**
  - Email: `rg-demo-rep-two@local.test`
  - Role: `User`
  - Team: Lighthouse team

- **RG Demo Outside Supervisor**
  - Email: `rg-demo-outside@local.test`
  - Role: `Supervisor`
  - Team: Outside team

The two reps appear as salesperson nodes because they own contacts or created deals. Their stored application role is `User`. No admin account is seeded.

The password above matches the `RG_DEMO_PASSWORD` value in the documented seed command. If the database is cleaned and seeded again with a different value, use that new value instead.

The outside customer link contains the ID from the current seed. After cleanup and reseeding, use the new outside-team customer ID printed by the seed command.
