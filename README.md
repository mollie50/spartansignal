# SpartanSignal

An AI-powered emergency alert tool for SJSU coordinators.
Paste messy incident notes, optionally add an official source, pick a language, and get a clear multilingual campus alert — powered by Amazon Bedrock.

## Features

- **AI alert generation** — summarizes incident notes, creates student action steps, and flags missing information
- **Voice input** — dictate incident notes using the browser's Web Speech API (Chrome/Edge)
- **Multilingual output** — alerts translated into English, Mongolian, Japanese, or Chinese
- **Verification status** — Confirmed, Corroborated, or Unverified based on whether an official source was provided
- **Priority classification** — High / Medium / Low with a deterministic safety override that prevents critical incidents from being under-classified
- **Copy alert** — one-click copy of the full alert including all sections
- **Human review banner** — every draft is marked "NEEDS COORDINATOR REVIEW" before publishing
- **Responsive layout** — works on desktop and mobile

## Supported output languages

- English
- Mongolian
- Japanese
- Chinese

## Setup

### 1. Install dependencies
```bash
pip3 install -r requirements.txt
```

### 2. Set environment variables
Copy `.env.example` and fill in your values:
```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...        # if using temporary credentials
export AWS_DEFAULT_REGION=us-east-1
export BEDROCK_MODEL_ID=us.amazon.nova-lite-v1:0
```

### 3. Run the server
```bash
python3 server.py
```

Open **http://localhost:8000** in your browser.

To run on a different port:
```bash
PORT=5000 python3 server.py
```

## Deploying to Amazon EC2

Tested on **Amazon Linux 2023** using **Flask + Boto3 + Amazon Bedrock** (Converse API).

1. SSH into your EC2 instance and clone the repo:
   ```bash
   git clone https://github.com/mollie50/spartansignal.git
   cd spartansignal
   ```

2. Create and activate a virtual environment, then install dependencies:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   python -m pip install -r requirements.txt
   ```

3. Set environment variables:
   ```bash
   export AWS_DEFAULT_REGION=us-east-1
   export BEDROCK_MODEL_ID=us.amazon.nova-lite-v1:0
   ```
   > **IAM credentials note:** Attaching an IAM role to the EC2 instance is the preferred approach — boto3 picks up the role automatically and no credentials need to be set manually. This workshop account restricted role creation, so temporary workshop credentials were used at runtime instead:
   > ```bash
   > export AWS_ACCESS_KEY_ID=...
   > export AWS_SECRET_ACCESS_KEY=...
   > export AWS_SESSION_TOKEN=...
   > ```
   > Never commit real credentials to the repository.

4. Open port **8000** in the EC2 security group inbound rules.

5. Start the server (foreground):
   ```bash
   PORT=8000 python server.py
   ```
   Or run it in the background and log output to a file:
   ```bash
   PORT=8000 nohup python server.py > spartansignal.log 2>&1 &
   ```

6. Verify it is running:
   ```bash
   curl http://localhost:8000/health
   # → {"status": "ok"}
   ```

## How to use

1. Enter raw incident notes in the **Incident notes** box, or click **Speak** to dictate
2. Optionally paste an update from SJSU Facilities, Police, or another official source in the **Official confirmation** box
3. Select the output language
4. Click **Generate alert draft**
5. Review the generated summary, action steps, verification status, and priority
6. Edit as needed, then click **Copy alert** to copy the full text

## Priority classification

Priority is recommended by Bedrock and then validated by a deterministic safety override in `server.py`:

| Priority | When applied |
|---|---|
| **High** | Fire, evacuation, active threat, explosion, gas leak, hazardous material, serious injury, earthquake, building collapse, or emergency services |
| **Medium** | Water/power/internet outage, multiple classrooms affected, building repair, or utility failure |
| **Low** | Minor maintenance, small area affected, informational only |

The safety override ensures that high-priority keywords always produce a High result, regardless of what Bedrock returns. Coordinator approval is always required before publishing.

## Project structure

```
index.html   — Frontend UI
style.css    — Styles (responsive, mobile-friendly)
app.js       — Frontend logic (fetch, render, voice input, copy)
server.py    — Flask backend + Amazon Bedrock Converse API + priority override
```

## Notes

- Never commit real AWS credentials — use environment variables only.
- Voice input requires Chrome or Edge (Firefox does not support the Web Speech API).
- Every generated alert includes a **NEEDS COORDINATOR REVIEW** banner.
- Uses temperature 0.1 so Bedrock stays factual and avoids inventing details.
