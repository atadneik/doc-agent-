from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

class Evidence(BaseModel):
    model_config = ConfigDict(extra='forbid')
    raw_value: str | None
    normalized_value: str | None
    unit: str | None
    currency: str | None
    document_id: str
    page_number: int = Field(ge=1)
    evidence_text: str | None
    bbox: list[float] | None
    coordinate_system: Literal['pdf_points', 'image_pixels']
    page_width: float = Field(gt=0)
    page_height: float = Field(gt=0)
    extraction_method: Literal['pdf_text', 'ocr', 'model']
    verification_status: Literal['anchored', 'unresolved', 'ambiguous']
    scope: Literal['shipment', 'container', 'line']
    scope_id: str | None

class Extraction(BaseModel):
    model_config = ConfigDict(extra='forbid')
    document_id: str
    document_type: Literal['invoice','packing_list','bill_of_lading','certificate_of_origin','unknown']
    fields: dict[str, list[Evidence]]
