# SpartanSignal

An AI-powered emergency alert tool for SJSU coordinators.
Paste messy incident notes, pick a language, and get a clear multilingual campus alert — powered by Amazon Bedrock.

## Supported languages
- English
- Mongolian
- Japanese
- Chinese

## Setup

### 1. Install dependencies
```bash
pip3 install flask flask-cors boto3
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

## Project structure
```
index.html   — Frontend UI
style.css    — Styles
app.js       — Frontend logic (fetch, render, copy)
server.py    — Flask backend + Amazon Bedrock Converse API
```

## Notes
- Never commit real AWS credentials — use environment variables only.
- Every generated alert includes a **NEEDS COORDINATOR REVIEW** banner.
- Uses low temperature (0.1) so Bedrock stays factual and doesn't invent details.
