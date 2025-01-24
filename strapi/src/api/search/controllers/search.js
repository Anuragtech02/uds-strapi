const { MeiliSearch } = require("meilisearch");

module.exports = {
  search: async (ctx) => {
    const {
      q,
      page = 1,
      limit = 10,
      industries,
      geographies,
      sortBy = "relevance",
    } = ctx.query;

    const meilisearch = new MeiliSearch({
      host: process.env.MEILISEARCH_HOST,
      apiKey: process.env.MEILISEARCH_MASTER_KEY,
    });

    const indices = ["report", "blog", "news-article"];

    try {
      // Parse filter arrays
      const industryFilters = industries
        ? industries.split(",").filter(Boolean)
        : [];
      const geographyFilters = geographies
        ? geographies.split(",").filter(Boolean)
        : [];

      // Prepare the queries for multiSearch
      const searchQuery = `"${q}"`; // Wrap the query in quotes for exact phrase matching
      const queries = indices.map((indexUid) => {
        let query = {
          indexUid,
          q: searchQuery,
          limit: parseInt(limit),
          offset: (parseInt(page) - 1) * parseInt(limit),
        };

        // Add filters for reports - using AND logic
        if (indexUid === "report") {
          const filters = [];

          // Create AND condition for industries
          if (industryFilters.length > 0) {
            const industriesFilter = industryFilters
              .map((slug) => `industries.slug = "${slug}"`)
              .join(" AND ");
            filters.push(`(${industriesFilter})`);
          }

          // Create AND condition for geographies
          if (geographyFilters.length > 0) {
            const geographiesFilter = geographyFilters
              .map((slug) => `geographies.slug = "${slug}"`)
              .join(" AND ");
            filters.push(`(${geographiesFilter})`);
          }

          // Combine all filters with AND
          if (filters.length > 0) {
            query.filter = filters.join(" AND ");
          }
        }
        if (sortBy && sortBy !== "relevance") {
          const direction = sortBy.includes(":desc") ? "desc" : "asc";
          query.sort = [
            `oldPublishedAt:${direction}`,
            `publishedAt:${direction}`,
          ];
        }

        return query;
      });

      console.log("Meilisearch query:", JSON.stringify(queries, null, 2));

      // Perform the multiSearch
      const { results } = await meilisearch.multiSearch({ queries });

      // Format the results
      const formattedResults = results.reduce((acc, result, index) => {
        acc[indices[index]] = result.hits;
        return acc;
      }, {});

      ctx.body = {
        query: q,
        results: formattedResults,
        totals: {
          report: results[0].estimatedTotalHits,
          "news-article": results[1].estimatedTotalHits,
          blog: results[2].estimatedTotalHits,
        },
        page: parseInt(page),
        limit: parseInt(limit),
      };
    } catch (err) {
      console.error("Search error:", err);
      ctx.badRequest("Search error", { moreDetails: err.message });
    }
  },
};
