// Validates every factory against its real Mongoose schema. This needs no
// database, because validate() applies required fields, enums and casting, so it
// catches a factory that has drifted from its schema the moment it happens.
//
// This is the exact class of defect that made logging a Task from a customer
// profile fail: a document built without a field the schema marks required.

const Team = require('../models/Team')
const User = require('../models/User')
const Customer = require('../models/Customer')
const Deal = require('../models/Deal')
const Task = require('../models/Task')
const Interaction = require('../models/Interaction')

const {
    makeTeam,
    makeUser,
    makeCustomer,
    makeInteraction,
    makeDeal,
    makeTask,
    makeLegacyInteraction,
    oid,
    daysAgo,
} = require('./helpers/factories')

const CASES = [
    ['Team', Team, makeTeam],
    ['User', User, makeUser],
    ['Customer', Customer, makeCustomer],
    ['Deal', Deal, makeDeal],
    ['Task', Task, makeTask],
    ['Interaction (legacy)', Interaction, makeLegacyInteraction],
]

describe('factories produce schema-valid documents', () => {
    it.each(CASES)('%s', async (_name, Model, make) => {
        await expect(new Model(make()).validate()).resolves.toBeUndefined()
    })

    it('Customer with embedded interactions', async () => {
        const customer = makeCustomer({
            interactions: [
                makeInteraction({type: 'Email'}),
                makeInteraction({type: 'Call', date: daysAgo(95)}),
                makeInteraction({type: 'Task'}),
                makeInteraction({type: 'Note'}),
            ],
        })
        const doc = new Customer(customer)
        await expect(doc.validate()).resolves.toBeUndefined()
        expect(doc.interactions).toHaveLength(4)
        // The enum accepted all four types the CRM records.
        expect(doc.interactions.map((i) => i.type)).toEqual(['Email', 'Call', 'Task', 'Note'])
    })
})

describe('factories accept overrides', () => {
    it('shallow-merges overrides over the defaults', () => {
        const owner = oid()
        const customer = makeCustomer({company: '  TranXenergy  ', owner})
        expect(customer.company).toBe('  TranXenergy  ')
        expect(customer.owner).toBe(owner)
        // Untouched defaults survive.
        expect(customer.designation).toBe('Procurement Lead')
    })

    it('generates unique emails across calls', () => {
        const emails = [makeUser().email, makeUser().email, makeUser().email]
        expect(new Set(emails).size).toBe(3)
    })

    it('daysAgo() produces a date the given number of days in the past', () => {
        const d = daysAgo(90)
        const delta = Date.now() - d.getTime()
        expect(delta).toBeGreaterThan(89.9 * 24 * 60 * 60 * 1000)
        expect(delta).toBeLessThan(90.1 * 24 * 60 * 60 * 1000)
    })
})

describe('factories surface schema violations rather than hiding them', () => {
    it('a Task without createdBy fails validation', async () => {
        const {createdBy: _omitted, ...withoutCreator} = makeTask()
        await expect(new Task(withoutCreator).validate()).rejects.toMatchObject({
            errors: {createdBy: expect.anything()},
        })
    })

    it('a Deal with an unknown stage fails validation', async () => {
        await expect(new Deal(makeDeal({stage: 'Not A Stage'})).validate()).rejects.toMatchObject({
            errors: {stage: expect.anything()},
        })
    })
})
