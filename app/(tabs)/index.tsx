import React from "react";
import { SafeAreaView, StatusBar } from "react-native";
import Landing from "../../src/Landing";


export default function App() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0f172a" }}>
      <StatusBar barStyle="light-content" />
      <Landing onComplete={(answers) => {
        // TODO: send answers to backend / global state
        console.log("Onboarding answers:", answers);
        // Navigate to your real app (if you use React Navigation or Expo Router)
        // For demo we just log.
      }} />
    </SafeAreaView>
  );
}