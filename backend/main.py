import os
import uuid
import tempfile
import time
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import yt_dlp
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(dotenv_path=".env.local")

app = FastAPI()

supabase: Client = create_client(
    os.environ.get("NEXT_PUBLIC_SUPABASE_URL"),
    os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
)

class CaptureRequest(BaseModel):
    url: str
    title: str = None
    artist: str = None
    thumbnail: str = None
    mode: str = "audio"

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
    uvicorn.run(app, host="0.0.0.0", port=8000)