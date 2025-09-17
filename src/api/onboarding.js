import { fetchDailyRecipesSequential } from "./client";

export function submitOnboarding(answers, { token, timeout = 300000 } = {}) {
  // ---- helpers ----
  const num = (v, d = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const round0 = (x) => Math.round(x);

  // normalize inputs
  const weightLb = num(answers?.weight);
  const heightFt = num(answers?.height?.feet);
  const heightIn = num(answers?.height?.inches);
  const age = num(answers?.age);
  const sex = String(answers?.sex || "").trim().toUpperCase(); // "M" | "F" | etc.
  const activityStr = String(answers?.TDEE || "");

  // Height/weight conversions
  const weightKg = weightLb / 2.205;
  const heightCm = heightFt * 30.48 + heightIn * 2.54;

  // ---- BMR (Mifflin–St Jeor) ----
  let bmr =
    10 * weightKg + 6.25 * heightCm - 5 * age + (sex.startsWith("F") ? -161 : 5);

  // ---- Activity multiplier ----
  let activityMult = 1.2; // Sedentary default
  if (activityStr.includes("Lightly")) activityMult = 1.375;
  else if (activityStr.includes("Moderately")) activityMult = 1.55;
  else if (activityStr.includes("Very")) activityMult = 1.725;

  const TDEE = bmr * activityMult;

  // ---- Weekly goal (lb/week) ----
  const weeklyDeltaLb = num(answers?.Goal, 0); // negative for loss, positive for gain

  // Daily target calories (±500 kcal per lb/week)
  const targetCalories = TDEE + 500 * weeklyDeltaLb;

  const chooseParams = (delta) => {
    if (delta < 0) {
      if (delta <= -1.0) {
        return { phase: "loss", pRange: [1.4, 1.6], pDefault: 1.5, fatRange: [0.2, 0.3], fatDefault: 0.25 };
      } else if (delta <= -0.5) {
        return { phase: "loss", pRange: [1.0, 1.4], pDefault: 1.2, fatRange: [0.2, 0.3], fatDefault: 0.25 };
      } else {
        return { phase: "loss", pRange: [0.8, 1.2], pDefault: 1.0, fatRange: [0.2, 0.3], fatDefault: 0.25 };
      }
    } else if (delta > 0) {
      if (delta >= 1.0) {
        return { phase: "gain", pRange: [0.8, 1.1], pDefault: 1.0, fatRange: [0.25, 0.40], fatDefault: 0.30 };
      } else if (delta >= 0.5) {
        return { phase: "gain", pRange: [0.8, 1.2], pDefault: 1.0, fatRange: [0.25, 0.40], fatDefault: 0.30 };
      } else {
        return { phase: "gain", pRange: [1.1, 1.3], pDefault: 1.2, fatRange: [0.25, 0.40], fatDefault: 0.30 };
      }
    } else {
      return { phase: "maintain", pRange: [0.9, 1.1], pDefault: 1.0, fatRange: [0.25, 0.35], fatDefault: 0.30 };
    }
  };

  const { pDefault, fatDefault } = chooseParams(weeklyDeltaLb);

  const pPerLb = pDefault;
  const fatPct = fatDefault;

  const proteinG = pPerLb * weightLb;
  const proteinCal = 4 * proteinG;

  const fatCal = targetCalories * fatPct;
  const fatG = fatCal / 9;

  const carbsCal = targetCalories - proteinCal - fatCal;
  const carbsG = carbsCal / 4;

  // ---- Meal splits ----
  const split =
    answers?.macroSplit || { breakfast: "25", lunch: "35", dinner: "30", snacks: "10" };
  const pct = {
    Breakfast: num(split.breakfast, 25) / 100,
    Lunch: num(split.lunch, 35) / 100,
    Dinner: num(split.dinner, 30) / 100,
    Snack: num(split.snacks, 10) / 100,
  };

  const mealFromShare = (share, prepTime) => ({
    calories: round0(targetCalories * share),
    carbohydrates: round0(Math.max(0, carbsG) * share),
    fat: round0(fatG * share),
    protein: round0(proteinG * share),
    prep_time: prepTime ?? null,
  });

  const payload = {
    Breakfast: mealFromShare(pct.Breakfast, answers?.breakfast_prep_time),
    Lunch: mealFromShare(pct.Lunch, answers?.lunch_prep_time),
    Dinner: mealFromShare(pct.Dinner, answers?.dinner_prep_time),
    Snack: mealFromShare(
      pct.Snack,
      answers?.["snack prep time"] ?? answers?.snack_prep_time
    ),
  };

  // Optional extras
  if (answers?.cooking_experience) payload.cooking_level = answers.cooking_experience;
  if (answers?.diet_pattern) payload.diet_pattern = answers.diet_pattern;
  if (answers?.allergens) payload.allergens = answers.allergens;

  // ---- Build targets for fetchDailyRecipesSequential ----
  const targets = {
    breakfast: {
      protein: payload.Breakfast.protein,
      carbs: payload.Breakfast.carbohydrates,
      fat: payload.Breakfast.fat,
    },
    lunch: {
      protein: payload.Lunch.protein,
      carbs: payload.Lunch.carbohydrates,
      fat: payload.Lunch.fat,
    },
    dinner: {
      protein: payload.Dinner.protein,
      carbs: payload.Dinner.carbohydrates,
      fat: payload.Dinner.fat,
    },
    snack: {
      protein: payload.Snack.protein,
      carbs: payload.Snack.carbohydrates,
      fat: payload.Snack.fat,
    },
  };

  // minutes per meal (fallback to a default if missing)
  const defaultMins = num(answers?.default_prep_time, 20);
  const minutes = {
    breakfast: num(payload.Breakfast.prep_time, defaultMins),
    lunch: num(payload.Lunch.prep_time, defaultMins),
    dinner: num(payload.Dinner.prep_time, defaultMins),
    snack: num(payload.Snack.prep_time, defaultMins),
  };

  // dietary restrictions / allergens → arrays
  const dietaryRestrictions = Array.isArray(payload.diet_pattern)
    ? payload.diet_pattern
    : payload.diet_pattern
    ? [String(payload.diet_pattern)]
    : [];

  const allergens =
    Array.isArray(payload.allergens)
      ? payload.allergens
      : typeof payload.allergens === "string"
      ? payload.allergens.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  const experience = String(payload.cooking_level || "beginner").toLowerCase();

  // ---- Call your client helper (sequential 4 calls) and return the response ----
  return fetchDailyRecipesSequential(
    targets,
    {
      timeout,
      dietaryRestrictions,
      allergens,
      minutes,
      experience,
    }
  );
}
