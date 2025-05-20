module.exports = {
  search_filters: true,
  entities: [
    {
      name: "api::report.report",
      fields: ["title", "shortDescription"],
      title: "title",
    },
    {
      name: "api::blog.blog",
      fields: ["title", "shortDescription"],
      title: "title",
    },
    {
      name: "api::news-article.news-article",
      fields: ["title", "shortDescription"],
      title: "title",
    },
  ],
  map: {
    others: [
      "api::report.report",
      "api::blog.blog",
      "api::news-article.news-article",
    ],
    map_entity: [],
    final_count: {
      all: 0,
      "api::report.report": 0,
      "api::blog.blog": 0,
      "api::news-article.news-article": 0,
    },
  },
  default_populate: {
    slug: true,
    highlightImage: true,
    industries: {
      fields: ["name", "slug"],
    },
    geographies: {
      fields: ["name", "slug"],
    },
  },
  custom_populate: [],
  auto_complete: {
    search_by: "startswith",
  },
  sync_entities: [
    "api::report.report",
    "api::blog.blog",
    "api::news-article.news-article",
  ],
};
