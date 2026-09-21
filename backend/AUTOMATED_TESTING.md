# Backend Automated Testing Guide

This document explains the backend automated testing suite we have added. The goal is to ensure our backend APIs work as expected, verify permissions are enforced, and catch breaking changes early.

## What Was Added

We added a suite of backend API and integration tests using **Vitest** and **Supertest**:
- **Supertest** automatically sends HTTP requests to our Express API routes, similar to how the frontend would call the backend.
- **Vitest** checks whether the actual response (status codes, JSON data) matches what we expect.
- **mongodb-memory-server** spins up a temporary, isolated, in-memory MongoDB database just for the tests. 

**Important:** The tests do NOT touch your real production MongoDB Atlas data. They run completely isolated and clean up after themselves.

## Current Test Suite

The backend currently has 11 automated test files:

- `health.test.js`
- `auth.test.js`
- `customers.test.js`
- `deals.test.js`
- `teamScope.test.js`
- `interactions.test.js`
- `notifications.test.js`
- `dashboard.test.js`
- `gmail.test.js`
- `risk.test.js`
- `settings.test.js`

Current verified result:

- 11/11 test files passed
- 138/138 tests passed
- 0 failed

## Feature Coverage

Our automated tests currently cover the following backend areas:

**Health**
- Checks if the backend health endpoint is running
- Verifies that unknown routes return the correct error

**Authentication**
- User signup and login
- Rejects duplicate user registrations
- Rejects invalid credentials
- Verifies JWT protection on secure routes
- Checks input validation
- Email Confirmation / Verification:
  - Signup requiring email confirmation when confirmation mode is enabled
  - Login blocked before verification
  - Missing/invalid verification code handling
  - Successful verification with a valid code
  - Resend-verification behaviour
  - Resend cooldown behaviour
  - *Note: Real SMTP emails are NOT sent during tests (the mailer is mocked in the test environment). Real DNS/MX verification remains mocked to keep tests isolated from external network services.*

**Customers**
- Creating and retrieving customers
- Required field validation
- Basic customer access-control rules
- Verifies that an unauthorized user cannot access another user's customer

**Deals**
- Verifies unauthenticated access is blocked
- Creating deals and checking defaults
- Verifies owner access permissions
- Blocks unauthorized access from other users
- Updating deal stages, outcomes, and probabilities
- Verifies who is allowed to delete deals
- Admin access rules and overrides

**teamScope / companyScope**
- Tests core data visibility and company isolation rules
- Unit tests for `seesEverything`, `getVisibleDealFilter`, `canAccessDeal`, and `getCompanyUserIds`

**Interactions**
- Retrieving interactions for a customer
- Documents the current interaction creation behaviour, where creation returns 400 because the required `time` field is not currently saved by the controller
- Verifies interaction update and delete behaviours
- Permission rules for deleting interactions

**Notifications**
- Retrieving user notifications
- User isolation (ensuring users cannot read each other's notifications)
- Marking notifications as read

**Dashboard**
- Verifies unauthenticated users cannot access the dashboard
- Checks the main dashboard response structure
- Verifies KPI, pipeline, activity summary, team performance, sales trends, and recent activity data structures
- Tests the supported time filters:
  - today
  - thisWeek
  - thisMonth
  - thisYear
  - custom date range

**Gmail**
- Gmail is not covered by a real external integration test because sending mail requires live Google OAuth credentials and external Gmail API access.
- The automated test suite does not send any real emails or make live Gmail API calls.
- Full Gmail integration testing remains a limitation of the current test suite.

**Risk Assessment / Risk Benchmarks**
- Unit tests for `riskFactors.js` (`getDaysInStage`, `getDaysSinceActivity`, `getOverdueTaskCount`)
- Unauthenticated access handling to risk benchmark routes
- Regular User read access
- Admin create/update/delete permissions
- Duplicate benchmark validation
- Company-scoped benchmark behaviour where applicable

**Settings**
- Unauthenticated access handling
- Regular User read access
- Regular User blocked from updating settings
- Admin update access
- Timezone/currency/language updates
- Duplicate `companyName` conflict handling

## Important Current Backend Behaviours Discovered

While writing these tests, we discovered and documented a few existing behaviours in our production code. **The tests reflect the current implementation; they do not change these behaviours.**

1. `POST /api/interactions/create` currently always returns a 400 error. The `Interaction` schema requires a `time` field, but the backend controller does not currently save the `time` field.
2. Some interaction routes are currently public because they do not use `requireAuth`:
   - `GET /api/interactions/:customerId`
   - `POST /api/interactions/create`
   - `PUT /api/interactions/:interactionId`
3. A Supervisor is currently not allowed to create deals because `POST /api/deals` only allows the User and Admin roles.

## How to Test Locally Before Merging

Whenever you are reviewing a PR or checking your own work, follow these exact steps to run the tests locally:

1. Pull/check out the PR branch.
2. Go to the backend folder:
   ```bash
   cd backend
   ```
3. Install any new dependencies:
   ```bash
   npm install
   ```
4. Run the automated test suite:
   ```bash
   npm test
   ```

**Expected Result:**
- 11 test files passed
- 138 tests passed
- 0 failed

If any test fails, investigate the failure before merging. A failure may indicate a regression, an intentional behaviour change, or an outdated test expectation.

5. Start the backend normally to verify it still boots:
   ```bash
   npm run dev
   ```

**Expected Result:**
- Server running on port 5001
- MongoDB connected successfully

## What is NOT Covered

The following areas are currently not covered by this automated suite:
- Task routes and permission tests
- Team Management tests
- Frontend UI tests
- File upload/multipart tests
- Portal routes
- Real Gmail API integration
- Live SMTP delivery
- Real DNS/MX email verification
- Live Google OAuth integration

## Before Merge Checklist

- [ ] `npm install` completed successfully
- [ ] `npm test` passes
- [ ] 138/138 tests pass
- [ ] `npm run dev` starts successfully
- [ ] No unexpected test failures or backend startup errors are observed