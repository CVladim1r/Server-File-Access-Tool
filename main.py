from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Form
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware

from pathlib import Path
import os
import uuid
import importlib.util
from PIL import Image
from io import BytesIO
import mimetypes
import textwrap
import shutil

UPLOAD_DIR = "uploads"
PREVIEW_DIR = "previews"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PREVIEW_DIR, exist_ok=True)

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


async def generate_preview(file_path: str, filename: str):
    relative_path = os.path.relpath(file_path, UPLOAD_DIR)
    preview_path = os.path.join(PREVIEW_DIR, relative_path)
    preview_dir = os.path.dirname(preview_path)
    os.makedirs(preview_dir, exist_ok=True)

    mime_type, _ = mimetypes.guess_type(filename)
    
    try:
        if mime_type and mime_type.startswith('image'):
            with Image.open(file_path) as img:
                img.thumbnail((300, 300))
                img.save(preview_path, "WEBP", quality=85)
            return preview_path
        
        elif mime_type and 'text' in mime_type:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read(2000)
            wrapped = textwrap.fill(content, width=80)
            with open(preview_path, 'w') as f:
                f.write(wrapped)
            return preview_path
            
    except Exception as e:
        print(f"Preview generation error: {str(e)}")
    
    return None


@app.get("/", response_class=HTMLResponse)
async def main_page(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/create-folder/")
async def create_folder(path: str = Form(...)):
    try:
        if '..' in path or path.startswith('/'):
            raise HTTPException(status_code=400, detail="Invalid path format")
            
        full_path = Path(UPLOAD_DIR) / path
        
        if full_path.exists() and full_path.is_file():
            raise HTTPException(status_code=400, detail="Can't create folder with existing file name")
        
        full_path.mkdir(parents=True, exist_ok=True)
        return {"status": "success"}
    except HTTPException as he:
        raise
    except Exception as e:
        print(f"Error creating folder: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"message": f"Error creating folder: {str(e)}"}
        )

@app.post("/delete-item/")
async def delete_item(path: str = Form(...)):
    try:
        full_path = Path(UPLOAD_DIR) / path
        if full_path.is_dir():
            shutil.rmtree(full_path)
            preview_dir = Path(PREVIEW_DIR) / path
            if preview_dir.exists():
                shutil.rmtree(preview_dir)
        else:
            full_path.unlink()
            preview_path = Path(PREVIEW_DIR) / path
            if preview_path.exists():
                preview_path.unlink()
        return {"status": "success"}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"message": f"Error deleting item: {str(e)}"}
        )

@app.get("/get-content/{path:path}")
async def get_content(path: str = ""):
    try:
        target_path = Path(UPLOAD_DIR) / path
        
        if not target_path.exists():
            raise HTTPException(status_code=404, detail="Path not found")
            
        if not target_path.is_dir():
            raise HTTPException(status_code=400, detail="Requested path is not a directory")
        
        content = []
        for item in target_path.iterdir():
            item_path = str(Path(path) / item.name) if path else item.name
            preview_path = Path(PREVIEW_DIR) / item_path
            
            content.append({
                "name": item.name,
                "type": "folder" if item.is_dir() else "file",
                "path": item_path,
                "preview": f"/preview/{item_path}" if preview_path.exists() else None
            })
        
        return {"content": sorted(content, key=lambda x: (x['type'], x['name']))}
    except HTTPException as he:
        raise
    except Exception as e:
        print(f"Error getting content: {str(e)}")  # Логирование
        return JSONResponse(
            status_code=500,
            content={"message": f"Error getting content: {str(e)}"}
        )

@app.get("/get-file/{path:path}")
async def get_file(path: str):
    file_path = Path(UPLOAD_DIR) / path
    if file_path.exists():
        return FileResponse(file_path)
    raise HTTPException(status_code=404, detail="File not found")

@app.post("/save-file/{path:path}")
async def save_file(path: str, content: str = Form(...)):
    try:
        file_path = Path(UPLOAD_DIR) / path
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        return {"status": "success"}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"message": f"Error saving file: {str(e)}"}
        )

@app.post("/rename-item/")
async def rename_item(old_path: str = Form(...), new_name: str = Form(...)):
    try:
        old_full = Path(UPLOAD_DIR) / old_path
        new_full = old_full.parent / new_name
        
        if new_full.exists():
            raise HTTPException(status_code=400, detail="Item already exists")
        
        old_full.rename(new_full)
        
        old_preview = Path(PREVIEW_DIR) / old_path
        if old_preview.exists():
            new_preview = old_preview.parent / new_name
            old_preview.rename(new_preview)
        
        return {"status": "success"}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"message": f"Error renaming item: {str(e)}"}
        )
    
@app.post("/move-item/")
async def move_item(old_path: str = Form(...), new_path: str = Form(...)):
    try:
        old_full = Path(UPLOAD_DIR) / old_path
        new_full = Path(UPLOAD_DIR) / new_path
        
        if new_full.exists():
            raise HTTPException(status_code=400, detail="Target path already exists")
        
        shutil.move(str(old_full), str(new_full))
        
        old_preview = Path(PREVIEW_DIR) / old_path
        if old_preview.exists():
            new_preview = Path(PREVIEW_DIR) / new_path
            shutil.move(str(old_preview), str(new_preview))
        
        return {"status": "success"}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"message": f"Error moving item: {str(e)}"}
        )

@app.post("/upload/")
async def upload_file(file: UploadFile = File(...), path: str = Form("")):
    try:
        file_name = f"{str(uuid.uuid4())}_{file.filename}"
        file_path = Path(UPLOAD_DIR) / path / file_name
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        preview_path = await generate_preview(str(file_path), file.filename)
        
        return {
            "filename": file_name,
            "preview": f"/preview/{Path(path) / file_name}" if preview_path else None,
            "type": mimetypes.guess_type(file.filename)[0] or 'unknown'
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"message": f"Error uploading file: {str(e)}"}
        )

@app.get("/files/")
async def list_files():
    try:
        files = []
        for filename in os.listdir(UPLOAD_DIR):
            mime_type, _ = mimetypes.guess_type(filename)
            preview_exists = os.path.exists(os.path.join(PREVIEW_DIR, f"preview_{filename}"))
            
            files.append({
                "filename": filename,
                "type": mime_type or "unknown",
                "preview": f"/preview/{filename}" if preview_exists else None
            })
        
        return {"files": files}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"message": f"Error listing files: {str(e)}"}
        )

@app.get("/download/{filename}")
async def download_file(filename: str):
    file_path = os.path.join(UPLOAD_DIR, filename)
    if os.path.exists(file_path):
        return FileResponse(file_path)
    raise HTTPException(status_code=404, detail="File not found")

@app.get("/preview/{path:path}")
async def get_preview(path: str):
    file_path = Path(UPLOAD_DIR) / path
    preview_path = Path(PREVIEW_DIR) / path
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    if preview_path.exists():
        return FileResponse(preview_path)
    
    return Response(status_code=204)