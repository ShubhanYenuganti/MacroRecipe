import React from "react";
import { SafeAreaView, StatusBar } from "react-native";
import Landing from "../../src/Landing";
import { submitOnboarding } from '../../src/api/onboarding'

export default function App() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0f172a" }}>
      <StatusBar barStyle="light-content" />
      <Landing onComplete={async (answers) => {
        try {
          const result = await submitOnboarding(answers)
          console.log("submit Onboarding response:", result);
        } catch (error) {
          console.error("submitOnboarding error:", error)
        }
      }} />
    </SafeAreaView>
  );
}