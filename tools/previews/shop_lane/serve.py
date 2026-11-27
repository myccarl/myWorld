from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

here = Path(__file__).resolve().parent
game = here.parents[2] / 'game'
class Preview(SimpleHTTPRequestHandler):
    start_url = '/?mode=3d&quality=high&map=shop_lane&jump=s02_town/hub'
    def translate_path(self, path):
        if urlsplit(path).path == '/assets/shop_lane.glb':
            return str(here / 'shop_lane.glb')
        if urlsplit(path).path == '/shop-walk.mp4':
            return str(here / 'shop-walk.mp4')
        return super().translate_path(path)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/' and not urlsplit(self.path).query:
            self.send_response(302)
            self.send_header('Location', self.start_url)
            self.end_headers()
            return
        if path not in ['/js/world/world.js', '/js/world/boot3d.js']:
            return super().do_GET()
        source = (game / path[1:]).read_text(encoding='utf-8')
        if path.endswith('world.js'):
            source = source.replace('d * 0.0022', 'd * 0.0').replace('g * 0.045', 'g * 0.004').replace('this.realism ? 0.85 :', 'this.realism ? 1.0 :').replace('this.ao.blendIntensity = 1.0', 'this.ao.blendIntensity = 0.65')
        else:
            source = source.replace('world.scene.add(res.root);', '''world.scene.add(res.root);
  if (world.qualityName === 'high') {
    const cap = Math.min(8, world.renderer.capabilities.getMaxAnisotropy());
    res.root.traverse(obj => {
      for (const mat of [].concat(obj.material || [])) {
        for (const key of ['map', 'normalMap', 'roughnessMap']) {
          const tex = mat[key];
          if (tex && tex.anisotropy !== cap) { tex.anisotropy = cap; tex.needsUpdate = true; }
        }
      }
    });
  }''')
        data = source.encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/javascript; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)
if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1',18768),partial(Preview,directory=str(game))).serve_forever()


