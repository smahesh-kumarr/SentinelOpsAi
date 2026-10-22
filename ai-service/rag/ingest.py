import os
import glob
import logging
from rag.vector_store import store_chunk

logger = logging.getLogger("ai_service.rag.ingest")

def ingest_runbooks(kb_dir: str = None) -> int:
    """Ingest markdown runbooks from knowledge_base directory into vector store."""
    if not kb_dir:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        kb_dir = os.path.join(base_dir, "knowledge_base")

    md_files = glob.glob(os.path.join(kb_dir, "*.md"))
    if not md_files:
        logger.warning(f"No runbook markdown files found in {kb_dir}")
        return 0

    chunk_count = 0
    pid = 1

    for file_path in md_files:
        source_name = os.path.basename(file_path)
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()

            raw_chunks = [c.strip() for c in content.split("\n\n") if c.strip()]
            for chunk in raw_chunks:
                store_chunk(pid, chunk, source_name)
                pid += 1
                chunk_count += 1

            logger.info(f"Ingested {len(raw_chunks)} chunks from runbook '{source_name}'")
        except Exception as e:
            logger.error(f"Failed to ingest runbook {file_path}: {e}")

    logger.info(f"RAG Knowledge Base indexing complete: {chunk_count} total chunks across {len(md_files)} runbooks.")
    return chunk_count
