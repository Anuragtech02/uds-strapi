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

          // Handle oldPublishedAt conversion more safely
          let oldPublishedAt = null;
          if (doc.oldPublishedAt) {
            try {
              // Check if it's already a valid date string
              if (
                typeof doc.oldPublishedAt === "string" &&
                doc.oldPublishedAt.includes("T")
              ) {
                oldPublishedAt = doc.oldPublishedAt;
              } else {
                // Convert timestamp to ISO string
                const timestamp = parseInt(doc.oldPublishedAt);
                if (!isNaN(timestamp)) {
                  oldPublishedAt = new Date(timestamp).toISOString();
                }
              }
            } catch (dateError) {
              console.warn(
                `Error parsing oldPublishedAt for doc ${doc.id}:`,
                dateError
              );
            }
          }

          return {
            id: doc.originalId || doc.id,
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
      const targetCollectionName = "search_content_v2"; // Based on your logs
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
};
