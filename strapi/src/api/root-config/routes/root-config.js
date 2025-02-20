module.exports = {
  routes: [
    {
      method: "GET",
      path: "/root-config", // Choose a descriptive route name
      handler: "root-config.getRootConfig", // Controller function to call
      config: {
        policies: [], // Add authentication/authorization policies if needed
      },
    },
  ],
};
