import api from './client'

// One request per panel open. Nothing is cached between opens, so a contact,
// deal or interaction created since last time shows up next time.
export const getAccountGraph = (customerId) =>
    api.get(`/relationship-graph/account/${customerId}`).then((res) => res.data)
