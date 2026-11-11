// Python API(FastAPI) 호출. 개발 중에는 vite가 /api 를 localhost:8000 으로 넘겨준다.
async function request(path, options) {
  const res = await fetch(path, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(body.detail) ? body.detail.map((d) => d.msg).join(", ") : body.detail;
    throw new Error(detail || `서버 오류 (${res.status})`);
  }
  return body;
}

export const getCatalog = () => request("/api/catalog");
export const searchFood = (q) => request(`/api/foods/search?q=${encodeURIComponent(q)}`);
export const runSimulation = (person, scenarios) =>
  request("/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ person, scenarios }),
  });
export const getRecommend = (person, scenarios) =>
  request("/api/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ person, scenarios }),
  });
export const askCoach = (q, weight, sex) =>
  request(`/api/ask?q=${encodeURIComponent(q)}&weight=${encodeURIComponent(weight || 65)}&sex=${sex || 1}`);
