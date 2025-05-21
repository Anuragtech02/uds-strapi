"use strict";

const Typesense = require("typesense");

let typesenseClient = null;

const getClient = () => {
  if (typesenseClient) return typesenseClient;
  const HOST = process.env.TYPESENSE_HOST || "localhost";
  const PORT = process.env.TYPESENSE_PORT || "8108";

  typesenseClient = new Typesense.Client({
    nodes: [
      {
        host: HOST, // Docker service name
        port: 443,
        protocol: "https",
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
