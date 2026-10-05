/** security requirement ของ OpenAPI — ระบุชนิดชัดเจนเพื่อให้ผ่านการตรวจชนิดของ Fastify */
export const sec: Record<string, string[]>[] = [{ cookieAuth: [] }, { bearerAuth: [] }]
export const keySec: Record<string, string[]>[] = [{ apiKey: [] }]
