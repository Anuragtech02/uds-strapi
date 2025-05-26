"use strict";

const { getClient } = require("./typesense");

// Import the document preparation helpers
const {
  prepareDocument,
  prepareBlogDocument,
  prepareReportDocument,
  prepareNewsDocument,
  prepareDocumentForIndexing,
  prepareDocumentWithMedia,
} = require("./document-helpers");

const COLLECTION_NAME = "search_content_v2";

const COLLECTION_SCHEMA = {
  name: "search_content_v2",
  fields: [
    { name: "id", type: "string" },
    { name: "originalId", type: "string" },
    { name: "title", type: "string" },
    { name: "shortDescription", type: "string", optional: true },
    { name: "slug", type: "string", optional: true },
    { name: "entity", type: "string", facet: true },
    { name: "locale", type: "string", facet: true },
    { name: "highlightImage", type: "string", optional: true }, // ✅ Changed from "object" to "string"
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
      } else {
        console.log("ℹ️ Collection doesn't exist, creating new one");
      }
    }

    // Wait a moment for cleanup
    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log(
      "📋 Creating collection with schema:",
      JSON.stringify(COLLECTION_SCHEMA, null, 2)
    );

    // Create new collection
    const result = await typesense.collections().create(COLLECTION_SCHEMA);
    console.log(`✅ Created collection: ${COLLECTION_NAME}`);
    return result;
  } catch (error) {
    console.error("❌ Error creating collection:", error);
    console.error("❌ Error details:", {
      message: error.message,
      httpStatus: error.httpStatus,
      httpBody: error.httpBody,
    });
    throw error;
  }
}

async function syncContentType(model, entityType, batchSize = 5) {
  console.log(`\n🔄 Syncing ${entityType}...`);

  try {
    // STEP 1: Get all published content IDs first (without any populate)
    const publishedItems = await strapi.db.query(model).findMany({
      select: ["id", "locale"],
      filters: {
        $or: [
          { publishedAt: { $notNull: true } },
          { published_at: { $notNull: true } },
        ],
      },
    });

    const total = publishedItems.length;
    console.log(`📊 Found ${total} published ${entityType} items`);

    if (total === 0) {
      console.log(`⚠️ No published ${entityType} items found`);
      return { synced: 0, failed: 0 };
    }

    const typesense = getClient();
    let synced = 0;
    let failed = 0;

    // STEP 2: Process in batches using the IDs (no filters in main query)
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

        const batchIds = publishedItems
          .slice(offset, offset + batchSize)
          .map((item) => item.id);

        // Build populate object based on entity type
        let populateObj = {};

        if (entityType === "api::report.report") {
          populateObj = {
            industry: true,
            geography: true,
            highlightImage: true, // ✅ This should work now without filters
          };
        } else if (entityType === "api::blog.blog") {
          populateObj = {
            industries: true,
          };
        } else if (entityType === "api::news-article.news-article") {
          populateObj = {
            industries: true,
          };
        }

        // STEP 3: Get full items by ID (no publishedAt filters here!)
        const items = await strapi.db.query(model).findMany({
          where: {
            id: { $in: batchIds }, // ✅ Only filter by ID, no publishedAt filters
          },
          populate: populateObj,
        });

        console.log(`📄 Retrieved ${items.length} items for batch`);

        if (items.length === 0) {
          console.log("📭 No items in this batch");
          continue;
        }

        // Prepare documents for indexing
        const documents = [];
        for (const item of items) {
          try {
            const doc = prepareDocumentWithMedia(item, entityType);
            documents.push(doc);

            // Log first few documents for debugging
            if (documents.length <= 3 && offset === 0) {
              console.log(
                `📝 Sample ${entityType} document ${documents.length}:`,
                {
                  id: doc.id,
                  originalId: doc.originalId,
                  title: doc.title?.substring(0, 50) + "...",
                  entity: doc.entity,
                  locale: doc.locale,
                  hasHighlightImage: !!doc.highlightImage,
                  highlightImageUrl: doc.highlightImage,
                  industriesCount: doc.industries?.length || 0,
                  geographiesCount: doc.geographies?.length || 0,
                }
              );
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
            console.log("❌ Failed items sample:", batchFailed.slice(0, 2));
          }
        }
      } catch (batchError) {
        console.error(`❌ Batch processing error:`, batchError.message);
        failed += batchSize;

        // Continue with next batch instead of stopping
        console.log("⏭️ Continuing with next batch...");
        continue;
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
  console.log("🚀 Starting full content sync (preserving existing data)...");
  const startTime = Date.now();

  try {
    const typesense = getClient();

    // FIXED: Don't recreate collection if it exists - just verify it's there
    let collectionExists = false;
    try {
      const existingCollection = await typesense
        .collections(COLLECTION_NAME)
        .retrieve();
      console.log(
        `✅ Using existing collection '${COLLECTION_NAME}' with ${existingCollection.num_documents} documents`
      );
      collectionExists = true;

      // Show current counts before sync
      const currentCounts = await typesense
        .collections(COLLECTION_NAME)
        .documents()
        .search({
          q: "*",
          query_by: "title",
          per_page: 0,
          facet_by: "entity",
        });

      console.log(
        "📊 Current entity counts:",
        currentCounts.facet_counts?.[0]?.counts || []
      );
    } catch (collectionError) {
      if (collectionError.httpStatus === 404) {
        console.log("📝 Collection doesn't exist, creating new one...");
        await createCollection();
        await new Promise((resolve) => setTimeout(resolve, 2000));
        collectionExists = true;
      } else {
        throw collectionError;
      }
    }

    if (!collectionExists) {
      throw new Error("Failed to create or verify collection");
    }

    const results = {};

    // Sync each content type (this will upsert, not replace)
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
        console.log(`\n🔄 Syncing ${contentType.name}...`);
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

    try {
      const finalCount = await typesense
        .collections(COLLECTION_NAME)
        .documents()
        .search({
          q: "*",
          query_by: "title",
          per_page: 0,
          facet_by: "entity,locale",
        });

      console.log(`📊 Total documents in search index: ${finalCount.found}`);
      console.log(
        "📊 By entity type:",
        finalCount.facet_counts?.[0]?.counts || []
      );

      // Check English blogs specifically
      const englishBlogs =
        finalCount.facet_counts?.[1]?.counts?.find((c) => c.value === "en")
          ?.count || 0;
      console.log(`📊 English content: ${englishBlogs} items`);

      // Double-check English blogs specifically
      const englishBlogCount = await typesense
        .collections(COLLECTION_NAME)
        .documents()
        .search({
          q: "*",
          query_by: "title",
          filter_by: "locale:=en && entity:=api::blog.blog",
          per_page: 0,
        });

      console.log(`📊 English blogs specifically: ${englishBlogCount.found}`);
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
async function updateCollectionSchema(ctx) {
  if (!ctx.state.user?.roles?.find((r) => r.code === "strapi-super-admin")) {
    return ctx.forbidden("Only admins can update schema");
  }

  try {
    const typesense = getClient();

    console.log("🔄 Attempting to update collection schema...");

    // Check current schema
    const currentCollection = await typesense
      .collections(COLLECTION_NAME)
      .retrieve();
    console.log(
      "📋 Current schema fields:",
      currentCollection.fields.map((f) => `${f.name}: ${f.type}`)
    );

    // For this specific error, we need to recreate the collection
    // because you can't change field types in Typesense
    console.log("⚠️ highlightImage type needs to change from object to string");
    console.log("🔄 Recreating collection...");

    await createCollection();

    return {
      success: true,
      message: "Collection schema updated successfully",
      newSchema: COLLECTION_SCHEMA.fields,
    };
  } catch (error) {
    console.error("❌ Schema update failed:", error);
    return ctx.badRequest("Schema update failed: " + error.message);
  }
}
async function syncAllContentClean() {
  console.log("🚀 Starting CLEAN full content sync (recreating collection)...");
  const startTime = Date.now();

  try {
    // This version DOES recreate the collection (for when you want a fresh start)
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
          facet_by: "entity,locale",
        });

      console.log(`📊 Total documents in search index: ${finalCount.found}`);
      console.log(
        "📊 By entity type:",
        finalCount.facet_counts?.[0]?.counts || []
      );

      // Check English blogs specifically
      const englishBlogCount = await typesense
        .collections(COLLECTION_NAME)
        .documents()
        .search({
          q: "*",
          query_by: "title",
          filter_by: "locale:=en && entity:=api::blog.blog",
          per_page: 0,
        });

      console.log(`📊 English blogs: ${englishBlogCount.found}`);
    } catch (verifyError) {
      console.error("❌ Error verifying sync:", verifyError);
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n🎉 Clean sync completed in ${duration} seconds`);
    console.log("📋 Results:", results);

    return results;
  } catch (error) {
    console.error("❌ Clean sync failed:", error);
    throw error;
  }
}

module.exports = {
  syncAllContent,
  syncAllContentClean,
  handleContentUpdate,
  handleContentDelete,
  syncContentType,
  createCollection,
  COLLECTION_NAME,
  COLLECTION_SCHEMA,
};
