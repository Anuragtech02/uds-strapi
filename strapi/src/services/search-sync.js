"use strict";

const { getClient } = require("./typesense");

const COLLECTION_NAME = "content";

const initializeTypesense = async () => {
  const typesense = getClient();

  console.log("Initializing Typesense and creating collection...");

  try {
    // First, ALWAYS try to create the collection
    try {
      console.log("Creating collection content...");
      const createResult = await typesense.collections().create({
        name: COLLECTION_NAME, // "content"
        fields: [
          { name: "id", type: "string" },
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
          { name: "oldPublishedAt", type: "int64", sort: true },
          { name: "createdAt", type: "int64", sort: true, optional: true },
        ],
        default_sorting_field: "oldPublishedAt",
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
    : null;

  const createdAtTimestamp = item.createdAt
    ? new Date(item.createdAt).getTime()
    : new Date().getTime();

  // Format document for Typesense based on entity type
  const doc = {
    id: item.id.toString(),
    title: item.title || item.name || "",
    shortDescription: item.shortDescription || "",
    slug: item.slug || "",
    entity: entityType,
    locale: item.locale || "en",
    oldPublishedAt: oldPublishedAtTimestamp,
    createdAt: createdAtTimestamp,
  };

  // Add industries if available
  if (item.industries && Array.isArray(item.industries)) {
    doc.industries = item.industries
      .map((industry) =>
        typeof industry === "string"
          ? industry
          : industry.name || industry.title || ""
      )
      .filter(Boolean);
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
        relations: ["industries", "geographies"],
      },
      {
        model: "api::blog.blog",
        entity: "api::blog.blog",
        relations: ["industries"],
      },
      {
        model: "api::news-article.news-article",
        entity: "api::news-article.news-article",
        relations: ["industries"],
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
        populateObj[relation] = {
          select: ["name"],
        };
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
          items.forEach((item) => {
            try {
              const doc = formatDocument(item, entity);
              documents.push(doc);
            } catch (formatError) {
              console.error(
                `Error formatting document ${item.id}:`,
                formatError
              );
            }
          });

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
      return ["industries", "geographies"];
    case "api::blog.blog":
    case "api::news-article.news-article":
      return ["industries"];
    default:
      return ["industries"]; // Default fallback
  }
};

module.exports = {
  initializeTypesense,
  syncAllContent,
  syncSingleItem,
  deleteSingleItem,
  getEntityRelations,
};
