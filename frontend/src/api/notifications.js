import api from "./client";

export const getNotifications = () =>
    api.get("/notifications").then(r => r.data);

export const markNotificationsRead = () =>
    api.patch("/notifications/read").then(r => r.data);