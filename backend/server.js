const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config(); // fallback to root .env if present

const express = require("express");
const cors = require("cors");
const processSessionRouter = require("./routes/processSession");
const llmInsightsRouter = require("./routes/llmInsights");

const app = express();
const PORT = Number(process.env.PORT || 8080);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/process-session", processSessionRouter);
app.use("/llm-insights", llmInsightsRouter);

app.listen(PORT, () => {
  console.log(`[CrickEye API] Listening on http://localhost:${PORT}`);
});
