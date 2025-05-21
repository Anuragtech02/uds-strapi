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

    setTimeout(async () => {
      // Use a separate process if possible, or run in background
      try {
        console.log("Starting background indexing process");

        // Run indexing in the background to avoid blocking the main thread
        // This won't be a true separate process, but it allows the server to continue
        Promise.resolve().then(async () => {
          try {
            await syncAllContent();
          } catch (error) {
            console.error("Background indexing failed:", error);
          }
        });

        console.log("Background indexing process scheduled");
      } catch (error) {
        console.error("Failed to start background indexing:", error);
      }
    }, 30000); // Wait 30 seconds after startup

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
        "0 8 * * *": async () => {
          // Run at 8 AM every day
          console.log("Running scheduled Typesense full sync");
          await syncAllContent();
        },
      });
    }
  },
};
