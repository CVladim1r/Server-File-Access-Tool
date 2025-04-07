import uuid

from pydantic import BaseModel, Field

class CodeBlock(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    content: str
    collapsed: bool = False 