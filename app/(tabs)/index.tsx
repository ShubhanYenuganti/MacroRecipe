// app/(tabs)/index.tsx
import React from "react";
import { SafeAreaView, StatusBar } from "react-native";
import { useRouter } from "expo-router";
import Landing from "../../src/Landing";
import { onboardingStore } from "../../src/state/onboardingStore"

export default function LandingScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0f172a" }}>
      <StatusBar barStyle="light-content" />
      <Landing
        onComplete={(answers) => {
          onboardingStore.set(answers);
          router.push("/results");
        }}
      />
    </SafeAreaView>
  );
}
