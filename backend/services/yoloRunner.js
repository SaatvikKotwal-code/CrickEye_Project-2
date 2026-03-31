const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

async function downloadVideoToTemp(videoUrl) {
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Failed to download video: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "crickeye-"));
  const filePath = path.join(tempDir, "input-video.mp4");
  fs.writeFileSync(filePath, buffer);

  return { tempDir, filePath };
}

function runYoloPipeline(videoPath) {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const outputVideoPath = path.join(projectRoot, "assets", `analysed_out_${Date.now()}.mp4`);
  const runnerPath = path.join(__dirname, "yolo_runner.py");
  const pythonBin = process.env.PYTHON_BIN || "py";
  const pythonArgs = pythonBin.toLowerCase() === "py"
    ? ["-3", runnerPath, videoPath, outputVideoPath]
    : [runnerPath, videoPath, outputVideoPath];

  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, pythonArgs, {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`YOLO pipeline failed (${code}): ${stderr || stdout}`));
        return;
      }

      const resultLine = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.startsWith("__RESULT__"));

      if (!resultLine) {
        reject(new Error("Could not parse YOLO JSON output."));
        return;
      }

      try {
        const parsed = JSON.parse(resultLine.replace("__RESULT__", ""));
        resolve(parsed);
      } catch (error) {
        reject(new Error(`Invalid YOLO JSON output: ${error.message}`));
      }
    });
  });
}

function cleanupTempDir(tempDir) {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_error) {
    // No-op cleanup failure in dev flow.
  }
}

module.exports = {
  downloadVideoToTemp,
  runYoloPipeline,
  cleanupTempDir,
};
