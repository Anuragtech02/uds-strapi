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
  console.log("Formatting document for Typesense:", item);
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
    id: item.id,
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
    doc.industries = item.industries.map((industry) => industry.name);
  }
  console.log("Formatted document:", doc);

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
    // Define content types to process
    const contentTypes = [
      { model: "api::report.report", entity: "api::report.report" },
      { model: "api::blog.blog", entity: "api::blog.blog" },
      {
        model: "api::news-article.news-article",
        entity: "api::news-article.news-article",
      },
    ];

    let totalProcessed = 0;

    // Process each content type separately to avoid loading everything into memory
    for (const { model, entity } of contentTypes) {
      console.log(`Starting to process ${model}...`);

      // Get total count
      const totalCount = await strapi.db.query(model).count();
      console.log(`Total ${model} items: ${totalCount}`);

      // Process in small batches to avoid memory issues
      const BATCH_SIZE = 100;
      const LOCALE_BATCH_SIZE = 2; // Process 2 locales at a time to reduce memory pressure

      // Get available locales
      const locales = await strapi.plugin("i18n").service("locales").find();
      const localesCodes = locales.map((locale) => locale.code);

      // Process each locale batch
      for (
        let localeIndex = 0;
        localeIndex < localesCodes.length;
        localeIndex += LOCALE_BATCH_SIZE
      ) {
        const currentLocales = localesCodes.slice(
          localeIndex,
          localeIndex + LOCALE_BATCH_SIZE
        );
        console.log(`Processing locales: ${currentLocales.join(", ")}`);

        // Process in paginated batches
        for (let offset = 0; offset < totalCount; offset += BATCH_SIZE) {
          // Query only the current batch with specific locales
          const items = await strapi.db.query(model).findMany({
            populate: ["industries"],
            filters: {
              locale: {
                $in: currentLocales,
              },
            },
            limit: BATCH_SIZE,
            offset,
          });

          if (items.length === 0) continue;

          console.log(
            `Processing batch of ${items.length} ${model} items, offset ${offset}`
          );

          // Format and prepare documents
          const documents = items.map((item) => formatDocument(item, entity));

          console.log("Documents to be indexed done");

          // Index documents
          await typesense
            .collections(COLLECTION_NAME)
            .documents()
            .import(documents, { action: "upsert" });

          totalProcessed += items.length;

          console.log(
            `Indexed ${items.length} items from ${model}, total processed: ${totalProcessed}`
          );

          // Force garbage collection to free memory if available
          if (global.gc) {
            console.log("Running garbage collection");
            global.gc();
          }

          // Short delay to allow other operations
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }

    console.log(`Successfully synced ${totalProcessed} documents to Typesense`);
  } catch (error) {
    console.error("Error syncing content to Typesense:", error);
  }
};

// Single document sync for lifecycle hooks
const syncSingleItem = async (item, entityType) => {
  if (!item) return;

  const typesense = getClient();
  try {
    const document = formatDocument(item, entityType);

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

module.exports = {
  initializeTypesense,
  syncAllContent,
  syncSingleItem,
  deleteSingleItem,
};
