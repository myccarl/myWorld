"""本地预览服务：和 `python -m http.server` 一样，但告诉浏览器不要缓存。
改了台词或代码，刷新页面就能看到，不会用到旧文件。

用法（在 D:\\myWorld 下运行）：
    python tools/serve.py            # 默认端口 8765
    python tools/serve.py 8080       # 换一个端口
    python tools/serve.py 8766 dist  # 预览打包好的发布版（dist 文件夹）
然后用浏览器打开 http://localhost:8765
"""
import functools
import http.server
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'game')


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.json': 'application/json',
        '.glb': 'model/gltf-binary',
        '.svg': 'image/svg+xml',
    }

    # 开发用：POST /__save/<文件名> 把内容存到 tools/generated/（生成树木等资产时用；发布版没有这个服务）
    def do_POST(self):
        if not self.path.startswith('/__save/'):
            self.send_error(404)
            return
        name = os.path.basename(self.path[len('/__save/'):])
        out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'generated')
        os.makedirs(out_dir, exist_ok=True)
        length = int(self.headers.get('Content-Length', 0))
        with open(os.path.join(out_dir, name), 'wb') as f:
            f.write(self.rfile.read(length))
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'ok')

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', sys.argv[2]) if len(sys.argv) > 2 else ROOT
    handler = functools.partial(NoCacheHandler, directory=os.path.normpath(root))
    with http.server.ThreadingHTTPServer(('', port), handler) as httpd:
        print(f'风停之前：http://localhost:{port}  （按 Ctrl+C 停止）')
        httpd.serve_forever()


if __name__ == '__main__':
    main()
