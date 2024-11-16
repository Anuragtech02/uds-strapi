const { MeiliSearch } = require("meilisearch");

module.exports = {
  search: async (ctx) => {
    const { q } = ctx.query;

    const meilisearch = new MeiliSearch({
      host: process.env.MEILISEARCH_HOST,
      apiKey: process.env.MEILISEARCH_MASTER_KEY,
    });

    const indices = ["report", "blog", "news-article", "industry", "geography"];

    try {
      // Prepare the queries for multiSearch
      const queries = indices.map((indexUid) => {
        let query = {
          indexUid,
          q,
          limit: 10,
        };

        // Customize search parameters for each index
        switch (indexUid) {
          case "report":
            query.attributesToRetrieve = ["*"];
            break;
          case "blog":
            query.attributesToRetrieve = ["*"];
            break;
          case "news-article":
            query.attributesToRetrieve = ["*"];
            break;
          case "industry":
            query.attributesToSearchOn = ["name"];
            query.attributesToRetrieve = ["id", "name", "slug"];
            break;
          case "geography":
            query.attributesToSearchOn = ["name"];
            query.attributesToRetrieve = ["id", "name", "slug"];
            break;
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
      };
    } catch (err) {
      console.error("Search error:", err);
      ctx.badRequest("Search error", { moreDetails: err.message });
    }
  },
};
