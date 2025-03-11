def process(file_path):
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    return {
        "file_size": len(content),
        "line_count": len(content.split("\n")),
        "content_sample": content[:100]
    }