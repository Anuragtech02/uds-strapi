"use strict";

const {
  initializeTypesense,
  syncAllContent,
  syncSingleItem,
  deleteSingleItem,
} = require("./services/search-sync");

module.exports = {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   */
  register(/*{ strapi }*/) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   */
  async bootstrap({ strapi }) {
    // Initialize Typesense on startup
    await initializeTypesense();

    // Set up automatic content synchronization after server fully starts
    setTimeout(async () => {
      await syncAllContent();
    }, 10000);

    // Register lifecycle hooks for real-time updates

    // Report lifecycle hooks
    strapi.db.lifecycles.subscribe({
      models: ["api::report.report"],
      afterCreate: async ({ result }) => {
        await syncSingleItem(result, "api::report.report");
      },
      afterUpdate: async ({ result }) => {
        await syncSingleItem(result, "api::report.report");
      },
      afterDelete: async ({ result }) => {
        await deleteSingleItem(result, "api::report.report");
      },
    });

    // Blog lifecycle hooks
    strapi.db.lifecycles.subscribe({
      models: ["api::blog.blog"],
      afterCreate: async ({ result }) => {
        await syncSingleItem(result, "api::blog.blog");
      },
      afterUpdate: async ({ result }) => {
        await syncSingleItem(result, "api::blog.blog");
      },
      afterDelete: async ({ result }) => {
        await deleteSingleItem(result, "api::blog.blog");
      },
    });

    // News Article lifecycle hooks
    strapi.db.lifecycles.subscribe({
      models: ["api::news-article.news-article"],
      afterCreate: async ({ result }) => {
        await syncSingleItem(result, "api::news-article.news-article");
      },
      afterUpdate: async ({ result }) => {
        await syncSingleItem(result, "api::news-article.news-article");
      },
      afterDelete: async ({ result }) => {
        await deleteSingleItem(result, "api::news-article.news-article");
      },
    });

    // Add a scheduled task to ensure full sync daily
    if (strapi.cron) {
      strapi.cron.add({
        "0 3 * * *": async () => {
          // Run at 3 AM every day
          console.log("Running scheduled Typesense full sync");
          await syncAllContent();
        },
      });
    }
  },
};
