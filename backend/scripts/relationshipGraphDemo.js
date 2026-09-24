const mongoose = require('mongoose')

// Preview must stay read-only even when the database has no collections yet.
mongoose.set('autoCreate', false)
mongoose.set('autoIndex', false)

const {EXPECTED_DATABASE, requireDemoTarget, printDemoTarget} = require('./relationshipGraphDemoConfig')
const User = require('../models/User')
const Team = require('../models/Team')
const Customer = require('../models/Customer')
const Deal = require('../models/Deal')
const Task = require('../models/Task')

const MANIFEST_COLLECTION = 'relationship_graph_demo_manifests'
const MANIFEST_ID = 'relationship-graph-g4-g5-g6-g7-g9-v1'
const MAIN_ACCOUNT = 'RG Demo - Lighthouse Account'
const OUTSIDE_ACCOUNT = 'RG Demo - Outside Team Account'
const TENANT = 'RG Demo Tenant'
const MAIN_TEAM = 'RG Demo - Lighthouse Team'
const OUTSIDE_TEAM = 'RG Demo - Outside Team'

const USER_SPECS = [
    {key: 'supervisor', fullName: 'RG Demo Supervisor', email: 'rg-demo-supervisor@local.test', role: 'Supervisor', team: 'main'},
    {key: 'repOne', fullName: 'RG Demo Rep One', email: 'rg-demo-rep-one@local.test', role: 'User', team: 'main'},
    {key: 'repTwo', fullName: 'RG Demo Rep Two', email: 'rg-demo-rep-two@local.test', role: 'User', team: 'main'},
    {key: 'outsideSupervisor', fullName: 'RG Demo Outside Supervisor', email: 'rg-demo-outside@local.test', role: 'Supervisor', team: 'outside'},
]

const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000)
const interaction = (type, days, creator, author, details) => ({
    type,
    details,
    date: daysAgo(days),
    createdBy: creator,
    author,
})

const CONTACT_SPECS = [
    {
        key: 'focus',
        fullName: 'RG Demo - Avery Focus',
        owner: 'supervisor',
        designation: 'Account Director',
        department: 'Leadership',
        interactions: [
            ['Call', 3, 'supervisor'],
            ['Email', 8, 'repOne'],
            ['Note', 12, 'supervisor'],
            ['Call', 18, 'repTwo'],
            ['Email', 25, 'repOne'],
            ['Note', 32, 'supervisor'],
        ],
    },
    {
        key: 'singleContact',
        fullName: 'RG Demo - Blake Single Contact',
        owner: 'repOne',
        designation: 'Procurement Lead',
        department: 'Procurement',
        interactions: [['Call', 10, 'repOne'], ['Note', 40, 'repOne'], ['Email', 120, 'repOne']],
    },
    {
        key: 'secondDealContact',
        fullName: 'RG Demo - Casey Second Contact',
        owner: 'repTwo',
        designation: 'Finance Approver',
        department: 'Finance',
        interactions: [
            ['Email', 14, 'repTwo'],
            ['Task', 6, 'repTwo', 'RG demo task linking the second visible contact to the expansion deal'],
        ],
    },
    {
        key: 'oldOnly',
        fullName: 'RG Demo - Devon Old Contact',
        owner: 'repOne',
        designation: 'Operations Manager',
        department: 'Operations',
        interactions: [['Call', 125, 'repOne']],
    },
    {key: 'zero', fullName: 'RG Demo - Emery No Contact', owner: 'repTwo', designation: 'Legal Counsel', department: 'Legal', interactions: []},
    {key: 'someFour', fullName: 'RG Demo - Frankie Four Touches', owner: 'supervisor', designation: 'Programme Manager', department: 'Delivery', interactions: [['Call', 4, 'supervisor'], ['Email', 9, 'supervisor'], ['Note', 16, 'repOne'], ['Call', 28, 'repTwo']]},
    {key: 'frequentFive', fullName: 'RG Demo - Gray Five Touches', owner: 'repOne', designation: 'Technical Lead', department: 'Engineering', interactions: [['Call', 2, 'repOne'], ['Email', 7, 'repOne'], ['Note', 11, 'repOne'], ['Call', 20, 'repOne'], ['Email', 35, 'repOne']]},
    {key: 'someOne', fullName: 'RG Demo - Harper One Touch', owner: 'repTwo', designation: 'Site Manager', department: 'Operations', interactions: [['Note', 21, 'repTwo']]},
    {key: 'someThree', fullName: 'RG Demo - Indigo Three Touches', owner: 'supervisor', designation: 'Sustainability Lead', department: 'Strategy', interactions: [['Call', 5, 'supervisor'], ['Email', 15, 'supervisor'], ['Note', 45, 'supervisor']]},
    {key: 'unowned', fullName: 'RG Demo - Jordan Unowned', owner: null, designation: 'Business Analyst', department: 'Analysis', interactions: []},
]

const SUMMARY = {
    tenant: TENANT,
    teams: 2,
    users: USER_SPECS.length,
    mainAccountContacts: CONTACT_SPECS.length,
    outsideAccountContacts: 1,
    contacts: CONTACT_SPECS.length + 1,
    deals: 4,
    tasks: 1,
    interactions: CONTACT_SPECS.reduce((total, contact) => total + contact.interactions.length, 0) + 1,
}

const parseCommand = () => {
    const [command, ...args] = process.argv.slice(2)
    if (!['preview', 'seed', 'cleanup'].includes(command)) {
        throw new Error('Usage: node scripts/relationshipGraphDemo.js <preview|seed|cleanup> [--confirm database]')
    }

    const confirmAt = args.indexOf('--confirm')
    const confirmation = confirmAt >= 0 ? args[confirmAt + 1] : null
    if (command !== 'preview' && confirmation !== EXPECTED_DATABASE) {
        throw new Error(`Refusing ${command} without --confirm ${EXPECTED_DATABASE}`)
    }
    return command
}

const printPlan = (target) => {
    printDemoTarget(target)
    console.log(`Tenant: ${SUMMARY.tenant}`)
    console.log(`Teams: ${SUMMARY.teams}; users: ${SUMMARY.users}`)
    console.log(`Contacts: ${SUMMARY.contacts} (${SUMMARY.mainAccountContacts} in "${MAIN_ACCOUNT}", ${SUMMARY.outsideAccountContacts} outside-team)`)
    console.log(`Deals: ${SUMMARY.deals}; tasks: ${SUMMARY.tasks}; embedded interactions: ${SUMMARY.interactions}`)
    console.log('No data has been written.')
}

const idsForPlan = () => {
    const objectIds = (keys) => Object.fromEntries(keys.map((key) => [key, new mongoose.Types.ObjectId()]))
    return {
        teams: objectIds(['main', 'outside']),
        users: objectIds(USER_SPECS.map((user) => user.key)),
        contacts: objectIds([...CONTACT_SPECS.map((contact) => contact.key), 'outside']),
        deals: objectIds(['single', 'multi', 'unmatched', 'outside']),
        tasks: objectIds(['multiLink']),
    }
}

const serialiseIds = (ids) => ({
    teamIds: Object.values(ids.teams),
    userIds: Object.values(ids.users),
    customerIds: Object.values(ids.contacts),
    dealIds: Object.values(ids.deals),
    taskIds: Object.values(ids.tasks),
})

const seed = async (target, password) => {
    if (!password || password.length < 8) {
        throw new Error('RG_DEMO_PASSWORD must contain at least 8 characters')
    }

    const manifests = mongoose.connection.collection(MANIFEST_COLLECTION)
    const existing = await manifests.findOne({_id: MANIFEST_ID})
    if (existing?.status === 'ready') {
        console.log('Demo records already exist; nothing was created.')
        console.log(`Login: ${USER_SPECS[0].email}`)
        console.log(`Focus customer ID: ${existing.focusCustomerId}`)
        console.log(`Outside-team customer ID: ${existing.outsideCustomerId}`)
        return
    }
    if (existing) {
        throw new Error('A partial demo manifest exists. Run cleanup before seeding again.')
    }

    const populatedCollections = await Promise.all([
        User.estimatedDocumentCount(),
        Team.estimatedDocumentCount(),
        Customer.estimatedDocumentCount(),
        Deal.estimatedDocumentCount(),
        Task.estimatedDocumentCount(),
    ])
    if (populatedCollections.some((count) => count > 0)) {
        throw new Error('The isolated demo database is not empty and has no demo manifest; refusing to write')
    }

    const ids = idsForPlan()
    const trackedIds = serialiseIds(ids)
    await manifests.insertOne({
        _id: MANIFEST_ID,
        status: 'creating',
        targetDatabase: target.database,
        ...trackedIds,
        focusCustomerId: ids.contacts.focus,
        outsideCustomerId: ids.contacts.outside,
        createdAt: new Date(),
    })

    try {
        await Team.create([
            {_id: ids.teams.main, name: MAIN_TEAM, company: TENANT, supervisor: ids.users.supervisor, sharingEnabled: true},
            {_id: ids.teams.outside, name: OUTSIDE_TEAM, company: TENANT, supervisor: ids.users.outsideSupervisor, sharingEnabled: false},
        ])

        await User.create(USER_SPECS.map((user) => ({
            _id: ids.users[user.key],
            fullName: user.fullName,
            email: user.email,
            password,
            companyName: TENANT,
            role: user.role,
            team: ids.teams[user.team],
            emailVerified: true,
            authProvider: 'local',
            isActive: true,
        })))

        const customers = CONTACT_SPECS.map((contact, index) => ({
            _id: ids.contacts[contact.key],
            fullName: contact.fullName,
            phone: `0400 900 ${String(index + 1).padStart(3, '0')}`,
            email: `rg-demo-contact-${index + 1}@local.test`,
            company: MAIN_ACCOUNT,
            address: `${index + 1} Demo Avenue`,
            designation: contact.designation,
            department: contact.department,
            owner: contact.owner ? ids.users[contact.owner] : null,
            team: ids.teams.main,
            interactions: contact.interactions.map(([type, days, creator, details]) =>
                interaction(
                    type,
                    days,
                    ids.users[creator],
                    USER_SPECS.find((user) => user.key === creator).fullName,
                    details || `RG demo ${type.toLowerCase()} entry`
                )
            ),
        }))
        customers.push({
            _id: ids.contacts.outside,
            fullName: 'RG Demo - Outside Team Contact',
            phone: '0400 999 999',
            email: 'rg-demo-outside-contact@local.test',
            company: OUTSIDE_ACCOUNT,
            address: '99 Outside Avenue',
            designation: 'Outside Account Lead',
            department: 'Sales',
            owner: ids.users.outsideSupervisor,
            team: ids.teams.outside,
            interactions: [
                interaction(
                    'Call',
                    7,
                    ids.users.outsideSupervisor,
                    USER_SPECS[3].fullName,
                    'RG demo outside-team call'
                ),
            ],
        })
        await Customer.create(customers)

        await Deal.create([
            {_id: ids.deals.single, name: 'RG Demo - Single Contact Renewal', company: MAIN_ACCOUNT, price: '45000', stage: 'Proposal Made', priority: 'High', probability: 65, assignee: USER_SPECS[1].fullName, customer: CONTACT_SPECS[1].fullName, createdBy: ids.users.repOne},
            {_id: ids.deals.multi, name: 'RG Demo - Two Contact Expansion', company: MAIN_ACCOUNT, price: '120000', stage: 'Negotiation', priority: 'High', probability: 75, assignee: USER_SPECS[2].fullName, customer: CONTACT_SPECS[0].fullName, createdBy: ids.users.repTwo},
            {_id: ids.deals.unmatched, name: 'RG Demo - Unmatched Opportunity', company: MAIN_ACCOUNT, price: '30000', stage: 'Qualified', priority: 'Medium', probability: 25, assignee: USER_SPECS[0].fullName, customer: 'RG Demo - Missing Contact', createdBy: ids.users.supervisor},
            {_id: ids.deals.outside, name: 'RG Demo - Outside Team Deal', company: OUTSIDE_ACCOUNT, price: '15000', stage: 'Contact Made', priority: 'Low', probability: 35, assignee: USER_SPECS[3].fullName, customer: 'RG Demo - Outside Team Contact', createdBy: ids.users.outsideSupervisor},
        ])

        // This matches the normal task route's dual write: one Task document and
        // one Customer.interactions Task entry already included on Casey above.
        await Task.create({
            _id: ids.tasks.multiLink,
            title: 'RG Demo - Confirm expansion budget',
            company: MAIN_ACCOUNT,
            description: 'RG demo task linking the second visible contact to the expansion deal',
            priority: 'High',
            status: 'todo',
            dueDate: daysAgo(-14),
            assignedTo: [ids.users.repOne],
            createdBy: ids.users.repTwo,
            customer: ids.contacts.secondDealContact,
            deal: ids.deals.multi,
            collaborative: true,
            createdAt: daysAgo(6),
            updatedAt: daysAgo(6),
        })

        await manifests.updateOne(
            {_id: MANIFEST_ID},
            {$set: {status: 'ready', completedAt: new Date()}}
        )
    } catch (error) {
        throw new Error(`Demo seed stopped with a tracked partial manifest: ${error.message}`)
    }

    console.log('Relationship Graph demo records created.')
    console.log(`Login: ${USER_SPECS[0].email}`)
    console.log(`Focus customer: ${CONTACT_SPECS[0].fullName}`)
    console.log(`Focus customer ID: ${ids.contacts.focus}`)
    console.log(`Outside-team customer ID: ${ids.contacts.outside}`)
}

const cleanup = async () => {
    const manifests = mongoose.connection.collection(MANIFEST_COLLECTION)
    const manifest = await manifests.findOne({_id: MANIFEST_ID})
    if (!manifest) {
        console.log('No Relationship Graph demo manifest found; nothing was deleted.')
        return
    }

    const result = {}
    result.tasks = (await Task.deleteMany({_id: {$in: manifest.taskIds || []}})).deletedCount
    result.deals = (await Deal.deleteMany({_id: {$in: manifest.dealIds || []}})).deletedCount
    result.customers = (await Customer.deleteMany({_id: {$in: manifest.customerIds || []}})).deletedCount
    result.users = (await User.deleteMany({_id: {$in: manifest.userIds || []}})).deletedCount
    result.teams = (await Team.deleteMany({_id: {$in: manifest.teamIds || []}})).deletedCount
    await manifests.deleteOne({_id: MANIFEST_ID})

    console.log(`Deleted demo records: ${JSON.stringify(result)}`)
}

const main = async () => {
    const command = parseCommand()
    const target = requireDemoTarget()

    if (command === 'preview') printPlan(target)
    else printDemoTarget(target)

    await mongoose.connect(target.raw, {serverSelectionTimeoutMS: 3000})
    if (mongoose.connection.db.databaseName !== EXPECTED_DATABASE) {
        throw new Error(`Connected to unexpected database: ${mongoose.connection.db.databaseName}`)
    }

    if (command === 'preview') {
        const manifest = await mongoose.connection.collection(MANIFEST_COLLECTION).findOne({_id: MANIFEST_ID})
        console.log(`Existing demo manifest: ${manifest ? manifest.status : 'none'}`)
        return
    }
    if (command === 'seed') await seed(target, process.env.RG_DEMO_PASSWORD)
    if (command === 'cleanup') await cleanup()
}

main()
    .catch((error) => {
        console.error(error.message)
        process.exitCode = 1
    })
    .finally(async () => {
        await mongoose.disconnect()
    })
