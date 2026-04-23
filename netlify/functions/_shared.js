const fs = require("fs");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
const { jsonrepair } = require("jsonrepair");

// Using Claude Opus 4.7 — Anthropic's most capable model as of April 2026.
// For higher-volume or lower-latency use, swap to "claude-sonnet-4-6" or "claude-haiku-4-5-20251001".
const MODEL = "claude-opus-4-7";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function loadPrompt(filename) {
  const p = path.join(__dirname, "..", "..", "prompts", filename);
  return fs.readFileSync(p, "utf8");
}

function extractJson(text) {
  // Models occasionally wrap JSON in code fences despite instructions.
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  // Strip any leading preamble before the first '{'.
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("No JSON object found in model response");
  }
  const jsonStr = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(jsonStr);
  } catch (_) {
    // Model occasionally produces minor syntax errors (e.g. missing comma in array).
    // jsonrepair fixes the most common cases without altering the data.
    return JSON.parse(jsonrepair(jsonStr));
  }
}

async function callClaude({ system, userContent, maxTokens = 2048 }) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userContent }],
  });
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return extractJson(text);
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

function handlePreflight(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }
  return null;
}

module.exports = { loadPrompt, callClaude, jsonResponse, handlePreflight, extractJson };
