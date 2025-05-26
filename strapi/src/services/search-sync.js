"use strict";

const { getClient } = require("./typesense");

// Import the document preparation helpers
const {
  prepareDocument,
  prepareBlogDocument,
  prepareReportDocument,
  prepareNewsDocument,
  prepareDocumentForIndexing,
} = require("./document-helpers"); // You'll create this file with the helper functions

const COLLECTION_NAME = "search_content_v2";

const COLLECTION_SCHEMA = {
  name: COLLECTION_NAME,
  fields: [
    { name: "id", type: "string" },
    { name: "originalId", type: "string" },
    { name: "title", type: "string" },
    { name: "shortDescription", type: "string", optional: true },
    { name: "slug", type: "string", optional: true },
    { name: "entity", type: "string", facet: true },
    { name: "locale", type: "string", facet: true },
    { name: "highlightImage", type: "object", optional: true },
    { name: "oldPublishedAt", type: "int64", optional: true },
    { name: "createdAt", type: "int64", optional: true },
    { name: "industries", type: "string[]", facet: true, optional: true },
    { name: "geographies", type: "string[]", facet: true, optional: true },
    { name: "author", type: "string", optional: true },
    { name: "tags", type: "string[]", facet: true, optional: true },
    { name: "source", type: "string", optional: true },
    { name: "category", type: "string", optional: true },
    { name: "reportType", type: "string", optional: true },
    { name: "pages", type: "int32", optional: true },
    { name: "price", type: "float", optional: true },
  ],
};

async function createCollection() {
  const typesense = getClient();

  try {
    // Try to delete existing collection
    try {
      await typesense.collections(COLLECTION_NAME).delete();
      console.log(`🗑️ Deleted existing collection: ${COLLECTION_NAME}`);
    } catch (deleteError) {
      if (deleteError.httpStatus !== 404) {
        console.log("⚠️ Error deleting collection:", deleteError.message);
      }
    }

    // Wait a moment for cleanup
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Create new collection
    const result = await typesense.collections().create(COLLECTION_SCHEMA);
    console.log(`✅ Created collection: ${COLLECTION_NAME}`);
    return result;
  } catch (error) {
    console.error("❌ Error creating collection:", error);
    throw error;
  }
}

async function syncContentType(model, entityType, batchSize = 50) {
  console.log(`\n🔄 Syncing ${entityType}...`);

  try {
    // Get total count first
    const total = await strapi.db.query(model).count({
      filters: {
        $or: [
          { publishedAt: { $notNull: true } },
          { published_at: { $notNull: true } },
        ],
      },
    });

    console.log(`📊 Found ${total} published ${entityType} items`);

    if (total === 0) {
      console.log(`⚠️ No published ${entityType} items found`);
      return { synced: 0, failed: 0 };
    }

    const typesense = getClient();
    let synced = 0;
    let failed = 0;

    // Process in batches
    for (let offset = 0; offset < total; offset += batchSize) {
      try {
        console.log(
          `📦 Processing batch ${
            Math.floor(offset / batchSize) + 1
          }/${Math.ceil(total / batchSize)} (${offset + 1}-${Math.min(
            offset + batchSize,
            total
          )})`
        );

        const items = await strapi.db.query(model).findMany({
          offset,
          limit: batchSize,
          filters: {
            $or: [
              { publishedAt: { $notNull: true } },
              { published_at: { $notNull: true } },
            ],
          },
          populate: {
            industries: { select: ["name"] },
            industry: { select: ["name"] },
            geographies: { select: ["name"] },
            geography: { select: ["name"] },
            highlightImage: {
              select: ["url", "alternativeText", "width", "height"],
            },
            featuredImage: {
              select: ["url", "alternativeText", "width", "height"],
            },
            author: { select: ["name", "username"] },
            tags: { select: ["name"] },
            source: { select: ["name"] },
            category: { select: ["name"] },
            reportType: { select: ["name"] },
          },
        });

        if (items.length === 0) {
          console.log("📭 No items in this batch");
          continue;
        }

        // Prepare documents for indexing
        const documents = [];
        for (const item of items) {
          try {
            const doc = prepareDocumentForIndexing(item, entityType);
            documents.push(doc);

            // Log first few documents for debugging
            if (documents.length <= 3 && offset === 0) {
              console.log(`📝 Sample document ${documents.length}:`, {
                id: doc.id,
                originalId: doc.originalId,
                title: doc.title?.substring(0, 50) + "...",
                entity: doc.entity,
                locale: doc.locale,
                hasShortDescription: !!doc.shortDescription,
                industriesCount: doc.industries?.length || 0,
                geographiesCount: doc.geographies?.length || 0,
              });
            }
          } catch (prepError) {
            console.error(
              `❌ Error preparing ${entityType} item ${item.id}:`,
              prepError
            );
            failed++;
          }
        }

        if (documents.length > 0) {
          // Index batch to Typesense
          const results = await typesense
            .collections(COLLECTION_NAME)
            .documents()
            .import(documents, { action: "upsert" });

          // Check results
          const batchFailed = results.filter((r) => !r.success);
          const batchSucceeded = results.filter((r) => r.success);

          synced += batchSucceeded.length;
          failed += batchFailed.length;

          console.log(
            `✅ Batch result: ${batchSucceeded.length} succeeded, ${batchFailed.length} failed`
          );

          if (batchFailed.length > 0) {
            console.log("❌ Failed items:", batchFailed.slice(0, 3)); // Show first 3 failures
          }
        }
      } catch (batchError) {
        console.error(`❌ Batch processing error:`, batchError);
        failed += batchSize; // Assume all items in batch failed
      }
    }

    console.log(
      `🎉 ${entityType} sync complete: ${synced} synced, ${failed} failed`
    );
    return { synced, failed };
  } catch (error) {
    console.error(`❌ Error syncing ${entityType}:`, error);
    throw error;
  }
}

async function syncAllContent() {
  console.log("🚀 Starting full content sync...");
  const startTime = Date.now();

  try {
    // Create collection first
    await createCollection();

    // Wait for collection to be ready
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const results = {};

    // Sync each content type
    const contentTypes = [
      { model: "api::blog.blog", entity: "api::blog.blog", name: "Blogs" },
      {
        model: "api::report.report",
        entity: "api::report.report",
        name: "Reports",
      },
      {
        model: "api::news-article.news-article",
        entity: "api::news-article.news-article",
        name: "News",
      },
    ];

    for (const contentType of contentTypes) {
      try {
        results[contentType.name] = await syncContentType(
          contentType.model,
          contentType.entity
        );
      } catch (typeError) {
        console.error(`❌ Failed to sync ${contentType.name}:`, typeError);
        results[contentType.name] = {
          synced: 0,
          failed: 0,
          error: typeError.message,
        };
      }
    }

    // Verify final counts
    console.log("\n🔍 Verifying sync results...");
    const typesense = getClient();

    try {
      const finalCount = await typesense
        .collections(COLLECTION_NAME)
        .documents()
        .search({
          q: "*",
          query_by: "title",
          per_page: 0,
          facet_by: "entity",
        });

      console.log(`📊 Total documents in search index: ${finalCount.found}`);
      console.log(
        "📊 By entity type:",
        finalCount.facet_counts?.[0]?.counts || []
      );
    } catch (verifyError) {
      console.error("❌ Error verifying sync:", verifyError);
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n🎉 Full sync completed in ${duration} seconds`);
    console.log("📋 Results:", results);

    return results;
  } catch (error) {
    console.error("❌ Full sync failed:", error);
    throw error;
  }
}

// Lifecycle hooks for real-time sync
async function handleContentUpdate(event) {
  const { model, entry } = event.params;

  // Only sync published content
  if (!entry.publishedAt && !entry.published_at) {
    console.log(`⏭️ Skipping unpublished ${model} item ${entry.id}`);
    return;
  }

  console.log(`🔄 Syncing updated ${model} item ${entry.id}`);

  try {
    const typesense = getClient();

    // Get full item with relations
    const fullItem = await strapi.db.query(model).findOne({
      where: { id: entry.id },
      populate: {
        industries: { select: ["name"] },
        industry: { select: ["name"] },
        geographies: { select: ["name"] },
        geography: { select: ["name"] },
        highlightImage: {
          select: ["url", "alternativeText", "width", "height"],
        },
        featuredImage: {
          select: ["url", "alternativeText", "width", "height"],
        },
        author: { select: ["name", "username"] },
        tags: { select: ["name"] },
        source: { select: ["name"] },
        category: { select: ["name"] },
        reportType: { select: ["name"] },
      },
    });

    if (!fullItem) {
      console.log(`⚠️ Item ${entry.id} not found for sync`);
      return;
    }

    const doc = prepareDocumentForIndexing(fullItem, model);

    await typesense.collections(COLLECTION_NAME).documents().upsert(doc);

    console.log(`✅ Successfully synced ${model} item ${entry.id}`);
  } catch (error) {
    console.error(`❌ Error syncing ${model} item ${entry.id}:`, error);
  }
}

async function handleContentDelete(event) {
  const { model, entry } = event.params;

  console.log(`🗑️ Removing ${model} item ${entry.id} from search`);

  try {
    const typesense = getClient();
    const documentId = `${entry.id}_${entry.locale || "en"}`;

    await typesense.collections(COLLECTION_NAME).documents(documentId).delete();

    console.log(`✅ Successfully removed ${model} item ${entry.id}`);
  } catch (error) {
    if (error.httpStatus !== 404) {
      console.error(`❌ Error removing ${model} item ${entry.id}:`, error);
    }
  }
}

module.exports = {
  syncAllContent,
  handleContentUpdate,
  handleContentDelete,
  syncContentType,
  createCollection,
  COLLECTION_NAME,
  COLLECTION_SCHEMA,
};
