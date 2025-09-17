// app/results.tsx
import React, { useEffect, useState } from "react";
import { SafeAreaView, StatusBar, ActivityIndicator, ScrollView, Text, View, Platform } from "react-native";
import { onboardingStore } from "../src/state/onboardingStore";
import { submitOnboarding } from "../src/api/onboarding";

export default function ResultsScreen() {
  const [loading, setLoading] = useState(true);
  const [data, setData]     = useState<any>(null);
  const [error, setError]   = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const answers = onboardingStore.get();
        if (!answers) throw new Error("Missing onboarding answers");
        const res = await submitOnboarding(answers, { timeout: 120000 }); // longer timeout while testing
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e);
          setLoading(false);
        }
      }
    };
    run();
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0f172a" }}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ color: "#e2e8f0", fontWeight: "700", marginBottom: 8 }}>
          Raw response (unfiltered)
        </Text>
        <Text
          selectable
          style={{
            color: "#e2e8f0",
            fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
            lineHeight: 20,
          }}
        >
          {JSON.stringify(data, null, 2)}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
