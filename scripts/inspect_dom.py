import asyncio
import json
import websockets

async def inspect():
    uri = "ws://127.0.0.1:9222/devtools/page/E8E40D525E27969732F4218BF9761BCF"
    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({"id": 1, "method": "Runtime.enable"}))

        expr = """
        (() => {
            const els = Array.from(document.querySelectorAll('*')).filter(el => {
                const text = el.innerText || '';
                return text.includes('0%') || text.includes('Initialising') || text.includes('Processing');
            }).map(el => ({
                tag: el.tagName,
                id: el.id,
                className: el.className,
                text: el.innerText ? el.innerText.substring(0, 100) : ''
            }));

            return {
                matchingElements: els,
                sessionInfo: {
                    activeSessionId: typeof activeSessionId !== 'undefined' ? activeSessionId : null,
                    currentSessionId: typeof currentSessionId !== 'undefined' ? currentSessionId : null,
                    pipelineRunning: typeof pipelineRunning !== 'undefined' ? pipelineRunning : null,
                    isProcessing: typeof isProcessing !== 'undefined' ? isProcessing : null,
                    selectedFile: typeof selectedFile !== 'undefined' && selectedFile ? selectedFile.name : null,
                    lastUploadResult: typeof lastUploadResult !== 'undefined' ? lastUploadResult : null
                }
            };
        })()
        """
        await ws.send(json.dumps({
            "id": 2,
            "method": "Runtime.evaluate",
            "params": {"expression": expr, "returnByValue": True}
        }))

        while True:
            msg = await ws.recv()
            data = json.loads(msg)
            if data.get("id") == 2:
                print("DOM & VARS:", json.dumps(data.get("result", {}).get("result", {}).get("value"), indent=2))
                break

asyncio.run(inspect())
