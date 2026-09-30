import * as T from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { QUALITY, type Quality } from '../core/config';
import { createTrack } from '../track/TrackVisual';
import { createEnvironment } from '../track/Environment';
import type { Circuit } from '../track/Circuit';
import { batchStatic } from './batchStatic';

export class World {
  readonly scene = new T.Scene();
  readonly renderer: T.WebGLRenderer;
  private sun = new T.DirectionalLight('#fff1d6', 2.4);
  private env: T.WebGLRenderTarget;
  quality: Quality = 'medium';
  constructor(canvas: HTMLCanvasElement, circuit: Circuit) {
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.03;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.scene.background = new T.Color('#bed6cd');
    this.scene.fog = new T.Fog('#bed6cd', 250, 1250);
    const pmrem = new T.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.env = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.env.texture;
    this.scene.environmentIntensity = 0.32;
    room.dispose();
    pmrem.dispose();
    this.scene.add(new T.HemisphereLight('#dcece4', '#a8a47d', 1.15));
    this.sun.position.set(-80, 120, 70);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -48;
    sc.right = sc.top = 48;
    sc.near = 1;
    sc.far = 280;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(batchStatic(createEnvironment(circuit)), createTrack(circuit));
    this.setQuality('medium');
  }
  setQuality(quality: Quality) {
    this.quality = quality;
    const config = QUALITY[quality];
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, config.pixelRatio));
    this.renderer.shadowMap.enabled = config.shadows;
    this.sun.shadow.mapSize.setScalar(config.shadowSize);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    this.renderer.shadowMap.needsUpdate = true;
  }
  followSun(x: number, z: number) {
    // Snap the light to texel-sized increments to reduce shadow shimmer.
    const snap = 96 / QUALITY[this.quality].shadowSize;
    const sx = Math.round(x / snap) * snap,
      sz = Math.round(z / snap) * snap;
    this.sun.position.set(sx - 60, 105, sz + 45);
    this.sun.target.position.set(sx, 0, sz);
  }
  resize(width: number, height: number) {
    this.renderer.setSize(width, height);
  }
  dispose() {
    const geometries = new Set<T.BufferGeometry>(),
      materials = new Set<T.Material>(),
      textures = new Set<T.Texture>();
    this.scene.traverse((object) => {
      if (object instanceof T.Mesh) {
        geometries.add(object.geometry);
        for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
          materials.add(mat);
          for (const value of Object.values(mat))
            if (value instanceof T.Texture) textures.add(value);
        }
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    this.env.dispose();
    this.renderer.dispose();
  }
}
