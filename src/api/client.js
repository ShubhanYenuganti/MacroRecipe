
export async function post(body, timeout = 300000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(`${API_URL}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": API_SECRET
        },
        body: JSON.stringify(body),
        signal: controller.signal
    })

    clearTimeout(timer)

    if (!res.ok) {
        // Read ONCE, then parse
        let message = `Request failed (${res.status})`;
        let raw = "";
        try { raw = await res.text(); } catch {}

        if (raw) {
        try {
            const data = JSON.parse(raw);
            if (data?.message) message = data.message;
            else message = typeof data === "string" ? data : raw;
        } catch {
            message = raw;
        }
        }
        const err = new Error(message);
        err.status = res.status;
        throw err;
    }

    return res.status != 204 ? res.json() : null
}

const fmt = (x) => (Number.isFinite(x) ? x : Number(x ?? 0) || 0);

export function buildRecipePrompt({
    protein, carbs, fat, mealType, dietaryRestrictions = [], allergens = [], minutes, experience = "beginner"
}) {
    const restr = dietaryRestrictions.length ? dietaryRestrictions.join(", ") : "none";
    const allerg = allergens.length ? allergens.join(", ") : "none";
    const mins = minutes ?? 30;

    return `I want ${fmt(protein)}g protein, ${fmt(carbs)}g carbs, ${fmt(fat)}g fat for ${mealType}.
I have the following dietary restrictions: ${restr}.
I have the following allergens: ${allerg}.
I have ${fmt(mins)} minutes to make the recipe and I have ${String(experience).toLowerCase()} cooking experience.`;
}

export async function fetchDailyRecipesSequential(targets, opts = {}) {
  const {    
    timeout,
    dietaryRestrictions = [],
    allergens = [],
    minutes = 30,
    experience = "beginner",
  } = opts;

  const mealOrder = ["breakfast", "lunch", "dinner", "snack"];
  const out = {};

  for (const meal of mealOrder) {
    const t = targets?.[meal];
    if (!t) { out[meal] = []; continue; }

    const perMealMinutes = typeof minutes === "object" ? minutes[meal] : minutes;

    const prompt = buildRecipePrompt({
      protein: t.protein, carbs: t.carbs, fat: t.fat,
      mealType: meal,
      dietaryRestrictions, allergens,
      minutes: perMealMinutes,
      experience,
    });

    // Adjust the request shape to match what your backend expects:
    // here we send { query: <prompt> }
    const resp = await post({ query: prompt }, timeout);

    // Your backend returns an array of recipe objects (as in your example)
    out[meal] = Array.isArray(resp) ? resp : (resp?.data ?? []);
  }

  return out;
}