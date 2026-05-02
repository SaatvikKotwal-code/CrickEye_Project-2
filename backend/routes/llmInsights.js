const express = require("express");
const {
  generateLlmInsights,
  buildFallbackInsights,
} = require("../services/llmInsights");

const router = express.Router();

router.post("/", async (req, res) => {
  const results = req.body?.results;
  if (!results || typeof results !== "object") {
    return res.status(400).json({ error: "results payload is required" });
  }

  try {
    const insights = await generateLlmInsights(results);
    return res.json({ ok: true, llm_insights: insights });
  } catch (err) {
    const fallback = buildFallbackInsights(results, err?.message || "llm_error");
    return res.json({ ok: true, llm_insights: fallback, fallback_used: true });
  }
});

module.exports = router;

