import * as T from 'three';

export const material = (color: T.ColorRepresentation, roughness = 0.8, metalness = 0) =>
  new T.MeshStandardMaterial({ color, roughness, metalness });

export function box(
  parent: T.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  mat: T.Material,
) {
  const mesh = new T.Mesh(new T.BoxGeometry(...size), mat);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function cylinderBetween(
  parent: T.Object3D,
  a: T.Vector3,
  b: T.Vector3,
  radius: number,
  mat: T.Material,
) {
  const d = b.clone().sub(a);
  const mesh = new T.Mesh(new T.CylinderGeometry(radius, radius, d.length(), 8), mat);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

export function textTexture(
  text: string,
  background: string,
  foreground: string,
  width = 1024,
  height = 256,
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = foreground;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `italic 800 ${height * 0.53}px Arial`;
  ctx.fillText(text, width / 2, height * 0.53, width * 0.9);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Cross-section hull gives the car a deliberate tapered silhouette. */
export function hull(sections: [number, number, number, number][], mat: T.Material) {
  const vertices: number[] = [],
    indices: number[] = [];
  for (const [z, halfWidth, bottom, top] of sections) {
    vertices.push(
      -halfWidth,
      bottom,
      z,
      halfWidth,
      bottom,
      z,
      halfWidth * 0.83,
      top,
      z,
      -halfWidth * 0.83,
      top,
      z,
    );
  }
  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < 4; j++) {
      const a = i * 4 + j,
        b = i * 4 + ((j + 1) % 4),
        c = b + 4,
        d = a + 4;
      indices.push(a, b, d, b, c, d);
    }
  }
  const last = (sections.length - 1) * 4;
  indices.push(0, 3, 1, 1, 3, 2, last, last + 1, last + 3, last + 1, last + 2, last + 3);
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new T.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
