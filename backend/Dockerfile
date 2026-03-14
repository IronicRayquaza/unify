FROM python:3.10-slim

# Install system dependencies (ffmpeg is required by yt-dlp for audio processing)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir --upgrade yt-dlp

# Copy source code
COPY . .

# Expose the default port (optional, mostly documentation)
EXPOSE 8000

# Start with uvicorn using the PORT environment variable provided by the host
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
