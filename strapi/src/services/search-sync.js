"use strict";

const { getClient } = require("./typesense");

const COLLECTION_NAME = "content";

const initializeTypesense = async () => {
  const typesense = getClient();

  try {
    // Check if collection exists
    await typesense.collections(COLLECTION_NAME).retrieve();
    console.log("Typesense collection already exists");
  } catch (error) {
    if (error.httpStatus === 404) {
      // Create collection
      await typesense.collections().create({
        name: COLLECTION_NAME,
        fields: [
          { name: "id", type: "int32" },
          { name: "title", type: "string" },
          { name: "shortDescription", type: "string", optional: true },
          { name: "slug", type: "string" },
          { name: "entity", type: "string", facet: true },
          { name: "locale", type: "string", facet: true },
          { name: "industries", type: "string[]", facet: true, optional: true },
        ],
        default_sorting_field: "id",
      });
      console.log("Created Typesense collection");
    } else {
      console.error("Error initializing Typesense:", error);
    }
  }
};

const formatDocument = (item, entityType) => {
  // Format document for Typesense based on entity type
  const doc = {
    id: item.id,
    title: item.title || item.name || "",
    shortDescription: item.shortDescription || "",
    slug: item.slug || "",
    entity: entityType,
    locale: item.locale || "en",
  };

  // Add industries if available
  if (item.industries && Array.isArray(item.industries)) {
    doc.industries = item.industries.map((industry) => industry.name);
  }

  return doc;
};

const syncAllContent = async () => {
  const typesense = getClient();

  try {
    // Get content from Strapi
    console.log("Starting full content sync to Typesense...");

    // Get reports
    const reports = await strapi.db.query("api::report.report").findMany({
      populate: ["industries"],
    });

    // Get blogs
    const blogs = await strapi.db.query("api::blog.blog").findMany({
      populate: ["industries"],
    });

    // Get news articles
    const newsArticles = await strapi.db
      .query("api::news-article.news-article")
      .findMany({
        populate: ["industries"],
      });

    // Format documents for Typesense
    const documents = [
      ...reports.map((item) => formatDocument(item, "api::report.report")),
      ...blogs.map((item) => formatDocument(item, "api::blog.blog")),
      ...newsArticles.map((item) =>
        formatDocument(item, "api::news-article.news-article")
      ),
    ];

    // Delete existing collection and recreate
    try {
      await typesense.collections(COLLECTION_NAME).delete();
      console.log("Deleted existing Typesense collection");
    } catch (error) {
      // Collection might not exist yet
    }

    // Create collection
    await initializeTypesense();

    // Import documents in batches
    const BATCH_SIZE = 100;
    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
      const batch = documents.slice(i, i + BATCH_SIZE);
      await typesense.collections(COLLECTION_NAME).documents().import(batch);
      console.log(
        `Indexed batch ${i / BATCH_SIZE + 1} (${batch.length} documents)`
      );
    }

    console.log(
      `Successfully synced ${documents.length} documents to Typesense`
    );
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
