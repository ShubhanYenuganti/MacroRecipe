// app/results.tsx
import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  ScrollView,
  Text,
  View,
  Platform,
  TouchableOpacity,
} from "react-native";
import { onboardingStore } from "../src/state/onboardingStore";
import { submitOnboarding } from "../src/api/onboarding";

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
type MealKey = typeof MEALS[number];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
const fmt1 = (n: any) => {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round(x * 10) / 10 : n;
};

function Pill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        marginRight: 8,
        marginBottom: 8,
        backgroundColor: active ? "#334155" : "#1f2937",
        borderWidth: active ? 1 : 0,
        borderColor: "#64748b",
      }}
    >
      <Text style={{ color: "#e2e8f0", fontWeight: active ? "700" as const : "500" }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function MetaChip({ text }: { text: string }) {
  return (
    <View
      style={{
        backgroundColor: "#1f2937",
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginRight: 8,
        marginBottom: 8,
      }}
    >
      <Text style={{ color: "#CBD5E1", fontSize: 12 }}>{text}</Text>
    </View>
  );
}

function RecipeCard({ recipe }: { recipe: any }) {
  const macros = recipe?.macros ?? {};
  const ingredients: string[] = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
  const instructions: string[] = Array.isArray(recipe?.instructions) ? recipe.instructions : [];
  return (
    <View
      style={{
        backgroundColor: "#111827",
        borderRadius: 16,
        padding: 14,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: "#1f2937",
      }}
    >
      <Text style={{ color: "#e5e7eb", fontSize: 18, fontWeight: "700", marginBottom: 6 }}>
        {recipe?.recipe_name ?? "Recipe"}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 8 }}>
        {!!recipe?.meal_type && <MetaChip text={`Meal: ${cap(String(recipe.meal_type))}`} />}
        {Number.isFinite(macros?.protein) && <MetaChip text={`Protein: ${fmt1(macros.protein)}g`} />}
        {Number.isFinite(macros?.carbs) && <MetaChip text={`Carbs: ${fmt1(macros.carbs)}g`} />}
        {Number.isFinite(macros?.fat) && <MetaChip text={`Fat: ${fmt1(macros.fat)}g`} />}
        {Number.isFinite(recipe?.servings) && <MetaChip text={`Servings: ${recipe.servings}`} />}
      </View>

      {ingredients.length > 0 && (
        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: "#94a3b8", fontWeight: "700", marginBottom: 4 }}>Ingredients</Text>
          <Text style={{ color: "#e2e8f0" }}>{ingredients.join(", ")}</Text>
        </View>
      )}

      {instructions.length > 0 && (
        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: "#94a3b8", fontWeight: "700", marginBottom: 4 }}>Instructions</Text>
          {instructions.map((step, i) => (
            <Text key={i} style={{ color: "#e2e8f0", marginBottom: 2 }}>
              {i + 1}. {step}
            </Text>
          ))}
        </View>
      )}

      {!!recipe?.note && (
        <Text style={{ color: "#EAB308", marginTop: 4 }}>Note: {recipe.note}</Text>
      )}
    </View>
  );
}

export default function ResultsScreen() {
  const [loading, setLoading] = useState(true);
  const [data, setData]     = useState<any>(null);
  const [error, setError]   = useState<Error | null>(null);
  const [selected, setSelected] = useState<MealKey>("lunch"); // default to Lunch

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const answers = onboardingStore.get();
        if (!answers) throw new Error("Missing onboarding answers");
        const res = await submitOnboarding(answers, { timeout: 120000 });
        if (!cancelled) {
          setData(res);
          setLoading(false);
          // if lunch is missing for some reason, fall back to the first available meal
          if (!res?.lunch) {
            for (const m of MEALS) {
              if (res?.[m]) { setSelected(m); break; }
            }
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center" }}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" />
        <Text style={{ color: "#e2e8f0", marginTop: 12 }}>Fetching recipes…</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0f172a" }}>
        <StatusBar barStyle="light-content" />
        <View style={{ padding: 16 }}>
          <Text style={{ color: "#fca5a5", fontWeight: "600", marginBottom: 8 }}>Error</Text>
          <Text style={{ color: "#e2e8f0" }}>{error.message || String(error)}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Support both lowercased and capitalized keys just in case
  const currentRecipes =
    data?.[selected] ??
    data?.[cap(selected) as keyof typeof data] ??
    [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0f172a" }}>
      <StatusBar barStyle="light-content" />

      {/* Pills */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, flexDirection: "row", flexWrap: "wrap" }}>
        {MEALS.map((m) => (
          <Pill
            key={m}
            label={cap(m)}
            active={selected === m}
            onPress={() => setSelected(m)}
          />
        ))}
      </View>

      {/* Recipes list */}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        {Array.isArray(currentRecipes) && currentRecipes.length > 0 ? (
          currentRecipes.slice(0, 3).map((r: any, idx: number) => (
            <RecipeCard key={r?.recipe_name ? `${r.recipe_name}-${idx}` : idx} recipe={r} />
          ))
        ) : (
          <Text style={{ color: "#94a3b8", marginTop: 16 }}>
            No recipes found for {cap(selected)}.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}