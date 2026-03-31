const express = require("express");
const { supabaseAdmin, supabaseAnon } = require("../services/supabaseAdmin");
const {
  downloadVideoToTemp,
  runYoloPipeline,
  cleanupTempDir,
} = require("../services/yoloRunner");

const router = express.Router();

async function getCurrentUser(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;

  const { data, error } = await supabaseAnon.auth.getUser(token);
  if (error) return null;
  return data.user || null;
}

router.post("/", async (req, res) => {
  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { sessionId } = req.body || {};
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }

  const { data: session, error: fetchError } = await supabaseAdmin
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (fetchError || !session) {
    return res.status(404).json({ error: "Session not found" });
  }

  if (session.user_id !== currentUser.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  await supabaseAdmin
    .from("sessions")
    .update({ status: "processing" })
    .eq("id", sessionId);

  let tempDir = null;

  try {
    const download = await downloadVideoToTemp(session.video_url);
    tempDir = download.tempDir;

    const results = await runYoloPipeline(download.filePath);

    const { error: updateError } = await supabaseAdmin
      .from("sessions")
      .update({ status: "completed", results })
      .eq("id", sessionId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return res.json({ ok: true, sessionId, status: "completed" });
  } catch (error) {
    await supabaseAdmin
      .from("sessions")
      .update({ status: "failed" })
      .eq("id", sessionId);

    return res.status(500).json({
      error: "Processing failed",
      detail: error.message,
    });
  } finally {
    if (tempDir) cleanupTempDir(tempDir);
  }
});

module.exports = router;
