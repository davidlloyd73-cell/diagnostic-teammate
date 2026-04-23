const { loadPrompt, callClaude, jsonResponse, handlePreflight } = require("./_shared");

exports.handler = async (event) => {
  const pre = handlePreflight(event);
  if (pre) return pre;

  try {
    const { vignette, images: rawImages } = JSON.parse(event.body || "{}");

    const SUPPORTED = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const images = (Array.isArray(rawImages) ? rawImages : [])
      .slice(0, 5)
      .map((dataUrl) => {
        if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return null;
        const [header, data] = dataUrl.split(",");
        const mediaType = header.slice(5, header.indexOf(";"));
        if (!SUPPORTED.includes(mediaType) || !data) return null;
        return { mediaType, data };
      })
      .filter(Boolean);

    const hasVignette = vignette && typeof vignette === "string" && vignette.trim().length >= 20;
    if (!hasVignette && images.length === 0) {
      return jsonResponse(400, { error: "Please provide a case vignette (min 20 characters) or paste a screenshot." });
    }

    const system = loadPrompt("01-independent.txt");
    const result = await callClaude({
      system,
      userContent: `<case>\n${vignette || ""}\n</case>`,
      maxTokens: 2048,
      images,
    });

    return jsonResponse(200, { analysis: result });
  } catch (err) {
    console.error("independent error:", err);
    return jsonResponse(500, { error: err.message || "Internal error" });
  }
};
