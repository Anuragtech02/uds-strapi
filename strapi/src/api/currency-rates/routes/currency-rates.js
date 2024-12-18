module.exports = {
  routes: [
    {
      method: "GET",
      path: "/currency-rates",
      handler: "currency-rates.getCurrencyRates",
      config: {
        policies: [],
        auth: false,
      },
    },
  ],
};
