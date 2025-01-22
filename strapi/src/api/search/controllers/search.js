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
      const queries = indices.map((indexUid) => {
        let query = {
          indexUid,
          q,
          limit: parseInt(limit),
          offset: (parseInt(page) - 1) * parseInt(limit),
        };

        // Add filters for reports
        if (indexUid === "report") {
          const filters = [];

          if (industryFilters.length > 0) {
            filters.push(
              `industries.slug IN ["${industryFilters.join('","')}"]`
            );
          }

          if (geographyFilters.length > 0) {
            filters.push(
              `geographies.slug IN ["${geographyFilters.join('","')}"]`
            );
          }

          if (filters.length > 0) {
            query.filter = filters.join(" AND ");
          }

          // Add sorting
          if (sortBy !== "relevance") {
            query.sort = [
              sortBy === "date_desc" ? "publishedAt:desc" : "publishedAt:asc",
            ];
          }
        }

        // Add sort for blogs and news
        if (
          ["blog", "news-article"].includes(indexUid) &&
          sortBy !== "relevance"
        ) {
          query.sort = [
            sortBy === "date_desc" ? "publishedAt:desc" : "publishedAt:asc",
          ];
        }

        return query;
      });

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
        total: results.reduce(
          (sum, result) => sum + result.estimatedTotalHits,
          0
        ),
        page: parseInt(page),
        limit: parseInt(limit),
      };
    } catch (err) {
      console.error("Search error:", err);
      ctx.badRequest("Search error", { moreDetails: err.message });
    }
  },
};
