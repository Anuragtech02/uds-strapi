"use strict";

const { getClient } = require("./typesense");

const COLLECTION_NAME = "search_content_v2";

const initializeTypesense = async () => {
  const typesense = getClient();

  console.log("Initializing Typesense and creating collection...");

  try {
    // First, ALWAYS try to create the collection
    try {
      console.log("Creating collection search_content_v2...");
      const createResult = await typesense.collections().create({
        name: COLLECTION_NAME, // "search_content_v2"
        fields: [
          { name: "id", type: "string" },
          { name: "originalId", type: "string" },
          { name: "title", type: "string" },
          { name: "shortDescription", type: "string", optional: true },
          { name: "slug", type: "string" },
          { name: "entity", type: "string", facet: true },
          { name: "locale", type: "string", facet: true },
          { name: "industries", type: "string[]", facet: true, optional: true },
          {
            name: "geographies",
            type: "string[]",
            facet: true,
            optional: true,
          },
          { name: "highlightImage", type: "string", optional: true },
          { name: "oldPublishedAt", type: "int64", sort: true },
          { name: "createdAt", type: "int64", sort: true, optional: true },
        ],
        default_sorting_field: "oldPublishedAt",
        // Add explicit token separators to improve search
        token_separators: ["-", "_"],
        symbols_to_index: ["_"],
      });
      console.log("Collection created successfully:", createResult);
      return true;
    } catch (createError) {
      // If collection already exists, we'll get a 409 Conflict error, which is fine
      if (
        createError.httpStatus === 409 ||
        (createError.message && createError.message.includes("409"))
      ) {
        console.log("Collection already exists, continuing...");
        return true;
      } else {
        // If it's another error, log and re-throw
        console.error("Failed to create collection:", createError);
        throw createError;
      }
    }
  } catch (error) {
    console.error("Error initializing Typesense:", error);
    return false;
  }
};

const formatDocument = (item, entityType) => {
  // Convert date strings to timestamps for Typesense
  const oldPublishedAtTimestamp = item.oldPublishedAt
    ? new Date(item.oldPublishedAt).getTime()
    : item.publishedAt
    ? new Date(item.publishedAt).getTime()
    : item.published_at // Some might use snake_case
    ? new Date(item.published_at).getTime()
    : null;

  const createdAtTimestamp = item.createdAt
    ? new Date(item.createdAt).getTime()
    : item.created_at
    ? new Date(item.created_at).getTime()
    : new Date().getTime();

  // Format document for Typesense based on entity type
  // Create unique ID combining original ID with locale
  const uniqueId = `${item.id}_${item.locale || "en"}`;

  const doc = {
    id: uniqueId, // Use unique ID to prevent locale conflicts
    originalId: item.id.toString(), // Keep original ID for reference
    title: item.title || item.name || "",
    shortDescription: item.shortDescription || item.short_description || "",
    slug: item.slug || "",
    entity: entityType,
    locale: item.locale || "en",
    highlightImage:
      item.highlightImage?.url ||
      item.highlight_image?.url ||
      item.highlightImage ||
      "",
    oldPublishedAt: oldPublishedAtTimestamp,
    createdAt: createdAtTimestamp,
  };

  // Handle industries based on entity type
  if (entityType === "api::report.report") {
    // Reports have single industry relation
    if (item.industry) {
      const industryName =
        typeof item.industry === "string"
          ? item.industry
          : item.industry.name || item.industry.title || "";
      doc.industries = industryName ? [industryName] : [];
    } else {
      doc.industries = [];
    }
  } else {
    // Blogs and news have multiple industries
    if (item.industries && Array.isArray(item.industries)) {
      doc.industries = item.industries
        .map((industry) =>
          typeof industry === "string"
            ? industry
            : industry.name || industry.title || ""
        )
        .filter(Boolean);
    } else {
      doc.industries = [];
    }
  }

  // Add geographies if available (only for reports)
  if (item.geographies && Array.isArray(item.geographies)) {
    doc.geographies = item.geographies
      .map((geography) =>
        typeof geography === "string"
          ? geography
          : geography.name || geography.title || ""
      )
      .filter(Boolean);
  } else {
    // For content types without geographies, set empty array
    doc.geographies = [];
  }

  // Debug logging for blogs
  if (entityType === "api::blog.blog") {
    console.log(`🔍 Formatting blog ${item.id}:`, {
      originalTitle: item.title,
      locale: item.locale,
      industriesRaw: item.industries,
      industriesFormatted: doc.industries,
      hasHighlightImage: !!doc.highlightImage,
      oldPublishedAt: oldPublishedAtTimestamp
        ? new Date(oldPublishedAtTimestamp).toISOString()
        : null,
    });
  }

  return doc;
};

const syncAllContent = async () => {
  const typesense = getClient();

  try {
    // Initialize Typesense collection
    const initSuccess = await initializeTypesense();
    if (!initSuccess) {
      console.error("Failed to initialize Typesense, aborting sync");
      return;
    }

    // Define content types to process with their specific relations
    const contentTypes = [
      {
        model: "api::report.report",
        entity: "api::report.report",
        relations: ["industry", "geographies", "highlightImage"], // Reports have single industry
      },
      {
        model: "api::blog.blog",
        entity: "api::blog.blog",
        relations: ["industries", "highlightImage"], // Blogs have multiple industries
      },
      {
        model: "api::news-article.news-article",
        entity: "api::news-article.news-article",
        relations: ["industries", "highlightImage"], // News have multiple industries
      },
    ];

    // First, let's check what content we actually have
    console.log("\n=== CONTENT AUDIT ===");
    for (const { model } of contentTypes) {
      try {
        const count = await strapi.db.query(model).count();
        console.log(`${model}: ${count} items`);

        if (count > 0) {
          // Check locales breakdown
          const locales = await strapi.plugin("i18n").service("locales").find();
          for (const locale of locales) {
            const localeCount = await strapi.db.query(model).count({
              filters: { locale: locale.code },
            });
            if (localeCount > 0) {
              console.log(`  - ${locale.code}: ${localeCount} items`);
            }
          }
        }
      } catch (error) {
        console.log(`${model}: Error checking - ${error.message}`);
      }
    }
    console.log("=== END CONTENT AUDIT ===\n");

    let totalProcessed = 0;
    const BATCH_SIZE = 50;

    // Process each content type
    for (const { model, entity, relations } of contentTypes) {
      console.log(`\n=== Processing ${model} ===`);

      // Get total count
      const totalCount = await strapi.db.query(model).count();
      console.log(`Total ${model} items: ${totalCount}`);

      if (totalCount === 0) {
        console.log(`No ${model} items found, skipping...`);
        continue;
      }

      // Build populate object
      const populateObj = {};
      relations.forEach((relation) => {
        if (relation === "highlightImage") {
          populateObj[relation] = {
            select: ["url", "alternativeText"],
          };
        } else {
          populateObj[relation] = {
            select: ["name"],
          };
        }
      });

      let processedCount = 0;

      // Simple pagination - process all items regardless of locale
      for (let offset = 0; offset < totalCount; offset += BATCH_SIZE) {
        try {
          console.log(
            `Processing ${model} batch: ${offset + 1}-${Math.min(
              offset + BATCH_SIZE,
              totalCount
            )} of ${totalCount}`
          );

          const items = await strapi.db.query(model).findMany({
            populate: populateObj,
            limit: BATCH_SIZE,
            offset,
            orderBy: { id: "asc" }, // Ensure consistent ordering
          });

          if (items.length === 0) {
            console.log(
              `No more items found for ${model} at offset ${offset}, ending...`
            );
            break;
          }

          // Format and prepare documents
          const documents = [];
          const errors = [];

          items.forEach((item, index) => {
            try {
              const doc = formatDocument(item, entity);
              documents.push(doc);

              // Extra logging for blogs
              if (entity === "api::blog.blog" && index < 3) {
                console.log(`📝 Formatted blog ${index + 1}:`, {
                  id: doc.id,
                  originalId: doc.originalId,
                  title: doc.title.substring(0, 50) + "...",
                  locale: doc.locale,
                  industries: doc.industries,
                  hasHighlightImage: !!doc.highlightImage,
                });
              }
            } catch (formatError) {
              console.error(
                `❌ Error formatting document ${item.id}:`,
                formatError
              );
              errors.push({ id: item.id, error: formatError.message });
            }
          });

          if (errors.length > 0) {
            console.log(
              `⚠️ Formatting errors for ${model}:`,
              errors.slice(0, 5)
            ); // Show first 5 errors
          }

          if (documents.length === 0) {
            console.log(
              `No valid documents to index for this batch of ${model}`
            );
            continue;
          }

          // Index documents
          try {
            await typesense
              .collections(COLLECTION_NAME)
              .documents()
              .import(documents, { action: "upsert" });

            processedCount += documents.length;
            totalProcessed += documents.length;
            console.log(
              `✅ Indexed ${documents.length} ${model} documents (${processedCount}/${totalCount} total for this type)`
            );
          } catch (indexError) {
            console.error(
              `❌ Error indexing batch of ${model} documents:`,
              indexError
            );
          }

          // Small delay to prevent overwhelming the system
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.error(
            `Error processing batch for ${model} at offset ${offset}:`,
            error
          );
          continue;
        }
      }

      console.log(
        `=== Completed ${model}: ${processedCount} items processed ===`
      );
    }

    console.log(`\n=== SYNC COMPLETE ===`);
    console.log(`Successfully synced ${totalProcessed} documents to Typesense`);

    // Run immediate verification
    await verifySyncResults();

    // Get final stats
    try {
      const typesense = getClient();
      const stats = await typesense
        .collections(COLLECTION_NAME)
        .documents()
        .search({
          q: "*",
          per_page: 0,
          facet_by: "entity,locale",
        });

      console.log(`\nFinal Typesense Statistics:`);
      console.log(`Total documents: ${stats.found}`);
      if (stats.facet_counts) {
        stats.facet_counts.forEach((facet) => {
          console.log(`\n${facet.field_name}:`);
          facet.counts.forEach((count) => {
            console.log(`  ${count.value}: ${count.count} documents`);
          });
        });
      }
    } catch (statsError) {
      console.log("Could not fetch final stats:", statsError.message);
    }
  } catch (error) {
    console.error("Error syncing content to Typesense:", error);
    throw error;
  }
};

// Single document sync for lifecycle hooks
const syncSingleItem = async (item, entityType) => {
  if (!item) return;

  const typesense = getClient();
  try {
    // For single item sync, we need to populate relations separately if needed
    let populatedItem = item;

    // Determine which relations this entity type should have
    const entityRelations = getEntityRelations(entityType);

    // If the item doesn't have relations populated, fetch it
    const needsPopulation = entityRelations.some((relation) => !item[relation]);

    if (needsPopulation && item.id) {
      try {
        const populateObj = {};
        entityRelations.forEach((relation) => {
          populateObj[relation] = {
            select: ["name"],
          };
        });

        populatedItem = await strapi.db.query(entityType).findOne({
          where: { id: item.id },
          populate: populateObj,
        });
      } catch (populateError) {
        console.warn(
          `Could not populate relations for ${entityType} ${item.id}:`,
          populateError
        );
        // Continue with original item
      }
    }

    const document = formatDocument(populatedItem, entityType);

    // Upsert document (create or update)
    await typesense.collections(COLLECTION_NAME).documents().upsert(document);

    console.log(`Synced item ${entityType} - ${item.id} to Typesense`);
  } catch (error) {
    console.error(
      `Error syncing item ${entityType} - ${item.id} to Typesense:`,
      error
    );
  }
};

// Delete single document
const deleteSingleItem = async (item, entityType) => {
  if (!item || !item.id) return;

  const typesense = getClient();
  try {
    await typesense
      .collections(COLLECTION_NAME)
      .documents(String(item.id))
      .delete();

    console.log(`Deleted item ${entityType} - ${item.id} from Typesense`);
  } catch (error) {
    // Ignore 404 errors (document might not exist)
    if (error.httpStatus !== 404) {
      console.error(
        `Error deleting item ${entityType} - ${item.id} from Typesense:`,
        error
      );
    }
  }
};

// Helper function to get relations for each entity type
const getEntityRelations = (entityType) => {
  switch (entityType) {
    case "api::report.report":
      return ["industry", "geographies", "highlightImage"]; // Single industry for reports
    case "api::blog.blog":
    case "api::news-article.news-article":
      return ["industries", "highlightImage"]; // Multiple industries for blogs/news
    default:
      return ["industries", "highlightImage"]; // Default fallback
  }
};

// Post-sync verification function
const verifySyncResults = async () => {
  console.log(`\n=== POST-SYNC VERIFICATION ===`);

  try {
    const typesense = getClient();

    // Test 1: Count all documents by entity
    const allDocsSearch = await typesense
      .collections(COLLECTION_NAME)
      .documents()
      .search({
        q: "*",
        per_page: 0,
        facet_by: "entity,locale",
      });

    console.log(`📊 Total documents indexed: ${allDocsSearch.found}`);

    if (allDocsSearch.facet_counts) {
      allDocsSearch.facet_counts.forEach((facet) => {
        console.log(`\n${facet.field_name.toUpperCase()}:`);
        facet.counts.slice(0, 10).forEach((count) => {
          console.log(`  ${count.value}: ${count.count} documents`);
        });
      });
    }

    // Test 2: Specific blog verification
    const blogTest = await typesense
      .collections(COLLECTION_NAME)
      .documents()
      .search({
        q: "*",
        query_by: "title",
        filter_by: "entity:=api::blog.blog && locale:=en",
        per_page: 5,
      });

    console.log(`\n📝 BLOG VERIFICATION:`);
    console.log(`Found ${blogTest.found} blogs in English`);

    if (blogTest.hits.length > 0) {
      console.log(`Sample blogs:`);
      blogTest.hits.forEach((hit, index) => {
        console.log(
          `  ${index + 1}. "${hit.document.title}" (ID: ${
            hit.document.id
          }, originalId: ${hit.document.originalId})`
        );
      });
    } else {
      console.log(`❌ NO BLOGS FOUND - This indicates a problem!`);
    }

    // Test 3: Sample search that should include blogs
    const sampleSearch = await typesense
      .collections(COLLECTION_NAME)
      .documents()
      .search({
        q: "*",
        query_by: "title,shortDescription",
        filter_by: "locale:=en",
        per_page: 20,
        sort_by: "oldPublishedAt:desc",
      });

    const entityBreakdown = {};
    sampleSearch.hits.forEach((hit) => {
      const entity = hit.document.entity;
      entityBreakdown[entity] = (entityBreakdown[entity] || 0) + 1;
    });

    console.log(`\n🔍 SAMPLE SEARCH RESULTS (top 20 by date):`);
    Object.entries(entityBreakdown).forEach(([entity, count]) => {
      console.log(`  ${entity}: ${count} results`);
    });

    if (entityBreakdown["api::blog.blog"]) {
      console.log(`✅ Blogs appear in search results!`);
    } else {
      console.log(`❌ Blogs NOT appearing in search results!`);
    }
  } catch (error) {
    console.error(`❌ Verification failed:`, error);
  }

  console.log(`=== END VERIFICATION ===\n`);
};

module.exports = {
  initializeTypesense,
  syncAllContent,
  syncSingleItem,
  deleteSingleItem,
  getEntityRelations,
};
