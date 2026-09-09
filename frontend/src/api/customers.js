import api from "./client";

export const getCustomers = () =>
    api.get("/customers").then(res => res.data);