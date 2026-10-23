#!/usr/bin/env node
// Personal read-only MCP server for the Film Finder GA4 property.
// Auth: Google Application Default Credentials. Set GOOGLE_APPLICATION_CREDENTIALS
// to a service-account key file that has Viewer access on the GA4 property.
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const DEFAULT_PROPERTY = process.env.GA4_PROPERTY_ID;
const client = new BetaAnalyticsDataClient();

const propertyPath = (id) => {
  const value = id ?? DEFAULT_PROPERTY;
  if (!value) throw new Error("No property_id given and GA4_PROPERTY_ID is not set");
  return `properties/${String(value).replace(/^properties\//, "")}`;
};

const asText = (data) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const asError = (err) => ({ isError: true, content: [{ type: "text", text: `GA4 error: ${err.message ?? err}` }] });

// Flatten the API's rows into [{dimension: value, metric: value}] objects.
function flatten(response) {
  const dims = (response.dimensionHeaders ?? []).map((h) => h.name);
  const mets = (response.metricHeaders ?? []).map((h) => h.name);
  const rows = (response.rows ?? []).map((row) => {
    const out = {};
    row.dimensionValues?.forEach((v, i) => (out[dims[i]] = v.value));
    row.metricValues?.forEach((v, i) => (out[mets[i]] = v.value));
    return out;
  });
  return { rowCount: response.rowCount, rows };
}

const filterSchema = z
  .object({
    field: z.string().describe("Dimension name to filter on, e.g. eventName or customEvent:film_title"),
    matchType: z.enum(["EXACT", "BEGINS_WITH", "ENDS_WITH", "CONTAINS", "FULL_REGEXP", "PARTIAL_REGEXP"]).default("EXACT"),
    value: z.string(),
  })
  .describe("Optional single dimension filter");

const toDimensionFilter = (f) =>
  f && {
    filter: { fieldName: f.field, stringFilter: { matchType: f.matchType, value: f.value } },
  };

const server = new McpServer({ name: "ga4", version: "1.0.0" });

server.tool(
  "run_report",
  "Run a GA4 report. Dates accept YYYY-MM-DD, today, yesterday, or NdaysAgo. Use get_metadata to discover valid dimension and metric names (including custom event parameters).",
  {
    dimensions: z.array(z.string()).default([]).describe("e.g. ['eventName'], ['date'], ['screenName']"),
    metrics: z.array(z.string()).min(1).describe("e.g. ['eventCount', 'activeUsers']"),
    start_date: z.string().default("28daysAgo"),
    end_date: z.string().default("yesterday"),
    dimension_filter: filterSchema.optional(),
    order_by_metric: z.string().optional().describe("Metric to sort by, descending"),
    limit: z.number().int().min(1).max(10000).default(100),
    property_id: z.string().optional().describe("Overrides GA4_PROPERTY_ID"),
  },
  async ({ dimensions, metrics, start_date, end_date, dimension_filter, order_by_metric, limit, property_id }) => {
    try {
      const [response] = await client.runReport({
        property: propertyPath(property_id),
        dimensions: dimensions.map((name) => ({ name })),
        metrics: metrics.map((name) => ({ name })),
        dateRanges: [{ startDate: start_date, endDate: end_date }],
        dimensionFilter: toDimensionFilter(dimension_filter),
        orderBys: order_by_metric ? [{ metric: { metricName: order_by_metric }, desc: true }] : undefined,
        limit,
      });
      return asText(flatten(response));
    } catch (err) {
      return asError(err);
    }
  },
);

server.tool(
  "run_realtime_report",
  "Run a GA4 realtime report (last 30 minutes). Supports a limited set of dimensions such as eventName, screenName (unifiedScreenName), country and platform.",
  {
    dimensions: z.array(z.string()).default([]),
    metrics: z.array(z.string()).min(1).describe("e.g. ['activeUsers', 'eventCount']"),
    limit: z.number().int().min(1).max(1000).default(50),
    property_id: z.string().optional(),
  },
  async ({ dimensions, metrics, limit, property_id }) => {
    try {
      const [response] = await client.runRealtimeReport({
        property: propertyPath(property_id),
        dimensions: dimensions.map((name) => ({ name })),
        metrics: metrics.map((name) => ({ name })),
        limit,
      });
      return asText(flatten(response));
    } catch (err) {
      return asError(err);
    }
  },
);

server.tool(
  "get_metadata",
  "List the dimensions and metrics available on the property, including custom ones (customEvent:*, customUser:*). Optionally filter by a substring.",
  {
    search: z.string().optional().describe("Case-insensitive substring match on API name or UI name"),
    property_id: z.string().optional(),
  },
  async ({ search, property_id }) => {
    try {
      const [meta] = await client.getMetadata({ name: `${propertyPath(property_id)}/metadata` });
      const match = (item) =>
        !search ||
        item.apiName.toLowerCase().includes(search.toLowerCase()) ||
        (item.uiName ?? "").toLowerCase().includes(search.toLowerCase());
      const shape = (item) => ({ apiName: item.apiName, uiName: item.uiName, custom: item.customDefinition });
      return asText({
        dimensions: meta.dimensions.filter(match).map(shape),
        metrics: meta.metrics.filter(match).map(shape),
      });
    } catch (err) {
      return asError(err);
    }
  },
);

await server.connect(new StdioServerTransport());
