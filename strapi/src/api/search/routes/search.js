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
        auth: {
          scope: ["admin"],
        },
      },
    },
    {
      method: "GET",
      path: "/search/debug",
      handler: "search.debugSearch",
    },
  ],
};
