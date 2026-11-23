// 地形高度：从上往下打一条射线，找到脚下第一个可走的面。
// 返回 { y: 地面高度, ny: 坡面法线的 y 分量（1 = 水平，越小越陡） }，脚下没有可走的面时返回 null。
// 只对 walkables（合并后的静态网格）检测，水面等不在其中。

import * as THREE from 'three';

export class Ground {
  constructor(meshes) {
    this.meshes = meshes;
    this.ray = new THREE.Raycaster();
    this.origin = new THREE.Vector3();
    this.down = new THREE.Vector3(0, -1, 0);
    this.normal = new THREE.Vector3();
    this.nm = new THREE.Matrix3();
  }

  probe(x, z, fromY, maxDepth = 60) {
    this.ray.set(this.origin.set(x, fromY, z), this.down);
    this.ray.far = maxDepth;
    const hit = this.ray.intersectObjects(this.meshes, false)[0];
    if (!hit) return null;
    let ny = 1;
    if (hit.face) {
      this.normal.copy(hit.face.normal).applyMatrix3(this.nm.getNormalMatrix(hit.object.matrixWorld)).normalize();
      ny = Math.abs(this.normal.y);
    }
    return { y: hit.point.y, ny };
  }

  // 水平方向有没有墙：在膝、腰、头三个高度朝移动方向各打一条短射线。
  // 用来挡住比人还高的墙面（高台侧面、悬崖），这些地方从上往下的射线看不到。
  wall(x, y, z, dx, dz, dist, heights = [0.5, 1.0, 1.55]) {
    const len = Math.hypot(dx, dz);
    if (!len) return false;
    this.dir = this.dir || new THREE.Vector3();
    this.dir.set(dx / len, 0, dz / len);
    this.ray.far = dist;
    for (const h of heights) {
      this.ray.set(this.origin.set(x, y + h, z), this.dir);
      if (this.ray.intersectObjects(this.meshes, false).length) return true;
    }
    return false;
  }
}
