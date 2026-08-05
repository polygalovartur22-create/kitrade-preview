from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parent
PUBLIC_ROOT = ROOT / "dist" if (ROOT / "dist").is_dir() else ROOT


class StaticHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split("?", 1)[0] in {"/catalog", "/catalog.html"}:
            self.send_response(301)
            self.send_header("Location", "/catalog/")
            self.end_headers()
            return
        super().do_GET()

    def send_error(self, code, message=None, explain=None):
        if code != 404:
            return super().send_error(code, message, explain)
        page = PUBLIC_ROOT / "404.html"
        body = page.read_bytes() if page.exists() else b"Not found"
        self.send_response(404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format, *args):
        pass


if __name__ == "__main__":
    handler = partial(StaticHandler, directory=str(PUBLIC_ROOT))
    port = int(os.environ.get("KITRADE_PORT", "4173"))
    ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
