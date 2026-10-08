// 组件注册表：每个组件是 (params, ctx, spec) => { el, update?(t, ctx) }
export const components = Object.create(null);

export function register(name, factory) {
  components[name] = factory;
}

export function get(name) {
  const f = components[name];
  if (!f) throw new Error(`未知组件 "${name}"。可用组件：${Object.keys(components).sort().join(', ')}`);
  return f;
}
