import os
import uuid
import tempfile
import time
import yt_dlp
import requests
import httpx
import base64
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from supabase import create_client, Client
from dotenv import load_dotenv
import asyncio

# Load environment variables
load_dotenv()
load_dotenv(dotenv_path=".env.local")

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Session-aware flag to only pulse the window on the first Spotify track
_spotify_cold_start_done = False

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

# Lazily initialized semaphore to prevent event loop attachment issues
_resolve_semaphore = None

def get_resolve_semaphore():
    global _resolve_semaphore
    if _resolve_semaphore is None:
        try:
            _resolve_semaphore = asyncio.Semaphore(2)
        except RuntimeError:
            # Fallback if loop isn't running yet (though should not happen here)
            return None
    return _resolve_semaphore

@app.get("/youtube-resolve")
async def resolve_youtube(url: str):
    print(f"[Backend] YouTube Resolve Triggered: {url}")
    
    sem = get_resolve_semaphore()
    if sem:
        await sem.acquire()
    
    try:
        ydl_opts = {
            'format': '140/bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'nocheckcertificate': True,
            'no_playlist': True,
            'lazy_playlist': True,
            'skip_download': True,
            'extract_flat': 'in_playlist',
            'socket_timeout': 5,
        }
        
        loop = asyncio.get_running_loop()
        import concurrent.futures
        
        def extract():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                return ydl.extract_info(url, download=False)
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            try:
                info = await loop.run_in_executor(executor, extract)
            except asyncio.CancelledError:
                print(f"[Backend] Resolve cancelled by client: {url}")
                return {"success": False, "error": "Cancelled"}
        
        return {
            "success": True,
            "id": info.get('id'),
            "title": info.get('title'),
            "artist": info.get('uploader'),
            "thumbnail": info.get('thumbnail'),
            "duration": info.get('duration'),
            "stream_url": info.get('url')
        }
    except Exception as e:
        print(f"[Backend] YouTube High-Speed Resolve Error: {str(e)}")
        try:
             with yt_dlp.YoutubeDL({'format': 'bestaudio/best', 'quiet': True, 'extract_flat': True}) as ydl:
                info = ydl.extract_info(url, download=False)
                return {"success": True, "stream_url": info.get('url')}
        except:
            raise HTTPException(status_code=500, detail=str(e))
    finally:
        if sem:
            sem.release()

@app.get("/spotify-kick")
async def kick_spotify(device_id: str, token: str, track_uri: str = None, is_hidden: bool = False):
    global _spotify_cold_start_done
    
    print(f"[Backend] Spotify Cloud Kick: {device_id} (Hidden: {is_hidden})")
    headers = {"Authorization": f"Bearer {token}"}
    
    async with httpx.AsyncClient() as client:
        try:
            # 1. Force device transfer and wake-up
            await client.put(
                "https://api.spotify.com/v1/me/player",
                json={"device_ids": [device_id], "play": False},
                headers=headers,
                timeout=10
            )

            # 2. Only perform 'Ghost Hand' if the tab is hidden and it's the cold start
            needs_pulse = is_hidden and not _spotify_cold_start_done
            if needs_pulse:
                print("[Backend] Background cold start — triggering focus pulse...")
                await focus_window()
                await asyncio.sleep(0.8)
            
            # 3. Trigger the actual track playback
            if track_uri:
                await client.put(
                    "https://api.spotify.com/v1/me/player/play",
                    params={"device_id": device_id},
                    json={"uris": [track_uri]},
                    headers=headers,
                    timeout=10
                )
            
            # 4. Minimize back to stealth mode if we pulsed it
            if needs_pulse:
                await asyncio.sleep(1.2)
                await minimize_window()
                print("[Backend] Stealth mode pulse complete.")
            
            # Mark session as "Warmed Up" once it plays once (even if visible)
            if not _spotify_cold_start_done:
                _spotify_cold_start_done = True
                print("[Backend] Spotify Session initialized.")

            return {"success": True, "message": "Cloud Pulse Sent"}
        except Exception as e:
            
            return {"success": True, "message": "Cloud Pulse Sent"}
        except Exception as e:
            print(f"[Backend] Force-Kick Error: {str(e)}")
            return {"success": False, "error": str(e)}

@app.get("/reset-cold-start")
async def reset_cold_start():
    global _spotify_cold_start_done
    _spotify_cold_start_done = False
    return {"success": True, "message": "Cold start flag reset"}


@app.get("/focus-window")
async def focus_window():
    """The 'Aggressive Ghost Hand': Forces the UNIFY tab to front using Win32 APIs.
    Bypasses focus-stealing prevention to trigger Spotify SDK visibility.
    """
    print("[Backend] Aggressive Ghost Hand: Targeting browser tab...")
    import subprocess
    
    # PowerShell with embedded C# for Win32 focus
    # Stricter matching to avoid targeting the IDE (unify project folder)
    ps_script = (
        "$code = @'\n"
        "using System; using System.Runtime.InteropServices;\n"
        "public class User32 {\n"
        "  [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd);\n"
        "  [DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);\n"
        "}\n"
        "'@\n"
        "Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue\n"
        "$proc = Get-Process | Where-Object { $_.MainWindowTitle -match 'UNIFY.*Universal Playlist' } | Select-Object -First 1\n"
        "if ($proc) {\n"
        "  $hwnd = $proc.MainWindowHandle\n"
        "  [User32]::ShowWindow($hwnd, 9) | Out-Null\n" # 9 = SW_RESTORE
        "  [User32]::SetForegroundWindow($hwnd) | Out-Null\n"
        "  Write-Output 'Success'\n"
        "} else { Write-Output 'NotFound' }"
    )
    
    try:
        result = subprocess.run(["powershell", "-Command", ps_script], capture_output=True, text=True)
        log = result.stdout.strip()
        print(f"[Backend] Ghost Hand Result: {log}")
        return {"success": True, "log": log}
    except Exception as e:
        print(f"[Backend] Ghost Hand Error: {str(e)}")
        return {"success": False, "error": str(e)}

@app.get("/minimize-window")
async def minimize_window():
    """The 'Stealth Mode': Minimizes the UNIFY tab back to the taskbar after SDK wake-up.
    """
    print("[Backend] Stealth Mode: Re-minimizing browser...")
    import subprocess
    ps_script = (
        "$code = @'\n"
        "using System; using System.Runtime.InteropServices;\n"
        "public class User32 {\n"
        "  [DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);\n"
        "}\n"
        "'@\n"
        "Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue\n"
        "$proc = Get-Process | Where-Object { $_.MainWindowTitle -match 'UNIFY.*Universal Playlist' } | Select-Object -First 1\n"
        "if ($proc) {\n"
        "  $hwnd = $proc.MainWindowHandle\n"
        "  [User32]::ShowWindow($hwnd, 6) | Out-Null\n" # 6 = SW_MINIMIZE
        "  Write-Output 'Success'\n"
        "} else { Write-Output 'NotFound' }"
    )
    try:
        result = subprocess.run(["powershell", "-Command", ps_script], capture_output=True, text=True)
        log = result.stdout.strip()
        print(f"[Backend] Stealth Result: {log}")
        return {"success": True, "log": log}
    except Exception as e:
        print(f"[Backend] Stealth Error: {str(e)}")
        return {"success": False, "error": str(e)}



@app.get("/proxy-stream")
async def proxy_stream(url: str, request: Request):
    """Proxies the audio stream to bypass locks and supports Range requests for seeking."""
    print(f"[Backend] Proxying stream URL...")
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    
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

        if "content-type" not in [k.lower() for k in response_headers.keys()]:
            response_headers["Content-Type"] = "audio/mpeg"

        async def proxy_generator():
            try:
                async for chunk in r.aiter_bytes(chunk_size=65536):
                    yield chunk
            finally:
                await client.aclose()

        return StreamingResponse(
            proxy_generator(),
            status_code=r.status_code,
            headers=response_headers
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