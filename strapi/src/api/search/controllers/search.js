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

  // Debug endpoint to troubleshoot search issues
  async debugSearch(ctx) {
    try {
      const { locale = "en", q = "india" } = ctx.query;
      const typesense = getClient();

      console.log(`Debug search for query: "${q}" in locale: ${locale}`);

      // First, let's see what entities exist in the collection
      const allEntitiesSearch = await typesense
        .collections("content")
        .documents()
        .search({
          q: "*",
          query_by: "title",
          filter_by: `locale:=${locale}`,
          per_page: 0,
          facet_by: "entity",
        });

      console.log("Entity facet counts:", allEntitiesSearch.facet_counts);

      // Test the actual search with different variations
      const searchVariations = [
        {
          name: "Exact search (India)",
          params: {
            q: q,
            query_by: "title,shortDescription",
            filter_by: `locale:=${locale}`,
            per_page: 50,
          },
        },
        {
          name: "Wildcard search (*india*)",
          params: {
            q: `*${q}*`,
            query_by: "title,shortDescription",
            filter_by: `locale:=${locale}`,
            per_page: 50,
          },
        },
        {
          name: "Prefix search (india*)",
          params: {
            q: `${q}*`,
            query_by: "title,shortDescription",
            filter_by: `locale:=${locale}`,
            per_page: 50,
          },
        },
        {
          name: "Case insensitive (INDIA)",
          params: {
            q: q.toUpperCase(),
            query_by: "title,shortDescription",
            filter_by: `locale:=${locale}`,
            per_page: 50,
          },
        },
      ];

      const results = {};

      for (const variation of searchVariations) {
        try {
          console.log(`Testing: ${variation.name}`);
          const searchResult = await typesense
            .collections("content")
            .documents()
            .search(variation.params);

          results[variation.name] = {
            found: searchResult.found,
            returned: searchResult.hits.length,
            samples: searchResult.hits.slice(0, 3).map((hit) => ({
              id: hit.document.id,
              title: hit.document.title,
              entity: hit.document.entity,
              score: hit.text_match_info?.score || 0,
            })),
          };

          console.log(
            `${variation.name}: Found ${searchResult.found}, returned ${searchResult.hits.length}`
          );
        } catch (error) {
          results[variation.name] = { error: error.message };
          console.error(`Error with ${variation.name}:`, error.message);
        }
      }

      // Also check entity counts for blogs specifically
      try {
        const blogSearch = await typesense
          .collections("content")
          .documents()
          .search({
            q: "*",
            query_by: "title",
            filter_by: `locale:=${locale} && entity:=api::blog.blog`,
            per_page: 10,
          });

        results.blogCheck = {
          found: blogSearch.found,
          samples: blogSearch.hits.slice(0, 5).map((hit) => ({
            id: hit.document.id,
            title: hit.document.title,
            entity: hit.document.entity,
          })),
        };
      } catch (error) {
        results.blogCheck = { error: error.message };
      }

      return {
        locale: locale,
        query: q,
        totalDocuments: allEntitiesSearch.found,
        entityCounts: allEntitiesSearch.facet_counts?.[0]?.counts || [],
        searchVariations: results,
      };
    } catch (error) {
      console.error("Debug search error:", error);
      return ctx.badRequest("Debug search failed: " + error.message);
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
        sort = "oldPublishedAt:desc",
        industries, // Add industries filter
        geographies, // Add geographies filter
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

      // Add industries filter if provided
      if (industries) {
        const industriesArray = industries.split(",").filter(Boolean);
        if (industriesArray.length > 0) {
          const industriesFilter = industriesArray
            .map((industry) => `industries:=${industry.trim()}`)
            .join(" || ");
          filterBy += ` && (${industriesFilter})`;
        }
      }

      // Add geographies filter if provided (only affects reports since blogs/news don't have geographies)
      if (geographies) {
        const geographiesArray = geographies.split(",").filter(Boolean);
        if (geographiesArray.length > 0) {
          const geographiesFilter = geographiesArray
            .map((geography) => `geographies:=${geography.trim()}`)
            .join(" || ");
          filterBy += ` && (${geographiesFilter})`;
        }
      }

      // Parse and validate sort parameter
      let sortBy = "oldPublishedAt:desc"; // Default
      if (sort) {
        // Handle different sort options from frontend
        switch (sort.toLowerCase()) {
          case "relevance":
            // For relevance, we'll handle this in the search params logic below
            sortBy = "oldPublishedAt:desc"; // Fallback for empty searches
            break;
          case "date_desc":
          case "oldpublishedat:desc":
            sortBy = "oldPublishedAt:desc";
            break;
          case "date_asc":
          case "oldpublishedat:asc":
            sortBy = "oldPublishedAt:asc";
            break;
          case "createdat:desc":
            sortBy = "createdAt:desc";
            break;
          case "createdat:asc":
            sortBy = "createdAt:asc";
            break;
          default:
            // If it's already in the correct format (field:direction), use it
            if (sort.match(/^[a-zA-Z_]+:(asc|desc)$/)) {
              sortBy = sort;
            } else {
              sortBy = "oldPublishedAt:desc"; // Fallback
            }
        }
      }

      // Search parameters
      const searchParams = {
        q: isEmptySearch ? "*" : term, // Use wildcard for empty searches
        query_by: "title,shortDescription",
        filter_by: filterBy,
        per_page: parseInt(pageSize, 10),
        page: parseInt(page, 10),
        sort_by: sortBy,
      };

      // If we're doing a real search (non-empty term), add text match sorting
      if (!isEmptySearch && sort === "relevance") {
        searchParams.sort_by = `_text_match:desc,${sortBy}`;
      }

      console.log("Typesense search params:", searchParams); // Debug log

      // Execute search
      const searchResults = await typesense
        .collections("content")
        .documents()
        .search(searchParams);

      console.log("Typesense search results:", {
        found: searchResults.found,
        hits: searchResults.hits.length,
        query: searchParams.q,
        filterBy: searchParams.filter_by,
      }); // Debug log

      // Count items by entity type for the current results
      const counts = {
        all: searchResults.found,
        "api::report.report": 0,
        "api::blog.blog": 0,
        "api::news-article.news-article": 0,
      };

      // Count entities in current results
      searchResults.hits.forEach((hit) => {
        const entity = hit.document.entity;
        if (counts.hasOwnProperty(entity)) {
          counts[entity]++;
        }
      });

      // If no tab filter is applied, get accurate counts for all entity types
      if (!tab) {
        try {
          // Get counts for each entity type separately
          const entityTypes = [
            { key: "api::report.report", tab: "reports" },
            { key: "api::blog.blog", tab: "blogs" },
            { key: "api::news-article.news-article", tab: "news" },
          ];

          for (const entityType of entityTypes) {
            const countParams = {
              q: isEmptySearch ? "*" : term,
              query_by: "title,shortDescription",
              filter_by: `locale:=${locale} && entity:=${entityType.key}`, // Use base filter without tab-specific filtering
              per_page: 0, // We only want the count
            };

            const countResult = await typesense
              .collections("content")
              .documents()
              .search(countParams);

            counts[entityType.key] = countResult.found;
          }
        } catch (countError) {
          console.error("Error getting entity counts:", countError);
          // Fall back to the counts from the main search
        }
      }

      // Format response to match your expected format
      const formattedResults = {
        data: searchResults.hits.map((hit) => {
          const doc = hit.document;

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
            highlightImage: doc.highlightImage,
            oldPublishedAt,
            industries: doc.industries?.map((name) => ({ name })) || [],
            geographies: doc.geographies?.map((name) => ({ name })) || [],
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
