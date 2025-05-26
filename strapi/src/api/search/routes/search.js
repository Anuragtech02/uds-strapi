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
      method: "DELETE",
      path: "/search/cleanup",
      handler: "search.cleanupCollection",
    },
    {
      method: "GET",
      path: "/search/test-blogs",
      handler: "search.testBlogSearch",
    },
    {
      method: "GET",
      path: "/search/debug-locales",
      handler: "search.debugLocales",
    },
    {
      method: "GET",
      path: "/search/debug-collection",
      handler: "search.debugCollectionIssues",
      config: {
        auth: false, // Remove for production
      },
    },
    {
      method: "GET",
      path: "/search/test-frontend",
      handler: "search.testFrontendSearch",
      config: {
        auth: false, // Remove for production
      },
    },
    // Add these routes to your search routes file

    {
      method: "GET",
      path: "/search/debug-blog-sync",
      handler: "search.debugBlogSync",
      config: {
        auth: false, // Remove for production
      },
    },
    {
      method: "POST",
      path: "/search/sync-english-blogs",
      handler: "search.syncEnglishBlogsOnly",
      config: {
        auth: false,
      },
    },
    {
      method: "GET",
      path: "/search/debug-sync-difference",
      handler: "search.debugFullSyncVsSeparate",
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/search/test-main-sync-blogs",
      handler: "search.testMainSyncBlogsOnly",
      config: { auth: { scope: ["admin"] } },
    },
    {
      method: "GET",
      path: "/search/debug-collection-recreation",
      handler: "search.debugCollectionRecreation",
      config: { auth: false },
    },
  ],
};
