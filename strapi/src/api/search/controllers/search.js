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
            id: doc.originalId || doc.id, // Use originalId for frontend compatibility
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
};
