import os
import uuid
import json
import shutil
import textwrap
import mimetypes
import traceback

from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Form, Body
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder

from werkzeug.utils import secure_filename
from urllib.parse import unquote
from pathlib import Path
from PIL import Image
from pydantic import BaseModel, Field
from typing import List


UPLOAD_DIR = "uploads"
PREVIEW_DIR = "previews"

class CodeBlock(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    content: str
    collapsed: bool = False 

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PREVIEW_DIR, exist_ok=True)


app = FastAPI(
    debug = False,
    title = "FastAPIServerApp",
    description = "1C или путь успеха",
    version = "0.0.2",
)

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

# @app.post("/save-text/")
# async def save_text(
#     text: str = Form(...),
#     path: str = Form(...)
# ):
#     def secure_path(path: str) -> str:
#         path = path.strip('/')
#         parts = path.split('/') if path else []
#         secured_parts = [secure_filename(part) for part in parts]
#         return '/'.join(secured_parts)

#     try:
#         if '..' in path or path.startswith('/'):
#             raise HTTPException(status_code=400, detail="Invalid path format")
        
#         secured_path = secure_path(path)
#         full_path = Path(UPLOAD_DIR) / secured_path
        
#         full_path.parent.mkdir(parents=True, exist_ok=True)
#         with open(full_path, "w", encoding="utf-8") as f:
#             f.write(text)
        
#         preview_path = await generate_preview(str(full_path), full_path.name)
        
#         return {
#             "status": "success",
#             "path": str(full_path.relative_to(UPLOAD_DIR)),
#             "preview": f"/preview/{secured_path}" if preview_path else None
#         }
        
#     except HTTPException as he:
#         raise
#     except Exception as e:
#         return JSONResponse(
#             status_code=500,
#             content={"message": f"Error saving text: {str(e)}"}
#         )




@app.post("/st/")
async def save_text(
    text: str = Form(...),
    filename: str = Form(...),
    path: str = Form("") 
):
    def secure_path(target_path: str) -> Path:
        target_path = target_path.strip('/')
        parts = [secure_filename(p) for p in target_path.split('/')] if target_path else []
        return Path(*parts)
    
    try:
        safe_path = secure_path(path)
        full_dir = Path(UPLOAD_DIR) / safe_path
        full_dir.mkdir(parents=True, exist_ok=True)
        safe_filename = secure_filename(filename) + ".txt"
        full_path = full_dir / safe_filename
        full_path.write_text(text, encoding="utf-8")
        preview_path = await generate_preview(str(full_path), safe_filename)
        
        return {
            "status": "success",
            "path": str(full_path.relative_to(UPLOAD_DIR)),
            "preview": f"/preview/{full_path.relative_to(UPLOAD_DIR)}" if preview_path else None
        }
        
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"message": f"Error: {str(e)}"}
        )




@app.get("/tfs/", response_class=JSONResponse)
async def get_text_files():
    try:
        files = []
        allowed_ext = {'.txt', '.py', '.cpp'}
        
        for file_path in Path(UPLOAD_DIR).rglob('*.*'):
            if file_path.suffix.lower() in allowed_ext:
                relative_path = file_path.relative_to(UPLOAD_DIR)
                files.append({
                    "path": str(relative_path),
                    "name": file_path.name,
                    "type": file_path.suffix[1:]
                })
        
        return JSONResponse(content=jsonable_encoder(sorted(files, key=lambda x: x['path'])))
    
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"message": f"Error: {str(e)}"}
        )




@app.get("/gtf/{path:path}", response_class=JSONResponse)
async def get_text_file_content(path: str):
    try:
        file_path = Path(UPLOAD_DIR) / path
        allowed_ext = {'.txt', '.py', '.cpp'}
        
        if not file_path.exists():
            return Response(
                content="File not found",
                status_code=404,
                media_type="text/plain"
            )
            
        if file_path.suffix.lower() not in allowed_ext:
            return Response(
                content="Invalid file type",
                status_code=400,
                media_type="text/plain"
            )
            
        content = file_path.read_text(encoding="utf-8", errors="replace")
        
        return Response(
            content=content,
            media_type="text/plain; charset=utf-8"
        )
        
    except Exception as e:
        return Response(
            content=f"Error: {str(e)}",
            status_code=500,
            media_type="text/plain"
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
        old_full = Path(UPLOAD_DIR) / unquote(old_path)
        new_full = Path(UPLOAD_DIR) / unquote(new_path)

        if not old_full.exists():
            raise HTTPException(status_code=404, detail="Source not found")

        if new_full.parent != old_full.parent and not new_full.parent.exists():
            new_full.parent.mkdir(parents=True, exist_ok=True)

        shutil.move(str(old_full), str(new_full))

        old_preview = Path(PREVIEW_DIR) / unquote(old_path)
        if old_preview.exists():
            new_preview = Path(PREVIEW_DIR) / unquote(new_path)
            shutil.move(str(old_preview), str(new_preview))

        return {"status": "success"}

    except Exception as e:
        print(f"Move error: {traceback.format_exc()}")
        return JSONResponse(
            status_code=500,
            content={"message": f"Move failed: {str(e)}"}
        )
    
@app.post("/upload/")
async def upload_file(file: UploadFile = File(...), path: str = Form("")):
    try:
        if '..' in path or path.startswith('/'):
            raise HTTPException(status_code=400, detail="Invalid path format")
        
        adjusted_path = Path(path.strip('/'))
        if adjusted_path.suffix:
            target_dir = adjusted_path.parent
        else:
            target_dir = adjusted_path

        safe_path = Path(UPLOAD_DIR) / target_dir
        safe_path.mkdir(parents=True, exist_ok=True)

        original_filename = secure_filename(file.filename)
        file_name = f"{original_filename}"
        file_path = safe_path / file_name
        
        with open(file_path, "wb") as f:
            while content := await file.read(1024 * 1024):
                f.write(content)
        
        try:
            preview_path = await generate_preview(str(file_path), original_filename)
        except Exception as preview_error:
            print(f"Preview error: {preview_error}")
            preview_path = None
        
        return {
            "filename": str(file_path.relative_to(UPLOAD_DIR)),
            "preview": f"/preview/{file_path.relative_to(UPLOAD_DIR)}" if preview_path else None,
            "type": mimetypes.guess_type(original_filename)[0] or 'unknown'
        }
        
    except HTTPException as he:
        raise
    except Exception as e:
        print(f"Upload error: {traceback.format_exc()}")
        return JSONResponse(
            status_code=500,
            content={"message": "File upload failed"}
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

@app.get("/download/{filepath:path}")
async def download_file(filepath: str):
    decoded_path = unquote(filepath)
    target_file = Path(UPLOAD_DIR) / decoded_path
    if ".." in decoded_path:
        raise HTTPException(400, "Invalid path")
    print(f"Requested file: {target_file}")
    if not target_file.exists():
        raise HTTPException(404, "File not found")
    if not target_file.is_file():
        raise HTTPException(400, "Not a file")
    return FileResponse(target_file)

@app.get("/preview/{path:path}")
async def get_preview(path: str):
    file_path = Path(UPLOAD_DIR) / path
    preview_path = Path(PREVIEW_DIR) / path
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    if preview_path.exists():
        return FileResponse(preview_path)
    
    return Response(status_code=204)

@app.get("/code-blocks/", response_model=List[CodeBlock])
async def get_code_blocks():
    try:
        with open("code_blocks.json", "r") as f:
            return json.load(f)
    except:
        return []

@app.post("/save-code-block/")
async def save_code_block(block_data: dict):
    try:
        if 'id' not in block_data:
            block_data['id'] = str(uuid.uuid4())

        block = CodeBlock(**block_data)
        
        blocks = []
        if Path("code_blocks.json").exists():
            with open("code_blocks.json", "r") as f:
                blocks = json.load(f)
        
        existing_index = next((i for i, b in enumerate(blocks) if b['id'] == block.id), -1)
        existing_ids = {b['id'] for b in blocks}
        if block.id in existing_ids:
            return JSONResponse(
                status_code=400,
                content={"message": "Block with this ID already exists"}
            )

        if existing_index != -1:
            blocks[existing_index] = block.dict()
        else:
            blocks.append(block.dict())
        
        with open("code_blocks.json", "w") as f:
            json.dump(blocks, f, indent=2)
            
        return {"status": "success", "id": block.id}
        
    except Exception as e:
        return JSONResponse(
            status_code=400,
            content={"message": f"Validation error: {str(e)}"}
        )

@app.delete("/delete-code-block/{block_id}")
async def delete_code_block(block_id: str):
    try:
        blocks = []
        if Path("code_blocks.json").exists():
            with open("code_blocks.json", "r") as f:
                blocks = json.load(f)
        
        blocks = [b for b in blocks if b['id'] != block_id]
        
        with open("code_blocks.json", "w") as f:
            json.dump(blocks, f)
            
        return {"status": "success"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": str(e)})
    
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    return JSONResponse(
        status_code=400,
        content={"message": f"Validation error: {str(exc)}"}
    )

@app.get("/get-code-block/{block_id}")
async def get_code_block(block_id: str):
    try:
        with open("code_blocks.json", "r") as f:
            blocks = json.load(f)
        block = next(b for b in blocks if b['id'] == block_id)
        return block
    except:
        return JSONResponse(status_code=404, content={"message": "Block not found"})

@app.put("/update-code-block/{block_id}")
async def update_code_block(block_id: str, block_data: dict):
    try:
        with open("code_blocks.json", "r") as f:
            blocks = json.load(f)
            
        index = next(i for i, b in enumerate(blocks) if b['id'] == block_id)
        blocks[index] = {**blocks[index], **block_data}
        
        with open("code_blocks.json", "w") as f:
            json.dump(blocks, f)
            
        return {"status": "success"}
    except:
        return JSONResponse(status_code=404, content={"message": "Block not found"})

@app.patch("/update-block/{block_id}/")
async def update_block_state(
    block_id: str, 
    payload: dict = Body(...)
):
    try:
        with open("code_blocks.json", "r") as f:
            blocks = json.load(f)
            
        index = next(i for i, b in enumerate(blocks) if b['id'] == block_id)
        blocks[index]['collapsed'] = payload.get('collapsed', False)
        
        with open("code_blocks.json", "w") as f:
            json.dump(blocks, f)
            
        return {"status": "success"}
    except Exception as e:
        return JSONResponse(
            status_code=400,
            content={"message": f"Error: {str(e)}"}
        )