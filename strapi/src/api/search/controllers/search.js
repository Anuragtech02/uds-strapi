"use strict";

const { syncAllContent } = require("../../../services/search-sync");
const { getClient } = require("../../../services/typesense");

module.exports = {
  // For manual admin syncing
  async syncAll(ctx) {
    if (ctx.state.user?.roles?.find((r) => r.code === "strapi-super-admin")) {
      try {
        await syncAllContent();
        return { success: true, message: "Content sync started successfully" };
      } catch (error) {
        return ctx.badRequest("Failed to sync content: " + error.message);
      }
    } else {
      return ctx.forbidden("Only admins can trigger a full sync");
    }
  },

  // Search API for frontend
  async search(ctx) {
    try {
      const { term, locale = "en", tab, page = 1, pageSize = 10 } = ctx.query;

      if (!term || term.length < 2) {
        return ctx.badRequest("Search term must be at least 2 characters");
      }

      const typesense = getClient();

      // Build filter based on query parameters
      let filterBy = `locale:=${locale}`;

      // If tab is specified, filter by entity type
      if (tab) {
        let entityType;
        switch (tab.toLowerCase()) {
          case "reports":
            entityType = "api::report.report";
            break;
          case "blogs":
            entityType = "api::blog.blog";
            break;
          case "news":
            entityType = "api::news-article.news-article";
            break;
        }

        if (entityType) {
          filterBy += ` && entity:=${entityType}`;
        }
      }

      // Search parameters
      const searchParams = {
        q: term,
        query_by: "title,shortDescription",
        filter_by: filterBy,
        per_page: parseInt(pageSize, 10),
        page: parseInt(page, 10),
        preset: "multilingual", // Optimized for multilingual search
        sort_by: "_text_match:desc",
      };

      // Execute search
      const searchResults = await typesense
        .collections("content")
        .documents()
        .search(searchParams);

      // Count items by entity type
      const counts = {
        all: searchResults.found,
        "api::report.report": 0,
        "api::blog.blog": 0,
        "api::news-article.news-article": 0,
      };

      // Format response to match your expected format
      const formattedResults = {
        data: searchResults.hits.map((hit) => {
          const doc = hit.document;

          // Update counts
          counts[doc.entity] = (counts[doc.entity] || 0) + 1;

          return {
            id: doc.id,
            title: doc.title,
            shortDescription: doc.shortDescription,
            slug: doc.slug,
            entity: doc.entity,
            locale: doc.locale,
            industries: doc.industries?.map((name) => ({ name })) || [],
          };
        }),
        meta: {
          pagination: {
            page: parseInt(page, 10),
            pageSize: parseInt(pageSize, 10),
            pageCount: Math.ceil(searchResults.found / parseInt(pageSize, 10)),
            total: searchResults.found,
            allCounts: counts,
          },
        },
      };

      return formattedResults;
    } catch (error) {
      console.error("Search error:", error);
      return ctx.badRequest("Search failed: " + error.message);
    }
  },
};
