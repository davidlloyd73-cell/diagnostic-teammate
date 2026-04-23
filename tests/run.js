// Minimal test harness — no external dependencies.
// Runs schema validation against mock responses, plus an optional live API test.

const path = require("path");
const fs = require("fs");

// Mimic the JSON extractor from the shared helper, without requiring the SDK.
function extractJson(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object found");
  return JSON.parse(cleaned.slice(start, end + 1));
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg || "Assertion failed");
};

// -------------- Schema validators (match the prompts) --------------

function validateIndependent(obj) {
  assert(Array.isArray(obj.differential), "differential must be array");
  assert(obj.differential.length === 5, `differential must have 5 entries, got ${obj.differential.length}`);
  obj.differential.forEach((d, i) => {
    assert(typeof d.rank === "number", `d[${i}].rank must be number`);
    assert(typeof d.diagnosis === "string" && d.diagnosis.length > 0, `d[${i}].diagnosis missing`);
    assert(Array.isArray(d.supporting_features), `d[${i}].supporting_features must be array`);
    assert(Array.isArray(d.opposing_features), `d[${i}].opposing_features must be array`);
    assert(["high", "moderate", "low"].includes(d.confidence), `d[${i}].confidence invalid: ${d.confidence}`);
  });
  assert(typeof obj.most_likely_diagnosis === "string" && obj.most_likely_diagnosis.length > 0, "most_likely_diagnosis missing");
  assert(Array.isArray(obj.next_steps) && obj.next_steps.length === 3, "next_steps must have 3 entries");
  obj.next_steps.forEach((n, i) => {
    assert(typeof n.step === "string", `next_step[${i}].step missing`);
    assert(typeof n.rationale === "string", `next_step[${i}].rationale missing`);
  });
}

function validateSynthesis(obj) {
  assert(Array.isArray(obj.diagnoses) && obj.diagnoses.length > 0, "diagnoses required");
  obj.diagnoses.forEach((d, i) => {
    assert(typeof d.diagnosis === "string", `diagnoses[${i}].diagnosis missing`);
    assert(["Clinician", "AI", "Both"].includes(d.origin), `diagnoses[${i}].origin invalid: ${d.origin}`);
    assert(typeof d.critique === "string" && d.critique.length > 0, `diagnoses[${i}].critique missing`);
    assert(["full", "partial", "conflict"].includes(d.agreement_strength), `diagnoses[${i}].agreement_strength invalid`);
  });
  assert(Array.isArray(obj.next_steps), "next_steps array required");
  obj.next_steps.forEach((n, i) => {
    assert(["Clinician", "AI", "Both"].includes(n.origin), `next_steps[${i}].origin invalid`);
  });
  assert(Array.isArray(obj.key_divergences), "key_divergences must be array");
  assert(Array.isArray(obj.suggested_discussion_points), "suggested_discussion_points must be array");
}

function validatePatient(obj) {
  assert(typeof obj.summary === "string" && obj.summary.length > 0, "summary required");
  assert(Array.isArray(obj.being_considered) && obj.being_considered.length > 0, "being_considered required");
  obj.being_considered.forEach((c, i) => {
    assert(typeof c.condition === "string", `being_considered[${i}].condition missing`);
    assert(typeof c.what_it_means === "string", `being_considered[${i}].what_it_means missing`);
    assert(
      ["most likely", "possible", "less likely", "being ruled out"].includes(c.how_likely),
      `being_considered[${i}].how_likely invalid: ${c.how_likely}`
    );
  });
  assert(Array.isArray(obj.what_happens_next), "what_happens_next required");
  assert(Array.isArray(obj.questions_you_might_ask), "questions_you_might_ask required");
}

// -------------- Mock fixtures --------------

const mockIndependent = {
  differential: [
    { rank: 1, diagnosis: "Polycythaemia vera", supporting_features: ["Elevated Hb", "Low EPO", "Splenomegaly", "Pruritus"], opposing_features: [], confidence: "high" },
    { rank: 2, diagnosis: "Secondary erythrocytosis (hypoxia)", supporting_features: ["Elevated Hb"], opposing_features: ["SaO2 98%", "Low EPO"], confidence: "low" },
    { rank: 3, diagnosis: "EPO-secreting tumour", supporting_features: ["Elevated Hb"], opposing_features: ["Low EPO rules out"], confidence: "low" },
    { rank: 4, diagnosis: "Chronic myeloid leukaemia", supporting_features: ["Leucocytosis", "Splenomegaly"], opposing_features: ["No basophilia noted"], confidence: "low" },
    { rank: 5, diagnosis: "Essential thrombocythaemia", supporting_features: ["Platelets 540"], opposing_features: ["Primary feature is erythrocytosis"], confidence: "low" },
  ],
  most_likely_diagnosis: "Polycythaemia vera",
  next_steps: [
    { rank: 1, step: "JAK2 V617F mutation testing", rationale: "Present in ~95% of PV; confirms diagnosis" },
    { rank: 2, step: "Serum erythropoietin confirmation and peripheral blood film", rationale: "Already low; film to exclude CML" },
    { rank: 3, step: "Bone marrow biopsy if JAK2 negative", rationale: "Histological confirmation and exon 12 testing" },
  ],
};

const mockSynthesis = {
  diagnoses: [
    { diagnosis: "Polycythaemia vera", origin: "Both", critique: "Both clinician and AI rank this first. Low EPO, splenomegaly, pruritus and elevated Hb fit cleanly.", agreement_strength: "full" },
    { diagnosis: "Lymphoma", origin: "Clinician", critique: "Not on the AI's list. Unusual to present this way without lymphadenopathy or B symptoms dominant. Worth a node exam but lower prior.", agreement_strength: "conflict" },
    { diagnosis: "Chronic myeloid leukaemia", origin: "AI", critique: "AI included it for the leucocytosis plus splenomegaly. Low prior without basophilia but the film will clarify quickly.", agreement_strength: "partial" },
  ],
  next_steps: [
    { step: "JAK2 V617F testing", origin: "Both", critique: "Core test; both agree." },
    { step: "Peripheral blood film", origin: "AI", critique: "Good idea — helps distinguish PV from CML at low cost." },
  ],
  key_divergences: ["Clinician suggested lymphoma; AI did not. Clinician's framing of pruritus as lymphoma-associated is reasonable but less fitting than PV."],
  suggested_discussion_points: [
    "If JAK2 is negative, what is your next step?",
    "Baseline haematocrit determines urgency of first venesection — when would you arrange this?",
  ],
};

const mockPatient = {
  summary: "The doctor and an AI assistant have both reviewed your blood results together. They agree the most likely explanation is a blood condition called polycythaemia vera.",
  being_considered: [
    { condition: "Polycythaemia vera", what_it_means: "A condition where your bone marrow makes too many red blood cells. It's usually slow-growing and manageable.", how_likely: "most likely" },
    { condition: "A related blood condition called chronic myeloid leukaemia", what_it_means: "Another bone marrow condition that can look similar on blood tests. A blood film will help tell them apart.", how_likely: "less likely" },
  ],
  what_happens_next: [
    { action: "A specific blood test called JAK2", why: "This test is positive in most people with polycythaemia vera and will confirm the diagnosis" },
    { action: "A closer look at your blood under a microscope", why: "This helps rule out similar conditions quickly" },
  ],
  questions_you_might_ask: [
    "Will I need regular treatment, and what does it involve?",
    "Are there symptoms I should watch for in the meantime?",
    "How urgent is this — should I be doing anything differently today?",
  ],
};

// -------------- Tests --------------

test("extractJson handles plain JSON", () => {
  const obj = extractJson('{"a": 1}');
  assert(obj.a === 1);
});

test("extractJson strips code fences", () => {
  const obj = extractJson('```json\n{"a": 2}\n```');
  assert(obj.a === 2);
});

test("extractJson strips preamble", () => {
  const obj = extractJson('Here is the result:\n{"a": 3}\n');
  assert(obj.a === 3);
});

test("extractJson throws on no JSON", () => {
  let threw = false;
  try { extractJson("no json here"); } catch (e) { threw = true; }
  assert(threw, "should throw");
});

test("validateIndependent accepts well-formed response", () => {
  validateIndependent(mockIndependent);
});

test("validateIndependent rejects wrong differential length", () => {
  const bad = JSON.parse(JSON.stringify(mockIndependent));
  bad.differential = bad.differential.slice(0, 3);
  let threw = false;
  try { validateIndependent(bad); } catch (e) { threw = true; }
  assert(threw, "should reject length != 5");
});

test("validateIndependent rejects bad confidence value", () => {
  const bad = JSON.parse(JSON.stringify(mockIndependent));
  bad.differential[0].confidence = "very high";
  let threw = false;
  try { validateIndependent(bad); } catch (e) { threw = true; }
  assert(threw, "should reject invalid confidence");
});

test("validateSynthesis accepts well-formed response", () => {
  validateSynthesis(mockSynthesis);
});

test("validateSynthesis rejects invalid origin", () => {
  const bad = JSON.parse(JSON.stringify(mockSynthesis));
  bad.diagnoses[0].origin = "Nurse";
  let threw = false;
  try { validateSynthesis(bad); } catch (e) { threw = true; }
  assert(threw, "should reject invalid origin");
});

test("validatePatient accepts well-formed response", () => {
  validatePatient(mockPatient);
});

test("validatePatient rejects invalid how_likely", () => {
  const bad = JSON.parse(JSON.stringify(mockPatient));
  bad.being_considered[0].how_likely = "maybe";
  let threw = false;
  try { validatePatient(bad); } catch (e) { threw = true; }
  assert(threw, "should reject invalid how_likely");
});

test("prompt files exist", () => {
  ["01-independent.txt", "02-synthesis.txt", "03-patient.txt"].forEach((f) => {
    const p = path.join(__dirname, "..", "prompts", f);
    assert(fs.existsSync(p), `${f} missing`);
    assert(fs.readFileSync(p, "utf8").length > 100, `${f} too short`);
  });
});

test("prompts do not contain sycophancy-inducing phrases", () => {
  // Smoke-check: original paper's prompt used 'warmly welcome', 'pause and ask' — our rewrite should avoid.
  const bad = ["warmly welcome", "pause and ask", "explicitly wait", "great point", "excellent thinking"];
  ["01-independent.txt", "02-synthesis.txt", "03-patient.txt"].forEach((f) => {
    const p = path.join(__dirname, "..", "prompts", f);
    const content = fs.readFileSync(p, "utf8").toLowerCase();
    bad.forEach((phrase) => {
      // Allow the synthesis prompt to *mention* these phrases when instructing the model to avoid them.
      if (f === "02-synthesis.txt" && (phrase === "great point" || phrase === "excellent thinking")) return;
      assert(!content.includes(phrase), `${f} contains "${phrase}"`);
    });
  });
});

// Optional live smoke test — only runs if RUN_LIVE=1 and ANTHROPIC_API_KEY set.
if (process.env.RUN_LIVE === "1" && process.env.ANTHROPIC_API_KEY) {
  test("LIVE: independent call returns schema-valid response", async () => {
    const Anthropic = require("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const systemPrompt = fs.readFileSync(path.join(__dirname, "..", "prompts", "01-independent.txt"), "utf8");
    const vignette = `63-year-old woman, fatigue, pruritus after hot showers, plethoric, mild splenomegaly. Hb 178, Hct 0.54, low EPO, urate elevated. SaO2 98%.`;
    const resp = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: `<case>\n${vignette}\n</case>` }],
    });
    const text = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    const obj = extractJson(text);
    validateIndependent(obj);
  });
}

// -------------- Runner --------------

(async () => {
  let passed = 0, failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  ✓ ${t.name}`);
      passed++;
    } catch (e) {
      console.log(`  ✗ ${t.name}`);
      console.log(`      ${e.message}`);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
