"""HTML report generation for text extraction evaluation results."""

import base64
import html
import io
from datetime import datetime
from pathlib import Path

import fitz  # PyMuPDF

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False


class HTMLReportGenerator:
    """Generate HTML reports from text extraction evaluation results."""

    def __init__(self, detailed_results: dict, ground_truth_dir: Path):
        """
        Initialize the HTML report generator.

        Args:
            detailed_results: Dictionary containing detailed evaluation results
            ground_truth_dir: Path to the directory containing ground truth JSON files
        """
        self.detailed_results = detailed_results
        self.ground_truth_dir = ground_truth_dir
        self.documents = detailed_results.get("documents", [])

    def generate_report(self, output_path: Path) -> None:
        """
        Generate complete HTML report and save to file.

        Args:
            output_path: Path where the HTML report will be saved
        """
        html_content = self._build_html()
        output_path.write_text(html_content, encoding="utf-8")

    def _build_html(self) -> str:
        """Build the complete HTML document."""
        css = self._generate_css()
        summary = self._generate_summary_html()
        navigation = self._generate_navigation_html()
        documents_html = self._generate_all_documents_html()

        return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Parsing Evaluation Report - {datetime.now().strftime('%Y-%m-%d %H:%M')}</title>
    <style>
{css}
    </style>
</head>
<body>
    {navigation}
    {summary}
    {documents_html}
</body>
</html>"""

    def _generate_css(self) -> str:
        """Generate CSS styles for the report."""
        return """        body {
            font-family: system-ui, -apple-system, sans-serif;
            margin: 0;
            padding: 0;
            background: #f5f5f5;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }
        nav {
            position: sticky;
            top: 0;
            background: #fff;
            padding: 15px 20px;
            border-bottom: 2px solid #ddd;
            z-index: 100;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        nav h2 {
            margin: 0 0 10px 0;
            font-size: 1.25em;
        }
        .nav-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 10px;
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease;
        }
        .nav-list.expanded {
            max-height: 500px;
            overflow-y: auto;
        }
        .toggle-nav {
            background: #3b82f6;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9em;
        }
        .toggle-nav:hover {
            background: #2563eb;
        }
        .nav-item {
            padding: 8px 12px;
            background: #f9fafb;
            border-radius: 4px;
            text-decoration: none;
            color: #1f2937;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-left: 4px solid #d1d5db;
        }
        .nav-item:hover {
            background: #e5e7eb;
        }
        .nav-item.good {
            border-left-color: #22c55e;
        }
        .nav-item.warning {
            border-left-color: #f59e0b;
        }
        .nav-item.poor {
            border-left-color: #ef4444;
        }
        .nav-item-metrics {
            font-size: 0.85em;
            color: #6b7280;
        }
        .summary {
            background: #fff;
            padding: 30px;
            margin: 20px 0;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .summary h1 {
            margin: 0 0 20px 0;
            color: #1f2937;
        }
        .metrics {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .metric {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            padding: 20px;
            border-radius: 8px;
        }
        .metric-label {
            font-size: 0.9em;
            color: #6b7280;
            margin-bottom: 8px;
        }
        .metric-value {
            font-size: 2em;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .metric-value.good {
            color: #22c55e;
        }
        .metric-value.warning {
            color: #f59e0b;
        }
        .metric-value.poor {
            color: #ef4444;
        }
        .document {
            background: #fff;
            border: 1px solid #e5e7eb;
            margin: 20px 0;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .document-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid #e5e7eb;
        }
        .document-title {
            font-size: 1.5em;
            font-weight: bold;
            color: #1f2937;
            word-break: break-all;
        }
        .edit-link {
            display: inline-block;
            padding: 8px 16px;
            background: #3b82f6;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            font-size: 0.9em;
            white-space: nowrap;
        }
        .edit-link:hover {
            background: #2563eb;
        }
        .section {
            margin: 30px 0;
        }
        .section-title {
            font-size: 1.25em;
            font-weight: bold;
            margin: 0 0 15px 0;
            color: #374151;
        }
        .pdf-preview {
            max-width: 100%;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .pdf-error {
            background: #fee2e2;
            border: 1px solid #fecaca;
            padding: 20px;
            border-radius: 4px;
            color: #991b1b;
        }
        .doc-text {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            padding: 20px;
            border-radius: 4px;
            white-space: pre-wrap;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
            max-height: 400px;
            overflow-y: auto;
            line-height: 1.5;
        }
        .qa-pairs {
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
        .qa-item {
            padding: 20px;
            background: #f9fafb;
            border-radius: 4px;
            border-left: 4px solid;
        }
        .qa-item.pass {
            border-left-color: #22c55e;
        }
        .qa-item.fail {
            border-left-color: #ef4444;
        }
        .qa-question {
            font-weight: bold;
            margin-bottom: 12px;
            color: #1f2937;
        }
        .qa-answer {
            margin: 8px 0;
            padding: 10px;
            background: white;
            border-radius: 4px;
        }
        .qa-label {
            font-size: 0.85em;
            color: #6b7280;
            margin-bottom: 4px;
        }
        .qa-score {
            font-weight: bold;
            font-size: 1.1em;
            margin-top: 10px;
        }
        .score-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.85em;
            font-weight: bold;
        }
        .score-badge.good {
            background: #dcfce7;
            color: #166534;
        }
        .score-badge.warning {
            background: #fef3c7;
            color: #92400e;
        }
        .score-badge.poor {
            background: #fee2e2;
            color: #991b1b;
        }"""

    def _generate_summary_html(self) -> str:
        """Generate aggregate metrics summary section."""
        total_docs = len(self.documents)

        # Calculate aggregate QA metrics
        total_llm_judge_pass = 0
        qa_count = 0
        parse_latencies = []
        all_llm_latencies = []

        for doc in self.documents:
            qa_eval = doc.get("qa_evaluation", {})
            if qa_eval:
                llm_judge_rate = qa_eval.get("llm_judge_pass_rate", 0)
                total_llm_judge_pass += llm_judge_rate
                qa_count += 1

                parse_lat = qa_eval.get("parse_latency_seconds")
                if parse_lat is not None:
                    parse_latencies.append(parse_lat)

                llm_metrics = qa_eval.get("llm_latency_metrics")
                if llm_metrics:
                    all_llm_latencies.extend(llm_metrics.get("individual_latencies", []))

        avg_llm_judge_pass = total_llm_judge_pass / qa_count if qa_count > 0 else 0
        judge_class = self._get_metric_class(avg_llm_judge_pass)

        # Generate latency metrics HTML
        latency_metrics_html = ""
        if parse_latencies:
            avg_parse_lat = sum(parse_latencies) / len(parse_latencies)
            latency_metrics_html += f"""                <div class="metric">
                    <div class="metric-label">Parse Latency (Avg)</div>
                    <div class="metric-value">{avg_parse_lat:.2f}s</div>
                    <div class="metric-label">min: {min(parse_latencies):.2f}s, max: {max(parse_latencies):.2f}s</div>
                </div>"""

        if all_llm_latencies:
            avg_llm_lat = sum(all_llm_latencies) / len(all_llm_latencies)
            latency_metrics_html += f"""                <div class="metric">
                    <div class="metric-label">LLM Latency (Avg per call)</div>
                    <div class="metric-value">{avg_llm_lat:.2f}s</div>
                    <div class="metric-label">min: {min(all_llm_latencies):.2f}s, max: {max(all_llm_latencies):.2f}s</div>
                </div>"""

        return f"""    <div class="container">
        <div class="summary">
            <h1>QA Evaluation Report</h1>
            <p>Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
            <div class="metrics">
                <div class="metric">
                    <div class="metric-label">Total Documents</div>
                    <div class="metric-value">{total_docs}</div>
                </div>
                <div class="metric">
                    <div class="metric-label">LLM Judge Pass Rate</div>
                    <div class="metric-value {judge_class}">{avg_llm_judge_pass:.1%}</div>
                    <div class="metric-label">Across {qa_count} documents</div>
                </div>
{latency_metrics_html}
            </div>
        </div>
    </div>"""

    def _generate_navigation_html(self) -> str:
        """Generate navigation with anchors to each document."""
        nav_items = []
        for idx, doc in enumerate(self.documents):
            filename = Path(doc["file"]).name
            qa_eval = doc.get("qa_evaluation", {})

            judge_pass = qa_eval.get("llm_judge_pass_rate", 0)
            nav_class = self._get_metric_class(judge_pass)

            metrics_text = f"Judge Pass: {judge_pass:.0%}"

            nav_items.append(
                f'            <a href="#doc-{idx}" class="nav-item {nav_class}">'
                f'<span>{html.escape(filename)}</span>'
                f'<span class="nav-item-metrics">{metrics_text}</span>'
                f'</a>'
            )

        nav_list = "\n".join(nav_items)

        return f"""    <nav>
        <div class="container">
            <h2>Document Navigation ({len(self.documents)} documents)</h2>
            <button class="toggle-nav" onclick="this.nextElementSibling.classList.toggle('expanded')">
                Toggle Navigation
            </button>
            <div class="nav-list">
{nav_list}
            </div>
        </div>
    </nav>"""

    def _generate_all_documents_html(self) -> str:
        """Generate HTML for all documents."""
        docs_html = []
        for idx, doc in enumerate(self.documents):
            docs_html.append(self._generate_document_html(doc, idx))

        return f"""    <div class="container">
{chr(10).join(docs_html)}
    </div>"""

    def _generate_document_html(self, doc: dict, index: int) -> str:
        """Generate HTML for single document with all evaluations."""
        filename = Path(doc["file"]).name
        pdf_path = Path(doc["file"])

        # Generate VS Code link
        vscode_link = self._generate_vscode_link(doc["file"])
        edit_button = f'<a href="{vscode_link}" class="edit-link">Edit Ground Truth</a>' if vscode_link else ''

        # Generate PDF preview
        pdf_preview_html = self._generate_pdf_preview_html(pdf_path)

        extracted_text = doc.get("extracted_text")
        extracted_text_html = f'<pre class="doc-text">{html.escape(extracted_text)}</pre>'

        # Generate QA results
        qa_html = self._generate_qa_html(doc.get("qa_evaluation", {}))

        return f"""        <div class="document" id="doc-{index}">
            <div class="document-header">
                <div class="document-title">{html.escape(filename)}</div>
                {edit_button}
            </div>

            <div class="section">
                <h3 class="section-title">PDF Preview</h3>
                {pdf_preview_html}
            </div>

            <div class="section">
                <h3 class="section-title">Extracted Text</h3>
                {extracted_text_html}
            </div>

            <div class="section">
                <h3 class="section-title">QA Evaluation</h3>
                {qa_html}
            </div>
        </div>"""

    def _generate_pdf_preview_html(self, pdf_path: Path) -> str:
        """Generate PDF preview HTML with base64 encoded image."""
        try:
            base64_image = self._pdf_to_base64_image(pdf_path)
            return f'<img src="{base64_image}" alt="PDF Preview" class="pdf-preview">'
        except Exception as e:
            return f'<div class="pdf-error">Failed to load PDF preview: {html.escape(str(e))}</div>'

    def _generate_qa_html(self, qa_eval: dict) -> str:
        """Generate HTML for QA evaluation results."""
        if not qa_eval:
            return '<p>No QA evaluation data available.</p>'

        llm_judge_pass_rate = qa_eval.get("llm_judge_pass_rate", 0)
        total_questions = qa_eval.get("total_questions", 0)
        parse_latency = qa_eval.get("parse_latency_seconds")
        llm_metrics = qa_eval.get("llm_latency_metrics")

        judge_class = self._get_metric_class(llm_judge_pass_rate)

        latency_text = ""
        if parse_latency is not None:
            latency_text += f'<p><strong>Parse Latency:</strong> {parse_latency:.2f}s</p>'

        if llm_metrics:
            avg_lat = llm_metrics.get("average_seconds", 0)
            min_lat = llm_metrics.get("min_seconds", 0)
            max_lat = llm_metrics.get("max_seconds", 0)
            stddev_lat = llm_metrics.get("stddev_seconds", 0)
            latency_text += f'<p><strong>LLM Latency:</strong> avg: {avg_lat:.2f}s, min: {min_lat:.2f}s, max: {max_lat:.2f}s, stddev: {stddev_lat:.2f}s</p>'

        summary = f'<p><strong>LLM Judge Pass Rate:</strong> <span class="score-badge {judge_class}">{llm_judge_pass_rate:.1%}</span> (across {total_questions} questions)</p>{latency_text}'

        qa_pairs = qa_eval.get("qa_pairs", [])
        if not qa_pairs:
            return summary + '<p>No QA pairs to display.</p>'

        qa_items = []
        for qa in qa_pairs:
            llm_judge_pass = qa.get("llm_judge_pass", False)

            item_class = "pass" if llm_judge_pass else "fail"
            badge_class = "good" if llm_judge_pass else "poor"
            badge_text = "PASS" if llm_judge_pass else "FAIL"

            question = html.escape(qa.get("question", ""))
            expected = html.escape(qa.get("expected_answer", ""))
            predicted = html.escape(qa.get("predicted_answer", ""))

            qa_items.append(
                f'                <div class="qa-item {item_class}">'
                f'<div class="qa-question">Q: {question}</div>'
                f'<div class="qa-answer">'
                f'<div class="qa-label">Expected Answer:</div>'
                f'{expected}'
                f'</div>'
                f'<div class="qa-answer">'
                f'<div class="qa-label">Predicted Answer:</div>'
                f'{predicted}'
                f'</div>'
                f'<div class="qa-score">'
                f'<span class="score-badge {badge_class}">LLM Judge: {badge_text}</span>'
                f'</div>'
                f'</div>'
            )

        qa_html = "\n".join(qa_items)

        return f"""{summary}
            <div class="qa-pairs">
{qa_html}
            </div>"""

    def _pdf_to_base64_image(self, pdf_path: Path, dpi: int = 72) -> str:
        """
        Convert first page of PDF to base64-encoded image.

        Uses JPEG compression if PIL is available, otherwise PNG.

        Args:
            pdf_path: Path to the PDF file
            dpi: Resolution for rendering (default 72)

        Returns:
            Base64-encoded image as data URL

        Raises:
            Exception: If PDF cannot be opened or converted
        """
        doc = fitz.open(str(pdf_path))
        try:
            page = doc[0]  # First page only

            # Render to pixmap at specified DPI
            mat = fitz.Matrix(dpi / 72, dpi / 72)
            pix = page.get_pixmap(matrix=mat)

            # Try to compress to JPEG if PIL is available
            if HAS_PIL:
                # Convert pixmap to PIL Image
                img_data = pix.tobytes("png")
                img = Image.open(io.BytesIO(img_data))

                # Convert to RGB (JPEG doesn't support alpha channel)
                if img.mode in ('RGBA', 'LA', 'P'):
                    rgb_img = Image.new('RGB', img.size, (255, 255, 255))
                    if img.mode == 'P':
                        img = img.convert('RGBA')
                    rgb_img.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
                    img = rgb_img

                # Save as JPEG with compression
                buffer = io.BytesIO()
                img.save(buffer, format='JPEG', quality=85, optimize=True)
                img_bytes = buffer.getvalue()

                # Encode to base64
                base64_str = base64.b64encode(img_bytes).decode("utf-8")
                return f"data:image/jpeg;base64,{base64_str}"
            else:
                # Fallback to PNG
                img_bytes = pix.tobytes("png")
                base64_str = base64.b64encode(img_bytes).decode("utf-8")
                return f"data:image/png;base64,{base64_str}"
        finally:
            doc.close()

    def _generate_vscode_link(self, pdf_path: str) -> str:
        """
        Generate vscode:// link to ground truth JSON file.

        Args:
            pdf_path: Path to the PDF file

        Returns:
            vscode:// URL or empty string if ground truth file doesn't exist
        """
        # Get the stem of the PDF filename
        pdf_stem = Path(pdf_path).stem

        # Find corresponding ground truth JSON file
        gt_file = self.ground_truth_dir / f"{pdf_stem}.json"

        if gt_file.exists():
            # Convert to absolute path for VS Code link
            abs_path = gt_file.resolve()
            return f"vscode://file/{abs_path}"

        return ""

    def _get_metric_class(self, score: float) -> str:
        """
        Get CSS class based on metric score.

        Args:
            score: Score value between 0 and 1

        Returns:
            CSS class name: 'good', 'warning', or 'poor'
        """
        if score >= 0.9:
            return "good"
        elif score >= 0.7:
            return "warning"
        else:
            return "poor"
