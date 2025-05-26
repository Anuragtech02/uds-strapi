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

  async search(ctx) {
    try {
      const {
        q: term,
        locale = "en",
        tab,
        page = 1,
        pageSize = 10,
        sort = "oldPublishedAt:desc",
        industries,
        geographies,
      } = ctx.query;

      const minTermLength = 2;
      const isEmptySearch = !term || term.length < minTermLength;
      const typesense = getClient();

      // Determine the correct collection name
      let collectionName = "search_content_v2"; // Your logs show this collection exists

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

      console.log(`🔍 Using collection: ${collectionName}`);

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

      // Handle sort parameter more robustly
      let sortBy = "oldPublishedAt:desc"; // Default
      if (sort) {
        switch (sort.toLowerCase()) {
          case "relevance":
            sortBy = isEmptySearch
              ? "oldPublishedAt:desc"
              : "_text_match:desc,oldPublishedAt:desc";
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
            if (sort.match(/^[a-zA-Z_]+:(asc|desc)$/)) {
              sortBy = sort;
            }
        }
      }

      // Build search parameters
      const searchParams = {
        q: isEmptySearch ? "*" : term,
        query_by: "title,shortDescription",
        filter_by: filterBy,
        per_page: Math.min(parseInt(pageSize, 10), 100), // Limit max page size
        page: Math.max(parseInt(page, 10), 1), // Ensure page is at least 1
        sort_by: sortBy,
      };

      // Add additional parameters for better search experience
      if (!isEmptySearch) {
        searchParams.typo_tokens_threshold = 1; // Allow some typos
        searchParams.drop_tokens_threshold = 1; // Allow dropping tokens for better results
      }

      console.log("🔍 Search params:", JSON.stringify(searchParams, null, 2));

      // Execute main search
      const searchResults = await typesense
        .collections(collectionName)
        .documents()
        .search(searchParams);

      console.log(
        `📊 Search results: ${searchResults.found} found, ${searchResults.hits.length} returned`
      );

      // Debug: Log entity breakdown in results
      const entityBreakdown = {};
      searchResults.hits.forEach((hit) => {
        const entity = hit.document.entity;
        entityBreakdown[entity] = (entityBreakdown[entity] || 0) + 1;
      });
      console.log("📊 Entity breakdown in results:", entityBreakdown);

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
              query_by: "title,shortDescription",
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

            console.log(`📊 ${entityType.tab} count: ${countResult.found}`);
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

          // Handle date conversion
          let oldPublishedAt = null;
          if (doc.oldPublishedAt) {
            try {
              if (
                typeof doc.oldPublishedAt === "string" &&
                doc.oldPublishedAt.includes("T")
              ) {
                oldPublishedAt = doc.oldPublishedAt;
              } else {
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
          // For blogs and news, no highlightImage or geographies

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
        },
      };

      // Debug log for blog-specific issues
      if (tab === "blogs" && formattedResults.data.length === 0) {
        console.log("🚨 BLOG DEBUG: No blogs returned");
        console.log("🚨 Filter used:", filterBy);
        console.log("🚨 Query used:", searchParams.q);

        // Try a simple blog test
        try {
          const simpleTest = await typesense
            .collections(collectionName)
            .documents()
            .search({
              q: "*",
              query_by: "title",
              filter_by: `entity:=api::blog.blog`,
              per_page: 5,
            });
          console.log("🚨 Simple blog test found:", simpleTest.found);
        } catch (testError) {
          console.log("🚨 Simple blog test failed:", testError.message);
        }
      }

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

  // Add this method to your search controller for cleanup
  // Add this method to your search controller for cleanup
  async cleanupCollection(ctx) {
    if (!ctx.state.user?.roles?.find((r) => r.code === "strapi-super-admin")) {
      return ctx.forbidden("Only admins can cleanup collection");
    }

    try {
      const { getClient } = require("../../../services/typesense");
      const typesense = getClient();

      console.log("🗑️ Deleting existing collection...");

      try {
        await typesense.collections("content").delete();
        console.log("✅ Old 'content' collection deleted");
      } catch (deleteError) {
        if (deleteError.httpStatus === 404) {
          console.log("ℹ️ Old 'content' collection doesn't exist");
        } else {
          console.log("⚠️ Error deleting old collection:", deleteError.message);
        }
      }

      try {
        await typesense.collections("search_content_v2").delete();
        console.log("✅ New 'search_content_v2' collection deleted");
      } catch (deleteError) {
        if (deleteError.httpStatus === 404) {
          console.log("ℹ️ New 'search_content_v2' collection doesn't exist");
        } else {
          console.log("⚠️ Error deleting new collection:", deleteError.message);
        }
      }

      // Wait a moment for cleanup
      await new Promise((resolve) => setTimeout(resolve, 1000));

      return {
        success: true,
        message: "Collection deleted successfully. You can now run sync again.",
      };
    } catch (error) {
      console.error("Error cleaning up collection:", error);
      return ctx.badRequest("Cleanup failed: " + error.message);
    }
  },
  // Add this method to test blog searches specifically
  // Add this method to test blog searches specifically
  async testBlogSearch(ctx) {
    try {
      const { locale = "en", q = "*" } = ctx.query;
      const typesense = getClient();

      console.log(`Testing blog search for query: "${q}" in locale: ${locale}`);

      // Test 1: Get all blogs
      const allBlogsTest = await typesense
        .collections("content")
        .documents()
        .search({
          q: "*",
          query_by: "title",
          filter_by: `entity:=api::blog.blog`,
          per_page: 20,
          facet_by: "locale",
        });

      // Test 2: Get blogs in specific locale
      const localeBlogsTest = await typesense
        .collections("content")
        .documents()
        .search({
          q: "*",
          query_by: "title",
          filter_by: `locale:=${locale} && entity:=api::blog.blog`,
          per_page: 20,
        });

      // Test 3: Search blogs with query
      const searchBlogsTest = await typesense
        .collections("content")
        .documents()
        .search({
          q: q === "*" ? "*" : q,
          query_by: "title,shortDescription",
          filter_by: `locale:=${locale} && entity:=api::blog.blog`,
          per_page: 20,
        });

      // Test 4: Use the same parameters as main search
      const mainSearchTest = await typesense
        .collections("content")
        .documents()
        .search({
          q: q === "*" ? "*" : q,
          query_by: "title,shortDescription",
          filter_by: `locale:=${locale}`,
          per_page: 50,
          sort_by: "oldPublishedAt:desc",
        });

      // Count blogs in main search
      let blogsInMainSearch = 0;
      const blogSamples = [];
      mainSearchTest.hits.forEach((hit) => {
        if (hit.document.entity === "api::blog.blog") {
          blogsInMainSearch++;
          if (blogSamples.length < 3) {
            blogSamples.push({
              id: hit.document.id,
              originalId: hit.document.originalId,
              title: hit.document.title,
              industries: hit.document.industries,
            });
          }
        }
      });

      return {
        locale,
        query: q,
        tests: {
          allBlogs: {
            found: allBlogsTest.found,
            localeBreakdown: allBlogsTest.facet_counts?.[0]?.counts || [],
            samples: allBlogsTest.hits.slice(0, 3).map((hit) => ({
              id: hit.document.id,
              originalId: hit.document.originalId,
              title: hit.document.title,
              locale: hit.document.locale,
            })),
          },
          blogsInLocale: {
            found: localeBlogsTest.found,
            samples: localeBlogsTest.hits.slice(0, 3).map((hit) => ({
              id: hit.document.id,
              originalId: hit.document.originalId,
              title: hit.document.title,
              locale: hit.document.locale,
            })),
          },
          blogSearch: {
            found: searchBlogsTest.found,
            samples: searchBlogsTest.hits.slice(0, 3).map((hit) => ({
              id: hit.document.id,
              originalId: hit.document.originalId,
              title: hit.document.title,
              locale: hit.document.locale,
            })),
          },
          mainSearch: {
            totalFound: mainSearchTest.found,
            blogsFound: blogsInMainSearch,
            blogSamples: blogSamples,
          },
        },
      };
    } catch (error) {
      console.error("Blog search test error:", error);
      return ctx.badRequest("Blog search test failed: " + error.message);
    }
  },
  // Add this method to debug locale issues
  async debugLocales(ctx) {
    try {
      const typesense = getClient();

      // Test 1: Get blog distribution by locale from Typesense
      const blogsByLocale = await typesense
        .collections("search_content_v2")
        .documents()
        .search({
          q: "*",
          query_by: "title",
          filter_by: "entity:=api::blog.blog",
          per_page: 0,
          facet_by: "locale",
        });

      // Test 2: Get sample blogs from each locale
      const localeTests = {};
      const topLocales =
        blogsByLocale.facet_counts?.[0]?.counts?.slice(0, 5) || [];

      for (const localeCount of topLocales) {
        const locale = localeCount.value;
        try {
          const sampleBlogs = await typesense
            .collections("search_content_v2")
            .documents()
            .search({
              q: "*",
              query_by: "title",
              filter_by: `entity:=api::blog.blog && locale:=${locale}`,
              per_page: 3,
            });

          localeTests[locale] = {
            count: localeCount.count,
            samples: sampleBlogs.hits.map((hit) => ({
              id: hit.document.id,
              originalId: hit.document.originalId,
              title: hit.document.title?.substring(0, 60) + "...",
              locale: hit.document.locale,
            })),
          };
        } catch (error) {
          localeTests[locale] = { error: error.message };
        }
      }

      // Test 3: Check database vs Typesense for blog locales
      console.log("Checking database blog locales...");
      const dbBlogLocales = {};

      try {
        // Get locale breakdown from database
        const locales = await strapi.plugin("i18n").service("locales").find();
        for (const locale of locales.slice(0, 5)) {
          // Check first 5 locales
          const count = await strapi.db.query("api::blog.blog").count({
            filters: { locale: locale.code },
          });
          if (count > 0) {
            dbBlogLocales[locale.code] = count;

            // Get sample from database
            const sampleBlog = await strapi.db.query("api::blog.blog").findOne({
              filters: { locale: locale.code },
              populate: {
                industries: { select: ["name"] },
                highlightImage: { select: ["url"] },
              },
            });

            if (sampleBlog) {
              dbBlogLocales[locale.code + "_sample"] = {
                id: sampleBlog.id,
                title: sampleBlog.title?.substring(0, 60) + "...",
                locale: sampleBlog.locale,
                hasIndustries: !!(
                  sampleBlog.industries && sampleBlog.industries.length > 0
                ),
              };
            }
          }
        }
      } catch (dbError) {
        console.error("Error checking database:", dbError);
      }

      return {
        typesenseBlogsByLocale: blogsByLocale.facet_counts?.[0]?.counts || [],
        samplesByLocale: localeTests,
        databaseBlogsByLocale: dbBlogLocales,
        totalBlogsInTypesense: blogsByLocale.found,
        analysis: {
          issue:
            blogsByLocale.facet_counts?.[0]?.counts?.find(
              (c) => c.value === "en"
            )?.count || 0,
          expected: "Should be around 323 blogs in English",
          actualEnglishBlogs:
            blogsByLocale.facet_counts?.[0]?.counts?.find(
              (c) => c.value === "en"
            )?.count || 0,
        },
      };
    } catch (error) {
      console.error("Locale debug error:", error);
      return ctx.badRequest("Locale debug failed: " + error.message);
    }
  },
  // Add this comprehensive debug method to your search controller

  async debugCollectionIssues(ctx) {
    try {
      const { locale = "en", q = "*" } = ctx.query;
      const typesense = getClient();

      console.log(
        `🔍 COMPREHENSIVE DEBUG for query: "${q}" in locale: ${locale}`
      );

      // Step 1: Check which collections exist
      const collections = await typesense.collections().retrieve();
      console.log(
        "📋 Available collections:",
        collections.map((c) => c.name)
      );

      // Step 2: Check the actual collection being used
      let targetCollectionName = "search_content_v2"; // Based on your logs
      let collectionExists = false;
      let collection = null;

      try {
        collection = await typesense
          .collections(targetCollectionName)
          .retrieve();
        collectionExists = true;
        console.log(
          `✅ Collection '${targetCollectionName}' exists with schema:`,
          collection.fields
        );
      } catch (error) {
        console.log(
          `❌ Collection '${targetCollectionName}' not found:`,
          error.message
        );

        // Try fallback collection name
        try {
          const fallbackName = "content";
          collection = await typesense.collections(fallbackName).retrieve();
          console.log(`✅ Found fallback collection '${fallbackName}'`);
          targetCollectionName = fallbackName;
          collectionExists = true;
        } catch (fallbackError) {
          console.log(`❌ Fallback collection 'content' also not found`);
        }
      }

      if (!collectionExists) {
        return ctx.badRequest("No valid collection found");
      }

      // Step 3: Check total documents and entity distribution
      const totalDocsSearch = await typesense
        .collections(targetCollectionName)
        .documents()
        .search({
          q: "*",
          query_by:
            collection.fields.filter(
              (f) => f.type === "string" && f.facet !== true
            )[0]?.name || "title",
          per_page: 0,
          facet_by: "entity",
        });

      console.log(`📊 Total documents: ${totalDocsSearch.found}`);
      console.log(
        `📊 Entity distribution:`,
        totalDocsSearch.facet_counts?.[0]?.counts || []
      );

      // Step 4: Specific blog analysis
      const blogTests = {};

      // Test 1: Direct blog search
      try {
        const directBlogSearch = await typesense
          .collections(targetCollectionName)
          .documents()
          .search({
            q: "*",
            query_by: "title",
            filter_by: `entity:=api::blog.blog`,
            per_page: 10,
          });

        blogTests.directBlogSearch = {
          found: directBlogSearch.found,
          samples: directBlogSearch.hits.slice(0, 3).map((hit) => ({
            id: hit.document.id,
            originalId: hit.document.originalId,
            title: hit.document.title,
            locale: hit.document.locale,
            entity: hit.document.entity,
          })),
        };
      } catch (error) {
        blogTests.directBlogSearch = { error: error.message };
      }

      // Test 2: Blog search with locale filter
      try {
        const blogLocaleSearch = await typesense
          .collections(targetCollectionName)
          .documents()
          .search({
            q: "*",
            query_by: "title",
            filter_by: `locale:=${locale} && entity:=api::blog.blog`,
            per_page: 10,
          });

        blogTests.blogLocaleSearch = {
          found: blogLocaleSearch.found,
          samples: blogLocaleSearch.hits.slice(0, 3).map((hit) => ({
            id: hit.document.id,
            originalId: hit.document.originalId,
            title: hit.document.title,
            locale: hit.document.locale,
            entity: hit.document.entity,
          })),
        };
      } catch (error) {
        blogTests.blogLocaleSearch = { error: error.message };
      }

      // Test 3: Replicate your main search exactly
      try {
        const mainSearchReplication = await typesense
          .collections(targetCollectionName)
          .documents()
          .search({
            q: q === "*" ? "*" : q,
            query_by: "title,shortDescription",
            filter_by: `locale:=${locale}`,
            per_page: 50,
            sort_by: "oldPublishedAt:desc",
          });

        // Count blogs in results
        let blogCount = 0;
        const blogSamples = [];
        const entityCounts = {};

        mainSearchReplication.hits.forEach((hit) => {
          const entity = hit.document.entity;
          entityCounts[entity] = (entityCounts[entity] || 0) + 1;

          if (entity === "api::blog.blog") {
            blogCount++;
            if (blogSamples.length < 3) {
              blogSamples.push({
                id: hit.document.id,
                originalId: hit.document.originalId,
                title: hit.document.title,
                locale: hit.document.locale,
                oldPublishedAt: hit.document.oldPublishedAt,
              });
            }
          }
        });

        blogTests.mainSearchReplication = {
          totalFound: mainSearchReplication.found,
          blogCount: blogCount,
          entityBreakdown: entityCounts,
          blogSamples: blogSamples,
        };
      } catch (error) {
        blogTests.mainSearchReplication = { error: error.message };
      }

      // Test 4: Check if blogs have the required fields
      try {
        const blogFieldCheck = await typesense
          .collections(targetCollectionName)
          .documents()
          .search({
            q: "*",
            query_by: "title",
            filter_by: `entity:=api::blog.blog`,
            per_page: 5,
          });

        blogTests.fieldAnalysis = blogFieldCheck.hits.map((hit) => {
          const doc = hit.document;
          return {
            id: doc.id,
            hasTitle: !!doc.title,
            hasShortDescription: !!doc.shortDescription,
            hasLocale: !!doc.locale,
            hasOldPublishedAt: !!doc.oldPublishedAt,
            oldPublishedAtType: typeof doc.oldPublishedAt,
            oldPublishedAtValue: doc.oldPublishedAt,
            allFields: Object.keys(doc),
          };
        });
      } catch (error) {
        blogTests.fieldAnalysis = { error: error.message };
      }

      // Test 5: Check sort field format
      try {
        const sortTest = await typesense
          .collections(targetCollectionName)
          .documents()
          .search({
            q: "*",
            query_by: "title",
            filter_by: `locale:=${locale} && entity:=api::blog.blog`,
            per_page: 5,
            sort_by: "oldPublishedAt:desc",
          });

        blogTests.sortTest = {
          found: sortTest.found,
          samples: sortTest.hits.map((hit) => ({
            id: hit.document.id,
            oldPublishedAt: hit.document.oldPublishedAt,
            title: hit.document.title,
          })),
        };
      } catch (error) {
        blogTests.sortTest = { error: error.message };
      }

      return {
        collectionName: targetCollectionName,
        collectionExists: collectionExists,
        totalDocuments: totalDocsSearch.found,
        entityDistribution: totalDocsSearch.facet_counts?.[0]?.counts || [],
        blogTests: blogTests,
        recommendations: [
          blogTests.directBlogSearch?.found === 0
            ? "❌ No blogs found - check indexing"
            : "✅ Blogs are indexed",
          blogTests.blogLocaleSearch?.found === 0
            ? "❌ No blogs in specified locale"
            : "✅ Blogs exist in locale",
          blogTests.mainSearchReplication?.blogCount === 0
            ? "❌ Blogs not appearing in main search - check sort/filter logic"
            : "✅ Blogs appear in main search",
        ],
      };
    } catch (error) {
      console.error("Comprehensive debug error:", error);
      return ctx.badRequest("Debug failed: " + error.message);
    }
  },

  // Also add this method to test the exact search parameters your frontend uses
  async testFrontendSearch(ctx) {
    try {
      const typesense = getClient();

      // Test the exact parameters that would come from your frontend
      const testCases = [
        {
          name: "Empty search with blogs tab",
          params: {
            q: "*",
            query_by: "title,shortDescription",
            filter_by: "locale:=en && entity:=api::blog.blog",
            per_page: 10,
            page: 1,
            sort_by: "oldPublishedAt:desc",
          },
        },
        {
          name: "Search 'india' with blogs tab",
          params: {
            q: "india",
            query_by: "title,shortDescription",
            filter_by: "locale:=en && entity:=api::blog.blog",
            per_page: 10,
            page: 1,
            sort_by: "_text_match:desc,oldPublishedAt:desc",
          },
        },
        {
          name: "Empty search all content",
          params: {
            q: "*",
            query_by: "title,shortDescription",
            filter_by: "locale:=en",
            per_page: 10,
            page: 1,
            sort_by: "oldPublishedAt:desc",
          },
        },
      ];

      const results = {};

      for (const testCase of testCases) {
        try {
          console.log(`🧪 Testing: ${testCase.name}`);
          console.log(`📋 Params:`, testCase.params);

          // Try with search_content_v2 first
          let searchResult;
          try {
            searchResult = await typesense
              .collections("search_content_v2")
              .documents()
              .search(testCase.params);
          } catch (error) {
            // Fallback to content collection
            searchResult = await typesense
              .collections("content")
              .documents()
              .search(testCase.params);
          }

          const entityCounts = {};
          searchResult.hits.forEach((hit) => {
            const entity = hit.document.entity;
            entityCounts[entity] = (entityCounts[entity] || 0) + 1;
          });

          results[testCase.name] = {
            totalFound: searchResult.found,
            returned: searchResult.hits.length,
            entityBreakdown: entityCounts,
            firstThreeResults: searchResult.hits.slice(0, 3).map((hit) => ({
              id: hit.document.id,
              title: hit.document.title?.substring(0, 60) + "...",
              entity: hit.document.entity,
              locale: hit.document.locale,
            })),
          };
        } catch (error) {
          results[testCase.name] = { error: error.message };
        }
      }

      return {
        timestamp: new Date().toISOString(),
        testResults: results,
      };
    } catch (error) {
      console.error("Frontend search test error:", error);
      return ctx.badRequest("Frontend search test failed: " + error.message);
    }
  },
  // COMPLETELY FIXED version - no locale filtering on relations

  async debugBlogSync(ctx) {
    try {
      console.log("🔍 DIAGNOSING BLOG SYNC ISSUE...");

      // 1. Check English blogs in database - NO POPULATE TO AVOID RELATION ISSUES
      console.log("\n📊 STEP 1: Database Analysis");

      const dbEnglishBlogs = await strapi.db.query("api::blog.blog").findMany({
        limit: 10,
        filters: {
          locale: "en",
          $or: [
            { publishedAt: { $notNull: true } },
            { published_at: { $notNull: true } },
          ],
        },
        // NO POPULATE - get relations separately
      });

      const totalEnglishBlogs = await strapi.db.query("api::blog.blog").count({
        filters: {
          locale: "en",
          $or: [
            { publishedAt: { $notNull: true } },
            { published_at: { $notNull: true } },
          ],
        },
      });

      console.log(
        `📈 Total published English blogs in DB: ${totalEnglishBlogs}`
      );
      console.log("📝 Sample English blogs from DB:");

      // Get relations separately for the first few blogs
      for (let i = 0; i < Math.min(dbEnglishBlogs.length, 5); i++) {
        const blog = dbEnglishBlogs[i];

        // Get industries separately (no locale filter)
        let industries = [];
        try {
          const blogWithIndustries = await strapi.db
            .query("api::blog.blog")
            .findOne({
              where: { id: blog.id },
              populate: { industries: true },
            });
          industries = blogWithIndustries?.industries || [];
        } catch (industryError) {
          console.log(`⚠️ Could not get industries for blog ${blog.id}`);
        }

        console.log(
          `  ${i + 1}. "${blog.title}" (ID: ${blog.id}, locale: ${blog.locale})`
        );
        console.log(
          `     Published: ${blog.publishedAt || blog.published_at || "N/A"}`
        );
        console.log(`     Industries: ${industries.length} items`);
        console.log(`     Has shortDescription: ${!!blog.shortDescription}`);
        console.log(`     Has slug: ${!!blog.slug}`);
      }

      // 2. Check what's in Typesense for English
      console.log("\n📊 STEP 2: Typesense Analysis");
      const typesense = getClient();

      const typesenseEnglishBlogs = await typesense
        .collections("search_content_v2")
        .documents()
        .search({
          q: "*",
          query_by: "title",
          filter_by: "locale:=en && entity:=api::blog.blog",
          per_page: 20,
        });

      console.log(
        `📈 English blogs in Typesense: ${typesenseEnglishBlogs.found}`
      );
      console.log("📝 Sample English blogs from Typesense:");
      typesenseEnglishBlogs.hits.forEach((hit, index) => {
        const doc = hit.document;
        console.log(
          `  ${index + 1}. "${doc.title}" (ID: ${doc.id}, originalId: ${
            doc.originalId
          })`
        );
        console.log(`     Locale: ${doc.locale}, Entity: ${doc.entity}`);
      });

      // 3. Check if specific blogs from DB exist in Typesense
      console.log("\n📊 STEP 3: Cross-Reference Check");
      const missingBlogs = [];

      for (const dbBlog of dbEnglishBlogs.slice(0, 5)) {
        const typesenseId = `${dbBlog.id}_${dbBlog.locale}`;

        try {
          const typesenseDoc = await typesense
            .collections("search_content_v2")
            .documents(typesenseId)
            .retrieve();

          console.log(
            `✅ Blog ${dbBlog.id} ("${dbBlog.title}") EXISTS in Typesense`
          );
        } catch (error) {
          if (error.httpStatus === 404) {
            console.log(
              `❌ Blog ${dbBlog.id} ("${dbBlog.title}") MISSING from Typesense`
            );
            missingBlogs.push(dbBlog);
          } else {
            console.log(`⚠️ Error checking blog ${dbBlog.id}:`, error.message);
          }
        }
      }

      // 4. Test document preparation for missing blogs
      if (missingBlogs.length > 0) {
        console.log("\n📊 STEP 4: Document Preparation Test");

        for (const missingBlog of missingBlogs.slice(0, 2)) {
          try {
            console.log(`\n🧪 Testing preparation for blog ${missingBlog.id}:`);

            // Get industries for this blog separately
            let industries = [];
            try {
              const blogWithIndustries = await strapi.db
                .query("api::blog.blog")
                .findOne({
                  where: { id: missingBlog.id },
                  populate: { industries: true },
                });
              industries = blogWithIndustries?.industries || [];
            } catch (industryError) {
              console.log(
                `⚠️ Could not get industries: ${industryError.message}`
              );
            }

            // Manual document preparation
            const doc = {
              id: `${missingBlog.id}_${missingBlog.locale}`,
              originalId: missingBlog.id.toString(),
              title: missingBlog.title || "",
              shortDescription:
                missingBlog.shortDescription || missingBlog.title || "",
              slug: missingBlog.slug || "",
              entity: "api::blog.blog",
              locale: missingBlog.locale || "en",
              highlightImage: null,
            };

            // Handle dates
            if (missingBlog.oldPublishedAt) {
              doc.oldPublishedAt = new Date(
                missingBlog.oldPublishedAt
              ).getTime();
            } else if (missingBlog.publishedAt) {
              doc.oldPublishedAt = new Date(missingBlog.publishedAt).getTime();
            } else if (missingBlog.published_at) {
              doc.oldPublishedAt = new Date(missingBlog.published_at).getTime();
            }

            if (missingBlog.createdAt) {
              doc.createdAt = new Date(missingBlog.createdAt).getTime();
            }

            // Handle industries (they're English-only)
            doc.industries = industries
              .map((industry) =>
                typeof industry === "string"
                  ? industry
                  : industry.name || "Unknown"
              )
              .filter(Boolean);

            // Blogs don't have geographies
            doc.geographies = [];

            console.log("📄 Prepared document:", JSON.stringify(doc, null, 2));

            // Try to index this specific blog
            console.log("🔧 Attempting to index this blog...");
            const indexResult = await typesense
              .collections("search_content_v2")
              .documents()
              .upsert(doc);

            console.log("✅ Successfully indexed:", indexResult);
          } catch (prepError) {
            console.log("❌ Error preparing/indexing blog:", prepError.message);
            console.log("📋 Full error:", prepError);
          }
        }
      }

      // 5. Check for common indexing issues
      console.log("\n📊 STEP 5: Common Issues Check");

      const blogsWithIssues = await strapi.db.query("api::blog.blog").findMany({
        limit: 20,
        filters: {
          locale: "en",
          $or: [
            { publishedAt: { $notNull: true } },
            { published_at: { $notNull: true } },
          ],
        },
      });

      const issueAnalysis = {
        missingTitle: 0,
        missingSlug: 0,
        missingShortDescription: 0,
        invalidDates: 0,
        total: blogsWithIssues.length,
      };

      blogsWithIssues.forEach((blog) => {
        if (!blog.title) issueAnalysis.missingTitle++;
        if (!blog.slug) issueAnalysis.missingSlug++;
        if (!blog.shortDescription) issueAnalysis.missingShortDescription++;

        const dateFields = ["oldPublishedAt", "publishedAt", "published_at"];
        const hasValidDate = dateFields.some((field) => {
          if (blog[field]) {
            try {
              new Date(blog[field]).getTime();
              return true;
            } catch {
              return false;
            }
          }
          return false;
        });

        if (!hasValidDate) issueAnalysis.invalidDates++;
      });

      console.log("🔍 Issue analysis for English blogs:", issueAnalysis);

      // 6. Check total blogs across all locales in Typesense
      console.log("\n📊 STEP 6: Total Blog Comparison");
      const allTypesenseBlogs = await typesense
        .collections("search_content_v2")
        .documents()
        .search({
          q: "*",
          query_by: "title",
          filter_by: "entity:=api::blog.blog",
          per_page: 0,
          facet_by: "locale",
        });

      console.log(
        `📈 Total blogs in Typesense (all locales): ${allTypesenseBlogs.found}`
      );

      const localeBreakdown = allTypesenseBlogs.facet_counts?.[0]?.counts || [];
      console.log("🌍 Locale breakdown:", localeBreakdown);

      // Find English count in breakdown
      const englishCount =
        localeBreakdown.find((item) => item.value === "en")?.count || 0;

      return {
        timestamp: new Date().toISOString(),
        summary: {
          databaseEnglishBlogs: totalEnglishBlogs,
          typesenseEnglishBlogs: typesenseEnglishBlogs.found,
          typesenseEnglishFromFacet: englishCount,
          typesenseTotalBlogs: allTypesenseBlogs.found,
          discrepancy: totalEnglishBlogs - typesenseEnglishBlogs.found,
          sampleMissingBlogs: missingBlogs.slice(0, 3).map((b) => ({
            id: b.id,
            title: b.title,
            publishedAt: b.publishedAt || b.published_at,
            hasShortDescription: !!b.shortDescription,
            hasSlug: !!b.slug,
          })),
          issueAnalysis: issueAnalysis,
          localeBreakdown: localeBreakdown,
        },
        recommendations: [
          totalEnglishBlogs > typesenseEnglishBlogs.found
            ? "❌ Major sync issue detected"
            : "✅ Sync appears normal",
          missingBlogs.length > 0
            ? "❌ Some blogs missing from search index"
            : "✅ Sample blogs found in index",
          issueAnalysis.missingShortDescription > 0
            ? "⚠️ Some blogs missing shortDescription"
            : "✅ All blogs have shortDescription",
          englishCount !== typesenseEnglishBlogs.found
            ? "⚠️ Inconsistent English blog counts"
            : "✅ Consistent counts",
        ],
      };
    } catch (error) {
      console.error("❌ Blog sync diagnostic failed:", error);
      return ctx.badRequest("Diagnostic failed: " + error.message);
    }
  },

  // Also fix the sync method to handle non-localized relations
  async syncEnglishBlogsOnly(ctx) {
    // if (!ctx.state.user?.roles?.find((r) => r.code === "strapi-super-admin")) {
    //   return ctx.forbidden("Only admins can sync blogs");
    // }

    try {
      console.log("🔄 Starting English blogs sync...");

      // Get all published English blogs WITHOUT populate first
      const englishBlogs = await strapi.db.query("api::blog.blog").findMany({
        filters: {
          locale: "en",
          $or: [
            { publishedAt: { $notNull: true } },
            { published_at: { $notNull: true } },
          ],
        },
      });

      console.log(`📊 Found ${englishBlogs.length} English blogs to sync`);

      if (englishBlogs.length === 0) {
        return { success: false, message: "No English blogs found to sync" };
      }

      const typesense = getClient();
      let synced = 0;
      let failed = 0;

      // Process in smaller batches to avoid relation query issues
      const batchSize = 10;
      for (let i = 0; i < englishBlogs.length; i += batchSize) {
        const batch = englishBlogs.slice(i, i + batchSize);
        const documents = [];

        for (const blog of batch) {
          try {
            // Get industries separately for each blog
            let industries = [];
            try {
              const blogWithIndustries = await strapi.db
                .query("api::blog.blog")
                .findOne({
                  where: { id: blog.id },
                  populate: { industries: true },
                });
              industries = blogWithIndustries?.industries || [];
            } catch (industryError) {
              console.log(`⚠️ Could not get industries for blog ${blog.id}`);
            }

            // Prepare document
            const doc = {
              id: `${blog.id}_${blog.locale}`,
              originalId: blog.id.toString(),
              title: blog.title || "",
              shortDescription: blog.shortDescription || blog.title || "",
              slug: blog.slug || "",
              entity: "api::blog.blog",
              locale: blog.locale || "en",
              highlightImage: blog.highlightImage || null,
            };

            // Handle dates
            if (blog.oldPublishedAt) {
              doc.oldPublishedAt = new Date(blog.oldPublishedAt).getTime();
            } else if (blog.publishedAt) {
              doc.oldPublishedAt = new Date(blog.publishedAt).getTime();
            } else if (blog.published_at) {
              doc.oldPublishedAt = new Date(blog.published_at).getTime();
            }

            if (blog.createdAt) {
              doc.createdAt = new Date(blog.createdAt).getTime();
            }

            // Handle industries (English-only)
            doc.industries = industries
              .map((industry) =>
                typeof industry === "string"
                  ? industry
                  : industry.name || "Unknown"
              )
              .filter(Boolean);

            doc.geographies = [];

            documents.push(doc);
          } catch (prepError) {
            console.error(`❌ Error preparing blog ${blog.id}:`, prepError);
            failed++;
          }
        }

        if (documents.length > 0) {
          try {
            const results = await typesense
              .collections("search_content_v2")
              .documents()
              .import(documents, { action: "upsert" });

            const batchSucceeded = results.filter((r) => r.success).length;
            const batchFailed = results.filter((r) => !r.success).length;

            synced += batchSucceeded;
            failed += batchFailed;

            console.log(
              `✅ Batch ${
                Math.floor(i / batchSize) + 1
              }: ${batchSucceeded} synced, ${batchFailed} failed`
            );

            if (batchFailed > 0) {
              console.log(
                "❌ Failed items:",
                results.filter((r) => !r.success).slice(0, 2)
              );
            }
          } catch (batchError) {
            console.error(`❌ Batch error:`, batchError);
            failed += documents.length;
          }
        }
      }

      // Verify result
      const finalCount = await typesense
        .collections("search_content_v2")
        .documents()
        .search({
          q: "*",
          query_by: "title",
          filter_by: "locale:=en && entity:=api::blog.blog",
          per_page: 0,
        });

      console.log(
        `🎉 Sync complete! ${finalCount.found} English blogs now in search index`
      );

      return {
        success: true,
        message: `Synced ${synced} blogs, ${failed} failed`,
        finalCount: finalCount.found,
        processed: englishBlogs.length,
      };
    } catch (error) {
      console.error("❌ English blog sync failed:", error);
      return ctx.badRequest("Sync failed: " + error.message);
    }
  },
  // Debug why blogs work separately but not in full sync

  async debugFullSyncVsSeparate(ctx) {
    try {
      console.log("🔍 DEBUGGING FULL SYNC VS SEPARATE SYNC...");

      // Step 1: Check current state
      console.log("\n📊 STEP 1: Current State Check");
      const typesense = getClient();

      const currentEnglishBlogs = await typesense
        .collections("search_content_v2")
        .documents()
        .search({
          q: "*",
          query_by: "title",
          filter_by: "locale:=en && entity:=api::blog.blog",
          per_page: 0,
        });

      console.log(
        `📈 Current English blogs in Typesense: ${currentEnglishBlogs.found}`
      );

      // Step 2: Test the individual sync process (same as separate sync)
      console.log("\n📊 STEP 2: Test Individual Blog Sync Process");

      try {
        // Simulate exactly what happens in the main sync for blogs
        console.log("🔄 Simulating main sync process for blogs...");

        // Get published blog IDs (same as main sync)
        const publishedBlogIds = await strapi.db
          .query("api::blog.blog")
          .findMany({
            select: ["id", "locale"],
            filters: {
              $or: [
                { publishedAt: { $notNull: true } },
                { published_at: { $notNull: true } },
              ],
            },
          });

        const englishBlogIds = publishedBlogIds.filter(
          (b) => b.locale === "en"
        );
        console.log(
          `📊 Found ${englishBlogIds.length} published English blogs in database`
        );
        console.log(
          `📊 Total published blogs (all locales): ${publishedBlogIds.length}`
        );

        if (englishBlogIds.length === 0) {
          return {
            issue: "No published English blogs found in database",
            totalBlogs: publishedBlogIds.length,
            englishBlogs: 0,
          };
        }

        // Test batch processing like main sync does
        const batchSize = 50;
        const testBatch = englishBlogIds.slice(
          0,
          Math.min(batchSize, englishBlogIds.length)
        );
        const testBatchIds = testBatch.map((b) => b.id);

        console.log(`🧪 Testing batch of ${testBatch.length} English blogs`);

        // Get full items by ID (same as main sync)
        const fullBlogs = await strapi.db.query("api::blog.blog").findMany({
          where: {
            id: { $in: testBatchIds },
          },
          populate: {
            industries: true,
          },
        });

        console.log(`📄 Retrieved ${fullBlogs.length} full blog records`);

        // Check if any are missing
        if (fullBlogs.length !== testBatch.length) {
          console.log(
            `⚠️ MISMATCH: Expected ${testBatch.length}, got ${fullBlogs.length}`
          );
          const retrievedIds = fullBlogs.map((b) => b.id);
          const missingIds = testBatchIds.filter(
            (id) => !retrievedIds.includes(id)
          );
          console.log(`❌ Missing blog IDs: ${missingIds}`);
        }

        // Test document preparation
        let preparedCount = 0;
        let preparedFailed = 0;
        const sampleDocs = [];

        for (const blog of fullBlogs.slice(0, 3)) {
          try {
            const doc = prepareDocumentWithMedia(blog, "api::blog.blog");
            preparedCount++;
            sampleDocs.push({
              id: doc.id,
              title: doc.title,
              entity: doc.entity,
              locale: doc.locale,
            });
            console.log(`✅ Prepared blog ${blog.id}: ${doc.title}`);
          } catch (prepError) {
            preparedFailed++;
            console.log(
              `❌ Failed to prepare blog ${blog.id}: ${prepError.message}`
            );
          }
        }

        console.log(
          `📊 Document preparation: ${preparedCount} succeeded, ${preparedFailed} failed`
        );

        return {
          success: true,
          currentEnglishBlogsInTypesense: currentEnglishBlogs.found,
          totalPublishedBlogs: publishedBlogIds.length,
          englishPublishedBlogs: englishBlogIds.length,
          testBatchSize: testBatch.length,
          retrievedFromDB: fullBlogs.length,
          preparedSuccessfully: preparedCount,
          preparationFailed: preparedFailed,
          samplePreparedDocs: sampleDocs,
          issues: [
            fullBlogs.length !== testBatch.length
              ? "❌ Some blogs not retrieved from DB"
              : "✅ All blogs retrieved",
            preparedFailed > 0
              ? "❌ Some document preparation failed"
              : "✅ Document preparation working",
            englishBlogIds.length === 0
              ? "❌ No English blogs to sync"
              : "✅ English blogs available",
          ],
        };
      } catch (processError) {
        console.error("❌ Process simulation failed:", processError);
        return {
          error: "Process simulation failed",
          message: processError.message,
          stack: processError.stack,
        };
      }
    } catch (error) {
      console.error("❌ Debug failed:", error);
      return ctx.badRequest("Debug failed: " + error.message);
    }
  },

  // Test running the main sync but only for blogs
  async testMainSyncBlogsOnly(ctx) {
    // if (!ctx.state.user?.roles?.find((r) => r.code === "strapi-super-admin")) {
    //   return ctx.forbidden("Only admins can test sync");
    // }

    try {
      console.log("🔄 Testing main sync process for blogs only...");

      // Use the EXACT same logic as the main sync but only for blogs
      const result = await syncContentType(
        "api::blog.blog",
        "api::blog.blog",
        50
      );

      // Check the result
      const typesense = getClient();
      const finalCount = await typesense
        .collections("search_content_v2")
        .documents()
        .search({
          q: "*",
          query_by: "title",
          filter_by: "locale:=en && entity:=api::blog.blog",
          per_page: 0,
        });

      return {
        success: true,
        syncResult: result,
        finalEnglishBlogCount: finalCount.found,
        message: `Sync completed: ${result.synced} synced, ${result.failed} failed. ${finalCount.found} English blogs now in index.`,
      };
    } catch (error) {
      console.error("❌ Main sync test failed:", error);
      return ctx.badRequest("Main sync test failed: " + error.message);
    }
  },
  async debugCollectionRecreation(ctx) {
    try {
      console.log("🔍 DEBUGGING COLLECTION RECREATION...");

      const typesense = getClient();

      // Check current collection
      console.log("\n📊 STEP 1: Current Collection State");
      try {
        const currentCollection = await typesense
          .collections("search_content_v2")
          .retrieve();
        console.log(
          `📋 Collection exists with ${currentCollection.num_documents} documents`
        );

        const currentCounts = await typesense
          .collections("search_content_v2")
          .documents()
          .search({
            q: "*",
            query_by: "title",
            per_page: 0,
            facet_by: "entity,locale",
          });

        console.log(`📊 Total documents: ${currentCounts.found}`);
        console.log(
          "📊 By entity:",
          currentCounts.facet_counts?.[0]?.counts || []
        );
        console.log(
          "📊 By locale:",
          currentCounts.facet_counts?.[1]?.counts || []
        );
      } catch (collectionError) {
        console.log("❌ Collection check failed:", collectionError.message);
      }

      // Check what the full sync does to the collection
      console.log("\n📊 STEP 2: Full Sync Collection Behavior");
      console.log(
        "💡 The full sync calls createCollection() which DELETES the existing collection!"
      );
      console.log(
        "💡 This means any separately synced blogs get deleted when full sync starts!"
      );

      return {
        issue: "COLLECTION RECREATION",
        explanation:
          "The full sync deletes and recreates the collection, removing any previously synced blogs",
        solution:
          "Either sync blogs as part of the full sync, or modify full sync to not recreate collection",
        recommendation:
          "Fix the blog sync within the main sync process rather than running separately",
      };
    } catch (error) {
      console.error("❌ Collection debug failed:", error);
      return ctx.badRequest("Collection debug failed: " + error.message);
    }
  },
  async syncAllContentWithoutRecreation() {
    console.log("🚀 Starting full content sync (preserving existing data)...");
    const startTime = Date.now();

    try {
      const typesense = getClient();

      // DON'T recreate collection - just verify it exists
      try {
        const existingCollection = await typesense
          .collections(COLLECTION_NAME)
          .retrieve();
        console.log(
          `✅ Using existing collection with ${existingCollection.num_documents} documents`
        );
      } catch (collectionError) {
        if (collectionError.httpStatus === 404) {
          console.log("📝 Collection doesn't exist, creating new one...");
          await createCollection();
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } else {
          throw collectionError;
        }
      }

      const results = {};

      // Sync each content type WITHOUT recreating collection
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
        console.log(
          "📊 By locale:",
          finalCount.facet_counts?.[1]?.counts || []
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
  },
  // Debug the exact difference between working separate sync vs failing main sync

  async debugSyncProcessComparison(ctx) {
    try {
      console.log("🔍 COMPARING WORKING VS NON-WORKING SYNC PROCESSES...");

      // Step 1: Test the separate sync method (working)
      console.log("\n📊 STEP 1: Testing Separate Sync Method (Working)");

      const separateSyncResult = await this.testSeparateSyncMethod();
      console.log("✅ Separate sync result:", separateSyncResult);

      // Step 2: Test the main sync method (not working)
      console.log("\n📊 STEP 2: Testing Main Sync Method (Not Working)");

      const mainSyncResult = await this.testMainSyncMethod();
      console.log("❌ Main sync result:", mainSyncResult);

      // Step 3: Compare the processes step by step
      console.log("\n📊 STEP 3: Step-by-Step Process Comparison");

      const comparison = await this.compareProcesses();

      return {
        separateSync: separateSyncResult,
        mainSync: mainSyncResult,
        comparison: comparison,
        recommendation: "Check the differences in the comparison section",
      };
    } catch (error) {
      console.error("❌ Debug failed:", error);
      return ctx.badRequest("Debug failed: " + error.message);
    }
  },

  // Test the separate sync method that works
  async testSeparateSyncMethod() {
    try {
      console.log("🔄 Testing separate sync method...");

      // This is the method that WORKS (from syncJustFewEnglishBlogs)
      const blogs = await strapi.db.query("api::blog.blog").findMany({
        filters: {
          locale: "en",
          $or: [
            { publishedAt: { $notNull: true } },
            { published_at: { $notNull: true } },
          ],
        },
        limit: 3, // Just test a few
      });

      console.log(
        `📊 Separate method: Found ${blogs.length} blogs with filters`
      );

      // Get full data
      const blogIds = blogs.map((b) => b.id);
      const fullBlogs = await strapi.db.query("api::blog.blog").findMany({
        where: {
          id: { $in: blogIds },
        },
        populate: {
          industries: true,
        },
      });

      console.log(
        `📊 Separate method: Retrieved ${fullBlogs.length} full blogs`
      );

      // Test document preparation
      const documents = [];
      for (const blog of fullBlogs) {
        const doc = prepareDocumentWithMedia(blog, "api::blog.blog");
        documents.push(doc);
      }

      console.log(`📊 Separate method: Prepared ${documents.length} documents`);

      return {
        method: "separate",
        foundWithFilters: blogs.length,
        retrievedFull: fullBlogs.length,
        preparedDocs: documents.length,
        sampleBlog: fullBlogs[0]
          ? {
              id: fullBlogs[0].id,
              title: fullBlogs[0].title,
              locale: fullBlogs[0].locale,
              publishedAt: fullBlogs[0].publishedAt,
              published_at: fullBlogs[0].published_at,
            }
          : null,
        success: true,
      };
    } catch (error) {
      console.error("❌ Separate sync test failed:", error);
      return {
        method: "separate",
        success: false,
        error: error.message,
      };
    }
  },

  // Test the main sync method that doesn't work
  async testMainSyncMethod() {
    try {
      console.log("🔄 Testing main sync method...");

      // This is the method that DOESN'T WORK (from syncContentType)

      // Step 1: Get published IDs (main sync method)
      const publishedItems = await strapi.db.query("api::blog.blog").findMany({
        select: ["id", "locale"],
        filters: {
          $or: [
            { publishedAt: { $notNull: true } },
            { published_at: { $notNull: true } },
          ],
        },
      });

      const englishItems = publishedItems.filter(
        (item) => item.locale === "en"
      );
      console.log(
        `📊 Main method: Found ${englishItems.length} English blogs from ${publishedItems.length} total`
      );

      // Step 2: Get by IDs (main sync method)
      const testBatch = englishItems.slice(0, 3);
      const batchIds = testBatch.map((item) => item.id);

      const items = await strapi.db.query("api::blog.blog").findMany({
        where: {
          id: { $in: batchIds },
        },
        populate: {
          industries: true,
        },
      });

      console.log(
        `📊 Main method: Retrieved ${items.length} full blogs from ${batchIds.length} IDs`
      );

      // Step 3: Document preparation (main sync method)
      const documents = [];
      for (const item of items) {
        const doc = prepareDocumentWithMedia(item, "api::blog.blog");
        documents.push(doc);
      }

      console.log(`📊 Main method: Prepared ${documents.length} documents`);

      return {
        method: "main",
        totalPublishedItems: publishedItems.length,
        englishPublishedItems: englishItems.length,
        testBatchSize: testBatch.length,
        retrievedFull: items.length,
        preparedDocs: documents.length,
        sampleBlog: items[0]
          ? {
              id: items[0].id,
              title: items[0].title,
              locale: items[0].locale,
              publishedAt: items[0].publishedAt,
              published_at: items[0].published_at,
            }
          : null,
        batchIds: batchIds,
        success: true,
      };
    } catch (error) {
      console.error("❌ Main sync test failed:", error);
      return {
        method: "main",
        success: false,
        error: error.message,
        stack: error.stack,
      };
    }
  },

  // Compare the processes to find differences
  async compareProcesses() {
    try {
      console.log("🔍 Comparing query methods...");

      // Method 1: Direct filters (separate sync way)
      const method1 = await strapi.db.query("api::blog.blog").findMany({
        select: ["id", "title", "locale", "publishedAt", "published_at"],
        filters: {
          locale: "en",
          $or: [
            { publishedAt: { $notNull: true } },
            { published_at: { $notNull: true } },
          ],
        },
        limit: 5,
      });

      console.log(`📊 Method 1 (direct filters): ${method1.length} results`);

      // Method 2: Two-step process (main sync way)
      const step1 = await strapi.db.query("api::blog.blog").findMany({
        select: ["id", "locale"],
        filters: {
          $or: [
            { publishedAt: { $notNull: true } },
            { published_at: { $notNull: true } },
          ],
        },
      });

      const englishIds = step1
        .filter((item) => item.locale === "en")
        .slice(0, 5)
        .map((item) => item.id);

      const step2 = await strapi.db.query("api::blog.blog").findMany({
        select: ["id", "title", "locale", "publishedAt", "published_at"],
        where: {
          id: { $in: englishIds },
        },
      });

      console.log(
        `📊 Method 2 (two-step): Step1=${step1.length}, English=${englishIds.length}, Step2=${step2.length}`
      );

      // Compare results
      const method1Ids = method1.map((b) => b.id).sort();
      const method2Ids = step2.map((b) => b.id).sort();

      const idsMatch =
        JSON.stringify(method1Ids) === JSON.stringify(method2Ids);

      console.log("📊 IDs match between methods:", idsMatch);
      if (!idsMatch) {
        console.log("❌ Method 1 IDs:", method1Ids);
        console.log("❌ Method 2 IDs:", method2Ids);
      }

      // Check if there are any locale issues
      const localeCheck = await strapi.db.query("api::blog.blog").findMany({
        select: ["id", "locale"],
        filters: {
          $or: [
            { publishedAt: { $notNull: true } },
            { published_at: { $notNull: true } },
          ],
        },
        limit: 20,
      });

      const localeDistribution = {};
      localeCheck.forEach((item) => {
        localeDistribution[item.locale] =
          (localeDistribution[item.locale] || 0) + 1;
      });

      console.log(
        "📊 Locale distribution in published blogs:",
        localeDistribution
      );

      return {
        method1Results: method1.length,
        method2Step1: step1.length,
        method2EnglishIds: englishIds.length,
        method2Step2: step2.length,
        idsMatch: idsMatch,
        localeDistribution: localeDistribution,
        issues: [
          method1.length === 0
            ? "❌ Method 1 finds no English blogs"
            : "✅ Method 1 finds English blogs",
          step2.length === 0
            ? "❌ Method 2 finds no English blogs"
            : "✅ Method 2 finds English blogs",
          !idsMatch
            ? "❌ Methods return different blogs"
            : "✅ Methods return same blogs",
          !localeDistribution.en
            ? "❌ No English blogs in published set"
            : `✅ ${localeDistribution.en} English blogs published`,
        ],
      };
    } catch (error) {
      console.error("❌ Process comparison failed:", error);
      return {
        error: error.message,
        success: false,
      };
    }
  },

  // Test the exact main sync logic with detailed logging
  async testMainSyncWithLogging(ctx) {
    // if (!ctx.state.user?.roles?.find((r) => r.code === "strapi-super-admin")) {
    //   return ctx.forbidden("Only admins can test sync");
    // }

    try {
      console.log("🔄 Testing main sync with detailed logging...");

      const typesense = getClient();
      const BATCH_SIZE = 5; // Small batch for testing

      // Step 1: Get published blog IDs
      console.log("\n📊 STEP 1: Getting published blog IDs");
      const publishedItems = await strapi.db.query("api::blog.blog").findMany({
        select: ["id", "locale"],
        filters: {
          $or: [
            { publishedAt: { $notNull: true } },
            { published_at: { $notNull: true } },
          ],
        },
      });

      const englishItems = publishedItems.filter(
        (item) => item.locale === "en"
      );
      console.log(
        `📊 Found ${englishItems.length} English blogs out of ${publishedItems.length} total`
      );

      if (englishItems.length === 0) {
        return {
          success: false,
          error: "No English blogs found in database",
          totalBlogs: publishedItems.length,
        };
      }

      // Step 2: Process first batch
      console.log("\n📊 STEP 2: Processing first batch");
      const batch = englishItems.slice(0, BATCH_SIZE);
      const batchIds = batch.map((item) => item.id);

      console.log(
        `📊 Processing batch of ${batch.length} blogs, IDs: ${batchIds}`
      );

      const items = await strapi.db.query("api::blog.blog").findMany({
        where: {
          id: { $in: batchIds },
        },
        populate: {
          industries: true,
        },
      });

      console.log(`📊 Retrieved ${items.length} full blog records`);

      if (items.length === 0) {
        return {
          success: false,
          error: "No blog records retrieved by ID",
          batchIds: batchIds,
        };
      }

      // Step 3: Document preparation
      console.log("\n📊 STEP 3: Document preparation");
      const documents = [];

      for (const item of items) {
        try {
          console.log(`📝 Preparing blog ${item.id}: "${item.title}"`);
          const doc = prepareDocumentWithMedia(item, "api::blog.blog");
          documents.push(doc);
          console.log(`✅ Prepared document: ${doc.id}`);
        } catch (prepError) {
          console.error(`❌ Error preparing blog ${item.id}:`, prepError);
          return {
            success: false,
            error: `Document preparation failed for blog ${item.id}: ${prepError.message}`,
            failedBlog: item.id,
          };
        }
      }

      console.log(`📊 Prepared ${documents.length} documents`);

      // Step 4: Index to Typesense
      console.log("\n📊 STEP 4: Indexing to Typesense");

      if (documents.length > 0) {
        try {
          const results = await typesense
            .collections("search_content_v2")
            .documents()
            .import(documents, { action: "upsert" });

          const succeeded = results.filter((r) => r.success);
          const failed = results.filter((r) => !r.success);

          console.log(
            `✅ Import results: ${succeeded.length} succeeded, ${failed.length} failed`
          );

          if (failed.length > 0) {
            console.log("❌ Failed imports:", failed);
            return {
              success: false,
              error: "Some documents failed to import",
              succeeded: succeeded.length,
              failed: failed.length,
              failedDocs: failed,
            };
          }

          // Step 5: Verify
          console.log("\n📊 STEP 5: Verification");
          const verifyResult = await typesense
            .collections("search_content_v2")
            .documents()
            .search({
              q: "*",
              query_by: "title",
              filter_by: "locale:=en && entity:=api::blog.blog",
              per_page: 10,
            });

          console.log(
            `🔍 Verification: ${verifyResult.found} English blogs in Typesense`
          );

          return {
            success: true,
            processed: batch.length,
            retrieved: items.length,
            prepared: documents.length,
            imported: succeeded.length,
            finalCount: verifyResult.found,
            message: "Main sync logic working correctly",
          };
        } catch (importError) {
          console.error("❌ Import failed:", importError);
          return {
            success: false,
            error: `Import failed: ${importError.message}`,
            documents: documents.length,
          };
        }
      }

      return {
        success: false,
        error: "No documents to import",
      };
    } catch (error) {
      console.error("❌ Main sync test failed:", error);
      return ctx.badRequest(`Main sync test failed: ${error.message}`);
    }
  },
};
