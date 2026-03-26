from pathlib import Path

import fitz  # PyMuPDF

from .base import ParserProvider


class PyMuPDFProvider(ParserProvider):
    """
    Parse provider using PyMuPDF.

    Install with: pip install pymupdf
    """

    def __init__(self):
        """Initialize the parse provider."""
        pass

    def extract_text(self, file_path: Path) -> str:
        """Extract text from a document using PyMuPDF."""
        doc = fitz.open(str(file_path))
        text = "\n\n".join(page.get_text() for page in doc)
        return text
