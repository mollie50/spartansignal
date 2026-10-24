"""
SpartanSignal – Flask backend
Reads AWS credentials from the environment (AWS_ACCESS_KEY_ID,
AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN, AWS_DEFAULT_REGION).
Reads the Bedrock model from BEDROCK_MODEL_ID (required).
"""

import json
import os
import sys

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__, static_folder=".", static_url_path="")
CORS(app)

# ── Bedrock client (credentials come from the environment automatically) ──────
def get_bedrock_client():
    region = os.environ.get("AWS_DEFAULT_REGION", "us-east-1")
    return boto3.client("bedrock-runtime", region_name=region)


# ── Prompt builder ─────────────────────────────────────────────────────────────
def build_prompt(notes: str, language: str) -> str:
    return f"""You are an emergency communications assistant for San José State University (SJSU).
Your job is to turn raw incident notes into a clear, calm, factual campus alert.

STRICT RULES:
- Do NOT invent, assume, or extrapolate any facts not present in the notes.
- Do NOT speculate about causes or outcomes unless they are stated in the notes.
- Use calm, clear language appropriate for students and staff.
- If information is missing or uncertain, flag it explicitly.

INCIDENT NOTES:
{notes}

Respond ONLY with a valid JSON object — no markdown fences, no explanation outside the JSON.
Use exactly these four keys:

{{
  "summary": "<One or two sentence factual summary of the incident>",
  "action_steps": ["<Step 1>", "<Step 2>", "..."],
  "uncertainty": "<What information is missing, unclear, or unconfirmed. Write 'None identified.' if everything is clear.>",
  "translated": "<The full alert (summary + action steps) translated into {language}. If the language is English, repeat the English summary here.>"
}}

The translated field must be in {language}.
"""


# ── /api/generate endpoint ─────────────────────────────────────────────────────
@app.route("/api/generate", methods=["POST"])
def generate():
    # Validate request body
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "Request body must be JSON."}), 400

    notes = (body.get("notes") or "").strip()
    language = (body.get("language") or "English").strip()

    if not notes:
        return jsonify({"error": "Field 'notes' is required and cannot be empty."}), 400

    supported = {"English", "Mongolian", "Japanese", "Chinese"}
    if language not in supported:
        return jsonify({"error": f"Unsupported language '{language}'. Choose from: {', '.join(sorted(supported))}."}), 400

    # Read model ID from environment
    model_id = os.environ.get("BEDROCK_MODEL_ID", "").strip()
    if not model_id:
        return jsonify({
            "error": (
                "BEDROCK_MODEL_ID environment variable is not set. "
                "Export it before starting the server, e.g.: "
                "export BEDROCK_MODEL_ID=us.amazon.nova-lite-v1:0"
            )
        }), 500

    prompt = build_prompt(notes, language)

    # Call Bedrock Converse API
    try:
        client = get_bedrock_client()
        response = client.converse(
            modelId=model_id,
            messages=[
                {
                    "role": "user",
                    "content": [{"text": prompt}],
                }
            ],
            inferenceConfig={
                "temperature": 0.1,   # low temperature for accurate, stable output
                "maxTokens": 1024,
            },
        )
    except ClientError as e:
        code = e.response["Error"]["Code"]
        msg = e.response["Error"]["Message"]
        return jsonify({"error": f"Bedrock error ({code}): {msg}"}), 502
    except BotoCoreError as e:
        return jsonify({"error": f"AWS connection error: {str(e)}"}), 502
    except Exception as e:
        return jsonify({"error": f"Unexpected error calling Bedrock: {str(e)}"}), 500

    # Parse the model's response
    try:
        raw_text = response["output"]["message"]["content"][0]["text"].strip()

        # Strip markdown code fences if the model added them
        if raw_text.startswith("```"):
            lines = raw_text.splitlines()
            raw_text = "\n".join(
                line for line in lines if not line.strip().startswith("```")
            ).strip()

        parsed = json.loads(raw_text)
    except (KeyError, IndexError) as e:
        return jsonify({"error": f"Unexpected Bedrock response structure: {str(e)}"}), 500
    except json.JSONDecodeError as e:
        return jsonify({
            "error": f"Model returned non-JSON output: {str(e)}",
            "raw": raw_text[:500],   # include first 500 chars for debugging
        }), 500

    # Validate expected keys are present
    expected = {"summary", "action_steps", "uncertainty", "translated"}
    missing = expected - set(parsed.keys())
    if missing:
        return jsonify({
            "error": f"Model response missing fields: {', '.join(sorted(missing))}",
            "raw": raw_text[:500],
        }), 500

    return jsonify(parsed)


# ── Serve the frontend ─────────────────────────────────────────────────────────
@app.route("/")
def index():
    return app.send_static_file("index.html")


# ── Entry point ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    model_id = os.environ.get("BEDROCK_MODEL_ID", "")
    if not model_id:
        print(
            "\n⚠  WARNING: BEDROCK_MODEL_ID is not set.\n"
            "   Export it before making requests, e.g.:\n"
            "   export BEDROCK_MODEL_ID=us.amazon.nova-lite-v1:0\n",
            file=sys.stderr,
        )

    print("SpartanSignal starting on http://localhost:8000")
    app.run(host="0.0.0.0", port=8000, debug=False)
