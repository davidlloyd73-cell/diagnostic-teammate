const { loadPrompt, callClaude, jsonResponse, handlePreflight } = require("./_shared");

exports.handler = async (event) => {
  const pre = handlePreflight(event);
  if (pre) return pre;

  try {
    const { synthesis } = JSON.parse(event.body || "{}");
    if (!synthesis) {
      return jsonResponse(400, { error: "synthesis required" });
    }

    const system = loadPrompt("03-patient.txt");
    const userContent = `<synthesis>\n${JSON.stringify(synthesis, null, 2)}\n</synthesis>`;

    const result = await callClaude({ system, userContent, maxTokens: 1536 });
    return jsonResponse(200, { patient: result });
  } catch (err) {
    console.error("patient error:", err);
    return jsonResponse(500, { error: err.message || "Internal error" });
  }
};
