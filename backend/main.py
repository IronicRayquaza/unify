import os
import uuid
import tempfile
import time
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import yt_dlp
from supabase import create_client, Client
from dotenv import load_dotenv
# Load environment variables
load_dotenv() # Loads .env
load_dotenv(dotenv_path=".env.local") # Loads .env.local if exists

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

@app.get("/")
async def health_check():
    return {"status": "alive", "message": "Unify Backend is running"}

# Production CORS origins from environment variable
CORS_ORIGINS_ENV = os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS_ENV,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase Configuration with Validation
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ ERROR: Missing Supabase Environment Variables!")
    print("Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in your hosting dashboard.")
    # We don't crash immediately so the logs can be read easily
else:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

class CaptureRequest(BaseModel):
    url: str
    title: str = None
    artist: str = None
    thumbnail: str = None
    mode: str = "audio"

@app.get("/soundcloud-resolve")
async def resolve_soundcloud(url: str):
    print(f"[Backend] SoundCloud Resolve: {url}")
    try:
        ydl_opts = {
            'format': 'bestaudio[ext=mp3]/bestaudio[ext=m4a]/bestaudio[protocol^=http]/bestaudio',
            'quiet': True,
            'no_warnings': True,
            'nocheckcertificate': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # Find the best audio stream URL
            stream_url = info.get('url')
            
            return {
                "success": True,
                "id": info.get('id'),
                "title": info.get('title'),
                "artist": info.get('uploader'),
                "thumbnail": info.get('thumbnail'),
                "duration": info.get('duration'),
                "stream_url": stream_url
            }
    except Exception as e:
        print(f"[Backend] SoundCloud Resolve Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

from fastapi import Request
from fastapi.responses import StreamingResponse
import httpx

@app.get("/soundcloud-stream")
async def stream_soundcloud(url: str, request: Request):
    """Proxies the audio stream to bypass CloudFront IP locks and supports Range requests for seeking."""
    print(f"[Backend] Proxying stream URL...")
    
    headers = {}
    range_header = request.headers.get("range")
    if range_header:
        headers["range"] = range_header

    client = httpx.AsyncClient()
    
    try:
        req = client.build_request("GET", url, headers=headers)
        r = await client.send(req, stream=True)
        
        response_headers = {}
        for k, v in r.headers.items():
            if k.lower() in ["content-type", "content-length", "content-range", "accept-ranges"]:
                response_headers[k] = v

        async def proxy_generator():
            async for chunk in r.aiter_bytes(chunk_size=65536):
                yield chunk
            await client.aclose()

        return StreamingResponse(
            proxy_generator(),
            status_code=r.status_code,
            headers=response_headers,
            background=client.aclose
        )
    except Exception as e:
        await client.aclose()
        print(f"[Backend] Stream Proxy Error: {str(e)}")
        raise HTTPException(status_code=500, detail="Stream proxy failed.")

@app.post("/capture")
async def capture_media(request: CaptureRequest):
    start_time = time.time()
    print(f"[Backend] High-Speed Extraction Triggered: {request.url}")

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            file_id = str(uuid.uuid4())
            output_template = os.path.join(tmpdir, f"{file_id}.%(ext)s")

            ydl_opts = {
                'format': '140/bestaudio/best' if request.mode == "audio" else '18/best[ext=mp4]/best',
                'outtmpl': output_template,
                'quiet': True,
                'no_warnings': True,
                'nocheckcertificate': True,
                'ignoreerrors': False,
                'logtostderr': False,
                'no_color': True,
                'no_playlist': True,
                'cachedir': False,
            }

            print(f"[Backend] Starting yt-dlp download...")
            dl_start = time.time()

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(request.url, download=True)

            from glob import glob
            files = glob(os.path.join(tmpdir, f"{file_id}.*"))
            if not files:
                raise Exception("File not found after download completion")

            actual_file = files[0]
            ext = actual_file.split('.')[-1]

            with open(actual_file, 'rb') as f:
                content = f.read()

            print(f"[Backend] Download finished in {time.time() - dl_start:.2f}s")

            storage_path = f"captures/{file_id}.{ext}"
            if request.mode == "video":
                storage_path = f"captures/videos/{file_id}.{ext}"

            print(f"[Backend] Syncing to Supabase...")
            supabase.storage.from_('songs').upload(
                path=storage_path,
                file=content,
                file_options={"content-type": f"{request.mode}/mpeg" if request.mode == "audio" else "video/mp4"}
            )

            public_url_res = supabase.storage.from_('songs').get_public_url(storage_path)
            public_url = public_url_res if isinstance(public_url_res, str) else getattr(public_url_res, 'public_url', str(public_url_res))

            total_time = time.time() - start_time
            print(f"[Backend] Total Process: {total_time:.2f}s")

            return {
                "success": True,
                "track": {
                    "id": str(uuid.uuid4()),
                    "url": public_url,
                    "platform": "local",
                    "title": request.title or info.get('title'),
                    "artist": request.artist or info.get('uploader'),
                    "thumbnail": request.thumbnail or info.get('thumbnail'),
                    "duration": f"{info.get('duration', 0)//60}:{info.get('duration', 0)%60:02d}"
                }
            }

    except Exception as e:
        print(f"[Backend] Fatal Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Important: hosting platforms pass the port as an environment variable
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)