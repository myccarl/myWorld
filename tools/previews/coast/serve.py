"""Local story preview. Pass --explore for the balanced free-roam preview."""
import sys
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

here = Path(__file__).resolve().parent
sys.path.insert(0, str(here.parent / "shop_lane"))
from serve import Preview, game


class CoastPreview(Preview):
    start_url = "/?mode=3d&quality=high"

    def translate_path(self, path):
        if urlsplit(path).path == "/visual-comparison.html":
            return str(here / "visual-comparison.html")
        if urlsplit(path).path == "/handling-grips.mp4":
            return str(here / "handling-grips.mp4")
        if urlsplit(path).path == "/free-roam.mp4":
            return str(here / "free-roam.mp4")
        if urlsplit(path).path == "/coast-walk.mp4":
            return str(here / "coast-walk.mp4")
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


if __name__ == "__main__":
    explore = "--explore" in sys.argv
    if explore:
        CoastPreview.start_url = "/?mode=3d&quality=medium&explore=1"
    ThreadingHTTPServer(("127.0.0.1",18772 if explore else 18770), partial(CoastPreview,directory=str(game))).serve_forever()
