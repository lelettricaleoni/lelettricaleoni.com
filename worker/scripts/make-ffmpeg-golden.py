# worker/scripts/make-ffmpeg-golden.py
"""
Writes worker/fixtures/ffmpeg-args.golden.json from the Python worker's own ffmpeg_args().

    gh repo clone lelettricaleoni/videoStream-bucketWorker "$TEMP/old-worker"
    python worker/scripts/make-ffmpeg-golden.py "$TEMP/old-worker/jobs/transcode.py"

Only the constants and the function are executed (read out of the file with `ast`), so the Python worker's own
dependencies (bullmq, boto3) need not be installed.
"""
import ast
import json
import pathlib
import sys

source = pathlib.Path(sys.argv[1]).read_text()
wanted = {"RENDITIONS", "SEGMENT_SECONDS", "MASTER_MANIFEST"}
body = []
for node in ast.parse(source).body:
    if isinstance(node, ast.Assign) and any(getattr(t, "id", None) in wanted for t in node.targets):
        body.append(node)
    if isinstance(node, ast.FunctionDef) and node.name == "ffmpeg_args":
        body.append(node)

namespace: dict = {}
exec(compile(ast.Module(body=body, type_ignores=[]), "transcode", "exec"), namespace)
args = namespace["ffmpeg_args"]("/work/input.mp4", "/work/hls")

target = pathlib.Path(__file__).resolve().parent.parent / "fixtures" / "ffmpeg-args.golden.json"
target.write_text(json.dumps(args, indent=2) + "\n")
print(len(args), "arguments written to", target)
