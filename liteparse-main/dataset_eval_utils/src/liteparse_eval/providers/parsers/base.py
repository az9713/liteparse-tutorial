from abc import ABC, abstractmethod
from pathlib import Path


class ParserProvider(ABC):
    """Abstract base class for text extraction/parsing providers."""

    @abstractmethod
    def extract_text(self, file_path: Path) -> str:
        """
        Extract text from a document.

        Args:
            file_path: Path to the document file

        Returns:
            Extracted text as a single string
        """
        pass

    def extract_text_batch(self, file_paths: list[Path]) -> dict[Path, str]:
        """
        Extract text from multiple documents in batch.

        Override this method for providers that support native batch processing.
        The default implementation processes files sequentially.

        Args:
            file_paths: List of paths to document files

        Returns:
            Dictionary mapping file paths to extracted text
        """
        results = {}
        for file_path in file_paths:
            results[file_path] = self.extract_text(file_path)
        return results
