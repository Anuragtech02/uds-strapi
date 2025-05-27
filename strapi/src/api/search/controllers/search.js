"use strict";
const {
  prepareDocumentWithMedia,
} = require("../../../services/document-helpers");
const {
  syncAllContent,
  syncContentType,
  createCollection,
  COLLECTION_NAME,
  syncAllContentClean,
} = require("../../../services/search-sync");
const { getClient } = require("../../../services/typesense");

module.exports = {
  // For manual admin syncing
  async syncAll(ctx) {
    // if (ctx.state.user?.roles?.find((r) => r.code === "strapi-super-admin")) {
    try {
      const result = await syncAllContent(); // Uses the FIXED version that preserves data
      return {
        success: true,
        message: "Content sync completed successfully",
        result,
      };
    } catch (error) {
      return ctx.badRequest("Failed to sync content: " + error.message);
    }
    // } else {
    //   return ctx.forbidden("Only admins can trigger a full sync");
    // }
  },

  async syncAllClean(ctx) {
    // if (ctx.state.user?.roles?.find((r) => r.code === "strapi-super-admin")) {
    try {
      const result = await syncAllContentClean(); // Clean version that recreates collection
      return {
        success: true,
        message: "Clean sync completed successfully",
        result,
      };
    } catch (error) {
      return ctx.badRequest("Failed to sync content: " + error.message);
    }
    // } else {
    //   return ctx.forbidden("Only admins can trigger a clean sync");
    // }
  },

  // Debug endpoint to troubleshoot search issues
  // Add this debug endpoint to your search controller temporarily
  // This will help us see what's actually in your Typesense collection

  // Add this debug endpoint to your search controller temporarily
  // This will help us see what's actually in your Typesense collection

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

      // Get more detailed blog analysis
      const blogAnalysis = {};

      // Check total blogs by locale
      try {
        const allBlogSearch = await typesense
          .collections("content")
          .documents()
          .search({
            q: "*",
            query_by: "title",
            filter_by: `entity:=api::blog.blog`,
            per_page: 0,
            facet_by: "locale",
          });

        blogAnalysis.totalBlogs = allBlogSearch.found;
        blogAnalysis.blogsByLocale =
          allBlogSearch.facet_counts?.[0]?.counts || [];
      } catch (error) {
        blogAnalysis.totalBlogsError = error.message;
      }

      // Check blogs in current locale with different search terms
      const blogSearchTests = [
        {
          name: "All blogs (en)",
          filter: `locale:=${locale} && entity:=api::blog.blog`,
          q: "*",
        },
        {
          name: "Blogs with 'india'",
          filter: `locale:=${locale} && entity:=api::blog.blog`,
          q: q,
        },
        {
          name: "Blogs with 'saudi'",
          filter: `locale:=${locale} && entity:=api::blog.blog`,
          q: "saudi",
        },
        {
          name: "Blogs with 'market'",
          filter: `locale:=${locale} && entity:=api::blog.blog`,
          q: "market",
        },
        {
          name: "All blogs (no locale filter)",
          filter: `entity:=api::blog.blog`,
          q: "*",
        },
      ];

      blogAnalysis.searchTests = {};

      for (const test of blogSearchTests) {
        try {
          const result = await typesense
            .collections("content")
            .documents()
            .search({
              q: test.q,
              query_by: "title,shortDescription",
              filter_by: test.filter,
              per_page: 10,
            });

          blogAnalysis.searchTests[test.name] = {
            found: result.found,
            returned: result.hits.length,
            samples: result.hits.slice(0, 3).map((hit) => ({
              id: hit.document.id,
              originalId: hit.document.originalId,
              title: hit.document.title?.substring(0, 60) + "...",
              locale: hit.document.locale,
              industries: hit.document.industries || [],
            })),
          };
        } catch (error) {
          blogAnalysis.searchTests[test.name] = { error: error.message };
        }
      }

      // Test the main search variations
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
      ];

      const results = {};

      for (const variation of searchVariations) {
        try {
          const searchResult = await typesense
            .collections("content")
            .documents()
            .search(variation.params);

          results[variation.name] = {
            found: searchResult.found,
            returned: searchResult.hits.length,
            entityBreakdown: {},
            samples: searchResult.hits.slice(0, 3).map((hit) => ({
              id: hit.document.id,
              originalId: hit.document.originalId,
              title: hit.document.title,
              entity: hit.document.entity,
              score: hit.text_match_info?.score || 0,
            })),
          };

          // Count by entity
          searchResult.hits.forEach((hit) => {
            const entity = hit.document.entity;
            results[variation.name].entityBreakdown[entity] =
              (results[variation.name].entityBreakdown[entity] || 0) + 1;
          });
        } catch (error) {
          results[variation.name] = { error: error.message };
        }
      }

      return {
        locale: locale,
        query: q,
        totalDocuments: allEntitiesSearch.found,
        entityCounts: allEntitiesSearch.facet_counts?.[0]?.counts || [],
        blogAnalysis: blogAnalysis,
        searchVariations: results,
      };
    } catch (error) {
      console.error("Debug search error:", error);
      return ctx.badRequest("Debug search failed: " + error.message);
    }
  },

  // Search API for frontend
  // Fixed search method with better error handling and debugging

  // Fixed search method with proper sorting
  async search(ctx) {
    try {
      const {
        q: rawTerm,
        locale = "en",
        tab,
        page = 1,
        pageSize = 10,
        sort = "oldPublishedAt:desc",
        industries,
        geographies,
      } = ctx.query;

      let term = rawTerm;
      if (term) {
        try {
          // URL form encoding uses + for spaces, so replace + with spaces first
          term = term.replace(/\+/g, " ");

          // Then decode any remaining URL-encoded characters (%20, etc.)
          term = decodeURIComponent(term);

          // Clean up extra spaces and normalize
          term = term.trim().replace(/\s+/g, " ");
        } catch (decodeError) {
          console.warn("Failed to decode search term:", rawTerm, decodeError);
          // Fallback: just replace + with spaces and clean
          term = rawTerm.replace(/\+/g, " ").trim().replace(/\s+/g, " ");
          console.log("🔍 Fallback processing result:", term);
        }
      }
      const minTermLength = 2;
      const isEmptySearch = !term || term.length < minTermLength;
      const typesense = getClient();

      // Determine the correct collection name
      let collectionName = "search_content_v2";

      // Verify collection exists, fallback if needed
      try {
        await typesense.collections(collectionName).retrieve();
      } catch (error) {
        console.log(
          `Collection ${collectionName} not found, trying fallback...`
        );
        collectionName = "content";
        try {
          await typesense.collections(collectionName).retrieve();
        } catch (fallbackError) {
          return ctx.badRequest("No valid search collection found");
        }
      }

      // Build filter with proper escaping and validation
      let filterBy = `locale:=${locale}`;

      // Tab-based entity filtering
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

      // Industries filter
      if (industries) {
        const industriesArray = industries.split(",").filter(Boolean);
        if (industriesArray.length > 0) {
          const industriesFilter = industriesArray
            .map((industry) => `industries:=${industry.trim()}`)
            .join(" || ");
          filterBy += ` && (${industriesFilter})`;
        }
      }

      // Geographies filter
      if (geographies) {
        const geographiesArray = geographies.split(",").filter(Boolean);
        if (geographiesArray.length > 0) {
          const geographiesFilter = geographiesArray
            .map((geography) => `geographies:=${geography.trim()}`)
            .join(" || ");
          filterBy += ` && (${geographiesFilter})`;
        }
      }

      // FIXED: Handle sort parameter with proper defaults
      let sortBy = "oldPublishedAt:desc"; // Always default to date desc

      if (sort) {
        switch (sort.toLowerCase()) {
          case "relevance":
            // For relevance, only use text match if there's actual search term
            if (!isEmptySearch) {
              sortBy = "_text_match:desc,oldPublishedAt:desc";
            } else {
              // For empty search, relevance = date desc
              sortBy = "oldPublishedAt:desc";
            }
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
            // Validate custom sort format
            if (sort.match(/^[a-zA-Z_]+:(asc|desc)$/)) {
              sortBy = sort;
            } else {
              // Invalid sort format, use default
              sortBy = "oldPublishedAt:desc";
            }
        }
      }

      // Build search parameters
      const searchParams = {
        q: isEmptySearch ? "*" : term,
        query_by: "title,shortDescription",
        filter_by: filterBy,
        per_page: Math.min(parseInt(pageSize, 10), 100),
        page: Math.max(parseInt(page, 10), 1),
        sort_by: sortBy, // This is the key fix
      };

      // Add additional parameters for better search experience
      if (!isEmptySearch) {
        searchParams.typo_tokens_threshold = 1;
        searchParams.drop_tokens_threshold = 1;
      }
      // Execute main search
      const searchResults = await typesense
        .collections(collectionName)
        .documents()
        .search(searchParams);

      searchResults.hits.slice(0, 3).forEach((hit, index) => {
        const doc = hit.document;
        let dateStr = "No date";
        if (doc.oldPublishedAt) {
          try {
            if (
              typeof doc.oldPublishedAt === "string" &&
              doc.oldPublishedAt.includes("T")
            ) {
              dateStr = doc.oldPublishedAt;
            } else {
              const timestamp = parseInt(doc.oldPublishedAt);
              if (!isNaN(timestamp)) {
                dateStr = new Date(timestamp).toISOString();
              }
            }
          } catch (dateError) {
            dateStr = `Invalid: ${doc.oldPublishedAt}`;
          }
        }
      });

      // Initialize counts
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

      // Get accurate counts for all entity types if no tab filter
      if (!tab) {
        const entityTypes = [
          { key: "api::report.report", tab: "reports" },
          { key: "api::blog.blog", tab: "blogs" },
          { key: "api::news-article.news-article", tab: "news" },
        ];

        for (const entityType of entityTypes) {
          try {
            const countParams = {
              q: isEmptySearch ? "*" : term,
              query_by: "title",
              filter_by: `locale:=${locale} && entity:=${entityType.key}`,
              per_page: 0,
            };

            // Add industries and geographies filters for accurate counts
            if (industries) {
              const industriesArray = industries.split(",").filter(Boolean);
              if (industriesArray.length > 0) {
                const industriesFilter = industriesArray
                  .map((industry) => `industries:=${industry.trim()}`)
                  .join(" || ");
                countParams.filter_by += ` && (${industriesFilter})`;
              }
            }

            if (geographies && entityType.key === "api::report.report") {
              const geographiesArray = geographies.split(",").filter(Boolean);
              if (geographiesArray.length > 0) {
                const geographiesFilter = geographiesArray
                  .map((geography) => `geographies:=${geography.trim()}`)
                  .join(" || ");
                countParams.filter_by += ` && (${geographiesFilter})`;
              }
            }

            const countResult = await typesense
              .collections(collectionName)
              .documents()
              .search(countParams);

            counts[entityType.key] = countResult.found;
          } catch (countError) {
            console.error(
              `Error getting count for ${entityType.key}:`,
              countError
            );
          }
        }
      }

      // Format response
      const formattedResults = {
        data: searchResults.hits.map((hit) => {
          const doc = hit.document;

          // FIXED: Handle date conversion properly
          let oldPublishedAt = null;
          if (doc.oldPublishedAt) {
            try {
              if (
                typeof doc.oldPublishedAt === "string" &&
                doc.oldPublishedAt.includes("T")
              ) {
                // Already ISO string
                oldPublishedAt = doc.oldPublishedAt;
              } else {
                // Convert timestamp to ISO string
                const timestamp = parseInt(doc.oldPublishedAt);
                if (!isNaN(timestamp)) {
                  oldPublishedAt = new Date(timestamp).toISOString();
                }
              }
            } catch (dateError) {
              console.warn(`Error parsing date for doc ${doc.id}:`, dateError);
            }
          }

          const baseResult = {
            id: doc.originalId || doc.id,
            title: doc.title,
            shortDescription: doc.shortDescription,
            slug: doc.slug,
            entity: doc.entity,
            locale: doc.locale,
            oldPublishedAt,
            industries: doc.industries?.map((name) => ({ name })) || [],
          };

          // Only add highlightImage for reports
          if (doc.entity === "api::report.report") {
            baseResult.highlightImage = doc.highlightImage || null;
            baseResult.geographies =
              doc.geographies?.map((name) => ({ name })) || [];
          }

          return baseResult;
        }),
        meta: {
          pagination: {
            page: parseInt(page, 10),
            pageSize: parseInt(pageSize, 10),
            pageCount: Math.ceil(searchResults.found / parseInt(pageSize, 10)),
            total: searchResults.found,
            allCounts: counts,
          },
          sorting: {
            appliedSort: sortBy,
            requestedSort: sort,
          },
        },
      };

      return formattedResults;
    } catch (error) {
      console.error("Search error:", error);
      return ctx.badRequest("Search failed: " + error.message);
    }
  },

  // Add this method to your search controller for database audit
  async databaseAudit(ctx) {
    try {
      const results = {};

      // Check each content type
      const contentTypes = [
        "api::report.report",
        "api::blog.blog",
        "api::news-article.news-article",
      ];

      for (const model of contentTypes) {
        try {
          console.log(`\n=== Auditing ${model} ===`);

          // Total count
          const totalCount = await strapi.db.query(model).count();
          results[model] = {
            total: totalCount,
            byLocale: {},
            sampleData: [],
          };

          console.log(`${model}: ${totalCount} total items`);

          if (totalCount > 0) {
            // Get locales breakdown
            const locales = await strapi
              .plugin("i18n")
              .service("locales")
              .find();

            for (const locale of locales) {
              const localeCount = await strapi.db.query(model).count({
                filters: { locale: locale.code },
              });

              if (localeCount > 0) {
                results[model].byLocale[locale.code] = localeCount;
                console.log(`  ${locale.code}: ${localeCount} items`);
              }
            }

            // Get sample data to see structure
            const sampleItems = await strapi.db.query(model).findMany({
              limit: 3,
              populate: {
                industry: { select: ["name"] },
                industries: { select: ["name"] },
                geographies: { select: ["name"] },
                highlightImage: { select: ["url"] },
              },
            });

            results[model].sampleData = sampleItems.map((item) => ({
              id: item.id,
              title: item.title,
              locale: item.locale,
              hasIndustry: !!item.industry,
              hasIndustries: !!(item.industries && item.industries.length > 0),
              industriesCount: item.industries ? item.industries.length : 0,
              hasGeographies: !!(
                item.geographies && item.geographies.length > 0
              ),
              hasHighlightImage: !!item.highlightImage,
              publishedAt: item.publishedAt,
              oldPublishedAt: item.oldPublishedAt,
            }));

            console.log(`Sample ${model} data:`, results[model].sampleData);
          }
        } catch (error) {
          console.error(`Error auditing ${model}:`, error);
          results[model] = { error: error.message };
        }
      }

      // Also check if there are unpublished items
      console.log("\n=== Checking publication status ===");
      for (const model of contentTypes) {
        try {
          const publishedCount = await strapi.db.query(model).count({
            filters: {
              $or: [
                { publishedAt: { $notNull: true } },
                { published_at: { $notNull: true } },
              ],
            },
          });

          const unpublishedCount = await strapi.db.query(model).count({
            filters: {
              $and: [
                { publishedAt: { $null: true } },
                { published_at: { $null: true } },
              ],
            },
          });

          results[model] = {
            ...results[model],
            published: publishedCount,
            unpublished: unpublishedCount,
          };

          console.log(
            `${model}: ${publishedCount} published, ${unpublishedCount} unpublished`
          );
        } catch (error) {
          console.log(
            `Could not check publication status for ${model}: ${error.message}`
          );
        }
      }

      return {
        timestamp: new Date().toISOString(),
        summary: {
          reports: results["api::report.report"],
          blogs: results["api::blog.blog"],
          news: results["api::news-article.news-article"],
        },
      };
    } catch (error) {
      console.error("Database audit error:", error);
      return ctx.badRequest("Database audit failed: " + error.message);
    }
  },
};
