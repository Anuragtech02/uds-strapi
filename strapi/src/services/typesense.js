"use strict";

const Typesense = require("typesense");

let typesenseClient = null;

const getClient = () => {
  if (typesenseClient) return typesenseClient;

  typesenseClient = new Typesense.Client({
    nodes: [
      {
        host: "typesense", // Docker service name
        port: "8108",
        protocol: "http",
      },
    ],
    apiKey: process.env.TYPESENSE_API_KEY || "some-strong-api-key",
    connectionTimeoutSeconds: 2,
  });

  return typesenseClient;
};

module.exports = {
  getClient,
};
