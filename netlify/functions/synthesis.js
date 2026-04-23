const { loadPrompt, callClaude, jsonResponse, handlePreflight } = require("./_shared");

exports.handler = async (event) => {
  const pre = handlePreflight(event);
  if (pre) return pre;

  try {
    const { vignette, clinicianAnalysis, aiAnalysis } = JSON.parse(event.body || "{}");
    if (!vignette || !clinicianAnalysis || !aiAnalysis) {
      return jsonResponse(400, {
        error: "vignette, clinicianAnalysis and aiAnalysis required",
      });
    }

    const system = loadPrompt("02-synthesis.txt");
    const userContent = [
      `<case>\n${vignette}\n</case>`,
      `<clinician_analysis>\n${JSON.stringify(clinicianAnalysis, null, 2)}\n</clinician_analysis>`,
      `<ai_analysis>\n${JSON.stringify(aiAnalysis, null, 2)}\n</ai_analysis>`,
    ].join("\n\n");

    const result = await callClaude({ system, userContent, maxTokens: 2048 });
    return jsonResponse(200, { synthesis: result });
  } catch (err) {
    console.error("synthesis error:", err);
    return jsonResponse(500, { error: err.message || "Internal error" });
  }
};
