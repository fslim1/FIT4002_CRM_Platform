# CRM $\times$ UAP Integration Document

Reference for the UAP team. It describes how the role Role-Based Access Control (RBAC) works in
NexGenCRM. And in detail, how task data behaves.

## 1. Access model

Our access model is **role** and **permission** based. A user's role sets their default scope, and an
Admin can grant individual permission overrides on top of it.

The two boundaries that matter:

- **Company:** the tenant boundary. Every user carries a `companyName` string; matching is
  case-insensitive. No query ever crosses it.
- **Team:** a subdivision of a company. A user belongs to at most one team, and a team has
  at most one Supervisor.

### 1.1 Roles

| Role           | Data scope                                       | Responsibilities                                                                                                          |
|----------------|--------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------|
| **Admin**      | Whole company                                    | Manages users, roles, teams, permissions and system settings. Only role that can delete customers and records by default. |
| **Supervisor** | Own team                                         | Oversees their team's customers, deals, activities and tasks; coaches team members.                                       |
| **User**       | Own records (plus teammates' when sharing is on) | Day-to-day selling: customers, deals, activities, own tasks.                                                              |
| **Customer**   | Their own profile only                           | Self-service portal account, separate from staff accounts. **No access to tasks or any internal data.**                   |

### 1.2 Permission overrides

Three per-user flags, grantable by an Admin only. Admins hold all three by default.

| Permission        | Effect                                                                                                                  |
|-------------------|-------------------------------------------------------------------------------------------------------------------------|
| `viewAllData`     | Company-wide read access to customers, deals, activities **and tasks**. The only override that changes task visibility. |
| `deleteCustomers` | May delete customer profiles.                                                                                           |
| `deleteRecords`   | May delete deals, notes, activities and files.                                                                          |

## 2. Who assigns what

| What                 | Who may set it                   | How                                                                                                                                                                               |
|----------------------|----------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Role                 | Admin only                       | `PATCH /api/users/:id/role`. Any of the three roles, Admin included, can also be chosen at sign-up, and a company may hold several Admins. An Admin cannot change their own role. |
| Team                 | Admin only                       | `PATCH /api/users/:id/team`. Moving a user changes their data visibility immediately.                                                                                             |
| Supervisor of a team | Admin only                       | Set on the team; losing the Supervisor role clears the designation.                                                                                                               |
| Permission overrides | Admin only                       | `PATCH /api/users/:id/permissions`                                                                                                                                                |
| **Task assignees**   | **Any authenticated staff user** | Set on the task itself. There is no role restriction.                                                                                                                             |

## 3. Tasks

### 3.1 The task object

| Field                     | Type              | Notes                                                                   |
|---------------------------|-------------------|-------------------------------------------------------------------------|
| `title`                   | String            | **Required.**                                                           |
| `description`             | String            | Defaults to `""`.                                                       |
| `status`                  | Enum              | `todo` \| `inprogress` \| `completed`. Defaults to `todo`.              |
| `priority`                | Enum              | `High` \| `Medium` \| `Low`. Defaults to `Medium`.                      |
| `dueDate`                 | Date              | Stored as UTC. Required when a task is created from the board.          |
| `assignedTo`              | Array of User ids | May hold several users. Never empty: it falls back to the creator.      |
| `createdBy`               | User id           | **Required.** Set from the caller's token; the client cannot choose it. |
| `customer`                | Customer id       | Optional link.                                                          |
| `deal`                    | Deal id           | Optional link.                                                          |
| `collaborative`           | Boolean           | True once a task has more than one assignee.                            |
| `createdAt` / `updatedAt` | Date              | Maintained automatically.                                               |

### 3.2 Endpoints

All endpoints need `Authorization: Bearer <token>`, obtained from `POST /api/auth/login`.
The token carries the user id as `sub` and lasts 7 days by default. Accounts whose email is
not yet confirmed cannot log in (`403`, `code: "email_not_verified"`).

| Method  | Path                      | Purpose                                                                  |
|---------|---------------------------|--------------------------------------------------------------------------|
| `GET`   | `/api/tasks`              | All tasks visible to the caller (see §3.3), newest first.                |
| `POST`  | `/api/tasks`              | Create a task.                                                           |
| `PATCH` | `/api/tasks/:id`          | Edit a task's fields. Creator only.                                      |
| `PATCH` | `/api/tasks/:id/status`   | Move a task between board columns.                                       |
| `GET`   | `/api/users/assignable`   | Everyone in the caller's company, as `_id`, `fullName`, `email`, `role`. |
| `GET`   | `/api/notifications`      | The caller's notification feed (see §3.7).                               |
| `PATCH` | `/api/notifications/read` | Marks the caller's notifications as read.                                |

`GET /api/tasks` returns each task with `assignedTo` (`_id`, `fullName`), `createdBy`
(`fullName`), `customer` (`fullName`, `company`, `interactions`) and `deal` (`name`,
`stage`, `company`) already populated. It returns a plain array, with no pagination and no
server-side filtering, and there is no `GET /api/tasks/:id` — fetch the list and select
from it.

### 3.3 Which tasks each role can read

A task is visible when **either** its `createdBy` **or** any of its `assignedTo` is in the
caller's allowed set:

| Caller                                         | Allowed set                                                | Result                                                                   |
|------------------------------------------------|------------------------------------------------------------|--------------------------------------------------------------------------|
| Admin, or anyone with `viewAllData` permission | Every user in the same company                             | All of the company's tasks.                                              |
| Supervisor                                     | All members of their own team plus any team they supervise | Their whole team's tasks. A Supervisor with no team sees only their own. |
| User                                           | Themselves                                                 | Only tasks they created or were assigned.                                |
| Customer portal account                        | NA                                                         | No access to the task API at all.                                        |

Team sharing toggles affect customer records only; they do not widen task visibility.

### 3.4 Who can change what

| Action                                                                       | Who                                                       | Enforcement                                                                                                                      |
|------------------------------------------------------------------------------|-----------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------|
| Create a task                                                                | Any authenticated staff user                              | No role check. `createdBy` is taken from the token.                                                                              |
| Assign it                                                                    | The creator, at creation or via edit                      | Any user in the same company is a valid assignee. Omitting `assignedTo` assigns the creator, so a task is never left unassigned. |
| Edit `title`, `description`, `priority`, `dueDate`, `customer`, `assignedTo` | **Creator only**                                          | `403` for anyone else, including Admins and Supervisors.                                                                         |
| Change `status`                                                              | Anyone the task is visible to, to one of the three values | For now, the endpoint accepts any value from any authenticated user, so validate before sending.                                 |
| Delete a task                                                                | Nobody                                                    | There is no delete endpoint; the only removal path is §3.6.                                                                      |

### 3.5 Lifecycle

`todo -> inprogress -> completed`, moved by drag-and-drop on the Kanban board. Any column can
move to any other; there are no forbidden transitions, no completion timestamp, and no
history log for task changes (unlike deals, which do log stage changes).

A task counts as **overdue** once `dueDate` has passed while `status` is not `completed`;
the board highlights those cards. Overdue is derived, never stored.

### 3.6 Links to other records

- **Customer.** Creating a task through `POST /api/tasks` with a `customer` id also appends
  an entry of type `Task` to that customer's interaction timeline, carrying the task id,
  title, description and author.
- **Second write path.** Customer interactions of type `Task` mirror back into the task
  collection: adding one creates a task owned by the caller, editing one updates the linked
  task's title, priority and due date, and deleting one **deletes the task**. This is the
  only way a task is ever removed. The entry and the task are tied together by task id.
  **(in development)**
- **Deal.** A task may reference a deal, and reads return the deal's `name`, `stage` and
  `company`. Nothing synchronises the two: moving a deal along the pipeline does not change
  any task's status, and vice versa.
- Deleting a customer or deal leaves the id on the task, so expect `null` for the populated
  field.

### 3.7 Task notifications **(in development)**

Three kinds of task notification reach a person's in-app panel:

| Kind              | `type`     | Goes to               | Trigger                                                                                            |
|-------------------|------------|-----------------------|----------------------------------------------------------------------------------------------------|
| Assignment        | `task`     | Each assignee         | A task is assigned to them. The message carries the task name and due date.                        |
| Deadline reminder | `reminder` | The assignee          | Seven days before the due date. The message carries the task name and due date.                    |
| Overdue           | `overdue`  | The team's Supervisor | A team member's task passes its due date. The message carries the task name and the assigned user. |

Each notification carries `user`, `title`, `message`, `type`, `read` and `relatedTask`, and
is read through `GET /api/notifications` (newest first, capped at 20).
