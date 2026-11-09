import { fail } from './errors.mjs';

export function endpointId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)+$/.test(value) || value.split('/').some(x => x === '.' || x === '..')) fail('需要完整模型 endpoint ID，不接受 URL 或相对路径。');
  return value;
}
export function pointer(root, path) {
  if (path === '') return root;
  if (typeof path !== 'string' || !path.startsWith('/') || /~(?![01])/.test(path)) fail('需要有效 JSON Pointer，例如 /video/url。');
  return path.slice(1).split('/').reduce((value, token) => {
    const key = token.replaceAll('~1', '/').replaceAll('~0', '~');
    return value != null && Object.hasOwn(value, key) ? value[key] : undefined;
  }, root);
}
export const escapePointer = key => String(key).replaceAll('~', '~0').replaceAll('/', '~1');
export function resolve(schema, document, seen = new Set()) {
  if (!schema?.$ref) return schema;
  if (!schema.$ref.startsWith('#/') || seen.has(schema.$ref)) fail('schema 含外部或循环引用，需检查原始定义；未提交。');
  const target = pointer(document, schema.$ref.slice(1));
  if (target === undefined) fail('schema 引用无法解析；未提交。');
  const { $ref, ...siblings } = schema;
  return { ...resolve(target, document, new Set([...seen, $ref])), ...siblings };
}
export function contractFromModel(model, endpoint) {
  const doc = model?.openapi;
  if (model?.endpoint_id !== endpoint || !doc?.paths) fail('模型不存在或未提供可用 OpenAPI schema。');
  const posts = Object.entries(doc.paths).filter(([, methods]) => methods.post?.requestBody?.content?.['application/json']?.schema);
  if (posts.length !== 1) fail('模型不是唯一的标准 JSON 队列入口；需要专用协议，未猜测调用路径。');
  const [route, methods] = posts[0];
  const result = doc.paths[`${route}/requests/{request_id}`]?.get?.responses?.['200']?.content?.['application/json']?.schema;
  if (!result) fail('模型 schema 没有标准队列结果入口；实时／流式接口不适用。');
  const inputSchema = resolve(methods.post.requestBody.content['application/json'].schema, doc);
  const outputSchema = resolve(result, doc);
  return { version: 1, endpoint, fetchedAt: new Date().toISOString(), inputSchema, outputSchema, openapi: doc };
}

// Deliberately limited preflight, not a complete JSON Schema implementation.
// Unknown assertions are reported rather than silently advertised as validated.
const supported = new Set(['$ref', '$schema', '$id', '$defs', 'definitions', 'title', 'description', 'default', 'examples', 'example', 'deprecated', 'readOnly', 'writeOnly', 'discriminator', 'xml', 'externalDocs', 'type', 'nullable', 'enum', 'const', 'required', 'properties', 'additionalProperties', 'items', 'minItems', 'maxItems', 'uniqueItems', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'allOf', 'anyOf', 'oneOf', 'not', 'format', 'minProperties', 'maxProperties']);
const same = (a, b) => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a); return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && same(a[k], b[k]));
};
export function validate(value, original, document) {
  const warnings = new Set();
  function check(v, raw, at, depth = 0) {
    if (depth > 64) fail('schema／输入嵌套过深。');
    if (raw === true || raw === undefined) return [];
    if (raw === false) return [`${at}: schema 不允许此值`];
    const s = resolve(raw, document), errors = [];
    for (const k of Object.keys(s)) if (!supported.has(k) && !k.startsWith('x-')) warnings.add(`未自动校验 schema 关键字 ${k}；需人工核对定义，服务端仍会校验。`);
    const err = message => errors.push(`${at || '/'}: ${message}`);
    if (v === null && s.nullable) return errors;
    for (const sub of s.allOf ?? []) errors.push(...check(v, sub, at, depth + 1));
    for (const key of ['anyOf', 'oneOf']) if (s[key]) {
      const count = s[key].filter(sub => check(v, sub, at, depth + 1).length === 0).length;
      if (key === 'anyOf' ? count === 0 : count !== 1) err(`不符合 ${key}`);
    }
    if (s.not && check(v, s.not, at, depth + 1).length === 0) err('符合被排除的 schema');
    if (s.enum && !s.enum.some(x => same(x, v))) err('不在允许的枚举内');
    if (Object.hasOwn(s, 'const') && !same(s.const, v)) err('不符合 const');
    const types = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [];
    const isType = t => t === 'null' ? v === null : t === 'array' ? Array.isArray(v) : t === 'object' ? v !== null && typeof v === 'object' && !Array.isArray(v) : t === 'integer' ? Number.isInteger(v) : typeof v === t;
    if (types.length && !types.some(isType)) { err(`类型应为 ${types.join('|')}`); return errors; }
    if (typeof v === 'number') {
      for (const [k, bad] of [['minimum', v < s.minimum], ['maximum', v > s.maximum]]) if (typeof s[k] === 'number' && bad) err(`超出 ${k}`);
      if (typeof s.exclusiveMinimum === 'number' ? v <= s.exclusiveMinimum : s.exclusiveMinimum === true && v <= s.minimum) err('超出 exclusiveMinimum');
      if (typeof s.exclusiveMaximum === 'number' ? v >= s.exclusiveMaximum : s.exclusiveMaximum === true && v >= s.maximum) err('超出 exclusiveMaximum');
      if (s.multipleOf && Math.abs(v / s.multipleOf - Math.round(v / s.multipleOf)) > 1e-8) err('不符合 multipleOf');
    }
    if (typeof v === 'string') {
      if ([...v].length < s.minLength || [...v].length > s.maxLength) err('字符串长度超限');
      if (s.pattern) { try { if (!new RegExp(s.pattern).test(v)) err('不符合 pattern'); } catch { warnings.add('pattern 无法用 JavaScript 正则校验。'); } }
      if (['uri', 'url'].includes(s.format)) { try { new URL(v); } catch { err('不是有效 URI'); } }
      else if (s.format) warnings.add(`format=${s.format} 未自动校验。`);
    }
    if (Array.isArray(v)) {
      if (v.length < s.minItems || v.length > s.maxItems) err('数组长度超限');
      if (s.uniqueItems && v.some((x, i) => v.slice(0, i).some(y => same(x, y)))) err('数组包含重复值');
      if (Array.isArray(s.items)) warnings.add('旧版 tuple items 未自动校验。');
      else v.forEach((x, i) => errors.push(...check(x, s.items, `${at}/${i}`, depth + 1)));
    } else if (v !== null && typeof v === 'object') {
      if (Object.keys(v).length < s.minProperties || Object.keys(v).length > s.maxProperties) err('对象字段数量超限');
      for (const k of s.required ?? []) if (!Object.hasOwn(v, k)) err(`缺少 ${k}`);
      for (const [k, x] of Object.entries(v)) {
        const sub = Object.hasOwn(s.properties ?? {}, k) ? s.properties[k] : s.additionalProperties;
        if (sub === undefined && s.properties && !Object.hasOwn(s.properties, k)) warnings.add(`字段 ${at}/${escapePointer(k)} 未在 properties 中声明；需核对是否为拼写错误。`);
        errors.push(...check(x, sub, `${at}/${escapePointer(k)}`, depth + 1));
      }
    }
    return errors;
  }
  return { errors: check(value, original, ''), warnings: [...warnings] };
}

export function outputFiles(result, contract, selected = []) {
  const found = [], missing = [];
  const add = (value, at) => {
    const url = typeof value === 'string' ? value : value?.url;
    if (typeof url !== 'string' || !/^https:\/\//.test(url)) { missing.push(at); return; }
    found.push({ pointer: at, url, contentType: value?.content_type, fileName: value?.file_name });
  };
  if (selected.length) { for (const at of selected) add(pointer(result, at), at); return { found, missing }; }
  function visit(value, raw, at, depth = 0) {
    if (depth > 64) fail('结果嵌套过深。');
    const s = resolve(raw, contract.openapi) ?? {};
    const branches = [...(s.allOf ?? []), ...(s.anyOf ?? []), ...(s.oneOf ?? [])].map(x => resolve(x, contract.openapi));
    const properties = Object.assign({}, ...branches.map(x => x?.properties), s.properties);
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.url === 'string' &&
      (Object.hasOwn(value, 'content_type') || Object.hasOwn(value, 'file_name') || Object.hasOwn(value, 'file_size') || properties.url)) { add(value, at); return; }
    if (typeof value === 'string' && [s, ...branches].some(b => ['uri', 'url'].includes(b?.format))) { add(value, at); return; }
    if (Array.isArray(value)) value.forEach((x, i) => visit(x, s.items ?? branches.find(b => b?.items)?.items, `${at}/${i}`, depth + 1));
    else if (value && typeof value === 'object') for (const [k, x] of Object.entries(value)) visit(x, properties[k] ?? s.additionalProperties, `${at}/${escapePointer(k)}`, depth + 1);
  }
  visit(result, contract.outputSchema, '');
  return { found, missing };
}
