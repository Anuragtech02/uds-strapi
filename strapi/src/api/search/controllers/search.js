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
      const {
        q: term,
        locale = "en",
        tab,
        page = 1,
        pageSize = 10,
        sort = "oldPublishedAt:desc", // Default sort by oldPublishedAt in descending order
      } = ctx.query;

      const minTermLength = 2;

      // For empty searches, we still want to return results but sort by date
      const isEmptySearch = !term || term.length < minTermLength;

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

      // Parse sort parameter (field:direction)
      let sortBy = "oldPublishedAt:desc"; // Default
      if (sort) {
        sortBy = sort;
      }

      // Search parameters
      const searchParams = {
        q: isEmptySearch ? "*" : term, // Use wildcard for empty searches
        query_by: "title,shortDescription",
        filter_by: filterBy,
        per_page: parseInt(pageSize, 10),
        page: parseInt(page, 10),
        sort_by: sortBy,
        preset: "multilingual",
      };

      // If we're doing a real search (non-empty term), add text match sorting
      if (!isEmptySearch) {
        searchParams.sort_by = `_text_match:desc,${sortBy}`;
      }

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

          // Format oldPublishedAt as ISO string if it exists
          const oldPublishedAt = doc.oldPublishedAt
            ? new Date(parseInt(doc.oldPublishedAt)).toISOString()
            : null;

          return {
            id: doc.id,
            title: doc.title,
            shortDescription: doc.shortDescription,
            slug: doc.slug,
            entity: doc.entity,
            locale: doc.locale,
            oldPublishedAt,
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
