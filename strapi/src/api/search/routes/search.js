module.exports = {
  routes: [
    {
      method: "GET",
      path: "/search",
      handler: "search.search",
      config: {
        policies: [],
        description: "Search content using Meilisearch",
        tag: {
          plugin: "search",
          name: "Search",
        },
      },
    },
  ],
};
