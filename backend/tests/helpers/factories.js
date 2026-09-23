// Document builders for database-backed suites.
//
// Each builder returns a plain object with every field its schema marks
// required, so `Model.create(makeX())` succeeds without the caller restating
// boilerplate. Overrides are shallow-merged, so a test states only what it is
// actually testing:
//
//   const quiet = makeCustomer({fullName: 'Quiet Contact', interactions: []})
//
// tests/factories.test.js validates every builder against its schema, which
// needs no database and catches a drifted required field immediately.

const mongoose = require('mongoose')

// Keeps generated emails unique within a run without pulling in a uuid dep.
let sequence = 0
const nextId = () => ++sequence

const oid = () => new mongoose.Types.ObjectId()

const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000)

const makeTeam = (overrides = {}) => ({
    name: `Team ${nextId()}`,
    company: 'TranXenergy',
    supervisor: null,
    sharingEnabled: false,
    ...overrides,
})

const makeUser = (overrides = {}) => {
    const n = nextId()
    return {
        fullName: `Test User ${n}`,
        email: `user${n}@example.com`,
        password: 'correct-horse-battery-staple',
        companyName: 'TranXenergy',
        role: 'User',
        team: null,
        permissions: {deleteCustomers: false, deleteRecords: false, viewAllData: false},
        authProvider: 'local',
        ...overrides,
    }
}

// An entry in Customer.interactions[]. `date` drives the relationship graph's
// 90-day window, so it is the field tests most often override.
const makeInteraction = (overrides = {}) => ({
    type: 'Note',
    details: 'Logged during a test',
    date: daysAgo(1),
    createdBy: oid(),
    author: 'Test User',
    ...overrides,
})

const makeCustomer = (overrides = {}) => {
    const n = nextId()
    return {
        fullName: `Contact ${n}`,
        phone: '0400000000',
        email: `contact${n}@example.com`,
        company: 'TranXenergy',
        address: '1 Test Street',
        designation: 'Procurement Lead',
        department: 'Procurement',
        owner: null,
        team: null,
        interactions: [],
        ...overrides,
    }
}

const makeDeal = (overrides = {}) => ({
    name: `Deal ${nextId()}`,
    company: 'TranXenergy',
    price: '48000',
    stage: 'Qualified',
    priority: 'Medium',
    probability: 20,
    assignee: '',
    customer: '',
    createdBy: oid(),
    ...overrides,
})

const makeTask = (overrides = {}) => ({
    title: `Task ${nextId()}`,
    company: 'TranXenergy',
    priority: 'Medium',
    status: 'todo',
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    assignedTo: [],
    createdBy: oid(),
    description: '',
    customer: null,
    deal: null,
    collaborative: false,
    ...overrides,
})

// A row in the standalone (legacy) Interaction collection, which requires a
// `time` string the application code never sets. Kept so a test can seed the
// collection deliberately.
const makeLegacyInteraction = (overrides = {}) => ({
    entityId: String(oid()),
    type: 'Note',
    desc: 'Legacy row',
    author: 'Test User',
    time: new Date().toISOString(),
    ...overrides,
})

module.exports = {
    oid,
    daysAgo,
    makeTeam,
    makeUser,
    makeCustomer,
    makeInteraction,
    makeDeal,
    makeTask,
    makeLegacyInteraction,
}
