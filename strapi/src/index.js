"use strict";

const {
  syncAllContent,
  handleContentUpdate,
  handleContentDelete,
  createCollection,
  COLLECTION_NAME,
} = require("./services/search-sync");

const { getClient } = require("./services/typesense");

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
    console.log("🚀 Initializing Typesense search...");

    // Initialize Typesense connection and verify it works
    try {
      const typesense = getClient();

      // Test connection
      const health = await typesense.health.retrieve();
      console.log("✅ Typesense connection healthy:", health);

      // Check if collection exists, create if needed
      try {
        const existingCollection = await typesense
          .collections(COLLECTION_NAME)
          .retrieve();
        console.log(`✅ Search collection '${COLLECTION_NAME}' exists`);
        console.log(
          `📊 Collection has ${existingCollection.num_documents} documents`
        );
      } catch (collectionError) {
        if (collectionError.httpStatus === 404) {
          console.log(`📝 Creating search collection '${COLLECTION_NAME}'...`);
          await createCollection();
        } else {
          throw collectionError;
        }
      }
    } catch (initError) {
      console.error("❌ Typesense initialization failed:", initError);
      // Don't throw - let the app continue without search
      console.log("⚠️ App will continue without search functionality");
      return;
    }

    // Schedule background sync after server startup
    setTimeout(async () => {
      try {
        console.log("🔄 Starting background content sync...");

        // Check if we need a full sync
        const typesense = getClient();
        const currentCount = await typesense
          .collections(COLLECTION_NAME)
          .documents()
          .search({
            q: "*",
            query_by: "title",
            per_page: 0,
          });

        console.log(
          `📊 Current search index has ${currentCount.found} documents`
        );

        // Get database counts for comparison
        const dbCounts = {};
        const contentTypes = [
          { model: "api::blog.blog", name: "blogs" },
          { model: "api::report.report", name: "reports" },
          { model: "api::news-article.news-article", name: "news" },
        ];

        let totalDbItems = 0;
        for (const contentType of contentTypes) {
          try {
            const count = await strapi.db.query(contentType.model).count({
              filters: {
                $or: [
                  { publishedAt: { $notNull: true } },
                  { published_at: { $notNull: true } },
                ],
              },
            });
            dbCounts[contentType.name] = count;
            totalDbItems += count;
          } catch (countError) {
            console.warn(
              `⚠️ Could not count ${contentType.name}:`,
              countError.message
            );
            dbCounts[contentType.name] = 0;
          }
        }

        console.log("📊 Database counts:", dbCounts);
        console.log(`📊 Total database items: ${totalDbItems}`);

        // Decide if we need a full sync
        const syncThreshold = 0.9; // Sync if search index has less than 90% of database items
        const needsFullSync = currentCount.found < totalDbItems * syncThreshold;

        if (needsFullSync || currentCount.found === 0) {
          console.log("🔄 Full sync needed - running background sync...");

          // Run in background without blocking
          Promise.resolve().then(async () => {
            try {
              await syncAllContent();
              console.log("✅ Background sync completed successfully");
            } catch (syncError) {
              console.error("❌ Background sync failed:", syncError);
            }
          });
        } else {
          console.log("✅ Search index appears up-to-date, skipping full sync");
        }
      } catch (error) {
        console.error("❌ Failed to start background sync:", error);
      }
    }, 10000); // Wait 10 seconds after startup

    // Set up lifecycle hooks for real-time sync
    console.log("🔗 Setting up content lifecycle hooks...");

    const contentModels = [
      "api::report.report",
      "api::blog.blog",
      "api::news-article.news-article",
    ];

    for (const model of contentModels) {
      try {
        strapi.db.lifecycles.subscribe({
          models: [model],

          afterCreate: async (event) => {
            try {
              console.log(
                `📝 ${model} created: ${event.result?.id || "unknown"}`
              );
              await handleContentUpdate(event);
            } catch (error) {
              console.error(
                `❌ Error in afterCreate hook for ${model}:`,
                error
              );
            }
          },

          afterUpdate: async (event) => {
            try {
              console.log(
                `✏️ ${model} updated: ${event.result?.id || "unknown"}`
              );
              await handleContentUpdate(event);
            } catch (error) {
              console.error(
                `❌ Error in afterUpdate hook for ${model}:`,
                error
              );
            }
          },

          afterDelete: async (event) => {
            try {
              console.log(
                `🗑️ ${model} deleted: ${event.result?.id || "unknown"}`
              );
              await handleContentDelete(event);
            } catch (error) {
              console.error(
                `❌ Error in afterDelete hook for ${model}:`,
                error
              );
            }
          },

          // Also handle publish/unpublish events
          afterPublish: async (event) => {
            try {
              console.log(
                `📢 ${model} published: ${event.result?.id || "unknown"}`
              );
              await handleContentUpdate(event);
            } catch (error) {
              console.error(
                `❌ Error in afterPublish hook for ${model}:`,
                error
              );
            }
          },

          afterUnpublish: async (event) => {
            try {
              console.log(
                `📝 ${model} unpublished: ${event.result?.id || "unknown"}`
              );
              await handleContentDelete(event);
            } catch (error) {
              console.error(
                `❌ Error in afterUnpublish hook for ${model}:`,
                error
              );
            }
          },
        });

        console.log(`✅ Lifecycle hooks set up for ${model}`);
      } catch (hookError) {
        console.error(
          `❌ Failed to set up lifecycle hooks for ${model}:`,
          hookError
        );
      }
    }

    // Set up scheduled full sync (optional - for data consistency)
    if (strapi.cron) {
      try {
        strapi.cron.add({
          // Run full sync at 2 AM every day
          "0 2 * * *": async () => {
            console.log("🕐 Running scheduled daily full sync...");
            try {
              await syncAllContent();
              console.log("✅ Scheduled sync completed");
            } catch (syncError) {
              console.error("❌ Scheduled sync failed:", syncError);
            }
          },
        });
        console.log("⏰ Scheduled daily sync set up for 2 AM");
      } catch (cronError) {
        console.warn("⚠️ Could not set up scheduled sync:", cronError.message);
      }
    }

    // Add graceful shutdown handler
    const gracefulShutdown = async () => {
      console.log("🛑 Graceful shutdown: Cleaning up Typesense connections...");
      // Add any cleanup logic here if needed
    };

    process.on("SIGTERM", gracefulShutdown);
    process.on("SIGINT", gracefulShutdown);

    console.log("🎉 Typesense search initialization complete!");
  },
};
