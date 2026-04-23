const { loadPrompt, callClaude, jsonResponse, handlePreflight } = require("./_shared");

exports.handler = async (event) => {
  const pre = handlePreflight(event);
  if (pre) return pre;

  try {
    const { vignette } = JSON.parse(event.body || "{}");
    if (!vignette || typeof vignette !== "string" || vignette.trim().length < 20) {
      return jsonResponse(400, { error: "vignette required (min 20 chars)" });
    }

    const system = loadPrompt("01-independent.txt");
    const result = await callClaude({
      system,
      userContent: `<case>\n${vignette}\n</case>`,
      maxTokens: 2048,
    });

    return jsonResponse(200, { analysis: result });
  } catch (err) {
    console.error("independent error:", err);
    return jsonResponse(500, { error: err.message || "Internal error" });
  }
};
