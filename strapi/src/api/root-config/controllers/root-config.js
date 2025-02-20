"use strict";

const constructNestedMenuStructure = (items = []) => {
  const itemMap = new Map();
  const rootItems = [];

  // Create all items first
  items.forEach((item) => {
    itemMap.set(item.id, {
      id: item.id,
      attributes: {
        order: item.order,
        title: item.title,
        url: item.url,
        target: item.target,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        children: [],
      },
    });
  });

  // Build the tree structure
  items.forEach((item) => {
    if (item.parent?.id) {
      const parentItem = itemMap.get(item.parent.id);
      if (parentItem) {
        parentItem.attributes.children.push(itemMap.get(item.id));
      }
    } else {
      rootItems.push(itemMap.get(item.id));
    }
  });

  // Sort by order
  const sortByOrder = (items) => {
    return items.sort(
      (a, b) => (a.attributes.order || 0) - (b.attributes.order || 0)
    );
  };

  return sortByOrder(rootItems);
};

module.exports = {
  async getRootConfig(ctx) {
    try {
      const populate = {
        header: {
          logo: {
            fields: ["url", "alternativeText", "formats"],
          },
          ctaButton: {
            populate: ["link"],
          },
        },
        footer: {
          footerCTA: {
            populate: {
              ctaButton: {
                populate: ["link"],
              },
            },
          },
          companyInfo: {
            populate: {
              logo: {
                fields: ["url", "alternativeText"],
              },
            },
          },
          industries: {
            fields: ["slug", "name"],
          },
        },
        industry: {
          fields: ["slug", "name"],
        },
      };

      const [
        headerData,
        footerData,
        industriesData,
        headerMainMenuData,
        footerQuickLinksData,
      ] = await Promise.all([
        strapi
          .service("api::header.header")
          .find({ populate: populate.header }),
        strapi
          .service("api::footer.footer")
          .find({ populate: populate.footer }),
        strapi
          .service("api::industry.industry")
          .find({ populate: populate.industry }),
        strapi
          .plugin("menus")
          .service("menu")
          .findOne(1, { populate: ["items", "items.parent"] }),
        strapi
          .plugin("menus")
          .service("menu")
          .findOne(2, { populate: ["items", "items.parent"] }),
      ]);

      const header = headerData;
      const footer = footerData;
      const industries = industriesData.results.map((industry) => industry);

      const headerMainMenu = {
        data: {
          id: headerMainMenuData.id,
          attributes: {
            title: headerMainMenuData.title,
            slug: headerMainMenuData.slug,
            createdAt: headerMainMenuData.createdAt,
            updatedAt: headerMainMenuData.updatedAt,
            items: {
              data: constructNestedMenuStructure(headerMainMenuData.items),
            },
          },
        },
        meta: {},
      };

      const footerQuickLinks = {
        data: {
          id: footerQuickLinksData.id,
          attributes: {
            title: footerQuickLinksData.title,
            slug: footerQuickLinksData.slug,
            createdAt: footerQuickLinksData.createdAt,
            updatedAt: footerQuickLinksData.updatedAt,
            items: {
              data: constructNestedMenuStructure(footerQuickLinksData.items),
            },
          },
        },
        meta: {},
      };

      const globalData = {
        header,
        footer,
        industries,
        headerMainMenu,
        footerQuickLinks,
      };

      ctx.send(globalData);
    } catch (err) {
      ctx.throw(500, err);
    }
  },
};
