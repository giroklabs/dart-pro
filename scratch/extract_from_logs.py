import json

jsonl_path = "/Users/greego/.gemini/antigravity/brain/18c41f2e-ebb9-406c-8073-5877957351da/.system_generated/logs/transcript.jsonl"
with open(jsonl_path, "r", encoding="utf-8") as f:
    for line in f:
        try:
            data = json.loads(line)
            if data.get("step_index") in [7567, 7569]:
                print(f"=== STEP {data['step_index']} ===")
                for tc in data.get("tool_calls", []):
                    if tc.get("name") == "run_command":
                        cmd = tc["args"]["CommandLine"]
                        print(cmd)
                        print("-" * 40)
        except Exception as e:
            pass
