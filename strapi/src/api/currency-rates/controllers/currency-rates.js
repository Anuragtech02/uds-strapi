module.exports = {
  getCurrencyRates: async (ctx) => {
    try {
      const { from = "USD" } = ctx.query;

      // If not cached, fetch from external API
      const response = await fetch(
        `https://free.ratesdb.com/v1/rates?from=${from}`
      );
      const data = await response.json();

      return data;
    } catch (error) {
      ctx.throw(500, "Failed to fetch exchange rates");
      console.log(error);
    }
  },
};
