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
def build_prompt(notes: str, language: str, official_source: str) -> str:
    source_block = (
        f"\nOFFICIAL SOURCE / CONFIRMATION:\n{official_source}\n"
        if official_source
        else "\nOFFICIAL SOURCE / CONFIRMATION:\nNone provided.\n"
    )

    return f"""You are an emergency communications assistant for San José State University (SJSU).
Your job is to turn raw incident notes into a clear, calm, factual campus alert,
and to assess the reliability and priority of the information.

STRICT RULES:
- Do NOT invent, assume, or extrapolate any facts not present in the notes or official source.
- Do NOT speculate about causes or outcomes unless they are explicitly stated.
- Use calm, clear language appropriate for students and staff.
- NEVER label a fact as "Confirmed" unless it appears in the official source text.
- Student reports alone must be labeled "Unverified".
- If the official source conflicts with the incident notes, record the conflict under needs_verification.
- The coordinator must approve the priority before publishing — do not overstate urgency.

INCIDENT NOTES:
{notes}
{source_block}
PRIORITY GUIDELINES:
- High: injury, danger to people, fire, active threat, hazardous material, evacuation,
  emergency services called, major building closure, or campus-wide outage.
- Medium: water outage, power or internet outage, multiple classrooms affected,
  or a disruption lasting several hours.
- Low: minor maintenance issue, small area affected, informational announcement,
  or no immediate safety risk.

VERIFICATION GUIDELINES:
- "Confirmed"    — fact is explicitly stated in the official source.
- "Corroborated" — fact appears in both the incident notes and the official source,
                   but the official source did not independently originate it.
- "Unverified"   — no official source provided, or the official source does not mention this fact.

Respond ONLY with a valid JSON object — no markdown fences, no text outside the JSON.
Use exactly these nine keys:

{{
  "summary": "<One or two sentence factual summary of the incident>",
  "action_steps": ["<Step 1>", "<Step 2>", "..."],
  "uncertainty": "<What information is missing, unclear, or unconfirmed. Write 'None identified.' if everything is clear.>",
  "translated": "<The full alert (summary + action steps) translated into {language}. If the language is English, repeat the English summary here.>",
  "verification_status": "<One of: Unverified | Corroborated | Confirmed>",
  "confirmed_facts": ["<Fact directly supported by the official source or clearly stated in incident notes>", "..."],
  "needs_verification": ["<Uncertain, conflicting, incomplete, or unconfirmed detail>", "..."],
  "priority": "<One of: Low | Medium | High>",
  "priority_reason": "<One or two sentences explaining the recommended priority based on the guidelines above.>"
}}

The translated field must be in {language}.
"""


# ── Deterministic priority safety override ────────────────────────────────────
# These run AFTER the Bedrock response is parsed. They ensure that language
# describing genuine danger can never be silently downgraded to "Low" by the
# model. Bedrock's priority_reason is preserved; the priority value is replaced
# when a safety keyword is found.

_HIGH_TERMS = [
    "active threat", "active shooter", "shooter",
    "violence", "violent", "assault", "weapon",
    "fire", "flames", "burning",
    "explosion", "exploded", "blast",
    "smoke",
    "gas leak", "gas leak", "natural gas", "hazardous material",
    "haz mat", "hazmat", "chemical spill", "toxic",
    "serious injury", "injured", "injuries", "casualty", "casualties",
    "evacuation", "evacuate", "evacuated",
    "emergency services", "fire department", "police",
    "ambulance", "paramedic", "911",
    "earthquake",
    "building collapse", "structural damage", "collapsed",
]

_MEDIUM_TERMS = [
    "water outage", "water main", "burst pipe", "flooding", "flood",
    "power outage", "power failure", "blackout", "no power",
    "internet outage", "network outage", "connectivity",
    "multiple classrooms", "several classrooms",
    "building repair", "building closure", "closed building",
    "utility failure", "utility outage", "outage",
    "disruption", "service disruption",
]

_HIGH_OVERRIDE_REASON = (
    "High priority because the report may involve immediate danger, "
    "emergency response, or evacuation."
)


def _contains_any(text: str, terms: list) -> bool:
    """Return True if any term appears as a substring (case-insensitive)."""
    lower = text.lower()
    return any(t in lower for t in terms)


def apply_priority_override(parsed: dict, notes: str, official_source: str) -> dict:
    """
    Override Bedrock's priority when safety-critical or disruption terms are
    present in the incident text.  Bedrock's priority_reason is kept so the
    coordinator still sees the model's explanation alongside the override.
    """
    # Combine everything Bedrock should have considered
    combined = f"{notes} {official_source}".strip()

    if _contains_any(combined, _HIGH_TERMS):
        if parsed.get("priority") != "High":
            parsed["priority"] = "High"
            # Prepend the safety override note; keep Bedrock's own reasoning too
            bedrock_reason = parsed.get("priority_reason", "").strip()
            parsed["priority_reason"] = (
                _HIGH_OVERRIDE_REASON
                + (f" (Bedrock note: {bedrock_reason})" if bedrock_reason else "")
            )
    elif _contains_any(combined, _MEDIUM_TERMS):
        if parsed.get("priority") == "Low":
            parsed["priority"] = "Medium"
            bedrock_reason = parsed.get("priority_reason", "").strip()
            parsed["priority_reason"] = (
                "Medium priority because the report describes a service "
                "disruption or outage affecting campus operations."
                + (f" (Bedrock note: {bedrock_reason})" if bedrock_reason else "")
            )

    return parsed


# ── /api/generate endpoint ─────────────────────────────────────────────────────
@app.route("/api/generate", methods=["POST"])
def generate():
    # Validate request body
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "Request body must be JSON."}), 400

    notes = (body.get("notes") or "").strip()
    language = (body.get("language") or "English").strip()
    official_source = (body.get("official_source") or "").strip()

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

    prompt = build_prompt(notes, language, official_source)

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
                "maxTokens": 2048,
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
    expected = {"summary", "action_steps", "uncertainty", "translated",
                "verification_status", "confirmed_facts", "needs_verification",
                "priority", "priority_reason"}
    missing = expected - set(parsed.keys())
    if missing:
        return jsonify({
            "error": f"Model response missing fields: {', '.join(sorted(missing))}",
            "raw": raw_text[:500],
        }), 500

    # Apply deterministic safety override — must run after key validation
    parsed = apply_priority_override(parsed, notes, official_source)

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
