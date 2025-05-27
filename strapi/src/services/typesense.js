"use strict";

const Typesense = require("typesense");

let typesenseClient = null;

const HOST = process.env.TYPESENSE_HOST || "typesense";
const PORT = process.env.TYPESENSE_PORT || 8108;
const PROTOCOL = process.env.TYPESENSE_PROTOCOL || "http";
const API_KEY = process.env.TYPESENSE_API_KEY;

const typesense = new Typesense.Client({
  nodes: [
    {
      host: HOST,
      port: PORT,
      protocol: PROTOCOL,
      path: "",
    },
  ],
  apiKey: API_KEY,
  connectionTimeoutSeconds: 10, // Increase timeout
  //   logger: {
  //     error: (message) => {
  //       console.error(`[Typesense Error]: ${message}`);
  //     },
  //   },
  logLevel: "debug",
  retryIntervalSeconds: 2, // Add retry logic
});

function getClient() {
  if (!typesenseClient) {
    typesenseClient = typesense;
  }
  return typesenseClient;
}

module.exports = {
  getClient,
};
