// Bloom is selective by brightness (threshold 1.0). enableBloom pushes an
// object's colours above 1.0; layer 1 only tags glowing things.
export const LAYER_DEFAULT = 0;
export const LAYER_GLOW = 1;

function eachMaterial(obj, fn) {
  obj.traverse((o) => {
    if (!o.material) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => fn(m, o));
  });
}

function remember(m) {
  if (!m.userData.baseColor && m.color) m.userData.baseColor = m.color.clone();
  if (!m.userData.baseEmissive && m.emissive) m.userData.baseEmissive = m.emissive.clone();
}

// Idempotent: always sets from the stored base, so repeated calls never
// compound.
export function enableBloom(obj, intensity = 2.5) {
  obj.traverse((o) => o.layers.enable(LAYER_GLOW));
  eachMaterial(obj, (m) => {
    remember(m);
    if (m.emissive) m.emissive.copy(m.userData.baseEmissive).multiplyScalar(intensity);
    else if (m.color) m.color.copy(m.userData.baseColor).multiplyScalar(intensity);
    if (m.uniforms?.uIntensity) m.uniforms.uIntensity.value = intensity;
  });
}

export function disableBloom(obj) {
  obj.traverse((o) => o.layers.disable(LAYER_GLOW));
  eachMaterial(obj, (m) => {
    if (m.emissive && m.userData.baseEmissive) m.emissive.copy(m.userData.baseEmissive);
    else if (m.color && m.userData.baseColor) m.color.copy(m.userData.baseColor);
    if (m.uniforms?.uIntensity) m.uniforms.uIntensity.value = 1;
  });
}
