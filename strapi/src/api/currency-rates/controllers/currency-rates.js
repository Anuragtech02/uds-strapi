module.exports = {
  getCurrencyRates: async (ctx) => {
    try {
      const { from = "USD" } = ctx.query;

      // Try to get cached rates
      const cacheKey = `exchange_rates_${from}`;
      const cachedRates = await ctx.strapi.cache.get(cacheKey);

      if (cachedRates) {
        return cachedRates;
      }

      // If not cached, fetch from external API
      const response = await fetch(
        `https://free.ratesdb.com/v1/rates?from=${from}`
      );
      const data = await response.json();

      // Cache the results for 1 hour (3600 seconds)
      await ctx.strapi.cache.set(cacheKey, data, 3600);

      return data;
    } catch (error) {
      ctx.throw(500, "Failed to fetch exchange rates");
    }
  },
};
