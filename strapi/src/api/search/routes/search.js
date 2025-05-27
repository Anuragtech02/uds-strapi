"use strict";

module.exports = {
  routes: [
    {
      method: "GET",
      path: "/search",
      handler: "search.search",
      config: {
        auth: false,
      },
    },
    {
      method: "POST",
      path: "/search/sync",
      handler: "search.syncAll",
      config: {
        auth: false,
      },
    },
    {
      method: "GET",
      path: "/search/debug",
      handler: "search.debugSearch",
    },
    {
      method: "GET",
      path: "/search/audit",
      handler: "search.databaseAudit",
    },
    {
      method: "POST",
      path: "/search/sync-clean",
      handler: "search.syncAllClean",
      config: { auth: false },
    },
  ],
};
