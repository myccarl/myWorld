import * as THREE from 'three';

// Render batches can span an entire street. Build a separate index for short
// gameplay rays. Three still tests the original triangles in mesh-local space.
const CELL = 5;
const cellOf = p => Math.floor(p / CELL);
const key = (x, z) => x + ',' + z;

export class WalkableGrid {
  constructor(meshes) {
    this.meshes = meshes;
    this.cells = new Map();
    this.always = [];
    this.end = new THREE.Vector3();
    this.list = [];
    const p = new THREE.Vector3();
    for (const mesh of meshes) {
      const g = mesh.geometry, attr = g.attributes.position;
      if (Array.isArray(mesh.material) || mesh.isInstancedMesh || mesh.isSkinnedMesh ||
          g.morphAttributes.position || g.drawRange.start || g.drawRange.count !== Infinity) {
        this.always.push(mesh);
        continue;
      }
      mesh.updateWorldMatrix(true, false);
      const xs = new Int32Array(attr.count), zs = new Int32Array(attr.count);
      for (let i = 0; i < attr.count; i++) {
        p.fromBufferAttribute(attr, i).applyMatrix4(mesh.matrixWorld);
        xs[i] = cellOf(p.x); zs[i] = cellOf(p.z);
      }
      const buckets = new Map(), large = [];
      const index = g.index, count = index ? index.count : attr.count;
      for (let i = 0; i < count; i += 3) {
        const a = index ? index.getX(i) : i, b = index ? index.getX(i+1) : i+1, c = index ? index.getX(i+2) : i+2;
        const x0 = Math.min(xs[a],xs[b],xs[c]), x1 = Math.max(xs[a],xs[b],xs[c]);
        const z0 = Math.min(zs[a],zs[b],zs[c]), z1 = Math.max(zs[a],zs[b],zs[c]);
        if ((1+x1-x0)*(1+z1-z0) > 64) { large.push(a,b,c); continue; }
        for (let x=x0; x<=x1; x++) for (let z=z0; z<=z1; z++) {
          const k=key(x,z);
          if (!buckets.has(k)) buckets.set(k,[]);
          buckets.get(k).push(a,b,c);
        }
      }
      if (!g.boundingSphere) g.computeBoundingSphere();
      const proxy = indices => {
        const part = new THREE.BufferGeometry();
        part.setAttribute('position',attr);
        part.setIndex(indices);
        part.boundingSphere = g.boundingSphere;
        const obj = new THREE.Mesh(part,mesh.material);
        obj.matrixWorld = mesh.matrixWorld;
        obj.layers = mesh.layers;
        return obj;
      };
      if (large.length) this.always.push(proxy(large));
      for (const [k, indices] of buckets) {
        if (!this.cells.has(k)) this.cells.set(k,[]);
        this.cells.get(k).push(proxy(indices));
      }
    }
  }

  candidates(raycaster) {
    if (!Number.isFinite(raycaster.far)) return this.meshes;
    const start = raycaster.ray.origin, end = raycaster.ray.at(raycaster.far, this.end);
    const x0=cellOf(Math.min(start.x,end.x)), x1=cellOf(Math.max(start.x,end.x));
    const z0=cellOf(Math.min(start.z,end.z)), z1=cellOf(Math.max(start.z,end.z));
    if ((1+x1-x0)*(1+z1-z0)>64) return this.meshes;
    this.list.length=0;
    this.list.push(...this.always);
    for (let x=x0; x<=x1; x++) for (let z=z0; z<=z1; z++) {
      const group=this.cells.get(key(x,z));
      if (group) this.list.push(...group);
    }
    return this.list;
  }
}
