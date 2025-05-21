"use strict";

const Typesense = require("typesense");

let typesenseClient = null;

const typesense = new Typesense.Client({
  nodes: [
    {
      host: "typesense.inspectionapp.in",
      port: "443",
      protocol: "https",
      path: "", // Add this line - sometimes path prefixes are needed
    },
  ],
  apiKey: "your-api-key",
  connectionTimeoutSeconds: 10, // Increase timeout
  logger: {
    error: (message) => {
      console.error(`[Typesense Error]: ${message}`);
    },
  },
  retryIntervalSeconds: 2, // Add retry logic
});

// Add this debug function
const testTypesenseConnection = async () => {
  try {
    // Test a simple API call
    const health = await fetch("https://typesense.inspectionapp.in/health", {
      headers: {
        "X-TYPESENSE-API-KEY": "your-api-key",
      },
    });
    console.log("Health check status:", health.status);
    console.log("Health check body:", await health.text());

    // Try to list collections directly
    const collections = await fetch(
      "https://typesense.inspectionapp.in/collections",
      {
        headers: {
          "X-TYPESENSE-API-KEY": "your-api-key",
        },
      }
    );
    console.log("Collections status:", collections.status);
    console.log("Collections body:", await collections.text());
  } catch (error) {
    console.error("Connection test failed:", error);
  }
};

// Run the test
testTypesenseConnection();

function getClient() {
  if (!typesenseClient) {
    typesenseClient = typesense;
  }
  return typesenseClient;
}

module.exports = {
  getClient,
};
